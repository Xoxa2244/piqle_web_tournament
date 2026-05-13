import { z } from 'zod'

export const advisorAdminReminderChannelSchema = z.enum(['in_app', 'email', 'sms', 'both'])

export const advisorAdminReminderRoutingDraftSchema = z.object({
  channel: advisorAdminReminderChannelSchema.default('in_app'),
  email: z.string().email().optional().nullable(),
  phone: z.string().min(7).max(32).optional().nullable(),
  changes: z.array(z.string().min(1).max(180)).max(8).default([]),
})

export type AdvisorAdminReminderRoutingDraft = z.infer<typeof advisorAdminReminderRoutingDraftSchema>

function containsAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text))
}

function normalizePhone(raw: string) {
  const trimmed = raw.trim()
  const normalized = trimmed.replace(/[^\d+]/g, '')
  if (!normalized) return null
  if (!/^\+?\d{7,15}$/.test(normalized)) return null
  return normalized
}

function extractEmails(message: string) {
  return Array.from(
    new Set(message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []),
  ).slice(0, 3)
}

function extractPhones(message: string) {
  const matches = message.match(/(?:\+\d[\d\s().-]{6,}\d|\b\d[\d\s().-]{7,}\d\b)/g) || []
  return Array.from(new Set(matches.map(normalizePhone).filter(Boolean) as string[])).slice(0, 3)
}

function wantsClearEmail(message: string) {
  const lower = message.toLowerCase()
  return containsAny(lower, [
    /\b(clear|remove|delete)\s+(the\s+)?(admin\s+)?reminder\s+email\b/,
  ])
}

function wantsClearPhone(message: string) {
  const lower = message.toLowerCase()
  return containsAny(lower, [
    /\b(clear|remove|delete)\s+(the\s+)?(admin\s+)?reminder\s+(phone|sms)\b/,
  ])
}

function wantsInAppOnly(message: string) {
  const lower = message.toLowerCase()
  return containsAny(lower, [
    /\b(in[- ]?app only|only in app|no email|no sms|do not text|do not email)\b/,
  ])
}

function parseChannel(message: string): AdvisorAdminReminderRoutingDraft['channel'] | null {
  const lower = message.toLowerCase()

  if (wantsInAppOnly(message)) return 'in_app'
  if (containsAny(lower, [/\b(email|e-mail)\b/]) && containsAny(lower, [/\b(sms|text|phone)\b/])) {
    return 'both'
  }
  if (containsAny(lower, [/\b(email|e-mail)\b/])) return 'email'
  if (containsAny(lower, [/\b(sms|text|phone)\b/])) return 'sms'

  return null
}

function buildChanges(previous: AdvisorAdminReminderRoutingDraft, next: AdvisorAdminReminderRoutingDraft) {
  const changes: string[] = []

  if (previous.channel !== next.channel) {
    const label =
      next.channel === 'in_app'
        ? 'In-app only'
        : next.channel === 'email'
          ? 'Email reminders'
          : next.channel === 'sms'
            ? 'SMS reminders'
            : 'Email + SMS reminders'
    changes.push(`Reminder delivery: ${label}`)
  }

  if ((previous.email || null) !== (next.email || null)) {
    changes.push(next.email ? `Reminder email: ${next.email}` : 'Reminder email cleared')
  }

  if ((previous.phone || null) !== (next.phone || null)) {
    changes.push(next.phone ? `Reminder phone: ${next.phone}` : 'Reminder phone cleared')
  }

  return changes.slice(0, 8)
}

export function resolveAdvisorAdminReminderRouting(user?: {
  adminReminderChannel?: string | null
  adminReminderEmail?: string | null
  adminReminderPhone?: string | null
} | null): AdvisorAdminReminderRoutingDraft {
  const parsedChannel = advisorAdminReminderChannelSchema.safeParse(user?.adminReminderChannel || 'in_app')

  return {
    channel: parsedChannel.success ? parsedChannel.data : 'in_app',
    email: user?.adminReminderEmail?.trim() || null,
    phone: normalizePhone(user?.adminReminderPhone || '') || null,
    changes: [],
  }
}

export function formatAdvisorAdminReminderRoutingDigest(policy: AdvisorAdminReminderRoutingDraft) {
  const delivery =
    policy.channel === 'in_app'
      ? 'In-app only'
      : policy.channel === 'email'
        ? 'Email reminders'
        : policy.channel === 'sms'
          ? 'SMS reminders'
          : 'Email + SMS reminders'

  const parts = [delivery]
  if (policy.email) parts.push(`email ${policy.email}`)
  if (policy.phone) parts.push(`phone ${policy.phone}`)
  return parts.join(' · ')
}

export function getAdvisorAdminReminderMissingFields(policy: AdvisorAdminReminderRoutingDraft) {
  const missing: Array<'email' | 'phone'> = []
  if ((policy.channel === 'email' || policy.channel === 'both') && !policy.email) missing.push('email')
  if ((policy.channel === 'sms' || policy.channel === 'both') && !policy.phone) missing.push('phone')
  return missing
}

export function isAdvisorAdminReminderRoutingRequest(message: string) {
  const lower = message.toLowerCase()
  const mentionsReminder = containsAny(lower, [
    /\b(admin reminders?|agent reminders?|daily reminders?|task reminders?|remind me)\b/,
    /\b(reminders?|notifications?)\b/,
  ])
  const mentionsChannel = containsAny(lower, [
    /\b(email|e-mail|sms|text|phone|in[- ]?app)\b/,
  ]) || extractEmails(message).length > 0 || extractPhones(message).length > 0
  const wantsChange = containsAny(lower, [
    /\b(use|send|remind|notify|route|change|update|set|switch|text|email)\b/,
  ])

  return mentionsReminder && (mentionsChannel || wantsChange)
}

export function updateAdvisorAdminReminderRoutingFromMessage(opts: {
  message: string
  currentPolicy: AdvisorAdminReminderRoutingDraft
  allowImplicit?: boolean
}) {
  const { message, currentPolicy, allowImplicit = false } = opts
  if (!allowImplicit && !isAdvisorAdminReminderRoutingRequest(message)) return null

  const next: AdvisorAdminReminderRoutingDraft = {
    ...currentPolicy,
    changes: [],
  }
  let changed = false

  const parsedChannel = parseChannel(message)
  if (parsedChannel && parsedChannel !== next.channel) {
    next.channel = parsedChannel
    changed = true
  }

  if (wantsClearEmail(message) && next.email) {
    next.email = null
    changed = true
  }

  if (wantsClearPhone(message) && next.phone) {
    next.phone = null
    changed = true
  }

  const email = extractEmails(message)[0]
  if (email && email !== next.email) {
    next.email = email
    changed = true
  }

  const phone = extractPhones(message)[0]
  if (phone && phone !== next.phone) {
    next.phone = phone
    changed = true
  }

  if (!changed) return null

  const parsed = advisorAdminReminderRoutingDraftSchema.safeParse(next)
  if (!parsed.success) return null

  const normalized = parsed.data
  normalized.changes = buildChanges(currentPolicy, normalized)
  return normalized
}
