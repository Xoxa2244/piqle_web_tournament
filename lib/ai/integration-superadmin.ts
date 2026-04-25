import type { IntegrationHealthTone } from './integration-health'
import { buildIntegrationAnomalyRecurrence } from './integration-anomaly-history'

type RecurrenceStatus = 'new' | 'recurring' | 'chronic'

interface IntegrationOpsClubRow {
  id: string
  name: string
  connectors: Array<{
    id: string
    provider: string
    status: string
    lastSyncAt: string | Date | null
    lastSyncResult?: Record<string, unknown> | null
    lastError?: string | null
    autoSync?: boolean
    syncIntervalHours?: number | null
  }>
  admins: Array<{
    role: string
    user: {
      id: string
      name: string | null
      email: string | null
    }
  }>
}

interface IntegrationOpsIncidentRow {
  id: string
  clubId: string
  anomalyKey: string
  severity: string
  category: string
  title: string
  summary: string
  evidenceLabel: string
  firstSeenAt: string | Date
  lastSeenAt: string | Date
  activeDays: number
  resolvedAt: string | Date | null
}

interface BuildSuperadminIntegrationOpsDashboardInput {
  clubs: IntegrationOpsClubRow[]
  activeIncidents: IntegrationOpsIncidentRow[]
  recentIncidents: IntegrationOpsIncidentRow[]
  decisions: Array<{
    id: string
    clubId: string
    targetId: string | null
    createdAt: string | Date
    metadata?: unknown
    user?: {
      id: string
      name: string | null
      email: string | null
    } | null
  }>
  windowDays: number
  now?: Date
}

export interface SuperadminIntegrationOpsState {
  status: 'acknowledged' | 'assigned' | 'escalated'
  label: string
  summary: string
  actorLabel: string
  ownerUserId?: string | null
  ownerLabel?: string | null
  note?: string | null
  updatedAt: string | Date
}

export interface SuperadminIntegrationIssueSummary {
  id: string
  key: string
  severity: IntegrationHealthTone
  category: string
  title: string
  summary: string
  evidenceLabel: string
  isSynthetic: boolean
  opsState?: SuperadminIntegrationOpsState | null
  history?: {
    status: RecurrenceStatus
    label: string
    summary: string
    daysActive: number
    incidentCount: number
    returnedCount: number
  } | null
}

export interface SuperadminIntegrationClubSummary {
  id: string
  name: string
  status: IntegrationHealthTone
  attentionSummary: string
  connector: {
    id: string | null
    provider: string | null
    status: string
    lastSyncAt: string | Date | null
    lastError: string | null
    autoSync: boolean
    freshnessLabel: string
    freshnessTone: 'healthy' | 'watch' | 'at_risk' | 'none'
    canSync: boolean
  }
  admins: Array<{
    id: string
    name: string | null
    email: string | null
    role: string
  }>
  issueCount: number
  atRiskCount: number
  watchCount: number
  recurringCount: number
  chronicCount: number
  resolvedInWindowCount: number
  issues: SuperadminIntegrationIssueSummary[]
  topIssue?: SuperadminIntegrationIssueSummary | null
}

export interface SuperadminIntegrationOpsDashboard {
  windowDays: number
  summary: {
    totalClubs: number
    connectedClubs: number
    affectedClubs: number
    healthyClubs: number
    atRiskClubs: number
    watchClubs: number
    recurringClubs: number
    chronicClubs: number
    unresolvedIssues: number
    resolvedIssuesInWindow: number
  }
  topPatterns: Array<{
    key: string
    label: string
    count: number
    atRiskCount: number
    chronicCount: number
  }>
  clubs: SuperadminIntegrationClubSummary[]
}

const SEVERITY_RANK: Record<IntegrationHealthTone, number> = {
  at_risk: 0,
  watch: 1,
  healthy: 2,
}

function normalizeSeverity(input: string): IntegrationHealthTone {
  return input === 'at_risk' ? 'at_risk' : input === 'watch' ? 'watch' : 'healthy'
}

