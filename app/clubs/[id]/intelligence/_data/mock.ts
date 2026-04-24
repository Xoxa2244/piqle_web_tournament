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
// Realistic club schedule: 3-5 sessions per day, morning block (7-13) + evening block (17-21), every day
const fmtDate = (daysFromNow: number) => {
  const d = new Date(today)
  d.setDate(d.getDate() + daysFromNow)
  return d.toISOString().slice(0, 10)
}

type CalItem = import('@/types/intelligence').SessionCalendarItem
type CalRec = import('@/types/intelligence').SessionRecommendation

// Daily schedule templates — rotate through these
const dailySlots = [
  // Weekday template A
  [
    { start: '07:00', end: '09:00', format: 'Open Play', skill: 'All Levels', court: 'Court 1', cap: 8, price: 15 },
    { start: '09:00', end: '11:00', format: 'Clinic', skill: 'Beginner', court: 'Court 2', cap: 10, price: 25 },
    { start: '11:00', end: '13:00', format: 'Drill', skill: 'Intermediate', court: 'Court 1', cap: 6, price: 30 },
    { start: '17:00', end: '19:00', format: 'Round Robin', skill: 'Intermediate', court: 'Court 1', cap: 12, price: 20 },
    { start: '19:00', end: '21:00', format: 'Open Play', skill: 'Advanced', court: 'Court 2', cap: 8, price: 18 },
  ],
  // Weekday template B
  [
    { start: '07:00', end: '09:00', format: 'Drill', skill: 'Advanced', court: 'Court 2', cap: 6, price: 30 },
    { start: '09:00', end: '11:00', format: 'Open Play', skill: 'All Levels', court: 'Court 1', cap: 8, price: 15 },
    { start: '11:00', end: '13:00', format: 'Clinic', skill: 'Intermediate', court: 'Court 3', cap: 10, price: 25 },
    { start: '17:00', end: '19:00', format: 'Open Play', skill: 'All Levels', court: 'Court 1', cap: 8, price: 15 },
    { start: '19:00', end: '21:00', format: 'Round Robin', skill: 'Advanced', court: 'Court 2', cap: 12, price: 22 },
  ],
  // Weekend template
  [
    { start: '08:00', end: '10:00', format: 'Open Play', skill: 'All Levels', court: 'Court 1', cap: 8, price: 18 },
    { start: '08:00', end: '10:00', format: 'Clinic', skill: 'Beginner', court: 'Court 3', cap: 10, price: 28 },
    { start: '10:00', end: '12:00', format: 'Round Robin', skill: 'Intermediate', court: 'Court 1', cap: 12, price: 22 },
    { start: '10:00', end: '12:00', format: 'League Play', skill: 'Advanced', court: 'Court 2', cap: 8, price: 25 },
    { start: '12:00', end: '13:00', format: 'Drill', skill: 'Intermediate', court: 'Court 3', cap: 6, price: 30 },
    { start: '17:00', end: '19:00', format: 'Social', skill: 'All Levels', court: 'Court 1', cap: 16, price: 12 },
    { start: '19:00', end: '21:00', format: 'Round Robin', skill: 'Advanced', court: 'Court 2', cap: 12, price: 22 },
  ],
]

// Seeded random for consistent mock data
function seededRand(seed: number) {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

// Seasonal modifier: summer months higher occupancy, winter lower (pickleball seasonality)
function seasonalMod(dateStr: string): number {
  const month = new Date(dateStr + 'T12:00:00').getMonth() // 0-11
  // Peak: May-Sep (+5-10%), Low: Dec-Feb (-8-12%), Shoulder: Mar-Apr, Oct-Nov (0)
  const mods = [-0.10, -0.08, -0.03, 0.0, 0.05, 0.08, 0.10, 0.10, 0.08, 0.02, -0.02, -0.08]
  return mods[month]
}

// Growth trend: club gets more popular over time (older = lower base)
function growthMod(dayOffset: number): number {
  // dayOffset is negative for past. -540 = 18 months ago → -0.12, 0 = today → 0
  const monthsAgo = Math.max(0, -dayOffset) / 30
  return -monthsAgo * 0.007 // ~1% lower per month going back
}

function generateDaySessions(dayOffset: number, id: number): CalItem[] {
  const date = fmtDate(dayOffset)
  const dayOfWeek = new Date(date + 'T12:00:00').getDay() // 0=Sun
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
  const template = isWeekend ? dailySlots[2] : dailySlots[Math.abs(dayOffset) % 2]
  const status: CalItem['status'] = dayOffset < 0 ? 'past' : dayOffset === 0 ? 'today' : 'upcoming'
  const isRecent = dayOffset > -30 // Only generate recs for last 30 days + upcoming

  return template.map((slot, si) => {
    const seed = dayOffset * 100 + si + 42
    const rand = seededRand(seed)

    // Base fill rates per format
    let baseFill = 0.65
    if (slot.format === 'Open Play') baseFill = 0.72
    if (slot.format === 'Round Robin') baseFill = 0.78
    if (slot.format === 'Clinic') baseFill = 0.48
    if (slot.format === 'Drill') baseFill = 0.70
    if (slot.format === 'League Play') baseFill = 0.88
    if (slot.format === 'Social') baseFill = 0.45
    if (isWeekend) baseFill += 0.08

    // Apply seasonal + growth modifiers
    baseFill += seasonalMod(date) + growthMod(dayOffset)

    // Add variance
    const fillRate = Math.max(0.05, Math.min(1, baseFill + (rand - 0.5) * 0.4))
    const registered = Math.max(0, Math.round(fillRate * slot.cap))
    const occupancy = slot.cap > 0 ? Math.round((registered / slot.cap) * 100) : 0

    const peerAvg = Math.round(Math.max(0, baseFill) * 100)
    const deviation = occupancy - peerAvg

    const revenue = status === 'past' ? registered * slot.price : null
    const lostRevenue = status === 'past' ? (slot.cap - registered) * slot.price : null

    // Only generate recommendations for recent sessions
    const recs: CalRec[] = []
    if (isRecent) {
      if (status !== 'past' && occupancy < 50) {
        recs.push({ type: 'send_invites', label: 'Send targeted invites', reason: `Only ${registered}/${slot.cap} filled. Use Slot Filler to find matching players.`, priority: occupancy < 30 ? 'high' : 'medium', actionLink: '/clubs/demo/intelligence/slot-filler' })
      }
      if (occupancy < 35 && slot.format === 'Clinic') {
        recs.push({ type: 'swap_format', label: 'Try Open Play instead', reason: `Clinics average ${peerAvg}% here. Open Play averages 72% in the same slot.`, priority: 'medium' })
      }
      if (occupancy > 95 && status === 'past') {
        recs.push({ type: 'raise_price', label: 'High demand — raise price?', reason: `Sold out! Consider raising from $${slot.price} to $${slot.price + 3} or adding a parallel session.`, priority: 'low' })
      }
      if (occupancy < 25 && status === 'past') {
        recs.push({ type: 'cancel_consider', label: 'Consistently low', reason: `Only ${registered}/${slot.cap} players. Consider replacing this slot.`, priority: 'high' })
      }
    }

    return {
      id: `cal-${id + si}`,
      date,
      startTime: slot.start,
      endTime: slot.end,
      court: slot.court,
      format: slot.format,
      skillLevel: slot.skill,
      registered,
      capacity: slot.cap,
      occupancy,
      playerNames: [], // omitted for perf — not shown in calendar
      pricePerPlayer: slot.price,
      revenue,
      lostRevenue: lostRevenue && lostRevenue > 0 ? lostRevenue : null,
      status,
      peerAvgOccupancy: peerAvg,
      deviationFromPeer: deviation,
      recommendations: recs,
    }
  })
}

let _cachedCalendar: import('@/types/intelligence').SessionCalendarData | null = null

export function mockSessionsCalendar(): import('@/types/intelligence').SessionCalendarData {
  if (_cachedCalendar) return _cachedCalendar

  const sessions: CalItem[] = []
  let nextId = 1

  // 18 months back + 1 month forward ≈ 570 days → ~1500+ sessions
  for (let d = -540; d <= 30; d++) {
    const daySessions = generateDaySessions(d, nextId)
    sessions.push(...daySessions)
    nextId += daySessions.length
  }

  const pastSessions = sessions.filter(s => s.status === 'past')
  const totalRevenue = pastSessions.reduce((sum, s) => sum + (s.revenue ?? 0), 0)
  const totalLostRevenue = pastSessions.reduce((sum, s) => sum + (s.lostRevenue ?? 0), 0)
  const avgOccupancy = sessions.length > 0
    ? Math.round(sessions.reduce((sum, s) => sum + s.occupancy, 0) / sessions.length)
    : 0

  _cachedCalendar = {
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
      'Open Play|Monday|morning': { avgOccupancy: 72, avgRevenue: 108, count: 65 },
      'Open Play|Saturday|morning': { avgOccupancy: 80, avgRevenue: 144, count: 40 },
      'Open Play|Wednesday|morning': { avgOccupancy: 70, avgRevenue: 105, count: 60 },
      'Round Robin|Monday|evening': { avgOccupancy: 78, avgRevenue: 240, count: 55 },
      'Round Robin|Saturday|evening': { avgOccupancy: 85, avgRevenue: 264, count: 38 },
      'Round Robin|Thursday|evening': { avgOccupancy: 76, avgRevenue: 228, count: 50 },
      'Clinic|Tuesday|morning': { avgOccupancy: 48, avgRevenue: 120, count: 45 },
      'Clinic|Sunday|morning': { avgOccupancy: 55, avgRevenue: 154, count: 30 },
      'Drill|Wednesday|morning': { avgOccupancy: 70, avgRevenue: 126, count: 50 },
      'Drill|Friday|morning': { avgOccupancy: 68, avgRevenue: 122, count: 48 },
      'League Play|Saturday|morning': { avgOccupancy: 88, avgRevenue: 200, count: 35 },
      'League Play|Sunday|morning': { avgOccupancy: 86, avgRevenue: 196, count: 30 },
      'Social|Sunday|evening': { avgOccupancy: 45, avgRevenue: 86, count: 28 },
      'Social|Saturday|evening': { avgOccupancy: 50, avgRevenue: 96, count: 25 },
    },
  }

  return _cachedCalendar
}

