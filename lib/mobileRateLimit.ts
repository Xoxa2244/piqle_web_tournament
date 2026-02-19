import type { NextRequest } from 'next/server'

type RateWindow = {
  count: number
  resetAt: number
  blockedUntil: number | null
}

type RateLimitRule = {
  scope: string
  key: string
  limit: number
  windowMs: number
  blockMs?: number
}

type RateLimitResult = {
  allowed: boolean
  limit: number
  remaining: number
  retryAfterSeconds: number
}

const rateLimitWindows = new Map<string, RateWindow>()

const cleanupExpiredWindows = () => {
  const now = Date.now()
  for (const [key, value] of rateLimitWindows.entries()) {
    const blockedExpired = !value.blockedUntil || value.blockedUntil <= now
    const windowExpired = value.resetAt <= now
    if (blockedExpired && windowExpired) {
      rateLimitWindows.delete(key)
    }
  }
}

const getRateWindowKey = (scope: string, key: string) => `${scope}:${key}`

export const getRequestIp = (req: NextRequest) => {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }

  const realIp = req.headers.get('x-real-ip')
  if (realIp) return realIp

  return 'unknown'
}

export const checkRateLimit = (rule: RateLimitRule): RateLimitResult => {
  if (rateLimitWindows.size > 5000) {
    cleanupExpiredWindows()
  }

  const now = Date.now()
  const mapKey = getRateWindowKey(rule.scope, rule.key)
  const existing = rateLimitWindows.get(mapKey)

  if (!existing || now > existing.resetAt) {
    rateLimitWindows.set(mapKey, {
      count: 1,
      resetAt: now + rule.windowMs,
      blockedUntil: null,
    })
    return {
      allowed: true,
      limit: rule.limit,
      remaining: Math.max(rule.limit - 1, 0),
      retryAfterSeconds: 0,
    }
  }

  if (existing.blockedUntil && now < existing.blockedUntil) {
    return {
      allowed: false,
      limit: rule.limit,
      remaining: 0,
      retryAfterSeconds: Math.ceil((existing.blockedUntil - now) / 1000),
    }
  }

  if (existing.count >= rule.limit) {
    const blockMs = rule.blockMs ?? rule.windowMs
    existing.blockedUntil = now + blockMs
    return {
      allowed: false,
      limit: rule.limit,
      remaining: 0,
      retryAfterSeconds: Math.ceil(blockMs / 1000),
    }
  }

  existing.count += 1
  return {
    allowed: true,
    limit: rule.limit,
    remaining: Math.max(rule.limit - existing.count, 0),
    retryAfterSeconds: 0,
  }
}
