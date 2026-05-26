-- ─────────────────────────────────────────────────────────────────────────
-- Dashboard & Action Center — SOL2 / production-DB variant.
--
-- The original migration (docs/migrations/2026-05-19_dashboard_and_action_center.sql)
-- assumes `clubs.id` is UUID (as stated in CLAUDE.md, true for the rgdev DB).
--
-- Sol2's production database has `clubs.id` typed as TEXT. Applying the
-- UUID-typed migration there fails with:
--
--   ERROR: 42804: foreign key constraint "business_insight_club_id_fkey"
--          cannot be implemented
--   DETAIL: Key columns "club_id" and "id" are of incompatible types:
--           uuid and text.
--
-- This variant mirrors the original schema 1:1 but with every `club_id` /
-- `location_id` typed as TEXT so the FK on clubs(id) (and any future
-- club_locations(id) FK) lines up with what Sol2 actually has.
--
-- Apply this file on Sol2 INSTEAD OF the 2026-05-19 file. The rgdev DB
-- keeps using the original (UUID) migration.
--
-- IMPORTANT: if the original UUID-typed migration was *partially* applied
-- to Sol2 (some tables created with the wrong type), this file drops
-- those tables first so it can recreate them cleanly. There is no real
-- data to preserve — these tables only fill on cron + UI activity, and
-- if Sol2 had any insights they were unreachable due to the broken FK.
--
-- ─────────────────────────────────────────────────────────────────────────

-- ─── Clean up any partial UUID-typed install ─────────────────────────────
-- Safe because: (a) the FK never succeeded, so dependent rows can't exist;
-- (b) tables drop only if they exist; (c) we recreate immediately below.
DROP TABLE IF EXISTS "programming_draft" CASCADE;
DROP TABLE IF EXISTS "campaign_draft"    CASCADE;
DROP TABLE IF EXISTS "cohort_draft"      CASCADE;
DROP TABLE IF EXISTS "tier_config"       CASCADE;
DROP TABLE IF EXISTS "operational_signal" CASCADE;
DROP TABLE IF EXISTS "business_insight"  CASCADE;


