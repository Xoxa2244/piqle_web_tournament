// ── Demo mock data for Intelligence module ──
// Used when ?demo=true is set, no database needed.

const today = new Date()
const fmt = (daysFromNow: number) => {
  const d = new Date(today)
  d.setDate(d.getDate() + daysFromNow)
  return d.toISOString()
}

// ── Dashboard ──
export const mockDashboard = {
  metrics: {
    totalMembers: 127,
    totalCourts: 6,
    avgOccupancy: 62,
    recentBookings: 284,
    underfilledCount: 4,
    aiRecommendationsThisWeek: 18,
    estimatedLostRevenue: 1260,
    emptySlots: 84,
  },
  upcomingSessions: [
    {
      id: 'demo-s1',
      title: 'Morning Open Play',
      date: fmt(1),
      startTime: '08:00',
      endTime: '10:00',
      format: 'OPEN_PLAY',
      skillLevel: 'ALL_LEVELS',
      maxPlayers: 8,
      confirmedCount: 7,
      spotsRemaining: 1,
      occupancyPercent: 88,
      courtName: 'Court 1',
    },
    {
      id: 'demo-s2',
      title: 'Intermediate Drill Session',
      date: fmt(1),
      startTime: '10:30',
      endTime: '12:00',
      format: 'DRILL',
      skillLevel: 'INTERMEDIATE',
      maxPlayers: 8,
      confirmedCount: 6,
      spotsRemaining: 2,
      occupancyPercent: 75,
      courtName: 'Court 2',
    },
    {
      id: 'demo-s3',
      title: 'Afternoon Social Doubles',
      date: fmt(1),
      startTime: '14:00',
      endTime: '16:00',
      format: 'SOCIAL',
      skillLevel: 'ALL_LEVELS',
      maxPlayers: 8,
      confirmedCount: 5,
      spotsRemaining: 3,
      occupancyPercent: 63,
      courtName: 'Court 3',
    },
    {
      id: 'demo-s4',
      title: 'Evening League Play',
      date: fmt(1),
      startTime: '18:00',
      endTime: '20:00',
      format: 'LEAGUE_PLAY',
      skillLevel: 'ADVANCED',
      maxPlayers: 8,
      confirmedCount: 8,
      spotsRemaining: 0,
      occupancyPercent: 100,
      courtName: 'Court 1',
    },
    {
      id: 'demo-s5',
      title: 'Beginner Clinic',
      date: fmt(2),
      startTime: '09:00',
      endTime: '11:00',
      format: 'CLINIC',
      skillLevel: 'BEGINNER',
      maxPlayers: 12,
      confirmedCount: 4,
      spotsRemaining: 8,
      occupancyPercent: 33,
      courtName: 'Court 4',
    },
    {
      id: 'demo-s6',
      title: 'Open Play — All Levels',
      date: fmt(2),
      startTime: '12:00',
      endTime: '14:00',
      format: 'OPEN_PLAY',
      skillLevel: 'ALL_LEVELS',
      maxPlayers: 8,
      confirmedCount: 3,
      spotsRemaining: 5,
      occupancyPercent: 38,
      courtName: 'Court 2',
    },
    {
      id: 'demo-s7',
      title: 'Advanced Drill',
      date: fmt(3),
      startTime: '07:00',
      endTime: '09:00',
      format: 'DRILL',
      skillLevel: 'ADVANCED',
      maxPlayers: 6,
      confirmedCount: 5,
      spotsRemaining: 1,
      occupancyPercent: 83,
      courtName: 'Court 1',
    },
    {
      id: 'demo-s8',
      title: 'Social Mixer',
      date: fmt(3),
      startTime: '17:00',
      endTime: '19:00',
      format: 'SOCIAL',
      skillLevel: 'ALL_LEVELS',
      maxPlayers: 16,
      confirmedCount: 9,
      spotsRemaining: 7,
      occupancyPercent: 56,
      courtName: 'Courts 3 & 4',
    },
  ],
  underfilledSessions: [] as any[],
}

