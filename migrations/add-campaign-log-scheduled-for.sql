-- Campaign sequence queue rebuild.
-- Adds an explicit due time per recipient-log so sequence follow-ups are
-- sent from a real queue instead of being inferred from the previous step
-- on each cron tick.

ALTER TABLE ai_recommendation_logs
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ai_recommendation_logs_campaign_due_idx
  ON ai_recommendation_logs (campaign_id, scheduled_for, status)
  WHERE campaign_id IS NOT NULL
    AND sent_at IS NULL
    AND status = 'pending';
