import nodemailer from 'nodemailer'
import { emailLogger as log } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { buildClubFromAddress } from '@/lib/email-sending-domain'

const smtpHost = process.env.SMTP_HOST || process.env.EMAIL_SERVER_HOST
const smtpPort = Number(process.env.SMTP_PORT || process.env.EMAIL_SERVER_PORT || 587)
const smtpUser = process.env.SMTP_USER || process.env.EMAIL_SERVER_USER || 'IQSport'
const smtpPass = process.env.SMTP_PASS || process.env.EMAIL_SERVER_PASSWORD
const smtpSecure =
  (process.env.SMTP_SECURE || '').toLowerCase() === 'true' || smtpPort === 465
const fromEmail = process.env.SMTP_FROM || process.env.EMAIL_FROM
const fromName = process.env.SMTP_FROM_NAME || 'IQSport'

if (!smtpHost || !smtpPass || !fromEmail) {
  log.error('[Email] Missing SMTP env vars')
}

const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpSecure,
  auth: smtpPass
    ? {
        user: smtpUser,
        pass: smtpPass,
      }
    : undefined,
})

const fromHeader = fromName ? `"${fromName}" <${fromEmail}>` : fromEmail

/** Block emails to placeholder/demo/test addresses — prevents Mandrill reputation damage */
export const BLOCKED_EMAIL_DOMAINS = ['placeholder.iqsport.ai', 'demo.iqsport.ai', 'test.iqsport.ai', 'example.com']

export function isBlockedEmail(to: string): boolean {
  const domain = to.split('@')[1]?.toLowerCase()
  return BLOCKED_EMAIL_DOMAINS.some(d => domain === d || domain?.endsWith('.' + d))
}

/**
 * Metadata passed through to Mandrill — survives in webhook payloads as msg.metadata,
 * enabling webhook events (open, click, bounce) to be correlated back to our DB logs.
 * CRITICAL: without log_id, webhooks cannot match events to AIRecommendationLog records.
 */
export interface EmailMetadata {
  /** AIRecommendationLog.id — primary key for webhook correlation */
  logId?: string
  /** Club this email belongs to */
  clubId?: string
  /** User receiving the email */
  userId?: string
  /** Campaign variant for A/B testing */
  variantId?: string
}

export interface SafeSendMailOptions {
  to: string
  from?: string
  subject: string
  html?: string
  text?: string
  /** Metadata for webhook correlation — pass logId to enable Mandrill event tracking */
  metadata?: EmailMetadata
  /** Mandrill tags for filtering in Mandrill dashboard */
  tags?: string[]
}

/**
 * Resolves the effective From: address for a send.
 *
 * Precedence:
 *   1. If opts.metadata.clubId is present AND the club has a verified
 *      + enabled custom sending domain → use campaigns@mail.theirclub.com.
 *   2. Otherwise → fall back to the platform default (noreply@iqsport.ai).
 *
 * Silent-fail by design: a DB lookup error here must not block the send.
 * The fallback is already a valid From address.
 */
async function resolveFromAddress(
  opts: SafeSendMailOptions,
): Promise<{ email: string; name: string }> {
  const defaultFrom = {
    email: fromEmail || 'noreply@iqsport.ai',
    name: fromName || 'IQSport',
  }
  const clubId = opts.metadata?.clubId
  if (!clubId) return defaultFrom

  try {
    const club = await prisma.club.findUnique({
      where: { id: clubId },
      select: {
        name: true,
        sendingDomain: true,
        sendingDomainEnabled: true,
        sendingDomainVerifiedAt: true,
        sendingDomainFromName: true,
        sendingDomainLocalPart: true,
      },
    })
    if (!club) return defaultFrom
    const custom = buildClubFromAddress(club)
    if (custom) return { email: custom.fromEmail, name: custom.fromName }
  } catch (err) {
    // Don't fail the send over a From-resolution glitch — just log.
    log.warn?.(`[Email] From-address resolve failed for club ${clubId}: ${(err as Error).message?.slice(0, 120)}`)
  }
  return defaultFrom
}

