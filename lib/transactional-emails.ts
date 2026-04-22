/**
 * Transactional email templates for IQSport.
 * Welcome, Trial reminders, Payment confirmations, Cancellation.
 */
import { sendHtmlEmail } from './sendTransactionEmail'
import { prisma } from './prisma'
import { getPlatformBaseUrl } from './platform-base-url'

// ── Helpers ──

const getAppBaseUrl = () => getPlatformBaseUrl()

/** Get admin emails for a club */
export async function getClubAdminEmails(clubId: string): Promise<{ email: string; name: string }[]> {
  const admins = await prisma.clubAdmin.findMany({
    where: { clubId },
    include: { user: { select: { email: true, name: true } } },
  })
  return admins
    .map((a) => ({ email: a.user.email, name: a.user.name || '' }))
    .filter((a) => a.email && !a.email.includes('@imported.'))
}

/** Shared email shell — IQSport branded wrapper */
function emailShell(title: string, content: string): string {
  const baseUrl = getAppBaseUrl()
  const logoUrl = `${baseUrl}/iqsport-email-logo.png`
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background-color:#f9fafb;line-height:1.6;color:#111827;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f9fafb;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;">
          <tr><td align="center" style="padding-bottom:24px;">
            <img src="${logoUrl}" alt="IQSport" width="160" height="40" style="display:block;" />
          </td></tr>
          <tr><td style="background:#ffffff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.08);overflow:hidden;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
              ${content}
            </table>
          </td></tr>
          <tr><td style="padding:16px 0;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">IQSport.ai — AI Intelligence for Racquet Sports Clubs</p>
          </td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function ctaButton(text: string, href: string, color = '#111827'): string {
  return `<tr><td style="padding:8px 24px 24px;text-align:center;">
    <a href="${href}" style="display:inline-block;padding:12px 32px;background-color:${color};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">${text}</a>
  </td></tr>`
}

// ── 1. Welcome Email ──

function buildWelcomeHtml(firstName: string): string {
  const baseUrl = getAppBaseUrl()
  return emailShell('Welcome to IQSport!', `
    <tr><td style="padding:28px 24px 12px;">
      <h1 style="margin:0;font-size:22px;font-weight:700;color:#111827;">Welcome to IQSport, ${firstName}!</h1>
      <p style="margin:12px 0 0;font-size:15px;color:#6b7280;">We're excited to have you. Here's how to get started:</p>
    </td></tr>
    <tr><td style="padding:8px 24px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        <tr><td style="padding:12px 0;border-bottom:1px solid #f3f4f6;">
          <span style="display:inline-block;width:28px;height:28px;background:#EEF2FF;border-radius:50%;text-align:center;line-height:28px;font-weight:700;color:#4F46E5;font-size:14px;margin-right:12px;vertical-align:middle;">1</span>
          <span style="font-size:15px;color:#111827;vertical-align:middle;font-weight:500;">Create your club</span>
        </td></tr>
        <tr><td style="padding:12px 0;border-bottom:1px solid #f3f4f6;">
          <span style="display:inline-block;width:28px;height:28px;background:#EEF2FF;border-radius:50%;text-align:center;line-height:28px;font-weight:700;color:#4F46E5;font-size:14px;margin-right:12px;vertical-align:middle;">2</span>
          <span style="font-size:15px;color:#111827;vertical-align:middle;font-weight:500;">Upload your session data</span>
        </td></tr>
        <tr><td style="padding:12px 0;">
          <span style="display:inline-block;width:28px;height:28px;background:#EEF2FF;border-radius:50%;text-align:center;line-height:28px;font-weight:700;color:#4F46E5;font-size:14px;margin-right:12px;vertical-align:middle;">3</span>
          <span style="font-size:15px;color:#111827;vertical-align:middle;font-weight:500;">Get AI-powered insights</span>
        </td></tr>
      </table>
    </td></tr>
    ${ctaButton('Get Started', `${baseUrl}/clubs`)}
  `)
}

export async function sendWelcomeEmail({ to, firstName }: { to: string; firstName: string }) {
  const html = buildWelcomeHtml(firstName)
  await sendHtmlEmail(to, `Welcome to IQSport, ${firstName}! 🎾`, html)
}

// ── 2. Trial Ending Reminder ──

function buildTrialEndingHtml(clubName: string, daysLeft: number, clubId: string): string {
  const baseUrl = getAppBaseUrl()
  return emailShell('Your trial is ending soon', `
    <tr><td style="padding:28px 24px 12px;">
      <h1 style="margin:0;font-size:22px;font-weight:700;color:#111827;">Your trial ends in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}</h1>
      <p style="margin:12px 0 0;font-size:15px;color:#6b7280;">Your free trial for <strong>${clubName}</strong> is ending soon. After the trial, Pro features will be locked:</p>
    </td></tr>
    <tr><td style="padding:8px 24px 16px;">
      <ul style="margin:0;padding:0 0 0 20px;font-size:14px;color:#4b5563;">
        <li style="padding:4px 0;">Slot Filler — AI session recommendations</li>
        <li style="padding:4px 0;">Reactivation — inactive member outreach</li>
        <li style="padding:4px 0;">AI Advisor — smart club insights</li>
        <li style="padding:4px 0;">CSV Import — bulk data upload</li>
      </ul>
    </td></tr>
    <tr><td style="padding:0 24px 8px;">
      <p style="margin:0;font-size:15px;color:#6b7280;">Upgrade now to keep access to all features.</p>
    </td></tr>
    ${ctaButton('Upgrade Now', `${baseUrl}/clubs/${clubId}/intelligence/billing`, '#4F46E5')}
  `)
}

export async function sendTrialEndingEmail({ clubId, clubName, daysLeft }: { clubId: string; clubName: string; daysLeft: number }) {
  const admins = await getClubAdminEmails(clubId)
  const html = buildTrialEndingHtml(clubName, daysLeft, clubId)
  for (const admin of admins) {
    await sendHtmlEmail(admin.email, `Your IQSport trial ends in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`, html)
  }
}

// ── 3. Trial Ended ──

function buildTrialEndedHtml(clubName: string, clubId: string): string {
  const baseUrl = getAppBaseUrl()
  return emailShell('Your trial has ended', `
    <tr><td style="padding:28px 24px 12px;">
      <h1 style="margin:0;font-size:22px;font-weight:700;color:#111827;">Your trial has ended</h1>
      <p style="margin:12px 0 0;font-size:15px;color:#6b7280;">The free trial for <strong>${clubName}</strong> has expired. Pro features are now locked.</p>
    </td></tr>
    <tr><td style="padding:8px 24px 16px;">
      <p style="margin:0;font-size:15px;color:#6b7280;">Your dashboard and basic analytics remain available on the Free plan. To unlock Slot Filler, Reactivation, AI Advisor, and more — choose a plan that fits your club.</p>
    </td></tr>
    ${ctaButton('View Plans', `${baseUrl}/clubs/${clubId}/intelligence/billing`, '#4F46E5')}
  `)
}

export async function sendTrialEndedEmail({ clubId }: { clubId: string }) {
  const club = await prisma.club.findUnique({ where: { id: clubId }, select: { name: true } })
  if (!club) return
  const admins = await getClubAdminEmails(clubId)
  const html = buildTrialEndedHtml(club.name, clubId)
  for (const admin of admins) {
    await sendHtmlEmail(admin.email, 'Your IQSport trial has ended', html)
  }
}

// ── 4. Payment Success ──

function buildPaymentSuccessHtml(opts: {
  clubName: string
  plan: string
  amount: string
  currency: string
  periodEnd: string
  receiptUrl: string | null
  clubId: string
}): string {
  const baseUrl = getAppBaseUrl()
  return emailShell('Payment confirmed', `
    <tr><td style="padding:28px 24px 12px;">
      <div style="text-align:center;margin-bottom:16px;">
        <span style="display:inline-block;width:48px;height:48px;background:#ECFDF5;border-radius:50%;text-align:center;line-height:48px;font-size:24px;">✓</span>
      </div>
      <h1 style="margin:0;font-size:22px;font-weight:700;color:#111827;text-align:center;">Payment confirmed</h1>
      <p style="margin:8px 0 0;font-size:15px;color:#6b7280;text-align:center;">Thank you for your subscription to IQSport.</p>
    </td></tr>
    <tr><td style="padding:8px 24px 16px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f9fafb;border-radius:8px;">
        <tr><td style="padding:16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            <tr>
              <td style="font-size:14px;color:#6b7280;padding:4px 0;">Club</td>
              <td style="font-size:14px;color:#111827;font-weight:600;text-align:right;padding:4px 0;">${opts.clubName}</td>
            </tr>
            <tr>
              <td style="font-size:14px;color:#6b7280;padding:4px 0;">Plan</td>
              <td style="font-size:14px;color:#111827;font-weight:600;text-align:right;padding:4px 0;">${opts.plan}</td>
            </tr>
            <tr>
              <td style="font-size:14px;color:#6b7280;padding:4px 0;">Amount</td>
              <td style="font-size:14px;color:#111827;font-weight:600;text-align:right;padding:4px 0;">${opts.amount} ${opts.currency.toUpperCase()}</td>
            </tr>
            <tr>
              <td style="font-size:14px;color:#6b7280;padding:4px 0;">Next billing</td>
              <td style="font-size:14px;color:#111827;font-weight:600;text-align:right;padding:4px 0;">${opts.periodEnd}</td>
            </tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
    ${opts.receiptUrl ? ctaButton('View Receipt', opts.receiptUrl) : ''}
    ${ctaButton('Go to Dashboard', `${baseUrl}/clubs/${opts.clubId}/intelligence`)}
  `)
}

export async function sendPaymentSuccessEmail({ clubId, plan, amountPaid, currency, periodEnd, receiptUrl }: {
  clubId: string
  plan: string
  amountPaid: number
  currency: string
  periodEnd: Date
  receiptUrl: string | null
}) {
  const club = await prisma.club.findUnique({ where: { id: clubId }, select: { name: true } })
  if (!club) return
  const admins = await getClubAdminEmails(clubId)
  const amount = (amountPaid / 100).toFixed(2)
  const dateStr = periodEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const planName = plan.charAt(0).toUpperCase() + plan.slice(1)
  const html = buildPaymentSuccessHtml({
    clubName: club.name,
    plan: planName,
    amount,
    currency,
    periodEnd: dateStr,
    receiptUrl,
    clubId,
  })
  for (const admin of admins) {
    await sendHtmlEmail(admin.email, `Payment confirmed — IQSport ${planName}`, html)
  }
}

// ── 5. Payment Failed ──

function buildPaymentFailedHtml(opts: {
  clubName: string
  amount: string
  currency: string
  nextAttempt: string | null
  clubId: string
}): string {
  const baseUrl = getAppBaseUrl()
  return emailShell('Payment failed', `
    <tr><td style="padding:28px 24px 12px;">
      <div style="text-align:center;margin-bottom:16px;">
        <span style="display:inline-block;width:48px;height:48px;background:#FEF2F2;border-radius:50%;text-align:center;line-height:48px;font-size:24px;">!</span>
      </div>
      <h1 style="margin:0;font-size:22px;font-weight:700;color:#111827;text-align:center;">Payment failed</h1>
      <p style="margin:8px 0 0;font-size:15px;color:#6b7280;text-align:center;">We couldn't process the payment of <strong>${opts.amount} ${opts.currency.toUpperCase()}</strong> for <strong>${opts.clubName}</strong>.</p>
    </td></tr>
    <tr><td style="padding:8px 24px 16px;">
      <p style="margin:0;font-size:15px;color:#6b7280;">${opts.nextAttempt ? `We'll retry automatically on <strong>${opts.nextAttempt}</strong>. ` : ''}Please update your payment method to avoid losing access to Pro features.</p>
    </td></tr>
    ${ctaButton('Update Payment Method', `${baseUrl}/clubs/${opts.clubId}/intelligence/billing`, '#DC2626')}
  `)
}

export async function sendPaymentFailedEmail({ clubId, amountDue, currency, nextAttempt }: {
  clubId: string
  amountDue: number
  currency: string
  nextAttempt: Date | null
}) {
  const club = await prisma.club.findUnique({ where: { id: clubId }, select: { name: true } })
  if (!club) return
  const admins = await getClubAdminEmails(clubId)
  const amount = (amountDue / 100).toFixed(2)
  const nextStr = nextAttempt ? nextAttempt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null
  const html = buildPaymentFailedHtml({ clubName: club.name, amount, currency, nextAttempt: nextStr, clubId })
  for (const admin of admins) {
    await sendHtmlEmail(admin.email, 'Payment failed — action required', html)
  }
}

// ── 6. Subscription Canceled ──

function buildSubscriptionCanceledHtml(opts: {
  clubName: string
  accessUntil: string | null
  clubId: string
}): string {
  const baseUrl = getAppBaseUrl()
  return emailShell('Subscription canceled', `
    <tr><td style="padding:28px 24px 12px;">
      <h1 style="margin:0;font-size:22px;font-weight:700;color:#111827;">Subscription canceled</h1>
      <p style="margin:12px 0 0;font-size:15px;color:#6b7280;">Your IQSport subscription for <strong>${opts.clubName}</strong> has been canceled.</p>
    </td></tr>
    <tr><td style="padding:8px 24px 16px;">
      ${opts.accessUntil
        ? `<p style="margin:0 0 12px;font-size:15px;color:#6b7280;">You still have access to Pro features until <strong>${opts.accessUntil}</strong>. After that, your club will switch to the Free plan.</p>`
        : `<p style="margin:0 0 12px;font-size:15px;color:#6b7280;">Your club has been switched to the Free plan. Dashboard and basic features remain available.</p>`
      }
      <p style="margin:0;font-size:15px;color:#6b7280;">Changed your mind? You can resubscribe anytime.</p>
    </td></tr>
    ${ctaButton('Resubscribe', `${baseUrl}/clubs/${opts.clubId}/intelligence/billing`, '#4F46E5')}
  `)
}

export async function sendSubscriptionCanceledEmail({ clubId, accessUntil }: {
  clubId: string
  accessUntil: Date | null
}) {
  const club = await prisma.club.findUnique({ where: { id: clubId }, select: { name: true } })
  if (!club) return
  const admins = await getClubAdminEmails(clubId)
  const dateStr = accessUntil ? accessUntil.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null
  const html = buildSubscriptionCanceledHtml({ clubName: club.name, accessUntil: dateStr, clubId })
  for (const admin of admins) {
    await sendHtmlEmail(admin.email, 'Your IQSport subscription has been canceled', html)
  }
}

// ── 7. Member Data Notice (for club to send to members after connecting integration) ──

function buildMemberDataNoticeHtml(clubName: string): string {
  const baseUrl = getAppBaseUrl()
  return emailShell(`${clubName} now uses IQSport`, `
    <tr><td style="padding:28px 24px 12px;">
      <h1 style="margin:0;font-size:22px;font-weight:700;color:#111827;">${clubName} now uses IQSport</h1>
      <p style="margin:12px 0 0;font-size:15px;color:#6b7280;">Your club has connected IQSport to improve your experience.</p>
    </td></tr>
    <tr><td style="padding:8px 24px 16px;">
      <p style="margin:0 0 12px;font-size:15px;color:#6b7280;">As part of this, the following data is used for club analytics and scheduling optimization:</p>
      <ul style="margin:0;padding:0 0 0 20px;font-size:14px;color:#4b5563;">
        <li style="padding:4px 0;">Your name and contact information</li>
        <li style="padding:4px 0;">Booking and attendance history</li>
        <li style="padding:4px 0;">Skill ratings and play preferences</li>
      </ul>
    </td></tr>
    <tr><td style="padding:0 24px 8px;">
      <p style="margin:0 0 12px;font-size:15px;color:#6b7280;">This data is used <strong>only</strong> for club analytics — it is never sold or shared with advertisers. You can request access to or deletion of your data at any time by contacting your club administrator.</p>
      <p style="margin:0;font-size:15px;color:#6b7280;">For more details, see our Privacy Policy.</p>
    </td></tr>
    ${ctaButton('View Privacy Policy', `${baseUrl}/privacy`)}
  `)
}

export async function sendMemberDataNoticeEmail({ to, clubName }: { to: string; clubName: string }) {
  const html = buildMemberDataNoticeHtml(clubName)
  await sendHtmlEmail(to, `${clubName} now uses IQSport for club analytics`, html)
}

/** Get the HTML template for member data notice (for preview in UI) */
export function getMemberDataNoticeHtml(clubName: string): string {
  return buildMemberDataNoticeHtml(clubName)
}
