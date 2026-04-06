/**
 * CourtReserve sync logic.
 * Fetches data from CR API and upserts into IQSport models.
 */
import { prisma } from '@/lib/prisma'
import { ExternalEntityType } from '@prisma/client'
import { CourtReserveClient } from './courtreserve-client'
import { decryptCredentials } from './encryption'
import type { CRMember, CRReservation, CRCourt, SyncResult, SyncError } from './courtreserve-types'

const PARTNER_PREFIX = 'cr' // ExternalIdMapping partnerId prefix

// ── Helpers ──

function getPartnerId(clubId: string): string {
  return `${PARTNER_PREFIX}_${clubId}`
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

/** Map CR reservation type to PlaySession format */
function mapFormat(reservationType?: string): string {
  if (!reservationType) return 'OPEN_PLAY'
  const lower = reservationType.toLowerCase()
  if (lower.includes('clinic')) return 'CLINIC'
  if (lower.includes('drill')) return 'DRILL'
  if (lower.includes('league')) return 'LEAGUE_PLAY'
  if (lower.includes('social') || lower.includes('mixer')) return 'SOCIAL'
  return 'OPEN_PLAY'
}

/** Extract time string (HH:MM) from various formats */
function parseTime(timeStr: string): string {
  // Handle "2024-03-15T18:00:00" format
  if (timeStr.includes('T')) {
    const d = new Date(timeStr)
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }
  // Handle "6:00 PM" format
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i)
  if (match) {
    let hours = parseInt(match[1])
    const minutes = match[2]
    if (match[3]?.toUpperCase() === 'PM' && hours < 12) hours += 12
    if (match[3]?.toUpperCase() === 'AM' && hours === 12) hours = 0
    return `${hours.toString().padStart(2, '0')}:${minutes}`
  }
  return timeStr.substring(0, 5) // Fallback: take first 5 chars
}

/** Parse date from CR format */
function parseDate(dateStr: string): Date {
  return new Date(dateStr)
}

// ── External ID Mapping (simplified, no dependency on partner utils) ──

async function getInternalId(partnerId: string, entityType: ExternalEntityType, externalId: string): Promise<string | null> {
  const mapping = await prisma.externalIdMapping.findUnique({
    where: { partnerId_entityType_externalId: { partnerId, entityType, externalId } },
  })
  return mapping?.internalId ?? null
}

async function setMapping(partnerId: string, entityType: ExternalEntityType, externalId: string, internalId: string): Promise<void> {
  await prisma.externalIdMapping.upsert({
    where: { partnerId_entityType_externalId: { partnerId, entityType, externalId } },
    create: { partnerId, entityType, externalId, internalId },
    update: { internalId },
  })
}

// ── Sync Functions ──

/** Sync courts from CourtReserve */
async function syncCourts(
  client: CourtReserveClient,
  clubId: string,
  partnerId: string
): Promise<{ created: number; updated: number; errors: number }> {
  const courts = await client.getCourts()
  console.log(`[CR Sync] ${clubId}: getCourts returned ${courts.length} courts`, courts.length > 0 ? courts.map(c => c.name).join(', ') : '(empty)')
  let created = 0, updated = 0, errors = 0

  for (const court of courts) {
    try {
      const externalId = String(court.id)
      const existingId = await getInternalId(partnerId, ExternalEntityType.COURT, externalId)

      const data = {
        clubId,
        name: court.name || `Court ${court.id}`,
        courtType: court.courtType || null,
        isIndoor: court.isIndoor ?? false,
        isActive: court.isActive ?? true,
      }

      if (existingId) {
        await prisma.clubCourt.update({ where: { id: existingId }, data })
        updated++
      } else {
        const newCourt = await prisma.clubCourt.create({ data })
        await setMapping(partnerId, ExternalEntityType.COURT, externalId, newCourt.id)
        created++
      }
    } catch (err: any) {
      console.error(`[CR Sync] Court ${court.id} error:`, err.message)
      errors++
    }
  }

  return { created, updated, errors }
}

