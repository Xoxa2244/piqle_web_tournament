import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateEmbeddings } from '@/lib/ai/rag/embeddings';
import { parse as parseCookie } from 'cookie';

// Allow long-running imports (Vercel Pro: up to 300s)
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

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
  pricePerPlayer: number | null;
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

  if (session.pricePerPlayer != null) {
    const revenue = session.registered * session.pricePerPlayer;
    const potentialRevenue = session.capacity * session.pricePerPlayer;
    const lostRevenue = emptySlots * session.pricePerPlayer;
    parts.push(`Price: $${session.pricePerPlayer} per player. Revenue: $${revenue} (potential: $${potentialRevenue}, lost: $${lostRevenue}).`);
  }

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

  // Revenue calculations
  const sessionsWithPrice = sessions.filter(s => s.pricePerPlayer != null);
  const hasRevenue = sessionsWithPrice.length > 0;
  const totalRevenue = sessionsWithPrice.reduce((s, x) => s + x.registered * (x.pricePerPlayer || 0), 0);
  const potentialRevenue = sessionsWithPrice.reduce((s, x) => s + x.capacity * (x.pricePerPlayer || 0), 0);
  const lostRevenue = potentialRevenue - totalRevenue;
  const avgPricePerPlayer = sessionsWithPrice.length > 0
    ? Math.round(sessionsWithPrice.reduce((s, x) => s + (x.pricePerPlayer || 0), 0) / sessionsWithPrice.length * 100) / 100
    : 0;

  const lines = [
    `Club Schedule Summary: ${totalSessions} sessions imported.`,
    `Total capacity: ${totalSlots} slots, ${filledSlots} filled, ${emptySlots} empty.`,
    `Average occupancy: ${avgOccupancy}%. ${underfilled} sessions are underfilled (below 80%).`,
    `Formats offered: ${topFormats}.`,
    `${allPlayers.size} unique players across all sessions.`,
  ];

  if (hasRevenue) {
    lines.push(
      `Revenue data: $${totalRevenue.toLocaleString()} actual revenue, $${potentialRevenue.toLocaleString()} potential revenue, $${lostRevenue.toLocaleString()} lost revenue from empty slots.`,
      `Average price per player: $${avgPricePerPlayer}.`,
    );
  }

  return lines.join(' ');
}

