-- Add note column to matches table
ALTER TABLE matches ADD COLUMN note VARCHAR(255);

-- Add comment to explain the column
COMMENT ON COLUMN matches.note IS 'Optional note for special matches (e.g., "Third Place Match")';
