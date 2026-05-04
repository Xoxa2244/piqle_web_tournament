-- 2026-05-02 — CourtReserve event URLs
--
-- CR's eventcalendar/eventlist endpoint returns two URL fields per
-- event that we never extracted (audit 2026-05-02):
--
--   PublicEventUrl — public registration page on CR portal
--   SsoUrl         — authenticated link for known members
--
-- Capturing these unblocks: direct links in Slot Filler / outreach
-- emails (instead of generic club-page bookingUrl), per-event
-- attribution via UTM params, and member-personalized one-click
-- booking via SsoUrl.
--
-- Both columns nullable — older sessions won't have them, and CR
-- doesn't always populate (private/internal events). Email templates
-- fall back to club-page URL when null.
--
-- Apply to BOTH:
--   * mwdftgazlvpfyvqicovh (iqsport-prod, app.iqsport.ai)
--   * angwdmyswzztmlrdzgxm (piqle_web_tournament dev)

ALTER TABLE play_sessions
  ADD COLUMN IF NOT EXISTS external_url   TEXT,
  ADD COLUMN IF NOT EXISTS member_sso_url TEXT;

-- No index — these are read alongside the row, never filter targets.