// Populate underfilled from sessions < 50%
mockDashboard.underfilledSessions = mockDashboard.upcomingSessions.filter(
  (s) => s.occupancyPercent < 50
)

// ── Slot Filler Recommendations ──
export function mockSlotFillerRecommendations(sessionId: string) {
  const session = mockDashboard.upcomingSessions.find((s) => s.id === sessionId) ||
    mockDashboard.underfilledSessions[0] ||
    mockDashboard.upcomingSessions[0]

  return {
    session,
    totalCandidatesScored: 42,
    recommendations: [
      {
        member: { id: 'u1', name: 'Sarah Chen', email: 'sarah@demo.com', duprRatingDoubles: 4.2, gender: 'F' },
        score: 92,
        estimatedLikelihood: 'high',
        reasoning: {
          summary: 'Perfect schedule fit — Sarah plays every Tuesday morning and prefers this format. Skill level matches well.',
          components: {
            schedule_fit: { score: 95, weight: 0.3 },
            skill_match: { score: 88, weight: 0.25 },
            format_preference: { score: 90, weight: 0.15 },
            recency: { score: 85, weight: 0.15 },
            frequency_gap: { score: 78, weight: 0.1 },
            responsiveness: { score: 92, weight: 0.05 },
          },
        },
      },
      {
        member: { id: 'u2', name: 'Mike Rodriguez', email: 'mike@demo.com', duprRatingDoubles: 3.8, gender: 'M' },
        score: 85,
        estimatedLikelihood: 'high',
        reasoning: {
          summary: 'Strong skill match and hasn\'t played in 5 days — likely looking for a game. High response rate to past invites.',
          components: {
            schedule_fit: { score: 72, weight: 0.3 },
            skill_match: { score: 92, weight: 0.25 },
            format_preference: { score: 85, weight: 0.15 },
            recency: { score: 95, weight: 0.15 },
            frequency_gap: { score: 88, weight: 0.1 },
            responsiveness: { score: 90, weight: 0.05 },
          },
        },
      },
      {
        member: { id: 'u3', name: 'Emily Park', email: 'emily@demo.com', duprRatingDoubles: 4.0, gender: 'F' },
        score: 78,
        estimatedLikelihood: 'medium',
        reasoning: {
          summary: 'Good skill match. Usually plays afternoons but has joined morning sessions twice recently.',
          components: {
            schedule_fit: { score: 55, weight: 0.3 },
            skill_match: { score: 90, weight: 0.25 },
            format_preference: { score: 82, weight: 0.15 },
            recency: { score: 70, weight: 0.15 },
            frequency_gap: { score: 92, weight: 0.1 },
            responsiveness: { score: 85, weight: 0.05 },
          },
        },
      },
      {
        member: { id: 'u4', name: 'James Wilson', email: 'james@demo.com', duprRatingDoubles: 3.5, gender: 'M' },
        score: 71,
        estimatedLikelihood: 'medium',
        reasoning: {
          summary: 'Slightly below session skill level but improving fast (+0.3 in last month). Plays regularly.',
          components: {
            schedule_fit: { score: 80, weight: 0.3 },
            skill_match: { score: 58, weight: 0.25 },
            format_preference: { score: 75, weight: 0.15 },
            recency: { score: 60, weight: 0.15 },
            frequency_gap: { score: 70, weight: 0.1 },
            responsiveness: { score: 65, weight: 0.05 },
          },
        },
      },
      {
        member: { id: 'u5', name: 'Lisa Thompson', email: 'lisa@demo.com', duprRatingDoubles: 4.5, gender: 'F' },
        score: 65,
        estimatedLikelihood: 'medium',
        reasoning: {
          summary: 'Strong player but rarely responds to invites. Schedule fit is moderate — prefers weekends.',
          components: {
            schedule_fit: { score: 45, weight: 0.3 },
            skill_match: { score: 95, weight: 0.25 },
            format_preference: { score: 70, weight: 0.15 },
            recency: { score: 55, weight: 0.15 },
            frequency_gap: { score: 80, weight: 0.1 },
            responsiveness: { score: 30, weight: 0.05 },
          },
        },
      },
      {
        member: { id: 'u6', name: 'David Kim', email: 'david@demo.com', duprRatingDoubles: 3.9, gender: 'M' },
        score: 58,
        estimatedLikelihood: 'low',
        reasoning: {
          summary: 'Hasn\'t played in 12 days. Good skill match but low recent engagement. Worth a try.',
          components: {
            schedule_fit: { score: 60, weight: 0.3 },
            skill_match: { score: 85, weight: 0.25 },
            format_preference: { score: 40, weight: 0.15 },
            recency: { score: 35, weight: 0.15 },
            frequency_gap: { score: 50, weight: 0.1 },
            responsiveness: { score: 45, weight: 0.05 },
          },
        },
      },
    ],
  }
}

