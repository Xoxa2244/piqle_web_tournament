-- Add allowDuprSubmission field to tournaments table
ALTER TABLE tournaments 
ADD COLUMN IF NOT EXISTS allow_dupr_submission BOOLEAN DEFAULT false;

-- Add comment
COMMENT ON COLUMN tournaments.allow_dupr_submission IS 'Allow sending match results to DUPR API';

