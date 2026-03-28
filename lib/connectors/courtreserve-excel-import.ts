/**
 * CourtReserve Excel bulk importer.
 * Parses Excel exports and upserts into IQSport models.
 * Reuses mapping logic from courtreserve-sync.ts.
 */
import { prisma } from '@/lib/prisma'
import { ExternalEntityType } from '@prisma/client'
import * as XLSX from 'xlsx'

// ── Types ──

export interface ExcelImportResult {
  courts: { created: number; updated: number; errors: number }
  members: { created: number; updated: number; matched: number; errors: number }
  sessions: { created: number; updated: number; errors: number }
  bookings: { created: number; updated: number; errors: number }
}

interface ParsedMember {
  externalId: string
  email: string
  name: string
  firstName: string
  lastName: string
  phone?: string
  gender?: 'M' | 'F'
  city?: string
  duprSingles?: number
  duprDoubles?: number
  skillLevel?: string
  membership?: string
  lastVisit?: string
  firstVisit?: string
  reservationCount?: number
}

interface ParsedSession {
  externalId: string
  date: Date
  startTime: string
  endTime: string
  courtName?: string
  format: string
  skillLevel: string
  memberNames: string[]
  memberExternalIds: string[]
  memberCount: number
  price?: number
  isCancelled: boolean
  title: string
}

// ── Helpers ──

const PARTNER_PREFIX = 'crx' // Excel import prefix (different from API sync)

function getPartnerId(clubId: string): string {
  return `${PARTNER_PREFIX}_${clubId}`
}

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

function mapFormat(type?: string): string {
  if (!type) return 'OPEN_PLAY'
  const lower = type.toLowerCase()
  if (lower.includes('clinic')) return 'CLINIC'
  if (lower.includes('drill')) return 'DRILL'
  if (lower.includes('league')) return 'LEAGUE_PLAY'
  if (lower.includes('social') || lower.includes('mixer')) return 'SOCIAL'
  if (lower.includes('open play')) return 'OPEN_PLAY'
  if (lower.includes('doubles') || lower.includes('singles')) return 'OPEN_PLAY'
  return 'OPEN_PLAY'
}

function mapSkillLevel(skill?: string): string {
  if (!skill) return 'ALL_LEVELS'
  const lower = skill.toLowerCase()
  if (lower.includes('beginner') || lower.includes('2.0') || lower.includes('2.5')) return 'BEGINNER'
  if (lower.includes('intermediate') || lower.includes('3.0') || lower.includes('3.5')) return 'INTERMEDIATE'
  if (lower.includes('advanced') || lower.includes('4.0') || lower.includes('4.5') || lower.includes('5.0')) return 'ADVANCED'
  return 'ALL_LEVELS'
}

