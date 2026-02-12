'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { trpc } from '@/lib/trpc'
import { formatUsDateShort } from '@/lib/dateFormat'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const sumMatchPoints = (match: any) => {
  const games = match?.games ?? []
  let a = 0
  let b = 0
  for (const g of games) {
    a += g?.scoreA ?? 0
    b += g?.scoreB ?? 0
  }
  return { a, b }
}

export default function TournamentLadderPage() {
  const params = useParams()
  const router = useRouter()
  const tournamentId = params.id as string
  const { status: authStatus } = useSession()

  useEffect(() => {
    if (authStatus === 'unauthenticated' && tournamentId) {
      const callbackUrl = `/tournaments/${tournamentId}/ladder`
      router.replace(`/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`)
    }
  }, [authStatus, router, tournamentId])

  const { data: seatMap, isLoading } = trpc.registration.getSeatMap.useQuery(
    { tournamentId },
    { enabled: !!tournamentId && authStatus === 'authenticated' }
  )
  const { data: myStatus } = trpc.registration.getMyStatus.useQuery(
    { tournamentId },
    { enabled: !!tournamentId && authStatus === 'authenticated' }
  )

  const format = (seatMap as any)?.format as string | undefined
  const isOneDay = format === 'ONE_DAY_LADDER'
  const isLeague = format === 'LADDER_LEAGUE'

  const divisions = ((seatMap as any)?.divisions ?? []) as Array<{ id: string; name: string }>
  const myDivisionId =
    myStatus?.status === 'active' || myStatus?.status === 'waitlisted' ? myStatus.divisionId : ''
  const myTeamId = myStatus?.status === 'active' ? myStatus.teamId : ''
  const defaultDivisionId = myDivisionId || divisions[0]?.id || ''
  const [selectedDivisionId, setSelectedDivisionId] = useState<string>('')
  useEffect(() => {
    if (!selectedDivisionId && defaultDivisionId) setSelectedDivisionId(defaultDivisionId)
  }, [defaultDivisionId, selectedDivisionId])

  const { data: oneDay } = trpc.ladder.oneDayGetStatus.useQuery(
    { divisionId: selectedDivisionId },
    { enabled: isOneDay && !!selectedDivisionId && authStatus === 'authenticated' }
  )

  const { data: matchDays } = trpc.matchDay.list.useQuery(
    { tournamentId },
    { enabled: isLeague && !!tournamentId && authStatus === 'authenticated' }
  )
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
    if (!selectedMatchDayId) setSelectedMatchDayId(orderedMatchDays[orderedMatchDays.length - 1]!.id)
  }, [isLeague, orderedMatchDays, selectedMatchDayId])

  const { data: league } = trpc.ladder.leagueGetStatus.useQuery(
    { divisionId: selectedDivisionId, matchDayId: selectedMatchDayId || undefined },
    { enabled: isLeague && !!selectedDivisionId && authStatus === 'authenticated' }
  )

  if (isLoading || authStatus !== 'authenticated') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading…</div>
      </div>
    )
  }

  if (!seatMap) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Tournament not found.</div>
      </div>
    )
  }

  if (!isOneDay && !isLeague) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto p-6">
          <Card>
            <CardHeader>
              <CardTitle>Ladder</CardTitle>
              <CardDescription>This tournament is not a ladder format.</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Link href={`/tournaments/${tournamentId}/register`}>
                <Button variant="outline">Back to registration</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

	  return (
	    <div className="min-h-screen bg-gray-50">
	      <div className="max-w-6xl mx-auto p-6 space-y-6">
	        <Card>
	          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3">
              <span>{seatMap.title}</span>
              <Badge variant="secondary">{format}</Badge>
            </CardTitle>
            <CardDescription>
              <Link className="underline" href={`/tournaments/${tournamentId}/register`}>
                Registration
              </Link>
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
            {isLeague && (
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-700">Week</label>
                <select
                  value={selectedMatchDayId}
                  onChange={(e) => setSelectedMatchDayId(e.target.value)}
                  className="w-full sm:w-[320px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                  disabled={!orderedMatchDays.length}
                >
                  {orderedMatchDays.map((d: any) => (
                    <option key={d.id} value={d.id}>
                      {formatUsDateShort(d.date)} ({d.status})
                    </option>
                  ))}
                </select>
              </div>
            )}
	          </CardContent>
	        </Card>

	        <Card>
	          <CardHeader>
	            <CardTitle>How it works (MVP)</CardTitle>
	            <CardDescription>Short rules for this ladder format.</CardDescription>
	          </CardHeader>
	          <CardContent className="text-sm text-gray-700">
	            {isOneDay ? (
	              <ul className="list-disc pl-5 space-y-1">
	                <li>2 teams per court (court 1 is the top).</li>
	                <li>If you win: you move up one court (court 1 winners stay). If you lose: you move down one court (bottom losers stay).</li>
	                <li>The organizer advances rounds after all scores are entered.</li>
	              </ul>
	            ) : (
	              <ul className="list-disc pl-5 space-y-1">
	                <li>Pods of 4 teams (Pod 1 is the top).</li>
	                <li>Each week: round robin inside each pod.</li>
	                <li>After the week closes: Pod N #1 swaps with Pod N-1 #4.</li>
	              </ul>
	            )}
	          </CardContent>
	        </Card>

	        {isOneDay && oneDay && (
	          <Card>
	            <CardHeader>
	              <CardTitle className="flex items-center justify-between gap-3">
                <span>One-day Ladder</span>
                <Badge variant="secondary">Round {oneDay.currentRound || 0}</Badge>
              </CardTitle>
              <CardDescription>Winners move up, losers move down.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {myStatus?.status === 'active' && (
                <div className="rounded-md border bg-white p-3 text-sm">
                  <div className="text-gray-600">Your team</div>
                  <div className="font-medium text-gray-900">{myStatus.teamName}</div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {oneDay.pools.map((pool: any) => {
                  const teams = oneDay.teams.filter((t: any) => t.poolId === pool.id)
                  const match = oneDay.matches.find((m: any) => m.poolId === pool.id)
                  const score = match ? sumMatchPoints(match) : null
                  const isMine = myTeamId && teams.some((t: any) => t.id === myTeamId)
                  return (
                    <div
                      key={pool.id}
                      className={`rounded-lg border bg-white p-4 ${isMine ? 'border-blue-400' : ''}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-semibold text-gray-900">{pool.name}</div>
                        {match?.winnerTeamId ? (
                          <Badge variant="default" className="bg-green-600">
                            {score ? `${score.a}-${score.b}` : 'Done'}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Pending</Badge>
                        )}
                      </div>
                      <div className="mt-2 text-sm text-gray-700 space-y-1">
                        {teams.map((t: any) => (
                          <div key={t.id} className="flex items-center justify-between">
                            <span className={t.id === myTeamId ? 'font-medium text-blue-900' : ''}>
                              {t.name}
                            </span>
                            {typeof t.seed === 'number' && <span className="text-xs text-gray-500">#{t.seed}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

	        {isLeague && league && (
	          <Card>
	            <CardHeader>
	              <CardTitle className="flex items-center justify-between gap-3">
                <span>Ladder League</span>
                {league.matchDay ? (
                  <Badge variant="secondary">
                    Week: {formatUsDateShort(league.matchDay.date)}
                  </Badge>
                ) : (
                  <Badge variant="secondary">No weeks yet</Badge>
                )}
              </CardTitle>
              <CardDescription>Pods + weekly round robin.</CardDescription>
	            </CardHeader>
	            <CardContent className="space-y-4">
	              {myStatus?.status === 'active' && (
	                <div className="rounded-md border bg-white p-3 text-sm">
                  <div className="text-gray-600">Your team</div>
                  <div className="font-medium text-gray-900">{myStatus.teamName}</div>
                </div>
	              )}

	              {league.matchDay && (
	                <div className="text-sm text-gray-600">
	                  Week status: <span className="font-medium text-gray-900">{league.matchDay.status}</span>
	                  {Array.isArray(league.matches) && league.matches.length > 0 && (
	                    <>
	                      {' '}
	                      • Matches: {league.matches.filter((m: any) => Boolean(m.winnerTeamId)).length}/{league.matches.length}
	                    </>
	                  )}
	                </div>
	              )}

	              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
	                {league.standingsByPool.map((pod: any) => {
	                  const myTeam = myTeamId
	                  const isMyPod = myTeam ? pod.standings.some((s: any) => s.teamId === myTeam) : false
	                  const podCount = league.standingsByPool.length
	                  return (
	                    <div
	                      key={pod.poolId}
	                      className={`rounded-lg border bg-white p-4 ${isMyPod ? 'border-blue-400' : ''}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-semibold text-gray-900">{pod.poolName}</div>
                        <Badge variant="secondary">Pod {pod.poolOrder}</Badge>
                      </div>
	                      <div className="mt-3 space-y-1 text-sm">
	                        {pod.standings.map((s: any, idx: number) => {
	                          const team = league.teams.find((t: any) => t.id === s.teamId)
	                          const isMine = s.teamId === myTeamId
	                          const isPromotionZone = pod.poolOrder > 1 && idx === 0
	                          const isDemotionZone = pod.poolOrder < podCount && idx === pod.standings.length - 1
	                          return (
	                            <div key={s.teamId} className="flex items-center justify-between">
	                              <div className="flex items-center gap-2">
	                                <span className="w-5 text-xs text-gray-500">{idx + 1}.</span>
	                                <span className={isMine ? 'font-medium text-blue-900' : 'text-gray-900'}>
	                                  {team?.name ?? 'Team'}
	                                </span>
	                                {isPromotionZone && <Badge className="bg-green-600">UP</Badge>}
	                                {isDemotionZone && <Badge className="bg-red-600">DOWN</Badge>}
	                              </div>
	                              <div className="text-xs text-gray-600">
	                                {s.wins}-{s.losses} ({s.pointDiff})
	                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
