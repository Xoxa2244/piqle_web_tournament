/**
 * Programming IQ — Outcome aggregator (Phase A.2).
 *
 * Daily cron entrypoint. For each club, finds Programming-IQ-published
 * PlaySessions whose end time is in the past (and whose date is within
 * the lookback window), measures actual attendance, classifies it, and
 * upserts one row per session into `programming_iq_outcome_log`.
 *
 * Linkage to decision log:
 *   - We compute the same `slotSignature` the scheduler used (court +
 *     day-of-week + hour bucket) and look up the most recent decision
 *     row for (clubId, weekStartDate, slotSignature, decision='selected').
 *   - If found, the outcome row carries `decisionLogId` so the diagnostics
 *     endpoint can join "predicted vs actual" without a deterministic FK.
 *   - Decision rows can be retention-cleaned later without affecting
 *     outcome rows (FK is intentionally non-enforced — see migration).
 *
 * Idempotency:
 *   - The outcome table has a unique index on `session_id`. We use
 *     `upsert` keyed on it so re-running the cron updates the same row
 *     (e.g. a late check-in flips a "low" outcome to "partial").
 *
 * Scope guard:
 *   - LOOKBACK_DAYS bounds backfill on first run. After that, the window
 *     is small enough that a missed day is recoverable on the next run.
 *   - We only consider sessions whose date >= today - LOOKBACK_DAYS AND
 *     whose date <= yesterday. Today's sessions still in flight are
 *     skipped — we'd rather record a stable outcome the day after.
 */

import type { PrismaClient } from '@prisma/client'

const LOOKBACK_DAYS = 14
const NEW_MEMBER_WINDOW_DAYS = 30

export interface OutcomeRunSummary {
  clubsChecked: number
  sessionsConsidered: number
  outcomesWritten: number
  outcomesUpdated: number
  errors: number
  durationMs: number
}

interface SessionRow {
  id: string
  clubId: string
  courtId: string | null
  date: Date
  startTime: string
  endTime: string
  format: string
  skillLevel: string
  maxPlayers: number
  draftMetadata: any
  draftProjectedOccupancy: number | null
}

/**
 * Compute Monday-based week start as ISO YYYY-MM-DD (UTC date).
 * Programming IQ schedules in club-local TZ but week math here is UTC
 * so the join with decision_log lines up — decision_log stores
 * weekStartDate as a DATE column, also UTC-typed.
 */
export function isoMondayOf(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const dow = d.getUTCDay() // 0..6, Sun=0
  const diff = dow === 0 ? -6 : 1 - dow
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().slice(0, 10)
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
function dayOfWeekFor(date: Date): string {
  return DAY_NAMES[date.getUTCDay()] || 'Monday'
}

function classifyAttendance(actual: number, capacity: number): { pct: number; klass: string } {
  if (capacity <= 0) return { pct: 0, klass: 'no_show' }
  const pct = (actual / capacity) * 100
  if (actual === 0) return { pct: 0, klass: 'no_show' }
  if (pct > 100) return { pct, klass: 'over' }
  if (pct >= 80) return { pct, klass: 'full' }
  if (pct >= 40) return { pct, klass: 'partial' }
  return { pct, klass: 'low' }
}

/**
 * Slot signature used by both scheduler and outcomes cron.
 * Mirrors makeSlotSignature in programming-iq-decision-log.ts but with
 * a Date-based dayOfWeek so we don't have to round-trip through the draft.
 */
function makeSignature(courtId: string | null | undefined, dayOfWeek: string, startTime: string): string {
  const court = courtId && courtId.length > 0 ? courtId : '*'
  const hour = startTime.slice(0, 2)
  return `court=${court}|day=${dayOfWeek}|hour=${hour}`
}

/**
 * Process every club. Returns aggregate counters; never throws.
 */
export async function recordOutcomesForAllClubs(
  prisma: PrismaClient,
): Promise<OutcomeRunSummary> {
  const t0 = Date.now()
  const summary: OutcomeRunSummary = {
    clubsChecked: 0,
    sessionsConsidered: 0,
    outcomesWritten: 0,
    outcomesUpdated: 0,
    errors: 0,
    durationMs: 0,
  }

  const now = new Date()
  // Yesterday at 23:59 UTC — sessions that started today are still in
  // flight, so we wait one day before recording an outcome.
  const upper = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0))
  upper.setUTCDate(upper.getUTCDate()) // start of today UTC
  const lower = new Date(upper)
  lower.setUTCDate(lower.getUTCDate() - LOOKBACK_DAYS)

  // Pull all clubs with at least one Programming IQ draft. Brand-new
  // clubs with no Programming IQ usage skip the loop entirely.
  const clubs = await (prisma as any).club.findMany({
    where: {
      opsSessionDrafts: {
        some: { origin: 'programming_iq', publishedPlaySessionId: { not: null } },
      },
    },
    select: { id: true },
  }).catch(() => [])

  for (const club of clubs as Array<{ id: string }>) {
    summary.clubsChecked += 1
    try {
      await processClub(prisma, club.id, lower, upper, summary)
    } catch (err: any) {
      summary.errors += 1
      // eslint-disable-next-line no-console
      console.warn('[programming-iq-outcomes] club', club.id, 'failed:', String(err?.message ?? err).slice(0, 200))
    }
  }

  summary.durationMs = Date.now() - t0
  return summary
}

