/**
 * CRON: League Gap Detector (Sprint 2 P2.3)
 *
 * Once per day, walk every club with at least one league session in the
 * last 180 days. For each league family in gap_critical (no upcoming,
 * last past 14-60d ago), create an AgentDraft so admin sees an
 * "Open enrollment for next <family>" suggestion in their queue.
 *
 * Idempotent: cooldown 30d per (club, family). Re-running mid-day is safe.
 *
 * Auth: Bearer CRON_SECRET (same as other cron endpoints).
 *
 * Trigger: vercel.json cron — daily at 13:30 UTC (8:30 AM ET, before
 * club operators start their day).
 */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { detectLeagueGapsForAllClubs } from '@/lib/ai/league-gap-detector'

export const maxDuration = 60

export async function GET(req: Request) {
  // Auth
  const authHeader = req.headers.get('authorization') || ''
  const expected = `Bearer ${process.env.CRON_SECRET}`
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  try {
    const results = await detectLeagueGapsForAllClubs(prisma)
    const totals = results.reduce(
      (acc, r) => {
        acc.familiesScanned += r.familiesScanned
        acc.familiesInCriticalGap += r.familiesInCriticalGap
        acc.draftsCreated += r.draftsCreated.length
        acc.draftsSkippedAsRecent += r.draftsSkippedAsRecent
        acc.errors += r.errors
        return acc
      },
      {
        clubsProcessed: results.length,
        familiesScanned: 0,
        familiesInCriticalGap: 0,
        draftsCreated: 0,
        draftsSkippedAsRecent: 0,
        errors: 0,
      },
    )

    console.log(
      `[CRON league-gap-detector] ${totals.clubsProcessed} clubs, ` +
        `${totals.familiesInCriticalGap} critical gaps, ` +
        `${totals.draftsCreated} drafts created, ` +
        `${totals.draftsSkippedAsRecent} skipped (cooldown), ` +
        `${totals.errors} errors, ` +
        `${Date.now() - startedAt}ms`,
    )

    return NextResponse.json({
      ok: true,
      totals,
      perClub: results.map((r) => ({
        clubId: r.clubId,
        familiesScanned: r.familiesScanned,
        familiesInCriticalGap: r.familiesInCriticalGap,
        draftsCreated: r.draftsCreated.length,
        skipped: r.draftsSkippedAsRecent,
        errors: r.errors,
        details: r.draftsCreated.map((d) => ({
          family: d.family,
          daysSinceLast: d.daysSinceLast,
          draftId: d.draftId,
        })),
      })),
      durationMs: Date.now() - startedAt,
    })
  } catch (err: any) {
    console.error('[CRON league-gap-detector] Fatal:', err)
    return NextResponse.json(
      { ok: false, error: err.message?.slice(0, 200) || 'unknown' },
      { status: 500 },
    )
  }
}