// ── Member Health ──
import type { MemberHealthData, MemberHealthResult, RiskLevel, LifecycleStage, HealthScoreComponent } from '@/types/intelligence'

function mkHealth(
  id: string, name: string, email: string, dupr: number, gender: 'M' | 'F',
  healthScore: number, riskLevel: RiskLevel, stage: LifecycleStage,
  trend: 'improving' | 'stable' | 'declining',
  daysSinceLast: number | null, totalBookings: number, joinedDaysAgo: number,
  ft: HealthScoreComponent, rec: HealthScoreComponent, con: HealthScoreComponent, pb: HealthScoreComponent, ns: HealthScoreComponent,
  topRisks: string[], suggestedAction: string,
): MemberHealthResult {
  return {
    memberId: id,
    member: { id, name, email, image: null, gender, city: null, duprRatingDoubles: dupr, duprRatingSingles: null },
    healthScore, riskLevel, lifecycleStage: stage,
    components: { frequencyTrend: ft, recency: rec, consistency: con, patternBreak: pb, noShowTrend: ns },
    topRisks, suggestedAction, trend,
    daysSinceLastBooking: daysSinceLast, totalBookings, joinedDaysAgo,
  }
}

const c = (s: number, w: number, l: string): HealthScoreComponent => ({ score: s, weight: w, label: l })

