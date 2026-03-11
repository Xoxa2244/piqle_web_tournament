// ====== Enums (mirroring Prisma) ======
export type PlaySessionFormat = 'OPEN_PLAY' | 'CLINIC' | 'DRILL' | 'LEAGUE_PLAY' | 'SOCIAL';
export type PlaySessionSkillLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'ALL_LEVELS';
export type PlaySessionStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type BookingStatus = 'CONFIRMED' | 'CANCELLED' | 'NO_SHOW';
export type WaitlistEntryStatus = 'ACTIVE' | 'PROMOTED' | 'EXPIRED';
export type AIRecommendationType = 'WEEKLY_PLAN' | 'SLOT_FILLER' | 'REACTIVATION' | 'REBOOKING';
export type TimeSlot = 'morning' | 'afternoon' | 'evening';
export type DayOfWeek = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';

// ====== Core Data Types ======
export interface ClubCourtData {
  id: string;
  clubId: string;
  name: string;
  surface: string | null;
  isIndoor: boolean;
  isActive: boolean;
}

export interface PlaySessionData {
  id: string;
  clubId: string;
  clubCourtId: string | null;
  clubCourt?: ClubCourtData | null;
  title: string;
  description: string | null;
  format: PlaySessionFormat;
  skillLevel: PlaySessionSkillLevel;
  date: Date;
  startTime: string; // "HH:MM"
  endTime: string;
  maxPlayers: number;
  priceInCents: number | null;
  hostUserId: string | null;
  status: PlaySessionStatus;
  bookings?: PlaySessionBookingData[];
  _count?: { bookings: number };
  confirmedCount?: number;
}

export interface PlaySessionBookingData {
  id: string;
  playSessionId: string;
  userId: string;
  status: BookingStatus;
  bookedAt: Date;
  cancelledAt: Date | null;
  user?: MemberData;
}

export interface MemberData {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  gender: 'M' | 'F' | 'X' | null;
  city: string | null;
  duprRatingDoubles: number | null;
  duprRatingSingles: number | null;
}

export interface UserPlayPreferenceData {
  id: string;
  userId: string;
  clubId: string;
  preferredDays: DayOfWeek[];
  preferredTimeSlots: Record<TimeSlot, boolean>;
  skillLevel: PlaySessionSkillLevel;
  preferredFormats: PlaySessionFormat[];
  targetSessionsPerWeek: number;
  isActive: boolean;
}

export interface BookingHistory {
  totalBookings: number;
  bookingsLastWeek: number;
  bookingsLastMonth: number;
  daysSinceLastConfirmedBooking: number | null;
  cancelledCount: number;
  noShowCount: number;
  inviteAcceptanceRate: number;
}

// ====== AI Scoring Types ======
export interface ScoreComponent {
  score: number;    // 0-100
  weight: number;   // percentage weight
  explanation: string;
}

export interface RecommendationScore {
  score: number;    // 0-100 weighted total
  components: Record<string, ScoreComponent>;
  summary: string;
}

export interface SlotFillerRecommendation {
  member: MemberData;
  preference: UserPlayPreferenceData | null;
  score: number;
  reasoning: RecommendationScore;
  estimatedLikelihood: 'high' | 'medium' | 'low';
}

export interface WeeklyPlanSession {
  session: PlaySessionData;
  score: number;
  reasoning: RecommendationScore;
  occupancyPercent: number;
  spotsRemaining: number;
}

export interface WeeklyPlanResult {
  userId: string;
  clubId: string;
  targetSessions: number;
  recommendedSessions: WeeklyPlanSession[];
  generatedAt: Date;
  planSummary: string;
}

export type PlayerArchetype =
  | 'lapsed_regular'    // Was active (≥10 bookings), inactive 21-45d
  | 'fading_regular'    // Moderate activity (5-9 bookings), slowing down
  | 'ghost_newbie'      // 1-4 bookings, then disappeared
  | 'never_started'     // 0 bookings, signed up but never played
  | 'competitor'        // Has DUPR, was active, on pause
  | 'weekend_warrior'   // Plays only weekends, hasn't booked recently
  | 'flaky_player'      // High no-show rate (>15%)
  | 'social_butterfly'  // Prefers SOCIAL format, hasn't been around

export interface ReactivationCandidate {
  member: MemberData;
  daysSinceLastActivity: number;
  totalHistoricalBookings: number;
  score: number;
  reasoning: RecommendationScore;
  suggestedSessions: PlaySessionData[];
  // Hyper-personalized messaging data
  preference?: UserPlayPreferenceData | null;
  bookingHistory?: BookingHistory | null;
  archetype?: PlayerArchetype;
  // Last outreach tracking
  lastContactedAt?: string | null;
  lastContactChannel?: 'email' | 'sms' | null;
  lastContactStatus?: 'sent' | 'failed' | null;
}

export interface RebookingSuggestion {
  session: PlaySessionData;
  score: number;
  reasoning: RecommendationScore;
  matchReason: string;
}

// ====== Dashboard V2 Types ======
export interface TrendData {
  value: number;
  previousValue: number;
  changePercent: number; // +/- %
  direction: 'up' | 'down' | 'neutral';
  sparkline: number[];   // 7 daily data points
}

export interface DashboardMetricV2 {
  label: string;
  value: number | string;
  trend: TrendData;
  subtitle?: string;
  description?: string;  // tooltip help text
}

export interface OccupancyByDay {
  day: string;           // Mon, Tue, ...
  avgOccupancy: number;  // 0-100
  sessionCount: number;
}

export interface OccupancyByTimeSlot {
  slot: 'morning' | 'afternoon' | 'evening';
  avgOccupancy: number;
  sessionCount: number;
}

