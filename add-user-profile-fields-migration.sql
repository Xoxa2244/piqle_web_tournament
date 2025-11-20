-- Migration: Add user profile fields (gender, city, duprLink)
-- This migration adds fields to support user profile information

-- Create Gender enum if it doesn't exist
DO $$ BEGIN
    CREATE TYPE "Gender" AS ENUM ('M', 'F', 'X');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add gender column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS gender "Gender";

-- Add city column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS city VARCHAR(255);

-- Add duprLink column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS "duprLink" VARCHAR(255);

-- Add comments for clarity
COMMENT ON COLUMN users.gender IS 'User gender: M (Male), F (Female), X (Other)';
COMMENT ON COLUMN users.city IS 'User city/location';
COMMENT ON COLUMN users."duprLink" IS 'Link to DUPR profile';