/** Wraps email sending with blocked email guard + Mandrill fallback */
async function safeSendMail(opts: SafeSendMailOptions) {
  const to = opts.to
  if (isBlockedEmail(to)) {
    log.warn(`[Email] Blocked send to ${to} (placeholder/demo address)`)
    return { messageId: `blocked-${Date.now()}` }
  }

  // Resolve per-send From: — may be club-custom, may be platform default.
  const effectiveFrom = await resolveFromAddress(opts)

  // Primary: Mandrill API (if configured)
  const mandrillKey = process.env.MAILCHIMP_TRANSACTIONAL_API_KEY
  if (mandrillKey) {
    try {
      // Build Mandrill metadata — survives through webhooks for correlation
      const mandrillMetadata: Record<string, string> | undefined = opts.metadata
        ? {
            ...(opts.metadata.logId ? { log_id: opts.metadata.logId } : {}),
            ...(opts.metadata.clubId ? { club_id: opts.metadata.clubId } : {}),
            ...(opts.metadata.userId ? { user_id: opts.metadata.userId } : {}),
            ...(opts.metadata.variantId ? { variant_id: opts.metadata.variantId } : {}),
          }
        : undefined

      const res = await fetch('https://mandrillapp.com/api/1.0/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: mandrillKey,
          message: {
            from_email: effectiveFrom.email,
            from_name: effectiveFrom.name,
            to: [{ email: to, type: 'to' }],
            subject: opts.subject,
            html: opts.html,
            text: opts.text,
            // Enable tracking — required for open/click webhook events
            track_opens: true,
            track_clicks: true,
            // Metadata: critical for webhook → DB correlation
            ...(mandrillMetadata && Object.keys(mandrillMetadata).length > 0
              ? { metadata: mandrillMetadata }
              : {}),
            // Tags: useful for Mandrill dashboard filtering
            ...(opts.tags && opts.tags.length > 0 ? { tags: opts.tags } : {}),
          },
        }),
      })
      const data = await res.json()
      if (data[0]?.status === 'rejected') {
        log.error(`[Email] Mandrill rejected: ${to} — ${data[0].reject_reason}`)
      }
      return { messageId: data[0]?._id || `mandrill-${Date.now()}` }
    } catch (err) {
      log.error(`[Email] Mandrill failed for ${to}:`, (err as Error).message)
      // Fall through to SMTP
    }
  }

  // Fallback: SMTP (nodemailer) — no metadata support, but at least email gets delivered
  if (smtpHost && smtpPass) {
    // Honor the club-custom From: even on the SMTP path. Needs a
    // properly-formatted "Name" <email> header so nodemailer doesn't
    // append the SMTP auth user by default.
    const smtpFrom = opts.from
      || (effectiveFrom.name ? `"${effectiveFrom.name}" <${effectiveFrom.email}>` : effectiveFrom.email)
      || fromHeader
    const info = await transporter.sendMail({
      to: opts.to,
      from: smtpFrom,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    })
    return { messageId: info.messageId }
  }

  log.error(`[Email] No email provider configured — cannot send to ${to}`)
  return { messageId: `no-provider-${Date.now()}` }
}

const getAppBaseUrl = () => {
  const env = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
  if (!env) return 'http://localhost:3000'
  return env.startsWith('http') ? env.replace(/\/$/, '') : `https://${env}`
}

