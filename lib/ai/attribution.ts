/**
 * AI Revenue Attribution
 *
 * Links a new `play_session_booking` to the AI recommendation that most
 * plausibly produced it, so the per-club ROI dashboard can report
 * "AI-attributed revenue" with a defensible methodology.
 *
 * ── Attribution methods, by descending signal strength ──
 *
 *   1. deep_link            The user clicked a tracked link in our email
 *                           (Mandrill click webhook already set
 *                           `clickedAt` on the log) AND then booked in
 *                           the next 72h. Near-certain causality because
 *                           the click happened BEFORE the booking, and
 *                           an `?rec=<logId>` query param in the URL can
 *                           also be passed explicitly for edge cases
 *                           where booking happens on our platform.
 *
 *   2. direct_session_match SLOT_FILLER (or EVENT_INVITE) where the
 *                           recommendation's sessionId equals the booking's
 *                           sessionId, within a 72h window. Strong signal
 *                           even without a click — the rec pointed at
 *                           exactly this session.
 *
 *   3. time_window          The user received ANY outreach of a relevant
 *                           type within N days of booking, and booked
 *                           anything in-club. Weakest signal; per-type
 *                           windows keep it honest (e.g. CHECK_IN = 7d,
 *                           REACTIVATION = 14d).
 *
 * ── Invariants ──
 *   • One booking → one recommendation (enforced by partial unique index
 *     `ai_recommendation_logs_booking_unique` on booking_id).
 *   • Value is snapshotted at link time so historical ROI reports stay
 *     stable even if the club changes prices later.
 *   • Only CONFIRMED bookings are attributed (cancelled/waitlist ignored).
 *   • Attribution is idempotent: re-running for the same booking is a
 *     no-op when the link already exists.
 */

import type { PrismaClient } from '@prisma/client'
import { aiLogger as log } from '@/lib/logger'
import { BLOCKED_EMAIL_DOMAINS } from '@/lib/email'

// ── Attribution windows (how far back to look for a relevant outreach) ──
// Tuned per type: urgent/specific types have tighter windows, broader
// relationship outreach gets more time.
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const ATTRIBUTION_WINDOW_MS: Record<string, number> = {
  SLOT_FILLER: 72 * HOUR_MS,
  CHECK_IN: 7 * DAY_MS,
  RETENTION_BOOST: 7 * DAY_MS,
  REACTIVATION: 14 * DAY_MS,
  EVENT_INVITE: 14 * DAY_MS,
  REBOOKING: 7 * DAY_MS,
  NEW_MEMBER_WELCOME: 21 * DAY_MS,
  // ── The following are engine types that use the above enum values for
  // logging but represent distinct strategies. They share windows with
  // their underlying type. ──
  // Default for anything not listed: 7 days.
}
const DEFAULT_WINDOW_MS = 7 * DAY_MS

/** Returns true for placeholder/demo/test email addresses we own. */
function isTestEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase()
  if (!domain) return false
  return BLOCKED_EMAIL_DOMAINS.some((d) => domain === d || domain.endsWith('.' + d))
}

// ── Types we consider for time-window attribution. Excludes advisor chat,
// autopilot, churn prediction, etc — those don't produce per-user
// booking-bound outreach. ──
const ATTRIBUTABLE_TYPES = [
  'SLOT_FILLER',
  'REACTIVATION',
  'CHECK_IN',
  'RETENTION_BOOST',
  'EVENT_INVITE',
  'REBOOKING',
  'NEW_MEMBER_WELCOME',
] as const

type AttributionMethod = 'deep_link' | 'direct_session_match' | 'time_window'

// Deep-link has hard priority. Within direct_session_match vs time_window,
// direct wins. Ties broken by most-recent createdAt.
const METHOD_PRIORITY: Record<AttributionMethod, number> = {
  deep_link: 3,
  direct_session_match: 2,
  time_window: 1,
}

export interface AttributionResult {
  logId: string
  method: AttributionMethod
  valueUsd: number | null
}

interface BookingForAttribution {
  id: string
  userId: string
  sessionId: string
  status: string
  bookedAt: Date
  playSession: {
    id: string
    clubId: string
    pricePerSlot: number | null
  }
}

