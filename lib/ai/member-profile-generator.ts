/**
 * Member AI Profile Generator
 *
 * Generates and caches AI profiles for club members.
 * Triggered after CSV import (fire-and-forget) and nightly via cron.
 *
 * Each profile contains:
 * - riskSegment + riskScore (from RFM+E scoring)
 * - preferredCategories (from booking history)
 * - reactivationMessage (AI-personalized win-back email body)
 * - slotFillerProfile (AI summary for slot filler recommendations)
 *
 * Cost: ~$0.25 per 1500 members using gpt-4o-mini
 */

import { generateWithFallback } from './llm/provider'
import { buildBookingHistory } from './intelligence-service'
import { inferPreferencesFromBookings } from './inferred-preferences'
import type { MemberAiProfileData, RiskSegment } from '../../types/intelligence'

interface GenerateOptions {
  batchSize?: number
  delayMs?: number
  forceRegenerate?: boolean // skip if generated within 24h by default
  limit?: number // max members to process in this call (for chunked UI flow)
}

interface GenerateResult {
  generated: number
  skipped: number
  errors: number
  sampleError?: string // first error message for debugging
}

// Map RFM+E score to risk segment
function scoreToSegment(score: number): RiskSegment {
  if (score < 30) return 'high_risk'
  if (score < 56) return 'medium_risk'
  if (score < 76) return 'low_risk'
  return 'healthy'
}

// Build the AI prompt for a single member
function buildPrompt(params: {
  memberName: string
  clubName: string
  daysSinceLastSession: number | null
  totalBookings: number
  cancelRate: number
  noShowRate: number
  duprRating: string | null
  preferredDays: string[]
  preferredTimeSlots: Record<string, boolean>
  preferredFormats: string[]
  preferredCategories: string[]
  persona: string | null
  recentSessionTitles: string[]
}): string {
  const {
    memberName, clubName, daysSinceLastSession, totalBookings,
    cancelRate, noShowRate, duprRating, preferredDays,
    preferredTimeSlots, preferredFormats, preferredCategories,
    persona, recentSessionTitles,
  } = params

  const firstName = memberName?.split(' ')[0] || 'there'
  const activeTimes = Object.entries(preferredTimeSlots)
    .filter(([, v]) => v).map(([k]) => k).join(', ') || 'unknown'
  const inactivityStr = daysSinceLastSession === null
    ? 'never played'
    : `${daysSinceLastSession} days ago`

  return `Generate a member engagement profile. Respond with ONLY valid JSON, no markdown:
{
  "reactivationMessage": "<2-3 sentence personalized email body>",
  "slotFillerProfile": "<1-2 sentence summary of ideal session parameters for club staff>"
}

Member data:
- Name: ${memberName || 'Unknown'} (use first name: ${firstName})
- Club: ${clubName}
- Last active: ${inactivityStr}
- Total sessions attended: ${totalBookings}
- Cancellation rate: ${Math.round(cancelRate * 100)}%
- No-show rate: ${Math.round(noShowRate * 100)}%
- DUPR rating: ${duprRating || 'not set'}
- Preferred days: ${preferredDays.join(', ') || 'unknown'}
- Preferred times: ${activeTimes}
- Preferred formats: ${preferredFormats.join(', ') || 'unknown'}
- Favorite session types: ${preferredCategories.slice(0, 3).join(', ') || 'unknown'}
- Player persona: ${persona || 'unknown'}
- Recent sessions: ${recentSessionTitles.slice(0, 5).join(', ') || 'none on record'}

Rules:
- reactivationMessage: address by first name, reference their favorite session type or last activity, warm not pushy, 2-3 sentences max
- slotFillerProfile: describe ideal session (day, time, format, skill level) for club staff to use when inviting, 1-2 sentences
- If totalBookings = 0: write a welcome/onboarding message instead
- Never mention prices or specific dates`
}

// Parse AI JSON response safely
function parseAiResponse(text: string): { reactivationMessage: string | null; slotFillerProfile: string | null } {
  try {
    const parsed = JSON.parse(text.trim())
    return {
      reactivationMessage: typeof parsed.reactivationMessage === 'string' ? parsed.reactivationMessage : null,
      slotFillerProfile: typeof parsed.slotFillerProfile === 'string' ? parsed.slotFillerProfile : null,
    }
  } catch {
    // Fallback: regex extraction
    const rmMatch = text.match(/"reactivationMessage"\s*:\s*"((?:[^"\\]|\\.)*)"/)
    const sfMatch = text.match(/"slotFillerProfile"\s*:\s*"((?:[^"\\]|\\.)*)"/)
    return {
      reactivationMessage: rmMatch ? rmMatch[1].replace(/\\n/g, ' ').replace(/\\"/g, '"') : null,
      slotFillerProfile: sfMatch ? sfMatch[1].replace(/\\n/g, ' ').replace(/\\"/g, '"') : null,
    }
  }
}

