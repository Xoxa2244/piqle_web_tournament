/**
 * Cron Route Wrapper
 *
 * Standardizes the pattern for Vercel cron endpoints:
 *   1. Require Authorization: Bearer CRON_SECRET
 *   2. Capture exceptions to Sentry tagged with cron job name
 *   3. Log start + duration + outcome
 *   4. Return structured JSON with timing
 *
 * Usage:
 *   export const POST = cronHandler('agent-events', async () => {
 *     return await detectEventsForAllClubs()
 *   })
 *
 * Before this wrapper, each cron did its own auth + error handling,
 * and failures returned 500 silently — no Sentry, no alerting. This
 * means a failed daily job could go unnoticed for days. The wrapper
 * gives us one bottleneck to instrument.
 */

import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { cronLogger as log } from '@/lib/logger'

export interface CronResult {
  success: boolean
  durationMs: number
  result?: unknown
  error?: string
}

export function cronHandler(
  name: string,
  handler: (request: Request) => Promise<unknown>,
) {
  return async (request: Request): Promise<Response> => {
    // Auth: Vercel cron sends Bearer CRON_SECRET
    const secret = process.env.CRON_SECRET
    if (!secret) {
      log.error({ cron: name }, 'CRON_SECRET not configured — refusing to run')
      return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
    }

    const auth = request.headers.get('authorization') || ''
    const expected = `Bearer ${secret}`
    if (auth !== expected) {
      // Don't leak timing info about the secret — constant-time is overkill here
      // since we're not protecting against online brute force (Vercel handles that)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const start = Date.now()
    log.info({ cron: name, event: 'start' }, `[cron:${name}] starting`)

    try {
      const result = await handler(request)
      const durationMs = Date.now() - start

      log.info(
        { cron: name, event: 'success', durationMs },
        `[cron:${name}] completed in ${durationMs}ms`,
      )

      // Breadcrumb for later correlation if something else fails after this
      Sentry.addBreadcrumb({
        category: 'cron',
        message: `${name} completed`,
        level: 'info',
        data: { durationMs },
      })

      return NextResponse.json({
        success: true,
        durationMs,
        result,
      } satisfies CronResult)
    } catch (error) {
      const durationMs = Date.now() - start
      const errorMessage = (error as Error).message?.slice(0, 500) || 'Unknown error'

      log.error(
        { cron: name, event: 'error', durationMs, err: errorMessage },
        `[cron:${name}] failed after ${durationMs}ms`,
      )

      // Capture to Sentry with structured tags — these cron failures must NOT be silent
      Sentry.captureException(error, {
        tags: { cron: name, type: 'cron_failure' },
        extra: { durationMs, url: request.url },
      })

      return NextResponse.json(
        {
          success: false,
          durationMs,
          error: errorMessage,
        } satisfies CronResult,
        { status: 500 },
      )
    }
  }
}