-- ─── 1. business_insight ─────────────────────────────────────────────────
CREATE TABLE "business_insight" (
  "id"             TEXT         PRIMARY KEY,
  "club_id"        TEXT         NOT NULL,            -- TEXT to match Sol2 clubs.id
  "dedupe_key"     TEXT         NOT NULL,

  "category"       TEXT         NOT NULL,
  "severity"       TEXT         NOT NULL,

  "analysis"       TEXT         NOT NULL,
  "metrics"        JSONB        NOT NULL DEFAULT '{}'::jsonb,
  "insight"        TEXT         NOT NULL,
  "action"         JSONB        NOT NULL,

  "status"         TEXT         NOT NULL DEFAULT 'active',
  "created_at"     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "last_seen_at"   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "resolved_at"    TIMESTAMPTZ,
  "snooze_until"   TIMESTAMPTZ,

  CONSTRAINT "business_insight_club_id_fkey"
    FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "business_insight_active_dedupe_idx"
  ON "business_insight" ("club_id", "dedupe_key")
  WHERE "status" IN ('active', 'snoozed');

CREATE INDEX "business_insight_club_status_idx"
  ON "business_insight" ("club_id", "status");
CREATE INDEX "business_insight_club_category_idx"
  ON "business_insight" ("club_id", "category");
CREATE INDEX "business_insight_created_at_idx"
  ON "business_insight" ("created_at" DESC);


-- ─── 2. operational_signal ───────────────────────────────────────────────
CREATE TABLE "operational_signal" (
  "id"                 TEXT         PRIMARY KEY,
  "club_id"            TEXT         NOT NULL,        -- TEXT to match Sol2 clubs.id
  "location_id"        TEXT,                         -- TEXT for forward-compatible FK
  "dedupe_key"         TEXT         NOT NULL,

  "source"             TEXT         NOT NULL,
  "rule_key"           TEXT         NOT NULL,

  "subject_entity_id"  TEXT,
  "severity"           TEXT         NOT NULL,

  "subject"            TEXT         NOT NULL,
  "context"            JSONB        NOT NULL DEFAULT '{}'::jsonb,
  "action"             JSONB        NOT NULL,

  "status"             TEXT         NOT NULL DEFAULT 'active',
  "created_at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "last_seen_at"       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "resolved_at"        TIMESTAMPTZ,
  "snooze_until"       TIMESTAMPTZ,

  CONSTRAINT "operational_signal_club_id_fkey"
    FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "operational_signal_active_dedupe_idx"
  ON "operational_signal" ("club_id", "dedupe_key")
  WHERE "status" IN ('active', 'snoozed');

CREATE INDEX "operational_signal_club_status_idx"
  ON "operational_signal" ("club_id", "status");
CREATE INDEX "operational_signal_club_source_idx"
  ON "operational_signal" ("club_id", "source");
CREATE INDEX "operational_signal_club_severity_idx"
  ON "operational_signal" ("club_id", "severity");
CREATE INDEX "operational_signal_location_idx"
  ON "operational_signal" ("location_id")
  WHERE "location_id" IS NOT NULL;
CREATE INDEX "operational_signal_subject_idx"
  ON "operational_signal" ("club_id", "subject_entity_id")
  WHERE "subject_entity_id" IS NOT NULL;
CREATE INDEX "operational_signal_created_at_idx"
  ON "operational_signal" ("created_at" DESC);


-- ─── 3. tier_config ──────────────────────────────────────────────────────
CREATE TABLE "tier_config" (
  "club_id"       TEXT         PRIMARY KEY,          -- TEXT to match Sol2 clubs.id
  "overrides"     JSONB        NOT NULL DEFAULT '[]'::jsonb,
  "custom_rules"  JSONB        NOT NULL DEFAULT '[]'::jsonb,
  "updated_at"    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_by"    TEXT,                              -- users.id is TEXT in both DBs

  CONSTRAINT "tier_config_club_id_fkey"
    FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE,
  CONSTRAINT "tier_config_updated_by_fkey"
    FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL
);


-- ─── 4. cohort_draft ─────────────────────────────────────────────────────
CREATE TABLE "cohort_draft" (
  "id"                 TEXT         PRIMARY KEY,
  "club_id"            TEXT         NOT NULL,        -- TEXT
  "filters"            JSONB        NOT NULL,
  "suggested_name"     TEXT,
  "source_insight_id"  TEXT,
  "created_at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "expires_at"         TIMESTAMPTZ  NOT NULL DEFAULT (now() + INTERVAL '7 days'),

  CONSTRAINT "cohort_draft_club_id_fkey"
    FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE
);

CREATE INDEX "cohort_draft_club_idx"     ON "cohort_draft" ("club_id");
CREATE INDEX "cohort_draft_expires_idx"  ON "cohort_draft" ("expires_at");
CREATE INDEX "cohort_draft_source_idx"   ON "cohort_draft" ("source_insight_id")
  WHERE "source_insight_id" IS NOT NULL;


-- ─── 5. campaign_draft ───────────────────────────────────────────────────
CREATE TABLE "campaign_draft" (
  "id"                 TEXT         PRIMARY KEY,
  "club_id"            TEXT         NOT NULL,        -- TEXT
  "template_key"       TEXT         NOT NULL,
  "cohort_ref"         TEXT,
  "channel_mix"        JSONB,
  "source_insight_id"  TEXT,
  "created_at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "expires_at"         TIMESTAMPTZ  NOT NULL DEFAULT (now() + INTERVAL '7 days'),

  CONSTRAINT "campaign_draft_club_id_fkey"
    FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE
);

CREATE INDEX "campaign_draft_club_idx"     ON "campaign_draft" ("club_id");
CREATE INDEX "campaign_draft_expires_idx"  ON "campaign_draft" ("expires_at");
CREATE INDEX "campaign_draft_source_idx"   ON "campaign_draft" ("source_insight_id")
  WHERE "source_insight_id" IS NOT NULL;


-- ─── 6. programming_draft ────────────────────────────────────────────────
CREATE TABLE "programming_draft" (
  "id"                 TEXT         PRIMARY KEY,
  "club_id"            TEXT         NOT NULL,        -- TEXT
  "prefill"            JSONB        NOT NULL,
  "source_insight_id"  TEXT,
  "created_at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "expires_at"         TIMESTAMPTZ  NOT NULL DEFAULT (now() + INTERVAL '7 days'),

  CONSTRAINT "programming_draft_club_id_fkey"
    FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE
);

CREATE INDEX "programming_draft_club_idx"    ON "programming_draft" ("club_id");
CREATE INDEX "programming_draft_expires_idx" ON "programming_draft" ("expires_at");
CREATE INDEX "programming_draft_source_idx"  ON "programming_draft" ("source_insight_id")
  WHERE "source_insight_id" IS NOT NULL;


-- ─── End ─────────────────────────────────────────────────────────────────
-- After applying:
--   1. Do NOT run `prisma db pull` — that would rewrite schema.prisma
--      to TEXT for these tables and break the rgdev DB which uses UUID.
--      Sol2's Prisma client will coerce TEXT ↔ UUID at runtime via the
--      `@db.Uuid` casting Prisma does on the wire (UUID is a string for
--      Prisma JS anyway, so the round-trip works).
--   2. Restart any long-lived processes that cached the previous (broken)
--      schema state.
-- ─────────────────────────────────────────────────────────────────────────
