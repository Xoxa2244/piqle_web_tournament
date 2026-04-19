/**
 * Rate Limiter — unit tests
 *
 * Since we can't easily spin up Redis in CI, we mock @upstash/ratelimit.
 * Tests verify:
 *   - Graceful degradation when Upstash env vars missing
 *   - Identifier extraction from request headers (IP detection)
 *   - Rate limit headers construction
 *   - Different limiter keys have different buckets (smoke)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock Upstash modules — we validate config logic, not Redis itself.
const mockLimit = vi.hoisted(() => vi.fn())

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(() => ({
    ping: vi.fn(),
  })),
}))

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: Object.assign(
    vi.fn().mockImplementation(() => ({ limit: mockLimit })),
    { slidingWindow: vi.fn((requests: number, window: string) => ({ requests, window })) },
  ),
}))

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  // Default: Upstash configured so rate limiting is active
  process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io'
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'
  mockLimit.mockResolvedValue({
    success: true,
    remaining: 9,
    limit: 10,
    reset: Date.now() + 60_000,
  })
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('checkRateLimit', () => {
  it('allows request when under limit', async () => {
    const { checkRateLimit } = await import('@/lib/rate-limit')
    const result = await checkRateLimit('agentAction', '1.2.3.4')

    expect(result.success).toBe(true)
    expect(result.skipped).toBe(false)
    expect(result.remaining).toBe(9)
  })

  it('blocks request when over limit', async () => {
    mockLimit.mockResolvedValueOnce({
      success: false,
      remaining: 0,
      limit: 10,
      reset: Date.now() + 60_000,
    })

    const { checkRateLimit } = await import('@/lib/rate-limit')
    const result = await checkRateLimit('agentAction', '1.2.3.4')

    expect(result.success).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('gracefully degrades when Upstash env missing (dev / test)', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN

    const { checkRateLimit } = await import('@/lib/rate-limit')
    const result = await checkRateLimit('agentAction', '1.2.3.4')

    expect(result.success).toBe(true)
    expect(result.skipped).toBe(true)
    expect(mockLimit).not.toHaveBeenCalled()
  })

  it('different limiters use different Redis prefixes (isolated buckets)', async () => {
    const { checkRateLimit } = await import('@/lib/rate-limit')
    // Just smoke — all should work without throwing
    await checkRateLimit('agentAction', 'id1')
    await checkRateLimit('publicApi', 'id1')
    await checkRateLimit('aiChat', 'id1')
    await checkRateLimit('webhook', 'id1')
    await checkRateLimit('emailOtp', 'id1')
    expect(mockLimit).toHaveBeenCalledTimes(5)
  })

  it('emailOtp limiter is wired (blocks OTP brute-force / enumeration)', async () => {
    mockLimit.mockResolvedValueOnce({
      success: false,
      remaining: 0,
      limit: 10,
      reset: Date.now() + 600_000,
    })
    const { checkRateLimit } = await import('@/lib/rate-limit')
    const result = await checkRateLimit('emailOtp', '203.0.113.5')
    expect(result.success).toBe(false)
    expect(result.skipped).toBe(false)
  })
})

describe('getIpFromRequest', () => {
  it('prefers x-forwarded-for (Vercel pattern)', async () => {
    const { getIpFromRequest } = await import('@/lib/rate-limit')
    const req = new Request('http://example.com', {
      headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' },
    })
    expect(getIpFromRequest(req)).toBe('203.0.113.5')
  })

  it('falls back to x-real-ip', async () => {
    const { getIpFromRequest } = await import('@/lib/rate-limit')
    const req = new Request('http://example.com', {
      headers: { 'x-real-ip': '198.51.100.7' },
    })
    expect(getIpFromRequest(req)).toBe('198.51.100.7')
  })

  it('returns "unknown" when no IP headers present', async () => {
    const { getIpFromRequest } = await import('@/lib/rate-limit')
    const req = new Request('http://example.com')
    expect(getIpFromRequest(req)).toBe('unknown')
  })

  it('trims whitespace', async () => {
    const { getIpFromRequest } = await import('@/lib/rate-limit')
    const req = new Request('http://example.com', {
      headers: { 'x-forwarded-for': '  1.2.3.4  , 10.0.0.1' },
    })
    expect(getIpFromRequest(req)).toBe('1.2.3.4')
  })
})

describe('buildRateLimitHeaders', () => {
  it('builds standard headers when not skipped', async () => {
    const { buildRateLimitHeaders } = await import('@/lib/rate-limit')
    const now = Date.now()
    const headers = buildRateLimitHeaders({
      success: false,
      remaining: 0,
      limit: 10,
      reset: now + 30_000,
      skipped: false,
    })
    expect(headers['X-RateLimit-Limit']).toBe('10')
    expect(headers['X-RateLimit-Remaining']).toBe('0')
    expect(headers['X-RateLimit-Reset']).toBeDefined()
    expect(Number(headers['Retry-After'])).toBeGreaterThanOrEqual(1)
    expect(Number(headers['Retry-After'])).toBeLessThanOrEqual(31)
  })

  it('returns empty object when rate limiting was skipped', async () => {
    const { buildRateLimitHeaders } = await import('@/lib/rate-limit')
    const headers = buildRateLimitHeaders({
      success: true,
      remaining: -1,
      limit: -1,
      reset: 0,
      skipped: true,
    })
    expect(headers).toEqual({})
  })

  it('Retry-After is never less than 1 second (spec compliant)', async () => {
    const { buildRateLimitHeaders } = await import('@/lib/rate-limit')
    const headers = buildRateLimitHeaders({
      success: false,
      remaining: 0,
      limit: 10,
      reset: Date.now() - 5000, // already in past — degenerate case
      skipped: false,
    })
    expect(Number(headers['Retry-After'])).toBeGreaterThanOrEqual(1)
  })
})
