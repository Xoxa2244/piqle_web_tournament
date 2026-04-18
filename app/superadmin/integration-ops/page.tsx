'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'

type IntegrationOpsFilter = 'all' | 'affected' | 'at_risk' | 'recurring' | 'chronic'
type IntegrationHealthTone = 'healthy' | 'watch' | 'at_risk'
type RecurrenceStatus = 'new' | 'recurring' | 'chronic'

type IntegrationOpsIssue = {
  id: string
  key: string
  severity: IntegrationHealthTone
  category: string
  title: string
  summary: string
  evidenceLabel: string
  isSynthetic: boolean
  opsState?: {
    status: 'acknowledged' | 'assigned' | 'escalated'
    label: string
    summary: string
    actorLabel: string
    ownerUserId?: string | null
    ownerLabel?: string | null
    note?: string | null
    updatedAt: string | Date
  } | null
  history?: {
    status: RecurrenceStatus
    label: string
    summary: string
  } | null
}

type IntegrationOpsClub = {
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
  issues: IntegrationOpsIssue[]
  topIssue?: IntegrationOpsIssue | null
}

type IntegrationOpsDashboard = {
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
  clubs: IntegrationOpsClub[]
}

function StatusBadge({ status }: { status: IntegrationHealthTone }) {
  const className =
    status === 'healthy'
      ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
      : status === 'at_risk'
        ? 'bg-red-500 hover:bg-red-600 text-white'
        : 'bg-amber-500 hover:bg-amber-600 text-white'

  return (
    <Badge className={className}>
      {status === 'healthy' ? 'Healthy' : status === 'at_risk' ? 'At Risk' : 'Watch'}
    </Badge>
  )
}

function RecurrenceBadge({ status }: { status: RecurrenceStatus }) {
  const className =
    status === 'chronic'
      ? 'bg-red-100 text-red-700'
      : status === 'recurring'
        ? 'bg-amber-100 text-amber-700'
        : 'bg-slate-100 text-slate-700'

  return (
    <Badge variant="secondary" className={className}>
      {status === 'chronic' ? 'Chronic' : status === 'recurring' ? 'Recurring' : 'New'}
    </Badge>
  )
}

function ConnectorFreshnessBadge({ tone, label }: { tone: 'healthy' | 'watch' | 'at_risk' | 'none'; label: string }) {
  const className =
    tone === 'healthy'
      ? 'bg-emerald-100 text-emerald-700'
      : tone === 'at_risk'
        ? 'bg-red-100 text-red-700'
        : tone === 'watch'
          ? 'bg-amber-100 text-amber-700'
          : 'bg-slate-100 text-slate-700'

  return (
    <Badge variant="secondary" className={className}>
      {label}
    </Badge>
  )
}

function OpsBadge({ status }: { status: 'acknowledged' | 'assigned' | 'escalated' }) {
  const className =
    status === 'assigned'
      ? 'bg-blue-100 text-blue-700'
      : status === 'escalated'
        ? 'bg-red-100 text-red-700'
        : 'bg-slate-100 text-slate-700'

  return (
    <Badge variant="secondary" className={className}>
      {status === 'assigned' ? 'Assigned' : status === 'escalated' ? 'Escalated' : 'Acknowledged'}
    </Badge>
  )
}