export function mockMemberHealth(): MemberHealthData {
  const members: MemberHealthResult[] = [
    // ── Critical (4) ──
    mkHealth('mh1', 'Tom Bradley', 'tom@demo.com', 3.6, 'M', 18, 'critical', 'churned', 'declining', 47, 23, 280,
      c(15, 35, 'Significant frequency drop (-80%)'), c(0, 25, 'Inactive for 47+ days'), c(70, 20, 'Was moderately consistent'), c(15, 15, 'Missed Tue, Wed, Sat sessions'), c(100, 5, 'Excellent reliability'),
      ['Significant frequency drop (-80%)', 'Inactive for 47+ days', 'Missed Tue, Wed, Sat sessions'], 'Use Reactivation to send a win-back message'),
    mkHealth('mh2', 'Diana Ross', 'diana@demo.com', 2.8, 'F', 12, 'critical', 'critical', 'declining', 32, 5, 120,
      c(0, 35, 'No bookings in the last 60 days'), c(0, 25, 'Inactive for 32+ days'), c(50, 20, 'Not enough history'), c(20, 15, 'Missed most expected sessions'), c(50, 5, 'No booking history'),
      ['No bookings in the last 60 days', 'Inactive for 32+ days'], 'Urgent: Send personalized invite before they churn'),
    mkHealth('mh3', 'Pete Johnson', 'pete@demo.com', 4.1, 'M', 15, 'critical', 'churned', 'declining', 38, 18, 200,
      c(15, 35, 'Significant frequency drop (-75%)'), c(0, 25, 'Inactive for 38+ days'), c(40, 20, 'Irregular visit pattern'), c(15, 15, 'Missed Mon, Wed, Fri'), c(60, 5, 'No-show rate 12%'),
      ['Significant frequency drop (-75%)', 'Inactive for 38+ days'], 'Use Reactivation to send a win-back message'),
    mkHealth('mh4', 'Nicole Park', 'nicole@demo.com', 3.2, 'F', 22, 'critical', 'critical', 'declining', 25, 7, 95,
      c(15, 35, 'Visit frequency down 60%'), c(25, 25, '25 days inactive — approaching churn'), c(30, 20, 'Irregular visits'), c(20, 15, 'Missed Sat & Sun sessions'), c(100, 5, 'Excellent reliability'),
      ['Visit frequency down 60%', '25 days inactive — approaching churn'], 'Urgent: Send personalized invite before they churn'),

    // ── At-Risk (5) ──
    mkHealth('mh5', 'Sarah Chen', 'sarah@demo.com', 4.2, 'F', 38, 'at_risk', 'at_risk', 'declining', 12, 15, 180,
      c(40, 35, 'Visit frequency down 35%'), c(50, 25, '12 days since last session'), c(70, 20, 'Moderately consistent'), c(45, 15, 'Missed usual Tue & Thu sessions'), c(100, 5, 'Excellent reliability'),
      ['Visit frequency down 35%', 'Missed usual Tue & Thu sessions'], 'Send targeted invite for their preferred session type'),
    mkHealth('mh6', 'Mike Rodriguez', 'mike@demo.com', 3.8, 'M', 42, 'at_risk', 'at_risk', 'declining', 14, 22, 220,
      c(40, 35, 'Visit frequency down 40%'), c(50, 25, '14 days since last session'), c(60, 20, 'Moderately consistent'), c(60, 15, 'Missed 1 usual session (Wednesday)'), c(60, 5, 'No-show rate 8%'),
      ['Visit frequency down 40%', '14 days since last session'], 'Send targeted invite for their preferred session type'),
    mkHealth('mh7', 'Emily Park', 'emily@demo.com', 4.0, 'F', 35, 'at_risk', 'at_risk', 'declining', 16, 12, 150,
      c(15, 35, 'Visit frequency down 55%'), c(25, 25, '16 days inactive'), c(100, 20, 'Very consistent visit pattern'), c(45, 15, 'Missed Tue & Thu sessions'), c(100, 5, 'Excellent reliability'),
      ['Visit frequency down 55%', '16 days inactive'], 'Send targeted invite for their preferred session type'),
    mkHealth('mh8', 'James Wilson', 'james@demo.com', 3.5, 'M', 28, 'at_risk', 'at_risk', 'declining', 18, 8, 130,
      c(40, 35, 'Visit frequency down 30%'), c(25, 25, '18 days inactive'), c(40, 20, 'Irregular visit pattern'), c(75, 15, 'Missed 1 usual session (Saturday)'), c(20, 5, 'High no-show rate (18%)'),
      ['Visit frequency down 30%', '18 days inactive', 'High no-show rate (18%)'], 'Send targeted invite for their preferred session type'),
    mkHealth('mh9', 'Karen Lewis', 'karen@demo.com', 4.1, 'F', 32, 'at_risk', 'at_risk', 'declining', 10, 28, 310,
      c(40, 35, 'Visit frequency down 45%'), c(50, 25, '10 days since last session'), c(40, 20, 'Irregular visit pattern'), c(15, 15, 'Missed most expected sessions'), c(100, 5, 'Excellent reliability'),
      ['Visit frequency down 45%', 'Missed most expected sessions'], 'Send targeted invite for their preferred session type'),

    // ── Watch (8) ──
    mkHealth('mh10', 'David Kim', 'david@demo.com', 3.9, 'M', 58, 'watch', 'active', 'declining', 5, 30, 250,
      c(60, 35, 'Slight frequency decline (-20%)'), c(80, 25, 'Last played 5 days ago'), c(70, 20, 'Moderately consistent'), c(45, 15, 'Missed usual Thu session'), c(100, 5, 'Excellent reliability'),
      ['Slight frequency decline (-20%)', 'Missed usual Thu session'], 'Monitor — consider a check-in message next week'),
    mkHealth('mh11', 'Lisa Thompson', 'lisa@demo.com', 4.5, 'F', 62, 'watch', 'active', 'stable', 7, 18, 180,
      c(75, 35, 'Visit frequency stable'), c(80, 25, 'Last played 7 days ago'), c(60, 20, 'Moderately consistent'), c(45, 15, 'Missed usual Sat session'), c(60, 5, 'No-show rate 10%'),
      ['Missed usual Sat session'], 'Monitor — consider a check-in message next week'),
    mkHealth('mh12', 'Alex Rivera', 'alex@demo.com', 3.3, 'M', 55, 'watch', 'active', 'declining', 6, 14, 90,
      c(60, 35, 'Slight frequency decline (-15%)'), c(80, 25, 'Last played 6 days ago'), c(40, 20, 'Irregular visit pattern'), c(75, 15, 'Missed 1 usual session'), c(100, 5, 'Excellent reliability'),
      ['Irregular visit pattern'], 'Monitor — consider a check-in message next week'),
    mkHealth('mh13', 'Rachel Green', 'rachel@demo.com', 3.7, 'F', 52, 'watch', 'active', 'stable', 4, 25, 200,
      c(75, 35, 'Visit frequency stable'), c(100, 25, 'Played 4 days ago'), c(40, 20, 'Irregular visit pattern'), c(45, 15, 'Missed usual Mon session'), c(60, 5, 'No-show rate 8%'),
      ['Irregular visit pattern', 'Missed usual Mon session'], 'Monitor — consider a check-in message next week'),
    mkHealth('mh14', 'Chris Martinez', 'chris@demo.com', 4.3, 'M', 68, 'watch', 'active', 'declining', 3, 31, 365,
      c(60, 35, 'Slight frequency decline (-22%)'), c(100, 25, 'Played 3 days ago'), c(100, 20, 'Very consistent pattern'), c(45, 15, 'Missed usual Wed session'), c(100, 5, 'Excellent reliability'),
      ['Slight frequency decline (-22%)'], 'Monitor — consider a check-in message next week'),
    mkHealth('mh15', 'Amanda Cruz', 'amanda@demo.com', 3.4, 'F', 56, 'watch', 'active', 'stable', 5, 16, 140,
      c(75, 35, 'Visit frequency stable'), c(80, 25, 'Last played 5 days ago'), c(70, 20, 'Moderately consistent'), c(45, 15, 'Missed usual Fri session'), c(20, 5, 'High no-show rate (20%)'),
      ['High no-show rate (20%)', 'Missed usual Fri session'], 'Monitor — consider a check-in message next week'),
    mkHealth('mh16', 'Kevin Park', 'kevin@demo.com', 3.6, 'M', 64, 'watch', 'active', 'stable', 4, 20, 170,
      c(75, 35, 'Visit frequency stable'), c(100, 25, 'Played 4 days ago'), c(60, 20, 'Moderately consistent'), c(60, 15, 'Missed 1 usual session'), c(60, 5, 'No-show rate 12%'),
      ['No-show rate 12%'], 'Monitor — consider a check-in message next week'),
    mkHealth('mh17', 'Tina Chen', 'tina@demo.com', 3.8, 'F', 59, 'watch', 'active', 'declining', 6, 19, 160,
      c(60, 35, 'Slight frequency decline (-18%)'), c(80, 25, 'Last played 6 days ago'), c(70, 20, 'Moderately consistent'), c(60, 15, 'Missed 1 usual session'), c(100, 5, 'Excellent reliability'),
      ['Slight frequency decline (-18%)'], 'Monitor — consider a check-in message next week'),

    // ── Healthy / Active (20) ──
    ...[
      { id: 'mh18', name: 'Brian Johnson', email: 'brian@demo.com', dupr: 4.4, g: 'M' as const, score: 91, days: 1, total: 45, joined: 400 },
      { id: 'mh19', name: 'Sara Wilson', email: 'sara@demo.com', dupr: 3.5, g: 'F' as const, score: 88, days: 2, total: 38, joined: 350 },
      { id: 'mh20', name: 'Mark Davis', email: 'mark@demo.com', dupr: 3.7, g: 'M' as const, score: 85, days: 1, total: 42, joined: 380 },
      { id: 'mh21', name: 'Jennifer Wu', email: 'jennifer@demo.com', dupr: 3.6, g: 'F' as const, score: 92, days: 0, total: 50, joined: 420 },
      { id: 'mh22', name: 'Carlos Mendez', email: 'carlos@demo.com', dupr: 4.5, g: 'M' as const, score: 87, days: 2, total: 35, joined: 300 },
      { id: 'mh23', name: 'Ashley Brown', email: 'ashley@demo.com', dupr: 3.2, g: 'F' as const, score: 79, days: 3, total: 28, joined: 250 },
      { id: 'mh24', name: 'Jason Lee', email: 'jason@demo.com', dupr: 3.9, g: 'M' as const, score: 94, days: 1, total: 55, joined: 500 },
      { id: 'mh25', name: 'Maria Garcia', email: 'maria@demo.com', dupr: 2.8, g: 'F' as const, score: 76, days: 3, total: 18, joined: 180 },
      { id: 'mh26', name: 'Ryan Torres', email: 'ryan@demo.com', dupr: 4.2, g: 'M' as const, score: 89, days: 1, total: 40, joined: 360 },
      { id: 'mh27', name: 'Sophia Chen', email: 'sophia@demo.com', dupr: 4.0, g: 'F' as const, score: 83, days: 2, total: 32, joined: 280 },
      { id: 'mh28', name: 'Tyler Adams', email: 'tyler@demo.com', dupr: 3.4, g: 'M' as const, score: 81, days: 2, total: 25, joined: 220 },
      { id: 'mh29', name: 'Megan White', email: 'megan@demo.com', dupr: 3.1, g: 'F' as const, score: 78, days: 3, total: 20, joined: 200 },
      { id: 'mh30', name: 'Daniel Kim', email: 'daniel@demo.com', dupr: 4.6, g: 'M' as const, score: 95, days: 0, total: 60, joined: 450 },
      { id: 'mh31', name: 'Emma Roberts', email: 'emma@demo.com', dupr: 3.8, g: 'F' as const, score: 86, days: 1, total: 36, joined: 320 },
      { id: 'mh32', name: 'Jack Miller', email: 'jack@demo.com', dupr: 3.5, g: 'M' as const, score: 82, days: 2, total: 30, joined: 260 },
      { id: 'mh33', name: 'Olivia Taylor', email: 'olivia@demo.com', dupr: 3.3, g: 'F' as const, score: 77, days: 3, total: 22, joined: 210 },
      { id: 'mh34', name: 'Josh Anderson', email: 'josh@demo.com', dupr: 4.1, g: 'M' as const, score: 90, days: 1, total: 44, joined: 390 },
      { id: 'mh35', name: 'Natalie Hernandez', email: 'natalie@demo.com', dupr: 3.6, g: 'F' as const, score: 84, days: 2, total: 33, joined: 290 },
      { id: 'mh36', name: 'Luke Thomas', email: 'luke@demo.com', dupr: 3.0, g: 'M' as const, score: 75, days: 3, total: 16, joined: 170 },
      { id: 'mh37', name: 'Hannah Jackson', email: 'hannah@demo.com', dupr: 3.7, g: 'F' as const, score: 80, days: 2, total: 26, joined: 240 },
    ].map(p => mkHealth(
      p.id, p.name, p.email, p.dupr, p.g, p.score, 'healthy', 'active', 'stable', p.days, p.total, p.joined,
      c(100, 35, 'Visit frequency stable or growing'), c(100, 25, `Played ${p.days} day${p.days === 1 ? '' : 's'} ago`),
      c(p.score > 85 ? 100 : 70, 20, p.score > 85 ? 'Very consistent pattern' : 'Moderately consistent'),
      c(100, 15, 'Attended all expected sessions'), c(100, 5, 'Excellent reliability'),
      [], 'No action needed — member is engaged',
    )),

    // ── Onboarding (5) ──
    ...[
      { id: 'mh38', name: 'New Player Amy', email: 'amy@demo.com', dupr: 2.5, g: 'F' as const, days: 3, joined: 5 },
      { id: 'mh39', name: 'New Player Ben', email: 'ben@demo.com', dupr: 2.8, g: 'M' as const, days: 2, joined: 8 },
      { id: 'mh40', name: 'New Player Chloe', email: 'chloe@demo.com', dupr: 3.0, g: 'F' as const, days: 1, joined: 10 },
      { id: 'mh41', name: 'New Player Derek', email: 'derek@demo.com', dupr: 2.3, g: 'M' as const, days: 0, joined: 3 },
      { id: 'mh42', name: 'New Player Eve', email: 'eve@demo.com', dupr: 2.6, g: 'F' as const, days: null, joined: 2 },
    ].map(p => mkHealth(
      p.id, p.name, p.email, p.dupr, p.g, 65, 'watch', 'onboarding',
      p.days !== null ? 'improving' : 'stable',
      p.days, p.days !== null ? p.days : 0, p.joined,
      c(90, 35, 'New member — building frequency'), c(p.days !== null ? 100 : 10, 25, p.days !== null ? `Played ${p.days} days ago` : 'No bookings yet'),
      c(50, 20, 'Not enough history'), c(70, 15, 'No pattern established yet'), c(50, 5, 'No booking history'),
      p.days === null ? ['No bookings yet'] : [], 'Send welcome message with recommended first sessions',
    )),

    // ── Ramping (8) ──
    ...[
      { id: 'mh43', name: 'Ramp Player Fiona', email: 'fiona@demo.com', dupr: 3.1, g: 'F' as const, score: 72, days: 2, total: 6, joined: 25 },
      { id: 'mh44', name: 'Ramp Player Greg', email: 'greg@demo.com', dupr: 3.4, g: 'M' as const, score: 68, days: 4, total: 4, joined: 30 },
      { id: 'mh45', name: 'Ramp Player Holly', email: 'holly@demo.com', dupr: 2.9, g: 'F' as const, score: 78, days: 1, total: 8, joined: 35 },
      { id: 'mh46', name: 'Ramp Player Ivan', email: 'ivan@demo.com', dupr: 3.6, g: 'M' as const, score: 65, days: 5, total: 3, joined: 20 },
      { id: 'mh47', name: 'Ramp Player Jess', email: 'jess@demo.com', dupr: 3.3, g: 'F' as const, score: 82, days: 1, total: 10, joined: 45 },
      { id: 'mh48', name: 'Ramp Player Kyle', email: 'kyle@demo.com', dupr: 3.0, g: 'M' as const, score: 58, days: 7, total: 2, joined: 18 },
      { id: 'mh49', name: 'Ramp Player Lara', email: 'lara@demo.com', dupr: 3.5, g: 'F' as const, score: 75, days: 2, total: 7, joined: 40 },
      { id: 'mh50', name: 'Ramp Player Max', email: 'max@demo.com', dupr: 2.7, g: 'M' as const, score: 61, days: 6, total: 3, joined: 22 },
    ].map(p => mkHealth(
      p.id, p.name, p.email, p.dupr, p.g, p.score, p.score >= 75 ? 'healthy' : 'watch', 'ramping',
      p.score >= 70 ? 'improving' : 'stable',
      p.days, p.total, p.joined,
      c(p.score >= 75 ? 90 : 60, 35, p.score >= 75 ? 'Building good frequency' : 'Frequency still developing'),
      c(p.days <= 3 ? 100 : 80, 25, `Last played ${p.days} days ago`),
      c(50, 20, 'Building consistency — early days'), c(70, 15, 'No pattern established yet'), c(100, 5, 'No issues'),
      p.score < 65 ? ['Frequency still developing'] : [], p.score < 65 ? 'Monitor — consider a check-in message next week' : 'No action needed — member is engaged',
    )),
  ]

  const total = members.length
  const healthy = members.filter(m => m.riskLevel === 'healthy').length
  const watch = members.filter(m => m.riskLevel === 'watch').length
  const atRisk = members.filter(m => m.riskLevel === 'at_risk').length
  const critical = members.filter(m => m.riskLevel === 'critical').length
  const avgHealthScore = Math.round(members.reduce((s, m) => s + m.healthScore, 0) / total)

  return {
    members,
    summary: {
      total,
      healthy,
      watch,
      atRisk,
      critical,
      churned: 0,
      avgHealthScore,
      revenueAtRisk: (atRisk + critical) * 99,
      trendVsPrevWeek: 3,
    },
  }
}

