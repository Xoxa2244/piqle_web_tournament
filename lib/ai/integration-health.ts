import { buildIntegrationAnomalyQueue, type IntegrationAnomalyQueue } from './integration-anomalies'

export type IntegrationHealthTone = 'healthy' | 'watch' | 'at_risk'

interface IntegrationCoverageField {
  filled: number
  percent: number
  label: string
}

interface IntegrationCoverageSnapshot {
  members: {
    total: number
    fields: Record<string, IntegrationCoverageField>
  }
  sessions: {
    total: number
    fields: Record<string, IntegrationCoverageField>
  }
  bookings: {
    total: number
    fields: Record<string, IntegrationCoverageField>
  }
  courts: {
    total: number
  }
}

interface IntegrationConnectorSnapshot {
  provider: string
  status: string
  lastSyncAt: string | Date | null
  lastSyncResult?: Record<string, unknown> | null
  lastError?: string | null
  autoSync?: boolean
  syncIntervalHours?: number | null
}

export interface IntegrationHealthIssue {
  key: string
  severity: IntegrationHealthTone
  category: 'connector' | 'coverage' | 'import'
  title: string
  summary: string
  metricLabel: string
  nextBestMove: string
  actionLabel: string
  playbookPrompt: string
}

export interface IntegrationMappingFix {
  key: string
  severity: IntegrationHealthTone
  domain: 'members' | 'sessions' | 'bookings'
  fieldKey: string
  fieldLabel: string
  coveragePercent: number
  filledCount: number
  totalCount: number
  summary: string
  suggestedFix: string
  actionLabel: string
  playbookPrompt: string
}

export interface IntegrationHealthSnapshot {
  summary: {
    status: IntegrationHealthTone
    title: string
    summary: string
    connectorLabel: string
    freshnessLabel: string
    issueCount: number
    atRiskCount: number
    watchCount: number
  }
  cards: {
    connector: {
      status: IntegrationHealthTone
      label: string
      description: string
      detail: string
    }
    memberData: {
      status: IntegrationHealthTone
      score: number
      label: string
      description: string
    }
    sessionData: {
      status: IntegrationHealthTone
      score: number
      label: string
      description: string
    }
    bookingData: {
      status: IntegrationHealthTone
      score: number
      label: string
      description: string
    }
  }
  issues: IntegrationHealthIssue[]
  suggestedActions: IntegrationHealthIssue[]
  anomalyQueue: IntegrationAnomalyQueue
  mappingReview: {
    status: IntegrationHealthTone
    summary: string
    fixCount: number
    fields: IntegrationMappingFix[]
    suggestedFixes: IntegrationMappingFix[]
  }
}

export interface BuildIntegrationHealthSnapshotInput {
  coverage: IntegrationCoverageSnapshot
  connector: IntegrationConnectorSnapshot | null
  now?: Date
}