const buildOtpEmailHtml = (code: string, ttlMinutes: number) => {
  const baseUrl = getAppBaseUrl()
  const logoUrl = `${baseUrl}/iqsport-email-logo.png`

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your IQSport verification code</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb; line-height: 1.6; color: #111827;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f9fafb;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px; margin: 0 auto;">
          <tr>
            <td align="center" style="padding-bottom: 24px;">
              <img src="${logoUrl}" alt="Logo" width="120" height="40" style="display: block; max-width: 120px; height: auto;" />
            </td>
          </tr>
          <tr>
            <td style="background: #ffffff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); overflow: hidden;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding: 28px 24px 20px; text-align: center;">
                    <p style="margin: 0 0 12px; font-size: 15px; color: #6b7280;">Use this code to complete your registration</p>
                    <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #111827;">Verification code</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 0 24px 24px; text-align: center;">
                    <div style="display: inline-block; padding: 14px 20px; border-radius: 10px; border: 1px solid #e5e7eb; background: #f8fafc; font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #111827;">
                      ${code}
                    </div>
                    <p style="margin: 16px 0 0; font-size: 14px; color: #4b5563;">
                      This code expires in <strong>${ttlMinutes} minute${ttlMinutes === 1 ? '' : 's'}</strong>.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 18px 24px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                      If you did not request this code, you can safely ignore this email.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `
}

// ── Reactivation Email ──

interface SuggestedSessionInfo {
  title: string
  date: string
  startTime: string
  endTime: string
  format: string
  spotsLeft: number
  confirmedCount?: number
  sameLevelCount?: number
  deepLinkUrl?: string
}

function buildReactivationEmailHtml({
  memberName,
  clubName,
  daysSinceLastActivity,
  suggestedSessions,
  bookingUrl,
  customMessage,
  notifyMeUrl,
}: {
  memberName: string
  clubName: string
  daysSinceLastActivity: number
  suggestedSessions: SuggestedSessionInfo[]
  bookingUrl: string
  customMessage?: string
  notifyMeUrl?: string
}) {
  const baseUrl = getAppBaseUrl()
  const logoUrl = `${baseUrl}/iqsport-email-logo.png`
  const firstName = memberName.split(' ')[0] || 'there'
  const formatLabel = (f: string) => f.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  const sessionRows = suggestedSessions
    .slice(0, 3)
    .map(
      (s) => {
        const socialLine = s.sameLevelCount && s.sameLevelCount > 0
          ? `<br/><span style="color: #6b7280; font-size: 12px;">${s.sameLevelCount} player${s.sameLevelCount === 1 ? '' : 's'} at your level signed up</span>`
          : s.confirmedCount && s.confirmedCount > 0
            ? `<br/><span style="color: #6b7280; font-size: 12px;">${s.confirmedCount} player${s.confirmedCount === 1 ? '' : 's'} signed up</span>`
            : ''
        const rowTag = s.deepLinkUrl ? `<a href="${s.deepLinkUrl}" style="display: contents; text-decoration: none; color: inherit;">` : ''
        const rowClose = s.deepLinkUrl ? '</a>' : ''
        return `
      <tr>
        ${rowTag}
        <td style="padding: 10px 12px; font-size: 14px; border-bottom: 1px solid #f0f0f0;">
          <strong>${s.title}</strong><br/>
          <span style="color: #6b7280; font-size: 13px;">
            ${s.date} &middot; ${s.startTime}&ndash;${s.endTime} &middot; ${formatLabel(s.format)}
          </span>${socialLine}
        </td>
        <td style="padding: 10px 12px; font-size: 14px; border-bottom: 1px solid #f0f0f0; text-align: right; white-space: nowrap;">
          <span style="color: ${s.spotsLeft <= 2 ? '#dc2626' : '#16a34a'}; font-weight: 600;">
            ${s.spotsLeft} spot${s.spotsLeft !== 1 ? 's' : ''} left
          </span>
        </td>
        ${rowClose}
      </tr>`
      }
    )
    .join('')

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>We miss you at ${clubName}!</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb; line-height: 1.6; color: #111827;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f9fafb;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px; margin: 0 auto;">
          <tr>
            <td align="center" style="padding-bottom: 24px;">
              <img src="${logoUrl}" alt="Logo" width="120" height="40" style="display: block; max-width: 120px; height: auto;" />
            </td>
          </tr>
          <tr>
            <td style="background: #ffffff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); overflow: hidden;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding: 28px 24px 16px;">
                    <h1 style="margin: 0 0 8px; font-size: 20px; font-weight: 700; color: #111827;">
                      Hey ${firstName}, we miss you! 🏸
                    </h1>
                    <p style="margin: 0; font-size: 15px; color: #4b5563;">
                      ${customMessage || `It&rsquo;s been <strong>${daysSinceLastActivity} days</strong> since your last session at <strong>${clubName}</strong>. We&rsquo;ve got some great sessions coming up that match your level&mdash;come back and play!`}
                    </p>
                  </td>
                </tr>
                ${
                  suggestedSessions.length > 0
                    ? `
                <tr>
                  <td style="padding: 8px 24px 16px;">
                    <p style="margin: 0 0 8px; font-size: 13px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">
                      Recommended for you
                    </p>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                      ${sessionRows}
                    </table>
                  </td>
                </tr>`
                    : ''
                }
                <tr>
                  <td style="padding: 8px 24px 24px; text-align: center;">
                    <a href="${bookingUrl}" style="display: inline-block; padding: 12px 32px; background-color: #111827; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;">
                      Book a Session
                    </a>
                  </td>
                </tr>
                ${notifyMeUrl ? `
                <tr>
                  <td style="padding: 0 24px 24px; text-align: center;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden;">
                      <tr>
                        <td style="padding: 16px 20px;">
                          <p style="margin: 0 0 4px; font-size: 14px; font-weight: 600; color: #111827;">📅 Tell us when you'd like to play</p>
                          <p style="margin: 0 0 12px; font-size: 13px; color: #6b7280;">Select your preferred days, times, and session type — we'll notify you the moment a matching session opens.</p>
                          <a href="${notifyMeUrl}" style="display: inline-block; padding: 10px 24px; background-color: #0891b2; color: #ffffff; font-size: 13px; font-weight: 600; text-decoration: none; border-radius: 8px;">
                            Set my preferences →
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>` : ''}
                <tr>
                  <td style="padding: 16px 24px 20px; text-align: center; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                      You received this because you are a member of ${clubName}.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `
}

