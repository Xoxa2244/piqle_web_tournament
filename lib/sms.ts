import twilio from 'twilio'

const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN
const fromNumber = process.env.TWILIO_PHONE_NUMBER
const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID

const client =
  accountSid && authToken ? twilio(accountSid, authToken) : null

/**
 * Send an SMS message via Twilio.
 * Falls back to console.log if Twilio credentials are not configured.
 *
 * When `logId` is provided, Twilio will POST delivery status updates
 * to our webhook endpoint at /api/webhooks/twilio, allowing us to
 * track delivered/failed/undelivered statuses in AIRecommendationLog.
 */
/** Validate E.164 phone format: +{1-3 digits}{4-14 digits} */
const E164_RE = /^\+[1-9]\d{4,14}$/

export async function sendSms({
  to,
  body,
  logId,
}: {
  to: string
  body: string
  /** AIRecommendationLog.id — enables delivery status tracking via webhook */
  logId?: string
}): Promise<{ status: string; sid: string }> {
  // Validate phone number format before attempting to send
  if (!E164_RE.test(to)) {
    console.warn(`[SMS] Invalid phone number format (not E.164): ${to}`)
    return { status: 'invalid_phone', sid: '' }
  }

  if (!client || (!fromNumber && !messagingServiceSid)) {
    console.log(`[SMS MOCK] To: ${to}\n  Body: ${body}`)
    return { status: 'mock', sid: 'mock_sid' }
  }

  // Build statusCallback URL for delivery tracking
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
  const appUrl = baseUrl
    ? (baseUrl.startsWith('http') ? baseUrl.replace(/\/$/, '') : `https://${baseUrl}`)
    : null

  // Prefer Messaging Service (required for A2P 10DLC compliance)
  const createParams: any = { body, to }
  if (messagingServiceSid) {
    createParams.messagingServiceSid = messagingServiceSid
  } else {
    createParams.from = fromNumber
  }

  // Only add statusCallback if we have a valid URL and logId
  if (appUrl && logId) {
    createParams.statusCallback = `${appUrl}/api/webhooks/twilio?logId=${encodeURIComponent(logId)}`
  }

  const msg = await client.messages.create(createParams)

  return { status: msg.status, sid: msg.sid }
}

/**
 * Check if Twilio is configured and ready to send SMS.
 */
export function isTwilioConfigured(): boolean {
  return !!client && !!(messagingServiceSid || fromNumber)
}

/**
 * Build an SMS message for member reactivation.
 */
/**
 * Build an SMS message for slot filler invite.
 */
export function buildSlotFillerSms({
  memberName,
  clubName,
  sessionTitle,
  sessionDate,
  sessionTime,
  spotsLeft,
  bookingUrl,
  customMessage,
}: {
  memberName: string
  clubName: string
  sessionTitle: string
  sessionDate: string
  sessionTime: string
  spotsLeft: number
  bookingUrl: string
  customMessage?: string
}): string {
  if (customMessage) {
    return `${customMessage} Join now: ${bookingUrl}`
  }
  const name = memberName.split(' ')[0] || 'there'
  return (
    `Hey ${name}! You're invited to ${sessionTitle} at ${clubName} ` +
    `on ${sessionDate}, ${sessionTime}. ` +
    `${spotsLeft} spot${spotsLeft !== 1 ? 's' : ''} left. ` +
    `Join now: ${bookingUrl}`
  )
}

/**
 * Build an SMS message for member reactivation.
 */
export function buildReactivationSms({
  memberName,
  clubName,
  daysSinceLastActivity,
  sessionCount,
  bookingUrl,
  customMessage,
}: {
  memberName: string
  clubName: string
  daysSinceLastActivity: number
  sessionCount: number
  bookingUrl: string
  customMessage?: string
}): string {
  if (customMessage) {
    return `${customMessage} Book now: ${bookingUrl}`
  }
  const name = memberName.split(' ')[0] || 'there'
  return (
    `Hey ${name}! We miss you at ${clubName}. ` +
    `It's been ${daysSinceLastActivity} days since your last session. ` +
    `We have ${sessionCount} upcoming session${sessionCount !== 1 ? 's' : ''} that match your level. ` +
    `Book now: ${bookingUrl}`
  )
}
