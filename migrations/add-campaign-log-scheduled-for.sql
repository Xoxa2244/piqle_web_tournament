-- Campaign sequence queue rebuild.
-- Adds an explicit due time per recipient-log so sequence follow-ups are
-- sent from a real queue instead of being inferred from the previous step
-- on each cron tick.

-- Supabase can otherwise sit on "Running" while waiting for a table lock
-- on ai_recommendation_logs. Fail fast so we can retry off-peak instead
-- of guessing whether the migration is doing useful work.
SET lock_timeout = '5s';
SET statement_timeout = '2min';

ALTER TABLE ai_recommendation_logs
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;

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

CREATE INDEX IF NOT EXISTS ai_recommendation_logs_campaign_due_idx
  ON ai_recommendation_logs (campaign_id, scheduled_for, status)
  WHERE campaign_id IS NOT NULL
    AND sent_at IS NULL
    AND status = 'pending';