function average(values: number[]) {
  if (values.length === 0) return 0
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function toTone(score: number): IntegrationHealthTone {
  if (score >= 80) return 'healthy'
  if (score >= 55) return 'watch'
  return 'at_risk'
}

function describeTone(tone: IntegrationHealthTone) {
  if (tone === 'healthy') return 'Healthy'
  if (tone === 'watch') return 'Watch'
  return 'At Risk'
}

function describeTimeDistance(input: { from: Date | null; to: Date }) {
  if (!input.from) return 'No sync recorded yet'
  const diffMs = Math.max(0, input.to.getTime() - input.from.getTime())
  const diffHours = Math.round(diffMs / (1000 * 60 * 60))
  if (diffHours < 1) return 'Synced within the last hour'
  if (diffHours < 24) return `Synced ${diffHours}h ago`
  const diffDays = Math.round(diffHours / 24)
  return `Synced ${diffDays}d ago`
}

function buildMappingFix(input: {
  domain: 'members' | 'sessions' | 'bookings'
  fieldKey: string
  fieldLabel: string
  coveragePercent: number
  filledCount: number
  totalCount: number
  watchThreshold: number
  promptContext: string
}): IntegrationMappingFix | null {
  if (input.totalCount <= 0) return null
  if (input.coveragePercent >= input.watchThreshold) return null

  const severity: IntegrationHealthTone = input.coveragePercent < Math.max(40, input.watchThreshold - 25) ? 'at_risk' : 'watch'
  const missingCount = Math.max(0, input.totalCount - input.filledCount)
  const domainLabel =
    input.domain === 'members'
      ? 'member'
      : input.domain === 'sessions'
        ? 'session'
        : 'booking'

  return {
    key: `${input.domain}_${input.fieldKey}`,
    severity,
    domain: input.domain,
    fieldKey: input.fieldKey,
    fieldLabel: input.fieldLabel,
    coveragePercent: input.coveragePercent,
    filledCount: input.filledCount,
    totalCount: input.totalCount,
    summary: `${input.fieldLabel} is only filled on ${input.coveragePercent}% of the ${input.totalCount.toLocaleString()} ${domainLabel} records in intelligence.`,
    suggestedFix: `Backfill or remap ${input.fieldLabel.toLowerCase()} so the missing ${missingCount.toLocaleString()} records stop weakening agent recommendations and automations.`,
    actionLabel: `Fix ${input.fieldLabel.toLowerCase()} mapping`,
    playbookPrompt: `Review the ${input.fieldLabel} mapping gap for this club. ${input.promptContext} The field is only present on ${input.coveragePercent}% of records (${input.filledCount}/${input.totalCount}). Draft the safest fix plan, including import or connector mapping changes and how the operator should validate the field after the next sync or import.`,
  }
}

export function buildIntegrationHealthSnapshot(input: BuildIntegrationHealthSnapshotInput): IntegrationHealthSnapshot {
  const now = input.now || new Date()
  const connector = input.connector
  const lastSyncAt = connector?.lastSyncAt ? new Date(connector.lastSyncAt) : null
  const syncIntervalHours = connector?.syncIntervalHours || 6
  const staleWatchHours = Math.max(syncIntervalHours * 4, 24)
  const staleRiskHours = Math.max(syncIntervalHours * 8, 72)
  const hoursSinceSync = lastSyncAt ? Math.round((now.getTime() - lastSyncAt.getTime()) / (1000 * 60 * 60)) : null

  const memberFields = input.coverage.members.fields
  const sessionFields = input.coverage.sessions.fields
  const bookingFields = input.coverage.bookings.fields

  const memberDataScore = average([
    memberFields.email?.percent || 0,
    memberFields.phone?.percent || 0,
    memberFields.membershipType?.percent || 0,
    memberFields.skillLevel?.percent || 0,
    memberFields.city?.percent || 0,
  ])
  const sessionDataScore = average([
    sessionFields.title?.percent || 0,
    sessionFields.format?.percent || 0,
    sessionFields.court?.percent || 0,
    sessionFields.price?.percent || 0,
  ])
  const bookingDataScore = average([
    bookingFields.confirmed?.percent || 0,
    bookingFields.cancelledAt?.percent || 0,
    bookingFields.checkedInAt?.percent || 0,
  ])

  const mappingFixes = [
    buildMappingFix({
      domain: 'members',
      fieldKey: 'email',
      fieldLabel: 'Email',
      coveragePercent: memberFields.email?.percent || 0,
      filledCount: memberFields.email?.filled || 0,
      totalCount: input.coverage.members.total,
      watchThreshold: 75,
      promptContext: `Member lifecycle, outreach and lookalike flows depend heavily on usable email coverage.`,
    }),
    buildMappingFix({
      domain: 'members',
      fieldKey: 'phone',
      fieldLabel: 'Phone',
      coveragePercent: memberFields.phone?.percent || 0,
      filledCount: memberFields.phone?.filled || 0,
      totalCount: input.coverage.members.total,
      watchThreshold: 70,
      promptContext: `SMS reminders, urgent ops nudges and acquisition matching depend on usable phone capture.`,
    }),
    buildMappingFix({
      domain: 'members',
      fieldKey: 'membershipType',
      fieldLabel: 'Membership',
      coveragePercent: memberFields.membershipType?.percent || 0,
      filledCount: memberFields.membershipType?.filled || 0,
      totalCount: input.coverage.members.total,
      watchThreshold: 80,
      promptContext: `Membership normalization, lifecycle scoring and segmentation become weak when the raw membership layer is thin.`,
    }),
    buildMappingFix({
      domain: 'sessions',
      fieldKey: 'format',
      fieldLabel: 'Session format',
      coveragePercent: sessionFields.format?.percent || 0,
      filledCount: sessionFields.format?.filled || 0,
      totalCount: input.coverage.sessions.total,
      watchThreshold: 85,
      promptContext: `Programming intelligence and slot-filler logic need reliable format mapping on sessions.`,
    }),
    buildMappingFix({
      domain: 'sessions',
      fieldKey: 'court',
      fieldLabel: 'Court',
      coveragePercent: sessionFields.court?.percent || 0,
      filledCount: sessionFields.court?.filled || 0,
      totalCount: input.coverage.sessions.total,
      watchThreshold: 85,
      promptContext: `Court coverage drives utilization, overlap detection and aftercare reasoning.`,
    }),
    buildMappingFix({
      domain: 'sessions',
      fieldKey: 'price',
      fieldLabel: 'Price',
      coveragePercent: sessionFields.price?.percent || 0,
      filledCount: sessionFields.price?.filled || 0,
      totalCount: input.coverage.sessions.total,
      watchThreshold: 70,
      promptContext: `Revenue and pricing analysis depend on a stable session price layer.`,
    }),
    buildMappingFix({
      domain: 'bookings',
      fieldKey: 'cancelledAt',
      fieldLabel: 'Cancellation timestamp',
      coveragePercent: bookingFields.cancelledAt?.percent || 0,
      filledCount: bookingFields.cancelledAt?.filled || 0,
      totalCount: input.coverage.bookings.total,
      watchThreshold: 45,
      promptContext: `No-show recovery and attendance analytics need cancellation events to land correctly in intelligence.`,
    }),
    buildMappingFix({
      domain: 'bookings',
      fieldKey: 'checkedInAt',
      fieldLabel: 'Check-in',
      coveragePercent: bookingFields.checkedInAt?.percent || 0,
      filledCount: bookingFields.checkedInAt?.filled || 0,
      totalCount: input.coverage.bookings.total,
      watchThreshold: 60,
      promptContext: `Show-up protection and attendance-driven outreach depend on check-in capture being reliable.`,
    }),
  ].filter((fix): fix is IntegrationMappingFix => !!fix)

  const issues: IntegrationHealthIssue[] = []
  const hasAnyImportedData =
    input.coverage.members.total > 0
    || input.coverage.sessions.total > 0
    || input.coverage.bookings.total > 0

  if (!connector) {
    issues.push(
      hasAnyImportedData
        ? {
            key: 'manual_import_mode',
            severity: 'watch',
            category: 'connector',
            title: 'Manual import mode',
            summary: 'The club has imported data, but there is no live connector keeping members, sessions and bookings fresh automatically.',
            metricLabel: 'No live sync source',
            nextBestMove: 'Keep imports flowing for now, but plan a connector rollout so growth and ops surfaces stop aging between uploads.',
            actionLabel: 'Plan live sync rollout',
            playbookPrompt: 'Review the club integration posture. The club is running in manual import mode without a live connector. Draft the safest connector rollout plan, including what to sync first and how to validate data freshness after switching.',
          }
        : {
            key: 'no_data_source',
            severity: 'at_risk',
            category: 'import',
            title: 'No live data source',
            summary: 'There is no connected integration and no imported club data yet, so the agent has almost nothing trustworthy to operate on.',
            metricLabel: '0 synced layers',
            nextBestMove: 'Connect CourtReserve or import members, sessions and bookings exports before leaning on the agent for ops or growth decisions.',
            actionLabel: 'Plan first import',
            playbookPrompt: 'Create a first integration plan for a club with no live connector and no imported data. Explain the minimum members, sessions and bookings layers needed before the agent can operate safely.',
          },
    )
  } else {
    const connectorProgress = typeof connector.lastSyncResult?.status === 'string'
      ? connector.lastSyncResult.status
      : null
    const connectorStatusLabel = connector.provider === 'courtreserve' ? 'CourtReserve' : connector.provider

    if (connector.status === 'error' || connector.lastError) {
      issues.push({
        key: 'connector_error',
        severity: 'at_risk',
        category: 'connector',
        title: `${connectorStatusLabel} connector needs repair`,
        summary: connector.lastError
          ? `The latest sync failed with: ${connector.lastError}`
          : 'The connector is in an error state and needs operator attention before the next sync.',
        metricLabel: 'Connector error',
        nextBestMove: 'Review credentials, connector permissions and sync logs, then re-run sync and compare members, sessions and bookings counts.',
        actionLabel: 'Debug connector',
        playbookPrompt: `Review the ${connectorStatusLabel} connector failure for this club. The current state is ${connector.status}${connector.lastError ? ` and the last error was: ${connector.lastError}` : ''}. Draft the safest repair checklist and explain how to validate the next sync.`,
      })
    } else if (hoursSinceSync == null) {
      issues.push({
        key: 'never_synced',
        severity: 'watch',
        category: 'connector',
        title: `${connectorStatusLabel} is connected but not proven yet`,
        summary: 'The connector exists, but there is no completed sync timestamp yet.',
        metricLabel: 'No successful sync yet',
        nextBestMove: connectorProgress
          ? `Watch the current progress and confirm the first sync completes cleanly. Latest progress: ${connectorProgress}`
          : 'Run the first sync, then confirm members, sessions and bookings counts before trusting agent decisions.',
        actionLabel: 'Validate first sync',
        playbookPrompt: `Review the first-sync posture for the ${connectorStatusLabel} connector. There is a connected connector but no completed sync timestamp yet${connectorProgress ? `. Latest progress: ${connectorProgress}` : ''}. Draft the validation checklist before the club relies on agent workflows.`,
      })
    } else if (hoursSinceSync > staleRiskHours) {
      issues.push({
        key: 'stale_sync_risk',
        severity: 'at_risk',
        category: 'connector',
        title: 'Connector sync is stale',
        summary: `The last successful sync is ${hoursSinceSync}h old, which is beyond the safe freshness window for daily ops and growth decisions.`,
        metricLabel: `${hoursSinceSync}h since sync`,
        nextBestMove: 'Run a sync now, then verify that counts and recent booking activity actually move forward before resuming ops automation.',
        actionLabel: 'Recover sync freshness',
        playbookPrompt: `The club connector is stale. The last successful sync was ${hoursSinceSync} hours ago with auto-sync ${connector.autoSync ? 'enabled' : 'disabled'}. Draft the recovery plan, including when to re-run sync and how to verify freshness afterward.`,
      })
    } else if (hoursSinceSync > staleWatchHours) {
      issues.push({
        key: 'stale_sync_watch',
        severity: 'watch',
        category: 'connector',
        title: 'Connector freshness is slipping',
        summary: `The connector is still connected, but the last sync is already ${hoursSinceSync}h old.`,
        metricLabel: `${hoursSinceSync}h since sync`,
        nextBestMove: 'Refresh the sync before planning the next ops or outreach wave so the agent is not reasoning on stale session and booking data.',
        actionLabel: 'Refresh sync',
        playbookPrompt: `Review the connector freshness posture for this club. The connector is connected, but the last sync is ${hoursSinceSync} hours old. Draft a refresh plan and the checks the operator should run after syncing.`,
      })
    }
  }

  if (input.coverage.members.total === 0) {
    issues.push({
      key: 'missing_members',
      severity: 'at_risk',
      category: 'import',
      title: 'Member layer is empty',
      summary: 'There are no member records for this club, so segmentation, lifecycle signals and audience building are effectively blind.',
      metricLabel: '0 members',
      nextBestMove: 'Import or sync members first before trusting retention, referral or lookalike recommendations.',
      actionLabel: 'Backfill members',
      playbookPrompt: 'The club has no member layer in intelligence. Draft the fastest safe backfill plan, including how to validate contact, membership and profile completeness after import.',
    })
  } else if (Math.max(memberFields.email?.percent || 0, memberFields.phone?.percent || 0) < 50) {
    issues.push({
      key: 'member_contact_gap',
      severity: 'watch',
      category: 'coverage',
      title: 'Member contact capture is thin',
      summary: 'Less than half of the member base has usable email or phone coverage, which weakens lifecycle and outreach execution.',
      metricLabel: `${Math.max(memberFields.email?.percent || 0, memberFields.phone?.percent || 0)}% reachable`,
      nextBestMove: 'Tighten intake and import mapping for email/phone before scaling lifecycle or acquisition loops.',
      actionLabel: 'Improve member capture',
      playbookPrompt: `Review member contact coverage for this club. Email coverage is ${memberFields.email?.percent || 0}% and phone coverage is ${memberFields.phone?.percent || 0}%. Draft the highest-leverage fixes to improve import mapping and member intake coverage.`,
    })
  }

  if (input.coverage.sessions.total === 0) {
    issues.push({
      key: 'missing_sessions',
      severity: 'at_risk',
      category: 'import',
      title: 'Session layer is empty',
      summary: 'There are no sessions in the warehouse, so programming, publish and fill-rate intelligence cannot be trusted.',
      metricLabel: '0 sessions',
      nextBestMove: 'Import or sync sessions before relying on schedule, slot-filler or ops recommendations.',
      actionLabel: 'Backfill sessions',
      playbookPrompt: 'The club has no sessions in intelligence. Draft the fastest safe session backfill plan, including the minimum fields required for scheduling and slot-filler workflows.',
    })
  } else if (sessionDataScore < 70) {
    issues.push({
      key: 'session_structure_gap',
      severity: sessionDataScore < 45 ? 'at_risk' : 'watch',
      category: 'coverage',
      title: 'Session structure is incomplete',
      summary: 'Format, court, title or price coverage is too thin, which makes scheduling, utilization and programming insights unreliable.',
      metricLabel: `${sessionDataScore}% structured`,
      nextBestMove: 'Review session field mapping and backfill court/format/price before trusting schedule recommendations at full speed.',
      actionLabel: 'Fix session mapping',
      playbookPrompt: `Review session coverage for this club. Title=${sessionFields.title?.percent || 0}%, format=${sessionFields.format?.percent || 0}%, court=${sessionFields.court?.percent || 0}%, price=${sessionFields.price?.percent || 0}%. Draft the safest mapping and cleanup plan to restore schedule quality.`,
    })
  }

  if (input.coverage.bookings.total === 0 && input.coverage.sessions.total > 0) {
    issues.push({
      key: 'missing_bookings',
      severity: 'at_risk',
      category: 'import',
      title: 'Bookings are missing behind live sessions',
      summary: 'Sessions exist, but no bookings were imported, so fill, demand and attendance insights are disconnected from reality.',
      metricLabel: '0 bookings',
      nextBestMove: 'Backfill bookings next so show-up, fill and outreach loops can reason on real attendance signals.',
      actionLabel: 'Backfill bookings',
      playbookPrompt: 'The club has sessions but no bookings in intelligence. Draft the booking backfill plan and explain what checks should confirm demand and attendance data are working afterward.',
    })
  } else if (input.coverage.bookings.total > 0 && bookingDataScore < 55) {
    issues.push({
      key: 'booking_ops_gap',
      severity: bookingDataScore < 35 ? 'at_risk' : 'watch',
      category: 'coverage',
      title: 'Booking ops signals are patchy',
      summary: 'Check-in, cancellation or booking-status coverage is too thin, which weakens no-show, attendance and recovery workflows.',
      metricLabel: `${bookingDataScore}% booking ops coverage`,
      nextBestMove: 'Tighten booking-status and attendance capture before trusting no-show prevention or attendance-driven automations.',
      actionLabel: 'Repair booking ops',
      playbookPrompt: `Review booking signal coverage for this club. Confirmed=${bookingFields.confirmed?.percent || 0}%, cancel date=${bookingFields.cancelledAt?.percent || 0}%, check-in=${bookingFields.checkedInAt?.percent || 0}%. Draft the cleanup plan to improve attendance and cancellation capture.`,
    })
  }

  if (input.coverage.sessions.total > 0 && input.coverage.courts.total === 0) {
    issues.push({
      key: 'missing_courts',
      severity: 'watch',
      category: 'coverage',
      title: 'Court layer is missing',
      summary: 'Sessions are present, but there are no active courts, which makes utilization and conflict reasoning weaker than it should be.',
      metricLabel: '0 active courts',
      nextBestMove: 'Backfill or sync courts so schedule and utilization surfaces can reason about actual capacity.',
      actionLabel: 'Restore court map',
      playbookPrompt: 'The club has sessions but no active courts in intelligence. Draft the safest court mapping fix and how the operator should validate utilization after backfilling.',
    })
  }

  const severityRank: Record<IntegrationHealthTone, number> = {
    at_risk: 0,
    watch: 1,
    healthy: 2,
  }

  const sortedIssues = issues.sort((a, b) => {
    if (severityRank[a.severity] !== severityRank[b.severity]) return severityRank[a.severity] - severityRank[b.severity]
    return a.title.localeCompare(b.title)
  })

  const atRiskCount = sortedIssues.filter((issue) => issue.severity === 'at_risk').length
  const watchCount = sortedIssues.filter((issue) => issue.severity === 'watch').length
  const summaryTone: IntegrationHealthTone = atRiskCount > 0 ? 'at_risk' : watchCount > 0 ? 'watch' : 'healthy'

  const connectorTone: IntegrationHealthTone = !connector
    ? hasAnyImportedData ? 'watch' : 'at_risk'
    : connector.status === 'error'
      ? 'at_risk'
      : connector.status === 'syncing'
        ? 'watch'
        : hoursSinceSync != null && hoursSinceSync > staleRiskHours
          ? 'at_risk'
          : hoursSinceSync != null && hoursSinceSync > staleWatchHours
            ? 'watch'
            : 'healthy'

  const connectorLabel = !connector
    ? 'No live connector'
    : `${connector.provider === 'courtreserve' ? 'CourtReserve' : connector.provider} ${connector.status}`

  const freshnessLabel = describeTimeDistance({ from: lastSyncAt, to: now })

  const anomalyQueue = buildIntegrationAnomalyQueue({
    issues: sortedIssues,
    connector,
    now,
  })

  return {
    summary: {
      status: summaryTone,
      title: summaryTone === 'healthy'
        ? 'Healthy integration posture'
        : summaryTone === 'watch'
          ? 'Watch integration posture'
          : 'At-risk integration posture',
      summary: sortedIssues.length === 0
        ? 'Members, sessions, bookings and connector freshness all look stable enough for the agent to operate with confidence.'
        : sortedIssues[0].summary,
      connectorLabel,
      freshnessLabel,
      issueCount: sortedIssues.length,
      atRiskCount,
      watchCount,
    },
    cards: {
      connector: {
        status: connectorTone,
        label: connectorLabel,
        description: !connector
          ? hasAnyImportedData
            ? 'The club is running on manual imports only.'
            : 'No connector or imported data is available yet.'
          : connector.status === 'syncing'
            ? 'A sync is currently in flight.'
            : connector.lastError
              ? connector.lastError
              : 'Connector freshness and sync posture.',
        detail: freshnessLabel,
      },
      memberData: {
        status: toTone(memberDataScore),
        score: memberDataScore,
        label: `${describeTone(toTone(memberDataScore))} member identity`,
        description: `${input.coverage.members.total.toLocaleString()} members tracked. Email ${memberFields.email?.percent || 0}%, phone ${memberFields.phone?.percent || 0}%, membership ${memberFields.membershipType?.percent || 0}%.`,
      },
      sessionData: {
        status: toTone(sessionDataScore),
        score: sessionDataScore,
        label: `${describeTone(toTone(sessionDataScore))} session structure`,
        description: `${input.coverage.sessions.total.toLocaleString()} sessions tracked. Title ${sessionFields.title?.percent || 0}%, format ${sessionFields.format?.percent || 0}%, court ${sessionFields.court?.percent || 0}%.`,
      },
      bookingData: {
        status: toTone(bookingDataScore),
        score: bookingDataScore,
        label: `${describeTone(toTone(bookingDataScore))} booking ops`,
        description: `${input.coverage.bookings.total.toLocaleString()} bookings tracked. Confirmed ${bookingFields.confirmed?.percent || 0}%, check-in ${bookingFields.checkedInAt?.percent || 0}%, cancellation capture ${bookingFields.cancelledAt?.percent || 0}%.`,
      },
    },
    issues: sortedIssues,
    suggestedActions: sortedIssues.slice(0, 3),
    anomalyQueue,
    mappingReview: {
      status: mappingFixes.some((fix) => fix.severity === 'at_risk')
        ? 'at_risk'
        : mappingFixes.length > 0
          ? 'watch'
          : 'healthy',
      summary: mappingFixes.length === 0
        ? 'Field-level mapping coverage is strong enough that the agent does not need a repair queue right now.'
        : `${mappingFixes.length} field-level mapping gap${mappingFixes.length === 1 ? '' : 's'} currently weaken integration trust.`,
      fixCount: mappingFixes.length,
      fields: mappingFixes,
      suggestedFixes: mappingFixes.slice(0, 4),
    },
  }
}
