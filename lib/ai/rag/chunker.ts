import { getFormatLabel, getSkillLevelLabel, getDayName, getTimeSlot, getTimeSlotLabel, getOccupancyPercent } from '../scoring';

export type ContentType = 'club_info' | 'session' | 'member_pattern' | 'booking_trend' | 'faq';

export interface TextChunk {
  content: string;
  contentType: ContentType;
  metadata: Record<string, unknown>;
  sourceId?: string;
  sourceTable?: string;
  chunkIndex: number;
}

// ── Club Info Chunking ──
export function chunkClubInfo(club: {
  id: string;
  name: string;
  description?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  courts?: Array<{ name: string; surface: string | null; isIndoor: boolean }>;
}): TextChunk[] {
  const courtInfo = club.courts?.length
    ? `Courts: ${club.courts.map(c => `${c.name} (${c.surface || 'unknown surface'}, ${c.isIndoor ? 'indoor' : 'outdoor'})`).join('; ')}.`
    : '';

  const location = [club.address, club.city, club.state].filter(Boolean).join(', ');

  const content = [
    `Club: ${club.name}.`,
    club.description ? `Description: ${club.description}.` : '',
    location ? `Location: ${location}.` : '',
    courtInfo,
  ].filter(Boolean).join(' ');

  return [{
    content,
    contentType: 'club_info',
    metadata: { clubName: club.name },
    sourceId: club.id,
    sourceTable: 'clubs',
    chunkIndex: 0,
  }];
}