function describeFreshness(input: {
  connector: IntegrationOpsClubRow['connectors'][number] | null
  now: Date
}) {
  const connector = input.connector
  if (!connector) {
    return {
      label: 'No connector configured',
      tone: 'none' as const,
    }
  }

  if (!connector.lastSyncAt) {
    return {
      label: 'Never synced',
      tone: 'watch' as const,
    }
  }

  const lastSyncAt = new Date(connector.lastSyncAt)
  const syncIntervalHours = connector.syncIntervalHours || 6
  const staleWatchHours = Math.max(syncIntervalHours * 4, 24)
  const staleRiskHours = Math.max(syncIntervalHours * 8, 72)
  const diffHours = Math.round((input.now.getTime() - lastSyncAt.getTime()) / (1000 * 60 * 60))

  if (diffHours >= staleRiskHours) {
    return {
      label: `Stale ${diffHours}h`,
      tone: 'at_risk' as const,
    }
  }

  if (diffHours >= staleWatchHours) {
    return {
      label: `Stale ${diffHours}h`,
      tone: 'watch' as const,
    }
  }

  if (diffHours < 1) {
    return {
      label: 'Synced <1h ago',
      tone: 'healthy' as const,
    }
  }

  if (diffHours < 24) {
    return {
      label: `Synced ${diffHours}h ago`,
      tone: 'healthy' as const,
    }
  }

  const diffDays = Math.round(diffHours / 24)
  return {
    label: `Synced ${diffDays}d ago`,
    tone: 'healthy' as const,
  }
}

function buildSyntheticConnectorIssues(input: {
  connector: IntegrationOpsClubRow['connectors'][number] | null
  freshness: ReturnType<typeof describeFreshness>
}): SuperadminIntegrationIssueSummary[] {
  const connector = input.connector
  if (!connector) return []

  const issues: SuperadminIntegrationIssueSummary[] = []

  if (connector.status === 'error' || connector.lastError) {
    issues.push({
      id: `synthetic_connector_error_${connector.id}`,
      key: 'connector_error',
      severity: 'at_risk',
      category: 'connector',
      title: 'Connector is in error state',
      summary: connector.lastError || 'The connector is currently reporting an error state and needs operator attention.',
      evidenceLabel: connector.provider,
      isSynthetic: true,
      opsState: null,
      history: null,
    })
  }

  if (!connector.lastSyncAt) {
    issues.push({
      id: `synthetic_never_synced_${connector.id}`,
      key: 'never_synced',
      severity: 'watch',
      category: 'connector',
      title: 'Connector has never synced',
      summary: 'This connector is configured, but no successful sync timestamp has been recorded yet.',
      evidenceLabel: connector.provider,
      isSynthetic: true,
      opsState: null,
      history: null,
    })
  } else if (input.freshness.tone === 'at_risk' || input.freshness.tone === 'watch') {
    issues.push({
      id: `synthetic_stale_${connector.id}`,
      key: input.freshness.tone === 'at_risk' ? 'stale_sync_risk' : 'stale_sync_watch',
      severity: input.freshness.tone,
      category: 'connector',
      title: input.freshness.tone === 'at_risk' ? 'Sync freshness is at risk' : 'Sync freshness needs review',
      summary: `The connector has not synced recently enough for its configured cadence. ${input.freshness.label}.`,
      evidenceLabel: input.freshness.label,
      isSynthetic: true,
      opsState: null,
      history: null,
    })
  }

  return issues
}

function sortIssues(items: SuperadminIntegrationIssueSummary[]) {
  return [...items].sort((a, b) => {
    if (SEVERITY_RANK[a.severity] !== SEVERITY_RANK[b.severity]) {
      return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    }
    const chronicDelta =
      (b.history?.status === 'chronic' ? 1 : 0) - (a.history?.status === 'chronic' ? 1 : 0)
    if (chronicDelta !== 0) return chronicDelta
    const recurringDelta =
      (b.history?.status === 'recurring' ? 1 : 0) - (a.history?.status === 'recurring' ? 1 : 0)
    if (recurringDelta !== 0) return recurringDelta
    return a.title.localeCompare(b.title)
  })
}