/** Sync members from CourtReserve */
async function syncMembersWithProgress(
  client: CourtReserveClient,
  clubId: string,
  partnerId: string,
  connectorId: string,
  opts: { updatedFrom?: string; deadline?: number } = {}
): Promise<{ created: number; updated: number; matched: number; errors: number; done: boolean; totalCount: number }> {
  let page = 1
  let created = 0, updated = 0, matched = 0, errors = 0
  let hasMore = true

  // Resume from where we left off — count existing followers as starting point
  const existingCount = await prisma.clubFollower.count({ where: { clubId } })
  let totalCount = existingCount // Start with known count, API will update
  if (existingCount > 0) {
    page = Math.floor(existingCount / 100) + 1 // Resume from approximate page
  }

  // Pre-load existing email→userId map for fast lookup
  const existingUsers = await prisma.user.findMany({
    where: { email: { not: '' } },
    select: { id: true, email: true },
  })
  const emailToUserId = new Map(existingUsers.map(u => [u.email!.toLowerCase(), u.id]))

  const existingMappings = await prisma.externalIdMapping.findMany({
    where: { partnerId, entityType: ExternalEntityType.MEMBER },
    select: { externalId: true, internalId: true },
  })
  const extIdToUserId = new Map(existingMappings.map(m => [m.externalId, m.internalId]))

  while (hasMore) {
    // Check deadline — stop early if running out of time
    if (opts.deadline && Date.now() > opts.deadline) {
      return { created, updated, matched, errors, done: false, totalCount }
    }
    const result = await client.getMembers({ page, pageSize: 100, updatedFrom: opts.updatedFrom })
    if (totalCount === 0) totalCount = result.totalCount
    const members = result.items

    // Process 10 members concurrently
    const CONCURRENCY = 10
    for (let i = 0; i < members.length; i += CONCURRENCY) {
      const batch = members.slice(i, i + CONCURRENCY).map(async (member) => {
        try {
          if (!member.email) return 'error'
          const email = member.email.toLowerCase().trim()
          const externalId = member.organizationMemberId
          const name = [member.firstName, member.lastName].filter(Boolean).join(' ') || null

          let userId = extIdToUserId.get(externalId) || emailToUserId.get(email) || null
          let resultType: 'created' | 'updated' | 'matched' = userId ? (extIdToUserId.has(externalId) ? 'updated' : 'matched') : 'created'

          const duprSingles = member.ratings?.find((r: any) => r.ratingTypeName?.toLowerCase().includes('singles'))?.ratingValue
          const duprDoubles = member.ratings?.find((r: any) => r.ratingTypeName?.toLowerCase().includes('doubles'))?.ratingValue
          let dateOfBirth: Date | undefined
          if (member.dateOfBirth) { try { const p = new Date(member.dateOfBirth); if (!isNaN(p.getTime()) && p.getFullYear() > 1900) dateOfBirth = p } catch {} }

          const userData = {
            email, name: name || undefined, phone: member.phonenumber || undefined,
            gender: member.gender === 'Male' ? 'M' as const : member.gender === 'Female' ? 'F' as const : undefined,
            city: member.city || undefined,
            ...(duprSingles !== undefined ? { duprRatingSingles: duprSingles } : {}),
            ...(duprDoubles !== undefined ? { duprRatingDoubles: duprDoubles } : {}),
            ...(dateOfBirth ? { dateOfBirth } : {}),
            ...(member.membershipTypeName ? { membershipType: member.membershipTypeName } : {}),
            ...(member.membershipStatus ? { membershipStatus: member.membershipStatus } : {}),
            ...(member.zipCode ? { zipCode: member.zipCode } : {}),
            ...(member.skillLevel ? { skillLevel: member.skillLevel } : {}),
          }

          if (userId) {
            await prisma.user.update({ where: { id: userId }, data: userData }).catch(() => {})
          } else {
            const newUser = await prisma.user.create({ data: userData })
            userId = newUser.id
            emailToUserId.set(email, userId)
          }

          await Promise.all([
            !extIdToUserId.has(externalId) ? prisma.externalIdMapping.upsert({
              where: { partnerId_entityType_externalId: { partnerId, entityType: ExternalEntityType.MEMBER, externalId } },
              update: { internalId: userId }, create: { partnerId, entityType: ExternalEntityType.MEMBER, externalId, internalId: userId },
            }).then(() => extIdToUserId.set(externalId, userId)) : Promise.resolve(),
            prisma.clubFollower.upsert({ where: { clubId_userId: { clubId, userId } }, create: { clubId, userId }, update: {} }),
          ]).catch(() => {})
          return resultType
        } catch { return 'error' }
      })
      const results = await Promise.all(batch)
      for (const r of results) { if (r === 'created') created++; else if (r === 'updated') updated++; else if (r === 'matched') matched++; else errors++ }
    }

    // Get cumulative count from DB for accurate progress (accounts for previous chunks)
    const totalSynced = await prisma.clubFollower.count({ where: { clubId } })
    const percent = Math.round(10 + (totalSynced / Math.max(totalCount, 1)) * 60)
    await prisma.clubConnector.update({
      where: { id: connectorId },
      data: { lastSyncResult: { phase: 'members', percent, status: `Syncing members... ${totalSynced.toLocaleString()} / ${totalCount.toLocaleString()}`, membersSynced: totalSynced, membersTotal: totalCount, courtsDone: true } as any },
    }).catch(() => {})

    hasMore = members.length === 100
    page++
  }

  return { created, updated, matched, errors, done: true, totalCount }
}

/** @deprecated Use syncMembersWithProgress instead */
async function syncMembers(
  client: CourtReserveClient,
  clubId: string,
  partnerId: string,
  opts: { updatedFrom?: string } = {}
): Promise<{ created: number; updated: number; matched: number; errors: number }> {
  const members = await client.getAllMembers({ updatedFrom: opts.updatedFrom })
  let created = 0, updated = 0, matched = 0, errors = 0
  for (const member of members) {
    const r = await syncSingleMember(member, clubId, partnerId)
    if (r === 'created') created++
    else if (r === 'updated') updated++
    else if (r === 'matched') matched++
    else errors++
  }
  return { created, updated, matched, errors }
}

