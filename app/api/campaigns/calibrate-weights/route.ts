/**
 * Health Score Weight Calibration Cron — runs weekly
 *
 * Compares health score predictions with actual member behavior:
 * 1. Takes members who were scored 30 days ago
 * 2. Checks if they actually booked sessions since then
 * 3. For each health component (recency, frequency, etc.), calculates
 *    correlation with actual churn
 * 4. Adjusts weights to prioritize components that better predict churn
 * 5. Saves calibrated weights to IntelligenceSettings
 *
 * Schedule: weekly on Sundays at 5:00 AM UTC
 */

import { NextResponse } from 'next/server'
import { cronLogger as log } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { DEFAULT_WEIGHTS, type HealthWeights } from '@/lib/ai/member-health'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

function getAuthorized(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return { ok: false as const, status: 500, error: 'CRON_SECRET is not set' }
  const authHeader = request.headers.get('authorization')
  if (authHeader === `Bearer ${cronSecret}`) return { ok: true as const }
  return { ok: false as const, status: 401, error: 'Unauthorized' }
}

interface ComponentCorrelation {
  name: keyof HealthWeights
  /** How well low scores in this component predict actual churn (0-1) */
  churnCorrelation: number
  /** Current weight */
  currentWeight: number
  /** Recommended weight based on correlation */
  recommendedWeight: number
}

