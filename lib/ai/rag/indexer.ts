import { prisma } from '@/lib/prisma';
import { supabaseAdmin } from '@/lib/supabase';
import { generateEmbeddings } from './embeddings';
import {
  chunkClubInfo, chunkSession, chunkMemberPattern, chunkBookingTrend,
  chunkFAQ, DEFAULT_FAQS, type TextChunk
} from './chunker';
import { inferSkillLevel, getDayName, getTimeSlot, getOccupancyPercent } from '../scoring';

// ── Upsert embeddings via Supabase (Prisma doesn't support pgvector) ──
async function upsertEmbeddings(clubId: string, chunks: TextChunk[], embeddings: number[][]): Promise<void> {
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const embedding = embeddings[i];

    // Delete existing embedding for same source
    if (chunk.sourceId && chunk.sourceTable) {
      await supabaseAdmin
        .from('document_embeddings')
        .delete()
        .eq('club_id', clubId)
        .eq('source_id', chunk.sourceId)
        .eq('source_table', chunk.sourceTable)
        .eq('chunk_index', chunk.chunkIndex);
    }

    // Insert new embedding (generate id — Prisma uses client-side uuid, Supabase needs it explicit)
    const { error } = await supabaseAdmin.from('document_embeddings').insert({
      id: crypto.randomUUID(),
      club_id: clubId,
      content: chunk.content,
      content_type: chunk.contentType,
      metadata: chunk.metadata,
      embedding: JSON.stringify(embedding),
      source_id: chunk.sourceId || null,
      source_table: chunk.sourceTable || null,
      chunk_index: chunk.chunkIndex,
    });
    if (error && i === 0) {
      // Log first error only to avoid spam
      console.error(`[RAG] Supabase insert failed:`, error.message, error.details)
      throw new Error(`RAG insert failed: ${error.message}`)
    }
  }
}

// ── Index club info ──
export async function indexClub(clubId: string): Promise<number> {
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    include: { clubCourts: { where: { isActive: true } } },
  });
  if (!club) return 0;

  const chunks = chunkClubInfo({
    id: club.id,
    name: club.name,
    description: club.description,
    address: club.address,
    city: club.city,
    state: club.state,
    courts: club.clubCourts.map(c => ({
      name: c.name,
      courtType: c.courtType,
      isIndoor: c.isIndoor,
    })),
  });

  const embeddings = await generateEmbeddings(chunks.map(c => c.content));
  await upsertEmbeddings(clubId, chunks, embeddings);
  return chunks.length;
}

// ── Index a single session ──
export async function indexSession(sessionId: string): Promise<number> {
  const session = await prisma.playSession.findUnique({
    where: { id: sessionId },
    include: {
      clubCourt: true,
      _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } },
    },
  });
  if (!session) return 0;

  const chunks = chunkSession({
    id: session.id,
    title: session.title,
    format: session.format,
    skillLevel: session.skillLevel,
    date: session.date,
    startTime: session.startTime,
    endTime: session.endTime,
    maxPlayers: session.maxPlayers,
    description: session.description,
    confirmedCount: session._count.bookings,
    courtName: session.clubCourt?.name,
  });

  const embeddings = await generateEmbeddings(chunks.map(c => c.content));
  await upsertEmbeddings(session.clubId, chunks, embeddings);
  return chunks.length;
}

// ── Index all upcoming sessions for a club ──
export async function indexAllSessions(clubId: string): Promise<number> {
  const sessions = await prisma.playSession.findMany({
    where: {
      clubId,
      status: 'SCHEDULED',
      date: { gte: new Date() },
    },
    include: {
      clubCourt: true,
      _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } },
    },
  });

  if (sessions.length === 0) return 0;

  const allChunks: TextChunk[] = [];
  for (const s of sessions) {
    allChunks.push(...chunkSession({
      id: s.id,
      title: s.title,
      format: s.format,
      skillLevel: s.skillLevel,
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      maxPlayers: s.maxPlayers,
      description: s.description,
      confirmedCount: s._count.bookings,
      courtName: s.clubCourt?.name,
    }));
  }

  const embeddings = await generateEmbeddings(allChunks.map(c => c.content));
  await upsertEmbeddings(clubId, allChunks, embeddings);
  return allChunks.length;
}

