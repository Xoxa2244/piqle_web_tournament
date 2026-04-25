/**
 * Rate Limiting
 *
 * Backed by Upstash Redis (sliding window). Gracefully degrades when
 * UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are missing —
 * allows all requests through with a dev-mode warning, so local dev
 * and test environments don't need a Redis instance.
 *
 * Production MUST set these env vars. Otherwise rate limiting silently
 * disables and the warning gets buried. We rely on env-validation.ts
 * to catch that. (Add UPSTASH_* to RECOMMENDED_PROD_ENV when we wire
 * this up in prod to force the warning to be visible.)
 */

import { Redis } from '@upstash/redis'
import { Ratelimit } from '@upstash/ratelimit'

const url = process.env.UPSTASH_REDIS_REST_URL
const token = process.env.UPSTASH_REDIS_REST_TOKEN

// Singleton — created lazily on first use, then reused.
let redisSingleton: Redis | null = null

function getRedis(): Redis | null {
  if (redisSingleton) return redisSingleton
  if (!url || !token) return null
  redisSingleton = new Redis({ url, token })
  return redisSingleton
}

// Each limiter is instantiated once with a specific window + prefix.
type LimiterKey = 'agentAction' | 'publicApi' | 'webhook' | 'aiChat' | 'emailOtp'

interface LimiterConfig {
  /** Number of requests allowed within the window */
  requests: number
  /** Window size — Upstash format, e.g. "1 m", "10 s", "1 h" */
  window: Parameters<typeof Ratelimit.slidingWindow>[1]
  /** Redis key prefix — keeps different limiters isolated */
  prefix: string
}

const LIMITER_CONFIGS: Record<LimiterKey, LimiterConfig> = {
  // Agent approve/skip/snooze email links — per-IP attempts
  // 10/min = enough for a user clicking around, blocks brute-force on tokens
  agentAction: { requests: 10, window: '1 m', prefix: 'rl:agent' },

  // Public tRPC queries (tournament scoreboard etc.) — per-IP
  // 60/min = 1 req/sec average, plenty for normal browsing
  publicApi: { requests: 60, window: '1 m', prefix: 'rl:public' },

  // Webhooks (Mandrill/Twilio/Stripe) — per-provider (key = sender)
  // 100/min = handles bursts during campaign sends without dropping events
  webhook: { requests: 100, window: '1 m', prefix: 'rl:webhook' },

  // AI advisor chat — per-user, expensive operations
  // 20/min = prevents runaway chat loops + bot abuse of paid LLM calls
  aiChat: { requests: 20, window: '1 m', prefix: 'rl:ai-chat' },

  // Email OTP — per-IP, covers both /request-code and /signup.
  // 10 / 10 min is tight enough to block enumeration + sender-domain abuse,
  // loose enough for legit users (typo email, re-enter OTP a few times).
  // The DB-level per-email cooldown (EMAIL_OTP_COOLDOWN_MS) is complementary
  // but doesn't help when the attacker rotates email addresses.
  emailOtp: { requests: 10, window: '10 m', prefix: 'rl:email-otp' },
}

const limiters = new Map<LimiterKey, Ratelimit>()

function getLimiter(key: LimiterKey): Ratelimit | null {
  const redis = getRedis()
  if (!redis) return null

  const existing = limiters.get(key)
  if (existing) return existing

  const config = LIMITER_CONFIGS[key]
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(config.requests, config.window),
    prefix: config.prefix,
    analytics: true,
  })
  limiters.set(key, limiter)
  return limiter
}

export interface RateLimitResult {
  /** Whether the request should be allowed */
  success: boolean
  /** Requests remaining in current window */
  remaining: number
  /** Total limit per window */
  limit: number
  /** Unix ms when window resets */
  reset: number
  /** If rate limiting was skipped (redis unavailable) */
  skipped: boolean
}

/**
 * Check if a request is within the rate limit.
 *
 * @param key Which limiter to use (different limits per use case)
 * @param identifier Per-caller key — typically IP or userId. Same identifier
 *                   across calls counts toward the same bucket.
 * @returns RateLimitResult. When Redis is unavailable (e.g. local dev),
 *          returns { success: true, skipped: true } so requests flow through.
 */
export async function checkRateLimit(
  key: LimiterKey,
  identifier: string,
): Promise<RateLimitResult> {
  const limiter = getLimiter(key)

  if (!limiter) {
    // Graceful degradation — log once per process
    if (process.env.NODE_ENV === 'production') {
      // In prod this is a RED FLAG — env-validation should have caught it
      console.error(
        '[rate-limit] Upstash Redis not configured in production — rate limiting DISABLED',
      )
    }
    return {
      success: true,
      remaining: -1,
      limit: -1,
      reset: 0,
      skipped: true,
    }
  }

  const result = await limiter.limit(identifier)
  return {
    success: result.success,
    remaining: result.remaining,
    limit: result.limit,
    reset: result.reset,
    skipped: false,
  }
}

/**
 * Extract a rate-limit identifier from a request.
 * Uses x-forwarded-for (Vercel), falls back to x-real-ip, then to 'unknown'.
 */
export function getIpFromRequest(request: Request): string {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  const xri = request.headers.get('x-real-ip')
  if (xri) return xri.trim()
  return 'unknown'
}

/**
 * Build standard 429 response headers so clients can self-throttle.
 * Per RFC 6585 + common convention (X-RateLimit-*).
 */
export function buildRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  if (result.skipped) return {}
  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.reset / 1000)),
    'Retry-After': String(Math.max(1, Math.ceil((result.reset - Date.now()) / 1000))),
  }
}
