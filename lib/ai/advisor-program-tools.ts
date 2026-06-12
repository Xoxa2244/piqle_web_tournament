import 'server-only'

import { tool, jsonSchema, type ToolSet } from 'ai'
import { prisma } from '@/lib/prisma'
import { classifyProgramFamily, PROGRAM_FAMILY_META, type ProgramFamily } from '@/lib/ai/program-family-classifier'

/**
 * On-demand PROGRAM tools for the AI Advisor chat — closes the
 * conversion / clinic / league blind zone (160-prompt eval: 13/160
 * answered "no data" because the prefetch context carries no program
 * engagement and no intro→membership conversion signal).
 *
 *  - getProgramEngagement: attendance/repeat/top+lapsed players for one
 *    program family (CLINIC, LEAGUE, OPEN_PLAY, EVENTS, …).
 *  - getIntroConversion: who attended intro/beginner programs and whether
 *    they now hold an active membership — the honest "conversion" proxy
 *    (we don't have historical membership timelines, so this reports
 *    CURRENT membership of past intro attendees, not causality).
 *
 * Same conventions as advisor-member-tools.ts: jsonSchema inputs (the
 * zod-version mismatch workaround), TS-side family classification
 * (mirrors getProgramSessions / createCohortFromProgramContext), and
 * prod-safe SQL via prisma client only (no raw ::uuid casts).
 */

// AI SDK tool() overloads are strict with jsonSchema — cast to bypass TS.
const t = tool as (...args: any[]) => any

const FAMILIES: ProgramFamily[] = [
  'OPEN_PLAY', 'COURT_BOOKING', 'CLINIC', 'PRIVATE_LESSON',
  'LEAGUE', 'EVENTS', 'YOUTH', 'EQUIPMENT',
]

const INTRO_TITLE_RE = /(101|intro|beginner|learner|new\s?player|newcomer|first[-\s]?time|fundamentals|basics)/i

type SessionLite = { id: string; title: string | null; format: string; category: string | null; date: Date }

async function loadFamilySessions(clubId: string, sinceDays: number): Promise<SessionLite[]> {
  const since = new Date(Date.now() - sinceDays * 86_400_000)
  const sessions = await prisma.playSession.findMany({
    where: { clubId, date: { gte: since, lte: new Date() } },
    select: { id: true, title: true, format: true, category: true, date: true },
  })
  return sessions as SessionLite[]
}

async function confirmedAttendees(sessionIds: string[]): Promise<Map<string, { plays: number; last: Date | null }>> {
  const map = new Map<string, { plays: number; last: Date | null }>()
  if (sessionIds.length === 0) return map
  const bookings = await prisma.playSessionBooking.findMany({
    where: { sessionId: { in: sessionIds }, status: 'CONFIRMED' },
    select: { userId: true, playSession: { select: { date: true } } },
  })
  for (const b of bookings) {
    if (!b.userId) continue
    const cur = map.get(b.userId) ?? { plays: 0, last: null }
    cur.plays += 1
    const d = b.playSession?.date ?? null
    if (d && (!cur.last || d > cur.last)) cur.last = d
    map.set(b.userId, cur)
  }
  return map
}

async function userNames(userIds: string[]): Promise<Map<string, { name: string; membershipType: string | null; membershipStatus: string | null }>> {
  const map = new Map<string, { name: string; membershipType: string | null; membershipStatus: string | null }>()
  if (userIds.length === 0) return map
  // Chunk the IN list — clubs can have thousands of attendees.
  for (let i = 0; i < userIds.length; i += 1000) {
    const chunk = userIds.slice(i, i + 1000)
    const users = await prisma.user.findMany({
      where: { id: { in: chunk } },
      select: { id: true, name: true, email: true, membershipType: true, membershipStatus: true },
    })
    for (const u of users) {
      map.set(u.id, {
        name: u.name || u.email || 'Unknown',
        membershipType: (u as any).membershipType ?? null,
        membershipStatus: (u as any).membershipStatus ?? null,
      })
    }
  }
  return map
}

const daysAgo = (d: Date | null) => (d ? Math.floor((Date.now() - d.getTime()) / 86_400_000) : null)

const hasActiveMembership = (status: string | null) =>
  ['active', 'trial', 'trialing'].includes((status || '').toLowerCase())

