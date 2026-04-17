export type OpsSessionPublishReviewStatus = 'ready' | 'warn' | 'blocked'

export interface OpsSessionPublishReviewSession {
  id: string
  title: string
  date: string | Date
  startTime: string
  endTime: string
  format: string
  skillLevel: string
  status?: string | null
}

export interface OpsSessionPublishReviewDraft {
  title: string
  date: string | Date
  startTime: string
  endTime: string
  format: string
  skillLevel: string
}

export interface OpsSessionPublishReviewItem {
  id: string
  title: string
  startTime: string
  endTime: string
  format: string
  skillLevel: string
  reason: 'exact_duplicate' | 'format_duplicate' | 'overlap' | 'same_day'
}

export interface OpsSessionPublishReview {
  status: OpsSessionPublishReviewStatus
  summary: string
  blockers: string[]
  warnings: string[]
  recommendedAction: string
  exactMatchSessionId: string | null
  exactFormatSessionId: string | null
  sameDaySessionCount: number
  overlappingSessionCount: number
  sameFormatOverlapCount: number
  sameSkillOverlapCount: number
  courtPressure: 'low' | 'medium' | 'high'
  relatedSessions: OpsSessionPublishReviewItem[]
}

function normalizeTitle(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function toDateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

function toMinutes(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})/)
  if (!match) return 0
  return Number(match[1]) * 60 + Number(match[2])
}

function overlaps(left: { startTime: string; endTime: string }, right: { startTime: string; endTime: string }) {
  const leftStart = toMinutes(left.startTime)
  const leftEnd = toMinutes(left.endTime)
  const rightStart = toMinutes(right.startTime)
  const rightEnd = toMinutes(right.endTime)
  return leftStart < rightEnd && rightStart < leftEnd
}

function getCourtPressureLevel(sameDaySessionCount: number, courtCount?: number | null) {
  if (courtCount && courtCount > 0) {
    if (sameDaySessionCount >= courtCount * 3) return 'high' as const
    if (sameDaySessionCount >= courtCount * 2) return 'medium' as const
    return 'low' as const
  }

  if (sameDaySessionCount >= 8) return 'high' as const
  if (sameDaySessionCount >= 4) return 'medium' as const
  return 'low' as const
}

function takeRelatedSessions(sessions: OpsSessionPublishReviewItem[]) {
  const seen = new Set<string>()
  return sessions.filter((session) => {
    if (seen.has(session.id)) return false
    seen.add(session.id)
    return true
  }).slice(0, 3)
}

