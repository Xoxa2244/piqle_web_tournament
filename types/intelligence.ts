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

export interface ReactivationCandidate {
  member: MemberData;
  daysSinceLastActivity: number;
  totalHistoricalBookings: number;
  score: number;
  reasoning: RecommendationScore;
  suggestedSessions: PlaySessionData[];
}

export interface RebookingSuggestion {
  session: PlaySessionData;
  score: number;
  reasoning: RecommendationScore;
  matchReason: string;
}
