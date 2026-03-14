-- ============================================================
-- Email/SMS Tracking Columns — Migration
-- Adds webhook tracking fields to ai_recommendation_logs
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Add tracking columns
ALTER TABLE "public"."ai_recommendation_logs"
  ADD COLUMN IF NOT EXISTS "externalMessageId" TEXT,
  ADD COLUMN IF NOT EXISTS "variantId" TEXT,
  ADD COLUMN IF NOT EXISTS "openedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "clickedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "bouncedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "bounceType" TEXT;

-- 2. Index for webhook lookups (Mandrill/Twilio POST with message ID)
CREATE INDEX IF NOT EXISTS "ai_recommendation_logs_externalMessageId_idx"
  ON "public"."ai_recommendation_logs"("externalMessageId");

-- 3. Index for variant performance analytics
CREATE INDEX IF NOT EXISTS "ai_recommendation_logs_variantId_type_idx"
  ON "public"."ai_recommendation_logs"("variantId", "type");

-- 4. Index for tracking analytics (find messages with opens/clicks)
CREATE INDEX IF NOT EXISTS "ai_recommendation_logs_clubId_type_status_idx"
  ON "public"."ai_recommendation_logs"("clubId", "type", "status");
