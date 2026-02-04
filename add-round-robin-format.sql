-- Add ROUND_ROBIN to TournamentFormat enum
-- Note: PostgreSQL doesn't support ALTER TYPE ... ADD VALUE in a transaction
-- This needs to be run manually or as a separate migration

-- For PostgreSQL:
ALTER TYPE "TournamentFormat" ADD VALUE IF NOT EXISTS 'ROUND_ROBIN';

-- Add comment
COMMENT ON TYPE "TournamentFormat" IS 'Tournament format: SINGLE_ELIMINATION, ROUND_ROBIN, MLP, INDY_LEAGUE';
