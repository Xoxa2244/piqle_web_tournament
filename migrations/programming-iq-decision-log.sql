-- 2026-05-07 — Programming IQ refactor, Phase A.1.
--
-- Two telemetry tables:
--   * programming_iq_decision_log — one row per (slot × candidate) considered
--     by buildWeeklyGrid. Lets us measure precision of v1 vs v2 in backtests
--     and explain to admins why a slot was filled or left empty.
--   * programming_iq_outcome_log — one row per published Programming IQ
--     session that has now passed. Daily cron fills attendance metrics.
--     Joins back to decision_log on (clubId, weekStartDate, slotSignature)
--     when available.
--
-- Per CLAUDE.md DB notes: clubId / userId columns on prod are TEXT
-- (not uuid), so all FK-style columns here use TEXT. Idempotent via
-- IF NOT EXISTS.

-- ── decision_log ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS programming_iq_decision_log (
  id                    TEXT PRIMARY KEY,
  club_id               TEXT NOT NULL,
  generation_id         TEXT NOT NULL,
  week_start_date       DATE NOT NULL,
  slot_signature        TEXT NOT NULL,
  candidate_id          TEXT NOT NULL,
  candidate_format      TEXT NOT NULL,
  candidate_skill       TEXT NOT NULL,
  total_score           DOUBLE PRECISION NOT NULL,
  goal_scores           JSONB NOT NULL,
  decision              TEXT NOT NULL,
  reason                TEXT,
  selected_preset_ids   TEXT[] NOT NULL DEFAULT '{}',
  is_v2                 BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS programming_iq_decision_log_club_week_idx
  ON programming_iq_decision_log (club_id, week_start_date);

CREATE INDEX IF NOT EXISTS programming_iq_decision_log_generation_idx
  ON programming_iq_decision_log (generation_id);

CREATE INDEX IF NOT EXISTS programming_iq_decision_log_shape_idx
  ON programming_iq_decision_log (club_id, candidate_format, candidate_skill);

-- ── outcome_log ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS programming_iq_outcome_log (
  id                    TEXT PRIMARY KEY,
  club_id               TEXT NOT NULL,
  decision_log_id       TEXT,
  session_id            TEXT NOT NULL,
  week_start_date       DATE NOT NULL,
  format                TEXT NOT NULL,
  skill                 TEXT NOT NULL,
  day_of_week           TEXT NOT NULL,
  start_time            TEXT NOT NULL,
  predicted_occupancy   INT NOT NULL,
  actual_attendance     INT NOT NULL,
  capacity              INT NOT NULL,
  attended_pct          DOUBLE PRECISION NOT NULL,
  attendance_class      TEXT NOT NULL,
  new_member_count      INT NOT NULL DEFAULT 0,
  at_risk_member_count  INT NOT NULL DEFAULT 0,
  observed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One outcome row per session — re-running the cron updates in place.
CREATE UNIQUE INDEX IF NOT EXISTS programming_iq_outcome_log_session_uniq
  ON programming_iq_outcome_log (session_id);

CREATE INDEX IF NOT EXISTS programming_iq_outcome_log_club_week_idx
  ON programming_iq_outcome_log (club_id, week_start_date);

CREATE INDEX IF NOT EXISTS programming_iq_outcome_log_class_idx
  ON programming_iq_outcome_log (club_id, attendance_class);

CREATE INDEX IF NOT EXISTS programming_iq_outcome_log_decision_idx
  ON programming_iq_outcome_log (decision_log_id);

-- FK is intentionally NOT enforced at the DB level. Decision rows can
-- be cleaned up independently (e.g. quarterly retention) without
-- breaking outcome rows. Application logic populates decision_log_id
-- via best-effort join on (club_id, week_start_date, slot_signature).
