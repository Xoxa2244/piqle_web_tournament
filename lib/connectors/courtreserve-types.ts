/**
 * CourtReserve API response types.
 * Based on https://api.courtreserve.com/swagger/docs/ORGANIZATION
 */

// ── Members ──

export interface CRMember {
  organizationMemberId: string
  email: string
  firstName?: string
  lastName?: string
  phonenumber?: string
  gender?: string
  city?: string
  state?: string
  zipCode?: string
  dateOfBirth?: string
  age?: number
  membershipTypeName?: string
  membershipStatus?: string
  skillLevel?: string
  ratings?: CRRating[]
  userDefinedFields?: Record<string, string>
  createdDateTime?: string
  updatedDateTime?: string
}

export interface CRRating {
  ratingTypeName: string
  ratingValue: number
}

export interface CRMemberListResponse {
  items: CRMember[]
  totalCount: number
  pageNumber: number
  pageSize: number
}

// ── Courts ──

export interface CRCourt {
  id: string | number
  name: string
  courtType?: string
  isIndoor?: boolean
  isActive?: boolean
}

// ── Reservations ──

export interface CRReservation {
  reservationId: string | number
  courtId: string | number
  courtName?: string
  reservationDate: string
  startTime: string
  endTime: string
  reservationType?: string
  members?: CRReservationMember[]
  isCancelled?: boolean
  cancelledDate?: string
}

export interface CRReservationMember {
  organizationMemberId: string
  memberName?: string
  email?: string
}

// ── Attendance ──

export interface CRAttendance {
  organizationMemberId: string
  memberName?: string
  checkInDateTime: string
  checkOutDateTime?: string
  courtName?: string
}

// ── Events ──

export interface CREvent {
  eventId: string | number
  title: string
  description?: string
  eventDate: string
  startTime: string
  endTime: string
  categoryName?: string
  maxRegistrations?: number
  currentRegistrations?: number
  price?: number
  courtName?: string
}

export interface CREventRegistration {
  organizationMemberId: string
  memberName?: string
  email?: string
  registrationDate: string
  status?: string
}

// ── Leagues (native CourtReserve League module) ──
// API: /api/v1/league/get, /sessions, /gamedays, /matchresults
// Hierarchy: League → Session → GameDay → Match

export interface CRLeague {
  id: string
  name: string
  description?: string
  sessions?: CRLeagueSession[]
}

export interface CRLeagueSession {
  id: string
  name?: string
  leagueId: string
  gameDays?: CRGameDay[]
  players?: CRLeaguePlayer[]
}

export interface CRLeaguePlayer {
  organizationMemberId: string
  firstName?: string
  lastName?: string
  email?: string
}

export interface CRGameDay {
  reservationId: string // game-day reservation id (unique session instance)
  leagueSessionId: string
  gameDate: string // ISO date-time (org-local)
  players?: CRGameDayPlayer[]
  matches?: CRMatchResult[]
}

export interface CRGameDayPlayer {
  organizationMemberId: string
  firstName?: string
  lastName?: string
  optedIn: boolean
}

export interface CRMatchResult {
  id: string // CR match result id
  gameDay: string // parent game-day reservation id
  side1Id?: number // match1PlayerId (player/team id)
  side2Id?: number // match2PlayerId
  side1Score?: number
  side2Score?: number
  players?: CRMatchPlayer[]
}

export interface CRMatchPlayer {
  organizationMemberId: string
  firstName?: string
  lastName?: string
  team?: number // 1 or 2
}

// ── Sync types ──

export interface SyncResult {
  courts: { created: number; updated: number; errors: number }
  members: { created: number; updated: number; matched: number; errors: number }
  sessions: { created: number; updated: number; errors: number }
  bookings: { created: number; updated: number; errors: number }
  totalErrors: number
  syncedAt: string
}

export interface SyncError {
  entity: 'court' | 'member' | 'session' | 'booking'
  externalId: string
  error: string
}
