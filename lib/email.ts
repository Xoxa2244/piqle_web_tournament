import nodemailer from 'nodemailer'

const smtpHost = process.env.SMTP_HOST || process.env.EMAIL_SERVER_HOST
const smtpPort = Number(process.env.SMTP_PORT || process.env.EMAIL_SERVER_PORT || 587)
const smtpUser = process.env.SMTP_USER || process.env.EMAIL_SERVER_USER || 'Piqle'
const smtpPass = process.env.SMTP_PASS || process.env.EMAIL_SERVER_PASSWORD
const smtpSecure =
  (process.env.SMTP_SECURE || '').toLowerCase() === 'true' || smtpPort === 465
const fromEmail = process.env.SMTP_FROM || process.env.EMAIL_FROM
const fromName = process.env.SMTP_FROM_NAME || 'Piqle'

if (!smtpHost || !smtpPass || !fromEmail) {
  console.error('[Email] Missing SMTP env vars')
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

export async function sendOtpEmail({
  to,
  code,
  ttlMinutes,
}: {
  to: string
  code: string
  ttlMinutes: number
}) {
  const subject = 'Your Piqle verification code'
  const text = `Your Piqle verification code is: ${code}

This code expires in ${ttlMinutes} minutes.
If you didn't request this, you can ignore this email.`

  await transporter.sendMail({
    to,
    from: fromHeader,
    subject,
    text,
  })
}
