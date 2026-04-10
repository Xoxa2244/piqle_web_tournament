-- ============================================================
-- Intelligence Module — Full Migration
-- Generated from prisma/schema.prisma via `prisma migrate diff`
-- Run this in Supabase SQL Editor
-- ============================================================

-- =============================================
-- 1. ENUMS
-- =============================================

CREATE TYPE "public"."PlaySessionFormat" AS ENUM ('OPEN_PLAY', 'CLINIC', 'DRILL', 'LEAGUE_PLAY', 'SOCIAL');
CREATE TYPE "public"."PlaySessionSkillLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ALL_LEVELS');
CREATE TYPE "public"."PlaySessionStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "public"."BookingStatus" AS ENUM ('CONFIRMED', 'CANCELLED', 'NO_SHOW');
CREATE TYPE "public"."WaitlistEntryStatus" AS ENUM ('WAITING', 'PROMOTED', 'EXPIRED');
CREATE TYPE "public"."AIRecommendationType" AS ENUM ('SLOT_FILLER', 'REACTIVATION', 'WEEKLY_PLAN', 'EVENT_INVITE', 'DYNAMIC_PRICING', 'REBOOKING', 'AI_ADVISOR', 'CHURN_PREDICTION', 'GROUP_CHEMISTRY', 'AUTOPILOT', 'CHECK_IN', 'RETENTION_BOOST');

-- =============================================
-- 2. TABLES
-- =============================================