export async function sendReactivationEmail({
  to,
  memberName,
  clubName,
  daysSinceLastActivity,
  suggestedSessions,
  bookingUrl,
  customMessage,
  notifyMeUrl,
}: {
  to: string
  memberName: string
  clubName: string
  daysSinceLastActivity: number
  suggestedSessions: SuggestedSessionInfo[]
  bookingUrl: string
  customMessage?: string
  notifyMeUrl?: string
}): Promise<{ messageId: string }> {
  const firstName = memberName.split(' ')[0] || 'there'
  const subject = `${firstName}, we miss you at ${clubName}! 🏸`
  // Send from the club name so recipient sees "IPC East" not "IQSport"
  const clubFrom = `"${clubName}" <${fromEmail}>`
  const text = customMessage
    ? `${customMessage} Book now: ${bookingUrl}${notifyMeUrl ? `\n\nTell us when you'd like to play: ${notifyMeUrl}` : ''}`
    : `Hey ${firstName}! It's been ${daysSinceLastActivity} days since your last session at ${clubName}. We have ${suggestedSessions.length} upcoming sessions that match your level. Book now: ${bookingUrl}${notifyMeUrl ? `\n\nTell us when you'd like to play: ${notifyMeUrl}` : ''}`
  const html = buildReactivationEmailHtml({
    memberName,
    clubName,
    daysSinceLastActivity,
    suggestedSessions,
    bookingUrl,
    customMessage,
    notifyMeUrl,
  })

  const info = await safeSendMail({
    to,
    from: clubFrom,
    subject,
    text,
    html,
  })

  return { messageId: info.messageId }
}

// ── Event Invite Email ──

function buildEventInviteEmailHtml({
  memberName,
  clubName,
  eventTitle,
  eventDate,
  eventTime,
  eventPrice,
  bookingUrl,
  customMessage,
}: {
  memberName: string
  clubName: string
  eventTitle: string
  eventDate: string
  eventTime: string
  eventPrice: number
  bookingUrl: string
  customMessage: string
}) {
  const baseUrl = getAppBaseUrl()
  const logoUrl = `${baseUrl}/iqsport-email-logo.png`

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're invited to ${eventTitle}!</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb; line-height: 1.6; color: #111827;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f9fafb;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px; margin: 0 auto;">
          <tr>
            <td align="center" style="padding-bottom: 24px;">
              <img src="${logoUrl}" alt="Logo" width="120" height="40" style="display: block; max-width: 120px; height: auto;" />
            </td>
          </tr>
          <tr>
            <td style="background: #ffffff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); overflow: hidden;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding: 28px 24px 16px;">
                    <p style="margin: 0; font-size: 15px; color: #4b5563;">
                      ${customMessage}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 24px 16px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                      <tr>
                        <td style="padding: 14px 16px; background: #f8fafc;">
                          <strong style="font-size: 16px; color: #111827;">${eventTitle}</strong><br/>
                          <span style="color: #6b7280; font-size: 14px;">
                            ${eventDate} &middot; ${eventTime} &middot; $${eventPrice}/person
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 24px 24px; text-align: center;">
                    <a href="${bookingUrl}" style="display: inline-block; padding: 12px 32px; background-color: #111827; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;">
                      Reserve Your Spot
                    </a>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 16px 24px 20px; text-align: center; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                      You received this because you are a member of ${clubName}.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `
}

export async function sendEventInviteEmail({
  to,
  memberName,
  clubName,
  eventTitle,
  eventDate,
  eventTime,
  eventPrice,
  bookingUrl,
  customMessage,
}: {
  to: string
  memberName: string
  clubName: string
  eventTitle: string
  eventDate: string
  eventTime: string
  eventPrice: number
  bookingUrl: string
  customMessage: string
}): Promise<{ messageId: string }> {
  const firstName = memberName.split(' ')[0] || 'there'
  const subject = `${firstName}, you're invited to ${eventTitle}! 🎾`
  const text = `${customMessage}\n\n${eventTitle} — ${eventDate}, ${eventTime}. $${eventPrice}/person.\n\nReserve your spot: ${bookingUrl}`
  const html = buildEventInviteEmailHtml({
    memberName,
    clubName,
    eventTitle,
    eventDate,
    eventTime,
    eventPrice,
    bookingUrl,
    customMessage,
  })

  const info = await safeSendMail({
    to,
    from: fromHeader,
    subject,
    text,
    html,
  })

  return { messageId: info.messageId }
}

