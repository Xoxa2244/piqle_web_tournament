/**
 * Generate HMAC-signed URLs for agent digest email actions
 */
import { createHmac } from 'crypto'

function generateToken(actionId: string, clubId: string): string {
  const secret = process.env.CRON_SECRET || 'fallback-dev-secret'
  return createHmac('sha256', secret).update(`${actionId}:${clubId}`).digest('hex').slice(0, 32)
}

export function makeApproveUrl(actionId: string, clubId: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.iqsport.ai'
  const token = generateToken(actionId, clubId)
  return `${baseUrl}/api/agent/approve?id=${actionId}&token=${token}`
}

export function makeSkipUrl(actionId: string, clubId: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.iqsport.ai'
  const token = generateToken(actionId, clubId)
  return `${baseUrl}/api/agent/skip?id=${actionId}&token=${token}`
}

export function makeSnoozeUrl(actionId: string, clubId: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.iqsport.ai'
  const token = generateToken(actionId, clubId)
  return `${baseUrl}/api/agent/snooze?id=${actionId}&token=${token}`
}