export default function SuperadminIntegrationOpsPage() {
  const [filter, setFilter] = useState<IntegrationOpsFilter>('all')
  const [query, setQuery] = useState('')
  const [processingClubId, setProcessingClubId] = useState<string | null>(null)
  const [processingIssueId, setProcessingIssueId] = useState<string | null>(null)
  const [selectedOwners, setSelectedOwners] = useState<Record<string, string>>({})
  const utils = trpc.useUtils()

  const { data, isLoading, refetch } = trpc.superadmin.getIntegrationOpsDashboard.useQuery(
    { days: 14, limit: 120 },
    { enabled: true },
  )
  const syncMutation = trpc.superadmin.syncIntegrationClub.useMutation({
    onMutate: (variables) => {
      setProcessingClubId(variables.clubId)
    },
    onSettled: async () => {
      setProcessingClubId(null)
      await utils.superadmin.getIntegrationOpsDashboard.invalidate().catch(() => undefined)
    },
  })
  const updateIncidentMutation = trpc.superadmin.updateIntegrationOpsIncident.useMutation({
    onMutate: (variables) => {
      setProcessingIssueId(variables.incidentId)
    },
    onSettled: async () => {
      setProcessingIssueId(null)
      await utils.superadmin.getIntegrationOpsDashboard.invalidate().catch(() => undefined)
    },
  })
  const dashboard = data as IntegrationOpsDashboard | undefined

  const priorityClubs = useMemo(
    () => (dashboard?.clubs ?? []).filter((club) => club.issueCount > 0).slice(0, 8),
    [dashboard?.clubs],
  )

  const filteredClubs = useMemo(() => {
    const clubs = dashboard?.clubs ?? []
    const normalizedQuery = query.trim().toLowerCase()
    return clubs.filter((club) => {
      if (filter === 'affected' && club.issueCount === 0) return false
      if (filter === 'at_risk' && club.status !== 'at_risk') return false
      if (filter === 'recurring' && club.recurringCount === 0) return false
      if (filter === 'chronic' && club.chronicCount === 0) return false

      if (!normalizedQuery) return true
      return (
        club.name.toLowerCase().includes(normalizedQuery)
        || club.id.toLowerCase().includes(normalizedQuery)
        || club.admins.some((admin) =>
          `${admin.name || ''} ${admin.email || ''}`.toLowerCase().includes(normalizedQuery),
        )
        || club.issues.some((issue) =>
          `${issue.title} ${issue.summary}`.toLowerCase().includes(normalizedQuery),
        )
      )
    })
  }, [dashboard?.clubs, filter, query])

  const runSync = (clubId: string) => {
    syncMutation.mutate({ clubId })
  }

  const getSelectedOwnerId = (club: IntegrationOpsClub, issue: IntegrationOpsIssue) =>
    selectedOwners[issue.id]
      || issue.opsState?.ownerUserId
      || club.admins[0]?.id
      || ''

  const updateIncident = (
    club: IntegrationOpsClub,
    issue: IntegrationOpsIssue,
    decision: 'acknowledge' | 'assign' | 'escalate',
  ) => {
    if (issue.isSynthetic) return
    const ownerUserId = decision === 'assign' ? getSelectedOwnerId(club, issue) : undefined
    updateIncidentMutation.mutate({
      clubId: club.id,
      incidentId: issue.id,
      decision,
      ownerUserId: ownerUserId || undefined,
    })
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Integration Ops Dashboard</h1>
            <p className="text-gray-600 mt-2">Cross-club connector health, recurring anomaly pressure and quick remediation paths.</p>
          </div>
          <div className="flex gap-3">
            <Link href="/superadmin">
              <Button variant="outline">Back to superadmin</Button>
            </Link>
            <Button variant="outline" onClick={() => refetch()}>
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4 xl:grid-cols-8">
          <Card><CardContent className="pt-6"><div className="text-sm text-gray-500">Tracked clubs</div><div className="text-2xl font-bold">{dashboard?.summary.totalClubs ?? 0}</div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-sm text-gray-500">Connected</div><div className="text-2xl font-bold">{dashboard?.summary.connectedClubs ?? 0}</div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-sm text-gray-500">Affected</div><div className="text-2xl font-bold text-amber-600">{dashboard?.summary.affectedClubs ?? 0}</div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-sm text-gray-500">Healthy</div><div className="text-2xl font-bold text-emerald-600">{dashboard?.summary.healthyClubs ?? 0}</div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-sm text-gray-500">At risk</div><div className="text-2xl font-bold text-red-600">{dashboard?.summary.atRiskClubs ?? 0}</div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-sm text-gray-500">Recurring</div><div className="text-2xl font-bold text-amber-600">{dashboard?.summary.recurringClubs ?? 0}</div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-sm text-gray-500">Chronic</div><div className="text-2xl font-bold text-red-600">{dashboard?.summary.chronicClubs ?? 0}</div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-sm text-gray-500">Resolved {dashboard?.windowDays ?? 14}d</div><div className="text-2xl font-bold">{dashboard?.summary.resolvedIssuesInWindow ?? 0}</div></CardContent></Card>
        </div>

        {dashboard?.topPatterns?.length ? (
          <Card>
            <CardContent className="pt-6 space-y-3">
              <div>
                <div className="text-sm text-gray-500">Top recurring patterns</div>
                <div className="text-lg font-semibold text-gray-900">
                  The same connector/data problems are repeating across the fleet.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {dashboard.topPatterns.map((pattern) => (
                  <Badge key={pattern.key} variant="secondary" className="bg-white border">
                    {pattern.label}: {pattern.count} clubs
                    {pattern.chronicCount > 0 ? ` • ${pattern.chronicCount} chronic` : ''}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {priorityClubs.length > 0 ? (
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div>
                <div className="text-sm text-gray-500">Priority queue</div>
                <div className="text-lg font-semibold text-gray-900">
                  {priorityClubs.length} club{priorityClubs.length === 1 ? '' : 's'} need integration attention now.
                </div>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {priorityClubs.map((club) => (
                  <div key={club.id} className="rounded-lg border bg-gray-50 px-4 py-3">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-semibold text-gray-900">{club.name}</div>
                          <StatusBadge status={club.status} />
                          {club.chronicCount > 0 ? <RecurrenceBadge status="chronic" /> : club.recurringCount > 0 ? <RecurrenceBadge status="recurring" /> : null}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {club.connector.provider || 'No connector'} · {club.connector.status} · {club.connector.freshnessLabel}
                        </div>
                        <div className="text-sm text-gray-700 mt-2">{club.attentionSummary}</div>
                        {club.topIssue?.opsState ? (
                          <div className="text-xs text-gray-500 mt-2">
                            {club.topIssue.opsState.summary}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex gap-2">
                        {club.connector.canSync ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => runSync(club.id)}
                            disabled={processingClubId === club.id || syncMutation.isPending}
                          >
                            {processingClubId === club.id ? 'Syncing…' : 'Run sync'}
                          </Button>
                        ) : null}
                        <Link href={`/clubs/${club.id}/intelligence/integrations`}>
                          <Button variant="outline" size="sm">Open integrations</Button>
                        </Link>
                        <Link href={`/clubs/${club.id}/intelligence/agent`}>
                          <Button size="sm">Open agent</Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex gap-2">
                {(['all', 'affected', 'at_risk', 'recurring', 'chronic'] as IntegrationOpsFilter[]).map((value) => (
                  <Button
                    key={value}
                    variant={filter === value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilter(value)}
                  >
                    {value === 'all'
                      ? 'All clubs'
                      : value === 'affected'
                        ? 'Affected'
                        : value === 'at_risk'
                          ? 'At Risk'
                          : value === 'recurring'
                            ? 'Recurring'
                            : 'Chronic'}
                  </Button>
                ))}
              </div>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search club, admin, or issue"
                className="md:max-w-sm"
              />
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="text-center text-gray-500 py-20">Loading integration ops…</div>
        ) : (
          <div className="grid gap-4">
            {filteredClubs.map((club) => (
              <Card key={club.id}>
                <CardContent className="pt-6 space-y-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <h2 className="text-lg font-semibold text-gray-900">{club.name}</h2>
                        <StatusBadge status={club.status} />
                        <ConnectorFreshnessBadge tone={club.connector.freshnessTone} label={club.connector.freshnessLabel} />
                        {club.chronicCount > 0 ? <RecurrenceBadge status="chronic" /> : null}
                        {!club.chronicCount && club.recurringCount > 0 ? <RecurrenceBadge status="recurring" /> : null}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">{club.id}</div>
                      <div className="text-sm text-gray-600 mt-2">
                        {club.connector.provider || 'No connector'} · {club.connector.status}
                        {club.connector.autoSync ? ' · auto-sync on' : ' · auto-sync off'}
                        {club.connector.lastError ? ` · ${club.connector.lastError}` : ''}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {club.connector.canSync ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => runSync(club.id)}
                          disabled={processingClubId === club.id || syncMutation.isPending}
                        >
                          {processingClubId === club.id ? 'Syncing…' : 'Run sync'}
                        </Button>
                      ) : null}
                      <Link href={`/clubs/${club.id}/intelligence/integrations`}>
                        <Button variant="outline" size="sm">Open integrations</Button>
                      </Link>
                      <Link href={`/clubs/${club.id}/intelligence/agent`}>
                        <Button size="sm">Open agent</Button>
                      </Link>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-4">
                    <div>
                      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Issue pressure</div>
                      <div className="text-sm text-gray-700 space-y-1">
                        <div>{club.issueCount} open issues</div>
                        <div>{club.atRiskCount} at risk · {club.watchCount} watch</div>
                        <div>{club.recurringCount} recurring · {club.chronicCount} chronic</div>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Connector</div>
                      <div className="text-sm text-gray-700 space-y-1">
                        <div>{club.connector.provider || 'No connector'}</div>
                        <div>{club.connector.status}</div>
                        <div>{club.connector.freshnessLabel}</div>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Admins</div>
                      <div className="space-y-1">
                        {club.admins.length === 0 ? (
                          <div className="text-sm text-gray-500">No admins found</div>
                        ) : club.admins.map((admin) => (
                          <div key={admin.id} className="text-sm text-gray-700">
                            {admin.name || admin.email} <span className="text-gray-400">· {admin.role}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Window memory</div>
                      <div className="text-sm text-gray-700 space-y-1">
                        <div>{club.resolvedInWindowCount} resolved in {dashboard?.windowDays ?? 14}d</div>
                        <div>{club.topIssue?.history?.summary || 'No recurrence memory on the top issue yet.'}</div>
                        {club.topIssue?.opsState ? <div>{club.topIssue.opsState.summary}</div> : null}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-2">
                    {club.issues.length === 0 ? (
                      <div className="rounded-lg border bg-gray-50 px-4 py-3 text-sm text-gray-500">
                        No open anomaly is active right now for this club.
                      </div>
                    ) : club.issues.map((issue) => (
                      <div key={issue.id} className="rounded-lg border bg-gray-50 px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="text-sm font-semibold text-gray-900">{issue.title}</div>
                          <StatusBadge status={issue.severity} />
                          {issue.history ? <RecurrenceBadge status={issue.history.status} /> : null}
                          {issue.opsState ? <OpsBadge status={issue.opsState.status} /> : null}
                          {issue.isSynthetic ? <Badge variant="secondary" className="bg-slate-100 text-slate-700">Synthetic</Badge> : null}
                        </div>
                        <div className="text-sm text-gray-700 mt-2">{issue.summary}</div>
                        <div className="text-xs text-gray-500 mt-2">
                          {issue.evidenceLabel}
                          {issue.history?.summary ? ` · ${issue.history.summary}` : ''}
                        </div>
                        {issue.opsState ? (
                          <div className="text-xs text-gray-500 mt-2">
                            {issue.opsState.summary}
                            {' · '}
                            {new Date(issue.opsState.updatedAt).toLocaleString()}
                          </div>
                        ) : null}
                        {!issue.isSynthetic ? (
                          <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateIncident(club, issue, 'acknowledge')}
                              disabled={processingIssueId === issue.id || updateIncidentMutation.isPending}
                            >
                              {processingIssueId === issue.id ? 'Saving…' : 'Acknowledge'}
                            </Button>
                            <select
                              value={getSelectedOwnerId(club, issue)}
                              onChange={(event) =>
                                setSelectedOwners((current) => ({
                                  ...current,
                                  [issue.id]: event.target.value,
                                }))
                              }
                              className="h-9 rounded-md border border-input bg-background px-3 text-sm text-gray-900 md:min-w-[220px]"
                            >
                              {club.admins.length === 0 ? (
                                <option value="">No admins available</option>
                              ) : club.admins.map((admin) => (
                                <option key={admin.id} value={admin.id}>
                                  {admin.name || admin.email} ({admin.role})
                                </option>
                              ))}
                            </select>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateIncident(club, issue, 'assign')}
                              disabled={club.admins.length === 0 || processingIssueId === issue.id || updateIncidentMutation.isPending}
                            >
                              Assign owner
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => updateIncident(club, issue, 'escalate')}
                              disabled={processingIssueId === issue.id || updateIncidentMutation.isPending}
                            >
                              Escalate
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