// ── Slot Filler Invite Email ──

function buildSlotFillerInviteEmailHtml({
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
}) {
  const baseUrl = getAppBaseUrl()
  const logoUrl = `${baseUrl}/iqsport-email-logo.png`
  const firstName = memberName.split(' ')[0] || 'there'

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're invited to ${sessionTitle}!</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb; line-height: 1.6; color: #111827;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f9fafb;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px; margin: 0 auto;">
          <tr>
            <td align="center" style="padding-bottom: 24px;">
              <img src="${logoUrl}" alt="Logo" width="120" height="40" style="display: block; max-width: 120px; height: auto;" />
            </td>
          </tr>
          <tr>
            <td style="background: #ffffff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); overflow: hidden;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding: 28px 24px 16px;">
                    <h1 style="margin: 0 0 8px; font-size: 20px; font-weight: 700; color: #111827;">
                      Hey ${firstName}, join us! 🎾
                    </h1>
                    <p style="margin: 0; font-size: 15px; color: #4b5563;">
                      ${customMessage || `You&rsquo;ve been matched for an upcoming session at <strong>${clubName}</strong>. We think it&rsquo;s a great fit for you!`}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 24px 16px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                      <tr>
                        <td style="padding: 14px 16px; background: #f8fafc;">
                          <strong style="font-size: 16px; color: #111827;">${sessionTitle}</strong><br/>
                          <span style="color: #6b7280; font-size: 14px;">
                            ${sessionDate} &middot; ${sessionTime}
                          </span><br/>
                          <span style="color: ${spotsLeft <= 2 ? '#dc2626' : '#16a34a'}; font-size: 14px; font-weight: 600;">
                            ${spotsLeft} spot${spotsLeft !== 1 ? 's' : ''} left
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 24px 24px; text-align: center;">
                    <a href="${bookingUrl}" style="display: inline-block; padding: 12px 32px; background-color: #111827; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;">
                      Join This Session
                    </a>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 16px 24px 20px; text-align: center; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                      You received this because you are a member of ${clubName}.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `
}

export async function sendSlotFillerInviteEmail({
  to,
  memberName,
  clubName,
  sessionTitle,
  sessionDate,
  sessionTime,
  spotsLeft,
  bookingUrl,
  customMessage,
  customSubject,
  metadata,
}: {
  to: string
  memberName: string
  clubName: string
  sessionTitle: string
  sessionDate: string
  sessionTime: string
  spotsLeft: number
  bookingUrl: string
  customMessage?: string
  customSubject?: string
  /** Metadata for webhook correlation — pass logId to track opens/clicks/bounces */
  metadata?: EmailMetadata
}): Promise<{ messageId: string }> {
  const firstName = memberName.split(' ')[0] || 'there'
  const subject = customSubject || `${firstName}, you're invited to ${sessionTitle}! 🎾`
  const text = customMessage
    ? `${customMessage}\n\n${sessionTitle} — ${sessionDate}, ${sessionTime}. ${spotsLeft} spots left.\n\nJoin now: ${bookingUrl}`
    : `Hey ${firstName}! You've been matched for ${sessionTitle} at ${clubName} on ${sessionDate}, ${sessionTime}. ${spotsLeft} spots left. Join now: ${bookingUrl}`
  const html = buildSlotFillerInviteEmailHtml({
    memberName,
    clubName,
    sessionTitle,
    sessionDate,
    sessionTime,
    spotsLeft,
    bookingUrl,
    customMessage,
  })

  const info = await safeSendMail({
    to,
    from: fromHeader,
    subject,
    text,
    html,
    metadata,
    tags: ['slot-filler', 'outreach'],
  })

  return { messageId: info.messageId }
}

