type SendEmailOptions = {
  to: string
  subject: string
  html: string
  text?: string
}

/**
 * Send a transactional email.
 * Uses MAILCHIMP_TRANSACTIONAL_API_KEY if set, else SMTP env vars.
 */
export async function sendEmail({
  to,
  subject,
  html,
  text,
}: SendEmailOptions): Promise<void> {
  const mailchimpApiKey = process.env.MAILCHIMP_TRANSACTIONAL_API_KEY
  if (mailchimpApiKey) {
    const fromEmail =
      process.env.SMTP_FROM ||
      process.env.EMAIL_FROM ||
      process.env.SMTP_USER ||
      process.env.EMAIL_SERVER_USER ||
      'noreply@piqle.io'
    const fromName = process.env.SMTP_FROM_NAME || process.env.EMAIL_FROM_NAME || 'Piqle'

    const response = await fetch('https://mandrillapp.com/api/1.0/messages/send.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: mailchimpApiKey,
        message: {
          html,
          text,
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
      console.log('[Email] Mailchimp send accepted', {
        to,
        subject,
        result: result.map((r: any) => ({
          email: r.email,
          status: r.status,
          id: r._id,
          reject_reason: r.reject_reason ?? null,
        })),
      })
    } else if (result.status === 'error') {
      throw new Error(`Mailchimp API error: ${result.message || result.name || 'Unknown error'}`)
    } else {
      console.log('[Email] Mailchimp send response', {
        to,
        subject,
        result,
      })
    }
    return
  }

  const emailHost = process.env.SMTP_HOST || process.env.EMAIL_SERVER_HOST
  const emailUser = process.env.SMTP_USER || process.env.EMAIL_SERVER_USER
  const emailPassword = process.env.SMTP_PASS || process.env.EMAIL_SERVER_PASSWORD
  const emailPort = process.env.SMTP_PORT || process.env.EMAIL_SERVER_PORT || '587'
  const fromEmail =
    process.env.SMTP_FROM ||
    process.env.EMAIL_FROM ||
    emailUser ||
    'noreply@piqle.io'
  const fromName = process.env.SMTP_FROM_NAME || process.env.EMAIL_FROM_NAME || 'Piqle'

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
  try {
    await transporter.verify()
  } catch (error) {
    console.error('[Email] SMTP verify failed', {
      host: emailHost,
      port: emailPort,
      secure: emailPort === '465',
      user: emailUser,
      fromEmail,
      fromMatchesUser: fromEmail === emailUser,
      to,
      subject,
      error,
    })
    throw error
  }

  try {
    const info = await transporter.sendMail({ from: fromAddress, to, subject, html, text })
    console.log('[Email] SMTP send accepted', {
      host: emailHost,
      port: emailPort,
      secure: emailPort === '465',
      user: emailUser,
      fromEmail,
      fromMatchesUser: fromEmail === emailUser,
      to,
      subject,
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
      response: info.response,
    })
  } catch (error) {
    console.error('[Email] SMTP send failed', {
      host: emailHost,
      port: emailPort,
      secure: emailPort === '465',
      user: emailUser,
      fromEmail,
      fromMatchesUser: fromEmail === emailUser,
      to,
      subject,
      error,
    })
    throw error
  }
}

export async function sendHtmlEmail(to: string, subject: string, html: string): Promise<void> {
  await sendEmail({ to, subject, html })
}
