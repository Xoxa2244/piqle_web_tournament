/**
 * Pending-queue payload shared between the Advisor POST handler and the
 * AdvisorIQ chat renderer. When `ops_show_pending` fires, the handler
 * embeds a `<pending-queue>…</pending-queue>` tag inside the assistant
 * message body containing a JSON array of PendingQueueItem. The chat UI
 * parses the tag out, renders each item as an inline card with
 * Approve / Skip / Snooze buttons, and strips the tag from the visible
 * message body so the user only sees the human-readable summary.
 *
 * Keep this file platform-agnostic: no Prisma, no tRPC, no React. It's
 * consumed from both server-only (route handler) and client-only
 * (AdvisorIQ render) code.
 */

import { z } from 'zod'

// Matches the Vercel-return shape of intelligence.getPendingActions — see
// server/routers/intelligence.ts. We only expose the fields the chat UI
// actually needs to render + act on, so future backend changes to the
// pending payload don't force a schema migration here.
export const pendingQueueItemSchema = z.object({
  id: z.string(),
  type: z.string().optional(),
  title: z.string().optional(),
  summary: z.string().optional(),
  channel: z.enum(['email', 'sms', 'both']).optional(),
  createdAt: z.string().optional(),
  memberName: z.string().optional(),
  memberEmail: z.string().optional(),
})

export type PendingQueueItem = z.infer<typeof pendingQueueItemSchema>

export const pendingQueuePayloadSchema = z.object({
  items: z.array(pendingQueueItemSchema).max(20),
  totalCount: z.number().int().min(0),
})

export type PendingQueuePayload = z.infer<typeof pendingQueuePayloadSchema>

const PENDING_TAG_REGEX = /<pending-queue>\s*([\s\S]*?)\s*<\/pending-queue>/i

/** Wrap a pending-queue payload for embedding in assistantMessage. */
export function buildPendingQueueTag(payload: PendingQueuePayload): string {
  return `<pending-queue>${JSON.stringify(payload)}</pending-queue>`
}

/** Parse the tag out of a chat message. Returns null on any shape mismatch. */
export function extractPendingQueue(text: string): PendingQueuePayload | null {
  const match = text.match(PENDING_TAG_REGEX)
  if (!match) return null
  try {
    const raw = JSON.parse(match[1].trim())
    const parsed = pendingQueuePayloadSchema.safeParse(raw)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** Remove the tag from the message so the chat bubble renders cleanly. */
export function stripPendingQueueTag(text: string): string {
  return text.replace(PENDING_TAG_REGEX, '').replace(/\n{3,}/g, '\n\n').trim()
}