/**
 * Compute the $ value to record for this booking. Priority:
 *   1. Session's pricePerSlot (set by the club at creation).
 *   2. Club's historical median (last 90d, CONFIRMED bookings with price).
 *   3. $15 conservative fallback (beginner Open Play market rate).
 *
 * Null is returned only if the club has never set any prices — callers
 * should still record the link (valueUsd=null) so "attributed bookings
 * count" stays accurate even when $ can't be computed.
 */
async function computeBookingValueUsd(
  prisma: PrismaClient,
  booking: BookingForAttribution,
): Promise<number | null> {
  // 1. Session-level price
  if (booking.playSession.pricePerSlot != null && booking.playSession.pricePerSlot > 0) {
    return Number(booking.playSession.pricePerSlot.toFixed(2))
  }

  // 2. Club historical median (last 90d)
  try {
    const rows: Array<{ median: number | null }> = await prisma.$queryRawUnsafe(
      `
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY ps."pricePerSlot")::float AS median
      FROM play_session_bookings b
      JOIN play_sessions ps ON ps.id = b."sessionId"
      WHERE ps."clubId" = $1
        AND b.status::text = 'CONFIRMED'
        AND ps."pricePerSlot" IS NOT NULL
        AND ps."pricePerSlot" > 0
        AND b."bookedAt" >= NOW() - INTERVAL '90 days'
      `,
      booking.playSession.clubId,
    )
    const median = rows[0]?.median
    if (median != null && median > 0) return Number(median.toFixed(2))
  } catch (err) {
    log.warn?.(`[attribution] historical price lookup failed: ${(err as Error).message?.slice(0, 100)}`)
  }

  // 3. Conservative fallback
  return 15.0
}

/**
 * Find candidate recommendations that could have produced this booking,
 * ranked by method priority. Caller picks the top.
 *
 * We query in three passes rather than one union because the access
 * patterns are very different (one is an exact match, one is a type-scoped
 * scan). Three small queries beat one with complex OR branches.
 */
