/**
 * API Wrapper — tests for withApi
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockCaptureException } = vi.hoisted(() => ({
  mockCaptureException: vi.fn(),
}))

vi.mock('@sentry/nextjs', () => ({
  captureException: mockCaptureException,
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { withApi } from '@/lib/api-wrapper'
import { NextResponse } from 'next/server'

beforeEach(() => {
  vi.clearAllMocks()
})

function makeRequest(): Request {
  return new Request('http://localhost/api/test', { method: 'POST' })
}

describe('withApi', () => {
  it('passes through successful responses unchanged', async () => {
    const handler = withApi('test-route', async () => {
      return NextResponse.json({ hello: 'world' })
    })

    const res = await handler(makeRequest())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ hello: 'world' })
    expect(mockCaptureException).not.toHaveBeenCalled()
  })

  it('catches uncaught errors, returns 500, captures to Sentry', async () => {
    const err = new Error('DB connection lost')
    const handler = withApi('upload-avatar', async () => {
      throw err
    })

    const res = await handler(makeRequest())

    expect(res.status).toBe(500)
    expect(mockCaptureException).toHaveBeenCalledTimes(1)
    expect(mockCaptureException).toHaveBeenCalledWith(
      err,
      expect.objectContaining({
        tags: expect.objectContaining({
          api_route: 'upload-avatar',
          type: 'api_error',
        }),
      }),
    )
  })

  it('500 response contains generic message in production', async () => {
    const originalEnv = process.env.NODE_ENV
    // @ts-ignore
    process.env.NODE_ENV = 'production'

    const handler = withApi('test', async () => {
      throw new Error('Secret internal detail')
    })

    const res = await handler(makeRequest())
    const body = await res.json()

    expect(body.error).toBe('Internal server error')
    expect(body.detail).toBeUndefined() // MUST NOT leak in prod

    // @ts-ignore
    process.env.NODE_ENV = originalEnv
  })

  it('500 response includes detail in development', async () => {
    const originalEnv = process.env.NODE_ENV
    // @ts-ignore
    process.env.NODE_ENV = 'development'

    const handler = withApi('test', async () => {
      throw new Error('Useful dev detail')
    })

    const res = await handler(makeRequest())
    const body = await res.json()

    expect(body.detail).toContain('Useful dev detail')

    // @ts-ignore
    process.env.NODE_ENV = originalEnv
  })

  it('accepts options object with custom error message', async () => {
    const handler = withApi(
      { name: 'ai-chat', errorMessage: 'AI service temporarily unavailable' },
      async () => {
        throw new Error('OpenAI 503')
      },
    )

    const res = await handler(makeRequest())
    const body = await res.json()

    expect(body.error).toBe('AI service temporarily unavailable')
  })

  it('captureAll: false skips Sentry capture (for expected errors)', async () => {
    const handler = withApi(
      { name: 'test', captureAll: false },
      async () => {
        throw new Error('user input invalid')
      },
    )

    const res = await handler(makeRequest())

    expect(res.status).toBe(500)
    expect(mockCaptureException).not.toHaveBeenCalled()
  })

  it('Sentry extra context includes url, method, duration', async () => {
    const handler = withApi('test', async () => {
      throw new Error('boom')
    })

    await handler(makeRequest())

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          url: 'http://localhost/api/test',
          method: 'POST',
          durationMs: expect.any(Number),
        }),
      }),
    )
  })

  it('long error messages are truncated to 500 chars', async () => {
    const handler = withApi('test', async () => {
      throw new Error('X'.repeat(2000))
    })

    const res = await handler(makeRequest())
    const body = await res.json()

    if (body.detail) {
      expect(body.detail.length).toBeLessThanOrEqual(500)
    }
  })
})