// ── Reactivation Candidates ──
export function mockReactivationCandidates(inactivityDays: number) {
  const allCandidates = [
    {
      member: { id: 'r1', name: 'Tom Bradley', email: 'tom@demo.com', duprRatingDoubles: 3.6, gender: 'M' },
      daysSinceLastActivity: 47,
      totalHistoricalBookings: 23,
      score: 88,
      reasoning: {
        summary: 'Long-time member with high historical engagement. Sudden drop-off after 23 sessions — likely recoverable.',
        components: {
          reactivation_potential: { score: 95, weight: 0.3 },
          inactivity_window: { score: 80, weight: 0.25 },
          session_availability: { score: 85, weight: 0.25 },
          profile_completeness: { score: 90, weight: 0.1 },
          reliability: { score: 88, weight: 0.1 },
        },
      },
      suggestedSessions: [
        { id: 'demo-s3', title: 'Afternoon Social Doubles' },
        { id: 'demo-s8', title: 'Social Mixer' },
      ],
    },
    {
      member: { id: 'r2', name: 'Karen Lewis', email: 'karen@demo.com', duprRatingDoubles: 4.1, gender: 'F' },
      daysSinceLastActivity: 35,
      totalHistoricalBookings: 15,
      score: 76,
      reasoning: {
        summary: 'Regular intermediate player. Stopped attending after format change. Prefers drill sessions.',
        components: {
          reactivation_potential: { score: 80, weight: 0.3 },
          inactivity_window: { score: 70, weight: 0.25 },
          session_availability: { score: 75, weight: 0.25 },
          profile_completeness: { score: 85, weight: 0.1 },
          reliability: { score: 72, weight: 0.1 },
        },
      },
      suggestedSessions: [
        { id: 'demo-s2', title: 'Intermediate Drill Session' },
      ],
    },
    {
      member: { id: 'r3', name: 'Alex Nguyen', email: 'alex@demo.com', duprRatingDoubles: 3.3, gender: 'M' },
      daysSinceLastActivity: 28,
      totalHistoricalBookings: 8,
      score: 64,
      reasoning: {
        summary: 'Newer member still building a habit. Attended beginner clinics initially. Has potential if re-engaged.',
        components: {
          reactivation_potential: { score: 65, weight: 0.3 },
          inactivity_window: { score: 60, weight: 0.25 },
          session_availability: { score: 70, weight: 0.25 },
          profile_completeness: { score: 55, weight: 0.1 },
          reliability: { score: 60, weight: 0.1 },
        },
      },
      suggestedSessions: [
        { id: 'demo-s5', title: 'Beginner Clinic' },
        { id: 'demo-s6', title: 'Open Play — All Levels' },
      ],
    },
    {
      member: { id: 'r4', name: 'Rachel Green', email: 'rachel@demo.com', duprRatingDoubles: 3.7, gender: 'F' },
      daysSinceLastActivity: 22,
      totalHistoricalBookings: 11,
      score: 59,
      reasoning: {
        summary: 'Moderate engagement history. Schedule conflict with new work hours likely. Evening sessions could work.',
        components: {
          reactivation_potential: { score: 55, weight: 0.3 },
          inactivity_window: { score: 55, weight: 0.25 },
          session_availability: { score: 65, weight: 0.25 },
          profile_completeness: { score: 70, weight: 0.1 },
          reliability: { score: 58, weight: 0.1 },
        },
      },
      suggestedSessions: [
        { id: 'demo-s4', title: 'Evening League Play' },
        { id: 'demo-s8', title: 'Social Mixer' },
      ],
    },
    {
      member: { id: 'r5', name: 'Chris Martinez', email: 'chris@demo.com', duprRatingDoubles: 4.3, gender: 'M' },
      daysSinceLastActivity: 16,
      totalHistoricalBookings: 31,
      score: 52,
      reasoning: {
        summary: 'Power user with 31 past bookings — short break may be intentional (vacation?). Monitor before outreach.',
        components: {
          reactivation_potential: { score: 45, weight: 0.3 },
          inactivity_window: { score: 50, weight: 0.25 },
          session_availability: { score: 55, weight: 0.25 },
          profile_completeness: { score: 95, weight: 0.1 },
          reliability: { score: 92, weight: 0.1 },
        },
      },
      suggestedSessions: [
        { id: 'demo-s7', title: 'Advanced Drill' },
      ],
    },
  ]

  const filtered = allCandidates.filter((c) => c.daysSinceLastActivity >= inactivityDays)

  return {
    candidates: filtered,
    totalInactiveMembers: filtered.length,
    totalClubMembers: 127,
    inactivityThresholdDays: inactivityDays,
    clubName: 'Sunset Racquet Club',
  }
}

