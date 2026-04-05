/**
 * Gender inference for club members — two-pass approach:
 *
 * Pass 1: Event-based (100% accuracy)
 *   Members who booked gendered sessions ("Women's League", "Men's 3.5+")
 *   get gender assigned with certainty.
 *
 * Pass 2: LLM name-based (~90% accuracy)
 *   Remaining members get classified by first name via GPT-4o-mini.
 *   Ambiguous names (Pat, Chris, Jordan) are skipped.
 */

import { generateWithFallback } from './llm/provider'
import { prisma } from '@/lib/prisma'

interface GenderResult {
  name: string
  gender: 'M' | 'F' | null
  confidence: number // 0-100
}

// ── Session title patterns for gender detection ──
const FEMALE_PATTERNS = [
  'women', 'woman', 'ladies', 'lady', 'female', 'girl', 'gal',
]
const MALE_PATTERNS = [
  "men's", 'mens ', ' male', 'guys', " guy's",
]

function detectSessionGender(title: string): 'M' | 'F' | null {
  const lower = title.toLowerCase()
  // Check female first (more specific — "women" contains "men")
  if (FEMALE_PATTERNS.some(p => lower.includes(p))) return 'F'
  if (MALE_PATTERNS.some(p => lower.includes(p))) return 'M'
  return null
}

// ── Pass 1: Event-based inference ──
async function inferFromEvents(clubId: string): Promise<{ inferred: number; errors: number }> {
  // Find all gendered sessions for this club
  const sessions: Array<{ id: string; title: string }> = await prisma.$queryRawUnsafe(`
    SELECT DISTINCT ps.id, ps.title
    FROM play_sessions ps
    WHERE ps."clubId" = $1
      AND ps.title IS NOT NULL
  `, clubId)

  const genderedSessionIds = new Map<string, 'M' | 'F'>()
  for (const s of sessions) {
    const g = detectSessionGender(s.title)
    if (g) genderedSessionIds.set(s.id, g)
  }

  if (genderedSessionIds.size === 0) return { inferred: 0, errors: 0 }

  // Get users without gender who attended gendered sessions
  const sessionIds = Array.from(genderedSessionIds.keys())
  const placeholders = sessionIds.map((_, i) => `$${i + 2}`).join(',')

  const attendees: Array<{ userId: string; sessionId: string }> = await prisma.$queryRawUnsafe(`
    SELECT DISTINCT psb."userId", psb."sessionId"
    FROM play_session_bookings psb
    JOIN users u ON u.id = psb."userId"
    WHERE psb."sessionId" IN (${placeholders})
      AND psb.status = 'CONFIRMED'
      AND u.gender IS NULL
  `, clubId, ...sessionIds)

  // Group by user — if someone attended BOTH men's and women's events, skip them
  const userGenders = new Map<string, Set<string>>()
  for (const a of attendees) {
    const g = genderedSessionIds.get(a.sessionId)
    if (!g) continue
    if (!userGenders.has(a.userId)) userGenders.set(a.userId, new Set())
    userGenders.get(a.userId)!.add(g)
  }

  let inferred = 0, errors = 0

  const userEntries = Array.from(userGenders.entries())
  for (const [userId, genders] of userEntries) {
    // Skip if conflicting (attended both men's and women's events)
    if (genders.size !== 1) continue
    const gender = Array.from(genders)[0] as 'M' | 'F'

    try {
      await prisma.user.update({
        where: { id: userId },
        data: { gender: gender as any },
      })
      inferred++
    } catch {
      errors++
    }
  }

  return { inferred, errors }
}

// ── Pass 2: LLM name-based inference ──

const SYSTEM_PROMPT = `You classify first names by likely gender. Return a JSON array.

Rules:
- Only classify names you're confident about (>75% confidence)
- For ambiguous names (Pat, Chris, Jordan, Alex, Sam, Jamie, Taylor, etc.) return null
- Base predictions on US English name conventions
- "confidence" is 0-100, where 100 = certain (John, Mary), 50 = ambiguous
- Return null gender for any name with confidence < 75

Input: array of first names
Output: JSON array of { "name": string, "gender": "M" | "F" | null, "confidence": number }

Example:
Input: ["John", "Sarah", "Pat", "Maria", "Chris"]
Output: [{"name":"John","gender":"M","confidence":99},{"name":"Sarah","gender":"F","confidence":99},{"name":"Pat","gender":null,"confidence":45},{"name":"Maria","gender":"F","confidence":97},{"name":"Chris","gender":null,"confidence":40}]`

