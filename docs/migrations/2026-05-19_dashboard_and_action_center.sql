-- ─────────────────────────────────────────────────────────────────────────
-- Dashboard & Action Center — schema for canon-driven insights + signals
-- See: DASHBOARD_AND_ACTION_CENTER_SPEC.md §7.1
--
-- IMPORTANT (per CLAUDE.md): apply via psql/SQL, NOT prisma db push.
--   clubs.id  is UUID
--   users.id  is TEXT
--   *_id columns follow that convention.
--
-- This migration is IDEMPOTENT — safe to re-run on partially-applied state.
-- Every CREATE TABLE / CREATE INDEX uses IF NOT EXISTS and every constraint
-- is wrapped in a DO block that swallows duplicate_object errors.
--
-- Tables created (6):
--   1. business_insight       — Dashboard insights (canon-driven, persisted)
--   2. operational_signal     — Action Center feed (per-subject signals)
--   3. tier_config            — Per-club tier overrides + custom rules
--   4. cohort_draft           — Deeplink prefill for Cohorts builder
--   5. campaign_draft         — Deeplink prefill for Campaign wizard
--   6. programming_draft      — Deeplink prefill for Programming IQ
-- ─────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────
-- 1. business_insight
-- ─────────────────────────────────────────────────────────────────────────
--
-- Canon-driven Dashboard insight (Spec §2 + §3.6).
-- One row per "active" or "snoozed" insight per (club_id, dedupe_key).
-- Resolved/dismissed rows are kept for history; the partial unique index
-- below only enforces uniqueness on still-actionable states so a re-run
-- of the same insight after resolution re-INSERTs cleanly.
--
-- action JSONB shape: UnifiedAction (Spec §2).
-- metrics JSONB shape: Record<string, number>.

CREATE TABLE IF NOT EXISTS "business_insight" (
  "id"             TEXT         PRIMARY KEY,
  "club_id"        UUID         NOT NULL,
  "dedupe_key"     TEXT         NOT NULL,

  "category"       TEXT         NOT NULL,           -- retention | growth | optimization | risk
  "severity"       TEXT         NOT NULL,           -- high | medium | low

  "analysis"       TEXT         NOT NULL,
  "metrics"        JSONB        NOT NULL DEFAULT '{}'::jsonb,
  "insight"        TEXT         NOT NULL,
  "action"         JSONB        NOT NULL,           -- UnifiedAction

  "status"         TEXT         NOT NULL DEFAULT 'active',
                                                    -- active | snoozed | resolved | dismissed
  "created_at"     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "last_seen_at"   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "resolved_at"    TIMESTAMPTZ,
  "snooze_until"   TIMESTAMPTZ
);

DO $$ BEGIN
  ALTER TABLE "business_insight"
    ADD CONSTRAINT "business_insight_club_id_fkey"
      FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Only one active/snoozed row per (club, dedupe_key). Resolved rows
-- accumulate for audit/history.
CREATE UNIQUE INDEX IF NOT EXISTS "business_insight_active_dedupe_idx"
  ON "business_insight" ("club_id", "dedupe_key")
  WHERE "status" IN ('active', 'snoozed');

CREATE INDEX IF NOT EXISTS "business_insight_club_status_idx"
  ON "business_insight" ("club_id", "status");
CREATE INDEX IF NOT EXISTS "business_insight_club_category_idx"
  ON "business_insight" ("club_id", "category");
CREATE INDEX IF NOT EXISTS "business_insight_created_at_idx"
  ON "business_insight" ("created_at" DESC);


-- ─────────────────────────────────────────────────────────────────────────
-- 2. operational_signal
-- ─────────────────────────────────────────────────────────────────────────
--
-- Action Center feed (Spec §4.3).
-- Per-subject signal from one of: member_health | membership_lifecycle |
-- scorecard_execution | league_gap | vip_at_risk.
--
-- dedupe_key format (Spec §7.1): "${ruleKey}:${locationId ?? 'global'}:${subjectId ?? 'none'}"
--
-- action JSONB shape: UnifiedAction (Spec §2).