// ── Index member patterns for a club ──
export async function indexMemberPatterns(clubId: string): Promise<number> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Get only active members (with at least 1 booking) — skip 10K+ dormant
  const activeUserIds = await prisma.playSessionBooking.findMany({
    where: { playSession: { clubId }, status: 'CONFIRMED' },
    select: { userId: true },
    distinct: ['userId'],
  })
  const activeSet = new Set(activeUserIds.map(r => r.userId))

  const followers = await prisma.clubFollower.findMany({
    where: { clubId, userId: { in: Array.from(activeSet) } },
    include: {
      user: {
        include: {
          playPreferences: { where: { clubId } },
          playSessionBookings: {
            where: { playSession: { clubId } },
            include: { playSession: true },
          },
        },
      },
    },
  });

  if (followers.length === 0) return 0;

  // Build co-player map: userId → top partners
  const coPlayerMap = new Map<string, Array<{ name: string; sharedSessions: number; favoriteFormat: string | null }>>();
  try {
    const pairs = await prisma.$queryRaw<Array<{ user_id: string; partner_name: string; shared_sessions: bigint; favorite_format: string | null }>>`
      SELECT b1."userId" as user_id, u2.name as partner_name,
        COUNT(DISTINCT b1."sessionId")::bigint as shared_sessions,
        MODE() WITHIN GROUP (ORDER BY ps.format) as favorite_format
      FROM play_session_bookings b1
      JOIN play_session_bookings b2 ON b1."sessionId" = b2."sessionId" AND b1."userId" != b2."userId"
      JOIN play_sessions ps ON ps.id = b1."sessionId"
      JOIN users u2 ON u2.id = b2."userId"
      WHERE ps."clubId" = ${clubId} AND b1.status = 'CONFIRMED' AND b2.status = 'CONFIRMED'
      GROUP BY b1."userId", u2.id, u2.name
      HAVING COUNT(DISTINCT b1."sessionId") >= 3
      ORDER BY b1."userId", shared_sessions DESC
    `;
    for (const p of pairs) {
      const list = coPlayerMap.get(p.user_id) || [];
      if (list.length < 5) list.push({ name: p.partner_name || 'Unknown', sharedSessions: Number(p.shared_sessions), favoriteFormat: p.favorite_format });
      coPlayerMap.set(p.user_id, list);
    }
  } catch (err) {
    console.error('[RAG] Co-player query failed (non-fatal):', err);
  }

  // Clear old member pattern embeddings
  await supabaseAdmin
    .from('document_embeddings')
    .delete()
    .eq('club_id', clubId)
    .eq('content_type', 'member_pattern');

  const allChunks: TextChunk[] = [];

  for (const follower of followers) {
    const user = follower.user;
    const bookings = user.playSessionBookings;
    const pref = user.playPreferences[0];

    const confirmedBookings = bookings.filter(b => b.status === 'CONFIRMED');
    const recentBookings = confirmedBookings.filter(b => b.bookedAt >= thirtyDaysAgo);
    const cancelledCount = bookings.filter(b => b.status === 'CANCELLED').length;
    const noShowCount = bookings.filter(b => b.status === 'NO_SHOW').length;

    const lastBooking = confirmedBookings
      .sort((a, b) => b.bookedAt.getTime() - a.bookedAt.getTime())[0];
    const daysSinceLastBooking = lastBooking
      ? Math.floor((now.getTime() - lastBooking.bookedAt.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    allChunks.push(...chunkMemberPattern({
      id: user.id,
      name: user.name,
      email: user.email,
      duprRatingDoubles: user.duprRatingDoubles ? Number(user.duprRatingDoubles) : null,
      totalBookings: confirmedBookings.length,
      bookingsLastMonth: recentBookings.length,
      daysSinceLastBooking,
      preferredDays: pref?.preferredDays as string[] | undefined,
      preferredTimeSlots: pref ? {
        morning: pref.preferredTimeMorning,
        afternoon: pref.preferredTimeAfternoon,
        evening: pref.preferredTimeEvening,
      } : undefined,
      preferredFormats: pref?.preferredFormats as string[] | undefined,
      cancelledCount,
      noShowCount,
      frequentPartners: coPlayerMap.get(user.id),
    }));
  }

  const embeddings = await generateEmbeddings(allChunks.map(c => c.content));
  await upsertEmbeddings(clubId, allChunks, embeddings);
  return allChunks.length;
}

// ── Index default FAQs for a club ──
export async function indexFAQs(clubId: string): Promise<number> {
  // Clear old FAQ embeddings
  await supabaseAdmin
    .from('document_embeddings')
    .delete()
    .eq('club_id', clubId)
    .eq('content_type', 'faq');

  const allChunks: TextChunk[] = [];
  for (const faq of DEFAULT_FAQS) {
    allChunks.push(...chunkFAQ(faq));
  }

  const embeddings = await generateEmbeddings(allChunks.map(c => c.content));
  await upsertEmbeddings(clubId, allChunks, embeddings);
  return allChunks.length;
}

// ── Full re-index for a club ──
export async function indexAll(clubId: string): Promise<{ total: number; breakdown: Record<string, number> }> {
  const [clubCount, sessionCount, memberCount, faqCount] = await Promise.all([
    indexClub(clubId),
    indexAllSessions(clubId),
    indexMemberPatterns(clubId),
    indexFAQs(clubId),
  ]);

  return {
    total: clubCount + sessionCount + memberCount + faqCount,
    breakdown: {
      club_info: clubCount,
      sessions: sessionCount,
      member_patterns: memberCount,
      faqs: faqCount,
    },
  };
}

// ── Delete embeddings for a source ──
export async function deleteEmbeddings(sourceId: string, sourceTable: string): Promise<void> {
  await supabaseAdmin
    .from('document_embeddings')
    .delete()
    .eq('source_id', sourceId)
    .eq('source_table', sourceTable);
}
