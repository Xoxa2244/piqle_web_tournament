-- Migration: Add IndyLeague tournament type and related tables
-- Run this in Supabase SQL editor

-- 1. Add INDY_LEAGUE to TournamentFormat enum
DO $$ BEGIN
    CREATE TYPE "MatchDayStatus" AS ENUM (
        'DRAFT',
        'IN_PROGRESS',
        'FINALIZED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "MatchupStatus" AS ENUM (
        'PENDING',
        'READY',
        'IN_PROGRESS',
        'COMPLETED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add INDY_LEAGUE to TournamentFormat enum
DO $$ BEGIN
    ALTER TYPE "TournamentFormat" ADD VALUE IF NOT EXISTS 'INDY_LEAGUE';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Add new fields to tournaments table
ALTER TABLE tournaments
ADD COLUMN IF NOT EXISTS season_label TEXT,
ADD COLUMN IF NOT EXISTS timezone TEXT;

COMMENT ON COLUMN tournaments.season_label IS 'Season label for IndyLeague tournaments';
COMMENT ON COLUMN tournaments.timezone IS 'Timezone for IndyLeague tournaments';

-- 3. Create match_days table
CREATE TABLE IF NOT EXISTS match_days (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    status "MatchDayStatus" NOT NULL DEFAULT 'DRAFT',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT match_days_tournament_date_unique UNIQUE (tournament_id, date)
);

CREATE INDEX IF NOT EXISTS idx_match_days_tournament_id ON match_days(tournament_id);
CREATE INDEX IF NOT EXISTS idx_match_days_date ON match_days(date);

COMMENT ON TABLE match_days IS 'Match days for IndyLeague tournaments';
COMMENT ON COLUMN match_days.date IS 'Date of the match day (unique per tournament)';
COMMENT ON COLUMN match_days.status IS 'Status of the match day: DRAFT, IN_PROGRESS, FINALIZED';

-- 4. Create indy_matchups table
CREATE TABLE IF NOT EXISTS indy_matchups (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    match_day_id TEXT NOT NULL REFERENCES match_days(id) ON DELETE CASCADE,
    division_id TEXT NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
    home_team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    away_team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    tie_break_winner_team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
    games_won_home INT NOT NULL DEFAULT 0,
    games_won_away INT NOT NULL DEFAULT 0,
    status "MatchupStatus" NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_indy_matchups_match_day_id ON indy_matchups(match_day_id);
CREATE INDEX IF NOT EXISTS idx_indy_matchups_division_id ON indy_matchups(division_id);
CREATE INDEX IF NOT EXISTS idx_indy_matchups_match_day_division ON indy_matchups(match_day_id, division_id);
CREATE INDEX IF NOT EXISTS idx_indy_matchups_home_team_id ON indy_matchups(home_team_id);
CREATE INDEX IF NOT EXISTS idx_indy_matchups_away_team_id ON indy_matchups(away_team_id);

COMMENT ON TABLE indy_matchups IS 'Matchups (matches) for IndyLeague match days';
COMMENT ON COLUMN indy_matchups.games_won_home IS 'Number of games won by home team';
COMMENT ON COLUMN indy_matchups.games_won_away IS 'Number of games won by away team';
COMMENT ON COLUMN indy_matchups.tie_break_winner_team_id IS 'Winner of tie-break when games are 6-6';

-- 5. Create day_rosters table
CREATE TABLE IF NOT EXISTS day_rosters (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    matchup_id TEXT NOT NULL REFERENCES indy_matchups(id) ON DELETE CASCADE,
    team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT false,
    letter VARCHAR(1) CHECK (letter IN ('A', 'B', 'C', 'D')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT day_rosters_matchup_team_player_unique UNIQUE (matchup_id, team_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_day_rosters_matchup_id ON day_rosters(matchup_id);
CREATE INDEX IF NOT EXISTS idx_day_rosters_team_id ON day_rosters(team_id);
CREATE INDEX IF NOT EXISTS idx_day_rosters_player_id ON day_rosters(player_id);
CREATE INDEX IF NOT EXISTS idx_day_rosters_matchup_team_active ON day_rosters(matchup_id, team_id, is_active);

COMMENT ON TABLE day_rosters IS 'Day rosters for IndyLeague matchups';
COMMENT ON COLUMN day_rosters.is_active IS 'Whether player is active for this matchup (exactly 4 per team)';
COMMENT ON COLUMN day_rosters.letter IS 'Letter assignment (A/B/C/D) for active players';

-- 6. Create indy_games table
CREATE TABLE IF NOT EXISTS indy_games (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    matchup_id TEXT NOT NULL REFERENCES indy_matchups(id) ON DELETE CASCADE,
    "order" INT NOT NULL CHECK ("order" >= 1 AND "order" <= 12),
    court INT NOT NULL CHECK (court IN (1, 2)),
    home_pair VARCHAR(2) NOT NULL CHECK (home_pair IN ('AB', 'CD', 'AC', 'BD', 'AD', 'BC')),
    away_pair VARCHAR(2) NOT NULL CHECK (away_pair IN ('AB', 'CD', 'AC', 'BD', 'AD', 'BC')),
    home_score INT,
    away_score INT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT indy_games_matchup_order_unique UNIQUE (matchup_id, "order"),
    CONSTRAINT indy_games_no_tie CHECK (home_score IS NULL OR away_score IS NULL OR home_score != away_score)
);

CREATE INDEX IF NOT EXISTS idx_indy_games_matchup_id ON indy_games(matchup_id);
CREATE INDEX IF NOT EXISTS idx_indy_games_matchup_court ON indy_games(matchup_id, court);

COMMENT ON TABLE indy_games IS 'Individual games (1-12) for IndyLeague matchups';
COMMENT ON COLUMN indy_games."order" IS 'Game order (1-12)';
COMMENT ON COLUMN indy_games.court IS 'Court number (1 or 2)';
COMMENT ON COLUMN indy_games.home_pair IS 'Home team pair (AB, CD, AC, BD, AD, BC)';
COMMENT ON COLUMN indy_games.away_pair IS 'Away team pair (AB, CD, AC, BD, AD, BC)';
COMMENT ON COLUMN indy_games.home_score IS 'Home team score (nullable until entered)';
COMMENT ON COLUMN indy_games.away_score IS 'Away team score (nullable until entered)';

-- 7. Add updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_match_days_updated_at BEFORE UPDATE ON match_days
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_indy_matchups_updated_at BEFORE UPDATE ON indy_matchups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_day_rosters_updated_at BEFORE UPDATE ON day_rosters
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_indy_games_updated_at BEFORE UPDATE ON indy_games
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

