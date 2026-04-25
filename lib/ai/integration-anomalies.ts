import type {
  IntegrationHealthIssue,
  IntegrationHealthTone,
} from './integration-health'

export interface IntegrationAnomalyItem {
  id: string
  severity: IntegrationHealthTone
  category: 'connector' | 'data' | 'import'
  title: string
  summary: string
  evidenceLabel: string
  nextBestMove: string
  actionLabel: string
  playbookPrompt: string
  history?: {
    status: 'new' | 'recurring' | 'chronic'
    label: string
    summary: string
    daysActive: number
    incidentCount: number
    returnedCount: number
    firstSeenAt: string | Date | null
    lastSeenAt: string | Date | null
  } | null
}

export interface IntegrationAnomalyQueue {
  status: IntegrationHealthTone
  summary: string
  anomalyCount: number
  atRiskCount: number
  watchCount: number
  recurringCount: number
  chronicCount: number
  items: IntegrationAnomalyItem[]
  suggested: IntegrationAnomalyItem[]
}

interface IntegrationAnomalyConnectorSnapshot {
  provider: string
  status: string
  lastSyncAt: string | Date | null
  lastSyncResult?: Record<string, unknown> | null
  lastError?: string | null
  autoSync?: boolean
  syncIntervalHours?: number | null
}

interface BuildIntegrationAnomalyQueueInput {
  issues: IntegrationHealthIssue[]
  connector: IntegrationAnomalyConnectorSnapshot | null
  now?: Date
}

const SYSTEMIC_ISSUE_KEYS = new Set([
  'manual_import_mode',
  'no_data_source',
  'connector_error',
  'never_synced',
  'stale_sync_risk',
  'stale_sync_watch',
  'missing_members',
  'missing_sessions',
  'missing_bookings',
  'missing_courts',
])

function mapIssueCategory(input: IntegrationHealthIssue['category']): IntegrationAnomalyItem['category'] {
  if (input === 'connector') return 'connector'
  if (input === 'import') return 'import'
  return 'data'
}

function sortBySeverity(items: IntegrationAnomalyItem[]) {
  const rank: Record<IntegrationHealthTone, number> = {
    at_risk: 0,
    watch: 1,
    healthy: 2,
  }

  return [...items].sort((a, b) => {
    if (rank[a.severity] !== rank[b.severity]) {
      return rank[a.severity] - rank[b.severity]
    }
    return a.title.localeCompare(b.title)
  })
}

export function buildIntegrationAnomalyQueue(input: BuildIntegrationAnomalyQueueInput): IntegrationAnomalyQueue {
  const now = input.now || new Date()

  const anomalies: IntegrationAnomalyItem[] = input.issues
    .filter((issue) => SYSTEMIC_ISSUE_KEYS.has(issue.key))
    .map((issue) => ({
      id: issue.key,
      severity: issue.severity,
      category: mapIssueCategory(issue.category),
      title: issue.title,
      summary: issue.summary,
      evidenceLabel: issue.metricLabel,
      nextBestMove: issue.nextBestMove,
      actionLabel: issue.actionLabel,
      playbookPrompt: issue.playbookPrompt,
    }))

  const incomplete = input.connector?.lastSyncResult?.incomplete === true
  const nextRetryAtRaw = typeof input.connector?.lastSyncResult?.nextRetryAt === 'string'
    ? input.connector.lastSyncResult.nextRetryAt
    : null
  const nextRetryAt = nextRetryAtRaw ? new Date(nextRetryAtRaw) : null
  const progressStatus = typeof input.connector?.lastSyncResult?.status === 'string'
    ? input.connector.lastSyncResult.status
    : null
  const totalErrors = typeof input.connector?.lastSyncResult?.totalErrors === 'number'
    ? input.connector.lastSyncResult.totalErrors
    : 0

  if (incomplete) {
    const pausedForRetry = !!(nextRetryAt && nextRetryAt.getTime() > now.getTime())
    anomalies.push({
      id: 'sync_incomplete',
      severity: pausedForRetry ? 'watch' : 'at_risk',
      category: 'connector',
      title: pausedForRetry ? 'Connector sync is paused mid-run' : 'Connector sync looks stuck mid-run',
      summary: progressStatus
        ? `The latest sync did not finish cleanly. Current progress says: ${progressStatus}`
        : 'The latest connector sync is marked incomplete and needs operator attention.',
      evidenceLabel: nextRetryAt
        ? `Next retry ${nextRetryAt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
        : 'Incomplete sync',
      nextBestMove: pausedForRetry
        ? 'Let the planned retry happen, then confirm fresh member, session and booking counts before trusting the next ops wave.'
        : 'Run a fresh sync or inspect the connector logs before trusting new ops, lifecycle or scheduling decisions.',
      actionLabel: pausedForRetry ? 'Review retry plan' : 'Recover incomplete sync',
      playbookPrompt: pausedForRetry
        ? `Review the connector sync pause for this club. The sync is incomplete but a retry is scheduled for ${nextRetryAt?.toISOString()}. Draft the operator checklist for what to verify before and after the retry.`
        : 'Review the incomplete connector sync for this club. Draft the safest recovery plan, including how to verify that members, sessions and bookings actually moved forward after the next retry or manual sync.',
    })
  }

  if (totalErrors > 0) {
    anomalies.push({
      id: 'sync_error_count',
      severity: totalErrors >= 5 ? 'at_risk' : 'watch',
      category: 'connector',
      title: 'Recent sync landed with import errors',
      summary: `The latest sync completed with ${totalErrors} recorded import errors, which raises the odds that part of the warehouse is incomplete or skewed.`,
      evidenceLabel: `${totalErrors} sync errors`,
      nextBestMove: 'Review the import errors before trusting low-coverage fields or sharp changes in counts.',
      actionLabel: 'Audit sync errors',
      playbookPrompt: `Review the latest connector sync for this club. The sync completed with ${totalErrors} recorded import errors. Draft the safest audit plan to identify which entities or fields are likely missing or partial and how to validate them.`,
    })
  }

  const sorted = sortBySeverity(anomalies)
  const atRiskCount = sorted.filter((item) => item.severity === 'at_risk').length
  const watchCount = sorted.filter((item) => item.severity === 'watch').length
  const status: IntegrationHealthTone = atRiskCount > 0 ? 'at_risk' : watchCount > 0 ? 'watch' : 'healthy'

  return {
    status,
    summary: sorted.length === 0
      ? 'No systemic connector or data anomalies are active right now.'
      : sorted[0].summary,
    anomalyCount: sorted.length,
    atRiskCount,
    watchCount,
    recurringCount: 0,
    chronicCount: 0,
    items: sorted,
    suggested: sorted.slice(0, 3),
  }
}
