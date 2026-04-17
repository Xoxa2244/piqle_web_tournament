-- Prevent duplicate AIRecommendationLog entries for the same (session, user, type)
-- when status is in-flight (pending/sent). This protects against:
--   1. Parallel CourtReserve syncs both detecting the same cancellation
--   2. Event detection re-running within the 75min lookback window
--   3. Slot filler automation picking up the same candidate twice in the same
--      session (when mode=tomorrow and mode=lastminute overlap)
--
-- Note: This is a PARTIAL unique index — it only applies to active records.
-- After a record is delivered (status=delivered/clicked/opened) or terminated
-- (status=failed/bounced/skipped/unsubscribed/spam), it no longer blocks new
-- recommendations for the same target. That way we can legitimately re-invite
-- a member to the same session if the previous invite bounced.
--
-- Step 1: Clean up any pre-existing duplicates before creating the unique index.
-- Keep the NEWEST record per (session_id, user_id, type) group, delete older ones.
-- Only touches active (pending/sent) records — completed/failed records stay intact.
WITH ranked_duplicates AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY session_id, user_id, type
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM ai_recommendation_logs
  WHERE session_id IS NOT NULL
    AND status IN ('pending', 'sent')
)
DELETE FROM ai_recommendation_logs
WHERE id IN (SELECT id FROM ranked_duplicates WHERE rn > 1);

-- Step 2: Session-type dedup (primary protection)
CREATE UNIQUE INDEX IF NOT EXISTS "ai_recommendation_logs_active_session_dedup"
  ON "ai_recommendation_logs" ("session_id", "user_id", "type")
  WHERE "session_id" IS NOT NULL
    AND "status" IN ('pending', 'sent');

-- Sequence step dedup — prevent double-creating the same step in a sequence
CREATE UNIQUE INDEX IF NOT EXISTS "ai_recommendation_logs_sequence_dedup"
  ON "ai_recommendation_logs" ("parent_log_id", "sequence_step")
  WHERE "parent_log_id" IS NOT NULL
    AND "sequence_step" IS NOT NULL;