// ── Play Session Chunking ──
export function chunkSession(session: {
  id: string;
  title: string;
  format: string;
  skillLevel: string;
  date: Date;
  startTime: string;
  endTime: string;
  maxPlayers: number;
  description?: string | null;
  confirmedCount?: number;
  courtName?: string | null;
  hostName?: string | null;
}): TextChunk[] {
  const dateStr = new Date(session.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const dayName = getDayName(new Date(session.date));
  const timeSlot = getTimeSlot(session.startTime);
  const occupancy = session.confirmedCount !== undefined
    ? `${session.confirmedCount}/${session.maxPlayers} players confirmed (${getOccupancyPercent(session.confirmedCount, session.maxPlayers)}% full)`
    : `Capacity: ${session.maxPlayers} players`;

  const content = [
    `Session: "${session.title}" on ${dateStr} from ${session.startTime} to ${session.endTime}.`,
    `Format: ${getFormatLabel(session.format)}. Skill level: ${session.skillLevel}.`,
    occupancy + '.',
    session.courtName ? `Court: ${session.courtName}.` : '',
    session.hostName ? `Host: ${session.hostName}.` : '',
    session.description ? `Details: ${session.description}.` : '',
  ].filter(Boolean).join(' ');

  return [{
    content,
    contentType: 'session',
    metadata: {
      sessionTitle: session.title,
      format: session.format,
      skillLevel: session.skillLevel,
      dayOfWeek: dayName,
      timeSlot,
      date: new Date(session.date).toISOString(),
    },
    sourceId: session.id,
    sourceTable: 'play_sessions',
    chunkIndex: 0,
  }];
}

// ── Member Pattern Chunking ──
export function chunkMemberPattern(member: {
  id: string;
  name?: string | null;
  email: string;
  duprRatingDoubles?: number | null;
  persona?: string | null;
  totalBookings: number;
  bookingsLastMonth: number;
  daysSinceLastBooking: number | null;
  preferredDays?: string[];
  preferredTimeSlots?: Record<string, boolean>;
  preferredFormats?: string[];
  cancelledCount?: number;
  noShowCount?: number;
}): TextChunk[] {
  const displayName = member.name || member.email.split('@')[0];
  const rating = member.duprRatingDoubles ? `DUPR: ${member.duprRatingDoubles}` : 'No DUPR rating';
  const activity = member.daysSinceLastBooking !== null
    ? `Last played ${member.daysSinceLastBooking} days ago`
    : 'Never booked';
  const frequency = member.bookingsLastMonth > 0
    ? `${member.bookingsLastMonth} sessions in the last month`
    : 'No recent sessions';

  const prefs: string[] = [];
  if (member.preferredDays?.length) prefs.push(`Preferred days: ${member.preferredDays.join(', ')}`);
  if (member.preferredTimeSlots) {
    const activeSlots = Object.entries(member.preferredTimeSlots)
      .filter(([, active]) => active)
      .map(([slot]) => slot);
    if (activeSlots.length) prefs.push(`Preferred times: ${activeSlots.join(', ')}`);
  }
  if (member.preferredFormats?.length) prefs.push(`Preferred formats: ${member.preferredFormats.map(f => getFormatLabel(f)).join(', ')}`);

  const reliability: string[] = [];
  if (member.cancelledCount) reliability.push(`${member.cancelledCount} cancellations`);
  if (member.noShowCount) reliability.push(`${member.noShowCount} no-shows`);

  const content = [
    `Member: ${displayName}. ${rating}.`,
    member.persona ? `Player type: ${member.persona}.` : '',
    `${activity}. ${frequency}. ${member.totalBookings} total bookings.`,
    prefs.length ? prefs.join('. ') + '.' : '',
    reliability.length ? `Reliability: ${reliability.join(', ')}.` : '',
  ].filter(Boolean).join(' ');

  return [{
    content,
    contentType: 'member_pattern',
    metadata: {
      memberName: displayName,
      totalBookings: member.totalBookings,
      daysSinceLastBooking: member.daysSinceLastBooking,
      persona: member.persona,
    },
    sourceId: member.id,
    sourceTable: 'users',
    chunkIndex: 0,
  }];
}

// ── Booking Trend Chunking ──
export function chunkBookingTrend(trend: {
  clubId: string;
  weekStartDate: Date;
  totalBookings: number;
  totalSessions: number;
  avgOccupancy: number;
  busiestDay?: string;
  busiestTimeSlot?: string;
  totalRevenueCents?: number;
  newMembers?: number;
}): TextChunk[] {
  const weekStr = new Date(trend.weekStartDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const revenue = trend.totalRevenueCents ? `Revenue: $${(trend.totalRevenueCents / 100).toFixed(0)}.` : '';

  const content = [
    `Week of ${weekStr}: ${trend.totalBookings} bookings across ${trend.totalSessions} sessions.`,
    `Average occupancy: ${trend.avgOccupancy}%.`,
    trend.busiestDay ? `Busiest day: ${trend.busiestDay}${trend.busiestTimeSlot ? ` (${trend.busiestTimeSlot})` : ''}.` : '',
    revenue,
    trend.newMembers ? `New members this week: ${trend.newMembers}.` : '',
  ].filter(Boolean).join(' ');

  return [{
    content,
    contentType: 'booking_trend',
    metadata: {
      weekStart: new Date(trend.weekStartDate).toISOString(),
      totalBookings: trend.totalBookings,
      avgOccupancy: trend.avgOccupancy,
    },
    sourceId: trend.clubId,
    sourceTable: 'clubs',
    chunkIndex: 0,
  }];
}

// ── FAQ / Static Knowledge Chunking ──
export function chunkFAQ(faq: { question: string; answer: string; category: string }): TextChunk[] {
  return [{
    content: `Q: ${faq.question}\nA: ${faq.answer}`,
    contentType: 'faq',
    metadata: { category: faq.category },
    chunkIndex: 0,
  }];
}

// ── Default FAQ entries for pickleball context ──
export const DEFAULT_FAQS = [
  {
    question: 'What is DUPR?',
    answer: 'DUPR (Dynamic Universal Pickleball Rating) is the global rating system for pickleball players. Ratings range from 2.0 to 8.0. Below 3.0 is beginner, 3.0-4.5 is intermediate, and 5.0+ is advanced. Ratings are based on match results.',
    category: 'pickleball',
  },
  {
    question: 'What are the session formats?',
    answer: 'Open Play is drop-in style where players rotate partners. Clinic is instructor-led with structured teaching. Drill focuses on specific skills practice. League Play is competitive organized play. Social is casual, fun-focused play.',
    category: 'sessions',
  },
  {
    question: 'What does occupancy percentage mean?',
    answer: 'Occupancy shows how full a session is — the percentage of confirmed players vs maximum capacity. Below 50% is underfilled (opportunity to invite more players). 70-90% is healthy. Above 90% may need a waitlist.',
    category: 'metrics',
  },
  {
    question: 'How does the Slot Filler work?',
    answer: 'Slot Filler identifies underfilled sessions and recommends members most likely to join, based on their schedule preferences, skill level, format preferences, and recent activity. You can send personalized invites directly from the recommendations.',
    category: 'features',
  },
];
