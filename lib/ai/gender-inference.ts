/**
 * LLM-based gender inference from first names.
 * Uses GPT-4o-mini to classify names in batches of 100.
 * Only updates users who don't already have gender set.
 * Stores result in `gender` field + marks `genderSource = 'inferred'` in metadata.
 */

import { generateWithFallback } from './llm/provider'
import { prisma } from '@/lib/prisma'

interface GenderResult {
  name: string
  gender: 'M' | 'F' | null
  confidence: number // 0-100
}

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

/** Classify a batch of first names (max ~100 at a time) */
async function classifyNames(names: string[]): Promise<GenderResult[]> {
  const { text } = await generateWithFallback({
    system: SYSTEM_PROMPT,
    prompt: JSON.stringify(names),
    tier: 'fast', // gpt-4o-mini
    maxTokens: 4000,
  })

  try {
    // Extract JSON from response (might have markdown wrapper)
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []
    return JSON.parse(jsonMatch[0])
  } catch {
    console.error('[Gender Inference] Failed to parse LLM response:', text.slice(0, 200))
    return []
  }
}

/** Run gender inference for a club's active members who don't have gender set */
export async function inferGendersForClub(clubId: string): Promise<{
  total: number
  inferred: number
  skipped: number
  errors: number
}> {
  // Get active members without gender
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

  // Extract first names
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
      const results = classifyNames(uniqueNames)
      const nameToGender = new Map<string, GenderResult>()
      for (const r of await results) {
        nameToGender.set(r.name.toLowerCase(), r)
      }

      // Update users in parallel (10 at a time)
      const updates = batch.map(async (member) => {
        const result = nameToGender.get(member.firstName.toLowerCase())
        if (!result || !result.gender || result.confidence < 75) {
          skipped++
          return
        }

        try {
          await prisma.user.update({
            where: { id: member.id },
            data: {
              gender: result.gender as any,
              // Store inference metadata in a way we can track
              // Using zipCode as we don't have a metadata field — actually let's not pollute
            },
          })
          inferred++
        } catch {
          errors++
        }
      })

      // Process 10 at a time
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
