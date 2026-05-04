/**
 * Micro-survey response endpoint — /api/surveys/respond?logId=X&option=Y
 *
 * Covers:
 *   • Missing/invalid query params → 400 with friendly HTML
 *   • Unknown option → 400 (defensive against a copy-paste mistake)
 *   • logId not found in DB → 404 (link expired / log purged)
 *   • Happy path → upsert called, 200 with thank-you HTML
 *   • Re-click on same email → upsert overwrites option (idempotent)
 *   • DB error → 500 with friendly retry message
 *   • surveyType derivation from log type + reasoning.day12Variant
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mock Prisma ──
const { mockFindUnique, mockUpsert } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockUpsert: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    aIRecommendationLog: { findUnique: mockFindUnique },
    microSurveyResponse: { upsert: mockUpsert },
  },
}))

import { GET } from '@/app/api/surveys/respond/route'

beforeEach(() => {
  vi.clearAllMocks()
  mockFindUnique.mockResolvedValue({
    id: 'log-abc',
    userId: 'user-1',
    clubId: 'club-1',
    type: 'NEW_MEMBER_WELCOME',
    reasoning: { day12Variant: 'survey' },
  })
  mockUpsert.mockResolvedValue({ id: 'response-1' })
})

function makeRequest(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/surveys/respond?${query}`)
}

describe('GET /api/surveys/respond > validation', () => {
  it('missing logId → 400', async () => {
    const res = await GET(makeRequest('option=schedule'))
    expect(res.status).toBe(400)
    expect(mockUpsert).not.toHaveBeenCalled()
    const body = await res.text()
    expect(body).toContain('Missing details')
  })

  it('missing option → 400', async () => {
    const res = await GET(makeRequest('logId=log-abc'))
    expect(res.status).toBe(400)
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('unknown option → 400', async () => {
    const res = await GET(makeRequest('logId=log-abc&option=elephant'))
    expect(res.status).toBe(400)
    expect(mockUpsert).not.toHaveBeenCalled()
    const body = await res.text()
    expect(body).toContain('Unknown option')
  })

  it('option case-insensitive (lowercases input)', async () => {
    await GET(makeRequest('logId=log-abc&option=SCHEDULE'))
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ option: 'schedule' }),
      }),
    )
  })

  it('logId is trimmed (strips accidental whitespace)', async () => {
    await GET(makeRequest('logId=%20log-abc%20&option=schedule'))
    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'log-abc' } }),
    )
  })
})

describe('GET /api/surveys/respond > log lookup', () => {
  it('log not found → 404 with friendly message', async () => {
    mockFindUnique.mockResolvedValue(null)

    const res = await GET(makeRequest('logId=missing-log&option=schedule'))

    expect(res.status).toBe(404)
    expect(mockUpsert).not.toHaveBeenCalled()
    const body = await res.text()
    expect(body).toContain('Link expired')
  })

  it('DB lookup throws → 500 with retry message', async () => {
    mockFindUnique.mockRejectedValue(new Error('connection lost'))

    const res = await GET(makeRequest('logId=log-abc&option=schedule'))

    expect(res.status).toBe(500)
    expect(mockUpsert).not.toHaveBeenCalled()
    const body = await res.text()
    expect(body).toContain('Something went wrong')
  })
})

describe('GET /api/surveys/respond > happy path', () => {
  it('records response with derived surveyType=onboarding_day12', async () => {
    const res = await GET(makeRequest('logId=log-abc&option=schedule'))

    expect(res.status).toBe(200)
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { logId: 'log-abc' },
      create: {
        logId: 'log-abc',
        userId: 'user-1',
        clubId: 'club-1',
        surveyType: 'onboarding_day12',
        option: 'schedule',
      },
      update: {
        option: 'schedule',
        respondedAt: expect.any(Date),
      },
    })
    const body = await res.text()
    expect(body).toContain('Got it')
  })

  it('all 5 newcomer Day-12 options accepted', async () => {
    for (const opt of ['schedule', 'level', 'partners', 'price', 'other']) {
      vi.clearAllMocks()
      mockFindUnique.mockResolvedValue({
        id: 'log-abc',
        userId: 'user-1',
        clubId: 'club-1',
        type: 'NEW_MEMBER_WELCOME',
        reasoning: { day12Variant: 'survey' },
      })
      mockUpsert.mockResolvedValue({ id: 'response-1' })

      const res = await GET(makeRequest(`logId=log-abc&option=${opt}`))

      expect(res.status).toBe(200)
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ option: opt }),
        }),
      )
    }
  })

  it('falls back surveyType=lowercase(log.type) when reasoning lacks day12Variant', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'log-xyz',
      userId: 'user-1',
      clubId: 'club-1',
      type: 'REACTIVATION',
      reasoning: { source: 'something_else' },
    })

    await GET(makeRequest('logId=log-xyz&option=schedule'))

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ surveyType: 'reactivation' }),
      }),
    )
  })

  it('upsert update path overwrites option on re-click (idempotent)', async () => {
    // Test that the update payload changes option — Prisma resolves which
    // path runs by checking the unique key, so we just verify both halves
    // of the upsert spec carry the new option.
    await GET(makeRequest('logId=log-abc&option=price'))

    expect(mockUpsert).toHaveBeenCalledWith({
      where: { logId: 'log-abc' },
      create: expect.objectContaining({ option: 'price' }),
      update: expect.objectContaining({ option: 'price' }),
    })
  })

  it('upsert throws → 500 with retry message (not 200)', async () => {
    mockUpsert.mockRejectedValue(new Error('unique violation race'))

    const res = await GET(makeRequest('logId=log-abc&option=schedule'))

    expect(res.status).toBe(500)
  })
})