// ── Campaign Analytics (mock) ──

// Deterministic pattern — no empty gaps, realistic daily volumes
const campaignSentPattern = [3,2,4,1,3,5,2, 4,3,2,5,3,4,2, 3,4,1,3,2,5,4, 2,3,4,3,2,4,3, 5,4]
const campaignFailedPattern = [0,0,0,0,0,1,0, 0,0,0,0,0,0,0, 0,0,0,0,0,0,0, 0,0,0,0,0,1,0, 0,0]
const campaignByDay = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(today)
  d.setDate(d.getDate() - (29 - i))
  return {
    date: d.toISOString().slice(0, 10),
    sent: campaignSentPattern[i],
    failed: campaignFailedPattern[i],
    skipped: i % 7 === 3 ? 1 : 0,
  }
})

const mockRecentCampaignLogs = [
  { id: 'cl1', type: 'CHECK_IN', status: 'sent', channel: 'email', userName: 'Maria Santos', createdAt: fmt(-0.1) },
  { id: 'cl2', type: 'RETENTION_BOOST', status: 'sent', channel: 'email', userName: 'James Wilson', createdAt: fmt(-0.2) },
  { id: 'cl3', type: 'CHECK_IN', status: 'sent', channel: 'email', userName: 'Sofia Martinez', createdAt: fmt(-0.5) },
  { id: 'cl4', type: 'RETENTION_BOOST', status: 'failed', channel: 'email', userName: 'Robert Chen', createdAt: fmt(-1) },
  { id: 'cl5', type: 'CHECK_IN', status: 'sent', channel: 'email', userName: 'Emily Johnson', createdAt: fmt(-1.2) },
  { id: 'cl6', type: 'RETENTION_BOOST', status: 'sent', channel: 'email', userName: 'Daniel Kim', createdAt: fmt(-1.5) },
  { id: 'cl7', type: 'CHECK_IN', status: 'sent', channel: 'email', userName: 'Olivia Brown', createdAt: fmt(-2) },
  { id: 'cl8', type: 'RETENTION_BOOST', status: 'sent', channel: 'email', userName: 'Alex Rivera', createdAt: fmt(-2.1) },
  { id: 'cl9', type: 'CHECK_IN', status: 'skipped', channel: null, userName: 'Sarah Lee', createdAt: fmt(-2.5) },
  { id: 'cl10', type: 'RETENTION_BOOST', status: 'sent', channel: 'email', userName: 'Michael Park', createdAt: fmt(-3) },
  { id: 'cl11', type: 'CHECK_IN', status: 'sent', channel: 'email', userName: 'Lisa Chen', createdAt: fmt(-3.5) },
  { id: 'cl12', type: 'RETENTION_BOOST', status: 'sent', channel: 'email', userName: 'David Wong', createdAt: fmt(-4) },
  { id: 'cl13', type: 'CHECK_IN', status: 'failed', channel: 'email', userName: 'Anna Lopez', createdAt: fmt(-4.5) },
  { id: 'cl14', type: 'RETENTION_BOOST', status: 'sent', channel: 'email', userName: 'Chris Taylor', createdAt: fmt(-5) },
  { id: 'cl15', type: 'CHECK_IN', status: 'sent', channel: 'email', userName: 'Kate Williams', createdAt: fmt(-5.2) },
  { id: 'cl16', type: 'RETENTION_BOOST', status: 'sent', channel: 'email', userName: 'Tom Harris', createdAt: fmt(-6) },
  { id: 'cl17', type: 'CHECK_IN', status: 'sent', channel: 'email', userName: 'Rachel Green', createdAt: fmt(-6.5) },
  { id: 'cl18', type: 'CHECK_IN', status: 'sent', channel: 'email', userName: 'Ben Miller', createdAt: fmt(-7) },
  { id: 'cl19', type: 'RETENTION_BOOST', status: 'sent', channel: 'email', userName: 'Grace Kim', createdAt: fmt(-8) },
  { id: 'cl20', type: 'CHECK_IN', status: 'sent', channel: 'email', userName: 'Noah Davis', createdAt: fmt(-9) },
]

