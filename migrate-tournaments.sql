-- Script to assign existing tournaments to test user
-- This will be run directly in Supabase SQL editor

-- First, make sure the test user exists
INSERT INTO users (id, email, name, role, "isActive", "createdAt", "updatedAt")
VALUES (
  'test-user-id',
  'test@example.com',
  'Test Tournament Director',
  'TD',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- Add userId column to tournaments table
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS "userId" TEXT;

-- Update existing tournaments to be assigned to the test user
UPDATE tournaments SET "userId" = 'test-user-id' WHERE "userId" IS NULL;

-- Make the column non-nullable
ALTER TABLE tournaments ALTER COLUMN "userId" SET NOT NULL;

-- Add foreign key constraint (only if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'tournaments_userId_fkey' 
        AND table_name = 'tournaments'
    ) THEN
        ALTER TABLE tournaments ADD CONSTRAINT tournaments_userId_fkey 
        FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE;
    END IF;
END $$;
