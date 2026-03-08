import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { indexAll } from '@/lib/ai/rag/indexer';

// Vercel Cron: nightly embedding sync
// Schedule in vercel.json: { "path": "/api/ai/sync-embeddings", "schedule": "0 3 * * *" }
export async function GET(req: Request) {
  // Verify cron secret (Vercel sets this header for cron jobs)
  const authHeader = req.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get all clubs that have active sessions or members
    const clubs = await prisma.club.findMany({
      where: {
        playSessions: {
          some: {
            status: 'SCHEDULED',
            date: { gte: new Date() },
          },
        },
      },
      select: { id: true, name: true },
    });

    const results: Array<{ clubId: string; clubName: string; indexed: number; error?: string }> = [];

    for (const club of clubs) {
      try {
        const result = await indexAll(club.id);
        results.push({
          clubId: club.id,
          clubName: club.name,
          indexed: result.total,
        });
      } catch (err) {
        console.error(`[Sync] Failed to index club ${club.name}:`, err);
        results.push({
          clubId: club.id,
          clubName: club.name,
          indexed: 0,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    const totalIndexed = results.reduce((sum, r) => sum + r.indexed, 0);

    console.log(`[Sync] Embedding sync complete: ${totalIndexed} chunks across ${clubs.length} clubs`);

    return NextResponse.json({
      success: true,
      clubsProcessed: clubs.length,
      totalChunksIndexed: totalIndexed,
      results,
    });
  } catch (error) {
    console.error('[Sync] Embedding sync failed:', error);
    return NextResponse.json(
      { error: 'Sync failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
