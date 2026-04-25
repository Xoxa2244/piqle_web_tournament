import { z } from 'zod'

export const advisorQuietHoursSchema = z.object({
  startHour: z.number().int().min(0).max(23),
  endHour: z.number().int().min(0).max(23),
})

export const advisorContactPolicyDraftSchema = z.object({
  timeZone: z.string().min(1).max(80),
  quietHours: advisorQuietHoursSchema,
  recentBookingLookbackDays: z.number().int().min(1).max(30),
  max24h: z.number().int().min(1).max(10),
  max7d: z.number().int().min(1).max(20),
  cooldownHours: z.number().int().min(1).max(24),
  changes: z.array(z.string().min(1).max(160)).max(8).default([]),
})

export type AdvisorContactPolicyDraft = z.infer<typeof advisorContactPolicyDraftSchema>

type ContactPolicyOverrides = {
  timeZone?: string
  quietHours?: {
    startHour?: number
    endHour?: number
  }
  recentBookingLookbackDays?: number
  max24h?: number
  max7d?: number
  cooldownHours?: number
}

export const DEFAULT_ADVISOR_CONTACT_POLICY = {
  timeZone: 'America/New_York',
  quietHours: {
    startHour: 21,
    endHour: 8,
  },
  recentBookingLookbackDays: 7,
  max24h: 2,
  max7d: 5,
  cooldownHours: 4,
} satisfies Omit<AdvisorContactPolicyDraft, 'changes'>

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function clampHour(value: unknown, fallback: number) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(0, Math.min(23, Math.round(numeric)))
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(min, Math.min(max, Math.round(numeric)))
}

function formatHourLabel(hour: number) {
  const normalized = ((hour % 24) + 24) % 24
  const suffix = normalized >= 12 ? 'PM' : 'AM'
  const hour12 = normalized % 12 || 12
  return `${hour12}:00 ${suffix}`
}

export function readAdvisorContactPolicyOverrides(automationSettings?: unknown): ContactPolicyOverrides {
  const automation = toRecord(automationSettings)
  const intelligence = toRecord(automation.intelligence)
  const contactPolicy = toRecord(intelligence.contactPolicy)
  const quietHours = toRecord(contactPolicy.quietHours)

  const overrides: ContactPolicyOverrides = {}

  const timeZone = String(intelligence.timezone || contactPolicy.timeZone || '').trim()
  if (timeZone) overrides.timeZone = timeZone

  if (Object.keys(quietHours).length > 0) {
    overrides.quietHours = {}
    if (quietHours.startHour !== undefined) overrides.quietHours.startHour = clampHour(quietHours.startHour, DEFAULT_ADVISOR_CONTACT_POLICY.quietHours.startHour)
    if (quietHours.endHour !== undefined) overrides.quietHours.endHour = clampHour(quietHours.endHour, DEFAULT_ADVISOR_CONTACT_POLICY.quietHours.endHour)
  }

  if (contactPolicy.recentBookingLookbackDays !== undefined) {
    overrides.recentBookingLookbackDays = clampInt(contactPolicy.recentBookingLookbackDays, 1, 30, DEFAULT_ADVISOR_CONTACT_POLICY.recentBookingLookbackDays)
  }
  if (contactPolicy.max24h !== undefined) {
    overrides.max24h = clampInt(contactPolicy.max24h, 1, 10, DEFAULT_ADVISOR_CONTACT_POLICY.max24h)
  }
  if (contactPolicy.max7d !== undefined) {
    overrides.max7d = clampInt(contactPolicy.max7d, 1, 20, DEFAULT_ADVISOR_CONTACT_POLICY.max7d)
  }
  if (contactPolicy.cooldownHours !== undefined) {
    overrides.cooldownHours = clampInt(contactPolicy.cooldownHours, 1, 24, DEFAULT_ADVISOR_CONTACT_POLICY.cooldownHours)
  }

  return overrides
}

export function resolveAdvisorContactPolicy(opts?: {
  timeZone?: string | null
  automationSettings?: unknown
}): AdvisorContactPolicyDraft {
  const overrides = readAdvisorContactPolicyOverrides(opts?.automationSettings)
  const timeZone = String(opts?.timeZone || overrides.timeZone || DEFAULT_ADVISOR_CONTACT_POLICY.timeZone).trim() || DEFAULT_ADVISOR_CONTACT_POLICY.timeZone

  return {
    timeZone,
    quietHours: {
      startHour: overrides.quietHours?.startHour ?? DEFAULT_ADVISOR_CONTACT_POLICY.quietHours.startHour,
      endHour: overrides.quietHours?.endHour ?? DEFAULT_ADVISOR_CONTACT_POLICY.quietHours.endHour,
    },
    recentBookingLookbackDays: overrides.recentBookingLookbackDays ?? DEFAULT_ADVISOR_CONTACT_POLICY.recentBookingLookbackDays,
    max24h: overrides.max24h ?? DEFAULT_ADVISOR_CONTACT_POLICY.max24h,
    max7d: overrides.max7d ?? DEFAULT_ADVISOR_CONTACT_POLICY.max7d,
    cooldownHours: overrides.cooldownHours ?? DEFAULT_ADVISOR_CONTACT_POLICY.cooldownHours,
    changes: [],
  }
}

function containsAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text))
}

function parseTimeToken(raw: string | undefined | null): number | null {
  if (!raw) return null
  const trimmed = raw.trim().toLowerCase()
  const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i)
  if (!match) return null

  let hour = Number(match[1])
  const minutes = Number(match[2] || '0')
  const meridiem = match[3]

  if (!Number.isFinite(hour) || hour > 24 || minutes > 59) return null

  if (meridiem) {
    if (hour < 1 || hour > 12) return null
    if (meridiem === 'am') {
      if (hour === 12) hour = 0
    } else if (hour !== 12) {
      hour += 12
    }
  } else if (hour === 24) {
    hour = 0
  }

  return clampHour(hour, hour)
}

function parseTimeRange(message: string) {
  const timePattern = '(\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)?|\\d{1,2}:\\d{2})'
  const rangePatterns = [
    new RegExp(`(?:quiet hours?|do not send|don't send|no messages?|stop messaging|avoid outreach|тихие часы|не писать|не отправлять).*?${timePattern}\\s*(?:to|until|through|\\-|–|—|до|и)\\s*${timePattern}`, 'i'),
    new RegExp(`\\bfrom\\s*${timePattern}\\s*(?:to|until|through|\\-|–|—)\\s*${timePattern}\\b`, 'i'),
    new RegExp(`\\b${timePattern}\\s*(?:to|until|through|\\-|–|—|до|и)\\s*${timePattern}\\b`, 'i'),
  ]

  for (const pattern of rangePatterns) {
    const match = message.match(pattern)
    if (!match) continue
    const startHour = parseTimeToken(match[1])
    const endHour = parseTimeToken(match[2])
    if (startHour === null || endHour === null) continue
    return { startHour, endHour }
  }

  return null
}

function buildPolicyChanges(previous: AdvisorContactPolicyDraft, next: AdvisorContactPolicyDraft) {
  const changes: string[] = []

  if (
    previous.quietHours.startHour !== next.quietHours.startHour ||
    previous.quietHours.endHour !== next.quietHours.endHour
  ) {
    changes.push(`Quiet hours: ${formatHourLabel(next.quietHours.startHour)} to ${formatHourLabel(next.quietHours.endHour)}`)
  }

  if (previous.cooldownHours !== next.cooldownHours) {
    changes.push(`Cross-campaign cooldown: ${next.cooldownHours} hour${next.cooldownHours === 1 ? '' : 's'}`)
  }

  if (previous.max24h !== next.max24h) {
    changes.push(`Daily contact cap: ${next.max24h} message${next.max24h === 1 ? '' : 's'} per 24 hours`)
  }

  if (previous.max7d !== next.max7d) {
    changes.push(`Weekly contact cap: ${next.max7d} message${next.max7d === 1 ? '' : 's'} per 7 days`)
  }

  if (previous.recentBookingLookbackDays !== next.recentBookingLookbackDays) {
    changes.push(`Recent booking suppression window: ${next.recentBookingLookbackDays} day${next.recentBookingLookbackDays === 1 ? '' : 's'}`)
  }

  if (previous.timeZone !== next.timeZone) {
    changes.push(`Policy time zone: ${next.timeZone}`)
  }

  return changes.slice(0, 8)
}

export function formatAdvisorContactPolicyDigest(policy: AdvisorContactPolicyDraft) {
  return `Quiet hours ${formatHourLabel(policy.quietHours.startHour)}-${formatHourLabel(policy.quietHours.endHour)} · ${policy.max24h}/day · ${policy.max7d}/week · ${policy.cooldownHours}h cooldown`
}

