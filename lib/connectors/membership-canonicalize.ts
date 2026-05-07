/**
 * Canonicalise raw CourtReserve membership tier strings before they hit
 * users.membership_type.
 *
 * Why this exists: CR's Memberships UI lets operators rename a tier, but
 * the API keeps emitting the legacy string for subscriptions that were
 * created under the old name and never re-issued. Without this layer
 * each sync would re-introduce the legacy string and drift from what the
 * operator sees in their CR Memberships report. We also use it to strip
 * one-off junk tier names (custom strings attached to a single user that
 * aren't real CR membership packages).
 *
 * Companion to the one-time SQL migration that fixed historical rows in
 * 2026-05-07. When a CR-side rename eventually flushes from the API
 * response (every legacy subscription expires/rolls over), it's safe to
 * drop the corresponding alias entry.
 *
 * Used by:
 *   - lib/connectors/courtreserve-sync.ts (live API sync)
 *   - lib/connectors/courtreserve-excel-import.ts (manual Excel/CSV import)
 */

const TIER_ALIASES: Record<string, string> = {
  // CR renamed "Hero Discount - VIP Pass: $79.99..." to
  // "Hero Discount VIP Pass - $79.99..." (no colon, dash placement).
  // Legacy form still appears in API for ~140 subscribers across IPC.
  'Hero Discount - VIP Pass: $79.99/Month for Unlimited Monthly Play':
    'Hero Discount VIP Pass - $79.99/Month for Unlimited Monthly Play',
  'Hero Discount - VIP Pass: $79.99/Month for Unlimited Monthly Play (Network)':
    'Hero Discount VIP Pass - $79.99/Month for Unlimited Monthly Play (Network)',
}

/**
 * Custom tier names that aren't real CR membership packages — typically
 * a single user with a free-text string accidentally entered as their
 * tier. Returning null drops them into the "no tier" bucket so they
 * stop polluting the Members → Filter chip list.
 */
const JUNK_TIERS = new Set<string>([
  'Mark J. Lawler', // observed in IPC South — clearly an admin's name, not a tier
])

export function canonicalizeMembershipTier(raw: string | null | undefined): string | null {
  if (!raw) return null
  // Collapse internal whitespace + trim. CR sometimes appends a trailing
  // space to package names (seen on "IPC Active + Fit Pass - ASH Health ").
  const cleaned = raw.replace(/\s+/g, ' ').trim()
  if (!cleaned) return null
  if (JUNK_TIERS.has(cleaned)) return null
  return TIER_ALIASES[cleaned] ?? cleaned
}
