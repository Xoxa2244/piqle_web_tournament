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
  const { contentTypes, limit = 5, threshold = 0.3 } = options;

  // Generate embedding for the query
  const queryEmbedding = await generateEmbedding(query);
  const embeddingStr = `[${queryEmbedding.join(',')}]`;
  console.log(`[RAG] Embedding generated, dim=${queryEmbedding.length}, clubId=${clubId}, threshold=${threshold}, limit=${limit}`);

  try {
    // Inline all parameters to bypass PgBouncer prepared_statements=false issues
    // All values are internally generated (embedding from OpenAI, clubId validated as UUID)
    let rows: { id: string; content: string; content_type: string; metadata: any; similarity: number }[];

    const contentTypeFilter = contentTypes && contentTypes.length > 0
      ? `AND content_type IN (${contentTypes.map(t => `'${t}'`).join(',')})`
      : '';

    // No threshold filter — always return top-N most relevant chunks.
    // text-embedding-3-small produces low cosine similarities (0.2-0.4 for related content).
    const sql = `SELECT id::text, content, content_type, metadata,
                (1 - (embedding <=> '${embeddingStr}'::vector))::float as similarity
         FROM document_embeddings
         WHERE club_id = '${clubId}'::uuid
           ${contentTypeFilter}
         ORDER BY embedding <=> '${embeddingStr}'::vector
         LIMIT ${limit}`;

    console.log(`[RAG] Executing similarity search (inline params), clubId=${clubId}`);
    rows = await prisma.$queryRawUnsafe(sql);
    console.log(`[RAG] Similarity search returned ${rows.length} rows`);

    return rows.map(r => ({
      id: r.id,
      content: r.content,
      contentType: r.content_type as ContentType,
      metadata: r.metadata,
      similarity: r.similarity,
    }));
  } catch (err) {
    console.error('[RAG] Similarity search failed:', err instanceof Error ? err.message : err);
    // Fallback: fetch by recency without vector similarity
    try {
      console.log('[RAG] Attempting fallback: direct content fetch without similarity');
      const fallbackSql = `SELECT id::text, content, content_type, metadata
         FROM document_embeddings
         WHERE club_id = '${clubId}'::uuid
         ORDER BY created_at DESC
         LIMIT ${limit}`;
      const fallbackRows: { id: string; content: string; content_type: string; metadata: any }[] =
        await prisma.$queryRawUnsafe(fallbackSql);
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
