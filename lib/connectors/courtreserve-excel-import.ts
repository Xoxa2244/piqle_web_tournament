/**
 * CourtReserve Excel bulk importer.
 * Parses Excel exports and upserts into IQSport models.
 * Reuses mapping logic from courtreserve-sync.ts.
 */
import { prisma } from '@/lib/prisma'
import { ExternalEntityType } from '@prisma/client'
import * as XLSX from 'xlsx'
import { generateMemberProfilesForClub } from '@/lib/ai/member-profile-generator'

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
  category?: string
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
  if (lower.includes('tournament')) return 'LEAGUE_PLAY'
  if (lower.includes('private lesson') || lower.includes('lesson')) return 'CLINIC'
  if (lower.includes('class') || lower.includes('instructional')) return 'CLINIC'
  if (lower.includes('doubles')) return 'OPEN_PLAY'
  if (lower.includes('singles')) return 'OPEN_PLAY'
  if (lower.includes('ball machine')) return 'DRILL'
  if (lower.includes('open play')) return 'OPEN_PLAY'
  // Skill-level based open play: "Intermediate (3.0-3.49)", "Competitive", "Advanced", "Casual", "Beginner"
  if (lower.includes('intermediate') || lower.includes('competitive') || lower.includes('advanced') || lower.includes('casual') || lower.includes('beginner')) return 'OPEN_PLAY'
  if (lower.includes('skill assessment') || lower.includes('dupr')) return 'CLINIC'
  if (lower.includes('special event')) return 'SOCIAL'
  if (lower.includes('badminton')) return 'OPEN_PLAY'
  return 'OPEN_PLAY'
}

