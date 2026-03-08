import { prisma } from '@/lib/prisma';
import { generateEmbedding } from '@/lib/ai/rag/embeddings';

// Diagnostic endpoint to test RAG pipeline
// GET /api/ai/debug?clubId=xxx&query=test
export async function GET(req: Request) {
  const url = new URL(req.url);
  const clubId = url.searchParams.get('clubId');
  const query = url.searchParams.get('query') || 'What sessions do you have?';

  if (!clubId) {
    return Response.json({ error: 'clubId param required' }, { status: 400 });
  }

  const steps: Record<string, unknown> = {};

  // Step 1: Can we query the table at all?
  try {
    const countResult: { count: bigint }[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::bigint as count FROM document_embeddings WHERE club_id = '${clubId}'::uuid`
    );
    steps.step1_count = { success: true, count: Number(countResult[0]?.count || 0) };
  } catch (err) {
    steps.step1_count = { success: false, error: err instanceof Error ? err.message : String(err) };
    return Response.json({ steps, stopped: 'step1' });
  }

  // Step 2: Can we SELECT content without vectors?
  try {
    const rows: { id: string; content: string; content_type: string }[] = await prisma.$queryRawUnsafe(
      `SELECT id::text, content, content_type FROM document_embeddings WHERE club_id = '${clubId}'::uuid ORDER BY created_at DESC LIMIT 3`
    );
    steps.step2_simple_select = { success: true, rowCount: rows.length, preview: rows.map(r => ({ type: r.content_type, content: r.content.slice(0, 100) })) };
  } catch (err) {
    steps.step2_simple_select = { success: false, error: err instanceof Error ? err.message : String(err) };
    return Response.json({ steps, stopped: 'step2' });
  }

  // Step 3: Can we generate an embedding?
  try {
    const embedding = await generateEmbedding(query);
    steps.step3_embedding = { success: true, dim: embedding.length, firstValues: embedding.slice(0, 5) };
  } catch (err) {
    steps.step3_embedding = { success: false, error: err instanceof Error ? err.message : String(err) };
    return Response.json({ steps, stopped: 'step3' });
  }

  // Step 4: Can we do vector similarity search?
  try {
    const embedding = await generateEmbedding(query);
    const embeddingStr = `[${embedding.join(',')}]`;
    const sql = `SELECT id::text, content, content_type,
                (1 - (embedding <=> '${embeddingStr}'::vector))::float as similarity
         FROM document_embeddings
         WHERE club_id = '${clubId}'::uuid
           AND (1 - (embedding <=> '${embeddingStr}'::vector)) > 0.3
         ORDER BY embedding <=> '${embeddingStr}'::vector
         LIMIT 5`;
    const rows: { id: string; content: string; content_type: string; similarity: number }[] =
      await prisma.$queryRawUnsafe(sql);
    steps.step4_vector_search = {
      success: true,
      rowCount: rows.length,
      results: rows.map(r => ({ type: r.content_type, similarity: r.similarity, content: r.content.slice(0, 120) })),
    };
  } catch (err) {
    steps.step4_vector_search = { success: false, error: err instanceof Error ? err.message : String(err) };
  }

  return Response.json({ steps, allPassed: Object.values(steps).every((s: any) => s.success) });
}