export function isAdvisorContactPolicyRequest(message: string) {
  const lower = message.toLowerCase()
  const mentionsPolicy = containsAny(lower, [
    /\b(contact policy|messaging policy|outreach policy|communication policy|quiet hours?|cooldown|frequency cap|daily cap|weekly cap|recent booking)\b/,
    /\b(max\s+\d+\s+(messages?|touches?).*(day|week)|messages?\s+per\s+(day|week)|do not send after|don't send after)\b/,
    /\b(тихие часы|политик\w+ сообщений|политик\w+ контактов|кулдаун|лимит сообщений|не писать после|не отправлять после|недавн\w+ бронир)\b/,
  ])
  const wantsChange = containsAny(lower, [
    /\b(set|change|update|adjust|tighten|relax|use|limit|make|apply|turn|enable|disable)\b/,
    /\b(do not send after|don't send after|quiet hours? from|limit outreach|messages? per day|messages? per week)\b/,
    /\b(измени|поменяй|обнови|сделай|ограничи|поставь|включи|выключи|не писать после|не отправлять после)\b/,
  ])
  return mentionsPolicy && wantsChange
}

export function updateAdvisorContactPolicyFromMessage(opts: {
  message: string
  currentPolicy: AdvisorContactPolicyDraft
  allowImplicit?: boolean
}) {
  const { message, currentPolicy, allowImplicit = false } = opts
  if (!allowImplicit && !isAdvisorContactPolicyRequest(message)) return null

  const lower = message.toLowerCase()
  const next: AdvisorContactPolicyDraft = {
    ...currentPolicy,
    quietHours: { ...currentPolicy.quietHours },
    changes: [],
  }
  let changed = false

  const quietHoursRange = parseTimeRange(message)
  if (quietHoursRange) {
    next.quietHours = quietHoursRange
    changed = true
  } else {
    const afterMatch = lower.match(/\b(?:after|start(?:ing)?(?: quiet hours?)?(?: at)?|после|с)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i)
    const beforeMatch = lower.match(/\b(?:before|until|resume(?: at)?|end(?: quiet hours?)?(?: at)?|до)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i)
    const startHour = parseTimeToken(afterMatch?.[1])
    const endHour = parseTimeToken(beforeMatch?.[1])

    if (startHour !== null && containsAny(lower, [/\b(after|start|после|с)\b/, /\b(quiet hours|тихие часы|не писать|do not send)\b/])) {
      next.quietHours.startHour = startHour
      changed = true
    }

    if (endHour !== null && containsAny(lower, [/\b(before|until|resume|end|до)\b/, /\b(quiet hours|тихие часы|не писать|do not send)\b/])) {
      next.quietHours.endHour = endHour
      changed = true
    }
  }

  const cooldownMatch =
    lower.match(/\b(?:cooldown(?: of)?|use a)\s*(\d{1,2})\s*(?:hours?|hrs?|h)\b/) ||
    lower.match(/\b(\d{1,2})\s*(?:hours?|hrs?|h)\s*cooldown\b/) ||
    lower.match(/\b(\d{1,2})\s*час\w*\s*(?:кулдаун|перерыв)\b/)
  if (cooldownMatch) {
    next.cooldownHours = clampInt(cooldownMatch[1], 1, 24, currentPolicy.cooldownHours)
    changed = true
  }

  const dailyMatch =
    lower.match(/\b(?:max(?:imum)?|limit)?\s*(\d{1,2})\s*(?:messages?|touch(?:es)?)\s*(?:per|a|\/)\s*(?:day|24\s*hours?)\b/) ||
    lower.match(/\b(\d{1,2})\s*\/\s*day\b/) ||
    lower.match(/\b(\d{1,2})\s*сообщен\w+\s*(?:в|за)\s*(?:день|24\s*час)\b/)
  if (dailyMatch) {
    next.max24h = clampInt(dailyMatch[1], 1, 10, currentPolicy.max24h)
    changed = true
  }

  const weeklyMatch =
    lower.match(/\b(?:max(?:imum)?|limit)?\s*(\d{1,2})\s*(?:messages?|touch(?:es)?)\s*(?:per|a|\/)\s*week\b/) ||
    lower.match(/\b(\d{1,2})\s*\/\s*week\b/) ||
    lower.match(/\b(\d{1,2})\s*сообщен\w+\s*(?:в|за)\s*недел\w+\b/)
  if (weeklyMatch) {
    next.max7d = clampInt(weeklyMatch[1], 1, 20, currentPolicy.max7d)
    changed = true
  }

  const bookingLookbackMatch =
    lower.match(/\b(?:recent booking|booking lookback|booking window|recent-booking window|recent bookings? for)\s*(\d{1,2})\s*(?:days?|d)\b/) ||
    lower.match(/\b(\d{1,2})\s*(?:days?|d)\s*(?:recent booking|booking window|lookback)\b/) ||
    lower.match(/\b(\d{1,2})\s*дн\w*\s*(?:для|окно|недавн\w+ бронир)\b/)
  if (bookingLookbackMatch) {
    next.recentBookingLookbackDays = clampInt(bookingLookbackMatch[1], 1, 30, currentPolicy.recentBookingLookbackDays)
    changed = true
  }

  if (!changed) return null

  next.changes = buildPolicyChanges(currentPolicy, next)
  if (next.changes.length === 0) return null
  return next
}