function buildOpsState(input: {
  decision?: BuildSuperadminIntegrationOpsDashboardInput['decisions'][number] | null
}): SuperadminIntegrationOpsState | null {
  const decision = input.decision
  if (!decision) return null
  const metadata = (decision.metadata || {}) as Record<string, unknown>
  const rawDecision = typeof metadata.decision === 'string' ? metadata.decision : null
  const status: SuperadminIntegrationOpsState['status'] =
    rawDecision === 'assign'
      ? 'assigned'
      : rawDecision === 'escalate'
        ? 'escalated'
        : rawDecision === 'acknowledge'
          ? 'acknowledged'
          : 'acknowledged'

  const actorLabel = decision.user?.name || decision.user?.email || 'Superadmin'
  const ownerLabel = typeof metadata.ownerLabel === 'string' ? metadata.ownerLabel : null
  const ownerUserId = typeof metadata.ownerUserId === 'string' ? metadata.ownerUserId : null
  const note = typeof metadata.note === 'string' ? metadata.note : null

  const label =
    status === 'assigned'
      ? 'Assigned'
      : status === 'escalated'
        ? 'Escalated'
        : 'Acknowledged'

  const summary =
    status === 'assigned'
      ? ownerLabel
        ? `${actorLabel} assigned this incident to ${ownerLabel}.`
        : `${actorLabel} assigned this incident for follow-up.`
      : status === 'escalated'
        ? note
          ? `${actorLabel} escalated this incident. ${note}`
          : `${actorLabel} escalated this incident for urgent follow-up.`
        : `${actorLabel} acknowledged this incident.`

  return {
    status,
    label,
    summary,
    actorLabel,
    ownerUserId,
    ownerLabel,
    note,
    updatedAt: decision.createdAt,
  }
}

