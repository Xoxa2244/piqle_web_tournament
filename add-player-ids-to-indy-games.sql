-- Migration: Add player IDs to indy_games table
-- This allows games to remember which players were selected at generation time
-- even if the roster is changed later
-- Run this in Supabase SQL editor

-- Add columns for storing player IDs
ALTER TABLE indy_games
ADD COLUMN IF NOT EXISTS home_player1_id TEXT REFERENCES players(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS home_player2_id TEXT REFERENCES players(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS away_player1_id TEXT REFERENCES players(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS away_player2_id TEXT REFERENCES players(id) ON DELETE SET NULL;

-- Add comments
COMMENT ON COLUMN indy_games.home_player1_id IS 'Player ID for first letter in homePair (saved at game generation time)';
COMMENT ON COLUMN indy_games.home_player2_id IS 'Player ID for second letter in homePair (saved at game generation time)';
COMMENT ON COLUMN indy_games.away_player1_id IS 'Player ID for first letter in awayPair (saved at game generation time)';
COMMENT ON COLUMN indy_games.away_player2_id IS 'Player ID for second letter in awayPair (saved at game generation time)';