async function calibrateWeights() {
  // Find clubs with enough data
  const clubs: any[] = await prisma.$queryRawUnsafe(`
    SELECT DISTINCT "clubId" as club_id
    FROM ai_recommendation_logs
    WHERE "createdAt" >= NOW() - INTERVAL '60 days'
    GROUP BY "clubId"
    HAVING COUNT(*) >= 20
  `)

  const results: { clubId: string; correlations: ComponentCorrelation[]; newWeights: HealthWeights }[] = []

  for (const club of clubs) {
    const clubId = club.club_id

    // Get members with health data from ~30 days ago
    // We use the current health calculation and check if predictions matched reality
    const members: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        cf.user_id,
        -- Booking activity in last 30 days (current)
        (SELECT COUNT(*) FROM play_session_bookings b
         JOIN play_sessions ps ON ps.id = b."sessionId"
         WHERE b."userId" = cf.user_id
           AND ps."clubId" = $1
           AND b.status = 'CONFIRMED'
           AND b."bookedAt" >= NOW() - INTERVAL '30 days') as bookings_last_30d,
        -- Booking activity 30-60 days ago (baseline)
        (SELECT COUNT(*) FROM play_session_bookings b
         JOIN play_sessions ps ON ps.id = b."sessionId"
         WHERE b."userId" = cf.user_id
           AND ps."clubId" = $1
           AND b.status = 'CONFIRMED'
           AND b."bookedAt" >= NOW() - INTERVAL '60 days'
           AND b."bookedAt" < NOW() - INTERVAL '30 days') as bookings_prev_30d,
        -- Days since last booking
        (SELECT EXTRACT(DAY FROM NOW() - MAX(b."bookedAt"))::int
         FROM play_session_bookings b
         JOIN play_sessions ps ON ps.id = b."sessionId"
         WHERE b."userId" = cf.user_id
           AND ps."clubId" = $1
           AND b.status = 'CONFIRMED') as days_since_last,
        -- No-show count
        (SELECT COUNT(*) FROM play_session_bookings b
         JOIN play_sessions ps ON ps.id = b."sessionId"
         WHERE b."userId" = cf.user_id
           AND ps."clubId" = $1
           AND b.status = 'NO_SHOW'
           AND b."bookedAt" >= NOW() - INTERVAL '90 days') as no_show_count,
        -- Total bookings
        (SELECT COUNT(*) FROM play_session_bookings b
         JOIN play_sessions ps ON ps.id = b."sessionId"
         WHERE b."userId" = cf.user_id
           AND ps."clubId" = $1
           AND b.status = 'CONFIRMED') as total_bookings
      FROM club_followers cf
      WHERE cf.club_id = $1
    `, clubId)

    if (members.length < 50) continue // Need enough data

    // For each member, determine if they "churned" (0 bookings in last 30 days after having activity before)
    const memberOutcomes = members.map(m => {
      const hadActivity = Number(m.bookings_prev_30d) > 0 || Number(m.total_bookings) > 5
      const noRecentActivity = Number(m.bookings_last_30d) === 0
      const churned = hadActivity && noRecentActivity

      // Simulate component scores (simplified version of full scoring)
      const daysSinceLast = m.days_since_last !== null ? Number(m.days_since_last) : 999
      const recencyScore = daysSinceLast <= 7 ? 90 : daysSinceLast <= 14 ? 70 : daysSinceLast <= 30 ? 40 : daysSinceLast <= 45 ? 20 : 5

      const bookingsLast = Number(m.bookings_last_30d)
      const bookingsPrev = Number(m.bookings_prev_30d)
      const frequencyScore = bookingsPrev === 0 && bookingsLast === 0 ? 20
        : bookingsPrev === 0 ? 90
        : bookingsLast >= bookingsPrev ? 100
        : bookingsLast / bookingsPrev >= 0.75 ? 60
        : bookingsLast / bookingsPrev >= 0.5 ? 40
        : 15

      const noShowRate = Number(m.total_bookings) > 0 ? Number(m.no_show_count) / Number(m.total_bookings) : 0
      const noShowScore = noShowRate <= 0.05 ? 100 : noShowRate <= 0.1 ? 70 : noShowRate <= 0.2 ? 40 : 15

      return {
        churned,
        recencyScore,
        frequencyScore,
        noShowScore,
        // Consistency and patternBreak need full booking history — use proxy
        consistencyScore: bookingsLast > 0 ? 70 : 20,
        patternBreakScore: daysSinceLast > 14 && bookingsPrev > 2 ? 25 : 75,
      }
    })

    // Only calibrate on members who had prior activity (ignore brand new members)
    const calibrationSet = memberOutcomes.filter(m =>
      m.frequencyScore < 100 || m.recencyScore < 100 // has some history
    )

    if (calibrationSet.length < 30) continue

    // Calculate correlation: for each component, how well does a low score predict churn?
    const correlationWithChurn = (scores: number[], churned: boolean[]): number => {
      // Simple: what % of members with score < 50 actually churned?
      const lowScoreMembers = scores.filter((s, i) => s < 50)
      const lowScoreChurned = scores.filter((s, i) => s < 50 && churned[i])
      const lowPrecision = lowScoreMembers.length > 0 ? lowScoreChurned.length / lowScoreMembers.length : 0

      // And what % of churned members had score < 50? (recall)
      const totalChurned = churned.filter(c => c).length
      const lowScoreRecall = totalChurned > 0 ? lowScoreChurned.length / totalChurned : 0

      // F1-like score
      return lowPrecision + lowScoreRecall > 0
        ? (2 * lowPrecision * lowScoreRecall) / (lowPrecision + lowScoreRecall)
        : 0
    }

    const churnedArr = calibrationSet.map(m => m.churned)
    const correlations: ComponentCorrelation[] = [
      {
        name: 'frequencyTrend',
        churnCorrelation: correlationWithChurn(calibrationSet.map(m => m.frequencyScore), churnedArr),
        currentWeight: DEFAULT_WEIGHTS.frequencyTrend,
        recommendedWeight: 0, // calculated below
      },
      {
        name: 'recency',
        churnCorrelation: correlationWithChurn(calibrationSet.map(m => m.recencyScore), churnedArr),
        currentWeight: DEFAULT_WEIGHTS.recency,
        recommendedWeight: 0,
      },
      {
        name: 'consistency',
        churnCorrelation: correlationWithChurn(calibrationSet.map(m => m.consistencyScore), churnedArr),
        currentWeight: DEFAULT_WEIGHTS.consistency,
        recommendedWeight: 0,
      },
      {
        name: 'patternBreak',
        churnCorrelation: correlationWithChurn(calibrationSet.map(m => m.patternBreakScore), churnedArr),
        currentWeight: DEFAULT_WEIGHTS.patternBreak,
        recommendedWeight: 0,
      },
      {
        name: 'noShowTrend',
        churnCorrelation: correlationWithChurn(calibrationSet.map(m => m.noShowScore), churnedArr),
        currentWeight: DEFAULT_WEIGHTS.noShowTrend,
        recommendedWeight: 0,
      },
      // Level 2 components — use proxy scores for calibration
      {
        name: 'cancelAcceleration',
        churnCorrelation: correlationWithChurn(
          calibrationSet.map(m => m.frequencyScore < 50 && m.noShowScore < 70 ? 20 : 80), // proxy
          churnedArr
        ),
        currentWeight: DEFAULT_WEIGHTS.cancelAcceleration,
        recommendedWeight: 0,
      },
      {
        name: 'sessionDiversity',
        churnCorrelation: correlationWithChurn(
          calibrationSet.map(m => m.consistencyScore), // diversity correlates with consistency
          churnedArr
        ),
        currentWeight: DEFAULT_WEIGHTS.sessionDiversity,
        recommendedWeight: 0,
      },
      {
        name: 'coPlayerLoss',
        churnCorrelation: correlationWithChurn(
          calibrationSet.map(m => m.recencyScore), // social loss correlates with recency as proxy
          churnedArr
        ),
        currentWeight: DEFAULT_WEIGHTS.coPlayerLoss,
        recommendedWeight: 0,
      },
    ]

    // Calculate recommended weights proportional to correlation
    const totalCorrelation = correlations.reduce((s, c) => s + Math.max(c.churnCorrelation, 0.05), 0)
    for (const c of correlations) {
      // Blend: 50% data-driven, 50% default (don't swing weights too wildly)
      const dataWeight = (Math.max(c.churnCorrelation, 0.05) / totalCorrelation) * 100
      c.recommendedWeight = Math.round(dataWeight * 0.5 + c.currentWeight * 0.5)
    }

    // Normalize to sum to 100
    const totalRecommended = correlations.reduce((s, c) => s + c.recommendedWeight, 0)
    for (const c of correlations) {
      c.recommendedWeight = Math.round(c.recommendedWeight / totalRecommended * 100)
    }
    // Fix rounding
    const roundingDiff = 100 - correlations.reduce((s, c) => s + c.recommendedWeight, 0)
    correlations[0].recommendedWeight += roundingDiff

    const newWeights: HealthWeights = {
      frequencyTrend: correlations.find(c => c.name === 'frequencyTrend')!.recommendedWeight,
      recency: correlations.find(c => c.name === 'recency')!.recommendedWeight,
      consistency: correlations.find(c => c.name === 'consistency')!.recommendedWeight,
      patternBreak: correlations.find(c => c.name === 'patternBreak')!.recommendedWeight,
      noShowTrend: correlations.find(c => c.name === 'noShowTrend')!.recommendedWeight,
      cancelAcceleration: correlations.find(c => c.name === 'cancelAcceleration')!.recommendedWeight,
      sessionDiversity: correlations.find(c => c.name === 'sessionDiversity')!.recommendedWeight,
      coPlayerLoss: correlations.find(c => c.name === 'coPlayerLoss')!.recommendedWeight,
    }

    // Save calibrated weights to IntelligenceSettings
    try {
      await prisma.$executeRawUnsafe(`
        UPDATE intelligence_settings
        SET goals = jsonb_set(
          COALESCE(goals, '[]'::jsonb),
          '{calibratedWeights}',
          $2::jsonb
        )
        WHERE "clubId" = $1
      `, clubId, JSON.stringify(newWeights))
    } catch (err) {
      log.warn(`[Calibrate] Failed to save weights for club ${clubId}:`, (err as Error).message?.slice(0, 80))
    }

    results.push({ clubId, correlations, newWeights })

    log.info(`[Calibrate] Club ${clubId}: ${calibrationSet.length} members, weights: freq=${newWeights.frequencyTrend} rec=${newWeights.recency} con=${newWeights.consistency} pat=${newWeights.patternBreak} ns=${newWeights.noShowTrend}`)
  }

  return { clubsProcessed: results.length, results }
}

async function run(request: Request) {
  const auth = getAuthorized(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const startedAt = new Date()

  try {
    const result = await calibrateWeights()

    return NextResponse.json({
      ok: true,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      ...result,
    })
  } catch (err) {
    log.error('[Calibrate] Failed:', (err as Error).message)
    return NextResponse.json({
      ok: false,
      error: (err as Error).message?.slice(0, 200),
    }, { status: 500 })
  }
}

export async function POST(request: Request) { return run(request) }
export async function GET(request: Request) { return run(request) }
