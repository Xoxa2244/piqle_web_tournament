-- Migration: Add PLAYER role to UserRole enum
-- This migration adds a new role for regular players who are not tournament directors

-- Step 1: Add PLAYER value to UserRole enum (if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'PLAYER' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'UserRole')
    ) THEN
        ALTER TYPE "UserRole" ADD VALUE 'PLAYER';
    END IF;
END $$;

-- Step 2: Update default role for users table (optional - for new users)
-- Note: This doesn't change existing users, only affects new sign-ups
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'PLAYER';

-- Step 3: Verify the changes
SELECT 
    enumlabel as role_value
FROM pg_enum
JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
WHERE pg_type.typname = 'UserRole'
ORDER BY enumsortorder;

-- Step 4: Check current role distribution
SELECT 
    role,
    COUNT(*) as user_count
FROM users
GROUP BY role
ORDER BY role;

