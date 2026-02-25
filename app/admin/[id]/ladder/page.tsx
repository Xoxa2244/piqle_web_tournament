'use client'

import Link from 'next/link'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { formatUsDateShort, formatMatchDayDate } from '@/lib/dateFormat'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/components/ui/use-toast'
import ConfirmModal from '@/components/ConfirmModal'

type Seeding = 'BY_SEED' | 'RANDOM'

export const dynamic = 'force-dynamic'

export default function LadderAdminPage(props: { params: Promise<{ id: string }> }) {
  // Next.js requires `useSearchParams()` to be wrapped in a Suspense boundary.
  return (
    <Suspense fallback={<div className="max-w-6xl mx-auto p-6 text-sm text-muted-foreground">Loading…</div>}>
      <LadderAdminPageInner {...props} />
    </Suspense>
  )
}

function LadderAdminPageInner({ params }: { params: Promise<{ id: string }> }) {
  const searchParams = useSearchParams()
  const [tournamentId, setTournamentId] = useState<string>('')

  useEffect(() => {
    params.then((p) => setTournamentId(p.id))
  }, [params])

  const { data: tournament, refetch: refetchTournament } = trpc.tournament.get.useQuery(
    { id: tournamentId },
    { enabled: !!tournamentId }
  )

  const divisions = (tournament?.divisions ?? []) as Array<{ id: string; name: string }>
  const divisionFromUrl = searchParams.get('division')
  const [selectedDivisionId, setSelectedDivisionId] = useState<string>('')
  const [seeding, setSeeding] = useState<Seeding>('BY_SEED')

  useEffect(() => {
    if (!divisions.length) return
    if (divisionFromUrl && divisions.some((d) => d.id === divisionFromUrl)) {
      setSelectedDivisionId(divisionFromUrl)
      return
    }
    if (!selectedDivisionId) {
      setSelectedDivisionId(divisions[0]!.id)
    }
  }, [divisions, divisionFromUrl, selectedDivisionId])

  const isOneDay = tournament?.format === 'ONE_DAY_LADDER'
  const isLeague = tournament?.format === 'LADDER_LEAGUE'

  const { data: oneDayStatus, refetch: refetchOneDay } = trpc.ladder.oneDayGetStatus.useQuery(
    { divisionId: selectedDivisionId },
    { enabled: isOneDay && !!selectedDivisionId }
  )

  const oneDayInit = trpc.ladder.oneDayInit.useMutation({
    onSuccess: async () => {
      await refetchTournament()
      await refetchOneDay()
    },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  })

  const oneDayAdvance = trpc.ladder.oneDayAdvanceRound.useMutation({
    onSuccess: async () => {
      await refetchTournament()
      await refetchOneDay()
    },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  })

  const { data: matchDays, refetch: refetchMatchDays } = trpc.matchDay.list.useQuery(
    { tournamentId },
    { enabled: isLeague && !!tournamentId }
  )

  const [newWeekDate, setNewWeekDate] = useState('')
  const [showCloseWeekConfirm, setShowCloseWeekConfirm] = useState(false)
  const createMatchDay = trpc.matchDay.create.useMutation({
    onSuccess: async (day) => {
      setNewWeekDate('')
      await refetchMatchDays()
      setSelectedMatchDayId(day.id)
    },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  })

  const orderedMatchDays = useMemo(() => {
    const days = matchDays ?? []
    return [...days].sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
  }, [matchDays])

  const [selectedMatchDayId, setSelectedMatchDayId] = useState<string>('')
  useEffect(() => {
    if (!isLeague) return
    if (!orderedMatchDays.length) {
      setSelectedMatchDayId('')
      return
    }
    if (!selectedMatchDayId) {
      setSelectedMatchDayId(orderedMatchDays[orderedMatchDays.length - 1]!.id)
    }
  }, [isLeague, orderedMatchDays, selectedMatchDayId])

  const { data: leagueStatus, refetch: refetchLeague } = trpc.ladder.leagueGetStatus.useQuery(
    { divisionId: selectedDivisionId, matchDayId: selectedMatchDayId || undefined },
    { enabled: isLeague && !!selectedDivisionId }
  )

  const leagueInit = trpc.ladder.leagueInit.useMutation({
    onSuccess: async () => {
      await refetchTournament()
      await refetchLeague()
    },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  })

  const generateRR = trpc.match.generateRR.useMutation({
    onSuccess: async () => {
      await refetchLeague()
    },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  })

  const closeWeek = trpc.ladder.leagueCloseWeek.useMutation({
    onSuccess: async () => {
      await refetchLeague()
      await refetchMatchDays()
    },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  })

  const scoreInputHref = useMemo(() => {
    const division = encodeURIComponent(selectedDivisionId || '')
    const base = `/admin/${tournamentId}/stages?division=${division}`
    if (isLeague && selectedMatchDayId) {
      return `${base}&day=${encodeURIComponent(selectedMatchDayId)}`
    }
    return base
  }, [isLeague, selectedDivisionId, selectedMatchDayId, tournamentId])

  const oneDayTeamCount = oneDayStatus?.teams?.length ?? 0
  const oneDayInitBlockedReason = useMemo(() => {
    if (!isOneDay || !oneDayStatus) return null
    if (oneDayStatus.currentRound > 0) return 'Already initialized.'
    if (oneDayTeamCount < 2) return `Need at least 2 teams (currently ${oneDayTeamCount}).`
    if (oneDayTeamCount % 2 !== 0) return `Need an even number of teams (currently ${oneDayTeamCount}).`
    return null
  }, [isOneDay, oneDayStatus, oneDayTeamCount])

  const oneDayMissingCourts = useMemo(() => {
    if (!isOneDay || !oneDayStatus) return []
    if (oneDayStatus.currentRound <= 0) return []
    const pools = oneDayStatus.pools ?? []
    return pools
      .map((p: any) => {
        const match = (oneDayStatus.matches ?? []).find((m: any) => m.poolId === p.id)
        return match?.winnerTeamId ? null : (p.name as string)
      })
      .filter(Boolean) as string[]
  }, [isOneDay, oneDayStatus])

  const oneDayAdvanceBlockedReason = useMemo(() => {
    if (!isOneDay || !oneDayStatus) return null
    if (oneDayStatus.currentRound <= 0) return 'Initialize ladder first.'
    if (oneDayMissingCourts.length > 0) return `Waiting for results: ${oneDayMissingCourts.join(', ')}.`
    return null
  }, [isOneDay, oneDayStatus, oneDayMissingCourts])

  const oneDayNextRoundPreview = useMemo(() => {
    if (!isOneDay || !oneDayStatus) return null
    if (oneDayStatus.currentRound <= 0) return null

    const pools = [...(oneDayStatus.pools ?? [])].sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
    if (!pools.length) return null

    const matchesByPoolId: Record<string, any> = {}
    for (const m of oneDayStatus.matches ?? []) {
      if (m.poolId) matchesByPoolId[m.poolId] = m
    }

    const winners: string[] = []
    const losers: string[] = []
    for (const p of pools) {
      const match = matchesByPoolId[p.id]
      if (!match?.winnerTeamId) return null
      const winnerId = match.winnerTeamId as string
      const loserId = winnerId === match.teamAId ? match.teamBId : match.teamAId
      if (!winnerId || !loserId) return null
      winners.push(winnerId)
      losers.push(loserId)
    }

    const poolOrderById: Record<string, number> = {}
    for (const p of pools) poolOrderById[p.id] = p.order

    const teamById: Record<string, any> = {}
    for (const t of oneDayStatus.teams ?? []) teamById[t.id] = t

    const mkTeam = (teamId: string, nextPoolId: string) => {
      const t = teamById[teamId]
      const currentPoolId = t?.poolId as string | undefined
      const currentOrder = currentPoolId ? poolOrderById[currentPoolId] : undefined
      const nextOrder = poolOrderById[nextPoolId]

      let movement: 'UP' | 'DOWN' | 'STAY' = 'STAY'
      if (typeof currentOrder === 'number' && typeof nextOrder === 'number') {
        if (nextOrder < currentOrder) movement = 'UP'
        else if (nextOrder > currentOrder) movement = 'DOWN'
      }

      return { id: teamId, name: (t?.name as string) ?? 'Team', movement }
    }

    const addAssignment = (
      assignments: Array<{ poolId: string; poolName: string; courtOrder: number; teams: Array<{ id: string; name: string; movement: 'UP' | 'DOWN' | 'STAY' }> }>,
      poolIndex: number,
      teamAId: string,
      teamBId: string
    ) => {
      const pool = pools[poolIndex]
      if (!pool) return
      assignments.push({
        poolId: pool.id,
        poolName: pool.name,
        courtOrder: pool.order,
        teams: [mkTeam(teamAId, pool.id), mkTeam(teamBId, pool.id)],
      })
    }

    const n = pools.length
    const nextRound = oneDayStatus.currentRound + 1
    const assignments: Array<{
      poolId: string
      poolName: string
      courtOrder: number
      teams: Array<{ id: string; name: string; movement: 'UP' | 'DOWN' | 'STAY' }>
    }> = []

    if (n === 1) {
      addAssignment(assignments, 0, winners[0]!, losers[0]!)
    } else {
      addAssignment(assignments, 0, winners[0]!, winners[1]!)
      for (let i = 1; i <= n - 2; i++) {
        addAssignment(assignments, i, losers[i - 1]!, winners[i + 1]!)
      }
      addAssignment(assignments, n - 1, losers[n - 2]!, losers[n - 1]!)
    }

    return { nextRound, assignments }
  }, [isOneDay, oneDayStatus])

  const leagueTeamCount = leagueStatus?.teams?.length ?? 0
  const leaguePodsReady = Boolean(leagueStatus?.pools?.length) && (leagueStatus?.teams?.every((t: any) => Boolean(t.poolId)) ?? false)
  const leagueMatches = leagueStatus?.matches ?? []
  const leagueCompletedMatchesCount = leagueMatches.filter((m: any) => Boolean(m.winnerTeamId)).length
  const leagueIncompleteMatchesCount = leagueMatches.filter((m: any) => !m.winnerTeamId).length

  const leagueInitBlockedReason = useMemo(() => {
    if (!isLeague) return null
    if (!leagueStatus) return 'Loading division status...'
    if (leagueStatus.hasAnyMatchesInDivision) return 'Pods are locked once week matches exist.'
    if (leagueTeamCount < 4) return `Need at least 4 teams (currently ${leagueTeamCount}).`
    if (leagueTeamCount % 4 !== 0) return `Team count must be a multiple of 4 (currently ${leagueTeamCount}).`
    return null
  }, [isLeague, leagueStatus, leagueTeamCount])

  const leagueGenerateBlockedReason = useMemo(() => {
    if (!isLeague) return null
    if (!selectedMatchDayId) return 'Select a week first.'
    if (!leaguePodsReady) return 'Initialize pods first.'
    if (!leagueStatus?.matchDay) return 'Week not found.'
    if (leagueStatus.matchDay.status === 'FINALIZED') return 'This week is finalized.'
    if ((leagueStatus.matches ?? []).length > 0) return 'Matches already generated for this week.'
    return null
  }, [isLeague, leaguePodsReady, leagueStatus, selectedMatchDayId])

  const leagueCloseBlockedReason = useMemo(() => {
    if (!isLeague) return null
    if (!selectedMatchDayId) return 'Select a week first.'
    if (!leagueStatus?.matchDay) return 'Week not found.'
    if (leagueStatus.matchDay.status === 'FINALIZED') return 'This week is already finalized.'
    if ((leagueStatus.matches ?? []).length === 0) return 'Generate week matches first.'
    if (leagueIncompleteMatchesCount > 0) return `${leagueIncompleteMatchesCount} match(es) are missing winners.`
    return null
  }, [isLeague, leagueIncompleteMatchesCount, leagueStatus, selectedMatchDayId])

  const leagueSwapsPreview = useMemo(() => {
    if (!isLeague || !leagueStatus?.matchDay) return []
    if (!selectedMatchDayId) return []
    if (leagueStatus.matchDay.status === 'FINALIZED') return []

    const matches = leagueStatus.matches ?? []
    if (matches.length === 0) return []
    if (matches.some((m: any) => !m.winnerTeamId)) return []

    const teamNameById: Record<string, string> = {}
    for (const t of leagueStatus.teams ?? []) teamNameById[t.id] = t.name

    const pods = leagueStatus.standingsByPool ?? []
    const swaps: Array<{ fromPodName: string; toPodName: string; promotedTeam: string; demotedTeam: string }> = []

    for (let i = 0; i < pods.length - 1; i++) {
      const upper = pods[i]!
      const lower = pods[i + 1]!
      const promoted = lower.standings?.[0]
      const demoted = upper.standings?.[upper.standings.length - 1]
      if (!promoted || !demoted) continue
      swaps.push({
        fromPodName: lower.poolName,
        toPodName: upper.poolName,
        promotedTeam: teamNameById[promoted.teamId] ?? 'Team',
        demotedTeam: teamNameById[demoted.teamId] ?? 'Team',
      })
    }

    return swaps
  }, [isLeague, leagueStatus, selectedMatchDayId])

  if (!tournament) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <Card>
          <CardContent className="pt-6 text-gray-600">Loading…</CardContent>
        </Card>
      </div>
    )
  }

  if (!isOneDay && !isLeague) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Ladder</CardTitle>
            <CardDescription>This page is only available for ladder formats.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-gray-600">
            Current format: <span className="font-medium text-gray-900">{tournament.format}</span>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3">
              <span>Ladder</span>
              <Badge variant="secondary">{tournament.format}</Badge>
            </CardTitle>
            <CardDescription>
              Manage ladder logic here. Use Score Input to enter match results.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-700">Division</label>
              <select
                value={selectedDivisionId}
                onChange={(e) => setSelectedDivisionId(e.target.value)}
                className="w-full sm:w-[280px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-700">Seeding</label>
              <select
                value={seeding}
                onChange={(e) => setSeeding(e.target.value as Seeding)}
                className="w-full sm:w-[220px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                <option value="BY_SEED">By seed (1..N)</option>
                <option value="RANDOM">Random</option>
              </select>
            </div>
            <div className="flex gap-2">
              <Link href={scoreInputHref}>
                <Button variant="outline">Score Input</Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rules (MVP)</CardTitle>
            <CardDescription>Quick summary of how this ladder format behaves.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-gray-700">
            {isOneDay ? (
              <ul className="list-disc pl-5 space-y-1">
                <li>2 teams per court (court 1 is the top).</li>
                <li>Each round: winners move up one court (court 1 winners stay); losers move down one court (bottom losers stay).</li>
                <li>Admin enters scores in Score Input, then clicks Advance Round.</li>
              </ul>
            ) : (
              <ul className="list-disc pl-5 space-y-1">
                <li>Pods of 4 teams (Pod 1 is the top).</li>
                <li>Each week: round robin inside each pod.</li>
                <li>On Close Week: Pod N #1 swaps with Pod N-1 #4 (promote/demote between adjacent pods).</li>
              </ul>
            )}
          </CardContent>
        </Card>

        {isOneDay && oneDayStatus && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3">
                <span>One-day Ladder</span>
                <Badge variant="secondary">
                  Round {oneDayStatus.currentRound || 0}
                </Badge>
              </CardTitle>
              <CardDescription>
                2 teams per court. Winners move up, losers move down.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {oneDayStatus.currentRound === 0 ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-gray-600">
                    No ladder rounds yet. Initialize to create courts and round 1 matches.
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Button
                      onClick={() => oneDayInit.mutate({ divisionId: selectedDivisionId, seeding })}
                      disabled={oneDayInit.isPending || Boolean(oneDayInitBlockedReason)}
                    >
                      {oneDayInit.isPending ? 'Initializing…' : 'Initialize Ladder'}
                    </Button>
                    {(oneDayInitBlockedReason || oneDayInit.isPending) && (
                      <div className="text-xs text-gray-500">
                        {oneDayInit.isPending ? 'Working…' : oneDayInitBlockedReason}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-gray-600">
                    Enter all scores for round {oneDayStatus.currentRound}, then advance.
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Button
                      onClick={() => oneDayAdvance.mutate({ divisionId: selectedDivisionId })}
                      disabled={oneDayAdvance.isPending || Boolean(oneDayAdvanceBlockedReason)}
                    >
                      {oneDayAdvance.isPending ? 'Advancing…' : 'Advance Round'}
                    </Button>
                    {(oneDayAdvanceBlockedReason || oneDayAdvance.isPending) && (
                      <div className="text-xs text-gray-500">
                        {oneDayAdvance.isPending ? 'Working…' : oneDayAdvanceBlockedReason}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {oneDayNextRoundPreview && (
                <div className="rounded-lg border bg-white p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-gray-900">
                      Next round preview (Round {oneDayNextRoundPreview.nextRound})
                    </div>
                    <Badge variant="secondary">Ready</Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    {oneDayNextRoundPreview.assignments
                      .slice()
                      .sort((a, b) => a.courtOrder - b.courtOrder)
                      .map((a) => (
                        <div key={a.poolId} className="rounded-md border bg-white p-3">
                          <div className="text-sm font-medium text-gray-900">{a.poolName}</div>
                          <div className="mt-2 space-y-1 text-sm text-gray-700">
                            {a.teams.map((t) => (
                              <div key={t.id} className="flex items-center justify-between">
                                <span>{t.name}</span>
                                <span className="text-xs text-gray-500">
                                  {t.movement === 'UP' ? '^' : t.movement === 'DOWN' ? 'v' : '-'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    This will be applied after you click Advance Round.
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {oneDayStatus.pools.map((pool: any) => {
                  const teams = oneDayStatus.teams.filter((t: any) => t.poolId === pool.id)
                  const match = oneDayStatus.matches.find((m: any) => m.poolId === pool.id)
                  return (
                    <div key={pool.id} className="rounded-lg border bg-white p-4">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold text-gray-900">{pool.name}</div>
                        {match?.winnerTeamId ? (
                          <Badge variant="default" className="bg-green-600">
                            Completed
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Pending</Badge>
                        )}
                      </div>
                      <div className="mt-2 text-sm text-gray-700">
                        {teams.length ? (
                          <ul className="space-y-1">
                            {teams.map((t: any) => (
                              <li key={t.id} className="flex items-center justify-between">
                                <span>{t.name}</span>
                                {typeof t.seed === 'number' && (
                                  <span className="text-xs text-gray-500">#{t.seed}</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="text-gray-500">No teams assigned</div>
                        )}
                      </div>
                      {match && (
                        <div className="mt-3 text-xs text-gray-500">
                          Match: {match.teamA?.name} vs {match.teamB?.name}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {isLeague && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3">
                <span>Ladder League</span>
                {leagueStatus?.matchDay ? (
                  <Badge variant="secondary">
                    Week: {formatMatchDayDate(leagueStatus.matchDay.date)}
                  </Badge>
                ) : (
                  <Badge variant="secondary">No weeks yet</Badge>
                )}
              </CardTitle>
              <CardDescription>
                MVP: pods of 4 teams, round robin each week, promote/demote 1 team between pods.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="secondary">Teams: {leagueTeamCount}</Badge>
                <Badge variant="secondary">
                  {leagueTeamCount % 4 === 0 && leagueTeamCount > 0 ? 'Multiple of 4' : 'Needs x4 teams'}
                </Badge>
                <Badge variant="secondary">Pods: {leagueStatus?.pools?.length ?? 0}</Badge>
                {leagueStatus?.matchDay && (
                  <Badge variant="secondary">
                    Week status: {leagueStatus.matchDay.status}
                  </Badge>
                )}
                {selectedMatchDayId && (
                  <Badge variant="secondary">
                    Matches: {leagueCompletedMatchesCount}/{leagueMatches.length || 0}
                  </Badge>
                )}
              </div>

              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-gray-700">Week (match day)</label>
                  <select
                    value={selectedMatchDayId}
                    onChange={(e) => setSelectedMatchDayId(e.target.value)}
                    className="w-full lg:w-[320px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                    disabled={!orderedMatchDays.length}
                  >
                    {orderedMatchDays.map((d: any) => (
                      <option key={d.id} value={d.id}>
                        {formatMatchDayDate(d.date)} ({d.status})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-gray-700">Create week</label>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={newWeekDate}
                      onChange={(e) => setNewWeekDate(e.target.value)}
                      className="w-full lg:w-[220px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                    />
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (!newWeekDate) return (toast({ description: 'Pick a date', variant: 'destructive' }), undefined)
                        createMatchDay.mutate({ tournamentId, date: newWeekDate })
                      }}
                      disabled={createMatchDay.isPending}
                    >
                      {createMatchDay.isPending ? 'Creating…' : 'Add'}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <div className="flex flex-col gap-1">
                  <Button
                    onClick={() => leagueInit.mutate({ divisionId: selectedDivisionId, seeding, podSizeTeams: 4 })}
                    disabled={leagueInit.isPending || Boolean(leagueInitBlockedReason)}
                  >
                    {leagueInit.isPending ? 'Initializing…' : 'Initialize Pods'}
                  </Button>
                  {(leagueInitBlockedReason || leagueInit.isPending) && (
                    <div className="text-xs text-gray-500">
                      {leagueInit.isPending ? 'Working…' : leagueInitBlockedReason}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (leagueGenerateBlockedReason) return (toast({ description: leagueGenerateBlockedReason, variant: 'destructive' }), undefined)
                      generateRR.mutate({ divisionId: selectedDivisionId, matchDayId: selectedMatchDayId })
                    }}
                    disabled={generateRR.isPending || Boolean(leagueGenerateBlockedReason)}
                  >
                    {generateRR.isPending ? 'Generating…' : 'Generate Week Matches'}
                  </Button>
                  {(leagueGenerateBlockedReason || generateRR.isPending) && (
                    <div className="text-xs text-gray-500">
                      {generateRR.isPending ? 'Working…' : leagueGenerateBlockedReason}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <Button
                    variant="destructive"
                    onClick={() => {
                      if (leagueCloseBlockedReason) return (toast({ description: leagueCloseBlockedReason, variant: 'destructive' }), undefined)
                      setShowCloseWeekConfirm(true)
                    }}
                    disabled={closeWeek.isPending || Boolean(leagueCloseBlockedReason)}
                  >
                    {closeWeek.isPending ? 'Closing…' : 'Close Week (Promote/Demote)'}
                  </Button>
                  {(leagueCloseBlockedReason || closeWeek.isPending) && (
                    <div className="text-xs text-gray-500">
                      {closeWeek.isPending ? 'Working…' : leagueCloseBlockedReason}
                    </div>
                  )}
                </div>

                <Link href={scoreInputHref}>
                  <Button variant="outline">Open Score Input</Button>
                </Link>
              </div>

              {leagueSwapsPreview.length > 0 && (
                <div className="rounded-lg border bg-white p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-gray-900">Promotion/Demotion Preview</div>
                    <Badge variant="secondary">Ready</Badge>
                  </div>
                  <div className="mt-3 space-y-3 text-sm">
                    {leagueSwapsPreview.map((s, idx) => (
                      <div key={idx} className="rounded-md border bg-white p-3">
                        <div className="text-xs text-gray-500">
                          {s.fromPodName} -&gt; {s.toPodName}
                        </div>
                        <div className="mt-1 flex flex-col gap-1">
                          <div className="text-green-700">Promote: {s.promotedTeam}</div>
                          <div className="text-red-700">Demote: {s.demotedTeam}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    This will be applied when you click Close Week.
                  </div>
                </div>
              )}

              {leagueStatus && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {leagueStatus.standingsByPool.map((pod: any) => (
                    <div key={pod.poolId} className="rounded-lg border bg-white p-4">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold text-gray-900">{pod.poolName}</div>
                        <Badge variant="secondary">Pod {pod.poolOrder}</Badge>
                      </div>
                      <div className="mt-3 space-y-1 text-sm">
                        {pod.standings.length ? (
                          pod.standings.map((s: any, idx: number) => {
                            const team = leagueStatus.teams.find((t: any) => t.id === s.teamId)
                            const isPromotionZone = pod.poolOrder > 1 && idx === 0
                            const isDemotionZone = pod.poolOrder < leagueStatus.standingsByPool.length && idx === pod.standings.length - 1
                            return (
                              <div key={s.teamId} className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="w-5 text-xs text-gray-500">{idx + 1}.</span>
                                  <span className="text-gray-900">{team?.name ?? 'Team'}</span>
                                  {isPromotionZone && <Badge className="bg-green-600">UP</Badge>}
                                  {isDemotionZone && <Badge className="bg-red-600">DOWN</Badge>}
                                </div>
                                <div className="text-xs text-gray-600">
                                  {s.wins}-{s.losses} ({s.pointDiff})
                                </div>
                              </div>
                            )
                          })
                        ) : (
                          <div className="text-gray-500">No standings yet</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
      <ConfirmModal
        open={showCloseWeekConfirm}
        onClose={() => setShowCloseWeekConfirm(false)}
        onConfirm={() => {
          closeWeek.mutate({ divisionId: selectedDivisionId, matchDayId: selectedMatchDayId })
          setShowCloseWeekConfirm(false)
        }}
        isPending={closeWeek.isPending}
        destructive
        title="Close this week?"
        description="This will apply promotion/demotion between pods."
        confirmText={closeWeek.isPending ? 'Closing…' : 'Close Week'}
      />
    </div>
  )
}