async function findAttributionCandidates(
  prisma: PrismaClient,
  booking: BookingForAttribution,
  opts: { explicitRecId?: string | null },
): Promise<Array<{ id: string; method: AttributionMethod; createdAt: Date; type: string }>> {
  const candidates: Array<{ id: string; method: AttributionMethod; createdAt: Date; type: string }> = []

  // 1a. Deep-link — caller passed the recId explicitly (from ?rec= cookie
  // captured by a booking page on our platform, if one exists).
  if (opts.explicitRecId) {
    const rec = await prisma.aIRecommendationLog.findUnique({
      where: { id: opts.explicitRecId },
      select: { id: true, userId: true, clubId: true, type: true, createdAt: true, bookingId: true },
    })
    if (
      rec
      && rec.userId === booking.userId
      && rec.clubId === booking.playSession.clubId
      && !rec.bookingId // not already claimed by another booking
    ) {
      // Require the rec to be reasonably recent — 30d cap even for deep links
      // (prevents very old email links from attributing bookings months later).
      const ageMs = booking.bookedAt.getTime() - rec.createdAt.getTime()
      if (ageMs >= 0 && ageMs <= 30 * DAY_MS) {
        candidates.push({
          id: rec.id,
          method: 'deep_link',
          createdAt: rec.createdAt,
          type: rec.type,
        })
      }
    }
  }

  // 1b. Deep-link via Mandrill click webhook — the user clicked our email
  // link, which already set clickedAt on the log. If they booked within 72h
  // of that click, that's a strong causal chain even without a cookie.
  // This is how deep_link works for bookings that land in CourtReserve /
  // partner platforms (i.e. most of our bookings today).
  const deepLinkWindowMs = 72 * HOUR_MS
  const clickLowerBound = new Date(booking.bookedAt.getTime() - deepLinkWindowMs)
  const clicked = await prisma.aIRecommendationLog.findMany({
    where: {
      userId: booking.userId,
      clubId: booking.playSession.clubId,
      clickedAt: { gte: clickLowerBound, lte: booking.bookedAt },
      bookingId: null,
    },
    select: { id: true, clickedAt: true, type: true, createdAt: true },
    orderBy: { clickedAt: 'desc' },
    take: 5,
  })
  for (const rec of clicked) {
    if (rec.clickedAt) {
      candidates.push({
        id: rec.id,
        method: 'deep_link',
        // Use clickedAt as the effective "signal time" — deep_link ordering
        // should prefer the most-recently-CLICKED rec, not the oldest sent.
        createdAt: rec.clickedAt,
        type: rec.type,
      })
    }
  }

  // 2. Direct session match — SLOT_FILLER / EVENT_INVITE where the rec
  // points at this exact session and was sent within the window.
  const directWindowMs = ATTRIBUTION_WINDOW_MS.SLOT_FILLER
  const directLowerBound = new Date(booking.bookedAt.getTime() - directWindowMs)
  const directMatches = await prisma.aIRecommendationLog.findMany({
    where: {
      userId: booking.userId,
      clubId: booking.playSession.clubId,
      sessionId: booking.sessionId,
      type: { in: ['SLOT_FILLER', 'EVENT_INVITE'] },
      createdAt: { gte: directLowerBound, lte: booking.bookedAt },
      bookingId: null, // not already claimed
    },
    select: { id: true, createdAt: true, type: true },
    orderBy: { createdAt: 'desc' },
    take: 5,
  })
  for (const rec of directMatches) {
    candidates.push({ id: rec.id, method: 'direct_session_match', createdAt: rec.createdAt, type: rec.type })
  }

  // 3. Time-window — any attributable type within its per-type window.
  // We use the widest per-type window to bound the scan, then filter per-row.
  const maxWindowMs = Math.max(...Object.values(ATTRIBUTION_WINDOW_MS))
  const windowLowerBound = new Date(booking.bookedAt.getTime() - maxWindowMs)
  const windowMatches = await prisma.aIRecommendationLog.findMany({
    where: {
      userId: booking.userId,
      clubId: booking.playSession.clubId,
      type: { in: [...ATTRIBUTABLE_TYPES] },
      createdAt: { gte: windowLowerBound, lte: booking.bookedAt },
      bookingId: null,
    },
    select: { id: true, createdAt: true, type: true },
    orderBy: { createdAt: 'desc' },
    take: 25,
  })
  for (const rec of windowMatches) {
    const typeWindow = ATTRIBUTION_WINDOW_MS[rec.type] ?? DEFAULT_WINDOW_MS
    if (booking.bookedAt.getTime() - rec.createdAt.getTime() <= typeWindow) {
      candidates.push({ id: rec.id, method: 'time_window', createdAt: rec.createdAt, type: rec.type })
    }
  }

  return candidates
}

/**
 * Pick the single best candidate.
 *
 * Rules:
 *   1. Highest method priority (deep_link > direct > time_window).
 *   2. Within a method, most-recent createdAt wins (fresher signal is
 *      more likely to have actually influenced the user).
 */
function pickBest<T extends { id: string; method: AttributionMethod; createdAt: Date }>(
  candidates: T[],
): T | null {
  if (candidates.length === 0) return null
  return [...candidates].sort((a, b) => {
    const priorityDelta = METHOD_PRIORITY[b.method] - METHOD_PRIORITY[a.method]
    if (priorityDelta !== 0) return priorityDelta
    return b.createdAt.getTime() - a.createdAt.getTime()
  })[0]
}

/**
 * Attribute a booking to the best matching AI recommendation (if any).
 *
 * Idempotent: if the booking is already attributed (has aiAttribution)
 * or no candidate qualifies, returns null without modifying anything.
 *
 * Race-safe: the partial unique index on booking_id means if two concurrent
 * attribution attempts both pick candidates for the same booking, exactly
 * one wins — the other hits a unique-violation and we swallow it.
 */
