/**
 * Unsubscribe Token Utility
 *
 * Generates and verifies HMAC-SHA256 signed tokens for email unsubscribe links.
 * Token format: base64url(userId:clubId:timestamp:signature)
 *
 * Per-club: each token is scoped to a specific userId + clubId pair.
 * Uses CRON_SECRET as HMAC key.
 */

import { createHmac, timingSafeEqual } from 'crypto'
import { getPlatformBaseUrl } from '@/lib/platform-base-url'

function getHmacKey(): string {
  const key = process.env.CRON_SECRET
  if (!key) throw new Error('CRON_SECRET is not set — required for unsubscribe tokens')
  return key
}

function toBase64Url(str: string): string {
  return Buffer.from(str).toString('base64url')
}

function fromBase64Url(b64: string): string {
  return Buffer.from(b64, 'base64url').toString('utf-8')
}

function sign(data: string): string {
  return createHmac('sha256', getHmacKey()).update(data).digest('base64url')
}

export function generateUnsubscribeToken(userId: string, clubId: string): string {
  const ts = Math.floor(Date.now() / 1000)
  const payload = `${userId}:${clubId}:${ts}`
  const sig = sign(payload)
  return toBase64Url(`${payload}:${sig}`)
}

export function verifyUnsubscribeToken(token: string): { userId: string; clubId: string; ts: number } | null {
  try {
    const decoded = fromBase64Url(token)
    const parts = decoded.split(':')
    if (parts.length < 4) return null

    // Signature is the last part; userId may contain colons (unlikely but safe)
    const sig = parts[parts.length - 1]
    const ts = parseInt(parts[parts.length - 2], 10)
    const clubId = parts[parts.length - 3]
    const userId = parts.slice(0, parts.length - 3).join(':')

    if (!userId || !clubId || isNaN(ts)) return null

    const payload = `${userId}:${clubId}:${ts}`
    const expectedSig = sign(payload)

    // Constant-time comparison
    const sigBuf = Buffer.from(sig)
    const expectedBuf = Buffer.from(expectedSig)
    if (sigBuf.length !== expectedBuf.length) return null
    if (!timingSafeEqual(sigBuf, expectedBuf)) return null

    return { userId, clubId, ts }
  } catch {
    return null
  }
}

function getAppBaseUrl(explicitBaseUrl?: string | null): string {
  return getPlatformBaseUrl(explicitBaseUrl)
}

export function generateUnsubscribeUrl(userId: string, clubId: string, explicitBaseUrl?: string | null): string {
  const token = generateUnsubscribeToken(userId, clubId)
  return `${getAppBaseUrl(explicitBaseUrl)}/api/unsubscribe?token=${token}`
}
