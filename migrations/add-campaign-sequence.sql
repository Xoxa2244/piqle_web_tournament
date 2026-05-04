-- 2026-05-04 — Engage Sequence track (S1): admin-authored multi-step campaigns.
--
-- Until now the Wizard's Sequence + Recurring options were disabled with
-- "Coming soon" labels. launchCampaign explicitly rejected non-one_time
-- formats. This migration adds the storage needed for admin-authored
-- sequences:
--
--   * `steps` JSON — ordered array of step objects:
--       [{ stepIndex, delayDays, subject, body, ctaLabel?, ctaUrl? }, ...]
--     stepIndex is 0-based. delayDays is 0 for the first step (sent at
--     launch) and positive for subsequent steps (delay since previous
--     step). MVP caps the array at 5 entries (validated in Zod, not DB).
--
--   * `exit_on_booking` BOOLEAN — when true (default), the sequence
--     runner stops sending follow-up steps to a recipient who books a
--     session between steps. Mirrors the conditional follow-up logic
--     already used by the Tier 1 lifecycle sequences.
--
-- One-time campaigns leave `steps` NULL — they continue to read
-- subject/body from the existing top-level columns, so this change is
-- backward compatible. Sequence runner (S4) will branch on `format` to
-- decide which path to use.
--
-- Idempotent: IF NOT EXISTS lets this re-run safely on environments
-- where it has already been applied.

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS format            TEXT    NOT NULL DEFAULT 'one_time',
  ADD COLUMN IF NOT EXISTS steps             JSONB,
  ADD COLUMN IF NOT EXISTS exit_on_booking   BOOLEAN NOT NULL DEFAULT TRUE;
