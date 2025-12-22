-- Migration to make game scores nullable
-- This allows games to be created without scores (for MLP tournaments)
-- Run this in Supabase SQL Editor or your database client

ALTER TABLE "games" 
  ALTER COLUMN "scoreA" DROP NOT NULL,
  ALTER COLUMN "scoreA" DROP DEFAULT,
  ALTER COLUMN "scoreB" DROP NOT NULL,
  ALTER COLUMN "scoreB" DROP DEFAULT;

