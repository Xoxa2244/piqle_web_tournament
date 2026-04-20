/**
 * Mandrill Sending Domains — per-club white-label email.
 *
 * Wraps Mandrill's /senders/* endpoints so clubs can send AI outreach
 * from their own domain (e.g. campaigns@mail.pickleballclub.com) instead
 * of shared noreply@iqsport.ai. Open rates up ~10-20%, better
 * deliverability, the club's brand in the member's inbox.
 *
 * Flow (see tRPC wiring in server/routers/intelligence.ts):
 *
 *   1. admin enters a domain → addSendingDomain() → Mandrill returns
 *      SPF + DKIM record specs. We store them on Club.sending_domain_dns_records.
 *   2. admin copies them into their DNS provider.
 *   3. admin clicks Verify → checkSendingDomain() → Mandrill runs live
 *      DNS lookups and tells us if SPF + DKIM validate. We flip
 *      Club.sending_domain_verified_at when valid_signing is true.
 *   4. admin toggles Enable → sendMail() picks up the custom From address.
 *
 * Docs: https://mailchimp.com/developer/transactional/api/senders/
 * Key endpoints:
 *   POST /senders/add-domain.json
 *   POST /senders/check-domain.json
 *   POST /senders/verify-domain.json   (email ownership — optional for us)
 *   POST /senders/domains.json         (list — mostly for ops)
 */

const MANDRILL_API_BASE = 'https://mandrillapp.com/api/1.0'

function getApiKey(): string {
  const key = process.env.MAILCHIMP_TRANSACTIONAL_API_KEY
  if (!key) throw new Error('[SendingDomain] MAILCHIMP_TRANSACTIONAL_API_KEY is not set')
  return key
}

// ── Types ──

/**
 * Status of a single DNS record as reported by Mandrill.
 * valid=false + error populated when the record hasn't propagated yet
 * or is wrong; valid=true + valid_after when it's live.
 */
export interface MandrillDnsStatus {
  valid: boolean
  valid_after: string | null
  error: string | null
}

/**
 * Response shape from /senders/add-domain and /senders/check-domain.
 * These two endpoints return the same object — add triggers a first
 * probe, check triggers a re-probe.
 */
export interface MandrillSendingDomainStatus {
  domain: string
  created_at: string
  last_tested_at: string | null
  spf: MandrillDnsStatus
  dkim: MandrillDnsStatus
  verified_at: string | null
  valid_signing: boolean
}

/**
 * A DNS record formatted for the admin UI — what to paste into their
 * DNS provider. Mandrill returns SPF + DKIM; Return-Path is optional
 * (not required for sending, but improves bounce handling). We always
 * emit all three so admins have the full recommended setup.
 */
export interface AdminDnsRecord {
  kind: 'SPF' | 'DKIM' | 'RETURN_PATH'
  type: 'TXT' | 'CNAME'
  host: string
  value: string
  note?: string
}

// ── Domain validation (client-side friendly — same rules as backend) ──

const DOMAIN_RE = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63})+$/

/**
 * Validate that a string looks like a real domain. Rejects:
 *   • obviously invalid syntax
 *   • IP addresses (we want domains, not hosts)
 *   • tld-only inputs ("com" alone)
 * Doesn't check whether the domain actually exists — that's Mandrill's job.
 */
export function validateSendingDomain(input: string): { ok: boolean; reason?: string; normalized?: string } {
  const normalized = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  if (!normalized) return { ok: false, reason: 'Domain cannot be empty' }
  if (normalized.length > 253) return { ok: false, reason: 'Domain too long' }
  if (!DOMAIN_RE.test(normalized)) {
    return { ok: false, reason: 'Not a valid domain format (e.g. mail.yourclub.com)' }
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(normalized)) {
    return { ok: false, reason: 'IP addresses are not supported — use a domain name' }
  }
  return { ok: true, normalized }
}

/**
 * Heuristic: does this look like a root domain (yourclub.com) as opposed
 * to a subdomain (mail.yourclub.com)? We warn on root to protect clubs
 * from accidentally clobbering their primary email SPF.
 *
 * Counts dots: 1 dot → root (e.g. yourclub.com). ≥2 dots → subdomain.
 * Not perfect (co.uk-style TLDs count as "subdomain" here) but good
 * enough for a warning, and over-warning is safer than under-warning.
 */
export function isLikelyRootDomain(domain: string): boolean {
  return (domain.match(/\./g) || []).length === 1
}

// ── API calls ──

