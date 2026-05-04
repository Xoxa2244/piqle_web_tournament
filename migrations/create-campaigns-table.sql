-- 2026-05-04 — Engage: create the `campaigns` table on prod.
--
-- The Campaign model has been in prisma/schema.prisma for the full
-- Engage redesign work, but no migration ever created the table.
-- Dev DBs got it via early `prisma db push` runs (since deprecated by
-- CLAUDE.md DB rules); prod was never seeded.
--
-- After Sol2 received the rgdev work, applying the incremental
-- ALTER migrations (`add-campaign-cta`, `add-campaign-sequence`,
-- `add-campaign-recurring`, `add-campaign-send-fanout`) failed with
-- 42P01: relation "campaigns" does not exist.
--
-- This migration creates the table at its CURRENT schema state — i.e.
-- all the columns from cta + sequence + recurring + send-fanout are
-- baked in here. The four add-campaign-* migrations remain in the
-- repo as idempotent no-ops (their `IF NOT EXISTS` guards skip when
-- the column is already present).
--
-- Type notes (matching prod conventions, see CLAUDE.md):
-- * club_id / cohort_id / created_by_user — TEXT (not uuid). Same
--   pattern as club_followers, ai_recommendation_logs, etc. The
--   ::uuid casts that broke before this fix all came from this
--   mismatch — see commit 8bd275c3.
-- * Boolean defaults explicit, JSON columns NOT NULL with default '{}'.

-- 1. campaigns table itself
CREATE TABLE IF NOT EXISTS campaigns (
  id                    TEXT        PRIMARY KEY,
  club_id               TEXT        NOT NULL,
  cohort_id             TEXT,
  created_by_user       TEXT,

  name                  TEXT        NOT NULL,
  goal                  TEXT        NOT NULL,
  subject               TEXT,
  body                  TEXT,

  channels              TEXT[]      NOT NULL DEFAULT '{}',

  -- CTA override (add-campaign-cta.sql — folded in here)
  cta_label             TEXT,
  cta_url               TEXT,

  -- Format + Sequence (add-campaign-sequence.sql — folded in here)
  format                TEXT        NOT NULL DEFAULT 'one_time',
  steps                 JSONB,
  exit_on_booking       BOOLEAN     NOT NULL DEFAULT TRUE,

  -- Recurring (add-campaign-recurring.sql — folded in here)
  cron_expression       TEXT,
  recurring_timezone    TEXT,
  last_recurring_run    TIMESTAMPTZ,

  status                TEXT        NOT NULL DEFAULT 'draft',

  scheduled_at          TIMESTAMPTZ,
  launched_at           TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,

  -- Counter columns (clicked_count from add-campaign-send-fanout, others
  -- from this initial create).
  sent_count            INT         NOT NULL DEFAULT 0,
  delivered_count       INT         NOT NULL DEFAULT 0,
  opened_count          INT         NOT NULL DEFAULT 0,
  clicked_count         INT         NOT NULL DEFAULT 0,
  failed_count          INT         NOT NULL DEFAULT 0,

  cohort_snapshot       JSONB       NOT NULL DEFAULT '{}',
  attribution           JSONB       NOT NULL DEFAULT '{}',

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Foreign keys — guarded so re-runs are idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'campaigns_club_id_fkey'
  ) THEN
    ALTER TABLE campaigns
      ADD CONSTRAINT campaigns_club_id_fkey
      FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'campaigns_cohort_id_fkey'
  ) THEN
    -- Only add the cohort FK if club_cohorts table exists. Some envs
    -- never received it; skip gracefully so this migration still runs.
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_name = 'club_cohorts'
    ) THEN
      ALTER TABLE campaigns
        ADD CONSTRAINT campaigns_cohort_id_fkey
        FOREIGN KEY (cohort_id) REFERENCES club_cohorts(id) ON DELETE SET NULL;
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'campaigns_created_by_user_fkey'
  ) THEN
    ALTER TABLE campaigns
      ADD CONSTRAINT campaigns_created_by_user_fkey
      FOREIGN KEY (created_by_user) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Indexes (matching @@index in prisma/schema.prisma).
CREATE INDEX IF NOT EXISTS campaigns_club_id_status_idx
  ON campaigns (club_id, status);

CREATE INDEX IF NOT EXISTS campaigns_club_id_created_at_idx
  ON campaigns (club_id, created_at DESC);

CREATE INDEX IF NOT EXISTS campaigns_cohort_id_idx
  ON campaigns (cohort_id);

-- 4. updated_at trigger — Prisma's @updatedAt updates from app code,
-- but a defensive trigger keeps DB-level UPDATEs in sync (e.g. raw
-- SQL fixes, attribution recomputes via $queryRaw).
CREATE OR REPLACE FUNCTION campaigns_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'campaigns_updated_at_trigger'
  ) THEN
    CREATE TRIGGER campaigns_updated_at_trigger
      BEFORE UPDATE ON campaigns
      FOR EACH ROW
      EXECUTE FUNCTION campaigns_set_updated_at();
  END IF;
END $$;