// ── Build analytical summary chunks ──
function buildAnalyticalChunks(sessions: ImportedSession[]): { text: string; contentType: string; sourceId: string }[] {
  const chunks: { text: string; contentType: string; sourceId: string }[] = [];

  // Helper: get day name from date string
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const getDayName = (dateStr: string) => dayNames[new Date(dateStr + 'T12:00:00').getDay()];

  // 1. Day-of-week breakdown
  const byDay: Record<string, { sessions: number; filled: number; total: number }> = {};
  sessions.forEach(s => {
    const day = getDayName(s.date);
    if (!byDay[day]) byDay[day] = { sessions: 0, filled: 0, total: 0 };
    byDay[day].sessions++;
    byDay[day].filled += s.registered;
    byDay[day].total += s.capacity;
  });

  const dayLines = Object.entries(byDay)
    .sort((a, b) => (a[1].total > 0 ? a[1].filled / a[1].total : 0) - (b[1].total > 0 ? b[1].filled / b[1].total : 0))
    .map(([day, d]) => `${day}: ${d.sessions} sessions, ${d.filled}/${d.total} slots filled (${d.total > 0 ? Math.round((d.filled / d.total) * 100) : 0}% occupancy)`);

  const weakestDay = dayLines[0]?.split(':')[0] || 'N/A';
  const strongestDay = dayLines[dayLines.length - 1]?.split(':')[0] || 'N/A';

  chunks.push({
    text: `Day of week analysis. Weakest day: ${weakestDay}. Strongest day: ${strongestDay}. Breakdown:\n${dayLines.join('\n')}`,
    contentType: 'booking_trend',
    sourceId: 'analytics-day-of-week',
  });

  // 2. Time slot breakdown
  const byTime: Record<string, { sessions: number; filled: number; total: number }> = {};
  sessions.forEach(s => {
    const slot = `${s.startTime}-${s.endTime}`;
    if (!byTime[slot]) byTime[slot] = { sessions: 0, filled: 0, total: 0 };
    byTime[slot].sessions++;
    byTime[slot].filled += s.registered;
    byTime[slot].total += s.capacity;
  });

  const timeLines = Object.entries(byTime)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([slot, d]) => `${slot}: ${d.sessions} sessions, ${d.filled}/${d.total} slots (${d.total > 0 ? Math.round((d.filled / d.total) * 100) : 0}% occupancy)`);

  const peakSlot = Object.entries(byTime).sort((a, b) => (b[1].total > 0 ? b[1].filled / b[1].total : 0) - (a[1].total > 0 ? a[1].filled / a[1].total : 0))[0];
  const deadSlot = Object.entries(byTime).sort((a, b) => (a[1].total > 0 ? a[1].filled / a[1].total : 0) - (b[1].total > 0 ? b[1].filled / b[1].total : 0))[0];

  chunks.push({
    text: `Time slot analysis (peak and dead hours). Peak hours: ${peakSlot?.[0] || 'N/A'}. Dead hours: ${deadSlot?.[0] || 'N/A'}. Breakdown:\n${timeLines.join('\n')}`,
    contentType: 'booking_trend',
    sourceId: 'analytics-time-slots',
  });

  // 3. Format breakdown
  const byFormat: Record<string, { sessions: number; filled: number; total: number }> = {};
  sessions.forEach(s => {
    const f = s.format.replace(/_/g, ' ').toLowerCase();
    if (!byFormat[f]) byFormat[f] = { sessions: 0, filled: 0, total: 0 };
    byFormat[f].sessions++;
    byFormat[f].filled += s.registered;
    byFormat[f].total += s.capacity;
  });

  const formatLines = Object.entries(byFormat)
    .sort((a, b) => b[1].sessions - a[1].sessions)
    .map(([f, d]) => `${f}: ${d.sessions} sessions, ${d.filled}/${d.total} slots (${d.total > 0 ? Math.round((d.filled / d.total) * 100) : 0}% occupancy)`);

  const underfilled = Object.entries(byFormat)
    .filter(([, d]) => d.total > 0 && (d.filled / d.total) < 0.5)
    .map(([f]) => f);

  chunks.push({
    text: `Session format analysis. ${formatLines.length} formats offered. ${underfilled.length > 0 ? `Underfilled formats (below 50% occupancy): ${underfilled.join(', ')}.` : 'All formats above 50% occupancy.'} Breakdown:\n${formatLines.join('\n')}`,
    contentType: 'booking_trend',
    sourceId: 'analytics-formats',
  });

  // 4. Court utilization
  const byCourt: Record<string, { sessions: number; filled: number; total: number }> = {};
  sessions.forEach(s => {
    if (!byCourt[s.court]) byCourt[s.court] = { sessions: 0, filled: 0, total: 0 };
    byCourt[s.court].sessions++;
    byCourt[s.court].filled += s.registered;
    byCourt[s.court].total += s.capacity;
  });

  const courtLines = Object.entries(byCourt)
    .sort((a, b) => b[1].sessions - a[1].sessions)
    .map(([c, d]) => `${c}: ${d.sessions} sessions, ${d.total > 0 ? Math.round((d.filled / d.total) * 100) : 0}% occupancy`);

  chunks.push({
    text: `Court utilization analysis. ${Object.keys(byCourt).length} courts used. Breakdown:\n${courtLines.join('\n')}`,
    contentType: 'booking_trend',
    sourceId: 'analytics-courts',
  });

  // 5. Monthly trends
  const byMonth: Record<string, { sessions: number; filled: number; total: number }> = {};
  sessions.forEach(s => {
    const month = s.date.slice(0, 7); // YYYY-MM
    if (!byMonth[month]) byMonth[month] = { sessions: 0, filled: 0, total: 0 };
    byMonth[month].sessions++;
    byMonth[month].filled += s.registered;
    byMonth[month].total += s.capacity;
  });

  const monthLines = Object.entries(byMonth)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([m, d]) => `${m}: ${d.sessions} sessions, ${d.total > 0 ? Math.round((d.filled / d.total) * 100) : 0}% occupancy`);

  // Growth trend
  const months = Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0]));
  const firstQ = months.slice(0, 3);
  const lastQ = months.slice(-3);
  const firstQAvg = firstQ.reduce((s, [, d]) => s + d.sessions, 0) / Math.max(firstQ.length, 1);
  const lastQAvg = lastQ.reduce((s, [, d]) => s + d.sessions, 0) / Math.max(lastQ.length, 1);
  const growthPct = firstQAvg > 0 ? Math.round(((lastQAvg - firstQAvg) / firstQAvg) * 100) : 0;

  chunks.push({
    text: `Monthly trends and growth analysis. ${months.length} months of data. Growth from first to last quarter: ${growthPct}%. Breakdown:\n${monthLines.join('\n')}`,
    contentType: 'booking_trend',
    sourceId: 'analytics-monthly',
  });

  // 6. Skill level breakdown
  const bySkill: Record<string, { sessions: number; filled: number; total: number }> = {};
  sessions.forEach(s => {
    const sk = s.skillLevel.replace(/_/g, ' ').toLowerCase();
    if (!bySkill[sk]) bySkill[sk] = { sessions: 0, filled: 0, total: 0 };
    bySkill[sk].sessions++;
    bySkill[sk].filled += s.registered;
    bySkill[sk].total += s.capacity;
  });

  const skillLines = Object.entries(bySkill)
    .sort((a, b) => b[1].sessions - a[1].sessions)
    .map(([sk, d]) => `${sk}: ${d.sessions} sessions, ${d.total > 0 ? Math.round((d.filled / d.total) * 100) : 0}% occupancy`);

  chunks.push({
    text: `Skill level analysis. Breakdown:\n${skillLines.join('\n')}`,
    contentType: 'booking_trend',
    sourceId: 'analytics-skill-levels',
  });

  // 7. Churn / player activity analysis
  const playerDates: Record<string, string[]> = {};
  sessions.forEach(s => {
    s.playerNames.forEach(name => {
      if (!playerDates[name]) playerDates[name] = [];
      playerDates[name].push(s.date);
    });
  });

  const allDates = sessions.map(s => s.date).sort();
  const midDate = allDates[Math.floor(allDates.length / 2)] || allDates[0];

  let activeFirstHalf = 0;
  let activeSecondHalf = 0;
  let activeBoth = 0;
  let churnedCount = 0;
  let newCount = 0;

  Object.entries(playerDates).forEach(([, dates]) => {
    const inFirst = dates.some(d => d < midDate);
    const inSecond = dates.some(d => d >= midDate);
    if (inFirst) activeFirstHalf++;
    if (inSecond) activeSecondHalf++;
    if (inFirst && inSecond) activeBoth++;
    if (inFirst && !inSecond) churnedCount++;
    if (!inFirst && inSecond) newCount++;
  });

  const totalPlayers = Object.keys(playerDates).length;
  const retentionRate = activeFirstHalf > 0 ? Math.round((activeBoth / activeFirstHalf) * 100) : 0;
  const churnRate = activeFirstHalf > 0 ? Math.round((churnedCount / activeFirstHalf) * 100) : 0;

  // Activity tiers
  const sessionCounts = Object.entries(playerDates).map(([name, dates]) => ({ name, count: dates.length }));
  sessionCounts.sort((a, b) => b.count - a.count);
  const regulars = sessionCounts.filter(p => p.count >= 20);
  const actives = sessionCounts.filter(p => p.count >= 5 && p.count < 20);
  const casuals = sessionCounts.filter(p => p.count >= 2 && p.count < 5);
  const oneTimers = sessionCounts.filter(p => p.count === 1);

  chunks.push({
    text: `Player churn and retention analysis. ${totalPlayers} total players. Data split at ${midDate}. ` +
      `Retention rate: ${retentionRate}% (${activeBoth} of ${activeFirstHalf} first-half players returned). ` +
      `Churn rate: ${churnRate}% (${churnedCount} players stopped coming). ` +
      `New players in second half: ${newCount}. ` +
      `Activity tiers: ${regulars.length} regulars (20+ sessions), ${actives.length} active (5-19), ${casuals.length} casual (2-4), ${oneTimers.length} one-time visitors. ` +
      `Top 10 most active: ${sessionCounts.slice(0, 10).map(p => `${p.name} (${p.count})`).join(', ')}.`,
    contentType: 'member_pattern',
    sourceId: 'analytics-churn',
  });

  // 8. Revenue opportunity / empty slots analysis
  const totalSlots = sessions.reduce((s, x) => s + x.capacity, 0);
  const filledSlots = sessions.reduce((s, x) => s + x.registered, 0);
  const emptySlots = totalSlots - filledSlots;

  // Revenue calculations (use actual prices when available)
  const sessionsWithPrice = sessions.filter(s => s.pricePerPlayer != null);
  const hasRevenue = sessionsWithPrice.length > 0;
  const totalRevenue = sessionsWithPrice.reduce((s, x) => s + x.registered * (x.pricePerPlayer || 0), 0);
  const potentialRevenue = sessionsWithPrice.reduce((s, x) => s + x.capacity * (x.pricePerPlayer || 0), 0);
  const lostRevenue = potentialRevenue - totalRevenue;
  const avgPrice = hasRevenue
    ? Math.round(sessionsWithPrice.reduce((s, x) => s + (x.pricePerPlayer || 0), 0) / sessionsWithPrice.length * 100) / 100
    : 0;

  // Find worst combinations (day + time + format with most empty slots / lost revenue)
  const combos: Record<string, { empty: number; total: number; count: number; lostRev: number }> = {};
  sessions.forEach(s => {
    const day = getDayName(s.date);
    const key = `${day} ${s.startTime}-${s.endTime} ${s.format.replace(/_/g, ' ').toLowerCase()}`;
    if (!combos[key]) combos[key] = { empty: 0, total: 0, count: 0, lostRev: 0 };
    const empty = s.capacity - s.registered;
    combos[key].empty += empty;
    combos[key].total += s.capacity;
    combos[key].count++;
    combos[key].lostRev += (s.pricePerPlayer || 0) * empty;
  });

  const worstCombos = Object.entries(combos)
    .sort((a, b) => hasRevenue ? b[1].lostRev - a[1].lostRev : b[1].empty - a[1].empty)
    .slice(0, 10)
    .map(([key, d]) => {
      const fillRate = d.total > 0 ? Math.round(((d.total - d.empty) / d.total) * 100) : 0;
      const revPart = hasRevenue ? `, $${d.lostRev} lost revenue` : '';
      return `${key}: ${d.empty} empty slots across ${d.count} sessions (${fillRate}% fill rate${revPart})`;
    });

  // Revenue by format
  const revenueByFormat: Record<string, { revenue: number; potential: number; sessions: number }> = {};
  sessionsWithPrice.forEach(s => {
    const f = s.format.replace(/_/g, ' ').toLowerCase();
    if (!revenueByFormat[f]) revenueByFormat[f] = { revenue: 0, potential: 0, sessions: 0 };
    revenueByFormat[f].revenue += s.registered * (s.pricePerPlayer || 0);
    revenueByFormat[f].potential += s.capacity * (s.pricePerPlayer || 0);
    revenueByFormat[f].sessions++;
  });
  const formatRevenueLines = Object.entries(revenueByFormat)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .map(([f, d]) => `${f}: $${d.revenue} revenue from ${d.sessions} sessions (potential: $${d.potential})`);

  // Revenue by day of week
  const revenueByDay: Record<string, { revenue: number; potential: number }> = {};
  sessionsWithPrice.forEach(s => {
    const day = getDayName(s.date);
    if (!revenueByDay[day]) revenueByDay[day] = { revenue: 0, potential: 0 };
    revenueByDay[day].revenue += s.registered * (s.pricePerPlayer || 0);
    revenueByDay[day].potential += s.capacity * (s.pricePerPlayer || 0);
  });
  const dayRevenueLines = Object.entries(revenueByDay)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .map(([day, d]) => `${day}: $${d.revenue} actual / $${d.potential} potential`);

  let revenueText = `Revenue opportunity and empty slots analysis. ${emptySlots} total empty slots out of ${totalSlots} capacity (${Math.round((filledSlots / totalSlots) * 100)}% overall fill rate).`;

  if (hasRevenue) {
    revenueText += ` Total revenue: $${totalRevenue.toLocaleString()}. Potential revenue: $${potentialRevenue.toLocaleString()}. Lost revenue from empty slots: $${lostRevenue.toLocaleString()}. Average price per player: $${avgPrice}.`;
    revenueText += `\nRevenue by format:\n${formatRevenueLines.join('\n')}`;
    revenueText += `\nRevenue by day:\n${dayRevenueLines.join('\n')}`;
  }

  revenueText += `\nWorst performing combinations:\n${worstCombos.join('\n')}`;

  chunks.push({
    text: revenueText,
    contentType: 'booking_trend',
    sourceId: 'analytics-revenue',
  });

  return chunks;
}

