import { prisma } from '@/lib/prisma';
import { supabaseAdmin } from '@/lib/supabase';
import { generateEmbeddings } from '@/lib/ai/rag/embeddings';
import { parse as parseCookie } from 'cookie';

// ── Auth helper ──
async function getSessionFromRequest(req: Request) {
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
    const { clubId, sessions } = body as { clubId: string; sessions: ImportedSession[] };

    if (!clubId || !sessions || !Array.isArray(sessions) || sessions.length === 0) {
      return Response.json({ error: 'clubId and sessions array are required' }, { status: 400 });
    }

    // 3. Verify club access
    const admin = await prisma.clubAdmin.findFirst({ where: { clubId, userId: session.userId } });
    if (!admin) {
      return Response.json({ error: 'Only club admins can import sessions' }, { status: 403 });
    }

    // 4. Delete old imported session embeddings for this club
    await supabaseAdmin
      .from('document_embeddings')
      .delete()
      .eq('club_id', clubId)
      .eq('source_table', 'csv_import');

    // 5. Build text chunks for embedding
    const chunks: { text: string; contentType: string; metadata: Record<string, unknown>; sourceId: string }[] = [];

    // Add overall summary
    chunks.push({
      text: buildImportSummary(sessions),
      contentType: 'booking_trend',
      metadata: { type: 'import_summary', sessionCount: sessions.length },
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
    const embeddings = await generateEmbeddings(texts);

    // 7. Insert into document_embeddings via Supabase
    const rows = chunks.map((chunk, i) => ({
      club_id: clubId,
      content: chunk.text,
      content_type: chunk.contentType,
      metadata: chunk.metadata,
      embedding: JSON.stringify(embeddings[i]),
      source_id: chunk.sourceId,
      source_table: 'csv_import',
      chunk_index: i,
    }));

    // Insert in batches of 50
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50);
      const { error } = await supabaseAdmin
        .from('document_embeddings')
        .insert(batch);

      if (error) {
        console.error('[Import] Failed to insert embeddings batch:', error);
        return Response.json({
          error: 'Failed to save embeddings',
          details: error.message,
        }, { status: 500 });
      }
    }

    return Response.json({
      success: true,
      embeddingsCreated: rows.length,
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
