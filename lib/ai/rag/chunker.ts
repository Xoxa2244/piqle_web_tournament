import { getFormatLabel, getSkillLevelLabel, getDayName, getTimeSlot, getTimeSlotLabel, getOccupancyPercent } from '../scoring';

export type ContentType = 'club_info' | 'session' | 'member_pattern' | 'booking_trend' | 'faq' | 'club_insights';

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
  courts?: Array<{ name: string; courtType: string | null; isIndoor: boolean }>;
}): TextChunk[] {
  const courtInfo = club.courts?.length
    ? `Courts: ${club.courts.map(c => `${c.name} (${c.courtType || 'unknown type'}, ${c.isIndoor ? 'indoor' : 'outdoor'})`).join('; ')}.`
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
  frequentPartners?: Array<{ name: string; sharedSessions: number; favoriteFormat?: string | null }>;
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

  const partners = member.frequentPartners?.length
    ? `Frequent partners: ${member.frequentPartners.map(p => `${p.name} (${p.sharedSessions} sessions${p.favoriteFormat ? ', ' + getFormatLabel(p.favoriteFormat) : ''})`).join(', ')}.`
    : '';

  const content = [
    `Member: ${displayName}. ${rating}.`,
    member.persona ? `Player type: ${member.persona}.` : '',
    `${activity}. ${frequency}. ${member.totalBookings} total bookings.`,
    prefs.length ? prefs.join('. ') + '.' : '',
    reliability.length ? `Reliability: ${reliability.join(', ')}.` : '',
    partners,
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

// ── Club Insights Chunking (cross-data analytics) ──
export function chunkClubInsights(insights: {
  clubId: string;
  bookingLeadTime?: { avgDays: number; lastMinutePct: number };
  cancellationRate?: { overall: number; worstFormat?: string; worstFormatRate?: number };
  fillRate?: Array<{ format: string; day: string; timeBucket: string; avgFill: number }>;
  socialClusters?: Array<{ size: number; memberNames: string[] }>;
  skillMigrations?: Array<{ from: string; to: string; count: number }>;
  churnRiskPartners?: Array<{ userName: string; partnerName: string }>;
}): TextChunk[] {
  const parts: string[] = []

  if (insights.bookingLeadTime) {
    const lt = insights.bookingLeadTime
    parts.push(`Average booking lead time: ${lt.avgDays.toFixed(1)} days. ${lt.lastMinutePct}% of bookings are last-minute (within 24 hours).`)
  }

  if (insights.cancellationRate) {
    const cr = insights.cancellationRate
    parts.push(`Overall cancellation rate: ${cr.overall}%.${cr.worstFormat ? ` Highest cancellation: ${cr.worstFormat} at ${cr.worstFormatRate}%.` : ''}`)
  }

  if (insights.fillRate?.length) {
    const best = insights.fillRate.slice(0, 3)
    const worst = insights.fillRate.slice(-3).reverse()
    parts.push(`Best filling sessions: ${best.map(r => `${r.format} ${r.day} ${r.timeBucket} (${r.avgFill}%)`).join(', ')}.`)
    if (worst.length && worst[0].avgFill < 60) {
      parts.push(`Underperforming: ${worst.map(r => `${r.format} ${r.day} ${r.timeBucket} (${r.avgFill}%)`).join(', ')}.`)
    }
  }

  if (insights.socialClusters?.length) {
    parts.push(`${insights.socialClusters.length} social clusters detected (groups of 3+ players who frequently play together). Largest: ${insights.socialClusters[0].memberNames.slice(0, 4).join(', ')} (${insights.socialClusters[0].size} players).`)
  }

  if (insights.skillMigrations?.length) {
    const top = insights.skillMigrations.slice(0, 3)
    parts.push(`Skill progression: ${top.map(m => `${m.count} players moved ${m.from} → ${m.to}`).join(', ')}.`)
  }

  if (insights.churnRiskPartners?.length) {
    parts.push(`${insights.churnRiskPartners.length} players at elevated churn risk because their frequent partner became inactive.`)
  }

  if (parts.length === 0) return []

  return [{
    content: `Club Analytics Insights: ${parts.join(' ')}`,
    contentType: 'club_insights',
    metadata: { type: 'cross_data_insights' },
    sourceId: insights.clubId,
    sourceTable: 'clubs',
    chunkIndex: 0,
  }]
}

// ── Default FAQ entries: pickleball + platform how-tos + troubleshooting ──
export const DEFAULT_FAQS = [
  // ── Pickleball basics ──
  { question: 'What is DUPR?', answer: 'DUPR (Dynamic Universal Pickleball Rating) is the global rating system for pickleball players. Ratings range from 2.0 to 8.0. Below 3.0 is beginner, 3.0-4.5 is intermediate, and 5.0+ is advanced. Ratings are based on match results.', category: 'pickleball' },
  { question: 'What are the session formats?', answer: 'Open Play is drop-in style where players rotate partners. Clinic is instructor-led with structured teaching. Drill focuses on specific skills practice. League Play is competitive organized play. Social is casual, fun-focused play.', category: 'sessions' },
  { question: 'What are skill levels?', answer: 'Sessions can be tagged by skill: Beginner (2.0-2.99), Intermediate (3.0-3.49), Competitive (3.5-3.99), Advanced (4.0+), or All Levels. This helps match players to appropriate sessions and improves the experience for everyone.', category: 'pickleball' },

  // ── Platform metrics ──
  { question: 'What does occupancy percentage mean?', answer: 'Occupancy shows how full a session is — confirmed players vs maximum capacity. Below 50% is underfilled (opportunity to invite more). 70-90% is healthy. Above 90% may need a waitlist.', category: 'metrics' },
  { question: 'What are member health scores?', answer: 'Health scores track how engaged each member is based on booking frequency and recency. Segments: Healthy (active recently), Watch (slowing down), At-Risk (significant decline), Critical (nearly churned). The system automatically detects transitions and can trigger outreach.', category: 'metrics' },
  { question: 'What is booking lead time?', answer: 'Lead time measures how far in advance players book sessions. "Last minute" is under 24 hours, "planners" book 7+ days ahead. Understanding this helps optimize when to send session invites — last-minute players need same-day notifications.', category: 'metrics' },
  { question: 'What is fill rate?', answer: 'Fill rate shows which session combinations (format + day + time) fill the best. High fill rate (80%+) means strong demand. Low fill rate (<50%) means you should consider adjusting the time, format, or promoting it more.', category: 'metrics' },

  // ── Platform features ──
  { question: 'How does the Slot Filler work?', answer: 'Slot Filler identifies underfilled sessions and recommends members most likely to join, based on their schedule preferences, skill level, format preferences, and recent activity. You can send personalized invites directly from the recommendations.', category: 'features' },
  { question: 'How do Cohorts work?', answer: 'Cohorts are saved groups of members based on filters. You can filter by gender, age, skill level, membership type, session format, and day of week. Use cohorts for targeted campaigns — e.g. "Women who play Open Play on Wednesdays". You can also create a cohort directly from a past session\'s participant list.', category: 'features' },
  { question: 'How does AI Enrichment work?', answer: 'AI Enrichment automatically fills in missing member data. Gender is inferred from booking patterns (women\'s events) and name analysis. Skill level is detected from session titles (e.g. "Open Play Intermediate" → 3.0-3.49). Run it from the Cohorts page via "Enrich Data with AI" button.', category: 'features' },
  { question: 'What are Campaigns?', answer: 'Campaigns are automated or manual outreach messages sent to members via email or SMS. Types: Check-In (friendly nudge), Retention Boost (for declining members), Reactivation (win-back), Slot Filler (session invites), Event Invite. The system scores confidence for each message and auto-sends high-confidence ones.', category: 'features' },
  { question: 'What is the AI Advisor?', answer: 'I am the AI Advisor! I can help you with club analytics (members, sessions, revenue, fill rates), answer questions about your data, explain platform features, troubleshoot issues, and suggest actions to grow your club. Just ask me anything.', category: 'features' },
  { question: 'What are Frequent Partners?', answer: 'Frequent Partners shows which players regularly play together (based on shared session bookings). This helps with: targeted invites ("your partner John is already signed up!"), churn risk detection (if one partner leaves, the other may follow), and social cluster analysis.', category: 'features' },
  { question: 'What are Social Clusters?', answer: 'Social Clusters are groups of 3+ players who frequently play together. If one member in a cluster becomes inactive, the whole group is at elevated churn risk. Monitor clusters on the Analytics page to proactively retain friend groups.', category: 'features' },
  { question: 'How does the Schedule view work?', answer: 'The Schedule shows a grid of sessions by court and time. Click any session to see details: registered players, fill rate, and AI-recommended players to invite. Past sessions show a "Create Cohort" button to save participants as a group.', category: 'features' },

  // ── How-to guides ──
  { question: 'How do I connect CourtReserve?', answer: 'Go to Integrations page → enter your CourtReserve API Username and Password → check the consent checkbox → click Test Connection → if successful, click Connect & Sync. Your data will start syncing automatically. You need a Scale or Enterprise CourtReserve plan for API access. Find your API key in CourtReserve → Settings → API → Create API Key.', category: 'how-to' },
  { question: 'How do I import data from Excel/CSV?', answer: 'Go to Integrations → scroll to Import Data section. For CourtReserve: upload Members, Reservations, and Events .xlsx files (export from CourtReserve Reports). For PodPlay: upload Customers CSV and Settlements ZIP files. Files are auto-detected by filename.', category: 'how-to' },
  { question: 'How do I create a cohort?', answer: 'Go to Cohorts page → click "Create Cohort" → either type a natural language description (AI will parse it) or manually add filters. Available filters: Age, Gender, Session Type, Day of Week, Skill Level, Membership Type/Status, City, Zip Code. Preview shows matching count in real-time. Name your cohort and save.', category: 'how-to' },
  { question: 'How do I create a cohort from a past session?', answer: 'Go to Schedule → click on a past session → in the Players section, click "Create Cohort (N)" button. This creates a cohort containing all confirmed participants of that session. Useful for follow-up messaging after events.', category: 'how-to' },
  { question: 'How do I send invites to fill a session?', answer: 'Go to a future session with empty spots → check the Suggested Players section on the right → select players you want to invite → click "Invite Selected". The system ranks candidates by schedule fit, skill match, format preference, and recent activity.', category: 'how-to' },
  { question: 'How do I set up automated campaigns?', answer: 'Automated health-based campaigns run daily when enabled. Go to Settings → enable "Agent Live" mode. The system detects when members\' health scores decline and automatically sends appropriate messages (Check-In, Retention Boost, Reactivation). Messages are personalized with session recommendations and social proof.', category: 'how-to' },
  { question: 'How do I view analytics?', answer: 'Go to the Analytics page to see 6 cross-data insights: Social Clusters (player groups), Booking Lead Time (when people book), Cancellation Patterns (who cancels what), Skill Progression (level changes over time), Partner Churn Risk (inactive partner alerts), and Fill Rate (best/worst session combinations).', category: 'how-to' },
  { question: 'How do I see a player profile?', answer: 'Go to Members → click on any member name → their profile shows: activity trend (12-week chart), play patterns (favorite format, preferred time, active days, favorite courts), frequent partners, risk assessment, and recent sessions.', category: 'how-to' },
  { question: 'How do I enrich missing member data?', answer: 'Go to Cohorts page → if the Data Coverage banner shows low percentages (e.g. Gender 9%), click "Enrich Data with AI". This infers gender from event names and player names, and skill level from session titles. It runs automatically after each data sync too.', category: 'how-to' },
  { question: 'How do I check data coverage?', answer: 'Go to Integrations page → the Data Coverage section shows field-level percentages for Members, Sessions, Bookings, and Courts. Green (80%+) means good coverage, yellow (30-80%) means partial, red (<30%) means data is missing and may limit some features.', category: 'how-to' },

  // ── Troubleshooting ──
  { question: 'Why is my sync taking so long?', answer: 'Large clubs (5,000+ members) sync in progressive phases: Phase 1 loads the last 2 months + upcoming sessions first (most valuable). Phases 2-4 load older history over several hours with 2-hour pauses between phases to respect API rate limits. Your dashboard is useful after Phase 1.', category: 'troubleshooting' },
  { question: 'What does "Rate limited" mean during sync?', answer: 'CourtReserve API limits how many requests we can make per minute. When hit, sync pauses automatically and resumes after the cooldown (usually 1-3 minutes). This is normal for large initial syncs. The system handles it automatically — no action needed.', category: 'troubleshooting' },
  { question: 'Why does sync show over 100%?', answer: 'This is a known UI display issue — the member count estimate from the first API response can be lower than the actual total. The sync is working correctly, just the percentage display is inaccurate. We are fixing this.', category: 'troubleshooting' },
  { question: 'Why is some member data missing?', answer: 'Data coverage depends on what your club management software tracks. CourtReserve provides most fields. PodPlay CSV exports may lack: courts, cancellation dates, check-in data, zip codes, and skill levels. Use AI Enrichment to fill gender and skill level gaps. Check the Data Coverage section on Integrations for details.', category: 'troubleshooting' },
  { question: 'Why are AI recommendations not showing?', answer: 'Slot Filler recommendations require: (1) future sessions with empty spots, (2) active members with booking history, and (3) completed data sync. If you just connected, wait for the initial sync to finish. Check the Integrations page for sync status.', category: 'troubleshooting' },
  { question: 'My CourtReserve connection failed', answer: 'Common causes: (1) Wrong API credentials — verify in CourtReserve → Settings → API, (2) Plan doesn\'t support API — need Scale or Enterprise, (3) API key permissions — enable Read access for Members, Reservations, Events, Transactions. Try Test Connection on the Integrations page to see the specific error.', category: 'troubleshooting' },
  { question: 'How do I disconnect and reconnect?', answer: 'Go to Integrations → click "Disconnect" on the CourtReserve connector. This removes credentials but keeps existing data. Then enter new credentials and click Connect & Sync to reconnect. All data will be re-synced.', category: 'troubleshooting' },
  { question: 'Emails are not being sent', answer: 'Automated emails only send when "Agent Live" is enabled in Settings. By default, the system runs in dry-run mode (calculates but doesn\'t send). Also check: member has valid email, member hasn\'t opted out, anti-spam limits haven\'t been reached (max 2-3 per day per member).', category: 'troubleshooting' },
];
