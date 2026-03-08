import { supabaseAdmin } from '@/lib/supabase';
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

  // Call the Supabase RPC function for similarity search
  const { data, error } = await supabaseAdmin.rpc('match_documents', {
    query_embedding: JSON.stringify(queryEmbedding),
    match_club_id: clubId,
    match_content_types: contentTypes || null,
    match_count: limit,
    match_threshold: threshold,
  });

  if (error) {
    console.error('[RAG] Similarity search failed:', error);
    return [];
  }

  return (data || []) as RetrievedChunk[];
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
