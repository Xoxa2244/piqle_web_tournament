/**
 * PodPlay CSV importer.
 * Parses PodPlay Customers CSV + Settlement Line Items CSV → IQSport models.
 * Reuses shared pipeline from courtreserve-excel-import.ts.
 */
import { prisma } from '@/lib/prisma'
import { generateMemberProfilesForClub } from '@/lib/ai/member-profile-generator'
import {
  type ParsedMember,
  type ParsedSession,
  type ExcelImportResult,
  _runImportPipeline,
  ensurePartner,
  mapFormat,
} from '@/lib/connectors/courtreserve-excel-import'

const PARTNER_PREFIX = 'pp' // PodPlay prefix

// ── Helpers ──

function safeStr(val: any): string {
  return (val ?? '').toString().trim()
}

function safeNum(val: any): number | undefined {
  if (val === null || val === undefined || val === '' || val === 'Not Rated') return undefined
  const n = parseFloat(String(val))
  return isNaN(n) ? undefined : n
}

/** Parse date from string or Excel serial number */
function parseAnyDate(val: any): Date | null {
  if (val === null || val === undefined || val === '') return null
  // Excel serial number (e.g. 46056.927)
  if (typeof val === 'number' && val > 30000 && val < 60000) {
    // Excel epoch: Jan 0, 1900 (with the Lotus 123 bug: day 60 = Feb 29, 1900 which doesn't exist)
    const excelEpoch = new Date(1899, 11, 30) // Dec 30, 1899
    const d = new Date(excelEpoch.getTime() + val * 86400000)
    if (!isNaN(d.getTime())) return d
  }
  const s = String(val).trim()
  if (!s) return null
  const d = new Date(s)
  if (!isNaN(d.getTime())) return d
  return null
}

function parseDateStr(val: any): string | undefined {
  const d = parseAnyDate(val)
  if (!d) return undefined
  if (d.getFullYear() > 1900 && d.getFullYear() < 2020) return d.toISOString().slice(0, 10)
  return undefined
}

// ── Customers CSV → ParsedMember[] ──

export function mapPodPlayCustomers(rows: Record<string, any>[]): ParsedMember[] {
  const members: ParsedMember[] = []

  for (const row of rows) {
    const email = safeStr(row['Email']).toLowerCase()
    if (!email || !email.includes('@')) continue

    const firstName = safeStr(row['First Name'])
    const lastName = safeStr(row['Last Name'])
    const name = [firstName, lastName].filter(Boolean).join(' ')
    if (!name) continue

    const genderRaw = safeStr(row['Gender']).toLowerCase()
    const gender = genderRaw.startsWith('m') ? 'M' as const
      : genderRaw.startsWith('f') ? 'F' as const
      : undefined

    const phone = safeStr(row['Phone Number']).replace(/[^\d+]/g, '') || undefined

    // Location: "Amsterdam, NY" → city
    const location = safeStr(row['Locations'])
    const city = location.split(',')[0]?.trim() || undefined

    const membership = safeStr(row['Membership']) || undefined
    const membershipStatus = safeStr(row['Membership Status']) || undefined

    const duprSingles = safeNum(row['Ratings Singles'])
    const duprDoubles = safeNum(row['Ratings Doubles'])

    members.push({
      externalId: email, // PodPlay doesn't have member IDs in CSV, use email
      email,
      name,
      firstName,
      lastName,
      phone,
      gender,
      city,
      membership,
      membershipStatus,
      dateOfBirth: parseDateStr(row['Birthday'] ?? row['Date Of Birth']),
      age: safeNum(row['Age']),
      duprSingles,
      duprDoubles,
    })
  }

  return members
}

// ── Settlements CSV → ParsedSession[] ──
// Uses the full Settlements.csv (not Line Items) which has Event Name, Event Date, Customer Name

