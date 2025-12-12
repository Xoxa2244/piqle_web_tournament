-- Add DUPR submission status fields to matches table
-- This tracks whether match results have been sent to DUPR

-- Create enum for submission status
DO $$ BEGIN
    CREATE TYPE "DuprSubmissionStatus" AS ENUM (
        'PENDING',    -- Not yet submitted (default)
        'SUCCESS',    -- Successfully submitted to DUPR
        'FAILED'      -- Submission failed (can retry)
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add columns to matches table
ALTER TABLE matches 
ADD COLUMN IF NOT EXISTS dupr_submission_status "DuprSubmissionStatus" DEFAULT 'PENDING',
ADD COLUMN IF NOT EXISTS dupr_match_id TEXT,
ADD COLUMN IF NOT EXISTS dupr_submission_error TEXT,
ADD COLUMN IF NOT EXISTS dupr_submitted_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS dupr_retry_count INTEGER DEFAULT 0;

-- Add comments
COMMENT ON COLUMN matches.dupr_submission_status IS 'Status of DUPR submission: PENDING (not sent), SUCCESS (sent successfully), FAILED (error occurred)';
COMMENT ON COLUMN matches.dupr_match_id IS 'DUPR match ID returned from DUPR API after successful submission';
COMMENT ON COLUMN matches.dupr_submission_error IS 'Error message if submission to DUPR failed';
COMMENT ON COLUMN matches.dupr_submitted_at IS 'Timestamp when match was successfully submitted to DUPR';
COMMENT ON COLUMN matches.dupr_retry_count IS 'Number of retry attempts for failed submissions';

-- Add index for faster queries on submission status
CREATE INDEX IF NOT EXISTS idx_matches_dupr_submission_status 
ON matches(dupr_submission_status) 
WHERE dupr_submission_status IN ('PENDING', 'FAILED');

-- Add index for finding matches by DUPR match ID
CREATE INDEX IF NOT EXISTS idx_matches_dupr_match_id 
ON matches(dupr_match_id) 
WHERE dupr_match_id IS NOT NULL;

