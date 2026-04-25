/**
 * API Route Wrapper — Sentry capture for regular API routes
 *
 * Analogous to cron-wrapper, but for non-cron endpoints: no auth enforcement,
 * and instead of crons returning structured {success, duration} JSON, regular
 * API routes respond with whatever the handler returns. We just intercept
 * uncaught exceptions to:
 *   1. Capture to Sentry with route-specific tags
 *   2. Log structured server-side
 *   3. Return a sanitized 500 response (no stack traces to clients)
 *
 * Usage:
 *   export const POST = withApi('ai-advisor-action', async (req) => {
 *     // your handler, throw freely
 *     const result = await doStuff()
 *     return NextResponse.json(result)
 *   })
 *
 * Before this wrapper: most API routes had bare try/catch with console.error
 * only. Uncaught exceptions flashed past without reaching Sentry — issues
 * could persist for days without anyone noticing.
 */

import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { logger } from '@/lib/logger'

type Handler<T = Request> = (request: T, context?: any) => Promise<Response>

export interface WithApiOptions {
  /** Short route identifier for Sentry tags (e.g., 'ai-advisor', 'upload-avatar') */
  name: string
  /** Override default 500 error response message (default: 'Internal server error') */
  errorMessage?: string
  /** When true (default), capture ALL errors. When false, only 5xx-worthy ones. */
  captureAll?: boolean
}

/**
 * Wrap an API route handler with Sentry error capture + structured logging.
 *
 * Re-throws nothing — always returns a Response. Uncaught errors become
 * 500 with a sanitized body, and get reported to Sentry with route tags.
 */
export function withApi(
  nameOrOptions: string | WithApiOptions,
  handler: Handler<Request>,
): Handler<Request> {
  const options: WithApiOptions =
    typeof nameOrOptions === 'string' ? { name: nameOrOptions } : nameOrOptions

  const { name, errorMessage = 'Internal server error', captureAll = true } = options

  return async (request: Request, context?: any): Promise<Response> => {
    const start = Date.now()
    try {
      const response = await handler(request, context)
      return response
    } catch (error) {
      const durationMs = Date.now() - start
      const err = error as Error
      const errMsg = err.message?.slice(0, 500) || 'Unknown error'

      logger.error(
        {
          module: 'api',
          route: name,
          url: request.url,
          method: request.method,
          durationMs,
          err: errMsg,
          stack: err.stack?.slice(0, 2000),
        },
        `[api:${name}] unhandled error (${durationMs}ms)`,
      )

      if (captureAll) {
        Sentry.captureException(error, {
          tags: { api_route: name, type: 'api_error' },
          extra: {
            url: request.url,
            method: request.method,
            durationMs,
          },
        })
      }

      return NextResponse.json(
        {
          error: errorMessage,
          // Don't leak internal error details in production
          ...(process.env.NODE_ENV !== 'production' ? { detail: errMsg } : {}),
        },
        { status: 500 },
      )
    }
  }
}