CREATE TABLE "public"."club_courts" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "courtType" TEXT,
    "isIndoor" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "club_courts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."play_sessions" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "courtId" TEXT,
    "hostId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "format" "public"."PlaySessionFormat" NOT NULL DEFAULT 'OPEN_PLAY',
    "skillLevel" "public"."PlaySessionSkillLevel" NOT NULL DEFAULT 'ALL_LEVELS',
    "maxPlayers" INTEGER NOT NULL DEFAULT 8,
    "pricePerSlot" DOUBLE PRECISION,
    "status" "public"."PlaySessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "play_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."play_session_bookings" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "public"."BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "bookedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "checkedInAt" TIMESTAMP(3),
    CONSTRAINT "play_session_bookings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."play_session_waitlist" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "public"."WaitlistEntryStatus" NOT NULL DEFAULT 'WAITING',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "promotedAt" TIMESTAMP(3),
    CONSTRAINT "play_session_waitlist_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."user_play_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "preferredDays" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredTimeMorning" BOOLEAN NOT NULL DEFAULT true,
    "preferredTimeAfternoon" BOOLEAN NOT NULL DEFAULT true,
    "preferredTimeEvening" BOOLEAN NOT NULL DEFAULT true,
    "skillLevel" "public"."PlaySessionSkillLevel" NOT NULL DEFAULT 'ALL_LEVELS',
    "preferredFormats" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetSessionsPerWeek" INTEGER NOT NULL DEFAULT 2,
    "notifications_opt_out" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "user_play_preferences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."ai_recommendation_logs" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "public"."AIRecommendationType" NOT NULL,
    "sessionId" TEXT,
    "channel" TEXT,
    "score" DOUBLE PRECISION,
    "reasoning" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_recommendation_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."document_embeddings" (
    "id" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "source_id" TEXT,
    "source_table" TEXT,
    "chunk_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "document_embeddings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."ai_conversations" (
    "id" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT,
    "language" TEXT,
    "summary" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."ai_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."member_health_snapshots" (
    "id" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "health_score" INTEGER NOT NULL,
    "risk_level" TEXT NOT NULL,
    "lifecycle_stage" TEXT NOT NULL,
    "features" JSONB NOT NULL DEFAULT '{}',
    "actually_churned" BOOLEAN,
    CONSTRAINT "member_health_snapshots_pkey" PRIMARY KEY ("id")
);

-- =============================================
-- 3. UNIQUE CONSTRAINTS
-- =============================================

CREATE UNIQUE INDEX "play_session_bookings_sessionId_userId_key" ON "public"."play_session_bookings"("sessionId", "userId");
CREATE UNIQUE INDEX "play_session_waitlist_sessionId_userId_key" ON "public"."play_session_waitlist"("sessionId", "userId");
CREATE UNIQUE INDEX "user_play_preferences_userId_clubId_key" ON "public"."user_play_preferences"("userId", "clubId");

-- =============================================
-- 4. INDEXES
-- =============================================

CREATE INDEX "ai_recommendation_logs_userId_clubId_createdAt_idx" ON "public"."ai_recommendation_logs"("userId", "clubId", "createdAt");
CREATE INDEX "ai_recommendation_logs_userId_sessionId_type_idx" ON "public"."ai_recommendation_logs"("userId", "sessionId", "type");
CREATE INDEX "document_embeddings_club_id_idx" ON "public"."document_embeddings"("club_id");
CREATE INDEX "document_embeddings_content_type_idx" ON "public"."document_embeddings"("content_type");
CREATE INDEX "document_embeddings_source_id_source_table_idx" ON "public"."document_embeddings"("source_id", "source_table");
CREATE INDEX "ai_conversations_club_id_user_id_idx" ON "public"."ai_conversations"("club_id", "user_id");
CREATE INDEX "ai_conversations_updated_at_idx" ON "public"."ai_conversations"("updated_at" DESC);
CREATE INDEX "ai_messages_conversation_id_idx" ON "public"."ai_messages"("conversation_id");
CREATE INDEX "ai_messages_created_at_idx" ON "public"."ai_messages"("created_at");
CREATE INDEX "member_health_snapshots_club_id_date_idx" ON "public"."member_health_snapshots"("club_id", "date");
CREATE INDEX "member_health_snapshots_user_id_date_idx" ON "public"."member_health_snapshots"("user_id", "date");

-- =============================================
-- 5. FOREIGN KEYS
-- =============================================

ALTER TABLE "public"."club_courts" ADD CONSTRAINT "club_courts_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "public"."clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."play_sessions" ADD CONSTRAINT "play_sessions_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "public"."clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."play_sessions" ADD CONSTRAINT "play_sessions_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "public"."club_courts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."play_sessions" ADD CONSTRAINT "play_sessions_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."play_session_bookings" ADD CONSTRAINT "play_session_bookings_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."play_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."play_session_bookings" ADD CONSTRAINT "play_session_bookings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."play_session_waitlist" ADD CONSTRAINT "play_session_waitlist_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."play_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."play_session_waitlist" ADD CONSTRAINT "play_session_waitlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."user_play_preferences" ADD CONSTRAINT "user_play_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."user_play_preferences" ADD CONSTRAINT "user_play_preferences_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "public"."clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."ai_recommendation_logs" ADD CONSTRAINT "ai_recommendation_logs_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "public"."clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."ai_recommendation_logs" ADD CONSTRAINT "ai_recommendation_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."document_embeddings" ADD CONSTRAINT "document_embeddings_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."ai_conversations" ADD CONSTRAINT "ai_conversations_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."ai_conversations" ADD CONSTRAINT "ai_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."member_health_snapshots" ADD CONSTRAINT "member_health_snapshots_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."member_health_snapshots" ADD CONSTRAINT "member_health_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================
-- 6. PGVECTOR (for AI embeddings / RAG)
-- =============================================

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "public"."document_embeddings"
  ADD COLUMN IF NOT EXISTS "embedding" vector(1536);

CREATE INDEX IF NOT EXISTS "document_embeddings_embedding_idx"
  ON "public"."document_embeddings"
  USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- =============================================
-- 7. match_documents() RPC for semantic search
-- =============================================

CREATE OR REPLACE FUNCTION match_documents(
    query_embedding vector(1536),
    match_club_id text,
    match_content_types text[] DEFAULT NULL,
    match_count int DEFAULT 5,
    match_threshold float DEFAULT 0.7
)
RETURNS TABLE (
    id text,
    content text,
    content_type text,
    metadata jsonb,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        de.id::text,
        de.content,
        de.content_type,
        de.metadata,
        (1 - (de.embedding <=> query_embedding))::float as similarity
    FROM document_embeddings de
    WHERE de.club_id = match_club_id
      AND (match_content_types IS NULL OR de.content_type = ANY(match_content_types))
      AND (1 - (de.embedding <=> query_embedding)) > match_threshold
    ORDER BY de.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