export async function attributeBooking(
  prisma: PrismaClient,
  input: { bookingId: string; explicitRecId?: string | null },
): Promise<AttributionResult | null> {
  const booking = await prisma.playSessionBooking.findUnique({
    where: { id: input.bookingId },
    select: {
      id: true,
      userId: true,
      sessionId: true,
      status: true,
      bookedAt: true,
      user: { select: { email: true } },
      playSession: {
        select: { id: true, clubId: true, pricePerSlot: true },
      },
    },
  })

  if (!booking) return null
  if (booking.status !== 'CONFIRMED') return null

  // Exclude synthetic/placeholder users — attribution on demo.iqsport.ai
  // etc. would be meaningless (these are Piqle-owned test addresses, not
  // real members). Keeps the ROI dashboard honest in mixed environments.
  if (booking.user?.email && isTestEmail(booking.user.email)) return null

  // Idempotency — if any recommendation already points at this booking, we're done.
  const existing = await prisma.aIRecommendationLog.findFirst({
    where: { bookingId: input.bookingId },
    select: { id: true, attributionMethod: true, linkedBookingValue: true },
  })
  if (existing) {
    return {
      logId: existing.id,
      method: (existing.attributionMethod as AttributionMethod) || 'time_window',
      valueUsd: existing.linkedBookingValue != null ? Number(existing.linkedBookingValue) : null,
    }
  }

  const candidates = await findAttributionCandidates(prisma, booking as BookingForAttribution, {
    explicitRecId: input.explicitRecId,
  })
  const best = pickBest(candidates)
  if (!best) return null

  const valueUsd = await computeBookingValueUsd(prisma, booking as BookingForAttribution)

  try {
    await prisma.aIRecommendationLog.update({
      where: { id: best.id },
      data: {
        bookingId: booking.id,
        linkedAt: new Date(),
        linkedBookingValue: valueUsd,
        attributionMethod: best.method,
      },
    })
    return { logId: best.id, method: best.method, valueUsd }
  } catch (err) {
    // Unique violation → another concurrent attribution already linked
    // this booking to a different recommendation. That's fine — the
    // partial unique index is protecting us from double-counting.
    const msg = (err as Error).message || ''
    if (msg.includes('Unique constraint') || msg.includes('booking_unique')) {
      log.info?.(`[attribution] race lost for booking ${booking.id}`)
      return null
    }
    throw err
  }
}

/**
 * Batch back-fill for bookings that predate the attribution service.
 *
 * Walks CONFIRMED bookings in [since, now] that have no attribution yet,
 * and attempts to link each. Safe to run repeatedly — idempotent per-booking.
 *
 * Intended for a one-shot catch-up run after deploy, or as a daily cron
 * that picks up bookings the live hooks missed (e.g. cold-start failures).
 */
export async function runAttributionBackfill(
  prisma: PrismaClient,
  opts: { clubId?: string; sinceMs?: number; limit?: number } = {},
): Promise<{ scanned: number; linked: number; byMethod: Record<AttributionMethod, number> }> {
  const since = new Date(Date.now() - (opts.sinceMs ?? 30 * DAY_MS))
  const limit = opts.limit ?? 500

  const bookings: Array<{ id: string; clubId: string }> = await prisma.$queryRawUnsafe(
    `
    SELECT b.id, ps."clubId" AS "clubId"
    FROM play_session_bookings b
    JOIN play_sessions ps ON ps.id = b."sessionId"
    LEFT JOIN ai_recommendation_logs arl ON arl.booking_id = b.id
    WHERE b.status::text = 'CONFIRMED'
      AND b."bookedAt" >= $1
      AND arl.id IS NULL
      ${opts.clubId ? 'AND ps."clubId" = $2' : ''}
    ORDER BY b."bookedAt" DESC
    LIMIT ${limit}
    `,
    since,
    ...(opts.clubId ? [opts.clubId] : []),
  )

  const byMethod: Record<AttributionMethod, number> = {
    deep_link: 0,
    direct_session_match: 0,
    time_window: 0,
  }
  let linked = 0
  for (const row of bookings) {
    const result = await attributeBooking(prisma, { bookingId: row.id })
    if (result) {
      linked++
      byMethod[result.method]++
    }
  }

  return { scanned: bookings.length, linked, byMethod }
}

// ── Exported for tests ──
export const __test = {
  pickBest,
  ATTRIBUTION_WINDOW_MS,
  DEFAULT_WINDOW_MS,
  METHOD_PRIORITY,
  ATTRIBUTABLE_TYPES,
}
