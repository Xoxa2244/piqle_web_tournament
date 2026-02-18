// Temporary product toggles. Keep them centralized so we can re-enable quickly.
export const ENABLE_RECURRING_DRAFTS = false

// Deferred payments (pay by registration deadline + auto-charge) are disabled by default.
// To re-enable quickly, set NEXT_PUBLIC_ENABLE_DEFERRED_PAYMENTS=true.
export const ENABLE_DEFERRED_PAYMENTS =
  String(process.env.NEXT_PUBLIC_ENABLE_DEFERRED_PAYMENTS ?? '')
    .trim()
    .toLowerCase() === 'true'
