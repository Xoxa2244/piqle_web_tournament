-- Migration to replace poolsEnabled with poolCount
-- This migration adds poolCount field and migrates existing data

-- Add the new poolCount column
ALTER TABLE "divisions" ADD COLUMN IF NOT EXISTS "poolCount" INTEGER NOT NULL DEFAULT 1;

-- Migrate existing data: if poolsEnabled was true, set poolCount to 2, otherwise 1
UPDATE "divisions" 
SET "poolCount" = CASE 
  WHEN "poolsEnabled" = true THEN 2 
  ELSE 1 
END;

-- Drop the old poolsEnabled column
ALTER TABLE "divisions" DROP COLUMN IF EXISTS "poolsEnabled";

-- Create pools for existing divisions that have poolCount > 1
-- This will create pools for divisions that previously had poolsEnabled = true
INSERT INTO "pools" ("id", "divisionId", "name", "order", "createdAt", "updatedAt")
SELECT 
  gen_random_uuid(),
  d."id",
  'Pool ' || p.pool_number,
  p.pool_number,
  NOW(),
  NOW()
FROM "divisions" d
CROSS JOIN LATERAL (
  SELECT generate_series(1, d."poolCount") as pool_number
) p
WHERE d."poolCount" > 1
ON CONFLICT DO NOTHING;