export interface OccupancyByFormat {
  format: PlaySessionFormat;
  avgOccupancy: number;
  sessionCount: number;
}

export interface SessionRanking {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  format: PlaySessionFormat;
  courtName: string | null;
  occupancyPercent: number;
  confirmedCount: number;
  maxPlayers: number;
}

export interface PlayerDistribution {
  label: string;
  count: number;
  percent: number;
}

export interface DashboardV2Data {
  metrics: {
    members: DashboardMetricV2;
    occupancy: DashboardMetricV2;
    lostRevenue: DashboardMetricV2;
    bookings: DashboardMetricV2;
  };
  occupancy: {
    byDay: OccupancyByDay[];
    byTimeSlot: OccupancyByTimeSlot[];
    byFormat: OccupancyByFormat[];
  };
  sessions: {
    topSessions: SessionRanking[];
    problematicSessions: SessionRanking[];
  };
  players: {
    bySkillLevel: PlayerDistribution[];
    byFormat: PlayerDistribution[];
    activeCount: number;
    inactiveCount: number;
    newThisMonth: number;
  };
}

// ====== Event Recommendation Types ======

export type EventType = 'Open Play' | 'Round Robin' | 'Clinic' | 'Drill' | 'League' | 'Ladder'

export interface MatchedPlayer {
  id: string           // member ID (uuid or 'csv-xxx')
  name: string
  dupr: number
  emoji: string        // 🔥⭐📈🆕🎯🤝
  lastPlayed: string   // "2 days ago" | "never at events"
  tournaments: number
}

export interface EventRecommendation {
  id: string
  type: EventType
  title: string
  emoji: string
  urgency: 'high' | 'medium' | 'low'
  reason: string
  suggestedDate: string
  suggestedTime: string
  courts: number
  format: string
  skillRange: string
  suggestedPrice: number
  maxPlayers: number
  matchedPlayers: MatchedPlayer[]
  projectedRevenue: number
  courtCost: number
  netRevenue: number
  fillConfidence: number
  insights: string[]
  leagueWeeks?: number     // 4 | 6 | 8 — only for League
  durationHours: number    // duration of a single session
}

export interface EventRecommendationsResult {
  events: EventRecommendation[]
  totalPlayersAnalyzed: number
  totalSessionsAnalyzed: number
  generatedAt: string
  needsCsvImport?: boolean
}

// ====== Sessions Calendar Types ======

export interface SessionRecommendation {
  type: 'swap_format' | 'adjust_time' | 'send_invites' | 'lower_price' | 'raise_price' | 'add_session' | 'cancel_consider'
  label: string
  reason: string
  priority: 'high' | 'medium' | 'low'
  actionLink?: string
}

export interface SessionCalendarItem {
  id: string
  date: string
  startTime: string
  endTime: string
  court: string
  format: string
  skillLevel: string
  registered: number
  capacity: number
  occupancy: number
  playerNames: string[]
  pricePerPlayer: number | null
  revenue: number | null
  lostRevenue: number | null
  status: 'past' | 'today' | 'upcoming'
  peerAvgOccupancy: number | null
  deviationFromPeer: number | null
  recommendations: SessionRecommendation[]
}

export interface SessionCalendarData {
  sessions: SessionCalendarItem[]
  summary: {
    totalSessions: number
    avgOccupancy: number
    totalRevenue: number
    totalLostRevenue: number
    upcomingCount: number
    pastCount: number
  }
  peerAverages: Record<string, { avgOccupancy: number; avgRevenue: number; count: number }>
}

// ====== Member Health & Lifecycle Types ======

export type LifecycleStage =
  | 'onboarding'   // tenure < 14 days
  | 'ramping'      // tenure 14-60 days
  | 'active'       // tenure 60+, healthScore >= 50
  | 'at_risk'      // healthScore 25-49
  | 'critical'     // healthScore < 25
  | 'churned'      // no booking 21+ days

export type RiskLevel = 'healthy' | 'watch' | 'at_risk' | 'critical'

export interface HealthScoreComponent {
  score: number       // 0-100
  weight: number      // percentage weight (e.g. 35 = 35%)
  label: string       // human-readable summary
}

export interface MemberHealthResult {
  memberId: string
  member: MemberData
  healthScore: number          // 0-100
  riskLevel: RiskLevel
  lifecycleStage: LifecycleStage
  components: {
    frequencyTrend: HealthScoreComponent
    recency: HealthScoreComponent
    consistency: HealthScoreComponent
    patternBreak: HealthScoreComponent
    noShowTrend: HealthScoreComponent
  }
  topRisks: string[]           // ["Missed usual Tuesday evening session", "Visit frequency down 35%"]
  suggestedAction: string      // "Send personalized invite for Thursday Open Play"
  trend: 'improving' | 'stable' | 'declining'
  daysSinceLastBooking: number | null
  totalBookings: number
  joinedDaysAgo: number
}

export interface MemberHealthSummary {
  total: number
  healthy: number
  watch: number
  atRisk: number
  critical: number
  avgHealthScore: number
  revenueAtRisk: number         // at-risk + critical members × avg subscription
  trendVsPrevWeek: number       // change in at-risk count vs last week
}

export interface MemberHealthData {
  members: MemberHealthResult[]
  summary: MemberHealthSummary
}

// ====== ML Feature Vector (for future ML model) ======

export interface MLFeatureVector {
  tenureMonths: number
  daysSinceLastBooking: number
  bookingsLast30d: number
  bookingsLast60d: number
  bookingsLast90d: number
  avgBookingsPerWeek: number
  frequencyChangePercent: number
  noShowRate: number
  cancellationRate: number
  hasPreferencesSet: boolean
  consistencyScore: number
  patternBreakCount: number
  churnedWithin30d?: boolean
  churnedWithin60d?: boolean
}
