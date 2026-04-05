import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { indexAll } from '@/lib/ai/rag/indexer'

export const maxDuration = 300

// Nightly RAG embedding sync. Supports ?clubId=xxx for single-club indexing.
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const singleClubId = url.searchParams.get('clubId')

  try {
    let clubs: Array<{ id: string; name: string }>

    if (singleClubId) {
      // Index a specific club
      const club = await prisma.club.findUnique({ where: { id: singleClubId }, select: { id: true, name: true } })
      clubs = club ? [club] : []
    } else {
      // All clubs with members
      clubs = await prisma.$queryRaw<Array<{ id: string; name: string }>>`
        SELECT DISTINCT c.id, c.name FROM clubs c
        JOIN club_followers cf ON cf.club_id = c.id
        GROUP BY c.id, c.name
        HAVING COUNT(cf.id) > 0
      `
    }

    const results: Array<{ clubId: string; clubName: string; indexed: number; error?: string }> = []
    const startTime = Date.now()

    for (const club of clubs) {
      // Skip if running low on time (leave 30s buffer)
      if (Date.now() - startTime > 250_000) {
        results.push({ clubId: club.id, clubName: club.name, indexed: 0, error: 'Skipped — timeout' })
        continue
      }

      try {
        const result = await indexAll(club.id)
        results.push({ clubId: club.id, clubName: club.name, indexed: result.total })
      } catch (err) {
        console.error(`[RAG] Failed to index ${club.name}:`, err)
        results.push({ clubId: club.id, clubName: club.name, indexed: 0, error: (err as Error).message })
      }
    }

    return NextResponse.json({
      success: true,
      clubsProcessed: results.length,
      totalChunksIndexed: results.reduce((s, r) => s + r.indexed, 0),
      results,
    })
  } catch (error) {
    console.error('[RAG] Sync failed:', error)
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
