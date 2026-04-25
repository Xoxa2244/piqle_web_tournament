-- ── Attribution Tracking for AI Revenue ──
--
-- Links AI recommendations (slot-filler invites, reactivation messages,
-- smart-first-session nudges, referral asks) to the bookings they produced,
-- so we can report "AI-attributed revenue" per club.
--
-- Reuses the existing `booking_id` column (shipped as a placeholder in an
-- earlier migration but never populated — 0/954 rows had it set as of the
-- attribution-service ship). Adds the value snapshot, attribution
-- timestamp, and method so the dashboard can defend the number.
--
-- Three attribution methods, by descending signal strength:
--   1. deep_link          — ?rec=<logId> click captured on booking landing
--   2. direct_session_match — SLOT_FILLER where log.sessionId == booking.sessionId
--                             within a 72h window
--   3. time_window         — user booked anything within N days of the send
--                             (N varies by type: 7d CHECK_IN, 14d REACTIVATION,
--                             21d SMART_FIRST_SESSION, 30d REFERRAL)

ALTER TABLE ai_recommendation_logs
  ADD COLUMN IF NOT EXISTS linked_booking_value DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS linked_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attribution_method   TEXT;

-- Prevent double-counting: a booking attributes to at most one recommendation.
-- The attribution service picks the "best" candidate (most specific type +
-- most recent) and only that row sets booking_id. Partial unique index so
-- existing NULLs aren't a problem.
CREATE UNIQUE INDEX IF NOT EXISTS ai_recommendation_logs_booking_unique
  ON ai_recommendation_logs (booking_id)
  WHERE booking_id IS NOT NULL;

-- Hot path for the ROI dashboard: "sum linked_booking_value for club X in
-- last 30 days". Index supports filter + sort without a table scan.
CREATE INDEX IF NOT EXISTS ai_recommendation_logs_club_linked_at_idx
  ON ai_recommendation_logs ("clubId", linked_at DESC)
  WHERE linked_at IS NOT NULL;

-- For per-type breakdown in the dashboard tile.
CREATE INDEX IF NOT EXISTS ai_recommendation_logs_club_type_linked_idx
  ON ai_recommendation_logs ("clubId", type, linked_at)
  WHERE linked_at IS NOT NULL;

COMMENT ON COLUMN ai_recommendation_logs.booking_id IS
  'FK to play_session_bookings. NULL if no booking was attributed. Unique when set.';
COMMENT ON COLUMN ai_recommendation_logs.linked_booking_value IS
  '$ value of the attributed booking, snapshot at attribution time so historical ROI stays stable.';
COMMENT ON COLUMN ai_recommendation_logs.linked_at IS
  'When the attribution was established (not when the booking was made).';
COMMENT ON COLUMN ai_recommendation_logs.attribution_method IS
  'One of: deep_link | direct_session_match | time_window';