export function buildSuperadminIntegrationOpsDashboard(
  input: BuildSuperadminIntegrationOpsDashboardInput,
): SuperadminIntegrationOpsDashboard {
  const now = input.now || new Date()
  const activeByClub = new Map<string, IntegrationOpsIncidentRow[]>()
  const recentByClub = new Map<string, IntegrationOpsIncidentRow[]>()
  const decisionByTargetId = new Map<string, BuildSuperadminIntegrationOpsDashboardInput['decisions'][number]>()

  for (const incident of input.activeIncidents) {
    const bucket = activeByClub.get(incident.clubId) || []
    bucket.push(incident)
    activeByClub.set(incident.clubId, bucket)
  }

  for (const incident of input.recentIncidents) {
    const bucket = recentByClub.get(incident.clubId) || []
    bucket.push(incident)
    recentByClub.set(incident.clubId, bucket)
  }

  for (const decision of input.decisions) {
    if (!decision.targetId || decisionByTargetId.has(decision.targetId)) continue
    decisionByTargetId.set(decision.targetId, decision)
  }

  const clubs = input.clubs.map<SuperadminIntegrationClubSummary>((club) => {
    const connector = club.connectors[0] || null
    const freshness = describeFreshness({ connector, now })
    const activeIncidents = activeByClub.get(club.id) || []
    const recentIncidents = recentByClub.get(club.id) || []
    const recentByKey = recentIncidents.reduce<Record<string, IntegrationOpsIncidentRow[]>>((acc, incident) => {
      if (!acc[incident.anomalyKey]) acc[incident.anomalyKey] = []
      acc[incident.anomalyKey].push(incident)
      return acc
    }, {})

    const activeIssues = activeIncidents.map<SuperadminIntegrationIssueSummary>((incident) => ({
      id: incident.id,
      key: incident.anomalyKey,
      severity: normalizeSeverity(incident.severity),
      category: incident.category,
      title: incident.title,
      summary: incident.summary,
      evidenceLabel: incident.evidenceLabel,
      isSynthetic: false,
      opsState: buildOpsState({ decision: decisionByTargetId.get(incident.id) }) || null,
      history: buildIntegrationAnomalyRecurrence({
        activeDays: incident.activeDays,
        incidentCount: recentByKey[incident.anomalyKey]?.length || 1,
        firstSeenAt: incident.firstSeenAt,
        lastSeenAt: incident.lastSeenAt,
      }),
    }))

    const existingKeys = new Set(activeIssues.map((issue) => issue.key))
    const syntheticIssues = buildSyntheticConnectorIssues({ connector, freshness }).filter(
      (issue) => !existingKeys.has(issue.key),
    )
    const issues = sortIssues([...activeIssues, ...syntheticIssues])
    const atRiskCount = issues.filter((issue) => issue.severity === 'at_risk').length
    const watchCount = issues.filter((issue) => issue.severity === 'watch').length
    const recurringCount = issues.filter((issue) => issue.history?.status === 'recurring').length
    const chronicCount = issues.filter((issue) => issue.history?.status === 'chronic').length
    const status: IntegrationHealthTone = atRiskCount > 0 ? 'at_risk' : watchCount > 0 ? 'watch' : 'healthy'

    return {
      id: club.id,
      name: club.name,
      status,
      attentionSummary: issues[0]?.summary
        || (connector ? `Connector ${connector.provider} is currently ${connector.status}.` : 'No integration issue is active right now.'),
      connector: {
        id: connector?.id || null,
        provider: connector?.provider || null,
        status: connector?.status || 'none',
        lastSyncAt: connector?.lastSyncAt || null,
        lastError: connector?.lastError || null,
        autoSync: connector?.autoSync ?? false,
        freshnessLabel: freshness.label,
        freshnessTone: freshness.tone,
        canSync: !!connector && connector.status !== 'syncing' && connector.status !== 'disconnected',
      },
      admins: club.admins.map((admin) => ({
        id: admin.user.id,
        name: admin.user.name,
        email: admin.user.email,
        role: admin.role,
      })),
      issueCount: issues.length,
      atRiskCount,
      watchCount,
      recurringCount,
      chronicCount,
      resolvedInWindowCount: recentIncidents.filter((incident) => !!incident.resolvedAt).length,
      issues: issues.slice(0, 4),
      topIssue: issues[0] || null,
    }
  }).filter((club) => club.connector.id || club.issueCount > 0)

  const sortedClubs = [...clubs].sort((a, b) => {
    if (SEVERITY_RANK[a.status] !== SEVERITY_RANK[b.status]) {
      return SEVERITY_RANK[a.status] - SEVERITY_RANK[b.status]
    }
    if (b.chronicCount !== a.chronicCount) return b.chronicCount - a.chronicCount
    if (b.recurringCount !== a.recurringCount) return b.recurringCount - a.recurringCount
    if (b.issueCount !== a.issueCount) return b.issueCount - a.issueCount
    return a.name.localeCompare(b.name)
  })

  const patternMap = new Map<string, {
    key: string
    label: string
    count: number
    atRiskCount: number
    chronicCount: number
  }>()
  for (const club of sortedClubs) {
    for (const issue of club.issues) {
      const current = patternMap.get(issue.key) || {
        key: issue.key,
        label: issue.title,
        count: 0,
        atRiskCount: 0,
        chronicCount: 0,
      }
      current.count += 1
      current.atRiskCount += issue.severity === 'at_risk' ? 1 : 0
      current.chronicCount += issue.history?.status === 'chronic' ? 1 : 0
      patternMap.set(issue.key, current)
    }
  }
  const topPatterns = Array.from(patternMap.values())
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      if (b.chronicCount !== a.chronicCount) return b.chronicCount - a.chronicCount
      return a.label.localeCompare(b.label)
    })
    .slice(0, 6)

  return {
    windowDays: input.windowDays,
    summary: {
      totalClubs: sortedClubs.length,
      connectedClubs: sortedClubs.filter((club) => !!club.connector.id).length,
      affectedClubs: sortedClubs.filter((club) => club.issueCount > 0).length,
      healthyClubs: sortedClubs.filter((club) => club.status === 'healthy').length,
      atRiskClubs: sortedClubs.filter((club) => club.status === 'at_risk').length,
      watchClubs: sortedClubs.filter((club) => club.status === 'watch').length,
      recurringClubs: sortedClubs.filter((club) => club.recurringCount > 0).length,
      chronicClubs: sortedClubs.filter((club) => club.chronicCount > 0).length,
      unresolvedIssues: sortedClubs.reduce((sum, club) => sum + club.issueCount, 0),
      resolvedIssuesInWindow: sortedClubs.reduce((sum, club) => sum + club.resolvedInWindowCount, 0),
    },
    topPatterns,
    clubs: sortedClubs,
  }
}