function mapSkillLevel(skill?: string): string {
  if (!skill) return 'ALL_LEVELS'
  const lower = skill.toLowerCase()
  if (lower.includes('beginner') || lower.includes('casual') || lower.includes('2.0') || lower.includes('2.5')) return 'BEGINNER'
  if (lower.includes('intermediate') || lower.includes('competitive') || lower.includes('3.0') || lower.includes('3.5')) return 'INTERMEDIATE'
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

    // Parse "Name (#MemberID), Name (#MemberID)" format
    const memberNames: string[] = []
    const memberExternalIds: string[] = []
    if (members) {
      for (const entry of members.split(',')) {
        const match = entry.trim().match(/^(.+?)\s*\(#([^)]+)\)$/)
        if (match) {
          memberNames.push(match[1].trim())
          memberExternalIds.push(match[2].trim())
        } else {
          const name = entry.trim()
          if (name) memberNames.push(name)
        }
      }
    }

    sessions.push({
      externalId: confirmationId,
      date: startDate,
      startTime: parseTimeFromExcel(startDateVal),
      endTime: endDate ? parseTimeFromExcel(endDateVal) : parseTimeFromExcel(startDateVal),
      courtName: courts.split(',')[0]?.trim(),
      format: mapFormat(resType),
      skillLevel: mapSkillLevel(resType),
      memberNames,
      memberExternalIds,
      memberCount: membersCount || memberNames.length,
      price: feeAmount,
      isCancelled: false,
      title: `${resType || 'Court Booking'} — ${courts.split(',')[0]?.trim() || 'Court'}`,
      category: resType || undefined,
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
        skillLevel: mapSkillLevel(skill || category),
        memberNames: [],
        memberExternalIds: [],
        memberCount: 0,
        price,
        isCancelled: false,
        title: `${progName} — ${courts.split(',')[0]?.trim() || 'Court'}`,
        category: category || progName || undefined,
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

/** Shared pipeline: courts → members → sessions + bookings → upload marker.
 *  Optimised: bulk pre-fetch mappings, parallel batches, createMany for bookings.
 *  ~10-15s for 1500 members + 1800 sessions instead of sequential 33k queries. */
async function _runImportPipeline(
  clubId: string,
  partnerId: string,
  parsedMembers: ParsedMember[],
  parsedSessions: ParsedSession[],
  result: ExcelImportResult
): Promise<void> {

  // ── 0. Bulk pre-fetch all existing ID mappings ──
  const [memberMappings, sessionMappings, courtMappings] = await Promise.all([
    prisma.externalIdMapping.findMany({ where: { partnerId, entityType: ExternalEntityType.MEMBER } }),
    prisma.externalIdMapping.findMany({ where: { partnerId, entityType: ExternalEntityType.PLAY_SESSION } }),
    prisma.externalIdMapping.findMany({ where: { partnerId, entityType: ExternalEntityType.COURT } }),
  ])
  const memberIdMap = new Map(memberMappings.map(m => [m.externalId, m.internalId]))
  const sessionIdMap = new Map(sessionMappings.map(m => [m.externalId, m.internalId]))
  const courtIdMap = new Map(courtMappings.map(m => [m.externalId, m.internalId]))

  // ── 1. Courts (small set, sequential is fine) ──
  const courtNames = Array.from(new Set(parsedSessions.map(s => s.courtName).filter(Boolean) as string[]))
  for (const courtName of courtNames) {
    try {
      const externalId = `court_${courtName.replace(/\s+/g, '_').toLowerCase()}`
      const existingId = courtIdMap.get(externalId)
      const courtType = courtName.toLowerCase().includes('pickleball') ? 'Pickleball'
        : courtName.toLowerCase().includes('tennis') ? 'Tennis' : null

      if (existingId) {
        await prisma.clubCourt.update({ where: { id: existingId }, data: { name: courtName, courtType } })
        result.courts.updated++
      } else {
        const newCourt = await prisma.clubCourt.create({ data: { clubId, name: courtName, courtType, isActive: true } })
        await setMapping(partnerId, ExternalEntityType.COURT, externalId, newCourt.id)
        courtIdMap.set(externalId, newCourt.id)
        result.courts.created++
      }
    } catch (err: any) {
      result.courts.errors++
    }
  }

  // ── 2. Members — bulk email lookup + parallel batches ──
  const emailList = Array.from(new Set(parsedMembers.map(m => m.email.toLowerCase().trim()).filter(Boolean)))
  const existingUsers = emailList.length > 0
    ? await prisma.user.findMany({ where: { email: { in: emailList } }, select: { id: true, email: true } })
    : []
  const emailToUserId = new Map(existingUsers.map(u => [u.email, u.id]))

  const nameToUserIdMap = new Map<string, string>()
  const memberIdToUserIdMap = new Map<string, string>()

  const MEMBER_BATCH = 10
  for (let i = 0; i < parsedMembers.length; i += MEMBER_BATCH) {
    await Promise.all(parsedMembers.slice(i, i + MEMBER_BATCH).map(async (member) => {
      try {
        if (!member.email) return
        const email = member.email.toLowerCase().trim()
        let userId = memberIdMap.get(member.externalId) ?? emailToUserId.get(email) ?? null

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
          result.members.created++
        }

        // Update caches
        memberIdMap.set(member.externalId, userId)
        emailToUserId.set(email, userId)
        if (member.name) nameToUserIdMap.set(member.name.toLowerCase(), userId)
        memberIdToUserIdMap.set(member.externalId, userId)

        // mapping + clubFollower in parallel
        await Promise.all([
          prisma.externalIdMapping.upsert({
            where: { partnerId_entityType_externalId: { partnerId, entityType: ExternalEntityType.MEMBER, externalId: member.externalId } },
            create: { partnerId, entityType: ExternalEntityType.MEMBER, externalId: member.externalId, internalId: userId },
            update: { internalId: userId },
          }),
          prisma.clubFollower.upsert({
            where: { clubId_userId: { clubId, userId } },
            create: { clubId, userId },
            update: {},
          }),
        ])
      } catch (err: any) {
        result.members.errors++
      }
    }))
  }

  // ── 3. Sessions + bookings — parallel batches, createMany for bookings ──
  const SESSION_BATCH = 5
  for (let i = 0; i < parsedSessions.length; i += SESSION_BATCH) {
    await Promise.all(parsedSessions.slice(i, i + SESSION_BATCH).map(async (session) => {
      try {
        const externalId = session.externalId
        let sessionId = sessionIdMap.get(externalId) ?? null

        const courtExtId = session.courtName
          ? `court_${session.courtName.replace(/\s+/g, '_').toLowerCase()}` : null
        const courtId = courtExtId ? (courtIdMap.get(courtExtId) ?? undefined) : undefined

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
          category: session.category ?? null,
        }

        if (sessionId) {
          await prisma.playSession.update({ where: { id: sessionId }, data: sessionData })
          result.sessions.updated++
        } else {
          const newSession = await prisma.playSession.create({ data: sessionData })
          sessionId = newSession.id
          await prisma.externalIdMapping.upsert({
            where: { partnerId_entityType_externalId: { partnerId, entityType: ExternalEntityType.PLAY_SESSION, externalId } },
            create: { partnerId, entityType: ExternalEntityType.PLAY_SESSION, externalId, internalId: sessionId },
            update: { internalId: sessionId },
          })
          sessionIdMap.set(externalId, sessionId)
          result.sessions.created++
        }

        // Resolve booking userIds from caches (no extra DB queries)
        const bookingUserIds: string[] = []
        const seen = new Set<string>()
        const addUser = (uid: string | undefined) => {
          if (uid && !seen.has(uid)) { seen.add(uid); bookingUserIds.push(uid) }
        }
        for (const memberId of session.memberExternalIds) {
          addUser(memberIdToUserIdMap.get(memberId) ?? memberIdMap.get(memberId))
        }
        if (bookingUserIds.length === 0) {
          for (const name of session.memberNames) {
            addUser(nameToUserIdMap.get(name.toLowerCase()))
          }
        }

        // Batch insert bookings — skipDuplicates handles re-runs
        if (bookingUserIds.length > 0) {
          const { count } = await prisma.playSessionBooking.createMany({
            data: bookingUserIds.map(userId => ({
              sessionId: sessionId!,
              userId,
              status: (session.isCancelled ? 'CANCELLED' : 'CONFIRMED') as any,
              bookedAt: session.date,
            })),
            skipDuplicates: true,
          })
          result.bookings.created += count
          result.bookings.updated += bookingUserIds.length - count
        }
      } catch (err: any) {
        console.error(`[Excel Import] Session ${session.externalId} error:`, err.message)
        result.sessions.errors++
      }
    }))
  }

  // ── 4. Upload history marker ──
  // Always create a marker if any rows were attempted (even if all were duplicates)
  if (parsedMembers.length > 0 || parsedSessions.length > 0) {
    try {
      const importBatchId = `excel-${Date.now()}`
      const sessionCount = result.sessions.created + result.sessions.updated
      const memberCount = result.members.created + result.members.updated
      const meta = JSON.stringify({
        importBatchId,
        sourceFileName: 'CourtReserve Excel',
        membersImported: memberCount,
        membersAttempted: parsedMembers.length,
        sessionsImported: sessionCount,
        sessionsAttempted: parsedSessions.length,
        bookingsImported: result.bookings.created,
      })
      const content = `CourtReserve Excel import: ${memberCount} members, ${sessionCount} sessions, ${result.bookings.created} bookings (attempted: ${parsedMembers.length} members, ${parsedSessions.length} sessions)`
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

  // ── Fire-and-forget: generate AI member profiles after import ──
  if (result.members.created + result.members.updated > 0 || result.sessions.created > 0) {
    generateMemberProfilesForClub(prisma, clubId, { batchSize: 10, delayMs: 300 })
      .then(r => console.log(`[AI Profiles] Post-import generation done: ${r.generated} generated, ${r.errors} errors`))
      .catch(err => console.error('[AI Profiles] Post-import generation failed:', err instanceof Error ? err.message : err))
  }

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