function parseTimeFromExcel(val: any): string {
  if (!val) return '00:00'
  const str = String(val).trim()

  // Handle Excel serial number (0.75 = 18:00)
  if (typeof val === 'number' && val < 1) {
    const totalMinutes = Math.round(val * 24 * 60)
    const hours = Math.floor(totalMinutes / 60)
    const mins = totalMinutes % 60
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`
  }

  // "6:00 PM" format
  const match = str.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i)
  if (match) {
    let hours = parseInt(match[1])
    const minutes = match[2]
    if (match[3]?.toUpperCase() === 'PM' && hours < 12) hours += 12
    if (match[3]?.toUpperCase() === 'AM' && hours === 12) hours = 0
    return `${hours.toString().padStart(2, '0')}:${minutes}`
  }

  // ISO format
  if (str.includes('T')) {
    const d = new Date(str)
    if (!isNaN(d.getTime())) {
      return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
    }
  }

  return str.substring(0, 5)
}

function parseDateFromExcel(val: any): Date | null {
  if (!val) return null
  if (val instanceof Date) return val
  if (typeof val === 'number') {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(val)
    if (d) return new Date(d.y, d.m - 1, d.d)
  }
  const d = new Date(String(val))
  return isNaN(d.getTime()) ? null : d
}

function safeStr(val: any): string {
  if (val === null || val === undefined) return ''
  return String(val).trim()
}

function safeNum(val: any): number | undefined {
  if (val === null || val === undefined || val === '') return undefined
  const n = Number(val)
  return isNaN(n) ? undefined : n
}

// ── Excel Parsers ──

function parseWorkbook(base64Data: string): XLSX.WorkBook {
  const buffer = Buffer.from(base64Data, 'base64')
  return XLSX.read(buffer, { type: 'buffer', cellDates: true })
}

function getRows(wb: XLSX.WorkBook, sheetIndex = 0): Record<string, any>[] {
  const sheet = wb.Sheets[wb.SheetNames[sheetIndex]]
  if (!sheet) return []
  return XLSX.utils.sheet_to_json(sheet, { defval: '' })
}

/** Find a column by trying multiple possible header names */
function col(row: Record<string, any>, ...names: string[]): any {
  for (const name of names) {
    // Exact match
    if (row[name] !== undefined && row[name] !== '') return row[name]
    // Case-insensitive
    const key = Object.keys(row).find(k => k.toLowerCase() === name.toLowerCase())
    if (key && row[key] !== undefined && row[key] !== '') return row[key]
    // Partial match
    const partial = Object.keys(row).find(k => k.toLowerCase().includes(name.toLowerCase()))
    if (partial && row[partial] !== undefined && row[partial] !== '') return row[partial]
  }
  return undefined
}

/** Map pre-parsed rows (from sheet_to_json) to ParsedMember objects */
export function mapMemberRows(rows: Record<string, any>[]): ParsedMember[] {
  const members: ParsedMember[] = []

  for (const row of rows) {
    const email = safeStr(col(row, 'Email', 'email', 'E-mail'))
    const memberId = safeStr(col(row, 'Member #', 'Member Number', 'MemberId', 'Member_Number'))
    if (!email && !memberId) continue

    const firstName = safeStr(col(row, 'First Name', 'FirstName', 'First'))
    const lastName = safeStr(col(row, 'Last Name', 'LastName', 'Last'))
    const gender = safeStr(col(row, 'Gender'))
    const duprSingles = safeNum(col(row, 'DUPR Singles', 'DUPR_Singles'))
    const duprDoubles = safeNum(col(row, 'DUPR Doubles', 'DUPR_Doubles'))

    members.push({
      externalId: memberId || email,
      email: email.toLowerCase(),
      name: [firstName, lastName].filter(Boolean).join(' '),
      firstName,
      lastName,
      phone: safeStr(col(row, 'Phone', 'phone', 'Cell', 'Mobile')),
      gender: gender.toLowerCase().startsWith('m') ? 'M' : gender.toLowerCase().startsWith('f') ? 'F' : undefined,
      city: safeStr(col(row, 'City', 'city')),
      duprSingles,
      duprDoubles,
      skillLevel: safeStr(col(row, 'Skill Level', 'SkillLevel', 'IPC Verified Rating')),
      membership: safeStr(col(row, 'Current Membership', 'Membership', 'MembershipType')),
      lastVisit: safeStr(col(row, 'Last Visit Date', 'LastVisitDate')),
      firstVisit: safeStr(col(row, 'First Visit Date', 'FirstVisitDate')),
      reservationCount: safeNum(col(row, '# of Reservations', 'ReservationCount')),
    })
  }

  return members
}

/** Map pre-parsed rows (from sheet_to_json) to ParsedSession objects for reservations */
export function mapReservationRows(rows: Record<string, any>[]): ParsedSession[] {
  const sessions: ParsedSession[] = []

  for (const row of rows) {
    const confirmationId = safeStr(col(row, 'Confirmation_#', 'Confirmation #', 'ConfirmationNumber', 'Confirmation'))
    if (!confirmationId) continue

    const resType = safeStr(col(row, 'Reservation Type', 'ReservationType', 'Type'))
    const startDateVal = col(row, 'Start Date/Time', 'StartDateTime', 'Start Date', 'Start_Date')
    const endDateVal = col(row, 'End Date/Time', 'EndDateTime', 'End Date', 'End_Date')
    const courts = safeStr(col(row, 'Courts', 'Court', 'CourtName'))
    const members = safeStr(col(row, 'Members', 'Players', 'Player Names'))
    const membersCount = safeNum(col(row, 'Members Count', 'MembersCount', 'Player Count')) || 0
    const feeAmount = safeNum(col(row, 'Fee Amount', 'FeeAmount', 'Fee'))

    const startDate = parseDateFromExcel(startDateVal)
    if (!startDate) continue

    const endDate = parseDateFromExcel(endDateVal)

    // Parse member names from comma/semicolon separated string
    const memberNames = members
      ? members.split(/[,;]/).map((n: string) => n.trim()).filter(Boolean)
      : []

    sessions.push({
      externalId: confirmationId,
      date: startDate,
      startTime: parseTimeFromExcel(startDateVal),
      endTime: endDate ? parseTimeFromExcel(endDateVal) : parseTimeFromExcel(startDateVal),
      courtName: courts.split(',')[0]?.trim(),
      format: mapFormat(resType),
      skillLevel: 'ALL_LEVELS',
      memberNames,
      memberExternalIds: [],
      memberCount: membersCount || memberNames.length,
      price: feeAmount,
      isCancelled: false,
      title: `${resType || 'Court Booking'} — ${courts.split(',')[0]?.trim() || 'Court'}`,
    })
  }

  return sessions
}

/** Map pre-parsed rows (from sheet_to_json) to ParsedSession objects for events */
export function mapEventRows(rows: Record<string, any>[]): ParsedSession[] {
  const sessions: ParsedSession[] = []

  // Group by Programming Name + Date to create unique sessions
  const sessionMap = new Map<string, ParsedSession>()

  for (const row of rows) {
    const progName = safeStr(col(row, 'Programming Name', 'ProgrammingName', 'Name'))
    const progDate = col(row, 'Programming Date', 'ProgrammingDate', 'Date')
    const memberNum = safeStr(col(row, 'Member Number', 'Member_Number', 'Member #'))
    const memberName = [
      safeStr(col(row, 'Member First Name', 'First Name', 'FirstName')),
      safeStr(col(row, 'Member Last Name', 'Last Name', 'LastName')),
    ].filter(Boolean).join(' ')

    if (!progName) continue

    const date = parseDateFromExcel(progDate)
    if (!date) continue

    const dateKey = `${progName}__${date.toISOString().split('T')[0]}`
    const startTimeVal = col(row, 'Start DateTime', 'StartDateTime', 'Programming Time', 'Start Time')
    const endTimeVal = col(row, 'End DateTime', 'EndDateTime', 'End Time')
    const category = safeStr(col(row, 'Programming Category', 'Category'))
    const courts = safeStr(col(row, 'Programming Courts', 'Courts'))
    const price = safeNum(col(row, 'Programming Price', 'Price'))
    const skill = safeStr(col(row, 'Skill Level', 'SkillLevel'))

    if (!sessionMap.has(dateKey)) {
      sessionMap.set(dateKey, {
        externalId: `event_${dateKey}`,
        date,
        startTime: parseTimeFromExcel(startTimeVal),
        endTime: endTimeVal ? parseTimeFromExcel(endTimeVal) : parseTimeFromExcel(startTimeVal),
        courtName: courts.split(',')[0]?.trim(),
        format: mapFormat(category || progName),
        skillLevel: mapSkillLevel(skill),
        memberNames: [],
        memberExternalIds: [],
        memberCount: 0,
        price,
        isCancelled: false,
        title: `${progName} — ${courts.split(',')[0]?.trim() || 'Court'}`,
      })
    }

    const session = sessionMap.get(dateKey)!
    if (memberName) session.memberNames.push(memberName)
    if (memberNum) session.memberExternalIds.push(memberNum)
    session.memberCount = session.memberNames.length
  }

  sessionMap.forEach(session => {
    sessions.push(session)
  })

  return sessions
}

export function parseMembersExcel(base64Data: string): ParsedMember[] {
  const wb = parseWorkbook(base64Data)
  const rows = getRows(wb)
  return mapMemberRows(rows)
}

export function parseReservationsExcel(base64Data: string): ParsedSession[] {
  const wb = parseWorkbook(base64Data)
  const rows = getRows(wb)
  return mapReservationRows(rows)
}

export function parseEventsExcel(base64Data: string): ParsedSession[] {
  const wb = parseWorkbook(base64Data)
  const rows = getRows(wb)
  return mapEventRows(rows)
}

// ── Main Import Orchestrator ──

/** Shared pipeline: courts → members → sessions + bookings → upload marker */
async function _runImportPipeline(
  clubId: string,
  partnerId: string,
  parsedMembers: ParsedMember[],
  parsedSessions: ParsedSession[],
  result: ExcelImportResult
): Promise<void> {
  // 1. Extract courts from sessions
  const courtNames = new Set<string>()
  for (const s of parsedSessions) {
    if (s.courtName) courtNames.add(s.courtName)
  }

  // Create/update courts
  for (const courtName of Array.from(courtNames)) {
    try {
      const externalId = `court_${courtName.replace(/\s+/g, '_').toLowerCase()}`
      const existingId = await getInternalId(partnerId, ExternalEntityType.COURT, externalId)

      const courtType = courtName.toLowerCase().includes('pickleball') ? 'Pickleball'
        : courtName.toLowerCase().includes('tennis') ? 'Tennis' : null

      if (existingId) {
        await prisma.clubCourt.update({
          where: { id: existingId },
          data: { name: courtName, courtType },
        })
        result.courts.updated++
      } else {
        const newCourt = await prisma.clubCourt.create({
          data: { clubId, name: courtName, courtType, isActive: true },
        })
        await setMapping(partnerId, ExternalEntityType.COURT, externalId, newCourt.id)
        result.courts.created++
      }
    } catch (err: any) {
      console.error(`[Excel Import] Court "${courtName}" error:`, err.message)
      result.courts.errors++
    }
  }

  // 2. Import members
  for (const member of parsedMembers) {
    try {
      if (!member.email) continue
      const email = member.email.toLowerCase().trim()
      let userId = await getInternalId(partnerId, ExternalEntityType.MEMBER, member.externalId)

      if (!userId) {
        // Try email match
        const existing = await prisma.user.findUnique({
          where: { email },
          select: { id: true },
        })
        if (existing) {
          userId = existing.id
          await setMapping(partnerId, ExternalEntityType.MEMBER, member.externalId, userId)
          result.members.matched++
        }
      }

      const userData: any = {
        email,
        name: member.name || undefined,
        phone: member.phone || undefined,
        gender: member.gender || undefined,
        city: member.city || undefined,
      }
      if (member.duprSingles !== undefined) userData.duprRatingSingles = member.duprSingles
      if (member.duprDoubles !== undefined) userData.duprRatingDoubles = member.duprDoubles

      if (userId) {
        await prisma.user.update({ where: { id: userId }, data: userData })
        result.members.updated++
      } else {
        const newUser = await prisma.user.create({ data: userData })
        userId = newUser.id
        await setMapping(partnerId, ExternalEntityType.MEMBER, member.externalId, userId)
        result.members.created++
      }

      // Ensure ClubFollower
      await prisma.clubFollower.upsert({
        where: { clubId_userId: { clubId, userId } },
        create: { clubId, userId },
        update: {},
      })
    } catch (err: any) {
      console.error(`[Excel Import] Member ${member.externalId} error:`, err.message)
      result.members.errors++
    }
  }

  // Build name→userId lookup for booking matching
  const nameToUserIdMap = new Map<string, string>()
  const memberIdToUserIdMap = new Map<string, string>()
  for (const member of parsedMembers) {
    if (member.name) {
      const userId = await getInternalId(partnerId, ExternalEntityType.MEMBER, member.externalId)
      if (userId) {
        nameToUserIdMap.set(member.name.toLowerCase(), userId)
        memberIdToUserIdMap.set(member.externalId, userId)
      }
    }
  }

  // 3. Import sessions + bookings
  for (const session of parsedSessions) {
    try {
      const externalId = session.externalId
      let sessionId = await getInternalId(partnerId, ExternalEntityType.PLAY_SESSION, externalId)

      // Resolve court
      let courtId: string | undefined
      if (session.courtName) {
        const courtExtId = `court_${session.courtName.replace(/\s+/g, '_').toLowerCase()}`
        const cId = await getInternalId(partnerId, ExternalEntityType.COURT, courtExtId)
        if (cId) courtId = cId
      }

      const sessionData: any = {
        clubId,
        courtId: courtId || undefined,
        title: session.title,
        date: session.date,
        startTime: session.startTime,
        endTime: session.endTime,
        format: session.format as any,
        skillLevel: session.skillLevel as any,
        maxPlayers: Math.max(session.memberCount, 4),
        registeredCount: session.isCancelled ? 0 : session.memberCount,
        pricePerSlot: session.price ?? undefined,
        status: session.isCancelled ? 'CANCELLED' : 'COMPLETED',
      }

      if (sessionId) {
        await prisma.playSession.update({ where: { id: sessionId }, data: sessionData })
        result.sessions.updated++
      } else {
        const newSession = await prisma.playSession.create({ data: sessionData })
        sessionId = newSession.id
        await setMapping(partnerId, ExternalEntityType.PLAY_SESSION, externalId, sessionId)
        result.sessions.created++
      }

      // Create bookings from member external IDs
      for (const memberId of session.memberExternalIds) {
        try {
          const userId = memberIdToUserIdMap.get(memberId)
            || await getInternalId(partnerId, ExternalEntityType.MEMBER, memberId)
          if (!userId) continue

          const existing = await prisma.playSessionBooking.findUnique({
            where: { sessionId_userId: { sessionId, userId } },
          })

          if (existing) {
            result.bookings.updated++
          } else {
            await prisma.playSessionBooking.create({
              data: {
                sessionId,
                userId,
                status: session.isCancelled ? 'CANCELLED' : 'CONFIRMED',
                bookedAt: session.date,
              },
            })
            result.bookings.created++
          }
        } catch (err: any) {
          result.bookings.errors++
        }
      }

      // Fallback: match by member names if no external IDs
      if (session.memberExternalIds.length === 0) {
        for (const memberName of session.memberNames) {
          try {
            const userId = nameToUserIdMap.get(memberName.toLowerCase())
            if (!userId) continue

            const existing = await prisma.playSessionBooking.findUnique({
              where: { sessionId_userId: { sessionId, userId } },
            })

            if (existing) {
              result.bookings.updated++
            } else {
              await prisma.playSessionBooking.create({
                data: {
                  sessionId,
                  userId,
                  status: 'CONFIRMED',
                  bookedAt: session.date,
                },
              })
              result.bookings.created++
            }
          } catch (err: any) {
            result.bookings.errors++
          }
        }
      }
    } catch (err: any) {
      console.error(`[Excel Import] Session ${session.externalId} error:`, err.message)
      result.sessions.errors++
    }
  }

  // 4. Create an upload history marker so the dashboard Data Uploads section reflects this import
  if (result.sessions.created + result.sessions.updated > 0 || result.members.created + result.members.updated > 0) {
    try {
      const importBatchId = `excel-${Date.now()}`
      const sessionCount = result.sessions.created + result.sessions.updated
      const meta = JSON.stringify({
        importBatchId,
        sourceFileName: 'CourtReserve Excel',
        membersImported: result.members.created + result.members.updated,
        sessionsImported: sessionCount,
        bookingsImported: result.bookings.created,
      })
      const content = `CourtReserve Excel import: ${result.members.created + result.members.updated} members, ${sessionCount} sessions, ${result.bookings.created} bookings`
      await prisma.$executeRaw`
        INSERT INTO document_embeddings (id, club_id, content, content_type, metadata, embedding, source_id, source_table, chunk_index)
        VALUES (
          gen_random_uuid(),
          ${clubId}::uuid,
          ${content},
          'import_marker',
          ${meta}::jsonb,
          array_fill(0, ARRAY[1536])::vector(1536),
          ${importBatchId},
          'play_sessions',
          0
        )
      `
    } catch (err) {
      console.warn('[Excel Import] Upload history marker failed (non-critical):', err)
    }
  }
}

/**
 * Import from pre-parsed rows (browser-side xlsx parsing).
 * Accepts rows already extracted via sheet_to_json — no base64 needed.
 */
export async function runCourtReserveRowImport(
  clubId: string,
  files: { type: string; rows: Record<string, any>[] }[]
): Promise<ExcelImportResult> {
  const partnerId = await ensurePartner(clubId)

  const result: ExcelImportResult = {
    courts: { created: 0, updated: 0, errors: 0 },
    members: { created: 0, updated: 0, matched: 0, errors: 0 },
    sessions: { created: 0, updated: 0, errors: 0 },
    bookings: { created: 0, updated: 0, errors: 0 },
  }

  let parsedMembers: ParsedMember[] = []
  let parsedSessions: ParsedSession[] = []

  for (const file of files) {
    switch (file.type) {
      case 'members':
        parsedMembers = mapMemberRows(file.rows)
        console.log(`[Excel Import] Mapped ${parsedMembers.length} members from rows`)
        break
      case 'reservations':
        parsedSessions.push(...mapReservationRows(file.rows))
        console.log(`[Excel Import] Mapped ${parsedSessions.length} reservations from rows`)
        break
      case 'events':
        parsedSessions.push(...mapEventRows(file.rows))
        console.log(`[Excel Import] Mapped ${parsedSessions.length} event sessions from rows`)
        break
    }
  }

  await _runImportPipeline(clubId, partnerId, parsedMembers, parsedSessions, result)
  return result
}

export async function runCourtReserveExcelImport(
  clubId: string,
  files: { type: string; data: string }[]
): Promise<ExcelImportResult> {
  const partnerId = await ensurePartner(clubId)

  const result: ExcelImportResult = {
    courts: { created: 0, updated: 0, errors: 0 },
    members: { created: 0, updated: 0, matched: 0, errors: 0 },
    sessions: { created: 0, updated: 0, errors: 0 },
    bookings: { created: 0, updated: 0, errors: 0 },
  }

  // Parse all files first
  let parsedMembers: ParsedMember[] = []
  let parsedSessions: ParsedSession[] = []

  for (const file of files) {
    switch (file.type) {
      case 'members':
        parsedMembers = parseMembersExcel(file.data)
        console.log(`[Excel Import] Parsed ${parsedMembers.length} members`)
        break
      case 'reservations':
        parsedSessions.push(...parseReservationsExcel(file.data))
        console.log(`[Excel Import] Parsed ${parsedSessions.length} reservations`)
        break
      case 'events':
        parsedSessions.push(...parseEventsExcel(file.data))
        console.log(`[Excel Import] Parsed ${parsedSessions.length} event sessions`)
        break
    }
  }

  await _runImportPipeline(clubId, partnerId, parsedMembers, parsedSessions, result)
  return result
}

// ── Partner Setup ──

async function ensurePartner(clubId: string): Promise<string> {
  const partnerCode = getPartnerId(clubId)
  let partner = await prisma.partner.findUnique({ where: { code: partnerCode } })

  if (!partner) {
    const crypto = await import('crypto')
    partner = await prisma.partner.create({
      data: {
        name: `CourtReserve Excel Import (${clubId.substring(0, 8)})`,
        code: partnerCode,
        status: 'ACTIVE',
      },
    })
    await prisma.partnerApp.create({
      data: {
        partnerId: partner.id,
        environment: 'PRODUCTION',
        keyId: `crx_${clubId.substring(0, 8)}_${crypto.randomBytes(4).toString('hex')}`,
        secretHash: 'excel-import-internal',
        status: 'ACTIVE',
        scopes: ['connector:import'],
      },
    })
  }

  return partner.id
}