// Generate or refresh a single member's AI profile
export async function generateSingleMemberProfile(
  prisma: any,
  userId: string,
  clubId: string,
  clubName: string,
): Promise<MemberAiProfileData | null> {
  try {
    // 1. Get member info
    const follower = await prisma.clubFollower.findFirst({
      where: { userId, clubId },
      include: { user: { select: { id: true, name: true, duprRatingDoubles: true } } },
    })
    if (!follower) return null

    const member = follower.user

    // 2. Get booking history
    const history = await buildBookingHistory(prisma, userId)

    // 3. Get recent bookings for preference inference
    const recentBookings = await prisma.playSessionBooking.findMany({
      where: { userId },
      include: {
        playSession: {
          select: { date: true, startTime: true, format: true, category: true, title: true, clubId: true },
        },
      },
      orderBy: { bookedAt: 'desc' },
      take: 50,
    })

    const bookingsForInference = recentBookings
      .filter((b: any) => b.playSession?.clubId === clubId)
      .map((b: any) => ({
        status: b.status,
        session: {
          date: b.playSession.date,
          startTime: b.playSession.startTime,
          format: b.playSession.format,
          category: b.playSession.category,
        },
      }))

    // 4. Infer preferences
    const inferred = inferPreferencesFromBookings(bookingsForInference) ?? {
      preferredFormats: [],
      preferredTimeSlots: { morning: false, afternoon: false, evening: false },
      preferredDays: [],
      preferredCategories: [],
    }

    // 5. Get play preference (persona) — detectedPersona may not exist in DB yet
    const playPref = await prisma.userPlayPreference.findFirst({
      where: { userId, clubId },
    }).catch(() => null)

    // 6. Compute risk score using RFM+E formula
    const daysSince = history.daysSinceLastConfirmedBooking ?? 999
    const totalB = history.totalBookings
    const sessionsPerMonth = history.bookingsLastMonth

    // Recency (25%)
    let recencyScore: number
    if (daysSince <= 3) recencyScore = 100
    else if (daysSince <= 7) recencyScore = 80
    else if (daysSince <= 14) recencyScore = 60
    else if (daysSince <= 30) recencyScore = 35
    else if (daysSince <= 60) recencyScore = 18
    else if (daysSince <= 90) recencyScore = 10
    else if (daysSince <= 180) recencyScore = 5
    else if (daysSince <= 365) recencyScore = 2
    else recencyScore = 1

    // Frequency (20%)
    const historicalMonthlyAvg = sessionsPerMonth > 0
      ? sessionsPerMonth
      : totalB > 0 ? Math.min(totalB / Math.max(daysSince / 30, 1), 12) : 0
    let frequencyScore: number
    if (sessionsPerMonth >= 8) frequencyScore = 100
    else if (sessionsPerMonth >= 5) frequencyScore = 80
    else if (sessionsPerMonth >= 3) frequencyScore = 60
    else if (sessionsPerMonth >= 1) frequencyScore = 35
    else if (historicalMonthlyAvg >= 4) frequencyScore = 25
    else if (historicalMonthlyAvg >= 2) frequencyScore = 15
    else if (historicalMonthlyAvg >= 0.5) frequencyScore = 8
    else frequencyScore = 3

    // Trend (20%)
    const recentPeriod = history.bookingsLastWeek * 2
    const priorPeriod = Math.max(history.bookingsLastMonth - history.bookingsLastWeek, 0)
    const priorNormalized = priorPeriod > 0 ? (priorPeriod / 3) * 2 : 0
    const trendRatio = priorNormalized > 0 ? recentPeriod / priorNormalized : (recentPeriod > 0 ? 2.0 : 0)
    let trendScore: number
    if (trendRatio > 1.2) trendScore = 100
    else if (trendRatio >= 0.8) trendScore = 70
    else if (trendRatio >= 0.3) trendScore = 30
    else trendScore = 5

    // Lifetime Engagement (25%)
    let engagementScore: number
    if (totalB >= 80) engagementScore = 100
    else if (totalB >= 40) engagementScore = 80
    else if (totalB >= 20) engagementScore = 60
    else if (totalB >= 10) engagementScore = 40
    else if (totalB >= 3) engagementScore = 20
    else engagementScore = 5

    // Reliability (10%)
    let reliabScore: number
    if (totalB === 0) {
      reliabScore = 50
    } else {
      const rate = 1 - (history.cancelledCount + history.noShowCount) / totalB
      if (rate >= 0.95) reliabScore = 100
      else if (rate >= 0.80) reliabScore = 80
      else if (rate >= 0.60) reliabScore = 50
      else reliabScore = 20
    }

    const riskScore = Math.round(
      (recencyScore * 25 + frequencyScore * 20 + trendScore * 20 + engagementScore * 25 + reliabScore * 10) / 100
    )
    const riskSegment = scoreToSegment(riskScore)

    // 7. Build recent session titles
    const recentSessionTitles = recentBookings
      .filter((b: any) => b.playSession?.clubId === clubId && b.status === 'CONFIRMED')
      .slice(0, 5)
      .map((b: any) => b.playSession.category || b.playSession.title || '')
      .filter(Boolean)

    // 8. Generate AI content
    const cancelRate = totalB > 0 ? history.cancelledCount / totalB : 0
    const noShowRate = totalB > 0 ? history.noShowCount / totalB : 0

    const prompt = buildPrompt({
      memberName: member.name || '',
      clubName,
      daysSinceLastSession: history.daysSinceLastConfirmedBooking,
      totalBookings: totalB,
      cancelRate,
      noShowRate,
      duprRating: member.duprRatingDoubles ? String(member.duprRatingDoubles) : null,
      preferredDays: inferred.preferredDays,
      preferredTimeSlots: inferred.preferredTimeSlots,
      preferredFormats: inferred.preferredFormats,
      preferredCategories: inferred.preferredCategories,
      persona: playPref?.detectedPersona || null,
      recentSessionTitles,
    })

    const startMs = Date.now()
    const aiResult = await generateWithFallback({
      system: 'You are a pickleball club engagement specialist. You write brief, warm, personalized messages. Always respond with valid JSON only — no markdown, no explanation.',
      prompt,
      tier: 'fast',
      maxTokens: 400,
    })
    const generationMs = Date.now() - startMs

    const { reactivationMessage, slotFillerProfile } = parseAiResponse(aiResult.text)

    // 9. Upsert profile (use raw SQL ON CONFLICT to avoid Prisma unique-index mismatch)
    const profileData = {
      riskSegment,
      riskScore,
      preferredCategories: inferred.preferredCategories,
      reactivationMessage,
      slotFillerProfile,
      generatedAt: new Date(),
      modelUsed: aiResult.model,
      generationMs,
    }
    const existing = await prisma.memberAiProfile.findFirst({ where: { userId, clubId }, select: { id: true } })
    const profile = existing
      ? await prisma.memberAiProfile.update({ where: { id: existing.id }, data: profileData })
      : await prisma.memberAiProfile.create({ data: { userId, clubId, ...profileData } })

    return {
      id: profile.id,
      userId: profile.userId,
      clubId: profile.clubId,
      riskSegment: profile.riskSegment as RiskSegment,
      riskScore: profile.riskScore,
      preferredCategories: profile.preferredCategories,
      reactivationMessage: profile.reactivationMessage,
      slotFillerProfile: profile.slotFillerProfile,
      generatedAt: profile.generatedAt,
      modelUsed: profile.modelUsed,
      generationMs: profile.generationMs,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[MemberAiProfile] Failed for user=${userId} club=${clubId}:`, msg)
    throw new Error(`user=${userId}: ${msg}`)
  }
}

// Batch generate profiles for all members of a club
export async function generateMemberProfilesForClub(
  prisma: any,
  clubId: string,
  options: GenerateOptions = {},
): Promise<GenerateResult> {
  const { batchSize = 10, delayMs = 300, forceRegenerate = false, limit } = options
  const result: GenerateResult = { generated: 0, skipped: 0, errors: 0 }

  // Get club name
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { name: true },
  })
  const clubName = club?.name || 'Your Club'

  // Get all followers
  const followers = await prisma.clubFollower.findMany({
    where: { clubId },
    select: { userId: true },
  })

  if (followers.length === 0) return result

  // Get existing profiles to skip recently generated ones
  const existingProfiles = forceRegenerate ? [] : await prisma.memberAiProfile.findMany({
    where: {
      clubId,
      generatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // within last 24h
    },
    select: { userId: true },
  })
  const recentlyGenerated = new Set(existingProfiles.map((p: any) => p.userId))

  const toGenerate = followers
    .filter((f: any) => !recentlyGenerated.has(f.userId))
    .slice(0, limit ?? undefined) // if limit set, process only first N pending members
  result.skipped = followers.length - toGenerate.length

  console.log(`[MemberAiProfile] Club ${clubId}: ${toGenerate.length} to generate, ${result.skipped} skipped (recent)`)

  // Process in batches
  for (let i = 0; i < toGenerate.length; i += batchSize) {
    const batch = toGenerate.slice(i, i + batchSize)

    await Promise.allSettled(
      batch.map(async (f: any) => {
        try {
          const profile = await generateSingleMemberProfile(prisma, f.userId, clubId, clubName)
          if (profile) result.generated++
          else {
            result.errors++
            if (!result.sampleError) result.sampleError = `null profile for user=${f.userId}`
          }
        } catch (err: any) {
          result.errors++
          if (!result.sampleError) result.sampleError = err?.message || String(err)
        }
      })
    )

    // Delay between batches to respect rate limits
    if (i + batchSize < toGenerate.length && delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }

    if (i % 100 === 0 && i > 0) {
      console.log(`[MemberAiProfile] Progress: ${i}/${toGenerate.length}`)
    }
  }

  console.log(`[MemberAiProfile] Done: ${result.generated} generated, ${result.skipped} skipped, ${result.errors} errors`)
  return result
}