async function processClub(
  prisma: PrismaClient,
  clubId: string,
  lower: Date,
  upper: Date,
  summary: OutcomeRunSummary,
): Promise<void> {
  // Sessions whose draft origin is programming_iq. We pull the draft
  // alongside so we can fetch the projectedOccupancy (the v1 scoring
  // pipeline writes it to OpsSessionDraft.projectedOccupancy and the
  // outcome row needs predicted-vs-actual to be useful).
  const drafts = await (prisma as any).opsSessionDraft.findMany({
    where: {
      clubId,
      origin: 'programming_iq',
      publishedPlaySessionId: { not: null },
      publishedPlaySession: {
        date: { gte: lower, lt: upper },
      },
    },
    select: {
      projectedOccupancy: true,
      metadata: true,
      publishedPlaySession: {
        select: {
          id: true,
          clubId: true,
          courtId: true,
          date: true,
          startTime: true,
          endTime: true,
          format: true,
          skillLevel: true,
          maxPlayers: true,
        },
      },
    },
    take: 500,
  }).catch(() => [])

  const rows: SessionRow[] = (drafts as any[])
    .filter((d) => d.publishedPlaySession)
    .map((d) => ({
      id: d.publishedPlaySession.id,
      clubId: d.publishedPlaySession.clubId,
      courtId: d.publishedPlaySession.courtId,
      date: d.publishedPlaySession.date,
      startTime: d.publishedPlaySession.startTime,
      endTime: d.publishedPlaySession.endTime,
      format: String(d.publishedPlaySession.format),
      skillLevel: String(d.publishedPlaySession.skillLevel),
      maxPlayers: d.publishedPlaySession.maxPlayers ?? 8,
      draftMetadata: d.metadata,
      draftProjectedOccupancy: d.projectedOccupancy ?? null,
    }))

  for (const row of rows) {
    summary.sessionsConsidered += 1
    try {
      const wrote = await processSession(prisma, row)
      if (wrote === 'created') summary.outcomesWritten += 1
      else if (wrote === 'updated') summary.outcomesUpdated += 1
    } catch (err: any) {
      summary.errors += 1
      // eslint-disable-next-line no-console
      console.warn('[programming-iq-outcomes] session', row.id, 'failed:', String(err?.message ?? err).slice(0, 200))
    }
  }
}

