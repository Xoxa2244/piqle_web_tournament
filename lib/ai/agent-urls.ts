/**
 * Generate HMAC-signed URLs for agent digest email actions
 */
import { createHmac } from 'crypto'
import { getPlatformBaseUrl } from '@/lib/platform-base-url'

function generateToken(actionId: string, clubId: string): string {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    throw new Error('CRON_SECRET environment variable is required')
  }
  // Use full SHA256 hash (64 hex chars) for maximum entropy
  return createHmac('sha256', secret).update(`${actionId}:${clubId}`).digest('hex')
}

export function makeApproveUrl(actionId: string, clubId: string): string {
  const baseUrl = getPlatformBaseUrl()
  const token = generateToken(actionId, clubId)
  return `${baseUrl}/api/agent/approve?id=${actionId}&token=${token}`
}

export function makeSkipUrl(actionId: string, clubId: string): string {
  const baseUrl = getPlatformBaseUrl()
  const token = generateToken(actionId, clubId)
  return `${baseUrl}/api/agent/skip?id=${actionId}&token=${token}`
}

export function makeSnoozeUrl(actionId: string, clubId: string): string {
  const baseUrl = getPlatformBaseUrl()
  const token = generateToken(actionId, clubId)
  return `${baseUrl}/api/agent/snooze?id=${actionId}&token=${token}`
}
