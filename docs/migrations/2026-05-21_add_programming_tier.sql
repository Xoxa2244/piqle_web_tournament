-- ─────────────────────────────────────────────────────────────────────────
-- Programming Tier — IPC × IQSport roadmap P1.4
--
-- Adds:
--   1. ProgrammingTier enum (8 values: T1-T7 + UNCLASSIFIED)
--   2. play_sessions.programming_tier column (defaults to UNCLASSIFIED)
--   3. Composite index for tier-based queries in the intelligence engine
--
-- This file is the canonical Sol2 production migration. The Prisma schema
-- (prisma/schema.prisma) is updated in lockstep but never applied via
-- `prisma db push` — Sol2 and rgdev have diverging clubs.id types (TEXT
-- vs UUID) so all DDL goes through these versioned SQL files.
--
-- Apply on Sol2 prod Supabase via SQL Editor as one block. Idempotent:
--   - CREATE TYPE wrapped in EXISTS check
--   - ADD COLUMN uses IF NOT EXISTS
--   - CREATE INDEX uses IF NOT EXISTS
-- Re-running is safe; nothing is dropped or modified.
--
-- After applying:
--   - Existing sessions: programming_tier = 'UNCLASSIFIED' (until backfill)
--   - New CR-synced sessions: same, until P1.4.3 wires the classifier
--   - Backfill script (scripts/backfill-programming-tier.ts, P1.4.4) sets
--     real values once we ship the classifier.
-- ─────────────────────────────────────────────────────────────────────────

-- ─── 1. ProgrammingTier enum ────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProgrammingTier') THEN
    CREATE TYPE "ProgrammingTier" AS ENUM (
      'T1_CORE',
      'T2_LEAGUE',
      'T3_SIGNATURE',
      'T4_SOCIAL',
      'T5_TOURNAMENT',
      'T6_PREMIUM',
      'T7_YOUTH',
      'UNCLASSIFIED'
    );
  END IF;
END $$;

-- ─── 2. play_sessions.programming_tier column ──────────────────────────
-- NOT NULL with DEFAULT 'UNCLASSIFIED' so existing rows get filled
-- automatically without a separate UPDATE. Postgres handles this
-- efficiently — fast-path metadata-only operation on PG 11+.
ALTER TABLE play_sessions
  ADD COLUMN IF NOT EXISTS programming_tier "ProgrammingTier"
    NOT NULL
    DEFAULT 'UNCLASSIFIED';

-- ─── 3. Index for tier-based queries ───────────────────────────────────
-- Intelligence engine filters by (clubId, programming_tier, date) for
-- weekly Programming Health rollups. Composite index covers that path.
-- Date is included so range scans within a tier+club don't need a
-- post-filter step.
CREATE INDEX IF NOT EXISTS play_sessions_tier_club_date_idx
  ON play_sessions (programming_tier, "clubId", "date");

-- ─── Sanity check (Supabase will surface as NOTICE) ────────────────────
DO $$
DECLARE
  total       BIGINT;
  unclassified BIGINT;
BEGIN
  SELECT COUNT(*) INTO total FROM play_sessions;
  SELECT COUNT(*) INTO unclassified FROM play_sessions WHERE programming_tier = 'UNCLASSIFIED';
  RAISE NOTICE 'play_sessions total: %, UNCLASSIFIED: % (expected: equal after first apply)', total, unclassified;
END $$;