export function buildOpsSessionPublishReview(input: {
  draft: OpsSessionPublishReviewDraft
  existingSessions: OpsSessionPublishReviewSession[]
  courtCount?: number | null
  ignoreSessionId?: string | null
}) {
  const draftDateKey = toDateKey(input.draft.date)
  const activeSameDaySessions = input.existingSessions.filter((session) =>
    session.id !== input.ignoreSessionId
    && session.status !== 'CANCELLED'
    && toDateKey(session.date) === draftDateKey,
  )

  const exactTitleWindowMatch = activeSameDaySessions.find((session) =>
    normalizeTitle(session.title) === normalizeTitle(input.draft.title)
    && session.startTime === input.draft.startTime
    && session.endTime === input.draft.endTime,
  ) || null

  const exactFormatSkillWindowMatch = activeSameDaySessions.find((session) =>
    session.startTime === input.draft.startTime
    && session.endTime === input.draft.endTime
    && session.format === input.draft.format
    && session.skillLevel === input.draft.skillLevel,
  ) || null

  const overlappingSessions = activeSameDaySessions.filter((session) =>
    overlaps(session, input.draft),
  )
  const sameFormatOverlapCount = overlappingSessions.filter((session) => session.format === input.draft.format).length
  const sameSkillOverlapCount = overlappingSessions.filter((session) => session.skillLevel === input.draft.skillLevel).length
  const courtPressure = getCourtPressureLevel(activeSameDaySessions.length, input.courtCount)

  const blockers: string[] = []
  const warnings: string[] = []
  const relatedSessions: OpsSessionPublishReviewItem[] = []

  if (exactTitleWindowMatch) {
    blockers.push(`A live session with the same title already exists on this date in the exact ${input.draft.startTime}-${input.draft.endTime} window.`)
    relatedSessions.push({
      id: exactTitleWindowMatch.id,
      title: exactTitleWindowMatch.title,
      startTime: exactTitleWindowMatch.startTime,
      endTime: exactTitleWindowMatch.endTime,
      format: exactTitleWindowMatch.format,
      skillLevel: exactTitleWindowMatch.skillLevel,
      reason: 'exact_duplicate',
    })
  }

  if (
    exactFormatSkillWindowMatch
    && exactFormatSkillWindowMatch.id !== exactTitleWindowMatch?.id
  ) {
    blockers.push(`A live ${input.draft.format.replace(/_/g, ' ').toLowerCase()} / ${input.draft.skillLevel.replace(/_/g, ' ').toLowerCase()} session already exists in this exact time window.`)
    relatedSessions.push({
      id: exactFormatSkillWindowMatch.id,
      title: exactFormatSkillWindowMatch.title,
      startTime: exactFormatSkillWindowMatch.startTime,
      endTime: exactFormatSkillWindowMatch.endTime,
      format: exactFormatSkillWindowMatch.format,
      skillLevel: exactFormatSkillWindowMatch.skillLevel,
      reason: 'format_duplicate',
    })
  }

  if (overlappingSessions.length > 0) {
    warnings.push(`${overlappingSessions.length} live session${overlappingSessions.length === 1 ? '' : 's'} already overlap this planned window.`)
    relatedSessions.push(
      ...overlappingSessions.map((session) => ({
        id: session.id,
        title: session.title,
        startTime: session.startTime,
        endTime: session.endTime,
        format: session.format,
        skillLevel: session.skillLevel,
        reason: 'overlap' as const,
      })),
    )
  }

  if (sameFormatOverlapCount > 0) {
    warnings.push(`${sameFormatOverlapCount} overlapping session${sameFormatOverlapCount === 1 ? '' : 's'} already use the same format, so cannibalization risk is higher.`)
  }

  if (sameSkillOverlapCount > 0) {
    warnings.push(`${sameSkillOverlapCount} overlapping session${sameSkillOverlapCount === 1 ? '' : 's'} already target the same skill band.`)
  }

  if (courtPressure === 'high') {
    warnings.push(`This date is already carrying heavy schedule pressure with ${activeSameDaySessions.length} live sessions across the club.`)
  } else if (courtPressure === 'medium') {
    warnings.push(`This date already has ${activeSameDaySessions.length} live sessions, so it deserves a final human check before publish.`)
  }

  if (activeSameDaySessions.length > 0) {
    relatedSessions.push(
      ...activeSameDaySessions.map((session) => ({
        id: session.id,
        title: session.title,
        startTime: session.startTime,
        endTime: session.endTime,
        format: session.format,
        skillLevel: session.skillLevel,
        reason: 'same_day' as const,
      })),
    )
  }

  const status: OpsSessionPublishReviewStatus =
    blockers.length > 0 ? 'blocked' : warnings.length > 0 ? 'warn' : 'ready'

  const summary =
    status === 'blocked'
      ? blockers[0] || 'Controlled publish is blocked until this duplicate is resolved.'
      : status === 'warn'
        ? warnings[0] || 'This session can publish, but it should get one more human review first.'
        : 'No live duplicates or overlapping schedule conflicts were detected for this publish plan.'

  const recommendedAction =
    status === 'blocked'
      ? 'Change the date, title, or format before publishing this session live.'
      : status === 'warn'
        ? 'Review the overlap and same-day load, then publish only if the club still wants this exact slot.'
        : 'This session is clear to publish whenever the team is ready.'

  return {
    status,
    summary,
    blockers,
    warnings,
    recommendedAction,
    exactMatchSessionId: exactTitleWindowMatch?.id || null,
    exactFormatSessionId: exactFormatSkillWindowMatch?.id || null,
    sameDaySessionCount: activeSameDaySessions.length,
    overlappingSessionCount: overlappingSessions.length,
    sameFormatOverlapCount,
    sameSkillOverlapCount,
    courtPressure,
    relatedSessions: takeRelatedSessions(relatedSessions),
  } satisfies OpsSessionPublishReview
}
