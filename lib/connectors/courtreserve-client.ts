/**
 * CourtReserve API HTTP Client.
 * Handles Basic Auth, pagination, rate limiting, and error handling.
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

export class CourtReserveClient {
  private authHeader: string
  private baseUrl: string

  constructor(username: string, password: string, baseUrl?: string) {
    this.authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')
    this.baseUrl = (baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '')
  }

  // ── Private helpers ──

  private async request<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(path, this.baseUrl)
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

      return (await res.json()) as T
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
    return this.request<CRCourt[]>('/api/v1/reservation/courts')
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
    }
    if (opts.createdFrom) params.createdDateTimeStart = opts.createdFrom
    if (opts.updatedFrom) params.createdOrUpdatedFrom = opts.updatedFrom
    params.includeRatings = 'true'

    const result = await this.request<any>('/api/v1/member/get', params)

    // CR may return array or paginated object
    if (Array.isArray(result)) {
      return { items: result, totalCount: result.length }
    }
    return {
      items: result.items || result.data || [],
      totalCount: result.totalCount || result.total || 0,
    }
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
      hasMore = all.length < result.totalCount && result.items.length === MAX_PAGE_SIZE
      page++
    }

    return all
  }

  /** Get active reservations for a date range */
  async getActiveReservations(from: Date, to: Date): Promise<CRReservation[]> {
    const all: CRReservation[] = []
    for (const window of this.dateWindows(from, to)) {
      const result = await this.request<CRReservation[]>(
        '/api/v1/reservationreport/listactive',
        { reservationsFromDate: window.from, reservationsToDate: window.to }
      )
      if (Array.isArray(result)) all.push(...result)
    }
    return all
  }

  /** Get cancelled reservations for a date range */
  async getCancelledReservations(from: Date, to: Date): Promise<CRReservation[]> {
    const all: CRReservation[] = []
    for (const window of this.dateWindows(from, to)) {
      const result = await this.request<CRReservation[]>(
        '/api/v1/reservationreport/listcancelled',
        { reservationsFromDate: window.from, reservationsToDate: window.to }
      )
      if (Array.isArray(result)) all.push(...result)
    }
    return all
  }

  /** Get detailed attendance records */
  async getAttendance(from: Date, to: Date): Promise<CRAttendance[]> {
    const all: CRAttendance[] = []
    for (const window of this.dateWindows(from, to)) {
      const result = await this.request<CRAttendance[]>(
        '/api/v1/attendancereport/detailed',
        { reservationsFromDate: window.from, reservationsToDate: window.to }
      )
      if (Array.isArray(result)) all.push(...result)
    }
    return all
  }

  /** Get events list */
  async getEvents(from: Date, to: Date): Promise<CREvent[]> {
    const result = await this.request<any>('/api/v1/eventcalendar/eventlist', {
      fromDate: from.toISOString().split('T')[0],
      toDate: to.toISOString().split('T')[0],
    })
    return Array.isArray(result) ? result : result.items || result.data || []
  }

  /** Get event registrations */
  async getEventRegistrations(eventId: string): Promise<CREventRegistration[]> {
    const result = await this.request<CREventRegistration[]>(
      '/api/v1/eventregistrationreport/listactive',
      { eventId }
    )
    return Array.isArray(result) ? result : []
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