export const mockCampaignAnalytics = {
  summary: {
    totalSent: campaignByDay.reduce((sum, d) => sum + d.sent, 0),
    totalFailed: campaignByDay.reduce((sum, d) => sum + d.failed, 0),
    totalPending: 0,
    thisWeek: campaignByDay.slice(-7).reduce((sum, d) => sum + d.sent, 0),
    activeTriggers: 4,
  },
  byType: [
    { type: 'CHECK_IN', count: Math.floor(campaignByDay.reduce((s, d) => s + d.sent, 0) * 0.6) },
    { type: 'RETENTION_BOOST', count: Math.floor(campaignByDay.reduce((s, d) => s + d.sent, 0) * 0.4) },
  ],
  byDay: campaignByDay,
  recentLogs: mockRecentCampaignLogs,
}

// ── Member Outreach History (mock) ──

export const mockMemberOutreach = {
  logs: [
    { id: 'moh1', type: 'CHECK_IN', channel: 'email', status: 'sent', createdAt: fmt(-3) },
    { id: 'moh2', type: 'RETENTION_BOOST', channel: 'email', status: 'sent', createdAt: fmt(-10) },
    { id: 'moh3', type: 'CHECK_IN', channel: 'email', status: 'sent', createdAt: fmt(-18) },
    { id: 'moh4', type: 'SLOT_FILLER', channel: 'email', status: 'sent', createdAt: fmt(-25) },
  ],
}

// ── Variant Performance Analytics (mock) ──

export const mockVariantAnalytics = {
  variants: [
    // LLM variants (llm_ prefix) — generally better performance
    { variantId: 'llm_checkin_pattern', totalSent: 45, totalOpened: 22, totalClicked: 8, totalBounced: 1, openRate: 0.49, clickRate: 0.18, bounceRate: 0.02, engagementScore: 0.30 },
    { variantId: 'llm_checkin_social', totalSent: 32, totalOpened: 17, totalClicked: 6, totalBounced: 0, openRate: 0.53, clickRate: 0.19, bounceRate: 0, engagementScore: 0.32 },
    { variantId: 'llm_checkin_urgency', totalSent: 28, totalOpened: 11, totalClicked: 3, totalBounced: 0, openRate: 0.39, clickRate: 0.11, bounceRate: 0, engagementScore: 0.22 },
    { variantId: 'llm_retention_value', totalSent: 22, totalOpened: 12, totalClicked: 5, totalBounced: 1, openRate: 0.55, clickRate: 0.23, bounceRate: 0.05, engagementScore: 0.36 },
    { variantId: 'llm_retention_community', totalSent: 18, totalOpened: 8, totalClicked: 3, totalBounced: 0, openRate: 0.44, clickRate: 0.17, bounceRate: 0, engagementScore: 0.28 },
    // Hardcoded template variants — baseline performance
    { variantId: 'checkin_pattern', totalSent: 15, totalOpened: 5, totalClicked: 1, totalBounced: 0, openRate: 0.33, clickRate: 0.07, bounceRate: 0, engagementScore: 0.17 },
    { variantId: 'checkin_frequency', totalSent: 12, totalOpened: 4, totalClicked: 1, totalBounced: 0, openRate: 0.33, clickRate: 0.08, bounceRate: 0, engagementScore: 0.18 },
    { variantId: 'checkin_recency', totalSent: 10, totalOpened: 3, totalClicked: 0, totalBounced: 1, openRate: 0.30, clickRate: 0, bounceRate: 0.10, engagementScore: 0.12 },
    { variantId: 'retention_value', totalSent: 9, totalOpened: 3, totalClicked: 1, totalBounced: 0, openRate: 0.33, clickRate: 0.11, bounceRate: 0, engagementScore: 0.20 },
    { variantId: 'retention_spot', totalSent: 7, totalOpened: 2, totalClicked: 0, totalBounced: 0, openRate: 0.29, clickRate: 0, bounceRate: 0, engagementScore: 0.12 },
  ],
  overallOpenRate: 0.41,
  overallClickRate: 0.14,
  totalMessages: 198,
}

// ── Sequence Chain Analytics (mock) ──

