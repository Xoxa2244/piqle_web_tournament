/**
 * Network-tier name detection (WS6c, operator feedback 1.1).
 *
 * IPC's CourtReserve catalog literally suffixes chain-wide packages with
 * "(Network)" — e.g. "VIP PASS - $89.99/Month for Unlimited Monthly Play
 * (Network)" (verified on prod: every IPC club carries ~9 such tiers). A
 * network membership grants access to every club in the chain; the member
 * may still prefer one location.
 *
 * Pure + dependency-free so both the server engine (network-membership.ts)
 * and client components (Members scope filter, tier badges) share one
 * definition.
 */
export function isNetworkTierName(name: string | null | undefined): boolean {
  if (!name) return false
  return /\(network\)/i.test(name) || /\bnetwork\b/i.test(name)
}
