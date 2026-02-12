/**
 * Send a single transactional HTML email (e.g. tournament invitation).
 * Uses MAILCHIMP_TRANSACTIONAL_API_KEY if set, else SMTP env vars.
 */
export async function sendHtmlEmail(to: string, subject: string, html: string): Promise<void> {
  const fromEmail = process.env.SMTP_FROM || process.env.EMAIL_FROM || 'noreply@piqle.io'
  const fromName = process.env.SMTP_FROM_NAME || process.env.EMAIL_FROM_NAME || 'Piqle'

  const mailchimpApiKey = process.env.MAILCHIMP_TRANSACTIONAL_API_KEY
  if (mailchimpApiKey) {
    const response = await fetch('https://mandrillapp.com/api/1.0/messages/send.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: mailchimpApiKey,
        message: {
          html,
          subject,
          from_email: fromEmail,
          from_name: fromName,
          to: [{ email: to, type: 'to' as const }],
        },
      }),
    })
    const result = await response.json()
    if (!response.ok) {
      throw new Error(`Mailchimp API error: ${response.status} ${JSON.stringify(result)}`)
    }
    if (Array.isArray(result)) {
      const rejected = result.filter((r: { status: string }) => r.status === 'rejected')
      if (rejected.length > 0) {
        throw new Error(`Mailchimp send failed: ${rejected.map((r: any) => r.reject_reason || r.email).join(', ')}`)
      }
    } else if (result.status === 'error') {
      throw new Error(`Mailchimp API error: ${result.message || result.name || 'Unknown error'}`)
    }
    return
  }

  const emailHost = process.env.SMTP_HOST || process.env.EMAIL_SERVER_HOST
  const emailUser = process.env.SMTP_USER || process.env.EMAIL_SERVER_USER
  const emailPassword = process.env.SMTP_PASS || process.env.EMAIL_SERVER_PASSWORD
  const emailPort = process.env.SMTP_PORT || process.env.EMAIL_SERVER_PORT || '587'

  if (!emailHost || !emailUser || !emailPassword) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[Email] Not configured – would send to', to, 'subject:', subject)
      return
    }
    throw new Error('Email service is not configured. Set MAILCHIMP_TRANSACTIONAL_API_KEY or SMTP credentials.')
  }

  const nodemailer = await import('nodemailer')
  const transporter = nodemailer.default.createTransport({
    host: emailHost,
    port: parseInt(emailPort),
    secure: emailPort === '465',
    auth: { user: emailUser, pass: emailPassword },
  })
  const fromAddress = fromName ? `"${fromName}" <${fromEmail}>` : fromEmail
  await transporter.sendMail({ from: fromAddress, to, subject, html })
}
