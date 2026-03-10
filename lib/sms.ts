import twilio from 'twilio'

const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN
const fromNumber = process.env.TWILIO_PHONE_NUMBER

const client =
  accountSid && authToken ? twilio(accountSid, authToken) : null

/**
 * Send an SMS message via Twilio.
 * Falls back to console.log if Twilio credentials are not configured.
 */
export async function sendSms({
  to,
  body,
}: {
  to: string
  body: string
}): Promise<{ status: string; sid: string }> {
  if (!client || !fromNumber) {
    console.log(`[SMS MOCK] To: ${to}\n  Body: ${body}`)
    return { status: 'mock', sid: 'mock_sid' }
  }

  const msg = await client.messages.create({
    body,
    from: fromNumber,
    to,
  })

  return { status: msg.status, sid: msg.sid }
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