export const mockSequenceAnalytics = {
  summary: {
    activeSequences: 12,
    completedSequences: 34,
    exitedSequences: 8,
    avgStepsCompleted: 2.1,
  },
  byType: [
    { type: 'WATCH', active: 5, completed: 18, exited: 3 },
    { type: 'AT_RISK', active: 4, completed: 12, exited: 3 },
    { type: 'CRITICAL', active: 3, completed: 4, exited: 2 },
  ],
  byStep: [
    { step: 0, count: 54, openRate: 0.42 },
    { step: 1, count: 38, openRate: 0.35 },
    { step: 2, count: 22, openRate: 0.28 },
    { step: 3, count: 14, openRate: 0.31 },
  ],
  exitReasons: [
    { reason: 'booked', count: 18, label: 'Booked Session' },
    { reason: 'health_improved', count: 8, label: 'Health Improved' },
    { reason: 'max_steps', count: 12, label: 'Sequence Complete' },
    { reason: 'opted_out', count: 3, label: 'Opted Out' },
    { reason: 'bounced', count: 1, label: 'Bounced / Spam' },
  ],
  recentSequences: [
    { userId: 'u1', userName: 'Maria Santos', type: 'WATCH', currentStep: 2, startedAt: fmt(-8), lastStepAt: fmt(-1), status: 'active' as const },
    { userId: 'u2', userName: 'James Wilson', type: 'AT_RISK', currentStep: 3, startedAt: fmt(-12), lastStepAt: fmt(-2), status: 'completed' as const },
    { userId: 'u3', userName: 'Sarah Chen', type: 'CRITICAL', currentStep: 1, startedAt: fmt(-3), lastStepAt: fmt(-1), status: 'active' as const },
    { userId: 'u4', userName: 'Mike Torres', type: 'WATCH', currentStep: 3, startedAt: fmt(-15), lastStepAt: fmt(-4), status: 'completed' as const },
    { userId: 'u5', userName: 'Lisa Park', type: 'AT_RISK', currentStep: 2, startedAt: fmt(-6), lastStepAt: fmt(-0.5), status: 'active' as const },
    { userId: 'u6', userName: 'Tom Bradley', type: 'CRITICAL', currentStep: 1, startedAt: fmt(-5), lastStepAt: fmt(-3), status: 'exited' as const },
    { userId: 'u7', userName: 'Ana Rodriguez', type: 'WATCH', currentStep: 1, startedAt: fmt(-2), lastStepAt: fmt(-0.3), status: 'active' as const },
    { userId: 'u8', userName: 'David Kim', type: 'AT_RISK', currentStep: 3, startedAt: fmt(-18), lastStepAt: fmt(-6), status: 'exited' as const },
  ],
}

// ── Weekly AI Summary (mock) ──

export const mockWeeklySummary = {
  executiveSummary: 'Strong week overall with 62% average occupancy (+4% vs last week). The campaign engine sent 23 personalized messages, and 3 at-risk members booked sessions after receiving retention outreach.',
  wins: [
    'Average health score improved from 68 to 72 (+5.9%)',
    'Tuesday evening Open Play hit 100% capacity for the 3rd straight week',
    'LLM-generated messages outperformed templates by 43% on click rate',
    '3 members re-engaged after retention campaigns',
  ],
  risks: [
    '4 members moved from Watch to At-Risk this week (up from 2 last week)',
    'Saturday morning clinic running at only 33% capacity',
    'Email bounce rate spiked to 4.2% — check for stale addresses',
  ],
  actionsTaken: [
    'Sent 14 check-in messages to Watch-level members',
    'Sent 9 retention boost messages to At-Risk members',
    'Auto-selected "Social Proof (LLM)" variant as best performer (53% open rate)',
    'Started 5 new sequence chains for declining members',
  ],
  keyNumbers: [
    { label: 'Avg Health Score', thisWeek: 72, lastWeek: 68, changePercent: 5.9, direction: 'up' as const },
    { label: 'Occupancy', thisWeek: '62%', lastWeek: '58%', changePercent: 6.9, direction: 'up' as const },
    { label: 'Messages Sent', thisWeek: 23, lastWeek: 19, changePercent: 21.1, direction: 'up' as const },
    { label: 'Open Rate', thisWeek: '41%', lastWeek: '38%', changePercent: 7.9, direction: 'up' as const },
    { label: 'At-Risk Members', thisWeek: 9, lastWeek: 7, changePercent: 28.6, direction: 'up' as const },
    { label: 'New Members', thisWeek: 3, lastWeek: 2, changePercent: 50, direction: 'up' as const },
  ],
  generatedAt: new Date().toISOString(),
  weekLabel: 'Mar 2 – Mar 8, 2026',
}

// ── Growth engines (shipped 2026-04: Smart First Session / Guest Trial /
// Win-Back / Referral). These tiles render in MembersIQ + CampaignsIQ.
// Mocks are intentionally lightweight — shape covers what the UI reads,
// not the full engine output, so the demo stays snappy. ──

export const mockSmartFirstSession = {
  summary: {
    totalCandidates: 14,
    firstBookingCount: 8,
    secondSessionCount: 4,
    conversionReadyCount: 2,
    averageScore: 71,
    summary: '14 newcomers in-window. 8 still need their first booking, 4 have played once and need a habit-building second session, 2 are ready for a paid next step.',
    funnel: {
      newcomerCount: 22,
      firstBookedCount: 14,
      secondBookedCount: 6,
      paidMemberCount: 2,
      firstBookingRate: 64,
      secondSessionRate: 43,
      paidConversionRate: 14,
      summary: 'Habit-forming second session is the tightest gate — 43% of first-timers never come back.',
    },
  },
  candidates: [
    {
      memberId: 'demo-sfs-1', name: 'Emily Carter', email: 'emily@example.com',
      score: 82, stage: 'book_first_session' as const, urgency: 'high' as const,
      daysSinceJoined: 6, daysSinceFirstBooking: null, confirmedBookings: 0,
      normalizedMembershipType: 'trial', normalizedMembershipStatus: 'trial',
      topReason: 'Joined 6 days ago, followed the club, has not booked yet.',
      nextBestMove: 'Send a one-tap booking link to a beginner-friendly Open Play this Thursday.',
    },
    {
      memberId: 'demo-sfs-2', name: 'Ryan Patel', email: 'ryan@example.com',
      score: 74, stage: 'book_second_session' as const, urgency: 'medium' as const,
      daysSinceJoined: 11, daysSinceFirstBooking: 4, confirmedBookings: 1,
      normalizedMembershipType: 'trial', normalizedMembershipStatus: 'active',
      topReason: 'Played once 4 days ago, positive signal — build the habit.',
      nextBestMove: 'Invite to next week\'s Intermediate Drill with a free court-mate add-on.',
    },
    {
      memberId: 'demo-sfs-3', name: 'Sofia Nguyen', email: 'sofia@example.com',
      score: 65, stage: 'convert_after_first_session' as const, urgency: 'medium' as const,
      daysSinceJoined: 14, daysSinceFirstBooking: 8, confirmedBookings: 2,
      normalizedMembershipType: 'guest', normalizedMembershipStatus: 'active',
      topReason: 'Played twice, both confirmed — ready for a trial or starter bundle.',
      nextBestMove: 'Offer 3-session starter pack at 20% off (safe, reviewable).',
    },
  ],
  suggestedCohorts: [],
}

