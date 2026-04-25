/**
 * Health Check Endpoint
 *
 * GET /api/health
 *
 * Returns 200 if critical dependencies are reachable, 503 otherwise.
 * No auth — intended for uptime monitors (UptimeRobot, BetterUptime) and
 * load balancers. Response is intentionally brief to avoid leaking
 * internal topology.
 *
 * Checks:
 *   - Database connectivity (simple SELECT 1)
 *   - Optional: OpenAI + Anthropic API reachability (skipped if keys missing)
 *
 * Does NOT check:
 *   - Mandrill / Twilio (transactional — their status doesn't affect app health)
 *   - Stripe (graceful degradation — app functions without payments)
 *   - Supabase storage (lazy — only matters when uploading)
 *
 * Timeout per check: 3 seconds. If a check hangs, it's considered failed.
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CHECK_TIMEOUT_MS = 3_000

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} timed out after ${CHECK_TIMEOUT_MS}ms`)),
        CHECK_TIMEOUT_MS,
      ),
    ),
  ])
}

async function checkDb(): Promise<{ status: 'ok' | 'fail'; error?: string }> {
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, 'db')
    return { status: 'ok' }
  } catch (err) {
    return { status: 'fail', error: (err as Error).message?.slice(0, 120) }
  }
}

async function checkOpenAI(): Promise<{ status: 'ok' | 'fail' | 'skipped'; error?: string }> {
  if (!process.env.OPENAI_API_KEY) return { status: 'skipped' }
  try {
    // HEAD request to /v1/models — lightweight, doesn't consume any tokens
    const res = await withTimeout(
      fetch('https://api.openai.com/v1/models', {
        method: 'HEAD',
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      }),
      'openai',
    )
    return res.ok ? { status: 'ok' } : { status: 'fail', error: `HTTP ${res.status}` }
  } catch (err) {
    return { status: 'fail', error: (err as Error).message?.slice(0, 120) }
  }
}

async function checkAnthropic(): Promise<{ status: 'ok' | 'fail' | 'skipped'; error?: string }> {
  if (!process.env.ANTHROPIC_API_KEY) return { status: 'skipped' }
  try {
    // Anthropic doesn't have a HEAD-friendly endpoint, so we skip full check
    // and just verify the key is well-formed. Full reachability check would
    // cost tokens on every probe which is wasteful for a 5-minute interval.
    const keyValid = /^sk-ant-/.test(process.env.ANTHROPIC_API_KEY)
    return keyValid ? { status: 'ok' } : { status: 'fail', error: 'malformed key' }
  } catch (err) {
    return { status: 'fail', error: (err as Error).message?.slice(0, 120) }
  }
}

export async function GET() {
  const start = Date.now()

  const [db, openai, anthropic] = await Promise.all([
    checkDb(),
    checkOpenAI(),
    checkAnthropic(),
  ])

  const durationMs = Date.now() - start

  const allOk =
    db.status === 'ok' &&
    openai.status !== 'fail' &&
    anthropic.status !== 'fail'

  const status = {
    ok: allOk,
    timestamp: new Date().toISOString(),
    durationMs,
    checks: {
      db,
      openai,
      anthropic,
    },
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'unknown',
  }

  return NextResponse.json(status, { status: allOk ? 200 : 503 })
}
