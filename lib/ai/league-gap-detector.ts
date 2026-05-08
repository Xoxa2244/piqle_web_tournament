/**
 * League gap detector (Sprint 2 P2.3).
 *
 * For a given club, walk every league family in the recent window. If
 * a family is in gap_critical (no upcoming session, last past 14-60d
 * ago) and we haven't already raised an AgentDraft for it within the
 * cooldown window, create one. The draft sits in the agent queue
 * waiting for admin review — one click to launch an "open enrollment
 * for next <family>" campaign.
 *
 * Scoped to gap_critical only on first pass. gap_warning (7-14d) is
 * surfaced visually on the Leagues page but doesn't auto-draft yet —
 * we want admins to confirm the cadence is right before nagging them.
 *
 * Idempotency:
 *   - lookback for existing AgentDraft with kind='LEAGUE_GAP' and
 *     metadata.leagueFamily === family.family in last 30d
 *   - skip if found
 *
 * AgentDraft.createdByUserId is filled with the club's first ADMIN
 * (the primary owner). If no admin exists we silently skip — a club
 * without an admin can't act on a draft anyway.
 */

import type { PrismaClient } from '@prisma/client'
import { detectLeagueFamily } from './league-family-detector'

interface SessionRow {
  id: string
  title: string
  date: Date
  registered_count: number | null
  max_players: number | null
}

interface FamilyAggregate {
  family: string
  sponsors: string[]
  pastSessions: SessionRow[]
  futureSessions: SessionRow[]
  totalRegistered: number
  totalCapacity: number
}

export interface LeagueGapDraftCreated {
  clubId: string
  family: string
  daysSinceLast: number
  draftId: string
}

export interface LeagueGapResult {
  clubId: string
  familiesScanned: number
  familiesInCriticalGap: number
  draftsCreated: LeagueGapDraftCreated[]
  draftsSkippedAsRecent: number
  errors: number
}

const COOLDOWN_DAYS = 30
const LOOKBACK_WINDOW_DAYS = 180
const GAP_CRITICAL_MIN_DAYS = 14
const GAP_CRITICAL_MAX_DAYS = 60

/**
 * Scan one club for stale leagues and create AgentDrafts for any that
 * crossed gap_critical without an active draft. Idempotent — safe to
 * call multiple times per day.
 */
