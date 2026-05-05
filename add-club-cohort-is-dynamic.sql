-- Migration: add is_dynamic to club_cohorts
-- Required because Prisma schema and server code already expect this column.
ALTER TABLE "club_cohorts"
ADD COLUMN IF NOT EXISTS "is_dynamic" BOOLEAN NOT NULL DEFAULT true;
