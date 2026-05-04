-- 2026-05-04 — Engage Recurring track (R1): campaigns that repeat on a
-- cron schedule. Adds the storage that the recurring runner reads on
-- each daily tick to decide whether to re-evaluate the cohort and fan
-- out a fresh batch of recipient logs.
--
--   * cron_expression TEXT — standard 5-field cron expression (m h dom mon dow).
--     For MVP the Wizard generates a small set of expressions:
--       "0 9 * * MON"     — every Monday at 09:00 (in recurring_timezone)
--       "0 9 1 * *"       — first of every month
--       "0 9 * * *"       — daily at 09:00
--     plus a "custom cron" text field for power users. We don't validate
--     the cron in the DB — that's the runner's job (parsed at tick time
--     using `cron-parser` or similar lib).
--
--   * recurring_timezone TEXT — IANA timezone (e.g. "America/Los_Angeles")
--     used to interpret the cron expression. Defaults to club's locale.
--
-- Both nullable — only meaningful when format='recurring'.
--
-- Idempotent: IF NOT EXISTS lets this re-run safely.

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS cron_expression    TEXT,
  ADD COLUMN IF NOT EXISTS recurring_timezone TEXT,
  ADD COLUMN IF NOT EXISTS last_recurring_run TIMESTAMPTZ;
