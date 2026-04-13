import 'server-only'

import { formatAdvisorScheduledLabel } from './advisor-scheduling'
import { checkAntiSpam } from './anti-spam'
import { toDateTimeInputInTimeZone, toUtcIsoFromLocalInput } from '@/lib/timezone'

type GuardrailInviteType =
  | 'SLOT_FILLER'
  | 'REACTIVATION'
  | 'EVENT_INVITE'
  | 'CHECK_IN'
  | 'RETENTION_BOOST'
  | 'NEW_MEMBER_WELCOME'
type GuardrailChannel = 'email' | 'sms' | 'both'

type CandidateInput = {
  memberId: string
}

type GuardrailSummary = {
  requestedChannel: GuardrailChannel
  eligibleCount: number
  excludedCount: number
  deliveryBreakdown: {
    email: number
    sms: number
    both: number
  }
  reasons: Array<{
    code: string
    label: string
    count: number
  }>
  warnings: string[]
}

type CandidateDecision = {
  memberId: string
  allowed: boolean
  channel: GuardrailChannel | null
  reasonCode?: string
  reasonLabel?: string
}

type ContactPolicy = {
  timeZone: string
  quietHours: {
    startHour: number
    endHour: number
  }
  recentBookingLookbackDays: number
}

const DEFAULT_TIME_ZONE = 'America/New_York'
const DEFAULT_QUIET_HOURS = { startHour: 21, endHour: 8 }
const DEFAULT_RECENT_BOOKING_LOOKBACK_DAYS = 7

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

function clampDays(value: unknown, fallback: number) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(1, Math.min(30, Math.round(numeric)))
}

function resolveContactPolicy(opts: {
  timeZone?: string | null
  automationSettings?: unknown
}): ContactPolicy {
  const automationSettings = toRecord(opts.automationSettings)
  const intelligence = toRecord(automationSettings.intelligence)
  const contactPolicy = toRecord(intelligence.contactPolicy)
  const quietHours = toRecord(contactPolicy.quietHours)

  return {
    timeZone: String(opts.timeZone || intelligence.timezone || '').trim() || DEFAULT_TIME_ZONE,
    quietHours: {
      startHour: clampHour(quietHours.startHour, DEFAULT_QUIET_HOURS.startHour),
      endHour: clampHour(quietHours.endHour, DEFAULT_QUIET_HOURS.endHour),
    },
    recentBookingLookbackDays: clampDays(
      contactPolicy.recentBookingLookbackDays,
      DEFAULT_RECENT_BOOKING_LOOKBACK_DAYS,
    ),
  }
}

function getLocalDateTimeParts(now: Date, timeZone: string) {
  const input = toDateTimeInputInTimeZone(now, timeZone)
  const [datePart, timePart] = String(input || '').split('T')
  const [year, month, day] = (datePart || '').split('-').map(Number)
  const [hour, minute] = (timePart || '').split(':').map(Number)

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return {
      date: now.toISOString().slice(0, 10),
      hour: now.getUTCHours(),
      minute: now.getUTCMinutes(),
    }
  }

  return {
    date: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    hour,
    minute,
  }
}

