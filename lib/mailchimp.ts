/**
 * Mailchimp Transactional (Mandrill) API Integration
 *
 * Sends outreach emails via Mandrill with tracking metadata so that
 * webhook events (open, click, bounce) can be correlated back to
 * AIRecommendationLog records.
 *
 * Environment variables:
 *   MAILCHIMP_TRANSACTIONAL_API_KEY — Mandrill API key
 *   MAILCHIMP_WEBHOOK_KEY           — Webhook authentication key (for signature verification)
 */

const MANDRILL_API_BASE = 'https://mandrillapp.com/api/1.0'

function getApiKey(): string {
  const key = process.env.MAILCHIMP_TRANSACTIONAL_API_KEY
  if (!key) throw new Error('[Mailchimp] MAILCHIMP_TRANSACTIONAL_API_KEY is not set')
  return key
}

// ── Types ──

export interface MandrillSendInput {
  to: string
  subject: string
  html: string
  text?: string
  fromEmail?: string
  fromName?: string
  /** Stored as Mandrill metadata — used to match webhook events back to our DB */
  metadata?: {
    logId: string      // AIRecommendationLog.id
    clubId: string
    userId: string
    variantId?: string
  }
  /** Mandrill tags for filtering in Mandrill dashboard */
  tags?: string[]
  /** Custom email headers (e.g., List-Unsubscribe for RFC 8058) */
  headers?: Record<string, string>
}

export interface MandrillSendResult {
  /** Mandrill internal message ID (used in webhooks as msg._id) */
  messageId: string
  status: 'sent' | 'queued' | 'rejected' | 'invalid'
  rejectReason?: string
}

// ── Send Email via Mandrill ──

export async function sendViaMandrill(input: MandrillSendInput): Promise<MandrillSendResult> {
  const apiKey = getApiKey()

  const fromEmail = input.fromEmail || process.env.SMTP_FROM || process.env.EMAIL_FROM || 'noreply@piqle.io'
  const fromName = input.fromName || process.env.SMTP_FROM_NAME || 'IQSport.ai'

  const payload = {
    key: apiKey,
    message: {
      html: input.html,
      text: input.text || stripHtml(input.html),
      subject: input.subject,
      from_email: fromEmail,
      from_name: fromName,
      to: [{ email: input.to, type: 'to' as const }],
      // Enable tracking
      track_opens: true,
      track_clicks: true,
      // Metadata survives through webhooks — critical for correlation
      metadata: input.metadata ? {
        log_id: input.metadata.logId,
        club_id: input.metadata.clubId,
        user_id: input.metadata.userId,
        variant_id: input.metadata.variantId || '',
      } : undefined,
      // Tags for Mandrill dashboard filtering
      tags: input.tags || ['outreach'],
      // Merge tags (available in templates)
      merge_language: 'handlebars' as const,
      // Custom headers (e.g., List-Unsubscribe for RFC 8058 compliance)
      ...(input.headers ? { headers: input.headers } : {}),
    },
  }

  const response = await fetch(`${MANDRILL_API_BASE}/messages/send.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(`[Mailchimp] API error ${response.status}: ${JSON.stringify(result)}`)
  }

  // Mandrill returns an array of results (one per recipient)
  if (!Array.isArray(result) || result.length === 0) {
    throw new Error(`[Mailchimp] Unexpected response: ${JSON.stringify(result)}`)
  }

  const first = result[0]

  if (first.status === 'rejected' || first.status === 'invalid') {
    throw new Error(`[Mailchimp] Message ${first.status}: ${first.reject_reason || 'unknown'}`)
  }

  return {
    messageId: first._id,
    status: first.status,
    rejectReason: first.reject_reason,
  }
}

// ── Check if Mandrill is configured ──

export function isMandrillConfigured(): boolean {
  return !!process.env.MAILCHIMP_TRANSACTIONAL_API_KEY
}

// ── Webhook Signature Verification ──

/**
 * Verify Mandrill webhook signature.
 * Mandrill signs webhooks using HMAC-SHA1 with the webhook key.
 *
 * Signature = Base64(HMAC-SHA1(webhook_key, url + sorted_post_params))
 */
export async function verifyMandrillWebhook(
  signature: string,
  url: string,
  params: Record<string, string>,
): Promise<boolean> {
  const webhookKey = process.env.MAILCHIMP_WEBHOOK_KEY
  if (!webhookKey) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[Mailchimp] MAILCHIMP_WEBHOOK_KEY not set in production — rejecting webhook')
      return false
    }
    console.warn('[Mailchimp] MAILCHIMP_WEBHOOK_KEY not set — skipping signature verification (dev only)')
    return true
  }

  // Build signed data: url + sorted keys and values
  const sortedKeys = Object.keys(params).sort()
  let signedData = url
  for (const key of sortedKeys) {
    signedData += key + params[key]
  }

  // HMAC-SHA1
  const encoder = new TextEncoder()
  const keyData = encoder.encode(webhookKey)
  const msgData = encoder.encode(signedData)

  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, msgData)
  const expectedSignature = Buffer.from(sig).toString('base64')

  // Timing-safe comparison to prevent timing attacks
  const { timingSafeEqual } = await import('crypto')
  const sigBuf = Buffer.from(signature)
  const expBuf = Buffer.from(expectedSignature)
  if (sigBuf.length !== expBuf.length) return false
  return timingSafeEqual(sigBuf, expBuf)
}

// ── Helpers ──

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&rsquo;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&middot;/g, '·')
    .replace(/&ndash;/g, '–')
    .replace(/\s+/g, ' ')
    .trim()
}
