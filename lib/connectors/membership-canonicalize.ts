/**
 * Light cosmetic clean-up for raw CourtReserve membership tier strings
 * before they hit users.membership_type.
 *
 * Scope is intentionally minimal:
 *   - whitespace collapse + trim (CR sometimes appends trailing spaces,
 *     e.g. "IPC Active + Fit Pass - ASH Health ")
 *   - drop free-text junk values that one-off slipped into CR (see
 *     JUNK_TIERS below)
 *
 * What this does NOT do anymore: alias one CR tier to another. Earlier
 * we mapped "Hero Discount - VIP Pass: $79.99..." → "Hero Discount VIP
 * Pass - $79.99..." assuming it was a CR rename. That was wrong — these
 * are TWO DIFFERENT packages in CR (different short codes NHVP vs HVIP,
 * different prices). Aliasing merged them and lost data. The alias map
 * was removed 2026-05-08 after the IPC South catalog audit.
 *
 * Used by:
 *   - lib/connectors/courtreserve-sync.ts (live API sync)
 *   - lib/connectors/courtreserve-excel-import.ts (manual Excel/CSV import)
 */

/**
 * Custom tier names that aren't real CR membership packages — typically
 * a single user with a free-text string accidentally entered as their
 * tier. Returning null drops them into the "no tier" bucket so they
 * stop polluting the Members → Filter chip list.
 */
const JUNK_TIERS = new Set<string>([
  'Mark J. Lawler', // observed in IPC South — clearly an admin's name, not a tier
  'Cole Seager',    // observed in IPC South CR catalog — same pattern
])

export function canonicalizeMembershipTier(raw: string | null | undefined): string | null {
  if (!raw) return null
  // Collapse internal whitespace + trim. CR sometimes appends a trailing
  // space to package names (seen on "IPC Active + Fit Pass - ASH Health ").
  const cleaned = raw.replace(/\s+/g, ' ').trim()
  if (!cleaned) return null
  if (JUNK_TIERS.has(cleaned)) return null
  return cleaned
}
