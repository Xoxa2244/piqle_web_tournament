-- Migration: Add director_user_id to partners table
-- Run this in Supabase SQL editor

-- Add director_user_id column to partners table
ALTER TABLE partners 
ADD COLUMN IF NOT EXISTS director_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_partners_director_user_id ON partners(director_user_id);

-- Add comment
COMMENT ON COLUMN partners.director_user_id IS 'User ID of the tournament director who manages tournaments for this partner';