async function postMandrill<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const apiKey = getApiKey()
  const response = await fetch(`${MANDRILL_API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: apiKey, ...body }),
  })
  const result = await response.json()
  if (!response.ok) {
    // Mandrill error payload: { status: 'error', code: N, name: '...', message: '...' }
    const msg = result?.message || response.statusText || 'unknown'
    throw new Error(`[SendingDomain] Mandrill ${response.status}: ${msg}`)
  }
  return result as T
}

/**
 * Register a domain with Mandrill. First call for a domain returns the
 * DNS record specs we need to give the admin; subsequent calls are
 * idempotent (Mandrill returns the same record, just re-runs the probe).
 */
export async function addSendingDomain(domain: string): Promise<MandrillSendingDomainStatus> {
  return postMandrill<MandrillSendingDomainStatus>('/senders/add-domain.json', { domain })
}

/**
 * Re-check a domain's DNS. Call this when the admin clicks Verify —
 * Mandrill does a fresh DNS lookup and updates spf/dkim/valid_signing.
 * Idempotent: many clicks, same answer once DNS has propagated.
 */
export async function checkSendingDomain(domain: string): Promise<MandrillSendingDomainStatus> {
  return postMandrill<MandrillSendingDomainStatus>('/senders/check-domain.json', { domain })
}

/**
 * Build the admin-facing DNS records list from a Mandrill status response.
 *
 * Mandrill's API surface for DNS record specs is indirect — you query
 * /senders/add-domain.json and it returns the status (SPF valid y/n),
 * but the actual record values you need to add are documented constants:
 *   • SPF:    add `v=spf1 include:spf.mandrillapp.com ?all` to TXT
 *             at the root of the sending domain
 *   • DKIM:   add the public key as TXT at
 *             mandrill._domainkey.<sending_domain>
 *   • Return-Path (optional): CNAME `<sending_domain>` → mandrillapp.com
 *
 * The SPF TXT value is constant per tenant. The DKIM public key is the
 * same across Mandrill — they publish a shared signing key that's rotated
 * on their side. This is why the Mandrill UI also just shows these as
 * static snippets.
 */
/**
 * Mandrill's shared DKIM public key (same for all tenants on the
 * transactional platform). Configurable via env in case Mailchimp rotates
 * it or we move to a dedicated key — then we bump the env var and every
 * club's next "Verify" click shows the new value.
 *
 * Default below was the published shared key as of the feature ship date.
 * You can find the current one in the Mandrill admin UI under
 * Settings → Sending Domains → (any domain) → DNS records.
 */
const DEFAULT_MANDRILL_DKIM_KEY =
  'v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCrLHiExVd55zd/IQ/J/mRwSRMAocV/hMB3jXwaHH36d9NaVynQFYV8NaWi69c1veUtRzGt7yAioXqLj7Z4TeEUoOLgrKsn8YnckGs9i3B3tVFB+Ch/4mPhXWiNfNdynHWBcPcbJ8kjEQ2U8y78dHZj1YeRXXVvWob2OaKynO8/lQIDAQAB;'

function getDkimKey(): string {
  return process.env.MANDRILL_DKIM_PUBLIC_KEY || DEFAULT_MANDRILL_DKIM_KEY
}

export function buildAdminDnsRecords(domain: string): AdminDnsRecord[] {
  return [
    {
      kind: 'SPF',
      type: 'TXT',
      host: domain,
      value: 'v=spf1 include:spf.mandrillapp.com ?all',
      note: 'If your domain already has an SPF record, merge `include:spf.mandrillapp.com` into the existing record instead of adding a second one.',
    },
    {
      kind: 'DKIM',
      type: 'TXT',
      host: `mandrill._domainkey.${domain}`,
      value: getDkimKey(),
      note: 'Shared Mandrill DKIM key — paste exactly as shown. If your Verify step fails, double-check there are no line breaks in the value.',
    },
    {
      kind: 'RETURN_PATH',
      type: 'CNAME',
      host: domain,
      value: 'mandrillapp.com',
      note: 'Optional but recommended — improves bounce handling. Skip this if your DNS provider blocks CNAME at the record root (Mandrill still works with SPF + DKIM only).',
    },
  ]
}

// ── Helpers for the tRPC layer ──

/**
 * Full From: address for a club. Only produces the custom address when
 * the domain is both verified AND enabled — otherwise caller should fall
 * back to the platform default (noreply@iqsport.ai).
 */
export function buildClubFromAddress(club: {
  name: string
  sendingDomain: string | null
  sendingDomainEnabled: boolean
  sendingDomainVerifiedAt: Date | null
  sendingDomainFromName: string | null
  sendingDomainLocalPart: string
}): { fromEmail: string; fromName: string } | null {
  if (!club.sendingDomain) return null
  if (!club.sendingDomainEnabled) return null
  if (!club.sendingDomainVerifiedAt) return null
  const local = (club.sendingDomainLocalPart || 'campaigns').trim() || 'campaigns'
  return {
    fromEmail: `${local}@${club.sendingDomain}`,
    fromName: (club.sendingDomainFromName || club.name).trim(),
  }
}

// ── Feature detection ──

export function isSendingDomainConfigured(): boolean {
  return !!process.env.MAILCHIMP_TRANSACTIONAL_API_KEY
}