export const mockGuestTrialBooking = {
  summary: {
    totalCandidates: 9,
    firstBookingCount: 5,
    showUpProtectionCount: 3,
    paidConversionCount: 1,
    averageScore: 68,
    summary: '9 guests/trials in motion. 5 still haven\'t booked their first visit, 3 have a booking but need a show-up reminder, 1 is ready for the paid step.',
    offers: {
      firstVisit: { name: 'Free first visit', descriptor: 'Zero-friction trial', destinationDescriptor: 'Beginner Open Play' },
      showUpProtection: { name: 'Show-up concierge', descriptor: 'Reminder + court partner', destinationDescriptor: 'Booked session' },
      paidConversion: { name: 'Starter bundle', descriptor: '3-session pack, 20% off', destinationDescriptor: 'Paid conversion' },
    },
    offerLoop: [],
    routeLoop: [],
    funnel: {
      entrantCount: 12,
      bookedCount: 9,
      showedUpCount: 6,
      paidCount: 1,
      bookingRate: 75,
      showUpRate: 67,
      paidConversionRate: 11,
      summary: '3 of 9 booked guests haven\'t shown yet — show-up protection is the bottleneck.',
    },
  },
  candidates: [
    {
      memberId: 'demo-gtb-1', name: 'Priya Desai', email: 'priya@example.com',
      score: 78, stage: 'book_first_visit' as const, urgency: 'high' as const,
      daysSinceJoined: 4, daysUntilNextBooking: null, daysSinceFirstPlayed: null,
      confirmedBookings: 0, playedConfirmedBookings: 0,
      normalizedMembershipType: 'guest', normalizedMembershipStatus: 'guest',
      recommendedOffer: { key: 'first_visit', name: 'Free first visit', kind: 'free_trial', descriptor: 'Zero-friction trial', destinationDescriptor: 'Beginner Open Play' },
      topReason: 'New guest, no booking yet — hottest acquisition moment.',
      nextBestMove: 'Invite to Saturday beginner Open Play with a one-tap book link.',
    },
    {
      memberId: 'demo-gtb-2', name: 'Marcus Hale', email: 'marcus@example.com',
      score: 72, stage: 'protect_first_show_up' as const, urgency: 'high' as const,
      daysSinceJoined: 7, daysUntilNextBooking: 2, daysSinceFirstPlayed: null,
      confirmedBookings: 1, playedConfirmedBookings: 0,
      normalizedMembershipType: 'trial', normalizedMembershipStatus: 'trial',
      recommendedOffer: { key: 'show_up', name: 'Show-up concierge', kind: 'reminder', descriptor: 'Reminder + court partner', destinationDescriptor: 'Booked session' },
      topReason: 'Booked for Tuesday, 2 days out — first-timers no-show at 33%.',
      nextBestMove: 'Send match-me-with-a-partner message 24h before session.',
    },
  ],
}

export const mockWinBackSnapshot = {
  summary: {
    totalCandidates: 11,
    expiredCount: 4,
    cancelledCount: 2,
    lapsedCount: 5,
    averageScore: 64,
    summary: '11 former regulars are ripe for a win-back nudge. 4 expired memberships, 2 cancelled, 5 high-value lapsed (still members, just quiet for 30+ days).',
    laneLoop: [],
  },
  candidates: [
    {
      memberId: 'demo-wb-1', name: 'Daniel Rivera', email: 'daniel@example.com',
      score: 79, stage: 'high_value_lapsed' as const, urgency: 'high' as const,
      daysSinceLastBooking: 34, confirmedBookings: 24,
      normalizedMembershipType: 'full', normalizedMembershipStatus: 'active',
      topReason: '24 confirmed sessions then silent for 34 days — top-quartile value at risk.',
      nextBestMove: 'Personal check-in from club owner with a guest pass for a playing partner.',
    },
    {
      memberId: 'demo-wb-2', name: 'Hannah Lee', email: 'hannah@example.com',
      score: 71, stage: 'expired_membership' as const, urgency: 'medium' as const,
      daysSinceLastBooking: 52, confirmedBookings: 18,
      normalizedMembershipType: 'full', normalizedMembershipStatus: 'expired',
      topReason: 'Membership lapsed 3 weeks ago, strong historical engagement.',
      nextBestMove: 'Offer 14-day reactivation at membership rate before renewing full-price.',
    },
  ],
}

export const mockReferralSnapshot = {
  summary: {
    totalCandidates: 7,
    vipAdvocateCount: 2,
    socialRegularCount: 4,
    dormantAdvocateCount: 1,
    averageScore: 73,
    summary: '7 members meet the referral gate (≥4 bookings, ≥2 co-players). 2 VIPs, 4 social regulars, 1 dormant advocate still connected to active co-players.',
    offers: {
      vipAdvocate: { key: 'vip_share', name: 'VIP friend pass', descriptor: 'Gift a month of unlimited', destinationDescriptor: 'Friend joins as member' },
      socialRegular: { key: 'social_pair', name: 'Bring-a-friend credit', descriptor: '$25 credit per booked friend', destinationDescriptor: 'Friend books first session' },
      dormantAdvocate: { key: 'reconnect', name: 'Reconnect rally', descriptor: 'Invite their co-players to a social session', destinationDescriptor: 'Rally attendance' },
    },
    laneLoop: [],
    offerLoop: [],
    routeLoop: [],
    outcomeFunnel: {
      askCount: 0, engagedCount: 0, intentCount: 0, strongSignalCount: 0,
      engagementRate: 0, intentRate: 0, strongSignalRate: 0,
      summary: 'No asks sent yet in the current window — mock demo state.',
    },
    outcomeLoop: [],
    rewardSummary: '0 rewards issued in demo window.',
    rewardLoop: [],
  },
  candidates: [
    {
      memberId: 'demo-ref-1', name: 'Alex Thompson', email: 'alex@example.com',
      score: 86, lane: 'vip_advocate' as const, urgency: 'high' as const,
      daysSinceLastBooking: 3, confirmedBookings: 42, recentConfirmedBookings: 12,
      activeCoPlayers: 8, totalCoPlayers: 14,
      normalizedMembershipType: 'full', normalizedMembershipStatus: 'active',
      recommendedOffer: { key: 'vip_share', name: 'VIP friend pass', descriptor: 'Gift a month of unlimited', destinationDescriptor: 'Friend joins as member' },
      topReason: '42 lifetime sessions, 12 recent, 8 active co-players — textbook VIP advocate.',
      nextBestMove: 'Ask directly: "Who of your regular partners would you bring on us?"',
    },
    {
      memberId: 'demo-ref-2', name: 'Jamie Ortiz', email: 'jamie@example.com',
      score: 68, lane: 'social_regular' as const, urgency: 'medium' as const,
      daysSinceLastBooking: 5, confirmedBookings: 11, recentConfirmedBookings: 5,
      activeCoPlayers: 4, totalCoPlayers: 6,
      normalizedMembershipType: 'full', normalizedMembershipStatus: 'active',
      recommendedOffer: { key: 'social_pair', name: 'Bring-a-friend credit', descriptor: '$25 credit per booked friend', destinationDescriptor: 'Friend books first session' },
      topReason: 'Consistent social player — bring-a-friend credit has highest lift for this segment.',
      nextBestMove: 'Email $25 credit offer with a link they can forward.',
    },
  ],
  referredGuests: [],
  rewardIssuances: [],
  rewardLedger: [],
}

// ── AI Revenue Attribution — the YC-pitch "money metric" ──
// Honest framing: what we can link from AI touches to subsequent bookings,
// plus a conservative 20% incremental lift estimate. Mock numbers match
// a club with healthy but not unrealistic AI-driven bookings (~180/mo).
export const mockAIRevenueAttribution = {
  liveMode: true,
  periodStart: fmt(-30),
  periodEnd: fmt(0),
  days: 30,
  attributedRevenueUsd: 4320,
  attributedBookingsCount: 182,
  conservativeIncrementalUsd: 864,
  aiSpendUsd: 47.2,
  roiMultiple: 91.5,
  byType: [
    { type: 'SLOT_FILLER', bookings: 84, revenueUsd: 1890 },
    { type: 'REACTIVATION', bookings: 52, revenueUsd: 1170 },
    { type: 'CHECK_IN', bookings: 28, revenueUsd: 630 },
    { type: 'EVENT_INVITE', bookings: 12, revenueUsd: 405 },
    { type: 'RETENTION_BOOST', bookings: 6, revenueUsd: 225 },
  ],
  byMethod: {
    deep_link: { bookings: 64, revenueUsd: 1512 },
    direct_session_match: { bookings: 72, revenueUsd: 1620 },
    time_window: { bookings: 46, revenueUsd: 1188 },
  },
  dailyTrend: Array.from({ length: 30 }, (_, i) => ({
    date: fmt(-30 + i).slice(0, 10),
    bookings: 4 + Math.round(Math.sin(i / 3) * 2 + Math.random() * 3),
    revenueUsd: 90 + Math.round(Math.sin(i / 3) * 40 + Math.random() * 60),
  })),
}

