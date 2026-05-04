-- 2026-04-30 — Engage P1.2: campaign send queue infrastructure.
--
-- Adds the columns needed for the per-minute campaign-sends cron to
-- fan out, send, and track recipient-level state. The launchCampaign
-- mutation creates one ai_recommendation_logs row per recipient with
-- type='CAMPAIGN_SEND' and campaign_id set; the cron then atomically
-- claims pending rows (sent_at IS NULL), sends mail, and bumps the
-- per-Campaign counters.
--
-- See docs/ENGAGE_PRIORITY1_SPEC.md §2 P1.2 for the full design and
-- §3 CC-1/CC-2 for the audit that drove this migration.
--
-- Notes on schema state observed on rgdev's dev DB
-- (angwdmyswzztmlrdzgxm / piqle_web_tournament):
--   * `campaigns.id` = uuid → `campaign_id` here is uuid for the FK
--   * `sent_at` (timestamptz) already exists from a prior partial
--     migration — IF NOT EXISTS handles it, no-op
--   * `ai_recommendation_logs` has duplicated camelCase + snake_case
--     timestamp columns from CourtReserve sync; we use snake_case
--     consistently in new code (see CLAUDE.md DB notes)

-- ── 1. ai_recommendation_logs: campaign correlation + send claim ──
ALTER TABLE ai_recommendation_logs
  ADD COLUMN IF NOT EXISTS campaign_id  UUID,
  ADD COLUMN IF NOT EXISTS sent_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retry_count  INT NOT NULL DEFAULT 0;

-- FK to campaigns. ON DELETE SET NULL because we want to keep the
-- log row for attribution/audit even if the Campaign row is deleted.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ai_recommendation_logs_campaign_id_fkey'
  ) THEN
    ALTER TABLE ai_recommendation_logs
      ADD CONSTRAINT ai_recommendation_logs_campaign_id_fkey
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Hot path for the cron: "give me the next 50 pending sends for any
-- campaign that's running". Partial index keeps it tiny — only rows
-- still waiting to be sent are indexed.
CREATE INDEX IF NOT EXISTS ai_recommendation_logs_campaign_pending_idx
  ON ai_recommendation_logs (campaign_id, created_at)
  WHERE sent_at IS NULL AND campaign_id IS NOT NULL;

-- ── 2. AIRecommendationType enum: add CAMPAIGN_SEND ──
-- Idempotent — Postgres errors on duplicate enum values, so we guard.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'CAMPAIGN_SEND'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AIRecommendationType')
  ) THEN
    ALTER TYPE "AIRecommendationType" ADD VALUE 'CAMPAIGN_SEND';
  END IF;
END $$;

-- ── 3. campaigns: clicked_count for symmetry with delivered/opened ──
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS clicked_count INT NOT NULL DEFAULT 0;
