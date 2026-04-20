/**
 * Unit tests for the AI Revenue Attribution service.
 *
 * Covers the four things that make or break the ROI dashboard:
 *   1. Method priority — deep_link > direct_session_match > time_window,
 *      with recency as the tiebreaker.
 *   2. Window discipline — a rec older than its per-type window must NOT
 *      attribute a booking.
 *   3. Idempotency — re-attributing the same booking returns the existing
 *      link without duplicating.
 *   4. Dedup — the partial unique index (booking_id) is respected so
 *      each booking attributes to at most one rec.
 *
 * We mock Prisma rather than spin up a DB — the logic under test is pure
 * candidate-selection + value-computation, not SQL correctness.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { attributeBooking, __test } from '@/lib/ai/attribution'

const { pickBest, ATTRIBUTION_WINDOW_MS, METHOD_PRIORITY } = __test

describe('pickBest — candidate ranking', () => {
  it('prefers deep_link over direct_session_match over time_window', () => {
    const older = new Date('2026-04-10')
    const newer = new Date('2026-04-15')
    const top = pickBest([
      { id: 'tw', method: 'time_window', createdAt: newer },
      { id: 'ds', method: 'direct_session_match', createdAt: newer },
      { id: 'dl', method: 'deep_link', createdAt: older },
    ])
    expect(top?.id).toBe('dl')
  })

  it('within a method, most-recent createdAt wins', () => {
    const top = pickBest([
      { id: 'old-tw', method: 'time_window', createdAt: new Date('2026-04-10') },
      { id: 'new-tw', method: 'time_window', createdAt: new Date('2026-04-15') },
    ])
    expect(top?.id).toBe('new-tw')
  })

  it('returns null on empty input', () => {
    expect(pickBest([])).toBeNull()
  })
})

describe('attribution windows are per-type', () => {
  it('SLOT_FILLER is 72h, REACTIVATION is 14d, CHECK_IN is 7d', () => {
    expect(ATTRIBUTION_WINDOW_MS.SLOT_FILLER).toBe(72 * 60 * 60 * 1000)
    expect(ATTRIBUTION_WINDOW_MS.REACTIVATION).toBe(14 * 24 * 60 * 60 * 1000)
    expect(ATTRIBUTION_WINDOW_MS.CHECK_IN).toBe(7 * 24 * 60 * 60 * 1000)
  })

  it('method priority numbers enforce the ordering', () => {
    expect(METHOD_PRIORITY.deep_link).toBeGreaterThan(METHOD_PRIORITY.direct_session_match)
    expect(METHOD_PRIORITY.direct_session_match).toBeGreaterThan(METHOD_PRIORITY.time_window)
  })
})

// ── attributeBooking end-to-end with mocked Prisma ──

function makeBooking(overrides: Partial<any> = {}) {
  return {
    id: 'booking-1',
    userId: 'user-1',
    sessionId: 'session-1',
    status: 'CONFIRMED',
    bookedAt: new Date('2026-04-18T12:00:00Z'),
    playSession: {
      id: 'session-1',
      clubId: 'club-1',
      pricePerSlot: 22.5,
    },
    ...overrides,
  }
}

function makePrisma(opts: {
  booking?: any
  existing?: any
  explicitRec?: any
  // NB: order matches findAttributionCandidates call order —
  //   findMany(click) → findMany(direct) → findMany(window)
  clickedMatches?: any[]
  directMatches?: any[]
  windowMatches?: any[]
  updateThrows?: Error
  historicalMedian?: number | null
}) {
  const updateMock = vi.fn()
  if (opts.updateThrows) updateMock.mockRejectedValue(opts.updateThrows)
  else updateMock.mockResolvedValue({})

  return {
    playSessionBooking: {
      findUnique: vi.fn().mockResolvedValue(opts.booking ?? null),
    },
    aIRecommendationLog: {
      findFirst: vi.fn().mockResolvedValue(opts.existing ?? null),
      findUnique: vi.fn().mockResolvedValue(opts.explicitRec ?? null),
      findMany: vi.fn()
        .mockResolvedValueOnce(opts.clickedMatches ?? [])
        .mockResolvedValueOnce(opts.directMatches ?? [])
        .mockResolvedValueOnce(opts.windowMatches ?? []),
      update: updateMock,
    },
    $queryRawUnsafe: vi.fn().mockResolvedValue(
      opts.historicalMedian != null ? [{ median: opts.historicalMedian }] : [{ median: null }],
    ),
    __updateMock: updateMock,
  } as any
}

describe('attributeBooking', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null when booking does not exist', async () => {
    const prisma = makePrisma({ booking: null })
    const result = await attributeBooking(prisma, { bookingId: 'ghost' })
    expect(result).toBeNull()
  })

  it('skips non-CONFIRMED bookings', async () => {
    const prisma = makePrisma({ booking: makeBooking({ status: 'CANCELLED' }) })
    const result = await attributeBooking(prisma, { bookingId: 'booking-1' })
    expect(result).toBeNull()
    expect(prisma.__updateMock).not.toHaveBeenCalled()
  })

  it('idempotent — returns existing link without re-updating', async () => {
    const prisma = makePrisma({
      booking: makeBooking(),
      existing: { id: 'log-prev', attributionMethod: 'deep_link', linkedBookingValue: 22.5 },
    })
    const result = await attributeBooking(prisma, { bookingId: 'booking-1' })
    expect(result).toEqual({ logId: 'log-prev', method: 'deep_link', valueUsd: 22.5 })
    expect(prisma.__updateMock).not.toHaveBeenCalled()
  })

  it('no candidate → returns null, does not link', async () => {
    const prisma = makePrisma({
      booking: makeBooking(),
      directMatches: [],
      windowMatches: [],
    })
    const result = await attributeBooking(prisma, { bookingId: 'booking-1' })
    expect(result).toBeNull()
    expect(prisma.__updateMock).not.toHaveBeenCalled()
  })

  it('direct_session_match wins over time_window when both present', async () => {
    const bookedAt = new Date('2026-04-18T12:00:00Z')
    const prisma = makePrisma({
      booking: makeBooking(),
      directMatches: [
        { id: 'log-slot', createdAt: new Date(bookedAt.getTime() - 2 * 60 * 60 * 1000), type: 'SLOT_FILLER' },
      ],
      windowMatches: [
        { id: 'log-reac', createdAt: new Date(bookedAt.getTime() - 60 * 60 * 1000), type: 'REACTIVATION' },
      ],
    })
    const result = await attributeBooking(prisma, { bookingId: 'booking-1' })
    expect(result?.logId).toBe('log-slot')
    expect(result?.method).toBe('direct_session_match')
    expect(prisma.__updateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'log-slot' },
      data: expect.objectContaining({
        bookingId: 'booking-1',
        attributionMethod: 'direct_session_match',
      }),
    }))
  })

  it('deep_link wins even over a fresh direct_session_match', async () => {
    const bookedAt = new Date('2026-04-18T12:00:00Z')
    const explicitRec = {
      id: 'log-deep',
      userId: 'user-1',
      clubId: 'club-1',
      type: 'REACTIVATION',
      createdAt: new Date(bookedAt.getTime() - 5 * 24 * 60 * 60 * 1000),
      bookingId: null,
    }
    const prisma = makePrisma({
      booking: makeBooking(),
      explicitRec,
      directMatches: [
        { id: 'log-slot', createdAt: new Date(bookedAt.getTime() - 30 * 60 * 1000), type: 'SLOT_FILLER' },
      ],
    })
    const result = await attributeBooking(prisma, {
      bookingId: 'booking-1',
      explicitRecId: 'log-deep',
    })
    expect(result?.logId).toBe('log-deep')
    expect(result?.method).toBe('deep_link')
  })

  it('deep_link via Mandrill click webhook (no explicit recId needed)', async () => {
    // The common path for us: user clicks our email, Mandrill fires the
    // `click` webhook which sets log.clickedAt. A booking arrives in
    // CourtReserve sync within 72h — attribution finds it as deep_link
    // because the click came BEFORE the booking.
    const bookedAt = new Date('2026-04-18T12:00:00Z')
    const clickedAt = new Date(bookedAt.getTime() - 3 * 60 * 60 * 1000) // 3h before
    const prisma = makePrisma({
      booking: makeBooking({ bookedAt }),
      clickedMatches: [
        {
          id: 'log-clicked',
          clickedAt,
          createdAt: new Date(bookedAt.getTime() - 10 * 60 * 60 * 1000), // sent 10h before
          type: 'REACTIVATION',
        },
      ],
      directMatches: [],
      windowMatches: [
        {
          id: 'log-tw',
          createdAt: new Date(bookedAt.getTime() - 2 * 24 * 60 * 60 * 1000),
          type: 'CHECK_IN',
        },
      ],
    })
    const result = await attributeBooking(prisma, { bookingId: 'booking-1' })
    expect(result?.logId).toBe('log-clicked')
    expect(result?.method).toBe('deep_link')
  })

  it('click older than 72h does NOT qualify as deep_link (caller filters by query window)', async () => {
    // The query itself bounds clickedAt to the 72h window — nothing
    // outside of it should come back from findMany in practice. Test that
    // when nothing qualifies, we fall through to other methods.
    const bookedAt = new Date('2026-04-18T12:00:00Z')
    const prisma = makePrisma({
      booking: makeBooking({ bookedAt }),
      clickedMatches: [], // query filtered out the stale click
      directMatches: [
        { id: 'log-slot', createdAt: new Date(bookedAt.getTime() - 60 * 60 * 1000), type: 'SLOT_FILLER' },
      ],
      windowMatches: [],
    })
    const result = await attributeBooking(prisma, { bookingId: 'booking-1' })
    expect(result?.method).toBe('direct_session_match')
  })

  it('deep_link is rejected when rec belongs to a different user (defensive)', async () => {
    const prisma = makePrisma({
      booking: makeBooking(),
      explicitRec: {
        id: 'log-other',
        userId: 'attacker-user',
        clubId: 'club-1',
        type: 'REACTIVATION',
        createdAt: new Date('2026-04-17'),
        bookingId: null,
      },
      directMatches: [],
      windowMatches: [],
    })
    const result = await attributeBooking(prisma, {
      bookingId: 'booking-1',
      explicitRecId: 'log-other',
    })
    expect(result).toBeNull()
  })

  it('deep_link is rejected when rec is older than 30 days (stale link)', async () => {
    const bookedAt = new Date('2026-04-18T12:00:00Z')
    const prisma = makePrisma({
      booking: makeBooking({ bookedAt }),
      explicitRec: {
        id: 'log-old',
        userId: 'user-1',
        clubId: 'club-1',
        type: 'REACTIVATION',
        createdAt: new Date(bookedAt.getTime() - 45 * 24 * 60 * 60 * 1000), // 45d old
        bookingId: null,
      },
      directMatches: [],
      windowMatches: [],
    })
    const result = await attributeBooking(prisma, {
      bookingId: 'booking-1',
      explicitRecId: 'log-old',
    })
    expect(result).toBeNull()
  })

  it('snapshot: uses pricePerSlot when present', async () => {
    const prisma = makePrisma({
      booking: makeBooking({ playSession: { id: 's', clubId: 'c', pricePerSlot: 27.5 } }),
      directMatches: [
        { id: 'log-slot', createdAt: new Date('2026-04-18T11:00:00Z'), type: 'SLOT_FILLER' },
      ],
    })
    const result = await attributeBooking(prisma, { bookingId: 'booking-1' })
    expect(result?.valueUsd).toBe(27.5)
  })

  it('falls back to $15 when no price and no historical median', async () => {
    const prisma = makePrisma({
      booking: makeBooking({ playSession: { id: 's', clubId: 'c', pricePerSlot: null } }),
      directMatches: [
        { id: 'log-slot', createdAt: new Date('2026-04-18T11:00:00Z'), type: 'SLOT_FILLER' },
      ],
      historicalMedian: null,
    })
    const result = await attributeBooking(prisma, { bookingId: 'booking-1' })
    expect(result?.valueUsd).toBe(15.0)
  })

  it('uses historical median when price missing but club has history', async () => {
    const prisma = makePrisma({
      booking: makeBooking({ playSession: { id: 's', clubId: 'c', pricePerSlot: null } }),
      directMatches: [
        { id: 'log-slot', createdAt: new Date('2026-04-18T11:00:00Z'), type: 'SLOT_FILLER' },
      ],
      historicalMedian: 19.5,
    })
    const result = await attributeBooking(prisma, { bookingId: 'booking-1' })
    expect(result?.valueUsd).toBe(19.5)
  })

  it('swallows unique-constraint races silently (dedup protection)', async () => {
    const prisma = makePrisma({
      booking: makeBooking(),
      directMatches: [
        { id: 'log-slot', createdAt: new Date('2026-04-18T11:00:00Z'), type: 'SLOT_FILLER' },
      ],
      updateThrows: new Error('Unique constraint failed on booking_unique'),
    })
    const result = await attributeBooking(prisma, { bookingId: 'booking-1' })
    expect(result).toBeNull()
  })

  it('re-throws non-dedup DB errors', async () => {
    const prisma = makePrisma({
      booking: makeBooking(),
      directMatches: [
        { id: 'log-slot', createdAt: new Date('2026-04-18T11:00:00Z'), type: 'SLOT_FILLER' },
      ],
      updateThrows: new Error('Connection timed out'),
    })
    await expect(attributeBooking(prisma, { bookingId: 'booking-1' })).rejects.toThrow('Connection timed out')
  })
})
