-- Add LEAGUE_ROUND_ROBIN to TournamentFormat enum
ALTER TYPE "TournamentFormat" ADD VALUE IF NOT EXISTS 'LEAGUE_ROUND_ROBIN';

-- Add match_day_id to matches for League Round Robin (optional)
-- match_days.id is TEXT (Prisma String/uuid), so match_day_id must be TEXT
ALTER TABLE matches
ADD COLUMN IF NOT EXISTS match_day_id TEXT REFERENCES match_days(id) ON DELETE SET NULL;

COMMENT ON COLUMN matches.match_day_id IS 'League Round Robin: RR matches are scoped by match day';