// ── Dashboard V2 ──
import type { DashboardV2Data } from '@/types/intelligence'

export const mockDashboardV2: DashboardV2Data = {
  metrics: {
    members: {
      label: 'Members',
      value: 127,
      trend: { value: 127, previousValue: 113, changePercent: 12.4, direction: 'up', sparkline: [113, 115, 117, 119, 121, 124, 127] },
      subtitle: '8 new this month',
    },
    occupancy: {
      label: 'Avg Occupancy',
      value: '62%',
      trend: { value: 62, previousValue: 65, changePercent: -4.6, direction: 'down', sparkline: [58, 64, 55, 70, 62, 68, 60] },
      subtitle: '42 sessions (30d)',
    },
    lostRevenue: {
      label: 'Est. Lost Revenue',
      value: '$1,260',
      trend: { value: 1260, previousValue: 1420, changePercent: -11.3, direction: 'down', sparkline: [220, 180, 200, 150, 190, 170, 150] },
      subtitle: '84 empty slots',
    },
    bookings: {
      label: 'Bookings',
      value: 284,
      trend: { value: 284, previousValue: 247, changePercent: 15.0, direction: 'up', sparkline: [35, 42, 38, 45, 40, 44, 40] },
      subtitle: 'last 30 days',
    },
  },
  occupancy: {
    byDay: [
      { day: 'Mon', avgOccupancy: 55, sessionCount: 6 },
      { day: 'Tue', avgOccupancy: 68, sessionCount: 7 },
      { day: 'Wed', avgOccupancy: 52, sessionCount: 5 },
      { day: 'Thu', avgOccupancy: 71, sessionCount: 7 },
      { day: 'Fri', avgOccupancy: 48, sessionCount: 4 },
      { day: 'Sat', avgOccupancy: 82, sessionCount: 8 },
      { day: 'Sun', avgOccupancy: 75, sessionCount: 5 },
    ],
    byTimeSlot: [
      { slot: 'morning', avgOccupancy: 58, sessionCount: 14 },
      { slot: 'afternoon', avgOccupancy: 61, sessionCount: 12 },
      { slot: 'evening', avgOccupancy: 78, sessionCount: 16 },
    ],
    byFormat: [
      { format: 'OPEN_PLAY', avgOccupancy: 65, sessionCount: 12 },
      { format: 'LEAGUE_PLAY', avgOccupancy: 88, sessionCount: 8 },
      { format: 'SOCIAL', avgOccupancy: 72, sessionCount: 8 },
      { format: 'DRILL', avgOccupancy: 55, sessionCount: 7 },
      { format: 'CLINIC', avgOccupancy: 42, sessionCount: 7 },
    ],
  },
  sessions: {
    topSessions: [
      { id: 't1', title: 'Evening League Play', date: fmt(-2), startTime: '18:00', endTime: '20:00', format: 'LEAGUE_PLAY', courtName: 'Court 1', occupancyPercent: 100, confirmedCount: 8, maxPlayers: 8 },
      { id: 't2', title: 'Saturday Social Mixer', date: fmt(-4), startTime: '17:00', endTime: '19:00', format: 'SOCIAL', courtName: 'Courts 3 & 4', occupancyPercent: 94, confirmedCount: 15, maxPlayers: 16 },
      { id: 't3', title: 'Morning Open Play', date: fmt(-1), startTime: '08:00', endTime: '10:00', format: 'OPEN_PLAY', courtName: 'Court 1', occupancyPercent: 88, confirmedCount: 7, maxPlayers: 8 },
      { id: 't4', title: 'Advanced Drill', date: fmt(-3), startTime: '07:00', endTime: '09:00', format: 'DRILL', courtName: 'Court 2', occupancyPercent: 83, confirmedCount: 5, maxPlayers: 6 },
      { id: 't5', title: 'Thursday League Night', date: fmt(-5), startTime: '19:00', endTime: '21:00', format: 'LEAGUE_PLAY', courtName: 'Court 1', occupancyPercent: 75, confirmedCount: 6, maxPlayers: 8 },
    ],
    problematicSessions: [
      { id: 'p1', title: 'Beginner Clinic', date: fmt(-3), startTime: '09:00', endTime: '11:00', format: 'CLINIC', courtName: 'Court 4', occupancyPercent: 25, confirmedCount: 3, maxPlayers: 12 },
      { id: 'p2', title: 'Wednesday Open Play', date: fmt(-5), startTime: '12:00', endTime: '14:00', format: 'OPEN_PLAY', courtName: 'Court 2', occupancyPercent: 25, confirmedCount: 2, maxPlayers: 8 },
      { id: 'p3', title: 'Friday Morning Drill', date: fmt(-2), startTime: '08:00', endTime: '10:00', format: 'DRILL', courtName: 'Court 3', occupancyPercent: 33, confirmedCount: 2, maxPlayers: 6 },
      { id: 'p4', title: 'Monday Clinic', date: fmt(-6), startTime: '10:00', endTime: '12:00', format: 'CLINIC', courtName: 'Court 4', occupancyPercent: 33, confirmedCount: 4, maxPlayers: 12 },
      { id: 'p5', title: 'Afternoon Open Play', date: fmt(-4), startTime: '14:00', endTime: '16:00', format: 'OPEN_PLAY', courtName: 'Court 2', occupancyPercent: 38, confirmedCount: 3, maxPlayers: 8 },
    ],
  },
  players: {
    bySkillLevel: [
      { label: 'Beginner', count: 22, percent: 17 },
      { label: 'Intermediate', count: 58, percent: 46 },
      { label: 'Advanced', count: 31, percent: 24 },
      { label: 'Unrated', count: 16, percent: 13 },
    ],
    byFormat: [
      { label: 'Open Play', count: 98, percent: 35 },
      { label: 'League', count: 72, percent: 25 },
      { label: 'Social', count: 56, percent: 20 },
      { label: 'Drill', count: 34, percent: 12 },
      { label: 'Clinic', count: 24, percent: 8 },
    ],
    activeCount: 89,
    inactiveCount: 38,
    newThisMonth: 8,
  },
}

