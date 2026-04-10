/**
 * Historical sync — pull 1 year of reservations + events for all IPC clubs.
 * Run: CONNECTOR_ENCRYPTION_KEY=xxx npx tsx scripts/historical-sync.ts
 */
import { prisma } from '../lib/prisma'
import { CourtReserveClient } from '../lib/connectors/courtreserve-client'
import { decryptCredentials } from '../lib/connectors/encryption'
import { ExternalEntityType } from '@prisma/client'

const YEAR_AGO = new Date()
YEAR_AGO.setFullYear(YEAR_AGO.getFullYear() - 1)

async function getOrCreateMapping(partnerId: string, entityType: ExternalEntityType, externalId: string, internalId: string) {
  await prisma.externalIdMapping.upsert({
    where: { partnerId_entityType_externalId: { partnerId, entityType, externalId } },
    update: { internalId },
    create: { partnerId, entityType, externalId, internalId },
  })
}

async function syncHistorical(connectorId: string) {
  const connector = await prisma.clubConnector.findUnique({
    where: { id: connectorId },
    include: { club: { select: { id: true, name: true } } },
  })
  if (!connector) throw new Error('Connector not found')

  const credentials = decryptCredentials(connector.credentialsEncrypted)
  const client = new CourtReserveClient(credentials.username, credentials.password, connector.baseUrl)
  const clubId = connector.clubId
  const clubName = connector.club.name

  console.log(`\n=== Historical sync for ${clubName} ===`)

  // Get or create partner
  const partnerCode = `cr_${clubId}`
  let partner = await prisma.partner.findUnique({ where: { code: partnerCode } })
  if (!partner) {
    const crypto = await import('crypto')
    partner = await prisma.partner.create({
      data: { name: `CourtReserve API (${clubName})`, code: partnerCode, status: 'ACTIVE' },
    })
    await prisma.partnerApp.create({
      data: {
        partnerId: partner.id, environment: 'PRODUCTION',
        keyId: `cr_${clubId.substring(0, 8)}_${crypto.randomBytes(4).toString('hex')}`,
        secretHash: 'api-sync-internal', status: 'ACTIVE', scopes: ['connector:sync'],
      },
    })
  }

  // Build member email → userId map
  const followers = await prisma.clubFollower.findMany({
    where: { clubId },
    include: { user: { select: { id: true, email: true } } },
  })
  const emailToUserId = new Map(followers.map(f => [f.user.email?.toLowerCase(), f.userId]))

  // Get courts for mapping
  const courts = await prisma.clubCourt.findMany({ where: { clubId } })
  const courtNameToId = new Map(courts.map(c => [c.name, c.id]))

  // Sync reservations month by month
  const now = new Date()
  let totalReservations = 0
  let totalBookings = 0
  let totalSessions = 0

  let current = new Date(YEAR_AGO)
  while (current < now) {
    const monthEnd = new Date(current)
    monthEnd.setMonth(monthEnd.getMonth() + 1)
    if (monthEnd > now) monthEnd.setTime(now.getTime())

    const monthLabel = current.toISOString().slice(0, 7)
    process.stdout.write(`  ${monthLabel}: `)

    try {
      const reservations = await client.getActiveReservations(current, monthEnd)
      totalReservations += reservations.length

      for (const res of reservations) {
        const externalId = String(res.reservationId)
        const date = new Date(res.reservationDate || res.startTime)
        const startTime = res.startTime?.includes('T') ? res.startTime.split('T')[1]?.slice(0, 5) : res.startTime?.slice(0, 5) || '00:00'
        const endTime = res.endTime?.includes('T') ? res.endTime.split('T')[1]?.slice(0, 5) : res.endTime?.slice(0, 5) || '01:00'

        // Find or create court
        let courtId: string | null = null
        if (res.courtName) {
          courtId = courtNameToId.get(res.courtName) || null
          if (!courtId) {
            const newCourt = await prisma.clubCourt.create({
              data: { clubId, name: res.courtName },
            })
            courtId = newCourt.id
            courtNameToId.set(res.courtName, courtId)
          }
        }

        // Determine format from reservation type
        const format = mapFormat(res.reservationType || '')

        // Create or update session
        const existing = await prisma.externalIdMapping.findUnique({
          where: { partnerId_entityType_externalId: { partnerId: partner.id, entityType: ExternalEntityType.PLAY_SESSION, externalId } },
        })

        let sessionId: string
        if (existing) {
          sessionId = existing.internalId
        } else {
          const session = await prisma.playSession.create({
            data: {
              clubId,
              courtId,
              title: res.reservationType || 'Reservation',
              date,
              startTime,
              endTime,
              format: format as any,
              skillLevel: 'ALL_LEVELS',
              maxPlayers: Math.max(res.members?.length || 1, 4),
              registeredCount: res.members?.length || 0,
              status: res.isCancelled ? 'CANCELLED' : 'COMPLETED',
            },
          })
          sessionId = session.id
          await getOrCreateMapping(partner.id, ExternalEntityType.PLAY_SESSION, externalId, sessionId)
          totalSessions++
        }

        // Create bookings for players
        for (const member of (res.members || [])) {
          const email = member.email?.toLowerCase()
          const userId = email ? emailToUserId.get(email) : null
          if (!userId) continue

          await prisma.playSessionBooking.upsert({
            where: { sessionId_userId: { sessionId, userId } },
            update: {},
            create: {
              sessionId,
              userId,
              status: res.isCancelled ? 'CANCELLED' : 'CONFIRMED',
              bookedAt: date,
            },
          }).catch(() => {}) // skip duplicates
          totalBookings++
        }
      }

      process.stdout.write(`${reservations.length} reservations\n`)
    } catch (e) {
      process.stdout.write(`ERROR: ${(e as Error).message?.slice(0, 80)}\n`)
    }

    current = monthEnd
  }

  console.log(`  Total: ${totalSessions} sessions, ${totalBookings} bookings from ${totalReservations} reservations`)

  // Update connector
  await prisma.clubConnector.update({
    where: { id: connectorId },
    data: { lastSyncAt: new Date(), status: 'connected', lastError: null },
  })
}

function mapFormat(type: string): string {
  const lower = type.toLowerCase()
  if (lower.includes('open play')) return 'OPEN_PLAY'
  if (lower.includes('clinic')) return 'CLINIC'
  if (lower.includes('drill') || lower.includes('ball machine')) return 'DRILL'
  if (lower.includes('league') || lower.includes('tournament')) return 'LEAGUE_PLAY'
  if (lower.includes('social') || lower.includes('mixer') || lower.includes('private event')) return 'SOCIAL'
  if (lower.includes('private') || lower.includes('lesson')) return 'CLINIC'
  return 'OPEN_PLAY'
}

async function main() {
  const connectors = await prisma.clubConnector.findMany({
    where: { provider: 'courtreserve', status: 'connected', baseUrl: 'https://api.courtreserve.com' },
  })

  console.log(`Found ${connectors.length} real CR connectors`)

  for (const c of connectors) {
    await syncHistorical(c.id)
  }

  console.log('\n=== DONE ===')
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
