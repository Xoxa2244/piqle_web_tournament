import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateEmbeddings } from '@/lib/ai/rag/embeddings';
import { parse as parseCookie } from 'cookie';

// ── Auth helper (mirrors server/trpc.ts pattern exactly) ──
async function getSessionFromRequest(req: Request) {
  try {
    const nextAuthSession = await getServerSession(authOptions);
    if (nextAuthSession?.user?.id) {
      return { userId: nextAuthSession.user.id, user: nextAuthSession.user };
    }
  } catch (e) {
    console.warn('[Import] getServerSession failed, falling back to cookie:', e);
  }

  const cookieHeader = req.headers.get('cookie');
  if (!cookieHeader) return null;

  const cookies = parseCookie(cookieHeader);
  const sessionToken =
    cookies['__Secure-next-auth.session-token'] ||
    cookies['__Host-next-auth.session-token'] ||
    cookies['next-auth.session-token'] ||
    cookies['_Secure-next-auth.session-token'] ||
    null;

  if (!sessionToken) return null;

  const dbSession = await prisma.session.findUnique({
    where: { sessionToken },
    include: { user: true },
  });

  if (!dbSession || dbSession.expires < new Date()) return null;
  return { userId: dbSession.userId, user: dbSession.user };
}

// ── Types ──
interface ImportedSession {
  date: string;
  startTime: string;
  endTime: string;
  court: string;
  format: string;
  skillLevel: string;
  registered: number;
  capacity: number;
  playerNames: string[];
}

// ── Format session data as natural language for embedding ──
function sessionToText(session: ImportedSession, index: number): string {
  const occupancyPct = session.capacity > 0
    ? Math.round((session.registered / session.capacity) * 100)
    : 0;
  const emptySlots = Math.max(0, session.capacity - session.registered);
  const formatLabel = session.format.replace(/_/g, ' ').toLowerCase();
  const skillLabel = session.skillLevel.replace(/_/g, ' ').toLowerCase();

  const parts = [
    `Session on ${session.date} from ${session.startTime} to ${session.endTime} at ${session.court}.`,
    `Format: ${formatLabel}. Skill level: ${skillLabel}.`,
    `${session.registered}/${session.capacity} players registered (${occupancyPct}% full, ${emptySlots} empty slots).`,
  ];

  if (session.playerNames.length > 0) {
    parts.push(`Players: ${session.playerNames.join(', ')}.`);
  }

  return parts.join(' ');
}

// ── Build summary text for the entire import ──
function buildImportSummary(sessions: ImportedSession[]): string {
  const totalSessions = sessions.length;
  const totalSlots = sessions.reduce((s, x) => s + x.capacity, 0);
  const filledSlots = sessions.reduce((s, x) => s + x.registered, 0);
  const emptySlots = totalSlots - filledSlots;
  const avgOccupancy = totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 0;
  const underfilled = sessions.filter(s => (s.registered / s.capacity) < 0.8).length;

  // Count formats
  const formatCounts: Record<string, number> = {};
  sessions.forEach(s => {
    const f = s.format.replace(/_/g, ' ').toLowerCase();
    formatCounts[f] = (formatCounts[f] || 0) + 1;
  });
  const topFormats = Object.entries(formatCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([f, c]) => `${f} (${c})`)
    .join(', ');

  // Count unique players
  const allPlayers = new Set<string>();
  sessions.forEach(s => s.playerNames.forEach(p => allPlayers.add(p)));

  // Find busiest and emptiest days
  const dayOccupancy: Record<string, { filled: number; total: number }> = {};
  sessions.forEach(s => {
    if (!dayOccupancy[s.date]) dayOccupancy[s.date] = { filled: 0, total: 0 };
    dayOccupancy[s.date].filled += s.registered;
    dayOccupancy[s.date].total += s.capacity;
  });

  return [
    `Club Schedule Summary: ${totalSessions} sessions imported.`,
    `Total capacity: ${totalSlots} slots, ${filledSlots} filled, ${emptySlots} empty.`,
    `Average occupancy: ${avgOccupancy}%. ${underfilled} sessions are underfilled (below 80%).`,
    `Formats offered: ${topFormats}.`,
    `${allPlayers.size} unique players across all sessions.`,
  ].join(' ');
}

