-- Programming IQ — court-aware draft staging + publish idempotency groundwork.
--
-- See /Users/shats/.claude/plans/dynamic-fluttering-lamport.md (Programming
-- IQ plan) for the full story. Short version:
--
--   - court_id          : draft now knows which court it was assigned to
--                         during the grid generation run
--   - generation_id     : groups all drafts produced by a single Generate
--                         click so the UI can load them atomically
--   - published_play_session_id
--                       : FK back to the PlaySession this draft produced
--                         on publish. Used for rollback and for the
--                         application-level idempotency check (second
--                         publish on the same draft short-circuits on
--                         this field being set).
--
-- Type choice notes:
--   - club_courts.id is TEXT (Prisma default-cuid via @default(uuid())),
--     NOT uuid — the FK column here must also be TEXT.
--   - play_sessions.id is TEXT for the same reason.
--   - generation_id is UUID (it's a grouping key we own; UUIDs are cheaper
--     to index than text).
--
-- Intentionally NOT adding a unique index on play_sessions(courtId, date,
-- startTime): existing prod rows already have duplicates (from CourtReserve
-- sync + manual edits). We rely on the published_play_session_id marker on
-- the draft for idempotency, checked in publishProgrammingGrid. A regular
-- (non-unique) performance index can be added later if query patterns need
-- it.

ALTER TABLE ops_session_drafts
  ADD COLUMN IF NOT EXISTS court_id TEXT REFERENCES club_courts (id) ON DELETE SET NULL;

ALTER TABLE ops_session_drafts
  ADD COLUMN IF NOT EXISTS generation_id UUID;

ALTER TABLE ops_session_drafts
  ADD COLUMN IF NOT EXISTS published_play_session_id TEXT REFERENCES play_sessions (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ops_session_drafts_generation_id_idx
  ON ops_session_drafts (generation_id)
  WHERE generation_id IS NOT NULL;

COMMENT ON COLUMN ops_session_drafts.court_id IS
  'Programming IQ: concrete court assigned during grid generation.';
COMMENT ON COLUMN ops_session_drafts.generation_id IS
  'Programming IQ: groups all drafts from a single Generate run.';
COMMENT ON COLUMN ops_session_drafts.published_play_session_id IS
  'Programming IQ: FK to the PlaySession this draft produced on publish. Used for rollback + idempotency.';
