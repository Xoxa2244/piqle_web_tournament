/**
 * CourtReserve API HTTP Client.
 * Handles Basic Auth, pagination, rate limiting, and error handling.
 * API docs: https://api.courtreserve.com/swagger/docs/ORGANIZATION
 *
 * All responses wrapped in: { ErrorMessage, Data, IsSuccessStatusCode }
 */
import type {
  CRMember,
  CRCourt,
  CRReservation,
  CRAttendance,
  CREvent,
  CREventRegistration,
} from './courtreserve-types'

const DEFAULT_BASE_URL = 'https://api.courtreserve.com'
const REQUEST_TIMEOUT_MS = 30_000
const MAX_PAGE_SIZE = 100
const MAX_DATE_RANGE_DAYS = 31

interface CRResponse<T> {
  ErrorMessage: string | null
  Data: T
  IsSuccessStatusCode: boolean
}

export class CourtReserveClient {
  private authHeader: string
  private baseUrl: string

  constructor(username: string, password: string, baseUrl?: string) {
    this.authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')
    this.baseUrl = (baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '')
  }

  // ── Private helpers ──

  private async request<T>(path: string, params?: Record<string, string>): Promise<T> {
    const fullUrl = this.baseUrl + (path.startsWith('/') ? path : '/' + path)
    const url = new URL(fullUrl)
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== '') url.searchParams.set(k, v)
      }
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Authorization: this.authHeader,
          Accept: 'application/json',
        },
        signal: controller.signal,
      })

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('Retry-After') || '60', 10)
        throw new CourtReserveError(`Rate limited. Retry after ${retryAfter}s`, 429)
      }

      if (res.status === 401) {
        throw new CourtReserveError('Invalid API credentials', 401)
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new CourtReserveError(`API error: ${res.status} ${text}`, res.status)
      }

      const json = await res.json()

      // CR wraps everything in { ErrorMessage, Data, IsSuccessStatusCode }
      if (json && typeof json === 'object' && 'Data' in json) {
        if (json.ErrorMessage) {
          throw new CourtReserveError(`CR API: ${json.ErrorMessage}`, 400)
        }
        return json.Data as T
      }

      return json as T
    } finally {
      clearTimeout(timeout)
    }
  }

  /** Split a date range into 31-day windows (CR API limit) */
  private dateWindows(from: Date, to: Date): { from: string; to: string }[] {
    const windows: { from: string; to: string }[] = []
    let current = new Date(from)
    while (current < to) {
      const windowEnd = new Date(current)
      windowEnd.setDate(windowEnd.getDate() + MAX_DATE_RANGE_DAYS - 1)
      const end = windowEnd > to ? to : windowEnd
      windows.push({
        from: current.toISOString().split('T')[0],
        to: end.toISOString().split('T')[0],
      })
      current = new Date(end)
      current.setDate(current.getDate() + 1)
    }
    return windows
  }

  // ── Public API ──

  /** Test connection — try to fetch courts as a lightweight check */
  async testConnection(): Promise<{ ok: boolean; courtCount?: number; error?: string }> {
    try {
      const courts = await this.getCourts()
      return { ok: true, courtCount: courts.length }
    } catch (err: any) {
      return { ok: false, error: err.message || 'Connection failed' }
    }
  }

  /** Get all courts */
  async getCourts(): Promise<CRCourt[]> {
    const data = await this.request<any[]>('/api/v1/reservation/courts')
    return (data || []).map(c => ({
      id: String(c.Id || c.id),
      name: c.Label || c.label || c.Name || c.name || 'Court',
      courtType: c.TypeName || c.typeName || 'Unknown',
      isIndoor: c.IsIndoor ?? c.isIndoor,
      isActive: true,
    }))
  }

  /** Get members with pagination */
  async getMembers(opts: {
    page?: number
    pageSize?: number
    createdFrom?: string
    updatedFrom?: string
  } = {}): Promise<{ items: CRMember[]; totalCount: number }> {
    const params: Record<string, string> = {
      pageNumber: String(opts.page || 1),
      pageSize: String(opts.pageSize || MAX_PAGE_SIZE),
      includeRatings: 'true',
    }
    if (opts.createdFrom) params.createdDateTimeStart = opts.createdFrom
    if (opts.updatedFrom) params.createdOrUpdatedFrom = opts.updatedFrom

    const data = await this.request<any>('/api/v1/member/get', params)

    // CR returns { TotalPages, PageSize, Members[], PageNumber }
    const members = (data?.Members || data?.items || []).map(mapCRMember)
    const totalPages = data?.TotalPages || 1
    const pageSize = data?.PageSize || opts.pageSize || MAX_PAGE_SIZE
    const totalCount = totalPages * pageSize

    return { items: members, totalCount }
  }

  /** Get all members (auto-paginate) */
  async getAllMembers(opts: { updatedFrom?: string } = {}): Promise<CRMember[]> {
    const all: CRMember[] = []
    let page = 1
    let hasMore = true

    while (hasMore) {
      const result = await this.getMembers({
        page,
        pageSize: MAX_PAGE_SIZE,
        updatedFrom: opts.updatedFrom,
      })
      all.push(...result.items)
      hasMore = result.items.length === MAX_PAGE_SIZE
      page++
    }

    return all
  }

  /** Get active reservations for a date range */
  async getActiveReservations(from: Date, to: Date): Promise<CRReservation[]> {
    const all: CRReservation[] = []
    for (const window of this.dateWindows(from, to)) {
      const data = await this.request<any[]>(
        '/api/v1/reservationreport/listactive',
        { reservationsFromDate: window.from, reservationsToDate: window.to }
      )
      if (Array.isArray(data)) all.push(...data.map(mapCRReservation))
    }
    return all
  }

  /** Get cancelled reservations for a date range */
  async getCancelledReservations(from: Date, to: Date): Promise<CRReservation[]> {
    const all: CRReservation[] = []
    for (const window of this.dateWindows(from, to)) {
      const data = await this.request<any[]>(
        '/api/v1/reservationreport/listcancelled',
        { reservationsFromDate: window.from, reservationsToDate: window.to }
      )
      if (Array.isArray(data)) all.push(...data.map(mapCRReservation))
    }
    return all
  }

  /** Get detailed attendance records */
  async getAttendance(from: Date, to: Date): Promise<CRAttendance[]> {
    const all: CRAttendance[] = []
    for (const window of this.dateWindows(from, to)) {
      const data = await this.request<any[]>(
        '/api/v1/attendancereport/detailed',
        { reservationsFromDate: window.from, reservationsToDate: window.to }
      )
      if (Array.isArray(data)) all.push(...data)
    }
    return all
  }

  /** Get events list */
  async getEvents(from: Date, to: Date): Promise<CREvent[]> {
    const data = await this.request<any[]>('/api/v1/eventcalendar/eventlist', {
      startDate: from.toISOString().split('T')[0],
      endDate: to.toISOString().split('T')[0],
    })
    return Array.isArray(data) ? data : []
  }

  /** Get active event registrations */
  async getEventRegistrations(from: Date, to: Date): Promise<CREventRegistration[]> {
    const all: CREventRegistration[] = []
    for (const window of this.dateWindows(from, to)) {
      const data = await this.request<any[]>(
        '/api/v1/eventregistrationreport/listactive',
        { startDate: window.from, endDate: window.to }
      )
      if (Array.isArray(data)) all.push(...data)
    }
    return all
  }

  /** Get cancelled event registrations */
  async getCancelledEventRegistrations(from: Date, to: Date): Promise<CREventRegistration[]> {
    const all: CREventRegistration[] = []
    for (const window of this.dateWindows(from, to)) {
      const data = await this.request<any[]>(
        '/api/v1/eventregistrationreport/listcancelled',
        { startDate: window.from, endDate: window.to }
      )
      if (Array.isArray(data)) all.push(...data)
    }
    return all
  }

  /** Get transactions */
  async getTransactions(from: Date, to: Date): Promise<any[]> {
    const all: any[] = []
    for (const window of this.dateWindows(from, to)) {
      const data = await this.request<any[]>(
        '/api/v1/transactions/list',
        { startDate: window.from, endDate: window.to }
      )
      if (Array.isArray(data)) all.push(...data)
    }
    return all
  }

  /** Get revenue recognition */
  async getRevenue(from: Date, to: Date): Promise<any[]> {
    const all: any[] = []
    for (const window of this.dateWindows(from, to)) {
      const data = await this.request<any[]>(
        '/api/v1/revenuerecognition/list',
        { startDate: window.from, endDate: window.to }
      )
      if (Array.isArray(data)) all.push(...data)
    }
    return all
  }

  /** Get who is here today */
  async getWhoIsHereToday(date?: string): Promise<any[]> {
    const d = date || new Date().toISOString().split('T')[0]
    const data = await this.request<any[]>(
      '/api/v1/reservationreport/whoisheretoday',
      { date: d }
    )
    return Array.isArray(data) ? data : []
  }

  /** Get membership types */
  async getMembershipTypes(): Promise<any[]> {
    const data = await this.request<any[]>('/api/v1/membershiptype/get')
    return Array.isArray(data) ? data : []
  }
}

