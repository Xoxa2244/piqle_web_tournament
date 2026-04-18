'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'

type RolloutReadiness = 'ready' | 'shadow' | 'blocked'
type RolloutFilter = 'all' | RolloutReadiness | 'recommend'
type PilotHealth = 'idle' | 'healthy' | 'watch' | 'at_risk'

type RolloutDecisionRecord = {
  id: string
  summary: string
  result: 'blocked' | 'shadowed' | 'executed'
  createdAt: string | Date
  metadata?: {
    label?: string | null
  } | null
}

type RolloutClubAdmin = {
  id: string
  name: string | null
  email: string | null
  role: string
}

type RolloutClubAction = {
  actionKind: string
  label: string
  enabled: boolean
}

type PilotActionSummary = {
  actionKind: string
  label: string
  health: PilotHealth
  sent: number
  delivered: number
  opened: number
  clicked: number
  converted: number
  failed: number
  unsubscribed: number
  deliveryRate: number
  openRate: number
  clickRate: number
  conversionRate: number
  failureRate: number
}

type PilotSummary = {
  health: PilotHealth
  summary: string
  totals: {
    sent: number
    delivered: number
    opened: number
    clicked: number
    converted: number
    failed: number
    bounced: number
    unsubscribed: number
  }
  actions: PilotActionSummary[]
  topAction?: PilotActionSummary | null
  atRiskAction?: PilotActionSummary | null
  recommendation?: {
    actionKind: string
    label: string
    health: 'watch' | 'at_risk'
    reason: string
  } | null
}

type RolloutClub = {
  id: string
  name: string
  readiness: RolloutReadiness
  controlPlane: {
    killSwitch: boolean
    outreachMode: string
    schedulePublishMode: string
    adminReminderMode: string
    audit?: {
      lastChangedAt?: string | Date | null
      lastChangedByLabel?: string | null
      summary?: string | null
    } | null
  }
  outreachRollout: {
    summary: string
    clubAllowlisted: boolean
    armedActions: number
    totalActions: number
    actions: RolloutClubAction[]
  }
  outreachPilot: PilotSummary
  admins: RolloutClubAdmin[]
  decisions: {
    blockedCount: number
    shadowedCount: number
    executedCount: number
    recent: RolloutDecisionRecord[]
  }
}

type RolloutDashboard = {
  windowDays: number
  summary: {
    totalClubs: number
    readyClubs: number
    shadowClubs: number
    blockedClubs: number
    allowlistedClubs: number
    armedClubs: number
    blockedDecisions: number
    shadowedDecisions: number
    activePilotClubs: number
    healthyPilotClubs: number
    watchPilotClubs: number
    atRiskPilotClubs: number
  }
  outreachPilot: PilotSummary
  clubs: RolloutClub[]
}

function ReadinessBadge({ readiness }: { readiness: string }) {
  const className =
    readiness === 'ready'
      ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
      : readiness === 'blocked'
        ? 'bg-red-500 hover:bg-red-600 text-white'
        : 'bg-amber-500 hover:bg-amber-600 text-white'

  return (
    <Badge className={className}>
      {readiness === 'ready' ? 'Ready' : readiness === 'blocked' ? 'Blocked' : 'Shadow'}
    </Badge>
  )
}

function PilotHealthBadge({ health }: { health: PilotHealth }) {
  const className =
    health === 'healthy'
      ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
      : health === 'at_risk'
        ? 'bg-red-500 hover:bg-red-600 text-white'
        : health === 'watch'
          ? 'bg-amber-500 hover:bg-amber-600 text-white'
          : 'bg-slate-500 hover:bg-slate-600 text-white'

  return (
    <Badge className={className}>
      {health === 'healthy'
        ? 'Healthy'
        : health === 'at_risk'
          ? 'At Risk'
          : health === 'watch'
            ? 'Watch'
            : 'Idle'}
    </Badge>
  )
}

function hasShadowBackRecommendation(club: RolloutClub) {
  const recommendation = club.outreachPilot.recommendation
  if (!recommendation) return false
  const action = club.outreachRollout.actions.find((item) => item.actionKind === recommendation.actionKind)
  return !!action?.enabled
}

