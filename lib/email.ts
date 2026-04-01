import { sendEmail } from './sendTransactionEmail'

const getAppBaseUrl = () => {
  const env = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
  if (!env) return 'http://localhost:3000'
  return env.startsWith('http') ? env.replace(/\/$/, '') : `https://${env}`
}

type CodeEmailVariant = 'verification' | 'password-reset'

const getCodeEmailCopy = (variant: CodeEmailVariant) => {
  if (variant === 'password-reset') {
    return {
      subject: 'Your Piqle password reset code',
      eyebrow: 'Use this code to reset your password',
      title: 'Reset your password',
      footer: 'If you did not request a password reset, you can safely ignore this email.',
    }
  }

  return {
    subject: 'Your Piqle verification code',
    eyebrow: 'Use this code to complete your registration',
    title: 'Verification code',
    footer: 'If you did not request this code, you can safely ignore this email.',
  }
}

const buildCodeEmailHtml = (code: string, ttlMinutes: number, variant: CodeEmailVariant) => {
  const baseUrl = getAppBaseUrl()
  const logoUrl = `${baseUrl}/Logo.png`
  const copy = getCodeEmailCopy(variant)

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Piqle verification code</title>
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
                    <p style="margin: 0 0 12px; font-size: 15px; color: #6b7280;">${copy.eyebrow}</p>
                    <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #111827;">${copy.title}</h1>
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
                      ${copy.footer}
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

async function sendCodeEmail({
  to,
  code,
  ttlMinutes,
  variant,
}: {
  to: string
  code: string
  ttlMinutes: number
  variant: CodeEmailVariant
}) {
  const copy = getCodeEmailCopy(variant)
  const text = `${copy.title}: ${code}

This code expires in ${ttlMinutes} minutes.
${copy.footer}`
  const html = buildCodeEmailHtml(code, ttlMinutes, variant)

  await sendEmail({
    to,
    subject: copy.subject,
    text,
    html,
  })
}

export async function sendOtpEmail({
  to,
  code,
  ttlMinutes,
}: {
  to: string
  code: string
  ttlMinutes: number
}) {
  await sendCodeEmail({ to, code, ttlMinutes, variant: 'verification' })
}

export async function sendPasswordResetEmail({
  to,
  code,
  ttlMinutes,
}: {
  to: string
  code: string
  ttlMinutes: number
}) {
  await sendCodeEmail({ to, code, ttlMinutes, variant: 'password-reset' })
}