// ── Sessions for Revenue page ──
export const mockSessions = [
  // Morning sessions
  { id: 'rs1', date: fmt(-5), startTime: '07:00', endTime: '09:00', format: 'OPEN_PLAY', maxPlayers: 8, status: 'COMPLETED', _count: { bookings: 6 } },
  { id: 'rs2', date: fmt(-4), startTime: '08:00', endTime: '10:00', format: 'DRILL', maxPlayers: 6, status: 'COMPLETED', _count: { bookings: 5 } },
  { id: 'rs3', date: fmt(-3), startTime: '09:00', endTime: '11:00', format: 'CLINIC', maxPlayers: 12, status: 'COMPLETED', _count: { bookings: 4 } },
  { id: 'rs4', date: fmt(-2), startTime: '07:30', endTime: '09:30', format: 'OPEN_PLAY', maxPlayers: 8, status: 'COMPLETED', _count: { bookings: 7 } },
  { id: 'rs5', date: fmt(-1), startTime: '08:00', endTime: '10:00', format: 'DRILL', maxPlayers: 6, status: 'COMPLETED', _count: { bookings: 3 } },
  // Afternoon sessions
  { id: 'rs6', date: fmt(-5), startTime: '13:00', endTime: '15:00', format: 'SOCIAL', maxPlayers: 8, status: 'COMPLETED', _count: { bookings: 5 } },
  { id: 'rs7', date: fmt(-4), startTime: '14:00', endTime: '16:00', format: 'OPEN_PLAY', maxPlayers: 8, status: 'COMPLETED', _count: { bookings: 4 } },
  { id: 'rs8', date: fmt(-3), startTime: '12:00', endTime: '14:00', format: 'LEAGUE_PLAY', maxPlayers: 8, status: 'COMPLETED', _count: { bookings: 8 } },
  { id: 'rs9', date: fmt(-1), startTime: '14:00', endTime: '16:00', format: 'SOCIAL', maxPlayers: 16, status: 'COMPLETED', _count: { bookings: 7 } },
  // Evening sessions (most popular)
  { id: 'rs10', date: fmt(-5), startTime: '18:00', endTime: '20:00', format: 'LEAGUE_PLAY', maxPlayers: 8, status: 'COMPLETED', _count: { bookings: 8 } },
  { id: 'rs11', date: fmt(-4), startTime: '17:00', endTime: '19:00', format: 'OPEN_PLAY', maxPlayers: 8, status: 'COMPLETED', _count: { bookings: 7 } },
  { id: 'rs12', date: fmt(-3), startTime: '18:00', endTime: '20:00', format: 'SOCIAL', maxPlayers: 16, status: 'COMPLETED', _count: { bookings: 14 } },
  { id: 'rs13', date: fmt(-2), startTime: '19:00', endTime: '21:00', format: 'LEAGUE_PLAY', maxPlayers: 8, status: 'COMPLETED', _count: { bookings: 8 } },
  { id: 'rs14', date: fmt(-1), startTime: '18:00', endTime: '20:00', format: 'DRILL', maxPlayers: 6, status: 'COMPLETED', _count: { bookings: 6 } },
  // Upcoming
  ...mockDashboard.upcomingSessions.map((s) => ({
    id: s.id,
    date: s.date,
    startTime: s.startTime,
    endTime: s.endTime,
    format: s.format,
    maxPlayers: s.maxPlayers,
    status: 'SCHEDULED',
    _count: { bookings: s.confirmedCount },
  })),
]