export async function POST(req: Request) {
  try {
    // 1. Authenticate
    const session = await getSessionFromRequest(req);
    if (!session) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse request
    const body = await req.json();
    const { clubId, sessions, fileName } = body as { clubId: string; sessions: ImportedSession[]; fileName?: string };

    if (!clubId || !sessions || !Array.isArray(sessions) || sessions.length === 0) {
      return Response.json({ error: 'clubId and sessions array are required' }, { status: 400 });
    }

    // 3. Verify club access
    const admin = await prisma.clubAdmin.findFirst({ where: { clubId, userId: session.userId } });
    if (!admin) {
      return Response.json({ error: 'Only club admins can import sessions' }, { status: 403 });
    }

    // 4. Delete old imported session embeddings for this club (direct SQL, bypasses PostgREST cache)
    try {
      await prisma.$executeRaw`
        DELETE FROM document_embeddings
        WHERE club_id = ${clubId}::uuid AND source_table = 'csv_import'
      `;
    } catch (deleteErr) {
      console.error('[Import] Failed to delete old embeddings:', deleteErr);
      return Response.json({
        error: 'Failed to prepare import (delete old data)',
        details: deleteErr instanceof Error ? deleteErr.message : String(deleteErr),
      }, { status: 500 });
    }

    // 5. Build text chunks for embedding
    const chunks: { text: string; contentType: string; metadata: Record<string, unknown>; sourceId: string }[] = [];

    // Count unique players for metadata
    const allPlayersSet = new Set<string>();
    sessions.forEach(s => s.playerNames.forEach(p => allPlayersSet.add(p)));

    // Add overall summary
    chunks.push({
      text: buildImportSummary(sessions),
      contentType: 'club_info',
      metadata: {
        type: 'import_summary',
        sessionCount: sessions.length,
        playerCount: allPlayersSet.size,
        sourceFileName: fileName || null,
        importedAt: new Date().toISOString(),
      },
      sourceId: `import-summary-${clubId}`,
    });

    // Add individual sessions
    sessions.forEach((s, i) => {
      chunks.push({
        text: sessionToText(s, i),
        contentType: 'session',
        metadata: {
          date: s.date,
          startTime: s.startTime,
          endTime: s.endTime,
          court: s.court,
          format: s.format,
          skillLevel: s.skillLevel,
          registered: s.registered,
          capacity: s.capacity,
          occupancy: s.capacity > 0 ? Math.round((s.registered / s.capacity) * 100) : 0,
          playerNames: s.playerNames,
        },
        sourceId: `import-session-${i}`,
      });
    });

    // Add player frequency data
    const playerFrequency: Record<string, { count: number; formats: Set<string>; days: Set<string> }> = {};
    sessions.forEach(s => {
      s.playerNames.forEach(name => {
        if (!playerFrequency[name]) {
          playerFrequency[name] = { count: 0, formats: new Set(), days: new Set() };
        }
        playerFrequency[name].count++;
        playerFrequency[name].formats.add(s.format.replace(/_/g, ' ').toLowerCase());
        playerFrequency[name].days.add(s.date);
      });
    });

    // Add top players as member_pattern chunks
    const topPlayers = Object.entries(playerFrequency)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 50); // top 50 players

    topPlayers.forEach(([name, data]) => {
      chunks.push({
        text: `Player: ${name}. Registered for ${data.count} sessions. Plays ${Array.from(data.formats).join(', ')}. Active days: ${Array.from(data.days).join(', ')}.`,
        contentType: 'member_pattern',
        metadata: { playerName: name, sessionCount: data.count },
        sourceId: `import-player-${name}`,
      });
    });

    // 6. Generate embeddings in batch
    const texts = chunks.map(c => c.text);
    console.log(`[Import] Generating embeddings for ${texts.length} chunks...`);
    const embeddings = await generateEmbeddings(texts);
    console.log(`[Import] Generated ${embeddings.length} embeddings, dim=${embeddings[0]?.length}`);

    if (embeddings.length !== texts.length) {
      return Response.json({
        error: 'Embedding count mismatch',
        details: `Expected ${texts.length} embeddings, got ${embeddings.length}`,
      }, { status: 500 });
    }

    // 7. Insert into document_embeddings via direct SQL (bypasses PostgREST cache)
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embeddingStr = `[${embeddings[i].join(',')}]`;

      try {
        await prisma.$executeRawUnsafe(
          `INSERT INTO document_embeddings (club_id, content, content_type, metadata, embedding, source_id, source_table, chunk_index)
           VALUES ($1::uuid, $2, $3, $4::jsonb, $5::vector, $6, $7, $8)`,
          clubId,
          chunk.text,
          chunk.contentType,
          JSON.stringify(chunk.metadata),
          embeddingStr,
          chunk.sourceId,
          'csv_import',
          i,
        );
      } catch (insertErr) {
        console.error(`[Import] Failed to insert embedding ${i}:`, insertErr);
        return Response.json({
          error: 'Failed to save embeddings',
          details: insertErr instanceof Error ? insertErr.message : String(insertErr),
        }, { status: 500 });
      }
    }

    return Response.json({
      success: true,
      embeddingsCreated: chunks.length,
      sessionsProcessed: sessions.length,
      playersIndexed: topPlayers.length,
    });
  } catch (error) {
    console.error('[Import] Unexpected error:', error);
    return Response.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
