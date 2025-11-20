-- Migration: Add user profile fields (gender, city, duprLink)
-- This migration adds fields to the users table to support user profiles

-- Add gender field (ENUM: M, F, X)
ALTER TABLE users ADD COLUMN IF NOT EXISTS "gender" VARCHAR(1);

-- Add city field (string)
ALTER TABLE users ADD COLUMN IF NOT EXISTS "city" VARCHAR(255);

-- Add duprLink field (string, nullable URL)
ALTER TABLE users ADD COLUMN IF NOT EXISTS "duprLink" VARCHAR(255);

-- Add comment to clarify the fields
COMMENT ON COLUMN users.gender IS 'User gender: M (Male), F (Female), X (Other)';
COMMENT ON COLUMN users.city IS 'User city/location';
COMMENT ON COLUMN users.duprLink IS 'Link to user DUPR profile';

