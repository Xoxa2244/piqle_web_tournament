-- Add sendToDupr field to matches table
ALTER TABLE matches
ADD COLUMN IF NOT EXISTS send_to_dupr BOOLEAN DEFAULT false;

COMMENT ON COLUMN matches.send_to_dupr IS 'Flag indicating if match results should be sent to DUPR';