// ── OTP Email ──

export async function sendOtpEmail({
  to,
  code,
  ttlMinutes,
}: {
  to: string
  code: string
  ttlMinutes: number
}) {
  const subject = 'Your IQSport verification code'
  const text = `Your IQSport verification code is: ${code}

This code expires in ${ttlMinutes} minutes.
If you didn't request this, you can ignore this email.`
  const html = buildOtpEmailHtml(code, ttlMinutes)

  await safeSendMail({
    to,
    from: fromHeader,
    subject,
    text,
    html,
  })
}

// ── Health-Based Outreach Email (CHECK_IN / RETENTION_BOOST) ──

export interface OutreachSessionCard {
  title: string
  date: string
  time: string
  format: string
  spotsLeft: number
  confirmedCount: number
  sameLevelCount: number
}

export async function sendOutreachEmail({
  to,
  subject,
  body,
  clubName,
  bookingUrl,
  sessionCard,
  metadata,
  tags,
}: {
  to: string
  subject: string
  body: string
  clubName: string
  bookingUrl: string
  sessionCard?: OutreachSessionCard
  /** Metadata for webhook correlation — pass logId to track opens/clicks/bounces */
  metadata?: EmailMetadata
  /** Mandrill tags for dashboard filtering */
  tags?: string[]
}): Promise<{ messageId: string }> {
  const baseUrl = getAppBaseUrl()
  const logoUrl = `${baseUrl}/iqsport-email-logo.png`
  const text = `${body}\n\nBook now: ${bookingUrl}`

  const formatLabel = (f: string) => f.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  let sessionCardHtml = ''
  if (sessionCard) {
    const socialProofLine = sessionCard.sameLevelCount > 0
      ? `<span style="color: #6b7280; font-size: 13px;">${sessionCard.sameLevelCount} player${sessionCard.sameLevelCount === 1 ? '' : 's'} at your level signed up</span>`
      : sessionCard.confirmedCount > 0
        ? `<span style="color: #6b7280; font-size: 13px;">${sessionCard.confirmedCount} player${sessionCard.confirmedCount === 1 ? '' : 's'} signed up</span>`
        : ''

    sessionCardHtml = `
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; margin: 16px 0;">
                <tr>
                  <td style="padding: 14px 16px; background: #f8fafc;">
                    <strong style="font-size: 16px; color: #111827;">${sessionCard.title}</strong><br/>
                    <span style="color: #6b7280; font-size: 14px;">
                      ${sessionCard.date} &middot; ${sessionCard.time} &middot; ${formatLabel(sessionCard.format)}
                    </span><br/>
                    <span style="color: ${sessionCard.spotsLeft <= 2 ? '#dc2626' : '#16a34a'}; font-size: 14px; font-weight: 600;">
                      ${sessionCard.spotsLeft} spot${sessionCard.spotsLeft !== 1 ? 's' : ''} left
                    </span>
                    ${socialProofLine ? `<br/>${socialProofLine}` : ''}
                  </td>
                </tr>
              </table>`
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb; line-height: 1.6; color: #111827;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f9fafb;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px; margin: 0 auto;">
          <tr>
            <td align="center" style="padding-bottom: 24px;">
              <img src="${logoUrl}" alt="${clubName}" width="48" height="48" style="border-radius: 12px;" />
            </td>
          </tr>
          <tr>
            <td style="background: #fff; border-radius: 16px; padding: 32px 28px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
              ${body.split('\n').map(line => line.trim() ? `<p style="margin: 0 0 12px 0; font-size: 15px;">${line}</p>` : '').join('\n')}
              ${sessionCardHtml}
              <div style="text-align: center; margin-top: 24px;">
                <a href="${bookingUrl}" style="display: inline-block; background: linear-gradient(135deg, #84cc16, #22c55e); color: #fff; padding: 12px 28px; border-radius: 10px; font-size: 15px; font-weight: 600; text-decoration: none;">
                  Book a Session
                </a>
              </div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top: 20px;">
              <p style="font-size: 12px; color: #9ca3af; margin: 0;">
                Sent by ${clubName} via <a href="https://iqsport.ai" style="color: #84cc16; text-decoration: none;">IQSport.ai</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const info = await safeSendMail({
    to,
    from: fromHeader,
    subject,
    text,
    html,
    metadata,
    tags: tags || ['outreach'],
  })

  return { messageId: info.messageId }
}