async function classifyNames(names: string[]): Promise<GenderResult[]> {
  const { text } = await generateWithFallback({
    system: SYSTEM_PROMPT,
    prompt: JSON.stringify(names),
    tier: 'fast',
    maxTokens: 4000,
  })

  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []
    return JSON.parse(jsonMatch[0])
  } catch {
    console.error('[Gender Inference] Failed to parse LLM response:', text.slice(0, 200))
    return []
  }
}

async function inferFromNames(clubId: string): Promise<{ total: number; inferred: number; skipped: number; errors: number }> {
  // Get active members STILL without gender (after event pass)
  const members: Array<{ id: string; name: string | null }> = await prisma.$queryRawUnsafe(`
    SELECT DISTINCT u.id, u.name
    FROM play_session_bookings psb
    JOIN play_sessions ps ON ps.id = psb."sessionId"
    JOIN users u ON u.id = psb."userId"
    WHERE ps."clubId" = $1
      AND psb.status = 'CONFIRMED'
      AND u.gender IS NULL
      AND u.name IS NOT NULL
      AND u.name != ''
  `, clubId)

  if (members.length === 0) return { total: 0, inferred: 0, skipped: 0, errors: 0 }

  const memberNames = members.map(m => ({
    id: m.id,
    firstName: (m.name || '').split(' ')[0].trim(),
  })).filter(m => m.firstName.length >= 2)

  let inferred = 0, skipped = 0, errors = 0
  const BATCH_SIZE = 100

  for (let i = 0; i < memberNames.length; i += BATCH_SIZE) {
    const batch = memberNames.slice(i, i + BATCH_SIZE)
    const uniqueNames = Array.from(new Set(batch.map(b => b.firstName)))

    try {
      const results = await classifyNames(uniqueNames)
      const nameToGender = new Map<string, GenderResult>()
      for (const r of results) {
        nameToGender.set(r.name.toLowerCase(), r)
      }

      const updates = batch.map(async (member) => {
        const result = nameToGender.get(member.firstName.toLowerCase())
        if (!result || !result.gender || result.confidence < 75) {
          skipped++
          return
        }

        try {
          await prisma.user.update({
            where: { id: member.id },
            data: { gender: result.gender as any },
          })
          inferred++
        } catch {
          errors++
        }
      })

      for (let j = 0; j < updates.length; j += 10) {
        await Promise.all(updates.slice(j, j + 10))
      }
    } catch (err) {
      console.error(`[Gender Inference] Batch ${i} failed:`, (err as Error).message)
      errors += batch.length
    }
  }

  return { total: members.length, inferred, skipped, errors }
}

// ── Skill Level inference from session titles ──

const SKILL_PATTERNS: Array<{ pattern: RegExp; level: string }> = [
  { pattern: /beginner|2\.0\s*-\s*2\.49/i, level: '2.0-2.49 (Beginner)' },
  { pattern: /casual|2\.5\s*-?\s*2\.99/i, level: '2.5-2.99 (Casual)' },
  { pattern: /intermediate|3\.0\s*-?\s*3\.49/i, level: '3.0-3.49 (Intermediate)' },
  { pattern: /competitive|3\.5\s*-?\s*3\.99/i, level: '3.5-3.99 (Competitive)' },
  { pattern: /advanced|4\.0\s*\+|4\.0\s*-?\s*4\.49|4\.5/i, level: '4.0+ (Advanced)' },
]

function detectSkillLevel(title: string): string | null {
  // Check from most specific (advanced) to least — take highest if multiple match
  for (let i = SKILL_PATTERNS.length - 1; i >= 0; i--) {
    if (SKILL_PATTERNS[i].pattern.test(title)) return SKILL_PATTERNS[i].level
  }
  return null
}