export function mapPodPlaySettlements(rows: Record<string, any>[]): ParsedSession[] {
  // Group by: Event Name + Event Date = one session
  // Each row = one participant
  const sessionGroups = new Map<string, {
    date: Date
    title: string
    format: string
    category: string
    price: number
    emails: string[]
    isCancelled: boolean
  }>()

  for (const row of rows) {
    // Settlements.csv has: Source, Event Type, Event Name, Event Date, Email, Customer Name, etc.
    const source = safeStr(row['Source'] || row['Revenue Category'] || row['Category'])
    const reportingCategory = safeStr(row['Reporting Category'] || row['Type'])

    // Skip memberships and refunds — not play sessions
    if (source === 'MEMBERSHIP' || source === 'Membership') continue
    if (reportingCategory === 'refund') continue

    const email = safeStr(row['Email']).toLowerCase()
    if (!email || !email.includes('@')) continue

    const eventType = safeStr(row['Event Type'])
    const eventName = safeStr(row['Event Name'] || row['Description'])
    const eventDateRaw = row['Event Date'] ?? row['Date (UTC)']
    if (!eventDateRaw && eventDateRaw !== 0) continue

    const eventDate = parseAnyDate(eventDateRaw)
    if (!eventDate) continue

    const price = safeNum(row['Subtotal'] || row['Gross'] || row['Unit Price']) || 0
    const title = eventName.replace(/^Event signup - /, '') || eventType || 'Session'

    // Group key: event name + event date (truncated to hour)
    const hourKey = eventDate.toISOString().slice(0, 13)
    const groupKey = `${title}__${hourKey}`

    if (!sessionGroups.has(groupKey)) {
      sessionGroups.set(groupKey, {
        date: eventDate,
        title,
        format: mapFormat(eventType || eventName),
        category: eventType || source || '',
        price,
        emails: [],
        isCancelled: false,
      })
    }

    const group = sessionGroups.get(groupKey)!
    if (!group.emails.includes(email)) {
      group.emails.push(email)
    }
  }

  // Convert groups to ParsedSession[]
  const sessions: ParsedSession[] = []
  sessionGroups.forEach((group, key) => {
    if (group.emails.length === 0) return

    const startTime = `${group.date.getUTCHours().toString().padStart(2, '0')}:${group.date.getUTCMinutes().toString().padStart(2, '0')}`
    const endHour = Math.min(group.date.getUTCHours() + 1, 23)
    const endTime = `${endHour.toString().padStart(2, '0')}:${group.date.getUTCMinutes().toString().padStart(2, '0')}`

    sessions.push({
      externalId: key.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100),
      date: group.date,
      startTime,
      endTime,
      format: group.format,
      skillLevel: 'ALL_LEVELS',
      memberNames: group.emails,
      memberExternalIds: group.emails,
      memberCount: group.emails.length,
      price: group.price,
      isCancelled: group.isCancelled,
      title: group.title,
      category: group.category,
    })
  })

  return sessions
}

// ── Main Entry Point ──

export async function runPodPlayImport(
  clubId: string,
  files: { type: 'customers' | 'settlements'; rows: Record<string, any>[] }[]
): Promise<ExcelImportResult> {
  const partnerId = await ensurePartner(clubId, PARTNER_PREFIX, 'PodPlay CSV Import')

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
      case 'customers':
        parsedMembers = mapPodPlayCustomers(file.rows)
        console.log(`[PodPlay Import] Mapped ${parsedMembers.length} customers`)
        break
      case 'settlements':
        parsedSessions = mapPodPlaySettlements(file.rows)
        console.log(`[PodPlay Import] Mapped ${parsedSessions.length} sessions from settlements`)
        break
    }
  }

  await _runImportPipeline(clubId, partnerId, parsedMembers, parsedSessions, result)

  // Fire-and-forget: generate AI member profiles
  if (result.members.created + result.members.updated > 0) {
    generateMemberProfilesForClub(prisma, clubId, { batchSize: 10, delayMs: 300 })
      .then(r => console.log(`[PodPlay AI Profiles] Done: ${r.generated} generated`))
      .catch(err => console.error('[PodPlay AI Profiles] Failed:', err instanceof Error ? err.message : err))
  }

  return result
}
