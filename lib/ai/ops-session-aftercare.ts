export type OpsSessionAftercareStatus = 'aligned' | 'drifted' | 'missing'
export type OpsSessionAftercareRollbackStatus = 'ready' | 'warn' | 'blocked'

export interface OpsSessionAftercareDraftSnapshot {
  title: string
  description?: string | null
  date: string | Date
  startTime: string
  endTime: string
  format: string
  skillLevel: string
  maxPlayers: number
}

export interface OpsSessionAftercareLiveSession {
  id: string
  title: string
  description?: string | null
  date: string | Date
  startTime: string
  endTime: string
  format: string
  skillLevel: string
  maxPlayers: number
  status?: string | null
  confirmedCount?: number
  waitlistCount?: number
}

export interface OpsSessionAftercareDiffItem {
  field: 'title' | 'description' | 'date' | 'startTime' | 'endTime' | 'format' | 'skillLevel' | 'maxPlayers'
  label: string
  draftValue: string
  liveValue: string
}

export interface OpsSessionAftercareReview {
  status: OpsSessionAftercareStatus
  summary: string
  recommendedAction: string
  driftedFields: OpsSessionAftercareDiffItem[]
  blockerCount: number
  warningCount: number
  blockers: string[]
  warnings: string[]
  rollbackStatus: OpsSessionAftercareRollbackStatus
  rollbackSummary: string
  canEdit: boolean
  canRollback: boolean
}

function normalizeText(value: string | null | undefined) {
  return String(value || '').trim()
}

function normalizeDateKey(value: string | Date | null | undefined) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

function stringifyMaxPlayers(value: number | null | undefined) {
  return Number.isFinite(value) ? String(value) : ''
}

const AFTERCARE_FIELD_LABELS: Record<OpsSessionAftercareDiffItem['field'], string> = {
  title: 'Title',
  description: 'Description',
  date: 'Date',
  startTime: 'Start time',
  endTime: 'End time',
  format: 'Format',
  skillLevel: 'Skill level',
  maxPlayers: 'Max players',
}

const STRUCTURAL_FIELDS = new Set<OpsSessionAftercareDiffItem['field']>([
  'date',
  'startTime',
  'endTime',
  'format',
  'skillLevel',
  'maxPlayers',
])

function buildDiffItem(
  field: OpsSessionAftercareDiffItem['field'],
  draftValue: string,
  liveValue: string,
): OpsSessionAftercareDiffItem | null {
  if (draftValue === liveValue) return null
  return {
    field,
    label: AFTERCARE_FIELD_LABELS[field],
    draftValue,
    liveValue,
  }
}

export function buildOpsSessionAftercareReview(input: {
  draft: OpsSessionAftercareDraftSnapshot
  liveSession?: OpsSessionAftercareLiveSession | null
}) {
  const liveSession = input.liveSession || null

  if (!liveSession) {
    return {
      status: 'missing',
      summary: 'The live session is missing, so this publish no longer matches the schedule.',
      recommendedAction: 'Recreate the live session from the ops draft or review what removed it from the schedule.',
      driftedFields: [],
      blockerCount: 1,
      warningCount: 0,
      blockers: ['The published play session no longer exists on the live schedule.'],
      warnings: [],
      rollbackStatus: 'blocked',
      rollbackSummary: 'Rollback is blocked because there is no live session left to restore.',
      canEdit: false,
      canRollback: false,
    } satisfies OpsSessionAftercareReview
  }

  const driftedFields = [
    buildDiffItem('title', normalizeText(input.draft.title), normalizeText(liveSession.title)),
    buildDiffItem('description', normalizeText(input.draft.description), normalizeText(liveSession.description)),
    buildDiffItem('date', normalizeDateKey(input.draft.date), normalizeDateKey(liveSession.date)),
    buildDiffItem('startTime', normalizeText(input.draft.startTime), normalizeText(liveSession.startTime)),
    buildDiffItem('endTime', normalizeText(input.draft.endTime), normalizeText(liveSession.endTime)),
    buildDiffItem('format', normalizeText(input.draft.format), normalizeText(liveSession.format)),
    buildDiffItem('skillLevel', normalizeText(input.draft.skillLevel), normalizeText(liveSession.skillLevel)),
    buildDiffItem('maxPlayers', stringifyMaxPlayers(input.draft.maxPlayers), stringifyMaxPlayers(liveSession.maxPlayers)),
  ].filter((item): item is OpsSessionAftercareDiffItem => !!item)

  const blockers: string[] = []
  const warnings: string[] = []
  const structuralDrift = driftedFields.filter((item) => STRUCTURAL_FIELDS.has(item.field))
  const confirmedCount = Math.max(0, Number(liveSession.confirmedCount || 0))
  const waitlistCount = Math.max(0, Number(liveSession.waitlistCount || 0))
  const hasDemand = confirmedCount > 0 || waitlistCount > 0
  const normalizedStatus = normalizeText(liveSession.status).toUpperCase()

  if (normalizedStatus === 'IN_PROGRESS' || normalizedStatus === 'COMPLETED') {
    blockers.push('This live session is already in progress or completed, so rollback should stay manual-only.')
  }

  if (structuralDrift.length > 0 && hasDemand) {
    blockers.push(`Rollback would change live logistics with ${confirmedCount} confirmed booking${confirmedCount === 1 ? '' : 's'} and ${waitlistCount} waitlist entr${waitlistCount === 1 ? 'y' : 'ies'} already attached.`)
  } else if (structuralDrift.length > 0) {
    warnings.push('The live session drifted from the original publish plan, so review the change before deciding whether to revert it.')
  }

  if (driftedFields.length === 0) {
    return {
      status: 'aligned',
      summary: 'The live session still matches the original publish plan.',
      recommendedAction: 'No aftercare change is needed right now.',
      driftedFields: [],
      blockerCount: 0,
      warningCount: 0,
      blockers: [],
      warnings: [],
      rollbackStatus: 'ready',
      rollbackSummary: 'Rollback is not needed because the live session is already aligned.',
      canEdit: true,
      canRollback: false,
    } satisfies OpsSessionAftercareReview
  }

  const rollbackStatus: OpsSessionAftercareRollbackStatus =
    blockers.length > 0 ? 'blocked' : warnings.length > 0 ? 'warn' : 'ready'

  const rollbackSummary =
    rollbackStatus === 'blocked'
      ? blockers[0] || 'Rollback is blocked until the live session is safe to edit.'
      : rollbackStatus === 'warn'
        ? warnings[0] || 'Rollback is available, but this live drift should get one more human check.'
        : 'Rollback can safely restore the live session back to the original publish plan.'

  return {
    status: 'drifted',
    summary:
      driftedFields.length === 1
        ? `The live session drifted on ${driftedFields[0].label.toLowerCase()}.`
        : `The live session drifted from the original publish plan across ${driftedFields.length} fields.`,
    recommendedAction:
      rollbackStatus === 'blocked'
        ? 'Review the live changes manually and only edit the session in place if the current bookings can absorb it.'
        : rollbackStatus === 'warn'
          ? 'Check the live change, then either keep the new version or roll it back to the original publish plan.'
          : 'You can keep the live edits or roll the session back to the original publish plan.',
    driftedFields,
    blockerCount: blockers.length,
    warningCount: warnings.length,
    blockers,
    warnings,
    rollbackStatus,
    rollbackSummary,
    canEdit: true,
    canRollback: rollbackStatus !== 'blocked',
  } satisfies OpsSessionAftercareReview
}