async function inferSkillFromEvents(clubId: string): Promise<{ inferred: number; errors: number }> {
  const sessions: Array<{ id: string; title: string }> = await prisma.$queryRawUnsafe(`
    SELECT DISTINCT ps.id, ps.title
    FROM play_sessions ps
    WHERE ps."clubId" = $1 AND ps.title IS NOT NULL
  `, clubId)

  const skilledSessionIds = new Map<string, string>()
  for (const s of sessions) {
    const level = detectSkillLevel(s.title)
    if (level) skilledSessionIds.set(s.id, level)
  }

  if (skilledSessionIds.size === 0) return { inferred: 0, errors: 0 }

  const sessionIds = Array.from(skilledSessionIds.keys())
  const placeholders = sessionIds.map((_, i) => `$${i + 2}`).join(',')

  const attendees: Array<{ userId: string; sessionId: string }> = await prisma.$queryRawUnsafe(`
    SELECT DISTINCT psb."userId", psb."sessionId"
    FROM play_session_bookings psb
    JOIN users u ON u.id = psb."userId"
    WHERE psb."sessionId" IN (${placeholders})
      AND psb.status = 'CONFIRMED'
      AND (u.skill_level IS NULL OR u.skill_level = '')
  `, clubId, ...sessionIds)

  // For each user, find their MOST FREQUENT skill level
  const userSkillCounts = new Map<string, Map<string, number>>()
  for (const a of attendees) {
    const level = skilledSessionIds.get(a.sessionId)
    if (!level) continue
    if (!userSkillCounts.has(a.userId)) userSkillCounts.set(a.userId, new Map())
    const counts = userSkillCounts.get(a.userId)!
    counts.set(level, (counts.get(level) || 0) + 1)
  }

  let inferred = 0, errors = 0

  const entries = Array.from(userSkillCounts.entries())
  for (const [userId, counts] of entries) {
    // Pick the most frequent skill level
    let bestLevel = '', bestCount = 0
    const countEntries = Array.from(counts.entries())
    for (const [level, count] of countEntries) {
      if (count > bestCount) { bestLevel = level; bestCount = count }
    }
    if (!bestLevel) continue

    try {
      await prisma.user.update({
        where: { id: userId },
        data: { skillLevel: bestLevel },
      })
      inferred++
    } catch {
      errors++
    }
  }

  return { inferred, errors }
}

// ── Main entry point: Gender ──

export async function inferGendersForClub(clubId: string): Promise<{
  total: number
  inferred: number
  skipped: number
  errors: number
  fromEvents: number
  fromNames: number
}> {
  // Pass 1: Event-based (100% accuracy)
  const eventResult = await inferFromEvents(clubId)

  // Pass 2: LLM name-based (remaining members)
  const nameResult = await inferFromNames(clubId)

  return {
    total: nameResult.total + eventResult.inferred,
    inferred: eventResult.inferred + nameResult.inferred,
    skipped: nameResult.skipped,
    errors: eventResult.errors + nameResult.errors,
    fromEvents: eventResult.inferred,
    fromNames: nameResult.inferred,
  }
}

// ── Main entry point: All enrichment (gender + skill) ──

export async function enrichMemberData(clubId: string): Promise<{
  gender: { inferred: number; fromEvents: number; fromNames: number; skipped: number; errors: number }
  skill: { inferred: number; errors: number }
}> {
  // 1. Skill from events (instant, no LLM) — run FIRST
  const skillResult = await inferSkillFromEvents(clubId)

  // 2. Gender from events (instant, 100% accuracy)
  const genderEvents = await inferFromEvents(clubId)

  // 3. Gender from LLM (slow — last)
  const genderNames = await inferFromNames(clubId)

  return {
    gender: {
      inferred: genderEvents.inferred + genderNames.inferred,
      fromEvents: genderEvents.inferred,
      fromNames: genderNames.inferred,
      skipped: genderNames.skipped,
      errors: genderEvents.errors + genderNames.errors,
    },
    skill: skillResult,
  }
}