// ── SSE helper ──
function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: Request) {
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

  // 4. Stream progress via SSE
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(sseEvent(data)));
      };

      try {
        // Flush: send a comment to force proxy to start streaming
        controller.enqueue(encoder.encode(': stream start\n\n'));

        // Phase 1: Delete old data
        send({ phase: 'deleting', message: 'Removing old data...' });
        try {
          await prisma.$executeRaw`
            DELETE FROM document_embeddings
            WHERE club_id = ${clubId}::uuid AND source_table = 'csv_import'
          `;
        } catch (deleteErr) {
          send({ phase: 'error', message: `Failed to delete old data: ${deleteErr instanceof Error ? deleteErr.message : String(deleteErr)}` });
          controller.close();
          return;
        }

        // Phase 2: Build chunks
        send({ phase: 'preparing', message: 'Preparing data...' });

        const chunks: { text: string; contentType: string; metadata: Record<string, unknown>; sourceId: string }[] = [];

        const allPlayersSet = new Set<string>();
        sessions.forEach(s => s.playerNames.forEach(p => allPlayersSet.add(p)));

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

        sessions.forEach((s, i) => {
          chunks.push({
            text: sessionToText(s, i),
            contentType: 'session',
            metadata: {
              date: s.date, startTime: s.startTime, endTime: s.endTime,
              court: s.court, format: s.format, skillLevel: s.skillLevel,
              registered: s.registered, capacity: s.capacity,
              occupancy: s.capacity > 0 ? Math.round((s.registered / s.capacity) * 100) : 0,
              pricePerPlayer: s.pricePerPlayer,
              revenue: s.pricePerPlayer != null ? s.registered * s.pricePerPlayer : null,
              lostRevenue: s.pricePerPlayer != null ? Math.max(0, s.capacity - s.registered) * s.pricePerPlayer : null,
              playerNames: s.playerNames,
            },
            sourceId: `import-session-${i}`,
          });
        });

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

        const topPlayers = Object.entries(playerFrequency)
          .sort((a, b) => b[1].count - a[1].count);

        topPlayers.forEach(([name, data]) => {
          chunks.push({
            text: `Player: ${name}. Registered for ${data.count} sessions. Plays ${Array.from(data.formats).join(', ')}. Active days: ${Array.from(data.days).join(', ')}.`,
            contentType: 'member_pattern',
            metadata: { playerName: name, sessionCount: data.count },
            sourceId: `import-player-${name}`,
          });
        });

        // Add pre-computed analytical summaries
        const analyticalChunks = buildAnalyticalChunks(sessions);
        analyticalChunks.forEach(ac => {
          chunks.push({
            text: ac.text,
            contentType: ac.contentType,
            metadata: { type: 'analytics' },
            sourceId: ac.sourceId,
          });
        });

        const totalChunks = chunks.length;

        // Phase 2.5: Create PlaySession + PlaySessionBooking records in DB
        send({ phase: 'creating_sessions', message: 'Creating session records...' });
        try {
          const { importSessionsToDB } = await import('@/lib/ai/session-importer');
          const importResult = await importSessionsToDB(
            prisma,
            clubId,
            sessions,
            (current, total, message) => {
              send({ phase: 'creating_sessions', current, total, message });
            },
          );
          send({
            phase: 'creating_sessions',
            message: `Created ${importResult.sessionsCreated} sessions, ${importResult.bookingsCreated} bookings, ${importResult.courtsCreated} courts. Matched ${importResult.playersMatched} players.`,
            current: sessions.length,
            total: sessions.length,
            ...importResult,
          });
        } catch (importErr) {
          console.error('[Import] Session DB creation failed (non-fatal):', importErr);
          send({ phase: 'creating_sessions', message: `Warning: session records not created: ${importErr instanceof Error ? importErr.message : String(importErr)}` });
        }

        // Phase 2.6: Auto-trigger campaign engine for this club
        send({ phase: 'campaign', message: 'Calculating health scores...' });
        try {
          const { runHealthCampaign } = await import('@/lib/ai/campaign-engine');
          const campaignResult = await runHealthCampaign(prisma, clubId);
          send({
            phase: 'campaign',
            message: `Health scores calculated: ${campaignResult.membersProcessed} members, ${campaignResult.messagesSent} messages sent.`,
            membersProcessed: campaignResult.membersProcessed,
            messagesSent: campaignResult.messagesSent,
          });
        } catch (campaignErr) {
          console.error('[Import] Campaign trigger failed (non-fatal):', campaignErr);
          send({ phase: 'campaign', message: `Warning: campaign not triggered: ${campaignErr instanceof Error ? campaignErr.message : String(campaignErr)}` });
        }

        // Phase 3: Generate embeddings in batches with progress
        const batchSize = 100;
        const totalBatches = Math.ceil(totalChunks / batchSize);
        const allEmbeddings: number[][] = [];

        console.log(`[Import] Generating embeddings for ${totalChunks} chunks in ${totalBatches} batches...`);

        for (let b = 0; b < totalBatches; b++) {
          const start = b * batchSize;
          const end = Math.min(start + batchSize, totalChunks);
          const batchTexts = chunks.slice(start, end).map(c => c.text);

          send({
            phase: 'embedding',
            current: start,
            total: totalChunks,
            message: `Generating AI embeddings... (${start}/${totalChunks})`,
          });

          const batchEmbeddings = await generateEmbeddings(batchTexts);
          allEmbeddings.push(...batchEmbeddings);
        }

        send({ phase: 'embedding', current: totalChunks, total: totalChunks, message: 'Embeddings complete' });

        if (allEmbeddings.length !== totalChunks) {
          send({ phase: 'error', message: `Embedding count mismatch: expected ${totalChunks}, got ${allEmbeddings.length}` });
          controller.close();
          return;
        }

        // Phase 4: Insert into DB in batches (50 rows per query)
        const insertBatchSize = 50;
        for (let batchStart = 0; batchStart < chunks.length; batchStart += insertBatchSize) {
          const batchEnd = Math.min(batchStart + insertBatchSize, chunks.length);
          const batchChunks = chunks.slice(batchStart, batchEnd);

          const params: unknown[] = [];
          const valuesClauses: string[] = [];

          batchChunks.forEach((chunk, j) => {
            const globalIdx = batchStart + j;
            const offset = j * 8;
            const embeddingStr = `[${allEmbeddings[globalIdx].join(',')}]`;
            valuesClauses.push(
              `(gen_random_uuid(), $${offset + 1}::uuid, $${offset + 2}, $${offset + 3}, $${offset + 4}::jsonb, $${offset + 5}::vector, $${offset + 6}, $${offset + 7}, $${offset + 8})`
            );
            params.push(
              clubId,
              chunk.text,
              chunk.contentType,
              JSON.stringify(chunk.metadata),
              embeddingStr,
              chunk.sourceId,
              'csv_import',
              globalIdx,
            );
          });

          try {
            await prisma.$executeRawUnsafe(
              `INSERT INTO document_embeddings (id, club_id, content, content_type, metadata, embedding, source_id, source_table, chunk_index)
               VALUES ${valuesClauses.join(', ')}`,
              ...params,
            );
          } catch (insertErr) {
            send({ phase: 'error', message: `Failed to save batch at ${batchStart}: ${insertErr instanceof Error ? insertErr.message : String(insertErr)}` });
            controller.close();
            return;
          }

          send({
            phase: 'saving',
            current: batchEnd,
            total: totalChunks,
            message: `Saving to database... (${batchEnd}/${totalChunks})`,
          });
        }

        // Phase 5: Done
        send({
          phase: 'done',
          embeddingsCreated: totalChunks,
          sessionsProcessed: sessions.length,
          playersIndexed: topPlayers.length,
        });
        controller.close();
      } catch (error) {
        console.error('[Import] Unexpected error:', error);
        send({ phase: 'error', message: error instanceof Error ? error.message : 'Unknown error' });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Content-Encoding': 'none',
    },
  });
}

