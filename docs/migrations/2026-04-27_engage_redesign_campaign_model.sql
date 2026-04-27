-- ─────────────────────────────────────────────────────────────────────────
-- Engage Redesign — Campaign model + Suggested Cohort cache + cohort flag
-- Phase 5 (P5-T2). See docs/ENGAGE_REDESIGN_SPEC.md §9.
--
-- IMPORTANT (per CLAUDE.md): apply via psql/SQL, NOT prisma db push.
--   clubs.id  is UUID
--   users.id  is TEXT
--   *_id columns follow that convention (UUID for club_id, TEXT for user_id).
--
-- This migration is IDEMPOTENT — safe to re-run on a partially-applied state.
-- Every CREATE TABLE / CREATE INDEX uses IF NOT EXISTS and every ADD CONSTRAINT
-- is wrapped in a DO block that ignores duplicate_object errors.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. campaigns table — aggregates a single send (one row per Campaign).
CREATE TABLE IF NOT EXISTS "campaigns" (
  "id"               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  "club_id"          UUID         NOT NULL,
  "cohort_id"        UUID,
  "created_by_user"  TEXT,

  "name"             TEXT         NOT NULL,
  "goal"             TEXT         NOT NULL,
  "subject"          TEXT,
  "body"             TEXT,

  -- Active channels at send time
  "channels"         TEXT[]       NOT NULL DEFAULT '{}',

  -- draft | scheduled | running | paused | completed | failed
  "status"           TEXT         NOT NULL DEFAULT 'draft',

  -- Timestamps
  "scheduled_at"     TIMESTAMPTZ,
  "launched_at"      TIMESTAMPTZ,
  "completed_at"     TIMESTAMPTZ,

  -- Cumulative counters (real-time on send progress; metrics in attribution JSON)
  "sent_count"       INTEGER      NOT NULL DEFAULT 0,
  "delivered_count"  INTEGER      NOT NULL DEFAULT 0,
  "opened_count"     INTEGER      NOT NULL DEFAULT 0,
  "failed_count"     INTEGER      NOT NULL DEFAULT 0,

  -- Snapshot of cohort membership at send time (for stable attribution).
  -- Shape: { userIds: string[], rendered_at: ISO }
  "cohort_snapshot"  JSONB        NOT NULL DEFAULT '{}'::jsonb,

  -- Attribution result computed by P5-T3 pipeline.
  -- Shape: { booked_count: int, booked_revenue_cents: int, last_computed_at: ISO }
  "attribution"      JSONB        NOT NULL DEFAULT '{}'::jsonb,

  "created_at"       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- FKs (nullable cohort_id so legacy/orphan campaigns don't break).
DO $$ BEGIN
  ALTER TABLE "campaigns"
    ADD CONSTRAINT "campaigns_club_id_fkey"
      FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "campaigns"
    ADD CONSTRAINT "campaigns_cohort_id_fkey"
      FOREIGN KEY ("cohort_id") REFERENCES "club_cohorts"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "campaigns"
    ADD CONSTRAINT "campaigns_created_by_user_fkey"
      FOREIGN KEY ("created_by_user") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "campaigns_club_id_status_idx"
  ON "campaigns" ("club_id", "status");
CREATE INDEX IF NOT EXISTS "campaigns_club_id_created_at_idx"
  ON "campaigns" ("club_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "campaigns_cohort_id_idx"
  ON "campaigns" ("cohort_id");

-- 2. club_cohorts — add isDynamic flag (auto-refresh vs static frozen list).
ALTER TABLE "club_cohorts"
  ADD COLUMN IF NOT EXISTS "is_dynamic" BOOLEAN NOT NULL DEFAULT true;

-- 3. club_suggested_cohort_cache — 24h cache of cohort-generators output.
CREATE TABLE IF NOT EXISTS "club_suggested_cohort_cache" (
  "club_id"           UUID         NOT NULL,
  "generator_key"     TEXT         NOT NULL,
  "payload"           JSONB        NOT NULL,
  "computed_at"       TIMESTAMPTZ  NOT NULL DEFAULT now(),

  PRIMARY KEY ("club_id", "generator_key")
);

DO $$ BEGIN
  ALTER TABLE "club_suggested_cohort_cache"
    ADD CONSTRAINT "club_suggested_cohort_cache_club_id_fkey"
      FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "club_suggested_cohort_cache_computed_at_idx"
  ON "club_suggested_cohort_cache" ("computed_at" DESC);

-- 4. member_health_snapshots — add unique (club_id, user_id, date::date) so
--    daily snapshot cron (P5-T1) can use upsert instead of duplicate-and-dedupe.
CREATE UNIQUE INDEX IF NOT EXISTS
  "member_health_snapshots_club_user_day_uniq"
  ON "member_health_snapshots" ("club_id", "user_id", DATE("date"));