export async function detectLeagueGapsForClub(
  prisma: PrismaClient,
  clubId: string,
): Promise<LeagueGapResult> {
  const result: LeagueGapResult = {
    clubId,
    familiesScanned: 0,
    familiesInCriticalGap: 0,
    draftsCreated: [],
    draftsSkippedAsRecent: 0,
    errors: 0,
  }

  // Find a club admin to attribute the draft to. Drafts require a
  // valid User reference, and the primary admin is the natural owner
  // of any auto-generated outreach.
  const admin = await prisma.clubAdmin.findFirst({
    where: { clubId, role: 'ADMIN' },
    orderBy: { createdAt: 'asc' },
    select: { userId: true },
  })

  if (!admin) {
    return result
  }

  const since = new Date(Date.now() - LOOKBACK_WINDOW_DAYS * 86400000)
  const sessions = await prisma.$queryRaw<SessionRow[]>`
    SELECT id, title, date, registered_count, "maxPlayers" AS max_players
    FROM play_sessions
    WHERE "clubId" = ${clubId}
      AND date >= ${since}
      AND (format = 'LEAGUE_PLAY' OR LOWER(title) LIKE '%league%')
  `

  // Group by family
  const families = new Map<string, FamilyAggregate>()
  for (const s of sessions) {
    const det = detectLeagueFamily(s.title)
    if (!det.family) continue
    let bucket = families.get(det.family)
    if (!bucket) {
      bucket = {
        family: det.family,
        sponsors: [],
        pastSessions: [],
        futureSessions: [],
        totalRegistered: 0,
        totalCapacity: 0,
      }
      families.set(det.family, bucket)
    }
    if (det.sponsor && !bucket.sponsors.includes(det.sponsor)) {
      bucket.sponsors.push(det.sponsor)
    }
    bucket.totalRegistered += s.registered_count ?? 0
    bucket.totalCapacity += s.max_players ?? 0
  }

  const now = new Date()
  for (const s of sessions) {
    const det = detectLeagueFamily(s.title)
    if (!det.family) continue
    const bucket = families.get(det.family)!
    if (s.date.getTime() < now.getTime()) bucket.pastSessions.push(s)
    else bucket.futureSessions.push(s)
  }

  result.familiesScanned = families.size

  const cooldownThreshold = new Date(Date.now() - COOLDOWN_DAYS * 86400000)

  for (const family of Array.from(families.values())) {
    if (family.futureSessions.length > 0) continue

    const lastPast = family.pastSessions.length > 0
      ? family.pastSessions.reduce((a: SessionRow, b: SessionRow) =>
          a.date.getTime() > b.date.getTime() ? a : b,
        )
      : null
    if (!lastPast) continue

    const daysSinceLast = Math.floor((now.getTime() - lastPast.date.getTime()) / 86400000)
    if (daysSinceLast < GAP_CRITICAL_MIN_DAYS || daysSinceLast > GAP_CRITICAL_MAX_DAYS) continue

    result.familiesInCriticalGap += 1

    // Idempotency check — JSON path filter on metadata.leagueFamily.
    const existing = await prisma.agentDraft.findFirst({
      where: {
        clubId,
        kind: 'LEAGUE_GAP',
        createdAt: { gte: cooldownThreshold },
        metadata: {
          path: ['leagueFamily'],
          equals: family.family,
        },
      },
      select: { id: true },
    })

    if (existing) {
      result.draftsSkippedAsRecent += 1
      continue
    }

    const lastSessionDateLabel = lastPast.date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })

    const sponsorClause = family.sponsors.length > 0
      ? ` (sponsored by ${family.sponsors.join(', ')})`
      : ''

    try {
      const draft = await prisma.agentDraft.create({
        data: {
          clubId,
          createdByUserId: admin.userId,
          kind: 'LEAGUE_GAP',
          status: 'review_ready',
          title: `Open enrollment for next ${family.family}`,
          summary:
            `${family.family}${sponsorClause} hasn't run since ${lastSessionDateLabel} ` +
            `(${daysSinceLast} days ago) and no upcoming session is scheduled in CourtReserve. ` +
            `IPC Programming OS expects leagues to be continuously available — open enrollment ` +
            `for the next session before the gap widens.`,
          originalIntent: 'auto_league_gap_detector',
          requestedAction: {
            type: 'launch_open_enrollment_campaign',
            leagueFamily: family.family,
            sponsors: family.sponsors,
            lastSessionDate: lastPast.date.toISOString(),
            daysSinceLast,
            audienceHint: `members who attended any "${family.family}" session in the last ${LOOKBACK_WINDOW_DAYS} days`,
            suggestedSubject: `Next ${family.family} season — sign up`,
            suggestedBody:
              `Hi {firstName},\n\n` +
              `${family.family} hasn't been on the schedule since ${lastSessionDateLabel}. ` +
              `We're opening enrollment for the next session — your spot from last time is held for the first 48 hours.\n\n` +
              `Reply YES or click below to claim it.`,
          },
          workingAction: {
            type: 'launch_open_enrollment_campaign',
            leagueFamily: family.family,
          },
          metadata: {
            source: 'league-gap-detector',
            leagueFamily: family.family,
            sponsors: family.sponsors,
            daysSinceLast,
            lastSessionDate: lastPast.date.toISOString(),
            pastSessionCount: family.pastSessions.length,
            totalRegistered: family.totalRegistered,
            totalCapacity: family.totalCapacity,
          },
        },
        select: { id: true },
      })

      result.draftsCreated.push({
        clubId,
        family: family.family,
        daysSinceLast,
        draftId: draft.id,
      })
    } catch (err: any) {
      console.error(
        `[LeagueGapDetector] Failed to create draft for ${clubId} / ${family.family}:`,
        err.message,
      )
      result.errors += 1
    }
  }

  return result
}

/**
 * Run the detector across every club that has at least one league
 * session in the lookback window. Used by the daily cron orchestrator.
 */
export async function detectLeagueGapsForAllClubs(prisma: PrismaClient): Promise<LeagueGapResult[]> {
  const since = new Date(Date.now() - LOOKBACK_WINDOW_DAYS * 86400000)
  const clubsWithLeagues = await prisma.$queryRaw<Array<{ clubId: string }>>`
    SELECT DISTINCT "clubId"
    FROM play_sessions
    WHERE date >= ${since}
      AND (format = 'LEAGUE_PLAY' OR LOWER(title) LIKE '%league%')
  `

  const results: LeagueGapResult[] = []
  for (const { clubId } of clubsWithLeagues) {
    try {
      const r = await detectLeagueGapsForClub(prisma, clubId)
      results.push(r)
    } catch (err: any) {
      console.error(`[LeagueGapDetector] Club ${clubId} failed:`, err.message)
      results.push({
        clubId,
        familiesScanned: 0,
        familiesInCriticalGap: 0,
        draftsCreated: [],
        draftsSkippedAsRecent: 0,
        errors: 1,
      })
    }
  }
  return results
}
