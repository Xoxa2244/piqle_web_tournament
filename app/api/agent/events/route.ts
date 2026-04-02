/**
 * Agent Event Detection — runs every 15 minutes
 *
 * Scans for recent events and reacts:
 * 1. Booking cancellations → trigger slot filler for that session
 * 2. Underfilled sessions (<50% in next 48h) → auto-invite top matches
 * 3. New members (API clubs) → start onboarding sequence
 *
 * Respects agentLive flag — if false, logs but doesn't send.
 * Schedule: every 15 minutes
 */

import { NextResponse } from 'next/server'
import { cronLogger as log } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { isAgentLive, hasApiConnector } from '@/lib/ai/agent-utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function getAuthorized(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return { ok: false as const, status: 500, error: 'CRON_SECRET is not set' }
  const authHeader = request.headers.get('authorization')
  if (authHeader === `Bearer ${cronSecret}`) return { ok: true as const }
  return { ok: false as const, status: 401, error: 'Unauthorized' }
}

interface EventResult {
  clubId: string
  clubName: string
  cancellations: number
  underfilled: number
  newMembers: number
  actionsTaken: number
  dryRun: boolean
}

async function detectEvents() {
  const now = new Date()
  const fifteenMinAgo = new Date(now.getTime() - 15 * 60 * 1000)
  const fortyEightHours = new Date(now.getTime() + 48 * 60 * 60 * 1000)

  // Find API-connected clubs
  const clubs: any[] = await prisma.$queryRawUnsafe(`
    SELECT DISTINCT cc.club_id as "clubId", c.name as "clubName"
    FROM club_connectors cc
    JOIN clubs c ON c.id = cc.club_id
    WHERE cc.provider = 'courtreserve'
      AND cc.auto_sync = true
      AND cc.status IN ('connected', 'error')
  `)

  const results: EventResult[] = []

  for (const club of clubs) {
    const live = await isAgentLive(prisma, club.clubId)
    let actionsTaken = 0

    // 1. Recent cancellations → slot filler opportunity
    const cancellations: any[] = await prisma.$queryRawUnsafe(`
      SELECT b.id, b."sessionId", b."userId", ps.title, ps.date, ps."startTime", ps."maxPlayers",
        (SELECT COUNT(*) FROM play_session_bookings b2 WHERE b2."sessionId" = ps.id AND b2.status = 'CONFIRMED') as confirmed
      FROM play_session_bookings b
      JOIN play_sessions ps ON ps.id = b."sessionId"
      WHERE ps."clubId" = $1::uuid
        AND b.status = 'CANCELLED'
        AND b."cancelledAt" >= $2
        AND ps.date >= $3
        AND ps.date <= $4
    `, club.clubId, fifteenMinAgo.toISOString(), now.toISOString(), fortyEightHours.toISOString())

    // 2. Underfilled sessions in next 48h
    const underfilled: any[] = await prisma.$queryRawUnsafe(`
      SELECT ps.id, ps.title, ps.date, ps."startTime", ps."maxPlayers", ps.format, ps."skillLevel",
        (SELECT COUNT(*) FROM play_session_bookings b WHERE b."sessionId" = ps.id AND b.status = 'CONFIRMED') as confirmed
      FROM play_sessions ps
      WHERE ps."clubId" = $1::uuid
        AND ps.status = 'SCHEDULED'
        AND ps.date >= $2
        AND ps.date <= $3
        AND ps."maxPlayers" > 0
      HAVING (SELECT COUNT(*) FROM play_session_bookings b WHERE b."sessionId" = ps.id AND b.status = 'CONFIRMED')::float / ps."maxPlayers" < 0.5
      ORDER BY ps.date ASC
      LIMIT 10
    `, club.clubId, now.toISOString(), fortyEightHours.toISOString())

    // 3. New members (created in last 15 min — API sync)
    const newMembers: any[] = await prisma.$queryRawUnsafe(`
      SELECT cf.user_id as "userId", u.name, u.email
      FROM club_followers cf
      JOIN users u ON u.id = cf.user_id
      WHERE cf.club_id = $1::uuid
        AND cf.created_at >= $2
        AND u.email NOT LIKE '%placeholder%'
        AND u.email NOT LIKE '%demo%'
    `, club.clubId, fifteenMinAgo.toISOString())

    // Log events
    if (cancellations.length > 0 || underfilled.length > 0 || newMembers.length > 0) {
      log.info(`Club ${club.clubName}: ${cancellations.length} cancels, ${underfilled.length} underfilled, ${newMembers.length} new members`)
    }

    // Act on underfilled sessions (slot filler autopilot)
    if (live && underfilled.length > 0) {
      for (const session of underfilled.slice(0, 5)) {
        // Check if we already sent invites for this session recently
        const recentInvites = await prisma.aIRecommendationLog.count({
          where: {
            clubId: club.clubId,
            type: 'SLOT_FILLER',
            sessionId: session.id,
            createdAt: { gte: new Date(now.getTime() - 6 * 60 * 60 * 1000) }, // last 6h
          },
        })
        if (recentInvites >= 5) continue // Already invited enough for this session

        // Log as pending — slot filler invites for morning digest
        await prisma.aIRecommendationLog.create({
          data: {
            clubId: club.clubId,
            userId: 'system', // No specific user — session-level action
            type: 'SLOT_FILLER',
            sessionId: session.id,
            status: 'pending',
            reasoning: {
              source: 'event_detection',
              sessionTitle: session.title,
              sessionDate: session.date,
              confirmed: Number(session.confirmed),
              maxPlayers: session.maxPlayers,
              occupancy: Math.round(Number(session.confirmed) / session.maxPlayers * 100),
              confidence: 75,
              autoApproved: false,
            },
          },
        }).catch(() => {})
        actionsTaken++
      }
    }

    // Act on new members (onboarding)
    if (live && newMembers.length > 0) {
      for (const member of newMembers) {
        // Check if already welcomed
        const alreadyWelcomed = await prisma.aIRecommendationLog.count({
          where: {
            clubId: club.clubId,
            userId: member.userId,
            type: 'NEW_MEMBER_WELCOME',
          },
        })
        if (alreadyWelcomed > 0) continue

        // Send welcome email (auto-approved — low risk)
        try {
          const { sendOutreachEmail } = await import('@/lib/email')
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.iqsport.ai'
          const firstName = member.name?.split(' ')[0] || 'there'

          await sendOutreachEmail({
            to: member.email,
            subject: `Welcome to ${club.clubName}! 🏓`,
            body: `Hey ${firstName}!\n\nWelcome to ${club.clubName}! We're excited to have you join our community.\n\nCheck out our upcoming sessions and find the perfect game for your level. We have Open Play, Clinics, and Leagues — there's something for everyone.\n\nSee you on the courts!`,
            clubName: club.clubName,
            bookingUrl: `${baseUrl}/clubs/${club.clubId}/play`,
          })

          await prisma.aIRecommendationLog.create({
            data: {
              clubId: club.clubId,
              userId: member.userId,
              type: 'NEW_MEMBER_WELCOME',
              channel: 'email',
              sequenceStep: 0,
              status: 'sent',
              reasoning: {
                source: 'event_detection',
                confidence: 95,
                autoApproved: true,
                memberName: member.name,
              },
            },
          }).catch(() => {})
          actionsTaken++
        } catch (err) {
          log.error(`Welcome email failed for ${member.name}:`, (err as Error).message?.slice(0, 80))
        }
      }
    }

    results.push({
      clubId: club.clubId,
      clubName: club.clubName,
      cancellations: cancellations.length,
      underfilled: underfilled.length,
      newMembers: newMembers.length,
      actionsTaken,
      dryRun: !live,
    })
  }

  return results
}

async function run(request: Request) {
  const auth = getAuthorized(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const startedAt = new Date()
  try {
    const results = await detectEvents()
    const totalActions = results.reduce((s, r) => s + r.actionsTaken, 0)
    log.info(`Event detection: ${results.length} clubs, ${totalActions} actions`)

    return NextResponse.json({
      ok: true,
      startedAt: startedAt.toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      clubs: results,
      totalActions,
    })
  } catch (err) {
    log.error('Event detection failed:', (err as Error).message)
    return NextResponse.json({ ok: false, error: (err as Error).message?.slice(0, 200) }, { status: 500 })
  }
}

export async function POST(request: Request) { return run(request) }
export async function GET(request: Request) { return run(request) }
