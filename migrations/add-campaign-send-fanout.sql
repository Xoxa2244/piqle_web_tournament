-- 2026-04-30 — Engage P1.2: campaign send queue infrastructure.
-- 2026-05-04 update: campaign_id column type aligned to TEXT to match
-- prod's campaigns.id (created by create-campaigns-table.sql with
-- TEXT id, matching Prisma's String type). Dev DBs where this
-- migration first ran got campaign_id as UUID; the conversion below
-- handles them idempotently.
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

-- ── 0. Convert campaign_id from UUID to TEXT if needed ──
-- Dev DBs that ran this migration when it shipped with UUID need to be
-- converted to TEXT so the FK to campaigns(id) (TEXT) can be added.
-- UUID → TEXT casts cleanly; data preserved as-is.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_recommendation_logs'
      AND column_name = 'campaign_id'
      AND data_type = 'uuid'
  ) THEN
    ALTER TABLE ai_recommendation_logs
      ALTER COLUMN campaign_id TYPE TEXT USING campaign_id::text;
  END IF;
END $$;

-- ── 1. ai_recommendation_logs: campaign correlation + send claim ──
ALTER TABLE ai_recommendation_logs
  ADD COLUMN IF NOT EXISTS campaign_id  TEXT,
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