async function syncSingleMember(
  member: any,
  clubId: string,
  partnerId: string,
): Promise<'created' | 'updated' | 'matched' | 'error'> {
  try {
    if (!member.email) return 'error'
    const email = member.email.toLowerCase().trim()
    const externalId = member.organizationMemberId
    const name = [member.firstName, member.lastName].filter(Boolean).join(' ') || null

    let userId = await getInternalId(partnerId, ExternalEntityType.MEMBER, externalId)
    let result: 'created' | 'updated' | 'matched' = userId ? 'updated' : 'created'

    if (!userId) {
      const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } })
      if (existingUser) {
        userId = existingUser.id
        await setMapping(partnerId, ExternalEntityType.MEMBER, externalId, userId)
        result = 'matched'
      }
    }

    const duprSingles = member.ratings?.find((r: any) => r.ratingTypeName?.toLowerCase().includes('singles'))?.ratingValue
    const duprDoubles = member.ratings?.find((r: any) => r.ratingTypeName?.toLowerCase().includes('doubles'))?.ratingValue

    let dateOfBirth: Date | undefined
    if (member.dateOfBirth) {
      try {
        const parsed = new Date(member.dateOfBirth)
        if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 1900) dateOfBirth = parsed
      } catch {}
    }

    const userData = {
      email,
      name: name || undefined,
      phone: member.phonenumber || undefined,
      gender: member.gender === 'Male' ? 'M' as const : member.gender === 'Female' ? 'F' as const : undefined,
      city: member.city || undefined,
      ...(duprSingles !== undefined ? { duprRatingSingles: duprSingles } : {}),
      ...(duprDoubles !== undefined ? { duprRatingDoubles: duprDoubles } : {}),
      ...(dateOfBirth ? { dateOfBirth } : {}),
      ...(member.membershipTypeName ? { membershipType: member.membershipTypeName } : {}),
      ...(member.membershipStatus ? { membershipStatus: member.membershipStatus } : {}),
      ...(member.zipCode ? { zipCode: member.zipCode } : {}),
      ...(member.skillLevel ? { skillLevel: member.skillLevel } : {}),
    }

    if (userId) {
      await prisma.user.update({ where: { id: userId }, data: userData })
    } else {
      const newUser = await prisma.user.create({ data: userData })
      userId = newUser.id
      await setMapping(partnerId, ExternalEntityType.MEMBER, externalId, userId)
    }

    await prisma.clubFollower.upsert({
      where: { clubId_userId: { clubId, userId } },
      create: { clubId, userId },
      update: {},
    })

    return result
  } catch (err: any) {
    console.error(`[CR Sync] Member ${member.organizationMemberId} error:`, err.message)
    return 'error'
  }
}

/** Sync reservations → PlaySessions + PlaySessionBookings */
async function syncReservations(
  client: CourtReserveClient,
  clubId: string,
  partnerId: string,
  from: Date,
  to: Date
): Promise<{
  sessions: { created: number; updated: number; errors: number }
  bookings: { created: number; updated: number; errors: number }
}> {
  const [active, cancelled] = await Promise.all([
    client.getActiveReservations(from, to),
    client.getCancelledReservations(from, to).catch(() => [] as CRReservation[]),
  ])

  const sessionsResult = { created: 0, updated: 0, errors: 0 }
  const bookingsResult = { created: 0, updated: 0, errors: 0 }

  // Process active reservations
  for (const res of active) {
    try {
      const result = await upsertReservation(res, clubId, partnerId, false)
      if (result.sessionCreated) sessionsResult.created++
      else sessionsResult.updated++
      bookingsResult.created += result.bookingsCreated
      bookingsResult.updated += result.bookingsUpdated
    } catch (err: any) {
      console.error(`[CR Sync] Reservation ${res.reservationId} error:`, err.message)
      sessionsResult.errors++
    }
  }

  // Process cancelled reservations
  for (const res of cancelled) {
    try {
      const result = await upsertReservation(res, clubId, partnerId, true)
      bookingsResult.updated += result.bookingsUpdated
    } catch (err: any) {
      sessionsResult.errors++
    }
  }

  return { sessions: sessionsResult, bookings: bookingsResult }
}

async function upsertReservation(
  res: CRReservation,
  clubId: string,
  partnerId: string,
  isCancelled: boolean
): Promise<{ sessionCreated: boolean; bookingsCreated: number; bookingsUpdated: number }> {
  const externalId = String(res.reservationId)
  let sessionId = await getInternalId(partnerId, ExternalEntityType.PLAY_SESSION, externalId)

  // Resolve court
  const courtExternalId = String(res.courtId)
  const courtId = await getInternalId(partnerId, ExternalEntityType.COURT, courtExternalId)

  const date = parseDate(res.reservationDate)
  const startTime = parseTime(res.startTime)
  const endTime = parseTime(res.endTime)
  const memberCount = res.members?.length || 0

  let sessionCreated = false

  const sessionData = {
    clubId,
    courtId: courtId || undefined,
    title: `${res.reservationType || 'Court Booking'} — ${res.courtName || 'Court'}`,
    date,
    startTime,
    endTime,
    format: mapFormat(res.reservationType) as any,
    skillLevel: 'ALL_LEVELS' as any,
    maxPlayers: Math.max(memberCount, 4),
    registeredCount: isCancelled ? 0 : memberCount,
    status: isCancelled ? 'CANCELLED' as any : (date < new Date() ? 'COMPLETED' as any : 'SCHEDULED' as any),
  }

  if (sessionId) {
    await prisma.playSession.update({ where: { id: sessionId }, data: sessionData })
  } else {
    const newSession = await prisma.playSession.create({ data: sessionData })
    sessionId = newSession.id
    await setMapping(partnerId, ExternalEntityType.PLAY_SESSION, externalId, sessionId)
    sessionCreated = true
  }

  // Upsert bookings for each member
  let bookingsCreated = 0, bookingsUpdated = 0
  for (const member of res.members || []) {
    const userId = await getInternalId(partnerId, ExternalEntityType.MEMBER, member.organizationMemberId)
    if (!userId) continue

    const existing = await prisma.playSessionBooking.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
    })

    const bookingData = {
      status: isCancelled ? 'CANCELLED' as any : 'CONFIRMED' as any,
      ...(isCancelled && res.cancelledDate ? { cancelledAt: new Date(res.cancelledDate) } : {}),
    }

    if (existing) {
      await prisma.playSessionBooking.update({
        where: { sessionId_userId: { sessionId, userId } },
        data: bookingData,
      })
      bookingsUpdated++
    } else {
      await prisma.playSessionBooking.create({
        data: {
          sessionId,
          userId,
          ...bookingData,
          bookedAt: new Date(),
        },
      })
      bookingsCreated++
    }
  }

  return { sessionCreated, bookingsCreated, bookingsUpdated }
}

