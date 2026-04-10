import { NextRequest, NextResponse } from 'next/server'
import { withPartnerAuth } from '@/server/utils/partnerApiMiddleware'
import { prisma } from '@/lib/prisma'
import { validatePartnerClubAccess } from '@/server/utils/partnerClubBinding'
import { generateEmbeddings } from '@/lib/ai/rag/embeddings'
import { z } from 'zod'
import crypto from 'crypto'

function uuidv4(): string {
  return crypto.randomUUID()
}

/**
 * Regenerate embeddings for a club's Intelligence data.
 * Reads all sessions + bookings, builds text chunks, generates embeddings,
 * and replaces old API-sourced embeddings.
 *
 * maxDuration: 300s (Vercel Pro)
 */
export const maxDuration = 300

const regenerateSchema = z.object({
  clubId: z.string().uuid(),
  fullReindex: z.boolean().optional().default(false),
})

interface ChunkContent {
  text: string
  contentType: string
  metadata: Record<string, unknown>
  sourceId: string
}

export const POST = withPartnerAuth(
  async (req: NextRequest, context) => {
    const body = await req.json()
    const validated = regenerateSchema.parse(body)

    await validatePartnerClubAccess(context.partnerId, validated.clubId)

    const batchId = uuidv4()
    const clubId = validated.clubId

    // 1. Fetch all sessions with bookings
    const sessions = await prisma.playSession.findMany({
      where: { clubId },
      include: {
        clubCourt: { select: { name: true } },
        bookings: {
          where: { status: 'CONFIRMED' },
          include: { user: { select: { name: true, email: true } } },
        },
      },
      orderBy: { date: 'asc' },
    })

    if (sessions.length === 0) {
      return NextResponse.json({
        message: 'No sessions found for this club',
        embeddingsCreated: 0,
      })
    }

    // 2. Build text chunks
    const chunks: ChunkContent[] = []

    // Session descriptions
    for (let i = 0; i < sessions.length; i++) {
      const s = sessions[i]
      const occupancy = s.maxPlayers > 0 ? Math.round((s.bookings.length / s.maxPlayers) * 100) : 0
      const playerNames = s.bookings.map((b) => b.user.name || b.user.email).join(', ')

      const text = [
        `Session on ${s.date.toISOString().split('T')[0]} from ${s.startTime} to ${s.endTime}`,
        s.clubCourt ? `at ${s.clubCourt.name}` : '',
        `Format: ${s.format.toLowerCase().replace('_', ' ')}`,
        `Skill level: ${s.skillLevel.toLowerCase().replace('_', ' ')}`,
        `${s.bookings.length}/${s.maxPlayers} players registered (${occupancy}% full, ${s.maxPlayers - s.bookings.length} empty slots)`,
        s.pricePerSlot ? `Price: $${s.pricePerSlot} per player` : 'Free session',
        playerNames ? `Players: ${playerNames}` : '',
      ]
        .filter(Boolean)
        .join('. ')

      chunks.push({
        text,
        contentType: 'session',
        metadata: { sessionId: s.id, date: s.date, format: s.format, occupancy },
        sourceId: `api_session_${s.id}`,
      })
    }

    // Import summary
    const totalSlots = sessions.reduce((sum, s) => sum + s.maxPlayers, 0)
    const totalBooked = sessions.reduce((sum, s) => sum + s.bookings.length, 0)
    const avgOccupancy = totalSlots > 0 ? Math.round((totalBooked / totalSlots) * 100) : 0
    const underfilled = sessions.filter((s) => s.bookings.length / s.maxPlayers < 0.5).length

    const summaryText = [
      `Club has ${sessions.length} total sessions with ${totalSlots} total slots.`,
      `${totalBooked} slots booked (${avgOccupancy}% average occupancy).`,
      `${underfilled} sessions are less than 50% full.`,
      `${totalSlots - totalBooked} empty slots represent potential revenue.`,
    ].join(' ')

    chunks.push({
      text: summaryText,
      contentType: 'club_info',
      metadata: { totalSessions: sessions.length, avgOccupancy, batchId },
      sourceId: `api_summary_${batchId}`,
    })

    // Player frequency analysis
    const playerMap = new Map<string, { name: string; count: number; formats: Set<string>; days: Set<string> }>()
    for (const s of sessions) {
      for (const b of s.bookings) {
        const key = b.userId
        const existing = playerMap.get(key)
        if (existing) {
          existing.count++
          existing.formats.add(s.format)
          existing.days.add(s.date.toLocaleDateString('en-US', { weekday: 'long' }))
        } else {
          playerMap.set(key, {
            name: b.user.name || b.user.email,
            count: 1,
            formats: new Set([s.format]),
            days: new Set([s.date.toLocaleDateString('en-US', { weekday: 'long' })]),
          })
        }
      }
    }

    const players = Array.from(playerMap.entries())
    const regulars = players.filter(([, p]) => p.count >= 5)
    const actives = players.filter(([, p]) => p.count >= 2 && p.count < 5)
    const oneTimers = players.filter(([, p]) => p.count === 1)

    const memberText = [
      `${players.length} unique players. ${regulars.length} regulars (5+ sessions), ${actives.length} active (2-4), ${oneTimers.length} one-timers.`,
      `Retention rate: ${players.length > 0 ? Math.round(((regulars.length + actives.length) / players.length) * 100) : 0}%.`,
    ].join(' ')

    chunks.push({
      text: memberText,
      contentType: 'member_pattern',
      metadata: { totalPlayers: players.length, regulars: regulars.length, batchId },
      sourceId: `api_members_${batchId}`,
    })

    // Day-of-week analysis
    const dayStats = new Map<string, { sessions: number; booked: number; total: number }>()
    for (const s of sessions) {
      const day = s.date.toLocaleDateString('en-US', { weekday: 'long' })
      const existing = dayStats.get(day) || { sessions: 0, booked: 0, total: 0 }
      existing.sessions++
      existing.booked += s.bookings.length
      existing.total += s.maxPlayers
      dayStats.set(day, existing)
    }

    const dayText = Array.from(dayStats.entries())
      .map(([day, stats]) => {
        const occ = stats.total > 0 ? Math.round((stats.booked / stats.total) * 100) : 0
        return `${day}: ${stats.sessions} sessions, ${occ}% occupancy`
      })
      .join('. ')

    chunks.push({
      text: `Day-of-week analysis: ${dayText}`,
      contentType: 'booking_trend',
      metadata: { batchId },
      sourceId: `api_days_${batchId}`,
    })

    // 3. Delete old API-sourced embeddings
    await prisma.$executeRawUnsafe(
      `DELETE FROM document_embeddings WHERE club_id = $1 AND source_table = 'partner_api'`,
      clubId
    )

    // 4. Generate embeddings
    const texts = chunks.map((c) => c.text)
    const embeddings = await generateEmbeddings(texts)

    // 5. Insert into DB (batch of 50)
    const insertBatchSize = 50
    let insertedCount = 0

    for (let i = 0; i < chunks.length; i += insertBatchSize) {
      const chunkBatch = chunks.slice(i, i + insertBatchSize)
      const embeddingBatch = embeddings.slice(i, i + insertBatchSize)

      const values = chunkBatch
        .map((chunk, idx) => {
          const id = uuidv4()
          const embedding = `[${embeddingBatch[idx].join(',')}]`
          const metadata = JSON.stringify(chunk.metadata).replace(/'/g, "''")
          const content = chunk.text.replace(/'/g, "''")
          return `('${id}', '${clubId}', '${content}', '${chunk.contentType}', '${metadata}'::jsonb, '${embedding}'::vector, '${chunk.sourceId}', 'partner_api', ${i + idx})`
        })
        .join(',\n')

      await prisma.$executeRawUnsafe(
        `INSERT INTO document_embeddings (id, club_id, content, content_type, metadata, embedding, source_id, source_table, chunk_index)
         VALUES ${values}`
      )

      insertedCount += chunkBatch.length
    }

    return NextResponse.json({
      embeddingsCreated: insertedCount,
      chunksGenerated: chunks.length,
      sessionsProcessed: sessions.length,
      playersProcessed: players.length,
      batchId,
    })
  },
  {
    requiredScope: 'intelligence:write',
    requireIdempotency: true,
  }
)
