-- ── Per-club voice/tone customization + launch audit trail ──
--
-- Two additions that together let a club safely launch live AI outreach:
--
-- 1. clubs.voice_settings (JSONB)
--    Admin-controlled tone presets + freeform custom instructions that
--    get injected into every LLM system prompt for this club. So slot-
--    filler, reactivation, check-in, and campaign messages all pick up
--    the club's voice without us hardcoding per-club if/else chains.
--
-- 2. club_launch_audits
--    Every Go-Live and Kill-Switch event gets a row here. Who flipped it,
--    when, what state the preflight checklist was in, why (for kill).
--    Trivial to build reports on top ("this club went live April 20, was
--    killed April 22 due to high bounce rate, relaunched April 25").

ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS voice_settings JSONB;

COMMENT ON COLUMN clubs.voice_settings IS
  'Admin-controlled voice/tone profile. Shape: {tone, length, useEmoji, formality, customInstructions, updatedAt, updatedBy}. NULL = use platform defaults.';

CREATE TABLE IF NOT EXISTS club_launch_audits (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  club_id         UUID NOT NULL REFERENCES clubs (id) ON DELETE CASCADE,
  user_id         TEXT REFERENCES users (id) ON DELETE SET NULL,
  action          TEXT NOT NULL CHECK (action IN ('go_live', 'kill_switch', 'preflight_failed')),
  preflight_snapshot JSONB,
  manual_confirmations JSONB,
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS club_launch_audits_club_created_idx
  ON club_launch_audits (club_id, created_at DESC);

CREATE INDEX IF NOT EXISTS club_launch_audits_action_idx
  ON club_launch_audits (action, created_at DESC);

COMMENT ON TABLE club_launch_audits IS
  'Audit trail of live-mode transitions — Go Live attempts, Kill Switch activations, failed preflight checks. Used for the Launch Runbook UI history and post-incident review.';
COMMENT ON COLUMN club_launch_audits.preflight_snapshot IS
  'Full preflight check response at the moment of the event — array of {key, status, message}. Lets us answer "what did the admin see when they flipped the switch?".';
COMMENT ON COLUMN club_launch_audits.manual_confirmations IS
  'Map of {checkKey: true} for the 6 manual human-in-the-loop confirmations (preview reviewed, from-name verified, kill-switch known, etc).';
COMMENT ON COLUMN club_launch_audits.reason IS
  'Free-text justification. Required for kill_switch (why turned off), optional for go_live.';
