import { prisma } from '@/lib/prisma';
import { generateEmbedding } from './embeddings';
import type { ContentType } from './chunker';

export interface RetrievedChunk {
  id: string;
  content: string;
  contentType: ContentType;
  metadata: Record<string, unknown>;
  similarity: number;
}

export interface RetrievalOptions {
  contentTypes?: ContentType[];
  limit?: number;
  threshold?: number;
}

export async function retrieveContext(
  query: string,
  clubId: string,
  options: RetrievalOptions = {}
): Promise<RetrievedChunk[]> {
  const { contentTypes, limit = 5, threshold = 0.7 } = options;

  // Generate embedding for the query
  const queryEmbedding = await generateEmbedding(query);
  const embeddingStr = `[${queryEmbedding.join(',')}]`;
  console.log(`[RAG] Embedding generated, dim=${queryEmbedding.length}, clubId=${clubId}, threshold=${threshold}, limit=${limit}`);

  try {
    // Direct SQL similarity search — bypasses PostgREST cache issues
    let rows: { id: string; content: string; content_type: string; metadata: any; similarity: number }[];

    if (contentTypes && contentTypes.length > 0) {
      rows = await prisma.$queryRawUnsafe(
        `SELECT id::text, content, content_type, metadata,
                (1 - (embedding <=> $1::vector))::float as similarity
         FROM document_embeddings
         WHERE club_id = $2::uuid
           AND content_type = ANY($3::text[])
           AND (1 - (embedding <=> $1::vector)) > $4
         ORDER BY embedding <=> $1::vector
         LIMIT $5`,
        embeddingStr,
        clubId,
        contentTypes,
        threshold,
        limit,
      );
    } else {
      rows = await prisma.$queryRawUnsafe(
        `SELECT id::text, content, content_type, metadata,
                (1 - (embedding <=> $1::vector))::float as similarity
         FROM document_embeddings
         WHERE club_id = $2::uuid
           AND (1 - (embedding <=> $1::vector)) > $3
         ORDER BY embedding <=> $1::vector
         LIMIT $4`,
        embeddingStr,
        clubId,
        threshold,
        limit,
      );
    }

    return rows.map(r => ({
      id: r.id,
      content: r.content,
      contentType: r.content_type as ContentType,
      metadata: r.metadata,
      similarity: r.similarity,
    }));
  } catch (err) {
    console.error('[RAG] Similarity search failed:', err instanceof Error ? err.message : err);
    // Fallback: try simple text search without vector similarity
    try {
      console.log('[RAG] Attempting fallback: direct content fetch without similarity');
      const fallbackRows: { id: string; content: string; content_type: string; metadata: any }[] = await prisma.$queryRawUnsafe(
        `SELECT id::text, content, content_type, metadata
         FROM document_embeddings
         WHERE club_id = $1::uuid
         ORDER BY created_at DESC
         LIMIT $2`,
        clubId,
        limit,
      );
      console.log(`[RAG] Fallback returned ${fallbackRows.length} rows`);
      return fallbackRows.map(r => ({
        id: r.id,
        content: r.content,
        contentType: r.content_type as ContentType,
        metadata: r.metadata,
        similarity: 0.5,
      }));
    } catch (fallbackErr) {
      console.error('[RAG] Fallback also failed:', fallbackErr instanceof Error ? fallbackErr.message : fallbackErr);
      return [];
    }
  }
}

// Build context string from retrieved chunks for LLM prompt
export function buildRAGContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return 'No relevant data found in the knowledge base.';

  const grouped = new Map<string, string[]>();
  for (const chunk of chunks) {
    const group = grouped.get(chunk.contentType) || [];
    group.push(chunk.content);
    grouped.set(chunk.contentType, group);
  }

  const sections: string[] = [];

  const typeLabels: Record<string, string> = {
    club_info: 'Club Information',
    session: 'Upcoming Sessions',
    member_pattern: 'Member Profiles',
    booking_trend: 'Booking Trends',
    faq: 'Reference',
  };

  grouped.forEach((contents, type) => {
    sections.push(`## ${typeLabels[type] || type}\n${contents.join('\n')}`);
  });

  return sections.join('\n\n');
}
