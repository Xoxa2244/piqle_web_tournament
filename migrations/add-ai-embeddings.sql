-- ============================================================
-- Migration: Add AI Embeddings & Conversation Tables
-- Enables real AI features: RAG pipeline, AI Advisor chatbot
-- ============================================================

-- 1. Enable pgvector extension (Supabase supports natively)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Document embeddings table for RAG
CREATE TABLE "document_embeddings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "club_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,  -- 'club_info', 'session', 'member_pattern', 'booking_trend', 'faq'
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "embedding" vector(1536) NOT NULL,
    "source_id" TEXT,
    "source_table" TEXT,
    "chunk_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "document_embeddings_pkey" PRIMARY KEY ("id")
);

-- HNSW index for fast cosine similarity search
CREATE INDEX "document_embeddings_embedding_idx"
    ON "document_embeddings"
    USING hnsw ("embedding" vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

CREATE INDEX "document_embeddings_club_id_idx" ON "document_embeddings"("club_id");
CREATE INDEX "document_embeddings_content_type_idx" ON "document_embeddings"("content_type");
CREATE INDEX "document_embeddings_source_idx" ON "document_embeddings"("source_id", "source_table");

ALTER TABLE "document_embeddings"
    ADD CONSTRAINT "document_embeddings_club_id_fkey"
    FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE;

-- 3. AI Conversation history for the Advisor chatbot
CREATE TABLE "ai_conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "club_id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_conversations_club_user_idx" ON "ai_conversations"("club_id", "user_id");
CREATE INDEX "ai_conversations_updated_at_idx" ON "ai_conversations"("updated_at" DESC);

ALTER TABLE "ai_conversations"
    ADD CONSTRAINT "ai_conversations_club_id_fkey"
    FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE;

ALTER TABLE "ai_conversations"
    ADD CONSTRAINT "ai_conversations_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;

-- 4. AI Messages within conversations
CREATE TABLE "ai_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "role" TEXT NOT NULL,  -- 'user', 'assistant', 'system'
    "content" TEXT NOT NULL,
    "metadata" JSONB DEFAULT '{}',  -- token counts, model used, latency_ms
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_messages_conversation_id_idx" ON "ai_messages"("conversation_id");
CREATE INDEX "ai_messages_created_at_idx" ON "ai_messages"("created_at");

ALTER TABLE "ai_messages"
    ADD CONSTRAINT "ai_messages_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE;

-- 5. Similarity search RPC function
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
    WHERE de.club_id = match_club_id::uuid
      AND (match_content_types IS NULL OR de.content_type = ANY(match_content_types))
      AND (1 - (de.embedding <=> query_embedding)) > match_threshold
    ORDER BY de.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- 6. Expand AI recommendation types
ALTER TYPE "AIRecommendationType" ADD VALUE IF NOT EXISTS 'AI_ADVISOR';
ALTER TYPE "AIRecommendationType" ADD VALUE IF NOT EXISTS 'CHURN_PREDICTION';
ALTER TYPE "AIRecommendationType" ADD VALUE IF NOT EXISTS 'GROUP_CHEMISTRY';
ALTER TYPE "AIRecommendationType" ADD VALUE IF NOT EXISTS 'AUTOPILOT';
