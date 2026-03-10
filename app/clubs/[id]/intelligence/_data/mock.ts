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
  // Search in V1 sessions first, then V2 sessions
  const v2Sessions = [...mockDashboardV2.sessions.problematicSessions, ...mockDashboardV2.sessions.topSessions]
  const session = mockDashboard.upcomingSessions.find((s) => s.id === sessionId) ||
    v2Sessions.find((s) => s.id === sessionId) ||
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
      archetype: 'lapsed_regular' as const,
      preference: { id: 'p1', userId: 'r1', clubId: 'demo', preferredDays: ['Wednesday', 'Saturday'] as any, preferredTimeSlots: { morning: false, afternoon: true, evening: false }, skillLevel: 'INTERMEDIATE' as any, preferredFormats: ['OPEN_PLAY'] as any, targetSessionsPerWeek: 2, isActive: true },
      bookingHistory: { totalBookings: 23, bookingsLastWeek: 0, bookingsLastMonth: 0, daysSinceLastConfirmedBooking: 47, cancelledCount: 1, noShowCount: 0, inviteAcceptanceRate: 0.9 },
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
      lastContactedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      lastContactChannel: 'email' as const,
      lastContactStatus: 'sent' as const,
    },
    {
      member: { id: 'r2', name: 'Karen Lewis', email: 'karen@demo.com', duprRatingDoubles: 4.1, gender: 'F' },
      daysSinceLastActivity: 35,
      totalHistoricalBookings: 15,
      score: 76,
      archetype: 'competitor' as const,
      preference: { id: 'p2', userId: 'r2', clubId: 'demo', preferredDays: ['Tuesday', 'Thursday'] as any, preferredTimeSlots: { morning: true, afternoon: false, evening: false }, skillLevel: 'ADVANCED' as any, preferredFormats: ['DRILL'] as any, targetSessionsPerWeek: 3, isActive: true },
      bookingHistory: { totalBookings: 15, bookingsLastWeek: 0, bookingsLastMonth: 0, daysSinceLastConfirmedBooking: 35, cancelledCount: 0, noShowCount: 1, inviteAcceptanceRate: 0.85 },
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
      lastContactedAt: new Date(Date.now() - 10 * 86400000).toISOString(),
      lastContactChannel: 'sms' as const,
      lastContactStatus: 'sent' as const,
    },
    {
      member: { id: 'r3', name: 'Alex Nguyen', email: 'alex@demo.com', duprRatingDoubles: 3.3, gender: 'M' },
      daysSinceLastActivity: 28,
      totalHistoricalBookings: 3,
      score: 64,
      archetype: 'ghost_newbie' as const,
      preference: null,
      bookingHistory: { totalBookings: 3, bookingsLastWeek: 0, bookingsLastMonth: 0, daysSinceLastConfirmedBooking: 28, cancelledCount: 0, noShowCount: 0, inviteAcceptanceRate: 1.0 },
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
      archetype: 'social_butterfly' as const,
      preference: { id: 'p4', userId: 'r4', clubId: 'demo', preferredDays: ['Friday', 'Saturday'] as any, preferredTimeSlots: { morning: false, afternoon: false, evening: true }, skillLevel: 'INTERMEDIATE' as any, preferredFormats: ['SOCIAL'] as any, targetSessionsPerWeek: 1, isActive: true },
      bookingHistory: { totalBookings: 11, bookingsLastWeek: 0, bookingsLastMonth: 0, daysSinceLastConfirmedBooking: 22, cancelledCount: 2, noShowCount: 0, inviteAcceptanceRate: 0.75 },
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
      archetype: 'competitor' as const,
      preference: { id: 'p5', userId: 'r5', clubId: 'demo', preferredDays: ['Monday', 'Wednesday', 'Friday'] as any, preferredTimeSlots: { morning: false, afternoon: false, evening: true }, skillLevel: 'ADVANCED' as any, preferredFormats: ['DRILL', 'LEAGUE_PLAY'] as any, targetSessionsPerWeek: 3, isActive: true },
      bookingHistory: { totalBookings: 31, bookingsLastWeek: 0, bookingsLastMonth: 0, daysSinceLastConfirmedBooking: 16, cancelledCount: 0, noShowCount: 0, inviteAcceptanceRate: 0.95 },
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
      description: 'Total active members following your club',
    },
    occupancy: {
      label: 'Avg Occupancy',
      value: '62%',
      trend: { value: 62, previousValue: 65, changePercent: -4.6, direction: 'down', sparkline: [58, 64, 55, 70, 62, 68, 60] },
      subtitle: '42 sessions (30d)',
      description: 'Average % of filled spots across all sessions',
    },
    lostRevenue: {
      label: 'Est. Lost Revenue',
      value: '$1,260',
      trend: { value: 1260, previousValue: 1420, changePercent: -11.3, direction: 'down', sparkline: [220, 180, 200, 150, 190, 170, 150] },
      subtitle: '84 empty slots',
      description: 'Revenue lost from unfilled spots based on pricing',
    },
    bookings: {
      label: 'Bookings',
      value: 284,
      trend: { value: 284, previousValue: 247, changePercent: 15.0, direction: 'up', sparkline: [35, 42, 38, 45, 40, 44, 40] },
      subtitle: 'last 30 days',
      description: 'Total confirmed bookings across all sessions',
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
        reason: 'Detected 14 advanced players (DUPR 4.0–5.0) with tight skill spread. Competitive format drives high engagement.',
        suggestedDate: 'Saturday, Mar 14',
        suggestedTime: '4:00 PM – 7:00 PM',
        courts: 4,
        format: 'Round Robin (pools of 4 → single elimination)',
        skillRange: '4.0 – 5.0 DUPR',
        suggestedPrice: 25,
        maxPlayers: 16,
        durationHours: 3,
        matchedPlayers: [
          { id: 'demo-u01', name: 'Carlos Mendez', dupr: 4.5, emoji: '🔥', lastPlayed: '2 days ago', tournaments: 12 },
          { id: 'demo-u02', name: 'Tom Wilson', dupr: 4.8, emoji: '⭐', lastPlayed: '3 days ago', tournaments: 18 },
          { id: 'demo-u03', name: 'Jake Martinez', dupr: 4.6, emoji: '🔥', lastPlayed: '1 day ago', tournaments: 15 },
          { id: 'demo-u04', name: 'David Park', dupr: 4.1, emoji: '📈', lastPlayed: '5 days ago', tournaments: 8 },
          { id: 'demo-u05', name: 'Sarah Kim', dupr: 4.2, emoji: '📈', lastPlayed: '4 days ago', tournaments: 10 },
          { id: 'demo-u06', name: 'Lisa Park', dupr: 4.0, emoji: '📈', lastPlayed: '6 days ago', tournaments: 6 },
          { id: 'demo-u07', name: 'Alex Rivera', dupr: 4.3, emoji: '🔥', lastPlayed: '2 days ago', tournaments: 11 },
          { id: 'demo-u08', name: 'Jennifer Wu', dupr: 4.1, emoji: '📈', lastPlayed: '3 days ago', tournaments: 7 },
          { id: 'demo-u09', name: 'Ryan Torres', dupr: 4.4, emoji: '🔥', lastPlayed: '1 day ago', tournaments: 14 },
          { id: 'demo-u10', name: 'Emily Zhang', dupr: 4.0, emoji: '📈', lastPlayed: '5 days ago', tournaments: 5 },
          { id: 'demo-u11', name: 'Chris Lee', dupr: 4.7, emoji: '⭐', lastPlayed: '2 days ago', tournaments: 16 },
          { id: 'demo-u12', name: 'Nicole Adams', dupr: 4.2, emoji: '📈', lastPlayed: '4 days ago', tournaments: 9 },
          { id: 'demo-u13', name: 'Brandon Kim', dupr: 4.3, emoji: '🔥', lastPlayed: '3 days ago', tournaments: 13 },
          { id: 'demo-u14', name: 'Sophia Chen', dupr: 4.1, emoji: '📈', lastPlayed: '6 days ago', tournaments: 7 },
        ],
        projectedRevenue: 400,
        courtCost: 240,
        netRevenue: 160,
        fillConfidence: 92,
        insights: [
          '14 of 16 spots auto-filled from member base — only 2 open slots needed',
          'Saturday afternoon has 0% court utilization currently — pure incremental revenue',
          'Tournament players visit club 2x more the following week on average',
          'Similar events had 95% return rate for participants',
        ],
      },
      {
        id: 'beginner-openplay',
        type: 'Open Play',
        title: 'Beginner Open Play',
        emoji: '🎾',
        urgency: 'medium',
        reason: '12 beginner players available. Low-barrier drop-in format maximizes attendance.',
        suggestedDate: 'Sunday, Mar 15',
        suggestedTime: '10:00 AM – 12:00 PM',
        courts: 3,
        format: 'Open Play — drop-in, rotating partners',
        skillRange: '2.0 – 3.0 DUPR',
        suggestedPrice: 10,
        maxPlayers: 16,
        durationHours: 2,
        matchedPlayers: [
          { id: 'csv-np1', name: 'New Player 1', dupr: 2.5, emoji: '🆕', lastPlayed: 'never at events', tournaments: 0 },
          { id: 'csv-np2', name: 'New Player 2', dupr: 2.8, emoji: '🆕', lastPlayed: 'never at events', tournaments: 0 },
          { id: 'csv-np3', name: 'New Player 3', dupr: 2.3, emoji: '🆕', lastPlayed: 'never at events', tournaments: 0 },
          { id: 'demo-u15', name: 'Maria Garcia', dupr: 2.8, emoji: '🤝', lastPlayed: '12 days ago', tournaments: 2 },
          { id: 'demo-u16', name: 'Bob Jones', dupr: 2.5, emoji: '🤝', lastPlayed: '8 days ago', tournaments: 1 },
          { id: 'demo-u17', name: 'Steve Brown', dupr: 2.6, emoji: '🤝', lastPlayed: '10 days ago', tournaments: 3 },
          { id: 'csv-np4', name: 'New Player 4', dupr: 2.6, emoji: '🆕', lastPlayed: 'never at events', tournaments: 0 },
          { id: 'csv-np5', name: 'New Player 5', dupr: 2.7, emoji: '🆕', lastPlayed: 'never at events', tournaments: 0 },
        ],
        projectedRevenue: 160,
        courtCost: 120,
        netRevenue: 40,
        fillConfidence: 75,
        insights: [
          '8 of 16 spots auto-filled from member base — 8 open slots needed',
          'Sunday morning has 25% court utilization — underused slot',
          'Low-barrier drop-in format is perfect for re-engaging inactive members',
          '$10 price point removes cost barrier for first-timers',
        ],
      },
      {
        id: 'doubles-league',
        type: 'League',
        title: 'Wednesday Night Intermediate League',
        emoji: '⚡',
        urgency: 'high',
        reason: '12 intermediate regulars (DUPR 3.0–3.8) book Wednesday evenings. A 6-week league locks in commitment.',
        suggestedDate: 'Starting Wednesday, Mar 18 (6 weeks)',
        suggestedTime: '6:00 PM – 8:00 PM',
        courts: 3,
        format: 'Fixed Doubles Teams, Round Robin',
        skillRange: '3.0 – 3.8 DUPR',
        suggestedPrice: 35,
        maxPlayers: 12,
        durationHours: 2,
        leagueWeeks: 6,
        matchedPlayers: [
          { id: 'demo-u07', name: 'Alex Rivera', dupr: 3.8, emoji: '🎯', lastPlayed: '2 days ago', tournaments: 11 },
          { id: 'demo-u18', name: 'Mike Thompson', dupr: 3.5, emoji: '🎯', lastPlayed: '4 days ago', tournaments: 5 },
          { id: 'demo-u08', name: 'Jennifer Wu', dupr: 3.6, emoji: '🎯', lastPlayed: '3 days ago', tournaments: 7 },
          { id: 'demo-u10', name: 'Emily Zhang', dupr: 3.4, emoji: '🎯', lastPlayed: '5 days ago', tournaments: 5 },
          { id: 'demo-u19', name: 'Jason Lee', dupr: 3.7, emoji: '🎯', lastPlayed: '2 days ago', tournaments: 8 },
          { id: 'demo-u20', name: 'Amanda Cruz', dupr: 3.9, emoji: '🎯', lastPlayed: '4 days ago', tournaments: 6 },
          { id: 'demo-u21', name: 'Kevin Park', dupr: 3.3, emoji: '🎯', lastPlayed: '3 days ago', tournaments: 4 },
          { id: 'demo-u22', name: 'Rachel Kim', dupr: 3.5, emoji: '🎯', lastPlayed: '5 days ago', tournaments: 7 },
          { id: 'demo-u23', name: 'Brian Johnson', dupr: 3.6, emoji: '🎯', lastPlayed: '1 day ago', tournaments: 9 },
          { id: 'demo-u24', name: 'Tina Chen', dupr: 3.2, emoji: '🎯', lastPlayed: '6 days ago', tournaments: 3 },
          { id: 'demo-u25', name: 'Mark Davis', dupr: 3.7, emoji: '🎯', lastPlayed: '2 days ago', tournaments: 10 },
          { id: 'demo-u26', name: 'Sara Wilson', dupr: 3.4, emoji: '🎯', lastPlayed: '4 days ago', tournaments: 6 },
        ],
        projectedRevenue: 2520,
        courtCost: 720,
        netRevenue: 1800,
        fillConfidence: 88,
        insights: [
          '12 of 12 spots auto-filled from member base',
          '6-week commitment = $35/week × 6 = $210/player guaranteed revenue',
          'Total projected: $1,800 net over 6 weeks from 12 players',
          'League players show 3x higher retention vs casual bookers',
        ],
      },
      {
        id: 'int-ladder',
        type: 'Ladder',
        title: 'Intermediate Challenge Ladder',
        emoji: '🪜',
        urgency: 'medium',
        reason: '18 intermediate players (DUPR 3.0–4.0) can be ranked for ongoing challenge matches.',
        suggestedDate: 'Starting Monday, Mar 16 (ongoing)',
        suggestedTime: 'Ongoing',
        courts: 0,
        format: 'Ongoing Ranking Ladder — challenge matches',
        skillRange: '3.0 – 4.0 DUPR',
        suggestedPrice: 30,
        maxPlayers: 20,
        durationHours: 0,
        matchedPlayers: [
          { id: 'demo-u07', name: 'Alex Rivera', dupr: 3.8, emoji: '🔥', lastPlayed: '2 days ago', tournaments: 11 },
          { id: 'demo-u18', name: 'Mike Thompson', dupr: 3.5, emoji: '🎯', lastPlayed: '4 days ago', tournaments: 5 },
          { id: 'demo-u08', name: 'Jennifer Wu', dupr: 3.6, emoji: '🎯', lastPlayed: '3 days ago', tournaments: 7 },
          { id: 'demo-u19', name: 'Jason Lee', dupr: 3.7, emoji: '🔥', lastPlayed: '2 days ago', tournaments: 8 },
          { id: 'demo-u20', name: 'Amanda Cruz', dupr: 3.9, emoji: '⭐', lastPlayed: '4 days ago', tournaments: 6 },
          { id: 'demo-u21', name: 'Kevin Park', dupr: 3.3, emoji: '📈', lastPlayed: '3 days ago', tournaments: 4 },
          { id: 'demo-u22', name: 'Rachel Kim', dupr: 3.5, emoji: '🎯', lastPlayed: '5 days ago', tournaments: 7 },
          { id: 'demo-u23', name: 'Brian Johnson', dupr: 3.6, emoji: '🔥', lastPlayed: '1 day ago', tournaments: 9 },
        ],
        projectedRevenue: 600,
        courtCost: 0,
        netRevenue: 600,
        fillConfidence: 72,
        insights: [
          '8 of 20 spots auto-filled from member base — 12 open slots needed',
          'Ongoing ladder creates weekly engagement without fixed scheduling',
          '$30 registration fee × 20 players = $600 revenue',
          'Ladder players show 3x higher monthly visit frequency',
        ],
      },
      {
        id: 'beginner-clinic',
        type: 'Clinic',
        title: 'Tuesday Beginner Clinic',
        emoji: '📚',
        urgency: 'low',
        reason: '6 beginner players need structured coaching (DUPR 2.0–2.8). Tuesday morning has low utilization.',
        suggestedDate: 'Tuesday, Mar 17',
        suggestedTime: '9:00 AM – 10:30 AM',
        courts: 2,
        format: 'Coached Clinic — technique & strategy',
        skillRange: '2.0 – 2.8 DUPR',
        suggestedPrice: 25,
        maxPlayers: 8,
        durationHours: 1.5,
        matchedPlayers: [
          { id: 'csv-np1', name: 'New Player 1', dupr: 2.5, emoji: '🆕', lastPlayed: 'never at events', tournaments: 0 },
          { id: 'csv-np3', name: 'New Player 3', dupr: 2.3, emoji: '🆕', lastPlayed: 'never at events', tournaments: 0 },
          { id: 'demo-u15', name: 'Maria Garcia', dupr: 2.8, emoji: '🤝', lastPlayed: '12 days ago', tournaments: 2 },
          { id: 'demo-u16', name: 'Bob Jones', dupr: 2.5, emoji: '🤝', lastPlayed: '8 days ago', tournaments: 1 },
          { id: 'csv-np4', name: 'New Player 4', dupr: 2.6, emoji: '🆕', lastPlayed: 'never at events', tournaments: 0 },
          { id: 'csv-np2', name: 'New Player 2', dupr: 2.8, emoji: '🆕', lastPlayed: 'never at events', tournaments: 0 },
        ],
        projectedRevenue: 200,
        courtCost: 60,
        netRevenue: 140,
        fillConfidence: 65,
        insights: [
          '6 of 8 spots auto-filled from member base — 2 open slots needed',
          'Tuesday morning has no scheduled sessions — pure incremental revenue',
          'Coached sessions create habit loops — 60% rebook within 2 weeks',
          'Clinic attendees upgrade membership tier 2x more often',
        ],
      },
    ],
    totalPlayersAnalyzed: 127,
    totalSessionsAnalyzed: 42,
    generatedAt: new Date().toISOString(),
  }
}

