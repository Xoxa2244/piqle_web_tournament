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