/** Sync event registrations → PlaySessions + PlaySessionBookings
 *  This is the PRIMARY data source for pickleball clubs (Open Play, Clinics, Leagues).
 *  Reservations (above) are only for private court bookings. */
async function syncEventRegistrations(
  client: CourtReserveClient,
  clubId: string,
  partnerId: string,
  from: Date,
  to: Date,
  connectorId: string,
): Promise<{ sessions: { created: number; updated: number; errors: number }; bookings: { created: number; updated: number; errors: number } }> {
  const sessionsResult = { created: 0, updated: 0, errors: 0 }
  const bookingsResult = { created: 0, updated: 0, errors: 0 }

  // Pre-load email → userId map
  const followers = await prisma.clubFollower.findMany({
    where: { clubId },
    include: { user: { select: { id: true, email: true } } },
  })
  const emailToUserId = new Map(followers.filter(f => f.user.email).map(f => [f.user.email!.toLowerCase(), f.userId]))

  // Pre-load existing event session mappings
  const existingMappings = await prisma.externalIdMapping.findMany({
    where: { partnerId, entityType: ExternalEntityType.PLAY_SESSION },
    select: { externalId: true, internalId: true },
  })
  const eventIdToSessionId = new Map(existingMappings.map(m => [m.externalId, m.internalId]))

  // Fetch in 31-day windows
  const windows: { from: string; to: string }[] = []
  let current = new Date(from)
  while (current < to) {
    const windowEnd = new Date(current)
    windowEnd.setDate(windowEnd.getDate() + 30)
    const end = windowEnd > to ? to : windowEnd
    windows.push({ from: current.toISOString().split('T')[0], to: end.toISOString().split('T')[0] })
    current = new Date(end)
    current.setDate(current.getDate() + 1)
  }

  for (const window of windows) {
    try {
      const data = await client.request<any[]>(
        '/api/v1/eventregistrationreport/listactive',
        { eventDateFrom: window.from, eventDateTo: window.to, includeCourts: 'true' }
      )
      if (!Array.isArray(data) || data.length === 0) continue

      // Group by EventDateId (unique session instance)
      const grouped = new Map<string, any[]>()
      for (const reg of data) {
        const key = `evt_${reg.EventDateId || reg.EventId}`
        if (!grouped.has(key)) grouped.set(key, [])
        grouped.get(key)!.push(reg)
      }

      // Process each session group — 5 concurrent
      const entries = Array.from(grouped.entries())
      const BATCH = 5
      for (let i = 0; i < entries.length; i += BATCH) {
        await Promise.all(entries.slice(i, i + BATCH).map(async ([eventKey, regs]) => {
          try {
            const first = regs[0]
            const startTime = first.StartTime?.includes('T') ? first.StartTime.split('T')[1]?.slice(0, 5) : '00:00'
            const endTime = first.EndTime?.includes('T') ? first.EndTime.split('T')[1]?.slice(0, 5) : '01:00'
            const date = new Date(first.StartTime || window.from)
            const activeRegs = regs.filter((r: any) => !r.CancelledOnUtc)
            const format = mapFormat(first.EventCategoryName || first.EventName || '')

            // Resolve court from Courts array (first pickleball court)
            let courtId: string | null = null
            const courts = first.Courts || []
            if (courts.length > 0) {
              const pbCourt = courts.find((c: any) => c.CourtTypeName === 'Pickleball') || courts[0]
              const courtName = pbCourt.CourtName || pbCourt.courtName
              if (courtName) {
                // Find existing court by name
                const existing = await prisma.clubCourt.findFirst({ where: { clubId, name: courtName } })
                courtId = existing?.id || null
              }
            }

            let sessionId = eventIdToSessionId.get(eventKey)
            const numCourts = courts.filter((c: any) => (c.CourtTypeName || '').toLowerCase().includes('pickleball')).length || 1
            const sessionData = {
              clubId,
              courtId,
              title: first.EventName || 'Event',
              date,
              startTime,
              endTime,
              format: format as any,
              skillLevel: mapSkillLevelFromEvent(first.EventCategoryName || first.EventName || '') as any,
              maxPlayers: Math.max(activeRegs.length, numCourts * 4),
              registeredCount: activeRegs.length,
              status: (date < new Date() ? 'COMPLETED' : 'SCHEDULED') as any,
              pricePerSlot: first.PriceToPay || null,
            }

            if (sessionId) {
              await prisma.playSession.update({ where: { id: sessionId }, data: sessionData })
              sessionsResult.updated++
            } else {
              const session = await prisma.playSession.create({ data: sessionData })
              sessionId = session.id
              await setMapping(partnerId, ExternalEntityType.PLAY_SESSION, eventKey, sessionId)
              eventIdToSessionId.set(eventKey, sessionId)
              sessionsResult.created++
            }

            // Create bookings — batch upsert
            for (const reg of regs) {
              const email = (reg.Email || '').toLowerCase().trim()
              const userId = emailToUserId.get(email)
              if (!userId || !sessionId) continue

              const isCancelledReg = !!reg.CancelledOnUtc
              await prisma.playSessionBooking.upsert({
                where: { sessionId_userId: { sessionId, userId } },
                update: { status: isCancelledReg ? 'CANCELLED' : 'CONFIRMED' },
                create: {
                  sessionId,
                  userId,
                  status: isCancelledReg ? 'CANCELLED' : 'CONFIRMED',
                  bookedAt: reg.SignedUpOnUtc ? new Date(reg.SignedUpOnUtc) : date,
                  ...(isCancelledReg && reg.CancelledOnUtc ? { cancelledAt: new Date(reg.CancelledOnUtc) } : {}),
                },
              }).catch(() => {})
              bookingsResult.created++
            }
          } catch {
            sessionsResult.errors++
          }
        }))
      }

      // Update progress
      await prisma.clubConnector.update({
        where: { id: connectorId },
        data: { lastSyncResult: { phase: 'events', percent: 82, status: `Syncing events... ${window.from}`, courtsDone: true, membersDone: true } as any },
      }).catch(() => {})

    } catch (err) {
      console.error(`[CR Sync] Events ${window.from}-${window.to} error:`, (err as Error).message?.slice(0, 100))
    }
  }

  return { sessions: sessionsResult, bookings: bookingsResult }
}

