'use client'

import Link from 'next/link'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

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
    onError: (e) => alert(e.message),
  })

  const oneDayAdvance = trpc.ladder.oneDayAdvanceRound.useMutation({
    onSuccess: async () => {
      await refetchTournament()
      await refetchOneDay()
    },
    onError: (e) => alert(e.message),
  })

  const { data: matchDays, refetch: refetchMatchDays } = trpc.matchDay.list.useQuery(
    { tournamentId },
    { enabled: isLeague && !!tournamentId }
  )

  const [newWeekDate, setNewWeekDate] = useState('')
  const createMatchDay = trpc.matchDay.create.useMutation({
    onSuccess: async (day) => {
      setNewWeekDate('')
      await refetchMatchDays()
      setSelectedMatchDayId(day.id)
    },
    onError: (e) => alert(e.message),
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
      setSelectedMatchDayId(orderedMatchDays[0]!.id)
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
    onError: (e) => alert(e.message),
  })

  const generateRR = trpc.match.generateRR.useMutation({
    onSuccess: async () => {
      await refetchLeague()
    },
    onError: (e) => alert(e.message),
  })

  const closeWeek = trpc.ladder.leagueCloseWeek.useMutation({
    onSuccess: async () => {
      await refetchLeague()
      await refetchMatchDays()
    },
    onError: (e) => alert(e.message),
  })

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
              <Link
                href={`/admin/${tournamentId}/stages?division=${encodeURIComponent(selectedDivisionId || '')}`}
              >
                <Button variant="outline">Score Input</Button>
              </Link>
            </div>
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
                  <Button
                    onClick={() => oneDayInit.mutate({ divisionId: selectedDivisionId, seeding })}
                    disabled={oneDayInit.isPending}
                  >
                    {oneDayInit.isPending ? 'Initializing…' : 'Initialize Ladder'}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-gray-600">
                    Enter all scores for round {oneDayStatus.currentRound}, then advance.
                  </div>
                  <Button
                    onClick={() => oneDayAdvance.mutate({ divisionId: selectedDivisionId })}
                    disabled={!oneDayStatus.canAdvance || oneDayAdvance.isPending}
                  >
                    {oneDayAdvance.isPending ? 'Advancing…' : 'Advance Round'}
                  </Button>
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
                    Week: {new Date(leagueStatus.matchDay.date).toLocaleDateString()}
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
                        {new Date(d.date).toLocaleDateString()} ({d.status})
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
                        if (!newWeekDate) return alert('Pick a date')
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
                <Button
                  onClick={() => leagueInit.mutate({ divisionId: selectedDivisionId, seeding, podSizeTeams: 4 })}
                  disabled={leagueInit.isPending}
                >
                  {leagueInit.isPending ? 'Initializing…' : 'Initialize Pods'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!selectedMatchDayId) return alert('Select a week first')
                    generateRR.mutate({ divisionId: selectedDivisionId, matchDayId: selectedMatchDayId })
                  }}
                  disabled={!selectedMatchDayId || generateRR.isPending}
                >
                  {generateRR.isPending ? 'Generating…' : 'Generate Week Matches'}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (!selectedMatchDayId) return alert('Select a week first')
                    if (!confirm('Close this week and promote/demote teams?')) return
                    closeWeek.mutate({ divisionId: selectedDivisionId, matchDayId: selectedMatchDayId })
                  }}
                  disabled={!selectedMatchDayId || closeWeek.isPending}
                >
                  {closeWeek.isPending ? 'Closing…' : 'Close Week (Promote/Demote)'}
                </Button>
              </div>

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
                            return (
                              <div key={s.teamId} className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="w-5 text-xs text-gray-500">{idx + 1}.</span>
                                  <span className="text-gray-900">{team?.name ?? 'Team'}</span>
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
    </div>
  )
}