export default function SuperadminAgentRolloutPage() {
  const [filter, setFilter] = useState<RolloutFilter>('all')
  const [query, setQuery] = useState('')
  const [processingKey, setProcessingKey] = useState<string | null>(null)
  const utils = trpc.useUtils()

  const { data, isLoading, refetch } = trpc.superadmin.getAgentRolloutDashboard.useQuery(
    { days: 7, limit: 80 },
    { enabled: true },
  )
  const shadowBackMutation = trpc.superadmin.shadowBackOutreachAction.useMutation({
    onMutate: (variables) => {
      setProcessingKey(`${variables.clubId}:${variables.actionKind}`)
    },
    onSettled: async () => {
      setProcessingKey(null)
      await utils.superadmin.getAgentRolloutDashboard.invalidate().catch(() => undefined)
    },
  })
  const dashboard = data as RolloutDashboard | undefined
  const recommendedClubs = useMemo(() => {
    const clubs = (dashboard?.clubs ?? []).filter(hasShadowBackRecommendation)
    return clubs.sort((a, b) => {
      const severity = (health?: PilotHealth | null) =>
        health === 'at_risk' ? 2 : health === 'watch' ? 1 : 0
      const severityDelta = severity(b.outreachPilot.recommendation?.health) - severity(a.outreachPilot.recommendation?.health)
      if (severityDelta !== 0) return severityDelta
      return (b.outreachPilot.atRiskAction?.failureRate || 0) - (a.outreachPilot.atRiskAction?.failureRate || 0)
    })
  }, [dashboard?.clubs])

  const filteredClubs = useMemo(() => {
    const clubs = dashboard?.clubs ?? []
    const normalizedQuery = query.trim().toLowerCase()
    return clubs.filter((club) => {
      if (filter === 'recommend') {
        if (!hasShadowBackRecommendation(club)) return false
      } else if (filter !== 'all' && club.readiness !== filter) {
        return false
      }
      if (!normalizedQuery) return true
      return (
        club.name.toLowerCase().includes(normalizedQuery)
        || club.id.toLowerCase().includes(normalizedQuery)
        || club.admins.some((admin) =>
          `${admin.name || ''} ${admin.email || ''}`.toLowerCase().includes(normalizedQuery),
        )
      )
    })
  }, [dashboard?.clubs, filter, query])

  const handleShadowBack = (club: RolloutClub) => {
    const recommendation = club.outreachPilot.recommendation
    if (!recommendation) return

    shadowBackMutation.mutate({
      clubId: club.id,
      actionKind: recommendation.actionKind as 'create_campaign' | 'fill_session' | 'reactivate_members' | 'trial_follow_up' | 'renewal_reactivation',
      reason: recommendation.reason,
    })
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Agent Rollout Dashboard</h1>
            <p className="text-gray-600 mt-2">Cross-club live rollout posture, blocked paths, and readiness for outreach.</p>
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
          <Card><CardContent className="pt-6"><div className="text-sm text-gray-500">Clubs</div><div className="text-2xl font-bold">{dashboard?.summary.totalClubs ?? 0}</div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-sm text-gray-500">Ready</div><div className="text-2xl font-bold text-emerald-600">{dashboard?.summary.readyClubs ?? 0}</div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-sm text-gray-500">Shadow</div><div className="text-2xl font-bold text-amber-600">{dashboard?.summary.shadowClubs ?? 0}</div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-sm text-gray-500">Blocked</div><div className="text-2xl font-bold text-red-600">{dashboard?.summary.blockedClubs ?? 0}</div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-sm text-gray-500">Allowlisted</div><div className="text-2xl font-bold">{dashboard?.summary.allowlistedClubs ?? 0}</div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-sm text-gray-500">Armed</div><div className="text-2xl font-bold">{dashboard?.summary.armedClubs ?? 0}</div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-sm text-gray-500">Blocked Decisions</div><div className="text-2xl font-bold">{dashboard?.summary.blockedDecisions ?? 0}</div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-sm text-gray-500">Shadowed Decisions</div><div className="text-2xl font-bold">{dashboard?.summary.shadowedDecisions ?? 0}</div></CardContent></Card>
        </div>

        <div className="grid gap-4 md:grid-cols-4 xl:grid-cols-8">
          <Card><CardContent className="pt-6"><div className="text-sm text-gray-500">Pilot Clubs</div><div className="text-2xl font-bold">{dashboard?.summary.activePilotClubs ?? 0}</div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-sm text-gray-500">Healthy Pilot</div><div className="text-2xl font-bold text-emerald-600">{dashboard?.summary.healthyPilotClubs ?? 0}</div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-sm text-gray-500">Watch</div><div className="text-2xl font-bold text-amber-600">{dashboard?.summary.watchPilotClubs ?? 0}</div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-sm text-gray-500">At Risk</div><div className="text-2xl font-bold text-red-600">{dashboard?.summary.atRiskPilotClubs ?? 0}</div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-sm text-gray-500">Sent</div><div className="text-2xl font-bold">{dashboard?.outreachPilot.totals.sent ?? 0}</div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-sm text-gray-500">Delivered</div><div className="text-2xl font-bold">{dashboard?.outreachPilot.totals.delivered ?? 0}</div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-sm text-gray-500">Booked</div><div className="text-2xl font-bold">{dashboard?.outreachPilot.totals.converted ?? 0}</div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-sm text-gray-500">Failures</div><div className="text-2xl font-bold">{dashboard?.outreachPilot.totals.failed ?? 0}</div></CardContent></Card>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm text-gray-500">Live outreach pilot window</div>
                <div className="text-lg font-semibold text-gray-900">
                  {dashboard?.outreachPilot.summary || 'No live outreach outcomes yet.'}
                </div>
              </div>
              <PilotHealthBadge health={dashboard?.outreachPilot.health || 'idle'} />
            </div>
          </CardContent>
        </Card>

        {recommendedClubs.length > 0 ? (
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-sm text-gray-500">Shadow-back queue</div>
                  <div className="text-lg font-semibold text-gray-900">
                    {recommendedClubs.length} club{recommendedClubs.length === 1 ? '' : 's'} should review live outreach risk now.
                  </div>
                </div>
                <Button variant={filter === 'recommend' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('recommend')}>
                  Focus recommendations
                </Button>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                {recommendedClubs.slice(0, 6).map((club) => (
                  <div key={club.id} className="rounded-lg border bg-gray-50 px-4 py-3">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-semibold text-gray-900">{club.name}</div>
                          <PilotHealthBadge health={club.outreachPilot.recommendation?.health || 'watch'} />
                        </div>
                        <div className="text-xs text-gray-500 mt-1">{club.outreachPilot.recommendation?.label}</div>
                        <div className="text-sm text-gray-700 mt-2">
                          {club.outreachPilot.recommendation?.reason}
                        </div>
                        <div className="text-xs text-gray-500 mt-2">
                          {club.outreachPilot.atRiskAction
                            ? `${club.outreachPilot.atRiskAction.failed} failed · ${club.outreachPilot.atRiskAction.unsubscribed} opt-outs · ${club.outreachPilot.atRiskAction.failureRate}% failure rate`
                            : club.outreachPilot.summary}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleShadowBack(club)}
                          disabled={!club.outreachPilot.recommendation || processingKey === `${club.id}:${club.outreachPilot.recommendation?.actionKind}` || shadowBackMutation.isPending}
                        >
                          {processingKey === `${club.id}:${club.outreachPilot.recommendation?.actionKind}` ? 'Moving…' : 'Move to shadow'}
                        </Button>
                        <Link href={`/clubs/${club.id}/intelligence/agent`}>
                          <Button variant="outline" size="sm">Open agent</Button>
                        </Link>
                        <Link href={`/clubs/${club.id}/intelligence/settings`}>
                          <Button size="sm">Open settings</Button>
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
                {(['all', 'recommend', 'ready', 'shadow', 'blocked'] as RolloutFilter[]).map((value) => (
                  <Button
                    key={value}
                    variant={filter === value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilter(value)}
                  >
                    {value === 'all'
                      ? 'All clubs'
                      : value === 'recommend'
                        ? 'Recommendations'
                        : value === 'ready'
                          ? 'Ready'
                          : value === 'shadow'
                            ? 'Shadow'
                            : 'Blocked'}
                  </Button>
                ))}
              </div>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search club, id, or admin"
                className="md:max-w-sm"
              />
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="text-center text-gray-500 py-20">Loading rollout dashboard…</div>
        ) : (
          <div className="grid gap-4">
            {filteredClubs.map((club) => (
              <Card key={club.id}>
                <CardContent className="pt-6 space-y-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex items-center gap-3">
                        <h2 className="text-lg font-semibold text-gray-900">{club.name}</h2>
                        <ReadinessBadge readiness={club.readiness} />
                        <PilotHealthBadge health={club.outreachPilot.health} />
                        {hasShadowBackRecommendation(club) ? (
                          <Badge className="bg-red-100 text-red-800">Shadow-back rec</Badge>
                        ) : null}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">{club.id}</div>
                      <div className="text-sm text-gray-600 mt-2">
                        Outreach: <strong>{club.controlPlane.outreachMode}</strong> · Schedule publish: <strong>{club.controlPlane.schedulePublishMode}</strong> · Admin reminders: <strong>{club.controlPlane.adminReminderMode}</strong>
                      </div>
                    </div>
                    <div className="text-sm text-gray-600 lg:text-right">
                      <div>{club.outreachRollout.summary}</div>
                      <div className="mt-1">
                        {club.outreachRollout.clubAllowlisted ? 'Server allowlisted' : 'Not allowlisted'} · {club.outreachRollout.armedActions}/{club.outreachRollout.totalActions} actions armed
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {club.outreachRollout.actions.map((action: any) => (
                      <Badge
                        key={action.actionKind}
                        variant="secondary"
                        className={action.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-700'}
                      >
                        {action.label}: {action.enabled ? 'armed' : 'shadow'}
                      </Badge>
                    ))}
                    {club.controlPlane.killSwitch ? (
                      <Badge className="bg-red-100 text-red-800">Kill switch on</Badge>
                    ) : null}
                  </div>

                  <div className="grid gap-4 lg:grid-cols-4">
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
                      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Pilot outcomes</div>
                      <div className="text-sm text-gray-700 space-y-1">
                        <div>{club.outreachPilot.summary}</div>
                        <div>
                          Sent {club.outreachPilot.totals.sent} · Delivered {club.outreachPilot.totals.delivered} · Opened {club.outreachPilot.totals.opened}
                        </div>
                        <div>
                          Clicked {club.outreachPilot.totals.clicked} · Booked {club.outreachPilot.totals.converted} · Failed {club.outreachPilot.totals.failed}
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Recent decisions</div>
                      <div className="text-sm text-gray-700 space-y-1">
                        <div>Blocked: {club.decisions.blockedCount}</div>
                        <div>Shadowed: {club.decisions.shadowedCount}</div>
                        <div>Executed: {club.decisions.executedCount}</div>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Last rollout change</div>
                      {club.controlPlane.audit?.lastChangedAt ? (
                        <div className="text-sm text-gray-700 space-y-1">
                          <div>{club.controlPlane.audit.lastChangedByLabel || 'Club admin'}</div>
                          <div className="text-gray-500">
                            {new Date(club.controlPlane.audit.lastChangedAt).toLocaleString()}
                          </div>
                          {club.controlPlane.audit.summary ? <div className="text-gray-600">{club.controlPlane.audit.summary}</div> : null}
                        </div>
                      ) : (
                        <div className="text-sm text-gray-500">No rollout audit yet</div>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-2">
                    <div>
                      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Top live action</div>
                      {club.outreachPilot.topAction ? (
                        <div className="rounded-lg border bg-gray-50 px-3 py-2">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-medium text-gray-900">{club.outreachPilot.topAction.label}</div>
                            <PilotHealthBadge health={club.outreachPilot.topAction.health} />
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {club.outreachPilot.topAction.sent} sent · {club.outreachPilot.topAction.deliveryRate}% delivered · {club.outreachPilot.topAction.conversionRate}% booked
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-gray-500">No live outreach actions have executed in this window.</div>
                      )}
                    </div>

                    <div>
                      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Pilot risk</div>
                      {club.outreachPilot.atRiskAction ? (
                        <div className="rounded-lg border bg-gray-50 px-3 py-2">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-medium text-gray-900">{club.outreachPilot.atRiskAction.label}</div>
                            <PilotHealthBadge health={club.outreachPilot.atRiskAction.health} />
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {club.outreachPilot.atRiskAction.failed} failed · {club.outreachPilot.atRiskAction.unsubscribed} opt-outs · {club.outreachPilot.atRiskAction.failureRate}% failure rate
                          </div>
                          {club.outreachPilot.recommendation ? (
                            <div className="space-y-2 mt-2">
                              <div className="text-xs text-red-600">
                                Recommended: {club.outreachPilot.recommendation.reason}
                              </div>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleShadowBack(club)}
                                disabled={processingKey === `${club.id}:${club.outreachPilot.recommendation?.actionKind}` || shadowBackMutation.isPending}
                              >
                                {processingKey === `${club.id}:${club.outreachPilot.recommendation?.actionKind}` ? 'Moving…' : 'Move recommended action to shadow'}
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="text-sm text-gray-500">No immediate pilot risk surfaced in this window.</div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Latest blocked or shadowed decisions</div>
                    {club.decisions.recent.length === 0 ? (
                      <div className="text-sm text-gray-500">No recent decision records in the last {data?.windowDays ?? 7} days.</div>
                    ) : (
                      <div className="space-y-2">
                        {club.decisions.recent.map((record) => (
                          <div key={record.id} className="rounded-lg border bg-gray-50 px-3 py-2">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-medium text-gray-900">{record.metadata?.label || record.summary}</div>
                              <Badge variant="secondary" className={record.result === 'blocked' ? 'bg-red-100 text-red-800' : record.result === 'shadowed' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-800'}>
                                {record.result}
                              </Badge>
                            </div>
                            <div className="text-xs text-gray-500 mt-1">{new Date(record.createdAt).toLocaleString()}</div>
                            <div className="text-sm text-gray-600 mt-1">{record.summary}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}

            {filteredClubs.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-gray-500">
                  No clubs match the current rollout filter.
                </CardContent>
              </Card>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
