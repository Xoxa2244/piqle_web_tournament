-- 2026-05-01 — Engage P1 follow-up: per-Campaign call-to-action override.
--
-- The Campaign Wizard's emails currently render a hardcoded
-- "Book a Session" button linking to the club page (see
-- lib/email.ts:sendOutreachEmail). For retention/win-back flows that
-- reads fine; for upgrade/event/renewal flows the CTA is a mismatch
-- (you don't want a "Book a Session" button on a "Renew your package"
-- email).
--
-- Two new columns on `campaigns` let admins override the button label
-- and target URL per campaign. Both are nullable — when null,
-- sendOutreachEmail keeps the legacy default behaviour.
--
-- Idempotent: IF NOT EXISTS lets this re-run safely on environments
-- where it has already been applied.

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS cta_label TEXT,
  ADD COLUMN IF NOT EXISTS cta_url   TEXT;