CREATE TABLE IF NOT EXISTS "operational_signal" (
  "id"                 TEXT         PRIMARY KEY,
  "club_id"            UUID         NOT NULL,
  "location_id"        UUID,                          -- nullable: some signals are global
  "dedupe_key"         TEXT         NOT NULL,

  "source"             TEXT         NOT NULL,
                                                      -- member_health | membership_lifecycle |
                                                      -- scorecard_execution | league_gap | vip_at_risk
  "rule_key"           TEXT         NOT NULL,

  "subject_entity_id"  TEXT,                          -- userId | sessionId | leagueFamilyId
  "severity"           TEXT         NOT NULL,         -- critical | warning | nudge

  "subject"            TEXT         NOT NULL,
  "context"            JSONB        NOT NULL DEFAULT '{}'::jsonb,
  "action"             JSONB        NOT NULL,         -- UnifiedAction

  "status"             TEXT         NOT NULL DEFAULT 'active',
                                                      -- active | snoozed | resolved | dismissed
  "created_at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "last_seen_at"       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "resolved_at"        TIMESTAMPTZ,
  "snooze_until"       TIMESTAMPTZ
);

DO $$ BEGIN
  ALTER TABLE "operational_signal"
    ADD CONSTRAINT "operational_signal_club_id_fkey"
      FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Same partial-unique pattern: only one active/snoozed per (club, dedupe).
CREATE UNIQUE INDEX IF NOT EXISTS "operational_signal_active_dedupe_idx"
  ON "operational_signal" ("club_id", "dedupe_key")
  WHERE "status" IN ('active', 'snoozed');

CREATE INDEX IF NOT EXISTS "operational_signal_club_status_idx"
  ON "operational_signal" ("club_id", "status");
CREATE INDEX IF NOT EXISTS "operational_signal_club_source_idx"
  ON "operational_signal" ("club_id", "source");
CREATE INDEX IF NOT EXISTS "operational_signal_club_severity_idx"
  ON "operational_signal" ("club_id", "severity");
CREATE INDEX IF NOT EXISTS "operational_signal_location_idx"
  ON "operational_signal" ("location_id")
  WHERE "location_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "operational_signal_subject_idx"
  ON "operational_signal" ("club_id", "subject_entity_id")
  WHERE "subject_entity_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "operational_signal_created_at_idx"
  ON "operational_signal" ("created_at" DESC);


-- ─────────────────────────────────────────────────────────────────────────
-- 3. tier_config
-- ─────────────────────────────────────────────────────────────────────────
--
-- Per-club Tier Constructor configuration (Spec §4.4).
-- One row per club (PRIMARY KEY = club_id), so no separate dedupe needed.
--
-- overrides JSONB shape: TierOverride[]      (up to 7 items, one per tier)
-- custom_rules JSONB shape: ClassifierRule[] (extensions for classifier)

CREATE TABLE IF NOT EXISTS "tier_config" (
  "club_id"       UUID         PRIMARY KEY,
  "overrides"     JSONB        NOT NULL DEFAULT '[]'::jsonb,
  "custom_rules"  JSONB        NOT NULL DEFAULT '[]'::jsonb,
  "updated_at"    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_by"    TEXT
);

DO $$ BEGIN
  ALTER TABLE "tier_config"
    ADD CONSTRAINT "tier_config_club_id_fkey"
      FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "tier_config"
    ADD CONSTRAINT "tier_config_updated_by_fkey"
      FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ─────────────────────────────────────────────────────────────────────────
-- 4. cohort_draft — deeplink prefill for Cohorts builder (Spec §8.1)
-- ─────────────────────────────────────────────────────────────────────────
--
-- filters JSONB shape: CohortFilter[] (must match cohortFilterSchema in
-- server/routers/intelligence.ts; see Spec §5.4).
-- source_insight_id is nullable — drafts can also be created manually
-- (e.g. operator clicks a quick-cohort suggestion outside the insight feed).
-- expires_at defaults to 7 days post-creation; daily cron sweeps expired.

CREATE TABLE IF NOT EXISTS "cohort_draft" (
  "id"                 TEXT         PRIMARY KEY,
  "club_id"            UUID         NOT NULL,
  "filters"            JSONB        NOT NULL,        -- CohortFilter[]
  "suggested_name"     TEXT,
  "source_insight_id"  TEXT,                         -- business_insight.id OR operational_signal.id
  "created_at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "expires_at"         TIMESTAMPTZ  NOT NULL DEFAULT (now() + INTERVAL '7 days')
);

