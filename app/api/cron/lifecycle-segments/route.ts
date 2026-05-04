/**
 * CRON: Lifecycle Segments Orchestrator
 *
 * Daily entry point for all ENGAGE lifecycle-segment automation. One job,
 * one cron line in vercel.json — keeps additions cheap as we ship more
 * segments (Sleeping, VIP quarterly, Trial-not-converted, etc.).
 *
 * For each club with an active subscription, runs:
 *
 *   1. Newcomer (segment #1) — processOnboardingFollowUps advances Day 5
 *      and Day 12 of NEW_MEMBER_WELCOME chains. (Step 0 is fired
 *      separately by event-detection.ts on member join detection.)
 *
 *   2. Declining (segment #4) — detectDecliningMembers finds fresh activity
 *      drops, creates Day 1 logs for each, then processDecliningFollowUps
 *      advances Day 5 and Day 12 with conditional exit (booked OR survey
 *      responded → exit).
 *
 * Auth: Bearer CRON_SECRET (same as other cron endpoints in this app).
 *
 * Trigger: vercel.json cron — runs once daily, early morning UTC.
 *
 * Failure isolation: each club + each segment is wrapped so one club's
 * failure doesn't block the rest of the run. Per-club totals are returned
 * in the response body for visibility.
 */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { processOnboardingFollowUps } from '@/lib/ai/onboarding-sequence'
import {
  detectDecliningMembers,
  type DecliningCandidate,
} from '@/lib/ai/declining-detector'
import {
  createDecliningStep0,
  processDecliningFollowUps,
} from '@/lib/ai/declining-sequence'
import {
  detectSleepingMembers,
  type SleepingCandidate,
} from '@/lib/ai/sleeping-detector'
import {
  createSleepingStep0,
  processSleepingFollowUps,
} from '@/lib/ai/sleeping-sequence'
import {
  detectBirthdayMembers,
  sendBirthdayGiftOffer,
  type BirthdayCandidate,
} from '@/lib/ai/birthday-gift'
import { cronLogger as log } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

interface ClubResult {
  clubId: string
  clubName: string
  newcomer: { sent: number; skipped: number }
  decliningDetected: number
  decliningStep0: { sent: number; skipped: number }
  decliningFollowUps: { sent: number; skipped: number; exited: number }
  sleepingDetected: number
  sleepingStep0: { sent: number; skipped: number }
  sleepingFollowUps: { sent: number; skipped: number; exited: number }
  birthdayDetected: number
  birthdaySent: { sent: number; skipped: number }
  errors: string[]
}

export async function GET(request: Request) { return handle(request) }
export async function POST(request: Request) { return handle(request) }

