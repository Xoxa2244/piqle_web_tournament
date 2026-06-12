/**
 * Audience-offer payload: the Advisor's "Create Audience" button
 * (operator feedback v2.0 doc #2 — insight must end in an action).
 *
 * Unlike <pending-queue> (built by the server), this tag is emitted BY
 * THE MODEL at the end of an answer that lists specific members. The UI
 * (AdvisorIQ) strips it from the visible text and renders a one-click
 * button; clicking re-runs the SAME deterministic query server-side
 * (createCohortFromTierQuery / createCohortFromProgramContext) — we
 * never trust member ids or names from model text.
 *
 * Keep platform-agnostic: no Prisma, no tRPC, no React (consumed by the
 * system prompt docs, the chat renderers, and tests).
 */

import { z } from 'zod'

export const PROGRAM_FAMILIES = [
  'OPEN_PLAY', 'COURT_BOOKING', 'CLINIC', 'PRIVATE_LESSON',
  'LEAGUE', 'EVENTS', 'YOUTH', 'EQUIPMENT',
] as const

export const audienceOfferSchema = z.union([
  z.object({
    kind: z.literal('tier'),
    tier: z.string().min(1).max(200),
    filter: z.enum(['all', 'attended_30d', 'never_attended', 'lapsed']).default('lapsed'),
    label: z.string().min(1).max(120),
  }),
  z.object({
    kind: z.literal('family'),
    family: z.enum(PROGRAM_FAMILIES),
    mode: z.enum(['attendees', 'lapsed']),
    periodDays: z.number().int().min(7).max(365).default(60),
    label: z.string().min(1).max(120),
  }),
])

export type AudienceOffer = z.infer<typeof audienceOfferSchema>

const TAG_REGEX = /<audience-offer>\s*([\s\S]*?)\s*<\/audience-offer>/gi

/** All valid offers in a message (invalid/malformed tags are dropped). */
export function extractAudienceOffers(text: string): AudienceOffer[] {
  const offers: AudienceOffer[] = []
  Array.from(text.matchAll(TAG_REGEX)).forEach((match) => {
    try {
      const parsed = audienceOfferSchema.safeParse(JSON.parse(match[1].trim()))
      if (parsed.success) offers.push(parsed.data)
    } catch {
      // malformed JSON from the model — ignore the tag, keep the answer
    }
  })
  return offers.slice(0, 3)
}

/** Remove the tag(s) — including partially streamed ones — from visible text. */
export function stripAudienceOfferTags(text: string): string {
  const withoutComplete = text.replace(TAG_REGEX, '')
  // Hide a partial opening tag while it is still streaming in.
  const partialIdx = withoutComplete.toLowerCase().lastIndexOf('<audience-offer>')
  return (partialIdx !== -1 ? withoutComplete.slice(0, partialIdx) : withoutComplete)
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()
}