DO $$ BEGIN
  ALTER TABLE "cohort_draft"
    ADD CONSTRAINT "cohort_draft_club_id_fkey"
      FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "cohort_draft_club_idx"
  ON "cohort_draft" ("club_id");
CREATE INDEX IF NOT EXISTS "cohort_draft_expires_idx"
  ON "cohort_draft" ("expires_at");
CREATE INDEX IF NOT EXISTS "cohort_draft_source_idx"
  ON "cohort_draft" ("source_insight_id")
  WHERE "source_insight_id" IS NOT NULL;


-- ─────────────────────────────────────────────────────────────────────────
-- 5. campaign_draft — deeplink prefill for Campaign wizard
-- ─────────────────────────────────────────────────────────────────────────
--
-- template_key matches keys consumed by Campaign wizard step 2.
-- cohort_ref can be a saved cohort ID or a cohort_draft.id reference.
-- channel_mix JSONB shape: { email?: bool, sms?: bool, ... } (optional —
-- wizard fills sensible defaults if absent).

CREATE TABLE IF NOT EXISTS "campaign_draft" (
  "id"                 TEXT         PRIMARY KEY,
  "club_id"            UUID         NOT NULL,
  "template_key"       TEXT         NOT NULL,
  "cohort_ref"         TEXT,                         -- club_cohorts.id OR cohort_draft.id
  "channel_mix"        JSONB,                       -- optional channel selection
  "source_insight_id"  TEXT,
  "created_at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "expires_at"         TIMESTAMPTZ  NOT NULL DEFAULT (now() + INTERVAL '7 days')
);

DO $$ BEGIN
  ALTER TABLE "campaign_draft"
    ADD CONSTRAINT "campaign_draft_club_id_fkey"
      FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "campaign_draft_club_idx"
  ON "campaign_draft" ("club_id");
CREATE INDEX IF NOT EXISTS "campaign_draft_expires_idx"
  ON "campaign_draft" ("expires_at");
CREATE INDEX IF NOT EXISTS "campaign_draft_source_idx"
  ON "campaign_draft" ("source_insight_id")
  WHERE "source_insight_id" IS NOT NULL;


-- ─────────────────────────────────────────────────────────────────────────
-- 6. programming_draft — deeplink prefill for Programming IQ
-- ─────────────────────────────────────────────────────────────────────────
--
-- prefill JSONB shape: ProgrammingPrefill (date | dateRange, startHour,
-- format hint, court hint, parallel-to-existing flag, etc.) — full
-- schema documented in lib/ai/programming-iq-scheduler.ts.

CREATE TABLE IF NOT EXISTS "programming_draft" (
  "id"                 TEXT         PRIMARY KEY,
  "club_id"            UUID         NOT NULL,
  "prefill"            JSONB        NOT NULL,        -- ProgrammingPrefill
  "source_insight_id"  TEXT,
  "created_at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "expires_at"         TIMESTAMPTZ  NOT NULL DEFAULT (now() + INTERVAL '7 days')
);

DO $$ BEGIN
  ALTER TABLE "programming_draft"
    ADD CONSTRAINT "programming_draft_club_id_fkey"
      FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "programming_draft_club_idx"
  ON "programming_draft" ("club_id");
CREATE INDEX IF NOT EXISTS "programming_draft_expires_idx"
  ON "programming_draft" ("expires_at");
CREATE INDEX IF NOT EXISTS "programming_draft_source_idx"
  ON "programming_draft" ("source_insight_id")
  WHERE "source_insight_id" IS NOT NULL;


-- ─────────────────────────────────────────────────────────────────────────
-- End of migration. After applying:
--   1. Run `pnpm prisma db pull` to regenerate prisma/schema.prisma
--   2. Manually verify the 6 new models in schema.prisma
--   3. `pnpm prisma generate` to rebuild the client
--   4. Reference §7.5 for next implementation step
-- ─────────────────────────────────────────────────────────────────────────