// ── Event Recommendations (mock) ──

import type { EventRecommendationsResult } from '@/types/intelligence'

export function mockEventRecommendations(): EventRecommendationsResult {
  return {
    events: [
      {
        id: 'rr-advanced',
        type: 'Round Robin',
        title: 'Advanced Round Robin Showdown',
        emoji: '🏆',
        urgency: 'high',
        reason: 'Detected 14 players rated DUPR 4.0+ who rarely play each other. High engagement potential.',
        suggestedDate: 'Saturday, Mar 14',
        suggestedTime: '4:00 PM – 7:00 PM',
        courts: 4,
        format: 'Round Robin (pools of 4 → single elimination)',
        skillRange: '4.0 – 5.0 DUPR',
        suggestedPrice: 25,
        maxPlayers: 16,
        matchedPlayers: [
          { name: 'Carlos Mendez', dupr: 4.5, emoji: '🔥', lastPlayed: '2 days ago', tournaments: 12 },
          { name: 'Tom Wilson', dupr: 4.8, emoji: '⭐', lastPlayed: '3 days ago', tournaments: 18 },
          { name: 'Jake Martinez', dupr: 4.6, emoji: '🔥', lastPlayed: '1 day ago', tournaments: 15 },
          { name: 'David Park', dupr: 4.1, emoji: '📈', lastPlayed: '5 days ago', tournaments: 8 },
          { name: 'Sarah Kim', dupr: 4.2, emoji: '📈', lastPlayed: '4 days ago', tournaments: 10 },
          { name: 'Lisa Park', dupr: 4.0, emoji: '📈', lastPlayed: '6 days ago', tournaments: 6 },
          { name: 'Alex Rivera', dupr: 4.3, emoji: '🔥', lastPlayed: '2 days ago', tournaments: 11 },
          { name: 'Jennifer Wu', dupr: 4.1, emoji: '📈', lastPlayed: '3 days ago', tournaments: 7 },
          { name: 'Ryan Torres', dupr: 4.4, emoji: '🔥', lastPlayed: '1 day ago', tournaments: 14 },
          { name: 'Emily Zhang', dupr: 4.0, emoji: '📈', lastPlayed: '5 days ago', tournaments: 5 },
          { name: 'Chris Lee', dupr: 4.7, emoji: '⭐', lastPlayed: '2 days ago', tournaments: 16 },
          { name: 'Nicole Adams', dupr: 4.2, emoji: '📈', lastPlayed: '4 days ago', tournaments: 9 },
          { name: 'Brandon Kim', dupr: 4.3, emoji: '🔥', lastPlayed: '3 days ago', tournaments: 13 },
          { name: 'Sophia Chen', dupr: 4.1, emoji: '📈', lastPlayed: '6 days ago', tournaments: 7 },
        ],
        projectedRevenue: 400,
        courtCost: 80,
        netRevenue: 320,
        fillConfidence: 92,
        insights: [
          '14 of 16 spots auto-filled from member base — only 2 open slots needed',
          'Saturday 4PM has 0% court utilization currently — pure incremental revenue',
          'Average tournament player visits club 2x more the following week',
          'Similar events had 95% return rate for participants',
        ],
      },
      {
        id: 'beginner-social',
        type: 'Social Mixer',
        title: 'New Player Welcome Mixer',
        emoji: '🎉',
        urgency: 'medium',
        reason: '8 new members (joined in last 30 days) haven\'t attended any events yet. Social event lowers the barrier.',
        suggestedDate: 'Sunday, Mar 15',
        suggestedTime: '10:00 AM – 12:00 PM',
        courts: 2,
        format: 'Rotating Partners (King of the Court)',
        skillRange: '2.0 – 3.0 DUPR',
        suggestedPrice: 10,
        maxPlayers: 12,
        matchedPlayers: [
          { name: 'New Player 1', dupr: 2.5, emoji: '🆕', lastPlayed: 'never at events', tournaments: 0 },
          { name: 'New Player 2', dupr: 2.8, emoji: '🆕', lastPlayed: 'never at events', tournaments: 0 },
          { name: 'New Player 3', dupr: 2.3, emoji: '🆕', lastPlayed: 'never at events', tournaments: 0 },
          { name: 'Maria Garcia', dupr: 2.8, emoji: '🤝', lastPlayed: '12 days ago', tournaments: 2 },
          { name: 'Bob Jones', dupr: 2.5, emoji: '🤝', lastPlayed: '8 days ago', tournaments: 1 },
          { name: 'Steve Brown', dupr: 2.6, emoji: '🤝', lastPlayed: '10 days ago', tournaments: 3 },
          { name: 'New Player 4', dupr: 2.6, emoji: '🆕', lastPlayed: 'never at events', tournaments: 0 },
          { name: 'New Player 5', dupr: 2.7, emoji: '🆕', lastPlayed: 'never at events', tournaments: 0 },
        ],
        projectedRevenue: 120,
        courtCost: 40,
        netRevenue: 80,
        fillConfidence: 75,
        insights: [
          'New member retention jumps 40% after first social event',
          'Mixing new + existing social players creates natural mentoring',
          'Low price point ($10) removes cost barrier for first-timers',
          'Sunday morning has 25% court utilization — underused slot',
        ],
      },
      {
        id: 'doubles-league',
        type: 'Mini League',
        title: 'Wednesday Night Doubles League',
        emoji: '⚡',
        urgency: 'high',
        reason: '12 intermediate players book Wednesday evenings regularly but without structure. A league would lock in 6-week commitment.',
        suggestedDate: 'Starting Wed, Mar 18 (6 weeks)',
        suggestedTime: '6:30 PM – 8:30 PM',
        courts: 3,
        format: 'Fixed Doubles Teams, Round Robin (6 weeks)',
        skillRange: '3.0 – 3.8 DUPR',
        suggestedPrice: 35,
        maxPlayers: 12,
        matchedPlayers: [
          { name: 'Alex Rivera', dupr: 3.8, emoji: '🎯', lastPlayed: '2 days ago', tournaments: 11 },
          { name: 'Mike Thompson', dupr: 3.5, emoji: '🎯', lastPlayed: '4 days ago', tournaments: 5 },
          { name: 'Jennifer Wu', dupr: 3.6, emoji: '🎯', lastPlayed: '3 days ago', tournaments: 7 },
          { name: 'Emily Zhang', dupr: 3.4, emoji: '🎯', lastPlayed: '5 days ago', tournaments: 5 },
          { name: 'Jason Lee', dupr: 3.7, emoji: '🎯', lastPlayed: '2 days ago', tournaments: 8 },
          { name: 'Amanda Cruz', dupr: 3.9, emoji: '🎯', lastPlayed: '4 days ago', tournaments: 6 },
          { name: 'Kevin Park', dupr: 3.3, emoji: '🎯', lastPlayed: '3 days ago', tournaments: 4 },
          { name: 'Rachel Kim', dupr: 3.5, emoji: '🎯', lastPlayed: '5 days ago', tournaments: 7 },
          { name: 'Brian Johnson', dupr: 3.6, emoji: '🎯', lastPlayed: '1 day ago', tournaments: 9 },
          { name: 'Tina Chen', dupr: 3.2, emoji: '🎯', lastPlayed: '6 days ago', tournaments: 3 },
          { name: 'Mark Davis', dupr: 3.7, emoji: '🎯', lastPlayed: '2 days ago', tournaments: 10 },
          { name: 'Sara Wilson', dupr: 3.4, emoji: '🎯', lastPlayed: '4 days ago', tournaments: 6 },
        ],
        projectedRevenue: 2520,
        courtCost: 480,
        netRevenue: 2040,
        fillConfidence: 88,
        insights: [
          '6-week commitment = $35/week × 6 = $210/player guaranteed revenue',
          'Total projected: $2,520 over 6 weeks from 12 players',
          'Wednesday evening utilization jumps from 45% to 90%',
          'League players show 3x higher retention vs casual bookers',
        ],
      },
    ],
    totalPlayersAnalyzed: 127,
    totalSessionsAnalyzed: 42,
    generatedAt: new Date().toISOString(),
  }
}
