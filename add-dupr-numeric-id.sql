-- Add DUPR numeric ID field to users table
-- This is the integer ID needed for DUPR API calls (different from dupr_id which is a string like YG7RP4)

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS dupr_numeric_id BIGINT;

COMMENT ON COLUMN users.dupr_numeric_id IS 'DUPR numeric user ID (integer) for API calls, comes from event.id in postMessage';

