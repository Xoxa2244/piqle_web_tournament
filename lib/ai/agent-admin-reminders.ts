import { getPlatformBaseUrl } from '@/lib/platform-base-url'
import { buildEmailButton, buildIqSportEmail } from '@/lib/email-brand'

export type AdminReminderChannel = 'email' | 'sms'
export type AdminReminderDeliveryMode = 'in_app' | 'email' | 'sms' | 'both'
export type AdminProactivePingKind =
  | 'morning_brief'
  | 'before_close'
  | 'pending_reviews'
  | 'ops_ready'
  | 'underfilled_risk'
  | 'owner_due'

type ReminderMetadata = Record<string, unknown>

export interface AdminProactivePingCandidate {
  kind: AdminProactivePingKind
  itemId: string
  title: string
  description: string
  href: string
}

function getHourForTimeZone(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hour12: false,
  }).formatToParts(now)
  const hourPart = parts.find((part) => part.type === 'hour')?.value
  const hour = Number(hourPart)
  return Number.isFinite(hour) ? hour : now.getHours()
}

function isHourInRange(now: Date, startHourInclusive: number, endHourExclusive: number, timeZone: string) {
  const hour = getHourForTimeZone(now, timeZone)
  return hour >= startHourInclusive && hour < endHourExclusive
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

export function buildAdminProactivePingCandidates(input: {
  clubId: string
  now: Date
  timeZone?: string
  pendingReviewCount: number
  readyOpsDraftCount: number
  underfilledRiskCount: number
  nextUnderfilledTitle?: string | null
  ownedDueSoonCount?: number
  ownedOverdueCount?: number
  nextOwnedDraftTitle?: string | null
}) {
  const timeZone = input.timeZone || 'America/Los_Angeles'
  const totalAttention =
    input.pendingReviewCount + input.readyOpsDraftCount + input.underfilledRiskCount
  const ownedAttention = (input.ownedDueSoonCount || 0) + (input.ownedOverdueCount || 0)

  const morningWindow = isHourInRange(input.now, 7, 11, timeZone)
  const closeWindow = isHourInRange(input.now, 15, 18, timeZone)
  const middayWindow = isHourInRange(input.now, 11, 15, timeZone)

  const briefCounts = [
    input.pendingReviewCount > 0 ? `${pluralize(input.pendingReviewCount, 'approval')} waiting` : null,
    input.readyOpsDraftCount > 0 ? `${pluralize(input.readyOpsDraftCount, 'ops draft')} ready` : null,
    input.underfilledRiskCount > 0 ? `${pluralize(input.underfilledRiskCount, 'underfilled session')} at risk` : null,
  ].filter(Boolean) as string[]

  if (morningWindow && totalAttention > 0) {
    return [{
      kind: 'morning_brief' as const,
      itemId: 'proactive:morning-brief',
      title: 'Morning ops brief is ready',
      description: `${briefCounts.join(', ')}. Start the day from the agent cockpit instead of chasing issues manually.`,
      href: `/clubs/${input.clubId}/intelligence/advisor`,
    }]
  }

  if (closeWindow && totalAttention > 0) {
    return [{
      kind: 'before_close' as const,
      itemId: 'proactive:before-close',
      title: 'Before close, the board still needs attention',
      description: `${briefCounts.join(', ')}. Clear the biggest blocker before the day ends.`,
      href: `/clubs/${input.clubId}/intelligence/advisor`,
    }]
  }

  const targeted: AdminProactivePingCandidate[] = []

  if (ownedAttention > 0) {
    targeted.push({
      kind: 'owner_due',
      itemId: 'proactive:owner-due',
      title:
        (input.ownedOverdueCount || 0) > 0
          ? `${pluralize(input.ownedOverdueCount || 0, 'owned ops draft')} are overdue`
          : `${pluralize(input.ownedDueSoonCount || 0, 'owned ops draft')} are due soon`,
      description: input.nextOwnedDraftTitle
        ? `${input.nextOwnedDraftTitle} is the clearest owner-level ops risk right now.`
        : 'One of your assigned ops drafts needs attention before it slips further.',
      href: `/clubs/${input.clubId}/intelligence/advisor?focus=ops-queue`,
    })
  }

  if (middayWindow && input.pendingReviewCount >= 2) {
    targeted.push({
      kind: 'pending_reviews',
      itemId: 'proactive:pending-reviews',
      title: `${pluralize(input.pendingReviewCount, 'approval')} still waiting`,
      description: 'Pending agent actions are stacking up. Review the queue before it slows the rest of the day down.',
      href: `/clubs/${input.clubId}/intelligence/advisor?focus=pending-queue`,
    })
  }

  if (middayWindow && input.readyOpsDraftCount > 0) {
    targeted.push({
      kind: 'ops_ready',
      itemId: 'proactive:ops-ready',
      title: `${pluralize(input.readyOpsDraftCount, 'ops draft')} ready for scheduling review`,
      description: 'The agent already prepared internal session drafts. A quick ops pass can move them forward today.',
      href: `/clubs/${input.clubId}/intelligence/advisor?focus=ops-queue`,
    })
  }

  if (input.underfilledRiskCount > 0) {
    targeted.push({
      kind: 'underfilled_risk',
      itemId: 'proactive:underfilled-risk',
      title: 'An underfilled session still looks at risk',
      description: input.nextUnderfilledTitle
        ? `${pluralize(input.underfilledRiskCount, 'session')} need help soon. ${input.nextUnderfilledTitle} is the next one to watch.`
        : `${pluralize(input.underfilledRiskCount, 'session')} need help soon. Open the schedule and fill plan before occupancy slips further.`,
      href: `/clubs/${input.clubId}/intelligence/sessions`,
    })
  }

  return targeted
}

function parseDateValue(value: unknown): Date | null {
  if (typeof value !== 'string') return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function getAdminReminderDue(metadata: unknown, now = new Date()) {
  const data = (metadata && typeof metadata === 'object' ? metadata : {}) as ReminderMetadata
  const remindAt = parseDateValue(data.remindAt)
  const remindLabel = typeof data.remindLabel === 'string' ? data.remindLabel : null

  if (!remindAt) {
    return {
      due: false,
      remindAt: null as Date | null,
      remindLabel,
    }
  }

  return {
    due: remindAt.getTime() <= now.getTime(),
    remindAt,
    remindLabel,
  }
}

export function shouldSendAdminReminderChannel(
  metadata: unknown,
  channel: AdminReminderChannel,
  now = new Date(),
) {
  const dueState = getAdminReminderDue(metadata, now)
  if (!dueState.due || !dueState.remindAt) return false

  const data = (metadata && typeof metadata === 'object' ? metadata : {}) as ReminderMetadata
  const sentAt = parseDateValue(
    channel === 'email' ? data.emailReminderSentAt : data.smsReminderSentAt,
  )

  if (!sentAt) return true
  return sentAt.getTime() < dueState.remindAt.getTime()
}

export function withAdminReminderChannelResult(
  metadata: unknown,
  channel: AdminReminderChannel,
  payload: { sentAt?: string; error?: string | null },
) {
  const data = { ...((metadata && typeof metadata === 'object' ? metadata : {}) as ReminderMetadata) }
  const sentKey = channel === 'email' ? 'emailReminderSentAt' : 'smsReminderSentAt'
  const errorKey = channel === 'email' ? 'emailReminderError' : 'smsReminderError'

  if (payload.sentAt) {
    data[sentKey] = payload.sentAt
    delete data[errorKey]
  } else if (payload.error) {
    data[errorKey] = payload.error
  }

  data.externalReminderUpdatedAt = new Date().toISOString()
  return data
}

export function resolveAdminReminderDeliveryMode(value: unknown): AdminReminderDeliveryMode {
  return value === 'email' || value === 'sms' || value === 'both' ? value : 'in_app'
}

export function resolveAdminReminderDeliveryModeFromMetadata(
  metadata: unknown,
  fallback: unknown,
): AdminReminderDeliveryMode {
  const data = (metadata && typeof metadata === 'object' ? metadata : {}) as ReminderMetadata
  const override = data.reminderChannel

  if (override === 'in_app' || override === 'email' || override === 'sms' || override === 'both') {
    return override
  }

  return resolveAdminReminderDeliveryMode(fallback)
}

export function resolveAdminReminderTarget(input: {
  explicit?: string | null
  fallback?: string | null
}) {
  const explicit = input.explicit?.trim()
  if (explicit) return explicit
  const fallback = input.fallback?.trim()
  return fallback || null
}

export function toAbsoluteAppUrl(href: string) {
  const normalizedBase = getPlatformBaseUrl()
  if (href.startsWith('http://') || href.startsWith('https://')) return href
  return `${normalizedBase}${href.startsWith('/') ? href : `/${href}`}`
}

export function buildAdminReminderEmail(input: {
  title: string
  clubName: string
  description?: string | null
  targetUrl: string
}) {
  const subject = `Reminder from ${input.clubName}: ${input.title}`
  const html = buildIqSportEmail({
    title: subject,
    heading: input.title,
    eyebrow: 'Agent Reminder',
    subheading: input.clubName,
    baseUrl: input.targetUrl,
    bodyHtml: `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.75;color:#CBD5E1;">
        ${input.description || `A snoozed admin task for ${input.clubName} is ready again.`}
      </p>
      ${buildEmailButton('Open in IQSport', input.targetUrl)}
    `,
  })

  return { subject, html }
}

export function buildAdminReminderSms(input: {
  title: string
  clubName: string
  targetUrl: string
}) {
  return `IQSport: Reminder for ${input.clubName} — ${input.title}. Open: ${input.targetUrl}`
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 320)
}
