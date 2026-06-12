/**
 * User-facing text for chat-stream errors (operator feedback v2.0 §7.1).
 *
 * Raw error text must never leak into the chat UI (the operator saw
 * "Minified React error #185" verbatim) — but some backend errors ARE
 * written for the user: plan limits ("daily AI Advisor message limit
 * (10/10 on the free plan)… try again tomorrow"). Those pass through;
 * everything else collapses to a clean retry message. Full details
 * always go to console.error at the call site.
 */
export function chatErrorDisplayText(error: unknown): string {
  const msg =
    error instanceof Error ? error.message
    : typeof error === 'string' ? error
    : ''
  const isUserFacingLimit =
    /\b(message limit|rate limit|daily limit|quota|upgrade to|free plan|try again (?:tomorrow|later))\b/i.test(msg) &&
    !/minified react error/i.test(msg)
  if (isUserFacingLimit) return msg
  return "Sorry, something went wrong on my side. Your message wasn't lost — please try sending it again."
}
