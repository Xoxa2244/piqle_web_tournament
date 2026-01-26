-- Add image field to tournaments table
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tournaments' AND column_name = 'image'
    ) THEN
        ALTER TABLE tournaments ADD COLUMN image TEXT;
    END IF;
END $$;

-- Add comment
COMMENT ON COLUMN tournaments.image IS 'URL to tournament image stored in Supabase Storage';

