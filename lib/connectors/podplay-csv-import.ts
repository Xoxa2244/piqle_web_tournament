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

function parseDateStr(val: any): string | undefined {
  const s = safeStr(val)
  if (!s) return undefined
  try {
    const d = new Date(s)
    if (!isNaN(d.getTime()) && d.getFullYear() > 1900 && d.getFullYear() < 2020) {
      return d.toISOString().slice(0, 10)
    }
  } catch {}
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
      dateOfBirth: parseDateStr(row['Birthday']),
      age: safeNum(row['Age']),
      duprSingles,
      duprDoubles,
    })
  }

  return members
}

// ── Settlement Line Items CSV → ParsedSession[] ──

export function mapPodPlaySettlements(rows: Record<string, any>[]): ParsedSession[] {
  // Group by: Description + Date (truncated to hour) = one session
  // Each row with same group = one participant
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
    const dateStr = safeStr(row['Date (UTC)'])
    if (!dateStr) continue

    const date = new Date(dateStr)
    if (isNaN(date.getTime())) continue

    const description = safeStr(row['Description'])
    const email = safeStr(row['Email']).toLowerCase()
    const category = safeStr(row['Category'])
    const eventType = safeStr(row['Event Type'])
    const price = safeNum(row['Unit Price']) || 0

    // Skip membership charges — they're not sessions
    if (category === 'Membership' || description.toLowerCase().startsWith('membership')) continue
    // Skip refunds
    if (safeStr(row['Type']) === 'refund') continue

    // Group key: description + date truncated to hour
    const hourKey = `${date.toISOString().slice(0, 13)}`
    const groupKey = `${description}__${hourKey}`

    if (!sessionGroups.has(groupKey)) {
      sessionGroups.set(groupKey, {
        date,
        title: description.replace(/^Event signup - /, ''),
        format: mapFormat(eventType || description),
        category: category || eventType || '',
        price,
        emails: [],
        isCancelled: false,
      })
    }

    const group = sessionGroups.get(groupKey)!
    if (email && email.includes('@') && !group.emails.includes(email)) {
      group.emails.push(email)
    }
  }

  // Convert groups to ParsedSession[]
  const sessions: ParsedSession[] = []
  sessionGroups.forEach((group, key) => {
    if (group.emails.length === 0) return

    const startTime = `${group.date.getUTCHours().toString().padStart(2, '0')}:${group.date.getUTCMinutes().toString().padStart(2, '0')}`
    const endHour = group.date.getUTCHours() + 1
    const endTime = `${endHour.toString().padStart(2, '0')}:${group.date.getUTCMinutes().toString().padStart(2, '0')}`

    sessions.push({
      externalId: key.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100),
      date: group.date,
      startTime,
      endTime,
      format: group.format,
      skillLevel: 'ALL_LEVELS',
      memberNames: group.emails, // We'll resolve by email in pipeline
      memberExternalIds: group.emails, // Use email as external ID (matches member externalId)
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