export function createAdvisorProgramTools(clubId: string): ToolSet {
  return {
    getProgramEngagement: t({
      description:
        'Engagement report for ONE program family over a window: session count, unique players, repeat players, top attendees BY NAME, and lapsed players (attended in the prior window but not the current one — win-back targets). Use for any question about clinics, leagues, events, youth programs, private lessons or open play participation ("who plays leagues", "how are clinics doing", "who stopped coming to drills"). Families: OPEN_PLAY, CLINIC, LEAGUE, EVENTS, PRIVATE_LESSON, YOUTH, COURT_BOOKING.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          family: { type: 'string', enum: FAMILIES, description: 'Program family to report on.' },
          periodDays: { type: 'number', description: 'Window in days (7-180). Default 60. Lapsed = attended in the prior window of the same length but not in this one.' },
          listTop: { type: 'number', description: 'How many names per list (top attendees / lapsed). 1-25, default 10.' },
        },
        required: ['family'],
      }),
      execute: async (args: { family?: string; periodDays?: number; listTop?: number }) => {
        try {
          const family = (args.family || '') as ProgramFamily
          if (!FAMILIES.includes(family)) return { error: `Unknown family. Use one of: ${FAMILIES.join(', ')}` }
          const periodDays = Math.min(180, Math.max(7, Math.floor(args.periodDays ?? 60)))
          const listTop = Math.min(25, Math.max(1, Math.floor(args.listTop ?? 10)))

          const all = await loadFamilySessions(clubId, periodDays * 2)
          const fam = all.filter(s => classifyProgramFamily({ title: s.title, format: s.format as string, category: s.category }) === family)
          const cutoff = new Date(Date.now() - periodDays * 86_400_000)
          const currentIds = fam.filter(s => s.date >= cutoff).map(s => s.id)
          const priorIds = fam.filter(s => s.date < cutoff).map(s => s.id)

          const current = await confirmedAttendees(currentIds)
          const prior = await confirmedAttendees(priorIds)
          const lapsedIds = Array.from(prior.keys()).filter(id => !current.has(id))

          const nameMap = await userNames(Array.from(new Set(Array.from(current.keys()).concat(lapsedIds))))
          const top = Array.from(current.entries())
            .sort((a, b) => b[1].plays - a[1].plays)
            .slice(0, listTop)
            .map(([id, v]) => ({ name: nameMap.get(id)?.name ?? 'Unknown', plays: v.plays, lastAttendedDaysAgo: daysAgo(v.last) }))
          const lapsed = lapsedIds
            .map(id => ({ id, v: prior.get(id)! }))
            .sort((a, b) => b.v.plays - a.v.plays)
            .slice(0, listTop)
            .map(({ id, v }) => ({ name: nameMap.get(id)?.name ?? 'Unknown', playsInPriorWindow: v.plays, lastAttendedDaysAgo: daysAgo(v.last) }))

          const repeatPlayers = Array.from(current.values()).filter(v => v.plays >= 2).length
          return {
            family: PROGRAM_FAMILY_META[family]?.label ?? family,
            periodDays,
            sessions: currentIds.length,
            uniquePlayers: current.size,
            repeatPlayers,
            totalSignups: Array.from(current.values()).reduce((s, v) => s + v.plays, 0),
            lapsedCount: lapsedIds.length,
            topAttendees: top,
            lapsedPlayers: lapsed,
            note: `lapsedPlayers attended ${family} in the prior ${periodDays}d window but not in the current one — win-back targets. Lists are capped at ${listTop}; counts are exact. NEVER invent additional names.`,
          }
        } catch (err) {
          console.error('[Advisor getProgramEngagement] failed:', err instanceof Error ? err.message : err)
          return { error: 'Failed to load program engagement.' }
        }
      },
    }),

    getIntroConversion: t({
      description:
        'Intro/beginner program → membership funnel. Finds attendees of intro-style sessions (titles matching 101 / intro / beginner / learner / newcomer / first-time / fundamentals) in the window and reports who currently holds an ACTIVE membership vs who does not (names + recency) — the outreach list for converting newcomers. HONESTY: this is current membership of past intro attendees, not proven causality. Use for "how well do intro programs convert", "who took Pickleball 101 but never joined", "newcomer conversion".',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          periodDays: { type: 'number', description: 'Lookback window in days (14-365). Default 90.' },
          listTop: { type: 'number', description: 'How many names per list. 1-25, default 10.' },
        },
      }),
      execute: async (args: { periodDays?: number; listTop?: number }) => {
        try {
          const periodDays = Math.min(365, Math.max(14, Math.floor(args.periodDays ?? 90)))
          const listTop = Math.min(25, Math.max(1, Math.floor(args.listTop ?? 10)))

          const all = await loadFamilySessions(clubId, periodDays)
          const intro = all.filter(s => INTRO_TITLE_RE.test(s.title || ''))
          if (intro.length === 0) {
            return {
              periodDays,
              introSessions: 0,
              note: 'No intro/beginner-style sessions (titles matching 101/intro/beginner/learner/newcomer) found in this window.',
            }
          }

          const attendees = await confirmedAttendees(intro.map(s => s.id))
          const nameMap = await userNames(Array.from(attendees.keys()))

          const withMembership: Array<{ name: string; tier: string | null }> = []
          const withoutMembership: Array<{ name: string; introPlays: number; lastAttendedDaysAgo: number | null }> = []
          attendees.forEach((v, id) => {
            const u = nameMap.get(id)
            if (!u) return
            if (hasActiveMembership(u.membershipStatus) && u.membershipType) {
              withMembership.push({ name: u.name, tier: u.membershipType })
            } else {
              withoutMembership.push({ name: u.name, introPlays: v.plays, lastAttendedDaysAgo: daysAgo(v.last) })
            }
          })
          withoutMembership.sort((a, b) => (a.lastAttendedDaysAgo ?? 9999) - (b.lastAttendedDaysAgo ?? 9999))

          const programTitles = Array.from(new Set(intro.map(s => (s.title || '').trim()).filter(Boolean))).slice(0, 8)
          return {
            periodDays,
            introSessions: intro.length,
            introPrograms: programTitles,
            attendeesTotal: attendees.size,
            nowHoldActiveMembership: withMembership.length,
            currentMembershipRatePct: attendees.size > 0 ? Math.round((withMembership.length / attendees.size) * 100) : 0,
            notOnActiveMembership: withoutMembership.length,
            convertedSample: withMembership.slice(0, listTop),
            outreachList: withoutMembership.slice(0, listTop),
            note: `outreachList = intro attendees with NO active membership today (most recent first) — the conversion targets. "Conversion" here = currently holds an active membership; we cannot prove the intro caused it. Lists capped at ${listTop}; counts exact. NEVER invent names.`,
          }
        } catch (err) {
          console.error('[Advisor getIntroConversion] failed:', err instanceof Error ? err.message : err)
          return { error: 'Failed to load intro conversion data.' }
        }
      },
    }),
  }
}
