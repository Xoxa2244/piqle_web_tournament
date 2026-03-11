-- ============================================================
-- Post-DB-Push SQL: pgvector setup for Intelligence Module
-- Run this in Supabase SQL Editor AFTER `npx prisma db push`
-- ============================================================
-- Prisma's `db push` creates all tables but skips the
-- DocumentEmbedding.embedding column (Unsupported type).
-- This script adds pgvector support manually.
-- ============================================================

-- 1. Enable pgvector extension (Supabase supports natively)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Add embedding column to document_embeddings table
-- (Prisma skips Unsupported("vector(1536)") during db push)
ALTER TABLE document_embeddings
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- 3. HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS document_embeddings_embedding_idx
  ON document_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 4. match_documents() RPC function for RAG pipeline
-- Used by AI Advisor to find relevant context via semantic search
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

-- ============================================================
-- Verification: run after this script to confirm everything
-- ============================================================
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'document_embeddings' AND column_name = 'embedding';
--
-- SELECT proname FROM pg_proc WHERE proname = 'match_documents';
