-- Add ladder formats to TournamentFormat enum
-- Note: PostgreSQL doesn't support ALTER TYPE ... ADD VALUE inside a transaction in some setups.
-- Run this migration separately if your migration runner wraps everything in a single transaction.

ALTER TYPE "TournamentFormat" ADD VALUE IF NOT EXISTS 'ONE_DAY_LADDER';
ALTER TYPE "TournamentFormat" ADD VALUE IF NOT EXISTS 'LADDER_LEAGUE';

COMMENT ON TYPE "TournamentFormat" IS 'Tournament format: SINGLE_ELIMINATION, ROUND_ROBIN, MLP, INDY_LEAGUE, LEAGUE_ROUND_ROBIN, ONE_DAY_LADDER, LADDER_LEAGUE';

