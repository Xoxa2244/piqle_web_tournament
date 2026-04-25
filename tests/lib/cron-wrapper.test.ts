/**
 * Cron Wrapper — auth + error capture + structured response
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockCaptureException, mockAddBreadcrumb } = vi.hoisted(() => ({
  mockCaptureException: vi.fn(),
  mockAddBreadcrumb: vi.fn(),
}))

vi.mock('@sentry/nextjs', () => ({
  captureException: mockCaptureException,
  addBreadcrumb: mockAddBreadcrumb,
}))

vi.mock('@/lib/logger', () => ({
  cronLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import { cronHandler } from '@/lib/cron-wrapper'

const CRON_SECRET = 'test-cron-secret-abc123'

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = CRON_SECRET
})

function makeRequest(authHeader?: string): Request {
  const headers = new Headers()
  if (authHeader !== undefined) headers.set('authorization', authHeader)
  return new Request('http://localhost/api/cron/test', { headers })
}

describe('cronHandler', () => {
  it('valid token + success → 200 with result + duration', async () => {
    const handler = cronHandler('test-job', async () => ({ processed: 5 }))
    const res = await handler(makeRequest(`Bearer ${CRON_SECRET}`))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.result).toEqual({ processed: 5 })
    expect(body.durationMs).toBeGreaterThanOrEqual(0)
    expect(mockCaptureException).not.toHaveBeenCalled()
  })

  it('missing auth header → 401 (no handler execution)', async () => {
    const handler = vi.fn().mockResolvedValue({ done: true })
    const wrapped = cronHandler('test-job', handler)

    const res = await wrapped(makeRequest())

    expect(res.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
    expect(mockCaptureException).not.toHaveBeenCalled()
  })

  it('wrong auth token → 401', async () => {
    const handler = vi.fn()
    const wrapped = cronHandler('test-job', handler)

    const res = await wrapped(makeRequest('Bearer wrong-secret'))

    expect(res.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
  })

  it('missing CRON_SECRET in env → 500 (refuses to run)', async () => {
    delete process.env.CRON_SECRET

    const handler = vi.fn()
    const wrapped = cronHandler('test-job', handler)

    const res = await wrapped(makeRequest('Bearer whatever'))

    expect(res.status).toBe(500)
    expect(handler).not.toHaveBeenCalled()
  })

  it('handler throws → 500 + Sentry capture with cron tag', async () => {
    const err = new Error('DB connection lost')
    const handler = cronHandler('agent-events', async () => {
      throw err
    })

    const res = await handler(makeRequest(`Bearer ${CRON_SECRET}`))

    expect(res.status).toBe(500)
    expect(mockCaptureException).toHaveBeenCalledTimes(1)
    expect(mockCaptureException).toHaveBeenCalledWith(
      err,
      expect.objectContaining({
        tags: expect.objectContaining({ cron: 'agent-events', type: 'cron_failure' }),
      }),
    )

    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error).toContain('DB connection lost')
  })

  it('success adds breadcrumb (for later error correlation)', async () => {
    const handler = cronHandler('daily-health', async () => 'done')
    await handler(makeRequest(`Bearer ${CRON_SECRET}`))

    expect(mockAddBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'cron',
        message: expect.stringContaining('daily-health'),
      }),
    )
  })

  it('long error messages are truncated to 500 chars in response', async () => {
    const longErr = new Error('X'.repeat(1000))
    const handler = cronHandler('test', async () => {
      throw longErr
    })

    const res = await handler(makeRequest(`Bearer ${CRON_SECRET}`))
    const body = await res.json()

    expect(body.error.length).toBeLessThanOrEqual(500)
  })
})
