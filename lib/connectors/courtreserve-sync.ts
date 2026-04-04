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
  opts: { updatedFrom?: string } = {}
): Promise<{ created: number; updated: number; matched: number; errors: number }> {
  let page = 1
  let created = 0, updated = 0, matched = 0, errors = 0
  let hasMore = true
  let totalCount = 0

  // Pre-load existing email→userId map for fast lookup (avoid N+1)
  const existingUsers = await prisma.user.findMany({
    where: { email: { not: '' } },
    select: { id: true, email: true },
  })
  const emailToUserId = new Map(existingUsers.map(u => [u.email!.toLowerCase(), u.id]))

  // Pre-load existing mappings
  const existingMappings = await prisma.externalIdMapping.findMany({
    where: { partnerId, entityType: ExternalEntityType.MEMBER },
    select: { externalId: true, internalId: true },
  })
  const extIdToUserId = new Map(existingMappings.map(m => [m.externalId, m.internalId]))

  while (hasMore) {
    const result = await client.getMembers({ page, pageSize: 100, updatedFrom: opts.updatedFrom })
    if (page === 1) totalCount = result.totalCount
    const members = result.items

    // Process batch of 100 members with parallel DB operations
    const batchPromises = members.map(async (member) => {
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
          await prisma.user.update({ where: { id: userId }, data: userData }).catch(() => {})
        } else {
          const newUser = await prisma.user.create({ data: userData })
          userId = newUser.id
          emailToUserId.set(email, userId)
        }

        // Batch: mapping + follower (parallel)
        await Promise.all([
          !extIdToUserId.has(externalId) ? prisma.externalIdMapping.upsert({
            where: { partnerId_entityType_externalId: { partnerId, entityType: ExternalEntityType.MEMBER, externalId } },
            update: { internalId: userId },
            create: { partnerId, entityType: ExternalEntityType.MEMBER, externalId, internalId: userId },
          }).then(() => extIdToUserId.set(externalId, userId)) : Promise.resolve(),
          prisma.clubFollower.upsert({
            where: { clubId_userId: { clubId, userId } },
            create: { clubId, userId },
            update: {},
          }),
        ]).catch(() => {})

        return resultType
      } catch {
        return 'error'
      }
    })

    // Run batch in parallel (10 concurrent)
    const CONCURRENCY = 10
    for (let i = 0; i < batchPromises.length; i += CONCURRENCY) {
      const batch = batchPromises.slice(i, i + CONCURRENCY)
      const results = await Promise.all(batch)
      for (const r of results) {
        if (r === 'created') created++
        else if (r === 'updated') updated++
        else if (r === 'matched') matched++
        else errors++
      }
    }

    const synced = created + updated + matched + errors
    const percent = Math.round(10 + (synced / Math.max(totalCount, 1)) * 60)
    await prisma.clubConnector.update({
      where: { id: connectorId },
      data: { lastSyncResult: { phase: 'members', percent, status: `Syncing members... ${synced.toLocaleString()} / ${totalCount.toLocaleString()}`, membersSynced: synced, membersTotal: totalCount, courtsDone: true } as any },
    }).catch(() => {})

    hasMore = members.length === 100
    page++
  }

  return { created, updated, matched, errors }
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
    status: isCancelled ? 'CANCELLED' as any : 'SCHEDULED' as any,
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

// ── Main Sync Orchestrator ──

export interface SyncOptions {
  isInitial?: boolean
  daysBack?: number
}

export async function runCourtReserveSync(
  connectorId: string,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const { isInitial = false, daysBack = isInitial ? 365 : 7 } = options

  // Load connector
  const connector = await prisma.clubConnector.findUnique({
    where: { id: connectorId },
  })
  if (!connector) throw new Error(`Connector ${connectorId} not found`)

  // Update status to syncing
  await prisma.clubConnector.update({
    where: { id: connectorId },
    data: { status: 'syncing' },
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
  const from = new Date(now)
  from.setDate(from.getDate() - daysBack)

  const updateProgress = async (progress: Record<string, any>) => {
    await prisma.clubConnector.update({
      where: { id: connectorId },
      data: { lastSyncResult: progress as any },
    }).catch(() => {})
  }

  try {
    // 1. Sync courts
    console.log(`[CR Sync] ${clubId}: syncing courts...`)
    await updateProgress({ phase: 'courts', percent: 5, status: 'Syncing courts...' })
    const courtsResult = await syncCourts(client, clubId, partnerId)
    await updateProgress({ phase: 'courts', percent: 10, status: `${courtsResult.created + courtsResult.updated} courts synced`, courtsDone: true })

    // 2. Sync members (with progress updates per page)
    console.log(`[CR Sync] ${clubId}: syncing members...`)
    const membersResult = await syncMembersWithProgress(client, clubId, partnerId, connectorId, {
      updatedFrom: isInitial ? undefined : connector.lastSyncAt?.toISOString(),
    })

    // 3. Sync reservations → sessions + bookings
    console.log(`[CR Sync] ${clubId}: syncing reservations (${daysBack} days)...`)
    await updateProgress({ phase: 'sessions', percent: 75, status: 'Syncing sessions & bookings...', courtsDone: true, membersDone: true, membersTotal: membersResult.created + membersResult.updated + membersResult.matched })
    const { sessions: sessionsResult, bookings: bookingsResult } = await syncReservations(
      client, clubId, partnerId, from, now
    )

    await updateProgress({ phase: 'done', percent: 100, status: 'Sync complete!', courtsDone: true, membersDone: true, sessionsDone: true })

    const result: SyncResult = {
      courts: courtsResult,
      members: membersResult,
      sessions: sessionsResult,
      bookings: bookingsResult,
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

    console.log(`[CR Sync] ${clubId}: done —`, JSON.stringify(result))
    return result
  } catch (error: any) {
    // Update connector with error
    await prisma.clubConnector.update({
      where: { id: connectorId },
      data: {
        status: 'error',
        lastError: error.message || 'Sync failed',
      },
    })
    throw error
  }
}