function mapSkillLevelFromEvent(name: string): string {
  const lower = name.toLowerCase()
  if (lower.includes('beginner') || lower.includes('casual') || lower.includes('2.0') || lower.includes('2.5')) return 'BEGINNER'
  if (lower.includes('intermediate') || lower.includes('3.0') || lower.includes('3.5')) return 'INTERMEDIATE'
  if (lower.includes('advanced') || lower.includes('competitive') || lower.includes('4.0') || lower.includes('4.5') || lower.includes('5.0')) return 'ADVANCED'
  return 'ALL_LEVELS'
}

// ── Main Sync Orchestrator ──

export interface SyncOptions {
  isInitial?: boolean
  daysBack?: number
  maxTimeMs?: number // Stop after this many ms to avoid timeout
}

export async function runCourtReserveSync(
  connectorId: string,
  options: SyncOptions = {}
): Promise<SyncResult & { incomplete?: boolean }> {
  const { isInitial = false, daysBack = isInitial ? 365 : 7, maxTimeMs } = options
  const startTime = Date.now()

  // Load connector
  const connector = await prisma.clubConnector.findUnique({
    where: { id: connectorId },
  })
  if (!connector) throw new Error(`Connector ${connectorId} not found`)

  // Update status to syncing + clear nextRetryAt
  const prevSyncResult = (connector.lastSyncResult as any) || {}
  if (prevSyncResult.nextRetryAt) {
    delete prevSyncResult.nextRetryAt
  }
  await prisma.clubConnector.update({
    where: { id: connectorId },
    data: { status: 'syncing', lastSyncResult: prevSyncResult as any },
  })

  const clubId = connector.clubId
  const credentials = decryptCredentials(connector.credentialsEncrypted)
  const client = new CourtReserveClient(credentials.username, credentials.password, connector.baseUrl)

  // Ensure Partner + PartnerApp exist for ExternalIdMapping FK constraint
  const partnerCode = getPartnerId(clubId)
  let partner = await prisma.partner.findUnique({ where: { code: partnerCode } })
  if (!partner) {
    const crypto = await import('crypto')
    partner = await prisma.partner.create({
      data: {
        name: `CourtReserve Connector (${clubId.substring(0, 8)})`,
        code: partnerCode,
        status: 'ACTIVE',
      },
    })
    await prisma.partnerApp.create({
      data: {
        partnerId: partner.id,
        environment: 'PRODUCTION',
        keyId: `cr_${clubId.substring(0, 8)}_${crypto.randomBytes(4).toString('hex')}`,
        secretHash: 'connector-internal',
        status: 'ACTIVE',
        scopes: ['connector:sync'],
      },
    })
    console.log(`[CR Sync] Created Partner + PartnerApp for ${partnerCode}`)
  }
  const partnerId = partner.id // Use actual UUID, not code string

  const now = new Date()
  const futureDate = new Date(now)
  futureDate.setDate(futureDate.getDate() + 30) // Include 30 days of future sessions

  // Progressive sync phases — recent data first, expand backwards
  // Phase 0 also includes +30 days future (most valuable for dashboard)
  const SYNC_PHASES = [
    { daysBack: 60, label: 'Recent + upcoming (2mo + 30d)' },
    { daysBack: 150, label: '2-5 months ago' },
    { daysBack: 240, label: '5-8 months ago' },
    { daysBack: 365, label: '8-12 months ago' },
  ]

  const from = new Date(now)
  from.setDate(from.getDate() - daysBack)

  const updateProgress = async (progress: Record<string, any>) => {
    await prisma.clubConnector.update({
      where: { id: connectorId },
      data: { lastSyncResult: progress as any },
    }).catch(() => {})
  }

  try {
    // Check previous progress — skip completed phases on resume
    const prevProgress = connector.lastSyncResult as any
    const membersDone = prevProgress?.membersDone === true
    const courtsDone = prevProgress?.courtsDone === true

    // 1. Sync courts (skip if already done in previous chunk)
    let courtsResult = { created: 0, updated: 0, errors: 0 }
    if (!courtsDone) {
      console.log(`[CR Sync] ${clubId}: syncing courts...`)
      await updateProgress({ phase: 'courts', percent: 5, status: 'Syncing courts...' })
      courtsResult = await syncCourts(client, clubId, partnerId)
      await updateProgress({ phase: 'courts', percent: 10, status: `${courtsResult.created + courtsResult.updated} courts synced`, courtsDone: true })
    } else {
      console.log(`[CR Sync] ${clubId}: courts already done, skipping`)
    }

    // 2. Sync members (skip if already done in previous chunk)
    let membersResult = { created: 0, updated: 0, matched: 0, errors: 0 }
    if (!membersDone) {
      console.log(`[CR Sync] ${clubId}: syncing members...`)
      const memberDeadline = maxTimeMs ? startTime + maxTimeMs - 10_000 : undefined
      const membersChunk = await syncMembersWithProgress(client, clubId, partnerId, connectorId, {
        updatedFrom: isInitial ? undefined : connector.lastSyncAt?.toISOString(),
        deadline: memberDeadline,
      })
      membersResult = { created: membersChunk.created, updated: membersChunk.updated, matched: membersChunk.matched, errors: membersChunk.errors }

      // If members not done — return partial result, cron will continue
      if (!membersChunk.done) {
      const followerCount = await prisma.clubFollower.count({ where: { clubId } })
      // Use totalCount from API, fallback to previous value or followerCount
      const totalCount = membersChunk.totalCount || (connector.lastSyncResult as any)?.membersTotal || followerCount
      const percent = Math.round(10 + (followerCount / Math.max(totalCount, 1)) * 60)
      await prisma.clubConnector.update({
        where: { id: connectorId },
        data: {
          status: 'syncing',
          lastSyncResult: {
            phase: 'members',
            incomplete: true,
            isInitial: !connector.lastSyncAt,
            status: `Syncing members... ${followerCount.toLocaleString()} / ${totalCount.toLocaleString()}`,
            membersSynced: followerCount,
            membersTotal: totalCount,
            courtsDone: true,
            percent,
          } as any,
          // Do NOT set lastSyncAt — so next call knows it's still initial
        },
      }).catch(() => {})
      console.log(`[CR Sync] ${clubId}: members chunk done (${followerCount}/${membersChunk.totalCount}), will continue on next call`)
      return {
        courts: courtsResult,
        members: membersResult,
        sessions: { created: 0, updated: 0, errors: 0 },
        bookings: { created: 0, updated: 0, errors: 0 },
        totalErrors: courtsResult.errors + membersResult.errors,
        syncedAt: now.toISOString(),
        incomplete: true,
      }
    }
    } else {
      console.log(`[CR Sync] ${clubId}: members already done, skipping`)
    }

    // 3-4. Sync reservations + events in progressive phases
    // Phase 0: today-2mo → today+30d (most valuable)
    // Phase 1: today-5mo → today-2mo
    // Phase 2: today-8mo → today-5mo
    // Phase 3: today-12mo → today-8mo
    const currentPhaseIdx = prevProgress?.syncPhaseIdx ?? 0
    const completedWindows: string[] = prevProgress?.completedWindows || []
    let sessionsResult = { created: 0, updated: 0, errors: 0 }
    let bookingsResult = { created: 0, updated: 0, errors: 0 }

    // Determine date range for current phase
    const phase = isInitial ? SYNC_PHASES[Math.min(currentPhaseIdx, SYNC_PHASES.length - 1)] : null
    const phaseFrom = phase ? new Date(now.getTime() - phase.daysBack * 86400000) : from
    const prevPhaseDays = currentPhaseIdx > 0 ? SYNC_PHASES[currentPhaseIdx - 1].daysBack : 0
    const phaseTo = (phase && currentPhaseIdx > 0) ? new Date(now.getTime() - prevPhaseDays * 86400000) : futureDate

    const phaseLabel = phase ? `${phase.label} (${currentPhaseIdx + 1}/${SYNC_PHASES.length})` : `${daysBack} days`
    console.log(`[CR Sync] ${clubId}: syncing reservations+events — ${phaseLabel}`)

    // 3. Sync reservations with deadline + window tracking
    await updateProgress({ phase: 'sessions', percent: 72, status: `Syncing reservations — ${phaseLabel}`, courtsDone: true, membersDone: true, syncPhaseIdx: currentPhaseIdx })

    const reservationDeadline = maxTimeMs ? startTime + maxTimeMs - 30_000 : undefined
    const allResWindows = client.dateWindows(phaseFrom, phaseTo)
    const remainingResWindows = allResWindows.filter(w => !completedWindows.includes(`res:${w.from}`))

    for (const window of remainingResWindows) {
      if (reservationDeadline && Date.now() > reservationDeadline) {
        console.log(`[CR Sync] ${clubId}: reservations deadline reached, will continue next chunk`)
        const sessCount = await prisma.playSession.count({ where: { clubId } })
        await updateProgress({
          phase: 'sessions', percent: 72, incomplete: true, isInitial,
          status: `Syncing reservations... ${sessCount.toLocaleString()} sessions`,
          courtsDone: true, membersDone: true,
          syncPhaseIdx: currentPhaseIdx, completedWindows,
        })
        return {
          courts: courtsResult, members: membersResult, sessions: sessionsResult, bookings: bookingsResult,
          totalErrors: courtsResult.errors + membersResult.errors + sessionsResult.errors + bookingsResult.errors,
          syncedAt: now.toISOString(), incomplete: true,
        }
      }
      try {
        const windowFrom = new Date(window.from)
        const windowTo = new Date(window.to)
        const { sessions: ws, bookings: wb } = await syncReservations(client, clubId, partnerId, windowFrom, windowTo)
        sessionsResult.created += ws.created; sessionsResult.updated += ws.updated; sessionsResult.errors += ws.errors
        bookingsResult.created += wb.created; bookingsResult.errors += wb.errors
        completedWindows.push(`res:${window.from}`)
      } catch (err: any) {
        if (err.message?.includes('Rate limited')) throw err // bubble up for nextRetryAt
        console.error(`[CR Sync] ${clubId}: reservation window ${window.from} error:`, err.message)
        sessionsResult.errors++
      }
    }

    // 4. Sync event registrations with deadline + window tracking
    const sessCount = await prisma.playSession.count({ where: { clubId } })
    await updateProgress({ phase: 'events', percent: 80, status: `${sessCount.toLocaleString()} sessions. Syncing events — ${phaseLabel}`, courtsDone: true, membersDone: true, syncPhaseIdx: currentPhaseIdx, completedWindows })

    const eventDeadline = maxTimeMs ? startTime + maxTimeMs - 15_000 : undefined
    const allEventWindows = client.dateWindows(phaseFrom, phaseTo)
    const remainingEventWindows = allEventWindows.filter(w => !completedWindows.includes(`evt:${w.from}`))

    for (const window of remainingEventWindows) {
      if (eventDeadline && Date.now() > eventDeadline) {
        console.log(`[CR Sync] ${clubId}: events deadline reached, will continue next chunk`)
        const currentSessCount = await prisma.playSession.count({ where: { clubId } })
        await updateProgress({
          phase: 'events', percent: 82, incomplete: true, isInitial,
          status: `Syncing events... ${currentSessCount.toLocaleString()} sessions`,
          courtsDone: true, membersDone: true,
          syncPhaseIdx: currentPhaseIdx, completedWindows,
        })
        return {
          courts: courtsResult, members: membersResult, sessions: sessionsResult, bookings: bookingsResult,
          totalErrors: courtsResult.errors + membersResult.errors + sessionsResult.errors + bookingsResult.errors,
          syncedAt: now.toISOString(), incomplete: true,
        }
      }
      try {
        const windowFrom = new Date(window.from)
        const windowTo = new Date(window.to)
        const eventResult = await syncEventRegistrations(client, clubId, partnerId, windowFrom, windowTo, connectorId)
        sessionsResult.created += eventResult.sessions.created; sessionsResult.updated += eventResult.sessions.updated; sessionsResult.errors += eventResult.sessions.errors
        bookingsResult.created += eventResult.bookings.created; bookingsResult.errors += eventResult.bookings.errors
        completedWindows.push(`evt:${window.from}`)
      } catch (err: any) {
        if (err.message?.includes('Rate limited')) throw err
        console.error(`[CR Sync] ${clubId}: event window ${window.from} error:`, err.message)
        sessionsResult.errors++
      }
    }

    // Match sessions to courts by court name in title
    try {
      await prisma.$executeRawUnsafe(`
        UPDATE play_sessions ps
        SET "courtId" = cc.id
        FROM club_courts cc
        WHERE ps."clubId" = $1
          AND cc."clubId" = ps."clubId"
          AND ps."courtId" IS NULL
          AND ps.title ILIKE '%' || cc.name || '%'
      `, clubId)
    } catch {}

    // Check if more phases needed (initial sync only)
    const nextPhaseIdx = currentPhaseIdx + 1
    if (isInitial && nextPhaseIdx < SYNC_PHASES.length) {
      const PHASE_PAUSE_MS = 2 * 60 * 60 * 1000 // 2 hours between phases — let API cool down
      const nextPhaseAt = new Date(Date.now() + PHASE_PAUSE_MS)
      console.log(`[CR Sync] ${clubId}: phase ${currentPhaseIdx + 1}/${SYNC_PHASES.length} done, next phase at ${nextPhaseAt.toISOString()}`)
      const currentSessCount = await prisma.playSession.count({ where: { clubId } })
      const currentMemCount = await prisma.clubFollower.count({ where: { clubId } })
      await prisma.clubConnector.update({
        where: { id: connectorId },
        data: {
          status: 'syncing',
          lastSyncAt: now, // Mark partial sync time so incremental works
          lastSyncResult: {
            phase: 'sessions', percent: 72, incomplete: true, isInitial: true,
            status: `Phase ${currentPhaseIdx + 1}/${SYNC_PHASES.length} done. ${currentMemCount.toLocaleString()} members, ${currentSessCount.toLocaleString()} sessions. Next phase in 2h.`,
            courtsDone: true, membersDone: true,
            syncPhaseIdx: nextPhaseIdx, completedWindows: [], // Reset windows for next phase
            nextRetryAt: nextPhaseAt.toISOString(), // Pause 2h between phases
          } as any,
          lastError: null,
        },
      })
      return {
        courts: courtsResult, members: membersResult, sessions: sessionsResult, bookings: bookingsResult,
        totalErrors: courtsResult.errors + sessionsResult.errors + bookingsResult.errors,
        syncedAt: now.toISOString(), incomplete: true,
      }
    }

    // All phases complete — final totals
    const totalMembers = await prisma.clubFollower.count({ where: { clubId } })
    const totalSessions = await prisma.playSession.count({ where: { clubId } })
    const totalBookings = await prisma.playSessionBooking.count({ where: { playSession: { clubId } } })
    await updateProgress({ phase: 'done', percent: 100, status: `Sync complete! ${totalMembers.toLocaleString()} members, ${totalSessions.toLocaleString()} sessions, ${totalBookings.toLocaleString()} bookings`, courtsDone: true, membersDone: true, sessionsDone: true })

    const result: SyncResult = {
      courts: courtsResult,
      members: { created: totalMembers, updated: 0, matched: 0, errors: membersResult.errors },
      sessions: { created: totalSessions, updated: 0, errors: sessionsResult.errors },
      bookings: { created: totalBookings, updated: 0, errors: bookingsResult.errors },
      totalErrors: courtsResult.errors + membersResult.errors + sessionsResult.errors + bookingsResult.errors,
      syncedAt: now.toISOString(),
    }

    // Update connector with success
    await prisma.clubConnector.update({
      where: { id: connectorId },
      data: {
        status: 'connected',
        lastSyncAt: now,
        lastSyncResult: result as any,
        lastError: null,
      },
    })

    // Auto-enrich member data (gender from events + LLM, skill from events)
    try {
      console.log(`[CR Sync] ${clubId}: enriching member data...`)
      const { enrichMemberData } = await import('@/lib/ai/gender-inference')
      const enrichResult = await enrichMemberData(clubId)
      console.log(`[CR Sync] ${clubId}: enriched — gender: ${enrichResult.gender.inferred}, skill: ${enrichResult.skill.inferred}`)
    } catch (err: any) {
      console.error(`[CR Sync] ${clubId}: enrichment failed (non-fatal):`, err.message)
    }

    // Auto-index for RAG (AI Advisor, member insights)
    try {
      console.log(`[CR Sync] ${clubId}: indexing for AI...`)
      const { indexAll } = await import('@/lib/ai/rag/indexer')
      const indexResult = await indexAll(clubId)
      console.log(`[CR Sync] ${clubId}: indexed ${indexResult.total} chunks`)
    } catch (err: any) {
      console.error(`[CR Sync] ${clubId}: RAG indexing failed (non-fatal):`, err.message)
    }

    console.log(`[CR Sync] ${clubId}: done —`, JSON.stringify(result))
    return result
  } catch (error: any) {
    // If partial data was synced, keep status as 'syncing' so retry continues
    // Only mark as 'error' if no data was loaded at all
    const hasPartialData = await prisma.clubFollower.count({ where: { clubId } }).catch(() => 0)
    const isAbort = error.message?.includes('aborted') || error.message?.includes('FUNCTION_INVOCATION_TIMEOUT')
    const isRateLimit = error.message?.includes('Rate limited')

    // Extract Retry-After seconds from error message
    const retryMatch = error.message?.match(/Retry after (\d+)s/)
    const retryAfterSec = retryMatch ? parseInt(retryMatch[1], 10) : (isRateLimit ? 120 : 0)

    // Preserve previous progress and add nextRetryAt for rate limits
    const prevResult = (connector.lastSyncResult as any) || {}
    const updateData: any = {
      status: (hasPartialData > 0 || isAbort || isRateLimit) ? 'syncing' : 'error',
      lastError: isAbort ? 'Sync timeout — will auto-resume'
        : isRateLimit ? `Rate limited. Retry after ${retryAfterSec}s`
        : (error.message || 'Sync failed'),
    }

    // Set nextRetryAt so cron doesn't retry before cooldown
    if (isRateLimit || isAbort) {
      const cooldownMs = isRateLimit ? retryAfterSec * 1000 + 30_000 : 120_000 // extra 30s buffer for rate limit
      updateData.lastSyncResult = {
        ...prevResult,
        nextRetryAt: new Date(Date.now() + cooldownMs).toISOString(),
      }
      console.log(`[CR Sync] ${clubId}: rate limited, nextRetryAt in ${Math.round(cooldownMs / 1000)}s`)
    }

    await prisma.clubConnector.update({
      where: { id: connectorId },
      data: updateData,
    }).catch(() => {})
    throw error
  }
}