// ── DELETE: Remove all imported data for a club ──
export async function DELETE(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { clubId } = body as { clubId: string };

  if (!clubId) {
    return Response.json({ error: 'clubId is required' }, { status: 400 });
  }

  const admin = await prisma.clubAdmin.findFirst({ where: { clubId, userId: session.userId } });
  if (!admin) {
    return Response.json({ error: 'Only club admins can delete imports' }, { status: 403 });
  }

  try {
    // 1. Delete ALL embeddings for this club (csv_import + analytics + player patterns)
    const embeddingsDeleted = await prisma.$executeRaw`
      DELETE FROM document_embeddings WHERE club_id = ${clubId}::uuid
    `;

    // 2. Delete bookings for imported sessions
    const bookingsDeleted = await prisma.$executeRaw`
      DELETE FROM play_session_bookings WHERE "sessionId" IN (
        SELECT id FROM play_sessions WHERE "clubId" = ${clubId}::uuid
      )
    `;

    // 3. Delete sessions
    const sessionsDeleted = await prisma.$executeRaw`
      DELETE FROM play_sessions WHERE "clubId" = ${clubId}::uuid
    `;

    // 4. Delete health snapshots
    const healthDeleted = await prisma.$executeRaw`
      DELETE FROM member_health_snapshots WHERE club_id = ${clubId}::uuid
    `;

    console.log(`[Delete Import] Club ${clubId}: ${sessionsDeleted} sessions, ${bookingsDeleted} bookings, ${embeddingsDeleted} embeddings, ${healthDeleted} health snapshots deleted`);

    return Response.json({ sessionsDeleted, bookingsDeleted, embeddingsDeleted, healthDeleted });
  } catch (err) {
    console.error('[Delete Import] Error:', err);
    return Response.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
