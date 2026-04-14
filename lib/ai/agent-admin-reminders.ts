export type AdminReminderChannel = 'email' | 'sms'

type ReminderMetadata = Record<string, unknown>

function parseDateValue(value: unknown): Date | null {
  if (typeof value !== 'string') return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function getAdminReminderDue(metadata: unknown, now = new Date()) {
  const data = (metadata && typeof metadata === 'object' ? metadata : {}) as ReminderMetadata
  const remindAt = parseDateValue(data.remindAt)
  const remindLabel = typeof data.remindLabel === 'string' ? data.remindLabel : null

  if (!remindAt) {
    return {
      due: false,
      remindAt: null as Date | null,
      remindLabel,
    }
  }

  return {
    due: remindAt.getTime() <= now.getTime(),
    remindAt,
    remindLabel,
  }
}

export function shouldSendAdminReminderChannel(
  metadata: unknown,
  channel: AdminReminderChannel,
  now = new Date(),
) {
  const dueState = getAdminReminderDue(metadata, now)
  if (!dueState.due || !dueState.remindAt) return false

  const data = (metadata && typeof metadata === 'object' ? metadata : {}) as ReminderMetadata
  const sentAt = parseDateValue(
    channel === 'email' ? data.emailReminderSentAt : data.smsReminderSentAt,
  )

  if (!sentAt) return true
  return sentAt.getTime() < dueState.remindAt.getTime()
}

export function withAdminReminderChannelResult(
  metadata: unknown,
  channel: AdminReminderChannel,
  payload: { sentAt?: string; error?: string | null },
) {
  const data = { ...((metadata && typeof metadata === 'object' ? metadata : {}) as ReminderMetadata) }
  const sentKey = channel === 'email' ? 'emailReminderSentAt' : 'smsReminderSentAt'
  const errorKey = channel === 'email' ? 'emailReminderError' : 'smsReminderError'

  if (payload.sentAt) {
    data[sentKey] = payload.sentAt
    delete data[errorKey]
  } else if (payload.error) {
    data[errorKey] = payload.error
  }

  data.externalReminderUpdatedAt = new Date().toISOString()
  return data
}

export function toAbsoluteAppUrl(href: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'http://localhost:3000'
  const normalizedBase = baseUrl.startsWith('http') ? baseUrl.replace(/\/$/, '') : `https://${baseUrl}`
  if (href.startsWith('http://') || href.startsWith('https://')) return href
  return `${normalizedBase}${href.startsWith('/') ? href : `/${href}`}`
}

export function buildAdminReminderEmail(input: {
  title: string
  clubName: string
  description?: string | null
  targetUrl: string
}) {
  const subject = `Reminder from ${input.clubName}: ${input.title}`
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;">
          <tr>
            <td style="background:#ffffff;border-radius:16px;padding:28px 24px;box-shadow:0 1px 3px rgba(15,23,42,0.12);">
              <p style="margin:0 0 10px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#8b5cf6;font-weight:700;">
                IQSport Agent Reminder
              </p>
              <h1 style="margin:0 0 14px;font-size:22px;line-height:1.25;color:#0f172a;">${input.title}</h1>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#475569;">
                ${input.description || `A snoozed admin task for ${input.clubName} is ready again.`}
              </p>
              <div style="margin-top:20px;">
                <a href="${input.targetUrl}" style="display:inline-block;background:linear-gradient(135deg,#8b5cf6,#06b6d4);color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-size:14px;font-weight:700;">
                  Open in IQSport
                </a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  return { subject, html }
}

export function buildAdminReminderSms(input: {
  title: string
  clubName: string
  targetUrl: string
}) {
  return `IQSport: Reminder for ${input.clubName} — ${input.title}. Open: ${input.targetUrl}`
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 320)
}