// ── Field mappers (CR PascalCase → our camelCase) ──

function mapCRMember(raw: any): CRMember {
  return {
    organizationMemberId: String(raw.OrganizationMemberId || raw.organizationMemberId || ''),
    email: raw.Email || raw.email || '',
    firstName: raw.FirstName || raw.firstName,
    lastName: raw.LastName || raw.lastName,
    phonenumber: raw.PhoneNumber || raw.phoneNumber,
    gender: raw.Gender || raw.gender,
    city: raw.City || raw.city,
    state: raw.State || raw.state,
    zipCode: raw.ZipCode || raw.zipCode,
    dateOfBirth: raw.DateOfBirth || raw.dateOfBirth,
    membershipTypeName: raw.MembershipTypeName || raw.membershipTypeName,
    membershipStatus: raw.MembershipStatus || raw.membershipStatus,
    skillLevel: raw.Ratings?.[0]?.ValueRatingName || raw.ratings?.[0]?.ratingValue,
    ratings: (raw.Ratings || raw.ratings || []).map((r: any) => ({
      ratingTypeName: r.CategoryName || r.ratingTypeName || '',
      ratingValue: parseFloat(r.ValueRatingName || r.ratingValue || '0') || 0,
    })),
    userDefinedFields: raw.UserDefinedFields || raw.userDefinedFields,
    createdDateTime: raw.MembershipStartDate || raw.createdDateTime,
    updatedDateTime: raw.UpdatedOnUtc || raw.updatedDateTime,
  }
}

function mapCRReservation(raw: any): CRReservation {
  return {
    reservationId: String(raw.Id || raw.reservationId || ''),
    courtId: String(raw.Id || ''),
    courtName: raw.Courts || raw.courtName,
    reservationDate: (raw.StartTime || raw.reservationDate || '').split('T')[0],
    startTime: raw.StartTime || raw.startTime || '',
    endTime: raw.EndTime || raw.endTime || '',
    reservationType: raw.ReservationTypeName || raw.reservationType,
    members: (raw.Players || raw.members || []).map((p: any) => ({
      organizationMemberId: String(p.OrganizationMemberId || p.organizationMemberId || ''),
      memberName: [p.FirstName || p.firstName, p.LastName || p.lastName].filter(Boolean).join(' '),
      email: p.Email || p.email,
    })),
    isCancelled: !!raw.CancelledOn || raw.isCancelled || false,
    cancelledDate: raw.CancelledOn || raw.cancelledDate,
  }
}

export class CourtReserveError extends Error {
  statusCode: number
  constructor(message: string, statusCode: number) {
    super(message)
    this.name = 'CourtReserveError'
    this.statusCode = statusCode
  }
}