// ── Sessions Calendar ──
const fmtDate = (daysFromNow: number) => {
  const d = new Date(today)
  d.setDate(d.getDate() + daysFromNow)
  return d.toISOString().slice(0, 10)
}

export function mockSessionsCalendar(): import('@/types/intelligence').SessionCalendarData {
  const sessions: import('@/types/intelligence').SessionCalendarItem[] = [
    // Past sessions (last 2 weeks)
    { id: 'cal-1', date: fmtDate(-13), startTime: '08:00', endTime: '10:00', court: 'Court 1', format: 'Open Play', skillLevel: 'All Levels', registered: 7, capacity: 8, occupancy: 88, playerNames: ['Alice', 'Bob', 'Carlos', 'Diana', 'Eve', 'Frank', 'Grace'], pricePerPlayer: 15, revenue: 105, lostRevenue: 15, status: 'past', peerAvgOccupancy: 72, deviationFromPeer: 16, recommendations: [] },
    { id: 'cal-2', date: fmtDate(-12), startTime: '18:00', endTime: '20:00', court: 'Court 2', format: 'Round Robin', skillLevel: 'Intermediate', registered: 10, capacity: 12, occupancy: 83, playerNames: ['H1','H2','H3','H4','H5','H6','H7','H8','H9','H10'], pricePerPlayer: 20, revenue: 200, lostRevenue: 40, status: 'past', peerAvgOccupancy: 78, deviationFromPeer: 5, recommendations: [] },
    { id: 'cal-3', date: fmtDate(-10), startTime: '09:00', endTime: '11:00', court: 'Court 3', format: 'Clinic', skillLevel: 'Beginner', registered: 3, capacity: 10, occupancy: 30, playerNames: ['Ian', 'Jane', 'Kim'], pricePerPlayer: 25, revenue: 75, lostRevenue: 175, status: 'past', peerAvgOccupancy: 55, deviationFromPeer: -25, recommendations: [{ type: 'swap_format', label: 'Try Open Play', reason: 'Open Play averages 72% here vs Clinic at 30%.', priority: 'medium' }] },
    { id: 'cal-4', date: fmtDate(-8), startTime: '07:00', endTime: '09:00', court: 'Court 1', format: 'Open Play', skillLevel: 'All Levels', registered: 6, capacity: 8, occupancy: 75, playerNames: ['L1','L2','L3','L4','L5','L6'], pricePerPlayer: 15, revenue: 90, lostRevenue: 30, status: 'past', peerAvgOccupancy: 72, deviationFromPeer: 3, recommendations: [] },
    { id: 'cal-5', date: fmtDate(-7), startTime: '17:00', endTime: '19:00', court: 'Court 2', format: 'Drill', skillLevel: 'Advanced', registered: 4, capacity: 6, occupancy: 67, playerNames: ['M1','M2','M3','M4'], pricePerPlayer: 30, revenue: 120, lostRevenue: 60, status: 'past', peerAvgOccupancy: 70, deviationFromPeer: -3, recommendations: [] },
    { id: 'cal-6', date: fmtDate(-5), startTime: '08:00', endTime: '10:00', court: 'Court 1', format: 'Open Play', skillLevel: 'All Levels', registered: 2, capacity: 8, occupancy: 25, playerNames: ['N1','N2'], pricePerPlayer: 15, revenue: 30, lostRevenue: 90, status: 'past', peerAvgOccupancy: 72, deviationFromPeer: -47, recommendations: [{ type: 'cancel_consider', label: 'Consistently low — reconsider?', reason: 'This slot has been underperforming for 3+ weeks.', priority: 'high' }] },
    { id: 'cal-7', date: fmtDate(-4), startTime: '18:00', endTime: '20:00', court: 'Court 2', format: 'Round Robin', skillLevel: 'Intermediate', registered: 12, capacity: 12, occupancy: 100, playerNames: ['P1','P2','P3','P4','P5','P6','P7','P8','P9','P10','P11','P12'], pricePerPlayer: 20, revenue: 240, lostRevenue: 0, status: 'past', peerAvgOccupancy: 78, deviationFromPeer: 22, recommendations: [{ type: 'raise_price', label: 'High demand — raise price?', reason: 'Sold out 3 of last 4 weeks. Consider $25 or add a second session.', priority: 'low' }] },
    { id: 'cal-8', date: fmtDate(-3), startTime: '10:00', endTime: '12:00', court: 'Court 3', format: 'League Play', skillLevel: 'Advanced', registered: 8, capacity: 8, occupancy: 100, playerNames: ['Q1','Q2','Q3','Q4','Q5','Q6','Q7','Q8'], pricePerPlayer: 25, revenue: 200, lostRevenue: 0, status: 'past', peerAvgOccupancy: 85, deviationFromPeer: 15, recommendations: [] },
    { id: 'cal-9', date: fmtDate(-2), startTime: '09:00', endTime: '11:00', court: 'Court 1', format: 'Clinic', skillLevel: 'Beginner', registered: 4, capacity: 10, occupancy: 40, playerNames: ['R1','R2','R3','R4'], pricePerPlayer: 25, revenue: 100, lostRevenue: 150, status: 'past', peerAvgOccupancy: 55, deviationFromPeer: -15, recommendations: [{ type: 'lower_price', label: 'Consider lower price', reason: '$25 may be high. Similar clinics fill better at $18-20.', priority: 'low' }] },
    { id: 'cal-10', date: fmtDate(-1), startTime: '17:00', endTime: '19:00', court: 'Court 2', format: 'Open Play', skillLevel: 'All Levels', registered: 5, capacity: 8, occupancy: 63, playerNames: ['S1','S2','S3','S4','S5'], pricePerPlayer: 15, revenue: 75, lostRevenue: 45, status: 'past', peerAvgOccupancy: 60, deviationFromPeer: 3, recommendations: [] },

    // Today
    { id: 'cal-11', date: fmtDate(0), startTime: '08:00', endTime: '10:00', court: 'Court 1', format: 'Open Play', skillLevel: 'All Levels', registered: 4, capacity: 8, occupancy: 50, playerNames: ['T1','T2','T3','T4'], pricePerPlayer: 15, revenue: null, lostRevenue: null, status: 'today', peerAvgOccupancy: 72, deviationFromPeer: -22, recommendations: [{ type: 'send_invites', label: 'Send targeted invites', reason: 'Only 4/8 filled. Send quick invites to fill remaining spots.', priority: 'high', actionLink: '/clubs/demo/intelligence/slot-filler' }] },
    { id: 'cal-12', date: fmtDate(0), startTime: '18:00', endTime: '20:00', court: 'Court 2', format: 'Round Robin', skillLevel: 'Intermediate', registered: 9, capacity: 12, occupancy: 75, playerNames: ['U1','U2','U3','U4','U5','U6','U7','U8','U9'], pricePerPlayer: 20, revenue: null, lostRevenue: null, status: 'today', peerAvgOccupancy: 78, deviationFromPeer: -3, recommendations: [] },

    // Upcoming (next 2 weeks)
    { id: 'cal-13', date: fmtDate(1), startTime: '08:00', endTime: '10:00', court: 'Court 1', format: 'Open Play', skillLevel: 'All Levels', registered: 3, capacity: 8, occupancy: 38, playerNames: ['V1','V2','V3'], pricePerPlayer: 15, revenue: null, lostRevenue: null, status: 'upcoming', peerAvgOccupancy: 72, deviationFromPeer: -34, recommendations: [{ type: 'send_invites', label: 'Send targeted invites', reason: 'Only 3/8 spots filled. Use Slot Filler to invite matching players.', priority: 'high', actionLink: '/clubs/demo/intelligence/slot-filler' }] },
    { id: 'cal-14', date: fmtDate(2), startTime: '18:00', endTime: '20:00', court: 'Court 2', format: 'Round Robin', skillLevel: 'Intermediate', registered: 6, capacity: 12, occupancy: 50, playerNames: ['W1','W2','W3','W4','W5','W6'], pricePerPlayer: 20, revenue: null, lostRevenue: null, status: 'upcoming', peerAvgOccupancy: 78, deviationFromPeer: -28, recommendations: [{ type: 'send_invites', label: 'Send targeted invites', reason: '6 spots still open. Invite intermediate players.', priority: 'medium', actionLink: '/clubs/demo/intelligence/slot-filler' }] },
    { id: 'cal-15', date: fmtDate(3), startTime: '09:00', endTime: '11:00', court: 'Court 3', format: 'Clinic', skillLevel: 'Beginner', registered: 1, capacity: 10, occupancy: 10, playerNames: ['X1'], pricePerPlayer: 25, revenue: null, lostRevenue: null, status: 'upcoming', peerAvgOccupancy: 55, deviationFromPeer: -45, recommendations: [{ type: 'send_invites', label: 'Send targeted invites', reason: 'Only 1/10 registered — urgent!', priority: 'high', actionLink: '/clubs/demo/intelligence/slot-filler' }, { type: 'swap_format', label: 'Try Open Play', reason: 'Open Play averages 72% vs Clinic at 30% for this time.', priority: 'medium' }] },
    { id: 'cal-16', date: fmtDate(5), startTime: '07:00', endTime: '09:00', court: 'Court 1', format: 'Open Play', skillLevel: 'All Levels', registered: 5, capacity: 8, occupancy: 63, playerNames: ['Y1','Y2','Y3','Y4','Y5'], pricePerPlayer: 15, revenue: null, lostRevenue: null, status: 'upcoming', peerAvgOccupancy: 72, deviationFromPeer: -9, recommendations: [] },
    { id: 'cal-17', date: fmtDate(7), startTime: '10:00', endTime: '12:00', court: 'Court 3', format: 'League Play', skillLevel: 'Advanced', registered: 7, capacity: 8, occupancy: 88, playerNames: ['Z1','Z2','Z3','Z4','Z5','Z6','Z7'], pricePerPlayer: 25, revenue: null, lostRevenue: null, status: 'upcoming', peerAvgOccupancy: 85, deviationFromPeer: 3, recommendations: [] },
    { id: 'cal-18', date: fmtDate(8), startTime: '18:00', endTime: '20:00', court: 'Court 2', format: 'Round Robin', skillLevel: 'Intermediate', registered: 4, capacity: 12, occupancy: 33, playerNames: ['AA1','AA2','AA3','AA4'], pricePerPlayer: 20, revenue: null, lostRevenue: null, status: 'upcoming', peerAvgOccupancy: 78, deviationFromPeer: -45, recommendations: [{ type: 'send_invites', label: 'Send targeted invites', reason: 'Only 4/12 spots filled — 8 spots open!', priority: 'high', actionLink: '/clubs/demo/intelligence/slot-filler' }] },
    { id: 'cal-19', date: fmtDate(10), startTime: '08:00', endTime: '10:00', court: 'Court 1', format: 'Drill', skillLevel: 'Intermediate', registered: 5, capacity: 6, occupancy: 83, playerNames: ['BB1','BB2','BB3','BB4','BB5'], pricePerPlayer: 30, revenue: null, lostRevenue: null, status: 'upcoming', peerAvgOccupancy: 70, deviationFromPeer: 13, recommendations: [] },
    { id: 'cal-20', date: fmtDate(12), startTime: '17:00', endTime: '19:00', court: 'Court 2', format: 'Social', skillLevel: 'All Levels', registered: 6, capacity: 16, occupancy: 38, playerNames: ['CC1','CC2','CC3','CC4','CC5','CC6'], pricePerPlayer: 10, revenue: null, lostRevenue: null, status: 'upcoming', peerAvgOccupancy: 50, deviationFromPeer: -12, recommendations: [{ type: 'send_invites', label: 'Send targeted invites', reason: '10 spots open. Invite social players.', priority: 'medium', actionLink: '/clubs/demo/intelligence/slot-filler' }] },
  ]

  const pastSessions = sessions.filter(s => s.status === 'past')
  const totalRevenue = pastSessions.reduce((sum, s) => sum + (s.revenue ?? 0), 0)
  const totalLostRevenue = pastSessions.reduce((sum, s) => sum + (s.lostRevenue ?? 0), 0)
  const avgOccupancy = Math.round(sessions.reduce((sum, s) => sum + s.occupancy, 0) / sessions.length)

  return {
    sessions,
    summary: {
      totalSessions: sessions.length,
      avgOccupancy,
      totalRevenue,
      totalLostRevenue,
      upcomingCount: sessions.filter(s => s.status === 'upcoming').length,
      pastCount: pastSessions.length,
    },
    peerAverages: {
      'Open Play|Saturday|morning': { avgOccupancy: 72, avgRevenue: 90, count: 8 },
      'Round Robin|Tuesday|evening': { avgOccupancy: 78, avgRevenue: 200, count: 6 },
      'Clinic|Thursday|morning': { avgOccupancy: 55, avgRevenue: 125, count: 4 },
      'League Play|Sunday|morning': { avgOccupancy: 85, avgRevenue: 200, count: 5 },
      'Drill|Friday|evening': { avgOccupancy: 70, avgRevenue: 150, count: 3 },
    },
  }
}
