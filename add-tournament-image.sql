-- Add image field to tournaments table
ALTER TABLE tournaments 
ADD COLUMN IF NOT EXISTS image TEXT;

-- Add comment
COMMENT ON COLUMN tournaments.image IS 'Tournament image URL (stored in Supabase Storage)';