// ── Programming IQ — weekly schedule grid ──
// Used when ?demo=true. Shows a realistic mix of kept live sessions,
// suggested AI cells (with scoring rationale), and a couple of
// saturation warnings so admin can see the full UX. Matches the 7-signal
// output produced by `buildWeeklyGrid()` — each suggested cell gets a
// rationale array that the CellEditPopover displays verbatim.

const MOCK_DEMO_CLUB_ID = 'demo-club'

const DEMO_COURTS = [
  { id: 'demo-court-1', name: 'Court 1', isIndoor: false, isActive: true },
  { id: 'demo-court-2', name: 'Court 2', isIndoor: true, isActive: true },
  { id: 'demo-court-3', name: 'Court 3', isIndoor: false, isActive: true },
]

// Resolve the Monday-based date for a given day offset inside the target
// week (Monday=0, Tuesday=1, ...). weekStart is the Monday ISO string.
function dateFromWeek(weekStart: string, dayOffset: number): Date {
  const d = new Date(weekStart)
  d.setDate(d.getDate() + dayOffset)
  d.setHours(12, 0, 0, 0)
  return d
}

export function mockProgrammingGrid(weekStartDate: string) {
  // A handful of "already on the calendar" sessions — Programming IQ shows
  // these as read-only live cells so admins see what exists before
  // layering new suggestions on top.
  const liveSessions = [
    {
      id: 'demo-live-tues-clinic', clubId: MOCK_DEMO_CLUB_ID,
      courtId: 'demo-court-2',
      date: dateFromWeek(weekStartDate, 1), // Tuesday
      startTime: '18:00', endTime: '19:30',
      title: 'Intermediate Clinic',
      format: 'CLINIC', skillLevel: 'INTERMEDIATE',
      maxPlayers: 6, registeredCount: 6,
    },
    {
      id: 'demo-live-sat-league', clubId: MOCK_DEMO_CLUB_ID,
      courtId: 'demo-court-1',
      date: dateFromWeek(weekStartDate, 5), // Saturday
      startTime: '09:00', endTime: '10:30',
      title: '4.0 League',
      format: 'LEAGUE_PLAY', skillLevel: 'ADVANCED',
      maxPlayers: 8, registeredCount: 8,
    },
  ]

  // Suggestions — ordered by demand score so the top cell is the
  // strongest recommendation. Rationale mirrors
  // `buildAdvisorProgrammingPlan` output against real club data.
  const drafts = [
    {
      id: 'demo-d1', clubId: MOCK_DEMO_CLUB_ID,
      courtId: 'demo-court-1',
      dayOfWeek: 'Saturday', startTime: '10:30', endTime: '12:00',
      title: '4.0 League (overflow)',
      format: 'LEAGUE_PLAY', skillLevel: 'ADVANCED',
      maxPlayers: 8, confidence: 87, projectedOccupancy: 92,
      estimatedInterestedMembers: 22,
      status: 'READY_FOR_OPS', origin: 'programming_iq',
      metadata: {
        weekStartDate,
        rationale: [
          '9 unmet interest requests for Saturday 4.0 league',
          '95% historical fill at this slot (8 past sessions)',
          '22 members match Advanced + weekend preference',
        ],
        warnings: [],
      },
    },
    {
      id: 'demo-d2', clubId: MOCK_DEMO_CLUB_ID,
      courtId: 'demo-court-2',
      dayOfWeek: 'Tuesday', startTime: '19:30', endTime: '21:00',
      title: 'Intermediate Open Play',
      format: 'OPEN_PLAY', skillLevel: 'INTERMEDIATE',
      maxPlayers: 8, confidence: 78, projectedOccupancy: 85,
      estimatedInterestedMembers: 31,
      status: 'READY_FOR_OPS', origin: 'programming_iq',
      metadata: {
        weekStartDate,
        rationale: [
          '85% historical fill at Tuesday 7pm Intermediate',
          '31 members match Intermediate + evening preference',
          'Indoor court preferred — 92% match rate',
        ],
        warnings: [],
      },
    },
    {
      id: 'demo-d3', clubId: MOCK_DEMO_CLUB_ID,
      courtId: 'demo-court-3',
      dayOfWeek: 'Thursday', startTime: '19:00', endTime: '20:30',
      title: 'Intermediate Drill',
      format: 'DRILL', skillLevel: 'INTERMEDIATE',
      maxPlayers: 6, confidence: 71, projectedOccupancy: 72,
      estimatedInterestedMembers: 14,
      status: 'READY_FOR_OPS', origin: 'programming_iq',
      metadata: {
        weekStartDate,
        rationale: [
          '60% historical fill (8 past sessions)',
          '14 improver-persona members match',
          'Spreads Intermediate load across the week',
        ],
        warnings: [
          'Saturated: Intermediate pool of 47 would see ~2.8 invites/week.',
        ],
      },
    },
    {
      id: 'demo-d4', clubId: MOCK_DEMO_CLUB_ID,
      courtId: 'demo-court-3',
      dayOfWeek: 'Wednesday', startTime: '18:30', endTime: '20:00',
      title: 'Beginner Clinic',
      format: 'CLINIC', skillLevel: 'BEGINNER',
      maxPlayers: 6, confidence: 64, projectedOccupancy: 58,
      estimatedInterestedMembers: 8,
      status: 'READY_FOR_OPS', origin: 'programming_iq',
      metadata: {
        weekStartDate,
        rationale: [
          '3 unmet interest requests for "beginner clinic weekday"',
          'Improver persona — 31% of club',
          '12 Beginner members available in pool',
        ],
        warnings: [],
      },
    },
    {
      id: 'demo-d5', clubId: MOCK_DEMO_CLUB_ID,
      courtId: 'demo-court-2',
      dayOfWeek: 'Friday', startTime: '19:00', endTime: '20:30',
      title: 'Social Open Play',
      format: 'SOCIAL', skillLevel: 'ALL_LEVELS',
      maxPlayers: 8, confidence: 58, projectedOccupancy: 62,
      estimatedInterestedMembers: 18,
      status: 'READY_FOR_OPS', origin: 'programming_iq',
      metadata: {
        weekStartDate,
        rationale: [
          'Social persona 42% — favours Friday evening mixers',
          '68% of members prefer evening',
          'Indoor court — evening slot',
        ],
        warnings: [],
      },
    },
    {
      id: 'demo-d6', clubId: MOCK_DEMO_CLUB_ID,
      courtId: 'demo-court-1',
      dayOfWeek: 'Monday', startTime: '19:00', endTime: '20:30',
      title: 'Intermediate Open Play',
      format: 'OPEN_PLAY', skillLevel: 'INTERMEDIATE',
      maxPlayers: 8, confidence: 62, projectedOccupancy: 68,
      estimatedInterestedMembers: 25,
      status: 'READY_FOR_OPS', origin: 'programming_iq',
      metadata: {
        weekStartDate,
        rationale: [
          '25 members match Intermediate + evening',
          'Kicks the week off with a high-demand slot',
        ],
        warnings: [],
      },
    },
  ]

  return {
    courts: DEMO_COURTS,
    liveSessions,
    drafts,
  }
}

export function mockProgrammingGenerationResult() {
  return {
    generationId: 'demo-gen-' + Date.now(),
    cells: [],
    stats: {
      liveKept: 2,
      suggested: 6,
      empty: 0,
      conflicts: 0,
      saturations: 1,
      avgProjectedOccupancy: 72,
    },
    insights: [
      'Saturday 4.0 league is your strongest signal — 9 unmet requests + 95% historical fill.',
      'Intermediate evening sessions risk pool saturation at current caps.',
      'Consider replacing Wed 6am Advanced slots — 0 historical demand.',
    ],
    signalSummary: {
      monthsOfBookingData: 2,
      preferencesCount: 89,
      unmetInterestRequests: 14,
      activeCourts: 3,
    },
    draftCount: 6,
  }
}