async function processSession(
  prisma: PrismaClient,
  row: SessionRow,
): Promise<'created' | 'updated' | 'skipped'> {
  const dayOfWeek = dayOfWeekFor(row.date)
  const weekStartIso = isoMondayOf(row.date)
  const weekStartDate = new Date(weekStartIso)
  const slotSignature = makeSignature(row.courtId, dayOfWeek, row.startTime)

  // Bookings: confirmed = active reservation; checked_in counts double.
  // We treat any non-cancelled booking as attendance for v1; a stricter
  // "actually showed up" metric will use checkedInAt later when CR sync
  // backfills it consistently.
  const bookings = await (prisma as any).playSessionBooking.findMany({
    where: {
      sessionId: row.id,
      cancelledAt: null,
      status: { in: ['CONFIRMED', 'CHECKED_IN'] },
    },
    select: {
      userId: true,
      user: { select: { createdAt: true } },
    },
    take: 200,
  }).catch(() => [])

  const actualAttendance = (bookings as any[]).length

  const newMemberThreshold = new Date(row.date)
  newMemberThreshold.setUTCDate(newMemberThreshold.getUTCDate() - NEW_MEMBER_WINDOW_DAYS)
  const newMemberCount = (bookings as any[]).filter(
    (b) => b.user?.createdAt && new Date(b.user.createdAt) >= newMemberThreshold,
  ).length

  // At-risk = closest pre-session MemberHealthSnapshot per booking with
  // riskLevel in (at_risk, critical). We approximate by querying the
  // latest snapshot for each booking-user up to the session date.
  let atRiskMemberCount = 0
  if (bookings.length > 0) {
    const userIds = (bookings as any[]).map((b) => b.userId)
    const snapshots = await (prisma as any).memberHealthSnapshot.findMany({
      where: {
        clubId: row.clubId,
        userId: { in: userIds },
        date: { lte: row.date },
      },
      orderBy: { date: 'desc' },
      select: { userId: true, riskLevel: true, date: true },
      take: userIds.length * 5, // we only need most-recent per user, so a small batch ≫ count is fine
    }).catch(() => [])

    const latestByUser = new Map<string, string>()
    for (const s of snapshots as Array<{ userId: string; riskLevel: string }>) {
      if (!latestByUser.has(s.userId)) latestByUser.set(s.userId, s.riskLevel)
    }
    atRiskMemberCount = Array.from(latestByUser.values()).filter(
      (lvl) => lvl === 'at_risk' || lvl === 'critical',
    ).length
  }

  const capacity = row.maxPlayers
  const { pct, klass } = classifyAttendance(actualAttendance, capacity)

  // Best-effort link to decision log. Look for the row matching the
  // (selected | risk) decision in this signature for this week. There
  // can be multiple historical decision rows if the admin regenerated
  // the week several times; we take the most recent generation that
  // ended up published (the one that produced this draft).
  const decisionMatch = await (prisma as any).programmingIQDecisionLog.findFirst({
    where: {
      clubId: row.clubId,
      weekStartDate,
      slotSignature,
      decision: { in: ['selected', 'risk'] },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  }).catch(() => null)

  const predictedOccupancy =
    typeof row.draftProjectedOccupancy === 'number' && Number.isFinite(row.draftProjectedOccupancy)
      ? row.draftProjectedOccupancy
      : 0

  // Upsert keyed on sessionId (unique index). Returns whether we created
  // or updated so we can split telemetry counters.
  const existing = await (prisma as any).programmingIQOutcomeLog.findUnique({
    where: { sessionId: row.id },
    select: { id: true },
  }).catch(() => null)

  await (prisma as any).programmingIQOutcomeLog.upsert({
    where: { sessionId: row.id },
    create: {
      clubId: row.clubId,
      decisionLogId: decisionMatch?.id ?? null,
      sessionId: row.id,
      weekStartDate,
      format: row.format,
      skill: row.skillLevel,
      dayOfWeek,
      startTime: row.startTime,
      predictedOccupancy,
      actualAttendance,
      capacity,
      attendedPct: Number.isFinite(pct) ? pct : 0,
      attendanceClass: klass,
      newMemberCount,
      atRiskMemberCount,
    },
    update: {
      decisionLogId: decisionMatch?.id ?? null,
      predictedOccupancy,
      actualAttendance,
      capacity,
      attendedPct: Number.isFinite(pct) ? pct : 0,
      attendanceClass: klass,
      newMemberCount,
      atRiskMemberCount,
      observedAt: new Date(),
    },
  })

  return existing ? 'updated' : 'created'
}