function addDays(dateInput: string, days: number) {
  const date = new Date(`${dateInput}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function isQuietHours(hour: number, quietHours: ContactPolicy['quietHours']) {
  if (quietHours.startHour === quietHours.endHour) return false
  if (quietHours.startHour < quietHours.endHour) {
    return hour >= quietHours.startHour && hour < quietHours.endHour
  }
  return hour >= quietHours.startHour || hour < quietHours.endHour
}

function buildQuietHoursWarning(now: Date, policy: ContactPolicy) {
  const localNow = getLocalDateTimeParts(now, policy.timeZone)
  if (!isQuietHours(localNow.hour, policy.quietHours)) return null

  const nextDate = localNow.hour >= policy.quietHours.startHour
    ? addDays(localNow.date, 1)
    : localNow.date
  const nextLocalDateTime = `${nextDate}T${String(policy.quietHours.endHour).padStart(2, '0')}:00`
  const nextAllowedIso = toUtcIsoFromLocalInput(nextLocalDateTime, policy.timeZone)
  const nextLabel = nextAllowedIso
    ? formatAdvisorScheduledLabel(nextAllowedIso, policy.timeZone)
    : `${String(policy.quietHours.endHour).padStart(2, '0')}:00 ${policy.timeZone}`

  return `Quiet hours are active right now. Recommended send window starts ${nextLabel}.`
}

function normalizeAntiSpamReason(reason: string) {
  if (/already invited/i.test(reason)) {
    return { code: 'already_invited', label: 'Already invited to this session' }
  }
  if (/opted out/i.test(reason)) {
    return { code: 'notifications_opt_out', label: 'Member opted out of notifications' }
  }
  if (/last 24 hours/i.test(reason) || /last 7 days/i.test(reason)) {
    return { code: 'frequency_cap', label: 'Contact frequency limit reached' }
  }
  if (/cooldown/i.test(reason) || /recently contacted/i.test(reason)) {
    return { code: 'recent_outreach', label: 'Recently contacted' }
  }
  return { code: 'anti_spam', label: reason }
}

function resolveChannelAvailability(
  requestedChannel: GuardrailChannel,
  user: { email: string | null; phone: string | null; smsOptIn: boolean | null },
): { channel: GuardrailChannel | null; reasonCode?: string; reasonLabel?: string } {
  const hasEmail = !!user.email
  const hasPhone = !!user.phone
  const canSms = hasPhone && !!user.smsOptIn

  if (requestedChannel === 'email') {
    return hasEmail
      ? { channel: 'email' }
      : { channel: null, reasonCode: 'missing_email', reasonLabel: 'No email address available' }
  }

  if (requestedChannel === 'sms') {
    if (!hasPhone) return { channel: null, reasonCode: 'missing_phone', reasonLabel: 'No phone number available' }
    if (!canSms) return { channel: null, reasonCode: 'sms_opt_in_required', reasonLabel: 'SMS opt-in required' }
    return { channel: 'sms' }
  }

  if (hasEmail && canSms) return { channel: 'both' }
  if (hasEmail) return { channel: 'email' }
  if (canSms) return { channel: 'sms' }
  if (hasPhone) return { channel: null, reasonCode: 'sms_opt_in_required', reasonLabel: 'SMS opt-in required' }
  return { channel: null, reasonCode: 'missing_contact', reasonLabel: 'No reachable contact channel available' }
}

function summarizeReasons(reasonMap: Map<string, { code: string; label: string; count: number }>) {
  return Array.from(reasonMap.values()).sort((left, right) => right.count - left.count).slice(0, 8)
}

export function formatAdvisorGuardrailDigest(summary: GuardrailSummary) {
  const parts: string[] = []

  if (summary.excludedCount > 0) {
    const topReasons = summary.reasons
      .slice(0, 2)
      .map((reason) => `${reason.count} ${reason.label.toLowerCase()}`)
      .join('; ')
    parts.push(
      topReasons
        ? `${summary.excludedCount} member${summary.excludedCount === 1 ? '' : 's'} excluded by guardrails (${topReasons}).`
        : `${summary.excludedCount} member${summary.excludedCount === 1 ? '' : 's'} excluded by guardrails.`,
    )
  }

  if (summary.warnings.length > 0) {
    parts.push(summary.warnings[0]!)
  }

  return parts.join(' ')
}

export async function evaluateAdvisorContactGuardrails(opts: {
  prisma: any
  clubId: string
  type: GuardrailInviteType
  requestedChannel: GuardrailChannel
  candidates: CandidateInput[]
  sessionId?: string | null
  timeZone?: string | null
  automationSettings?: unknown
  now?: Date
}) {
  const {
    prisma,
    clubId,
    type,
    requestedChannel,
    candidates,
    sessionId = null,
    now = new Date(),
  } = opts

  const policy = resolveContactPolicy({
    timeZone: opts.timeZone,
    automationSettings: opts.automationSettings,
  })
  const memberIds = Array.from(new Set(candidates.map((candidate) => candidate.memberId).filter(Boolean)))

  const users: Array<{ id: string; email: string | null; phone: string | null; smsOptIn: boolean | null }> = memberIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: memberIds } },
        select: { id: true, email: true, phone: true, smsOptIn: true },
      })
    : []
  const usersById = new Map(users.map((user) => [user.id, user]))

  let recentBookingUserIds = new Set<string>()
  if (type === 'REACTIVATION' && memberIds.length > 0) {
    const bookingCutoff = new Date(now.getTime() - policy.recentBookingLookbackDays * 86400000)
    const recentBookings: Array<{ userId: string }> = await prisma.playSessionBooking.findMany({
      where: {
        userId: { in: memberIds },
        status: 'CONFIRMED',
        playSession: {
          clubId,
          date: { gte: bookingCutoff },
        },
      },
      select: { userId: true },
      distinct: ['userId'],
    })
    recentBookingUserIds = new Set(recentBookings.map((booking) => booking.userId))
  }

  const reasonMap = new Map<string, { code: string; label: string; count: number }>()
  const deliveryBreakdown = { email: 0, sms: 0, both: 0 }
  const decisionMap = new Map<string, CandidateDecision>()

  for (const candidate of candidates) {
    const user = usersById.get(candidate.memberId)
    if (!user) {
      decisionMap.set(candidate.memberId, {
        memberId: candidate.memberId,
        allowed: false,
        channel: null,
        reasonCode: 'missing_member',
        reasonLabel: 'Member record not found',
      })
      continue
    }

    if (type === 'REACTIVATION' && recentBookingUserIds.has(user.id)) {
      decisionMap.set(candidate.memberId, {
        memberId: candidate.memberId,
        allowed: false,
        channel: null,
        reasonCode: 'recent_booking',
        reasonLabel: 'Booked recently or already coming back',
      })
      continue
    }

    const channelAvailability = resolveChannelAvailability(requestedChannel, user)
    if (!channelAvailability.channel) {
      decisionMap.set(candidate.memberId, {
        memberId: candidate.memberId,
        allowed: false,
        channel: null,
        reasonCode: channelAvailability.reasonCode,
        reasonLabel: channelAvailability.reasonLabel,
      })
      continue
    }

    const antiSpam = await checkAntiSpam({
      prisma,
      userId: user.id,
      clubId,
      type,
      sessionId,
    })
    if (!antiSpam.allowed) {
      const normalized = normalizeAntiSpamReason(antiSpam.reason || 'Blocked by contact policy')
      decisionMap.set(candidate.memberId, {
        memberId: candidate.memberId,
        allowed: false,
        channel: null,
        reasonCode: normalized.code,
        reasonLabel: normalized.label,
      })
      continue
    }

    deliveryBreakdown[channelAvailability.channel] += 1
    decisionMap.set(candidate.memberId, {
      memberId: candidate.memberId,
      allowed: true,
      channel: channelAvailability.channel,
    })
  }

  for (const decision of Array.from(decisionMap.values())) {
    if (decision.allowed || !decision.reasonCode || !decision.reasonLabel) continue
    const existing = reasonMap.get(decision.reasonCode)
    if (existing) {
      existing.count += 1
    } else {
      reasonMap.set(decision.reasonCode, {
        code: decision.reasonCode,
        label: decision.reasonLabel,
        count: 1,
      })
    }
  }

  const warnings: string[] = []
  const quietHoursWarning = buildQuietHoursWarning(now, policy)
  if (quietHoursWarning) warnings.push(quietHoursWarning)

  const eligibleCandidates = candidates
    .map((candidate) => {
      const decision = decisionMap.get(candidate.memberId)
      if (!decision?.allowed || !decision.channel) return null
      return {
        memberId: candidate.memberId,
        channel: decision.channel,
      }
    })
    .filter(Boolean) as Array<{ memberId: string; channel: GuardrailChannel }>

  const summary: GuardrailSummary = {
    requestedChannel,
    eligibleCount: eligibleCandidates.length,
    excludedCount: Math.max(0, candidates.length - eligibleCandidates.length),
    deliveryBreakdown,
    reasons: summarizeReasons(reasonMap),
    warnings,
  }

  return {
    eligibleCandidates,
    summary,
    decisionMap,
  }
}