async function handle(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not set' }, { status: 500 })
  }
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // All clubs with at least one club_admin (proxy for "active enough to run
  // automation against"). Filtering on subscription would also work but the
  // Subscription model is per-user not per-club; keeping it simple here.
  const clubs = await prisma.club.findMany({
    select: { id: true, name: true },
  })

  const results: ClubResult[] = []

  for (const club of clubs) {
    const r: ClubResult = {
      clubId: club.id,
      clubName: club.name || 'Unknown',
      newcomer: { sent: 0, skipped: 0 },
      decliningDetected: 0,
      decliningStep0: { sent: 0, skipped: 0 },
      decliningFollowUps: { sent: 0, skipped: 0, exited: 0 },
      sleepingDetected: 0,
      sleepingStep0: { sent: 0, skipped: 0 },
      sleepingFollowUps: { sent: 0, skipped: 0, exited: 0 },
      birthdayDetected: 0,
      birthdaySent: { sent: 0, skipped: 0 },
      errors: [],
    }

    // ── Segment #1 Newcomer follow-ups (Day 5 + Day 12) ──
    try {
      const out = await processOnboardingFollowUps(prisma, club.id, r.clubName, false)
      r.newcomer = out
    } catch (err: any) {
      log.error({ clubId: club.id, error: err?.message?.slice(0, 200) }, '[lifecycle-cron] newcomer failed')
      r.errors.push(`newcomer: ${err?.message?.slice(0, 100) ?? 'unknown'}`)
    }

    // ── Segment #4 Declining detection + Day 1 ──
    let candidates: DecliningCandidate[] = []
    try {
      candidates = await detectDecliningMembers(prisma, club.id)
      r.decliningDetected = candidates.length
    } catch (err: any) {
      log.error({ clubId: club.id, error: err?.message?.slice(0, 200) }, '[lifecycle-cron] declining detect failed')
      r.errors.push(`declining-detect: ${err?.message?.slice(0, 100) ?? 'unknown'}`)
    }

    for (const candidate of candidates) {
      try {
        const out = await createDecliningStep0(prisma, candidate, r.clubName, false)
        if (out.status === 'sent') r.decliningStep0.sent++
        else r.decliningStep0.skipped++
      } catch (err: any) {
        log.error({ userId: candidate.userId, clubId: club.id, error: err?.message?.slice(0, 200) }, '[lifecycle-cron] declining step0 failed')
        r.decliningStep0.skipped++
      }
    }

    // ── Segment #4 Declining follow-ups (Day 5 + Day 12) ──
    try {
      const out = await processDecliningFollowUps(prisma, club.id, r.clubName, false)
      r.decliningFollowUps = out
    } catch (err: any) {
      log.error({ clubId: club.id, error: err?.message?.slice(0, 200) }, '[lifecycle-cron] declining follow-ups failed')
      r.errors.push(`declining-followup: ${err?.message?.slice(0, 100) ?? 'unknown'}`)
    }

    // ── Segment #5 Sleeping detection + Day 1 ──
    let sleepingCandidates: SleepingCandidate[] = []
    try {
      // Default limit (50) keeps daily Mandrill volume sane on large clubs
      // (some have 400+ sleepers; we drain in waves over ~10 days).
      sleepingCandidates = await detectSleepingMembers(prisma, club.id)
      r.sleepingDetected = sleepingCandidates.length
    } catch (err: any) {
      log.error({ clubId: club.id, error: err?.message?.slice(0, 200) }, '[lifecycle-cron] sleeping detect failed')
      r.errors.push(`sleeping-detect: ${err?.message?.slice(0, 100) ?? 'unknown'}`)
    }

    for (const candidate of sleepingCandidates) {
      try {
        const out = await createSleepingStep0(prisma, candidate, r.clubName, false)
        if (out.status === 'sent') r.sleepingStep0.sent++
        else r.sleepingStep0.skipped++
      } catch (err: any) {
        log.error({ userId: candidate.userId, clubId: club.id, error: err?.message?.slice(0, 200) }, '[lifecycle-cron] sleeping step0 failed')
        r.sleepingStep0.skipped++
      }
    }

    // ── Segment #5 Sleeping follow-ups (Day 14) ──
    try {
      const out = await processSleepingFollowUps(prisma, club.id, r.clubName, false)
      r.sleepingFollowUps = out
    } catch (err: any) {
      log.error({ clubId: club.id, error: err?.message?.slice(0, 200) }, '[lifecycle-cron] sleeping follow-ups failed')
      r.errors.push(`sleeping-followup: ${err?.message?.slice(0, 100) ?? 'unknown'}`)
    }

    // ── Segment #8 Birthday gift offer (D-7) ──
    let birthdayCandidates: BirthdayCandidate[] = []
    try {
      birthdayCandidates = await detectBirthdayMembers(prisma, club.id)
      r.birthdayDetected = birthdayCandidates.length
    } catch (err: any) {
      log.error({ clubId: club.id, error: err?.message?.slice(0, 200) }, '[lifecycle-cron] birthday detect failed')
      r.errors.push(`birthday-detect: ${err?.message?.slice(0, 100) ?? 'unknown'}`)
    }

    for (const candidate of birthdayCandidates) {
      try {
        const out = await sendBirthdayGiftOffer(prisma, candidate, r.clubName, false)
        if (out.status === 'sent') r.birthdaySent.sent++
        else r.birthdaySent.skipped++
      } catch (err: any) {
        log.error({ userId: candidate.userId, clubId: club.id, error: err?.message?.slice(0, 200) }, '[lifecycle-cron] birthday send failed')
        r.birthdaySent.skipped++
      }
    }

    results.push(r)
  }

  // Aggregate top-level totals for quick visibility in cron dashboards.
  const totals = results.reduce(
    (acc, r) => ({
      newcomerSent: acc.newcomerSent + r.newcomer.sent,
      decliningDetected: acc.decliningDetected + r.decliningDetected,
      decliningStep0Sent: acc.decliningStep0Sent + r.decliningStep0.sent,
      decliningFollowUpsSent: acc.decliningFollowUpsSent + r.decliningFollowUps.sent,
      decliningExited: acc.decliningExited + r.decliningFollowUps.exited,
      sleepingDetected: acc.sleepingDetected + r.sleepingDetected,
      sleepingStep0Sent: acc.sleepingStep0Sent + r.sleepingStep0.sent,
      sleepingFollowUpsSent: acc.sleepingFollowUpsSent + r.sleepingFollowUps.sent,
      sleepingExited: acc.sleepingExited + r.sleepingFollowUps.exited,
      birthdayDetected: acc.birthdayDetected + r.birthdayDetected,
      birthdaySent: acc.birthdaySent + r.birthdaySent.sent,
    }),
    {
      newcomerSent: 0,
      decliningDetected: 0, decliningStep0Sent: 0, decliningFollowUpsSent: 0, decliningExited: 0,
      sleepingDetected: 0, sleepingStep0Sent: 0, sleepingFollowUpsSent: 0, sleepingExited: 0,
      birthdayDetected: 0, birthdaySent: 0,
    },
  )

  return NextResponse.json({ ok: true, processed: results.length, totals, perClub: results })
}
