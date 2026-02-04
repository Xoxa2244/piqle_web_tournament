-- Add registration start and end date fields to tournaments table
ALTER TABLE tournaments 
ADD COLUMN IF NOT EXISTS registration_start_date TIMESTAMP,
ADD COLUMN IF NOT EXISTS registration_end_date TIMESTAMP;

COMMENT ON COLUMN tournaments.registration_start_date IS 'Start date for tournament registration';
COMMENT ON COLUMN tournaments.registration_end_date IS 'End date for tournament registration';
