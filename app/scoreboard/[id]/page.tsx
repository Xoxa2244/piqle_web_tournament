'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Trophy, 
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  Clock,
  AlertCircle,
  ArrowLeft
} from 'lucide-react'
import BracketPyramid from '@/components/BracketPyramid'
import BracketPyramidNew from '@/components/BracketPyramidNew'
import BracketModal from '@/components/BracketModal'
import { getTeamDisplayName } from '@/lib/utils'
import { formatUsDateShort, formatMatchDayDate } from '@/lib/dateFormat'

interface TeamStanding {
  teamId: string
  teamName: string
  rank: number
  wins: number
  losses: number
  pointsFor: number
  pointsAgainst: number
  pointDiff: number
  headToHead: Record<string, { wins: number; losses: number; pointDiff: number }>
}

interface PlayInMatch {
  id: string
  teamA: { id: string; name: string; seed: number }
  teamB: { id: string; name: string; seed: number }
  games: Array<{ scoreA: number; scoreB: number }>
  roundIndex: number
}

interface PlayoffMatch {
  id: string
  teamA: { id: string; name: string; seed: number } | null
  teamB: { id: string; name: string; seed: number } | null
  games: Array<{ scoreA: number; scoreB: number }>
  roundIndex: number
  stage: string
}

interface MatchupRosterPlayer {
  id: string
  name: string
  letter: string
}

export default function PublicCoursePage() {
  const params = useParams()
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const tournamentId = params.id as string
  const isEmbed = pathname?.includes('/embed') ?? false
  const [selectedDivisionId, setSelectedDivisionId] = useState<string>('')
  const highlightTeamId = searchParams.get('teamId') || null
  const initialDivisionDone = useRef(false)
  const [showConnectingLines, setShowConnectingLines] = useState(true)
  const [showBracketModal, setShowBracketModal] = useState(false)
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null)
  const [selectedMatchDayId, setSelectedMatchDayId] = useState<string | null>(null)
  const [indyViewMode, setIndyViewMode] = useState<'DAY_ONLY' | 'SEASON_TO_DATE'>('SEASON_TO_DATE')
  const [expandedIndyMatchupId, setExpandedIndyMatchupId] = useState<string | null>(null)

  // Get tournament data (using public endpoint)
  const { data: tournament, isLoading: tournamentLoading } = trpc.public.getTournamentById.useQuery(
    { id: tournamentId },
    { enabled: !!tournamentId }
  )

  const divisions = tournament?.divisions as any[]
  const currentDivision = divisions?.find((d: any) => d.id === selectedDivisionId) || 
                         divisions?.[0]

  // Initial division once: from URL (embed) or first division
  useEffect(() => {
    if (!divisions?.length || initialDivisionDone.current) return
    initialDivisionDone.current = true
    const fromUrl = searchParams.get('divisionId')
    if (fromUrl && divisions.some((d: any) => d.id === fromUrl)) {
      setSelectedDivisionId(fromUrl)
    } else {
      setSelectedDivisionId(divisions[0].id)
    }
  }, [divisions, searchParams])

  // Reset expanded team when switching division
  useEffect(() => {
    setExpandedTeamId(null)
  }, [currentDivision?.id])

  // Get standings for current division (using public endpoint)
  const { data: standingsData, isLoading: standingsLoading } = trpc.public.getPublicStandings.useQuery(
    { divisionId: currentDivision?.id || '' },
    { enabled: !!currentDivision?.id && (tournament as any)?.format !== 'INDY_LEAGUE' }
  )

  // Get division stage (using public endpoint)
  const { data: divisionStage, isLoading: stageLoading } = trpc.public.getPublicDivisionStage.useQuery(
    { divisionId: currentDivision?.id || '' },
    { enabled: !!currentDivision?.id && (tournament as any)?.format !== 'INDY_LEAGUE' }
  )

  // Get bracket structure (play-in + elimination)
  const {
    data: bracketData,
    isLoading: bracketLoading,
  } = (trpc as any).public.getBracketPublic.useQuery(
    { divisionId: currentDivision?.id || '' },
    {
      enabled: !!currentDivision?.id && (tournament as any)?.format !== 'INDY_LEAGUE',
      refetchOnWindowFocus: false,
    }
  )

  const tournamentFormat = (tournament as any)?.format as string | undefined
  const isIndy = tournamentFormat === 'INDY_LEAGUE'

  const { data: indyMatchDays = [] } = trpc.public.getIndyMatchDays.useQuery(
    { tournamentId },
    { enabled: !!tournamentId && isIndy }
  )

  useEffect(() => {
    if (!isIndy) return
    if (!selectedMatchDayId && indyMatchDays.length > 0) {
      setSelectedMatchDayId(indyMatchDays[0].id)
    }
  }, [isIndy, indyMatchDays, selectedMatchDayId])

  useEffect(() => {
    setExpandedIndyMatchupId(null)
  }, [selectedMatchDayId])

  const { data: indyStandingsData, isLoading: publicIndyStandingsLoading } = trpc.public.getPublicIndyStandings.useQuery(
    {
      tournamentId,
      divisionId: currentDivision?.id || undefined,
      matchDayId: indyViewMode === 'DAY_ONLY' ? (selectedMatchDayId || undefined) : undefined,
      mode: indyViewMode,
    },
    { enabled: isIndy && !!tournamentId && !!currentDivision?.id }
  )

  const { data: indyMatchups = [], isLoading: indyMatchupsLoading } = trpc.public.getIndyMatchupsByDay.useQuery(
    { matchDayId: selectedMatchDayId || '' },
    { enabled: !!selectedMatchDayId && isIndy }
  )
  const indyStandings = indyStandingsData?.standings ?? []
  const hasTeamsInCurrentDivision = ((currentDivision as any)?.teams?.length ?? 0) > 0
  const hasAnyIndyScoredGames = (indyMatchups as any[]).some((matchup: any) =>
    (matchup.games || []).some(
      (game: any) =>
        game.homeScore !== null &&
        game.awayScore !== null &&
        !(game.homeScore === 0 && game.awayScore === 0)
    )
  )
  const showPublicIndyStandingsLoadingState =
    indyStandings.length === 0 &&
    hasTeamsInCurrentDivision &&
    (
      publicIndyStandingsLoading ||
      (indyViewMode === 'DAY_ONLY' && (indyMatchupsLoading || hasAnyIndyScoredGames))
    )

  const indyMatchupsByDivision = useMemo(() => {
    const grouped: Record<string, any[]> = {}
    indyMatchups.forEach((matchup: any) => {
      const divisionName = matchup.division?.name || 'Division'
      if (!grouped[divisionName]) grouped[divisionName] = []
      grouped[divisionName].push(matchup)
    })
    return grouped
  }, [indyMatchups])

  const getActiveRosterPlayers = (matchup: any, teamId: string): MatchupRosterPlayer[] => {
    const rosters = Array.isArray(matchup?.rosters) ? matchup.rosters : []
    const players: MatchupRosterPlayer[] = rosters
      .filter(
        (r: any) =>
          r.teamId === teamId &&
          r.isActive &&
          typeof r.letter === 'string' &&
          r.letter.trim() !== ''
      )
      .map((r: any) => ({
        id: String(r.player?.id ?? r.playerId ?? ''),
        name:
          `${r.player?.firstName || ''} ${r.player?.lastName || ''}`.trim() ||
          'Unknown player',
        letter: String(r.letter),
      }))
    return players.sort((a, b) => a.letter.localeCompare(b.letter))
  }

  if (tournamentLoading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>
  }

  if (!tournament) {
    return <div className="flex items-center justify-center min-h-screen">Tournament not found</div>
  }

  if (tournament.divisions.length === 0) {
    return <div className="flex items-center justify-center min-h-screen">No divisions</div>
  }

  if (isIndy) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{tournament.title}</h1>
                <p className="text-sm text-gray-600 mt-1">Indy League — standings & results</p>
              </div>
              {!isEmbed && (
                <button
                  onClick={() => router.back()}
                  className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
                >
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Back
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {/* Dashboard: date/mode + division */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIndyViewMode('DAY_ONLY')}
                className={`px-3 py-1.5 text-sm rounded-md border ${
                  indyViewMode === 'DAY_ONLY'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                This day only
              </button>
              <button
                type="button"
                onClick={() => setIndyViewMode('SEASON_TO_DATE')}
                className={`px-3 py-1.5 text-sm rounded-md border ${
                  indyViewMode === 'SEASON_TO_DATE'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                All dates (season)
              </button>
            </div>
            {indyViewMode === 'DAY_ONLY' && indyMatchDays.length > 0 && (
              <select
                value={selectedMatchDayId || ''}
                onChange={(e) => setSelectedMatchDayId(e.target.value || null)}
                className="pl-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-[2.5rem] bg-white"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 0.75rem center',
                  backgroundSize: '1rem',
                }}
              >
                {indyMatchDays.map((day) => (
                  <option key={day.id} value={day.id}>
                    {formatMatchDayDate(day.date)}
                  </option>
                ))}
              </select>
            )}
            {divisions && divisions.length > 1 && (
              <select
                value={selectedDivisionId || ''}
                onChange={(e) => setSelectedDivisionId(e.target.value)}
                className="pl-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-[2.5rem] bg-white"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 0.75rem center',
                  backgroundSize: '1rem',
                }}
              >
                {divisions.map((d: any) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Standings table (same as admin dashboard) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Standings {indyViewMode === 'DAY_ONLY' ? '(this day only)' : '(all dates)'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">#</th>
                      <th className="text-left py-2">Team</th>
                      <th className="text-center py-2">W</th>
                      <th className="text-center py-2">L</th>
                      <th className="text-center py-2">PF</th>
                      <th className="text-center py-2">PA</th>
                      <th className="text-center py-2">Diff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {indyStandings.length > 0 ? (
                      indyStandings.map((team: any, index: number) => (
                        <tr key={team.teamId} className="border-b hover:bg-gray-50">
                          <td className="py-2 font-medium">{index + 1}</td>
                          <td className="py-2 font-medium">{team.teamName}</td>
                          <td className="py-2 text-center">{team.wins}</td>
                          <td className="py-2 text-center">{team.losses}</td>
                          <td className="py-2 text-center">{team.pointsFor}</td>
                          <td className="py-2 text-center">{team.pointsAgainst}</td>
                          <td className="py-2 text-center">
                            <span className={team.pointDiff >= 0 ? 'text-green-600' : 'text-red-600'}>
                              {team.pointDiff > 0 ? '+' : ''}{team.pointDiff}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : showPublicIndyStandingsLoadingState ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-gray-500">
                          <div className="flex items-center justify-center gap-2">
                            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                            <span>Updating standings...</span>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-gray-500">
                          No standings for this selection.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Match results by day (optional detail) */}
          {indyViewMode === 'DAY_ONLY' && selectedMatchDayId && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Match results</CardTitle>
              </CardHeader>
              <CardContent>
                {indyMatchupsLoading ? (
                  <div className="py-6 text-center text-gray-500">Loading matchups...</div>
                ) : indyMatchups.length === 0 ? (
                  <div className="py-6 text-center text-gray-500">No matchups for this day.</div>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(indyMatchupsByDivision).map(([divisionName, matchups]) => (
                      <div key={divisionName}>
                        <div className="text-sm font-medium text-gray-700 mb-2">{divisionName}</div>
                        <div className="space-y-2">
                          {(matchups as any[]).map((matchup: any) => {
                            const isExpanded = expandedIndyMatchupId === matchup.id
                            const homeActivePlayers = getActiveRosterPlayers(matchup, matchup.homeTeamId)
                            const awayActivePlayers = getActiveRosterPlayers(matchup, matchup.awayTeamId)
                            return (
                              <div key={matchup.id}>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedIndyMatchupId((prev) => (prev === matchup.id ? null : matchup.id))
                                  }
                                  className={`w-full border p-3 text-left transition-colors hover:bg-gray-50 rounded-lg ${isExpanded ? 'rounded-b-none' : ''}`}
                                >
                                  <div className="flex items-center justify-between gap-4">
                                    <div>
                                      <div className="font-medium">
                                        {matchup.homeTeam.name} vs {matchup.awayTeam.name}
                                      </div>
                                      <div className="text-sm text-gray-500 mt-1">
                                        {matchup.gamesWonHome} - {matchup.gamesWonAway}
                                        {matchup.court?.name ? ` • Court ${matchup.court.name}` : ''}
                                      </div>
                                    </div>
                                    {isExpanded ? (
                                      <ChevronUp className="h-4 w-4 text-gray-500" />
                                    ) : (
                                      <ChevronDown className="h-4 w-4 text-gray-500" />
                                    )}
                                  </div>
                                </button>
                                {isExpanded && (
                                  <div className="border border-t-0 rounded-b-lg bg-gray-50 p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                      <div className="text-sm font-semibold text-gray-900 mb-2">{matchup.homeTeam.name}</div>
                                      {homeActivePlayers.length > 0 ? (
                                        homeActivePlayers.map((player) => (
                                          <div key={`h-${player.id}-${player.letter}`} className="text-sm text-gray-700">
                                            {player.letter}: {player.name}
                                          </div>
                                        ))
                                      ) : (
                                        <div className="text-sm text-gray-500">No active players with letters.</div>
                                      )}
                                    </div>
                                    <div>
                                      <div className="text-sm font-semibold text-gray-900 mb-2">{matchup.awayTeam.name}</div>
                                      {awayActivePlayers.length > 0 ? (
                                        awayActivePlayers.map((player) => (
                                          <div key={`a-${player.id}-${player.letter}`} className="text-sm text-gray-700">
                                            {player.letter}: {player.name}
                                          </div>
                                        ))
                                      ) : (
                                        <div className="text-sm text-gray-500">No active players with letters.</div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })}
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

  const standings = standingsData?.standings || []
  const rrMatches = divisionStage?.matches?.filter(m => m.stage === 'ROUND_ROBIN') || []

  const is1v1 = currentDivision?.teamKind === 'SINGLES_1v1'
  const maxSlots = currentDivision?.teamKind === 'DOUBLES_2v2' ? 2 : currentDivision?.teamKind === 'SQUAD_4v4' ? 4 : 1
  const divisionTeams = (currentDivision?.teams ?? []) as Array<{ id: string; teamPlayers?: Array<{ slotIndex?: number | null; player: { firstName: string; lastName: string } }> }>

  const getTeamRoster = (teamId: string) => {
    const team = divisionTeams.find((t: any) => t.id === teamId)
    if (!team || !team.teamPlayers) return Array(maxSlots).fill(null)
    const sorted = [...team.teamPlayers].sort((a, b) => (a.slotIndex ?? 999) - (b.slotIndex ?? 999))
    const names: (string | null)[] = []
    for (let i = 0; i < maxSlots; i++) {
      const tp = sorted[i]
      names.push(tp?.player ? `${tp.player.firstName} ${tp.player.lastName}`.trim() || null : null)
    }
    return names
  }
  const playInMatches = divisionStage?.matches?.filter(m => m.stage === 'PLAY_IN') || []
  const playoffMatches = divisionStage?.matches?.filter(m => m.stage === 'ELIMINATION') || []

  const bracketMatches = bracketData?.allMatches ?? []

  const legacyBracketMatches =
    playoffMatches.map(match => ({
      id: match.id,
      teamA: match.teamA
        ? {
            id: match.teamA.id,
            name: getTeamDisplayName(match.teamA as any, currentDivision?.teamKind),
            seed: standings.find(s => s.teamId === match.teamA?.id)?.rank,
          }
        : null,
      teamB: match.teamB
        ? {
            id: match.teamB.id,
            name: getTeamDisplayName(match.teamB as any, currentDivision?.teamKind),
            seed: standings.find(s => s.teamId === match.teamB?.id)?.rank,
          }
        : null,
      games: match.games || [],
      roundIndex: match.roundIndex,
      stage: match.stage,
      note: (match as any).note,
    })) ?? []

  const isRRComplete = divisionStage?.stage === 'RR_COMPLETE' || 
                      (divisionStage?.stage !== 'RR_IN_PROGRESS' && rrMatches.length > 0)
  
  // Calculate Play-In logic based on team count and target bracket size
  const teamCount = standings.length
  const getTargetBracketSize = (teamCount: number) => {
    if (teamCount <= 8) return 4      // Up to 8 teams → bracket 4
    if (teamCount <= 16) return 8     // 9-16 teams → bracket 8
    if (teamCount <= 24) return 16    // 17-24 teams → bracket 16
    if (teamCount <= 32) return 32    // 25-32 teams → bracket 32
    return 64                         // 33+ teams → bracket 64
  }
  
  const isMLP = tournamentFormat === 'MLP'
  const isRoundRobin = tournamentFormat === 'ROUND_ROBIN'
  const isLeagueRoundRobin = tournamentFormat === 'LEAGUE_ROUND_ROBIN'

  const targetBracketSize = getTargetBracketSize(teamCount)
  const needsPlayIn = !isMLP && !isRoundRobin && !isLeagueRoundRobin && targetBracketSize < teamCount && teamCount < 2 * targetBracketSize
  const autoQualifiedCount = needsPlayIn ? targetBracketSize - (teamCount - targetBracketSize) : Math.min(targetBracketSize, teamCount)
  
  const hasPlayIn = needsPlayIn
  const isPlayInComplete = divisionStage?.stage === 'PLAY_IN_COMPLETE'
  const currentStage = divisionStage?.stage || 'RR_IN_PROGRESS'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Desktop Header */}
          <div className="hidden sm:flex items-center justify-between py-4">
            <div className="flex items-center space-x-4">
              {!isEmbed && (
                <>
                  <button
                    type="button"
                    onClick={() => router.back()}
                    className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    <ArrowLeft className="h-5 w-5 mr-2" />
                    <span className="text-sm font-medium">Back</span>
                  </button>
                  <div className="h-6 w-px bg-gray-300"></div>
                </>
              )}
              <h1 className="text-2xl font-bold text-gray-900">
                Tournament Results: {tournament.title}
              </h1>
            </div>

            {/* Division Switcher */}
            <div className="flex items-center space-x-2">
              <button
                className="p-2 hover:bg-gray-100 rounded-md"
                onClick={() => {
                  const divs = tournament.divisions as any[]
                  const currentIndex = divs.findIndex((d: any) => d.id === selectedDivisionId)
                  const prevIndex = currentIndex > 0 ? currentIndex - 1 : divs.length - 1
                  setSelectedDivisionId(divs[prevIndex].id)
                }}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              
              <select
                value={selectedDivisionId}
                onChange={(e) => setSelectedDivisionId(e.target.value)}
                className="pl-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-[2.5rem] bg-white appearance-none bg-no-repeat bg-[length:1rem] bg-[position:right_0.75rem_center]"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
                }}
              >
                {(tournament.divisions as any[]).map((division: any) => (
                  <option key={division.id} value={division.id}>
                    {division.name}
                  </option>
                ))}
              </select>
              
              <button
                className="p-2 hover:bg-gray-100 rounded-md"
                onClick={() => {
                  const divs = tournament.divisions as any[]
                  const currentIndex = divs.findIndex((d: any) => d.id === selectedDivisionId)
                  const nextIndex = currentIndex < divs.length - 1 ? currentIndex + 1 : 0
                  setSelectedDivisionId(divs[nextIndex].id)
                }}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Mobile Header */}
          <div className="sm:hidden py-4 space-y-3">
            {!isEmbed && (
              <div>
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
                >
                  <ArrowLeft className="h-5 w-5 mr-2" />
                  <span className="text-sm font-medium">Back</span>
                </button>
              </div>
            )}
            
            {/* Tournament Title */}
            <div>
              <h1 className="text-lg font-bold text-gray-900 leading-tight">
                Tournament Results: {tournament.title}
              </h1>
            </div>
            
            {/* Division Switcher */}
            <div className="flex items-center justify-center space-x-2">
              <button
                className="p-2 hover:bg-gray-100 rounded-md"
                onClick={() => {
                  const divs = tournament.divisions as any[]
                  const currentIndex = divs.findIndex((d: any) => d.id === selectedDivisionId)
                  const prevIndex = currentIndex > 0 ? currentIndex - 1 : divs.length - 1
                  setSelectedDivisionId(divs[prevIndex].id)
                }}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              
              <select
                value={selectedDivisionId}
                onChange={(e) => setSelectedDivisionId(e.target.value)}
                className="pl-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-center min-w-0 flex-1 pr-[2.5rem] bg-white appearance-none bg-no-repeat bg-[length:1rem] bg-[position:right_0.75rem_center]"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
                }}
              >
                {(tournament.divisions as any[]).map((division: any) => (
                  <option key={division.id} value={division.id}>
                    {division.name}
                  </option>
                ))}
              </select>
              
              <button
                className="p-2 hover:bg-gray-100 rounded-md"
                onClick={() => {
                  const divs = tournament.divisions as any[]
                  const currentIndex = divs.findIndex((d: any) => d.id === selectedDivisionId)
                  const nextIndex = currentIndex < divs.length - 1 ? currentIndex + 1 : 0
                  setSelectedDivisionId(divs[nextIndex].id)
                }}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {currentDivision ? (
          <>
            {/* Desktop Layout */}
            <div className="hidden lg:block space-y-6">
              {/* Round Robin Section */}
              <div className="grid grid-cols-12 gap-6">
                {/* RR Table - Full Width */}
                <div className="col-span-12">
                  <Card>
                    <CardHeader>
                      <CardTitle>Round Robin</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-2">#</th>
                              <th className="text-left py-2">Team</th>
                              <th className="text-center py-2">W</th>
                              <th className="text-center py-2">L</th>
                              <th className="text-center py-2">PF</th>
                              <th className="text-center py-2">PA</th>
                              <th className="text-center py-2">Diff</th>
                            </tr>
                          </thead>
                          <tbody>
                            {standings.map((team: TeamStanding) => (
                              <React.Fragment key={team.teamId}>
                                <tr className={`border-b ${team.teamId === highlightTeamId ? 'bg-green-100' : 'hover:bg-gray-50'}`}>
                                  <td className="py-2 font-medium">{team.rank}</td>
                                  <td className="py-2 font-medium">
                                    {is1v1 ? (
                                      team.teamName
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => setExpandedTeamId(expandedTeamId === team.teamId ? null : team.teamId)}
                                        className="text-left w-full flex items-center gap-1 hover:underline cursor-pointer"
                                      >
                                        {team.teamName}
                                        <span className="text-gray-400 text-xs">
                                          {expandedTeamId === team.teamId ? '▼' : '▶'}
                                        </span>
                                      </button>
                                    )}
                                  </td>
                                  <td className="py-2 text-center">{team.wins}</td>
                                  <td className="py-2 text-center">{team.losses}</td>
                                  <td className="py-2 text-center">{team.pointsFor}</td>
                                  <td className="py-2 text-center">{team.pointsAgainst}</td>
                                  <td className="py-2 text-center">
                                    <span className={team.pointDiff >= 0 ? 'text-green-600' : 'text-red-600'}>
                                      {team.pointDiff > 0 ? '+' : ''}{team.pointDiff}
                                    </span>
                                  </td>
                                </tr>
                                {!is1v1 && expandedTeamId === team.teamId && (
                                  <tr key={`${team.teamId}-roster`} className={`border-b ${team.teamId === highlightTeamId ? 'bg-green-50' : 'bg-gray-50/70'}`}>
                                    <td colSpan={7} className="py-2 px-4">
                                      <div className="text-sm text-gray-600 pl-6 space-y-0.5">
                                        {getTeamRoster(team.teamId).map((name, idx) => (
                                          <div key={idx}>
                                            {name ? name : <span className="text-gray-400 italic">Empty slot</span>}
                                          </div>
                                        ))}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Play-In Section - hide for Round Robin */}
              {!isRoundRobin && !isLeagueRoundRobin && hasPlayIn && !isMLP && (
                <Card>
                  <CardHeader>
                    <CardTitle>Play-In</CardTitle>
                    <p className="text-sm text-gray-600">
                      Preliminary stage to reduce to the required number of participants
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {playInMatches.map((match) => {
                        const hasResults = match.games && match.games.length > 0
                        const scoreA = hasResults ? match.games[0]?.scoreA : null
                        const scoreB = hasResults ? match.games[0]?.scoreB : null
                        const winner = scoreA !== null && scoreB !== null ? (scoreA > scoreB ? 'A' : scoreB > scoreA ? 'B' : null) : null
                        
                        // Get seeds from standings
                        const teamASeed = standings.find(s => s.teamId === match.teamA?.id)?.rank
                        const teamBSeed = standings.find(s => s.teamId === match.teamB?.id)?.rank
                        
                        return (
                          <div key={match.id} className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 h-36 flex flex-col">
                            {/* Header - Match Status */}
                            <div className="flex justify-between items-center mb-3">
                              <div className="text-xs text-gray-500 font-medium">Play-in</div>
                              {!hasResults ? (
                                <div className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                                  Scheduled
                                </div>
                              ) : (
                                <div className="text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-full">
                                  Completed
                                </div>
                              )}
                            </div>

                            {/* Body - Teams and Scores */}
                            <div className="flex-1 space-y-2">
                              {/* Team A */}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2 min-w-0 flex-1">
                                  <div className="text-xs text-gray-500 font-medium w-6">
                                    #{teamASeed || '?'}
                                  </div>
                                  <div className="text-sm font-medium text-gray-900 truncate" title={match.teamA?.name || 'TBD'}>
                                    {match.teamA?.name || 'TBD'}
                                  </div>
                                  {winner === 'A' && (
                                    <div className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                                      Winner
                                    </div>
                                  )}
                                </div>
                                <div className={`text-xl font-semibold font-mono tabular-nums ${
                                  winner === 'A' ? 'text-blue-600' : 
                                  winner === 'B' ? 'text-gray-400' : 
                                  'text-blue-600'
                                }`}>
                                  {scoreA !== null ? scoreA : '—'}
                                </div>
                              </div>

                              {/* Divider */}
                              <div className="border-t border-gray-100"></div>

                              {/* Team B */}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2 min-w-0 flex-1">
                                  <div className="text-xs text-gray-500 font-medium w-6">
                                    #{teamBSeed || '?'}
                                  </div>
                                  <div className={`text-sm font-medium truncate ${
                                    winner === 'B' ? 'text-gray-900' : 
                                    winner === 'A' ? 'text-gray-500' : 
                                    'text-gray-900'
                                  }`} title={match.teamB?.name || 'TBD'}>
                                    {match.teamB?.name || 'TBD'}
                                  </div>
                                  {winner === 'B' && (
                                    <div className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                                      Winner
                                    </div>
                                  )}
                                </div>
                                <div className={`text-xl font-semibold font-mono tabular-nums ${
                                  winner === 'B' ? 'text-blue-600' : 
                                  winner === 'A' ? 'text-gray-400' : 
                                  'text-blue-600'
                                }`}>
                                  {scoreB !== null ? scoreB : '—'}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Bracket Section - hide for Round Robin */}
              {!isRoundRobin && !isLeagueRoundRobin && (
                <Card>
                  <CardHeader>
                    <CardTitle>Playoff Bracket</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {bracketLoading ? (
                      <div className="py-8 text-center text-gray-500">Loading bracket…</div>
                    ) : bracketMatches.length > 0 ? (
                      <BracketPyramidNew
                        matches={bracketMatches}
                        showConnectingLines={showConnectingLines}
                        totalTeams={bracketData?.standings?.length}
                        bracketSize={bracketData?.bracketSize}
                        onMatchClick={(matchId) => {
                          console.log('Match clicked:', matchId)
                        }}
                      />
                    ) : legacyBracketMatches.length > 0 ? (
                      <BracketPyramid
                        matches={legacyBracketMatches}
                        showConnectingLines={showConnectingLines}
                        onMatchClick={(matchId) => {
                          console.log('Match clicked:', matchId)
                        }}
                      />
                    ) : (
                      <div className="py-8 text-center text-gray-500">
                        Bracket not available yet. Generate Play-In or Play-Off matches to view the structure.
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Mobile Layout */}
            <div className="lg:hidden">
              <Tabs defaultValue="rr" className="w-full">
                <TabsList className={`grid w-full ${isRoundRobin || isLeagueRoundRobin ? 'grid-cols-1' : isMLP ? 'grid-cols-2' : 'grid-cols-3'}`}>
                  <TabsTrigger value="rr">RR</TabsTrigger>
                  {!isRoundRobin && !isLeagueRoundRobin && !isMLP && <TabsTrigger value="playin" disabled={!hasPlayIn}>Play-In</TabsTrigger>}
                  {!isRoundRobin && !isLeagueRoundRobin && <TabsTrigger value="bracket">Bracket</TabsTrigger>}
                </TabsList>
                
                <TabsContent value="rr" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Round Robin</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-2">#</th>
                              <th className="text-left py-2">Team</th>
                              <th className="text-center py-2">W</th>
                              <th className="text-center py-2">L</th>
                              <th className="text-center py-2">PF</th>
                              <th className="text-center py-2">PA</th>
                              <th className="text-center py-2">Diff</th>
                            </tr>
                          </thead>
                          <tbody>
                            {standings.map((team: TeamStanding) => (
                              <React.Fragment key={team.teamId}>
                                <tr className={`border-b ${team.teamId === highlightTeamId ? 'bg-green-100' : 'hover:bg-gray-50'}`}>
                                  <td className="py-2 font-medium">{team.rank}</td>
                                  <td className="py-2 font-medium">
                                    {is1v1 ? (
                                      team.teamName
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => setExpandedTeamId(expandedTeamId === team.teamId ? null : team.teamId)}
                                        className="text-left w-full flex items-center gap-1 hover:underline cursor-pointer"
                                      >
                                        {team.teamName}
                                        <span className="text-gray-400 text-xs">
                                          {expandedTeamId === team.teamId ? '▼' : '▶'}
                                        </span>
                                      </button>
                                    )}
                                  </td>
                                  <td className="py-2 text-center">{team.wins}</td>
                                  <td className="py-2 text-center">{team.losses}</td>
                                  <td className="py-2 text-center">{team.pointsFor}</td>
                                  <td className="py-2 text-center">{team.pointsAgainst}</td>
                                  <td className="py-2 text-center">
                                    <span className={team.pointDiff >= 0 ? 'text-green-600' : 'text-red-600'}>
                                      {team.pointDiff > 0 ? '+' : ''}{team.pointDiff}
                                    </span>
                                  </td>
                                </tr>
                                {!is1v1 && expandedTeamId === team.teamId && (
                                  <tr className={`border-b ${team.teamId === highlightTeamId ? 'bg-green-50' : 'bg-gray-50/70'}`}>
                                    <td colSpan={7} className="py-2 px-4">
                                      <div className="text-sm text-gray-600 pl-6 space-y-0.5">
                                        {getTeamRoster(team.teamId).map((name, idx) => (
                                          <div key={idx}>
                                            {name ? name : <span className="text-gray-400 italic">Empty slot</span>}
                                          </div>
                                        ))}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
                
                {!isRoundRobin && !isLeagueRoundRobin && (
                  <TabsContent value="playin">
                  <Card>
                    <CardHeader>
                      <CardTitle>Play-In</CardTitle>
                      <p className="text-sm text-gray-600">
                        Preliminary stage to reduce to the required number of participants
                      </p>
                    </CardHeader>
                    <CardContent>
                      {hasPlayIn ? (
                        <div className="space-y-3">
                          {playInMatches.map((match) => {
                            const hasResults = match.games && match.games.length > 0
                            const scoreA = hasResults ? match.games[0]?.scoreA : null
                            const scoreB = hasResults ? match.games[0]?.scoreB : null
                            const winner = scoreA !== null && scoreB !== null ? (scoreA > scoreB ? 'A' : scoreB > scoreA ? 'B' : null) : null
                            
                            // Get seeds from standings
                            const teamASeed = standings.find(s => s.teamId === match.teamA?.id)?.rank
                            const teamBSeed = standings.find(s => s.teamId === match.teamB?.id)?.rank
                            
                            return (
                              <div key={match.id} className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4">
                                {/* Header - Match Status */}
                                <div className="flex justify-between items-center mb-3">
                                  <div className="text-xs text-gray-500 font-medium">Play-in</div>
                                  {!hasResults ? (
                                    <div className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                                      Scheduled
                                    </div>
                                  ) : (
                                    <div className="text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-full">
                                      Completed
                                    </div>
                                  )}
                                </div>

                                {/* Body - Teams and Scores */}
                                <div className="space-y-2">
                                  {/* Team A */}
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-2 min-w-0 flex-1">
                                      <div className="text-xs text-gray-500 font-medium w-6">
                                        #{teamASeed || '?'}
                                      </div>
                                      <div className="text-sm font-medium text-gray-900 truncate" title={match.teamA ? getTeamDisplayName(match.teamA as any, currentDivision?.teamKind) : 'TBD'}>
                                        {match.teamA ? getTeamDisplayName(match.teamA as any, currentDivision?.teamKind) : 'TBD'}
                                      </div>
                                      {winner === 'A' && (
                                        <div className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                                          Winner
                                        </div>
                                      )}
                                    </div>
                                    <div className={`text-xl font-semibold font-mono tabular-nums ${
                                      winner === 'A' ? 'text-blue-600' : 
                                      winner === 'B' ? 'text-gray-400' : 
                                      'text-blue-600'
                                    }`}>
                                      {scoreA !== null ? scoreA : '—'}
                                    </div>
                                  </div>

                                  {/* Divider */}
                                  <div className="border-t border-gray-100"></div>

                                  {/* Team B */}
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-2 min-w-0 flex-1">
                                      <div className="text-xs text-gray-500 font-medium w-6">
                                        #{teamBSeed || '?'}
                                      </div>
                                      <div className={`text-sm font-medium truncate ${
                                        winner === 'B' ? 'text-gray-900' : 
                                        winner === 'A' ? 'text-gray-500' : 
                                        'text-gray-900'
                                      }`} title={match.teamB ? getTeamDisplayName(match.teamB as any, currentDivision?.teamKind) : 'TBD'}>
                                        {match.teamB ? getTeamDisplayName(match.teamB as any, currentDivision?.teamKind) : 'TBD'}
                                      </div>
                                      {winner === 'B' && (
                                        <div className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                                          Winner
                                        </div>
                                      )}
                                    </div>
                                    <div className={`text-xl font-semibold font-mono tabular-nums ${
                                      winner === 'B' ? 'text-blue-600' : 
                                      winner === 'A' ? 'text-gray-400' : 
                                      'text-blue-600'
                                    }`}>
                                      {scoreB !== null ? scoreB : '—'}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="text-center text-gray-500 py-8">
                          <p>Play-In matches not started yet</p>
                          <p className="text-sm text-gray-400 mt-1">Matches will appear here once Play-In begins</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  </TabsContent>
                )}
                
                {!isRoundRobin && !isLeagueRoundRobin && (
                  <TabsContent value="bracket">
                    <Card>
                      <CardHeader>
                        <CardTitle>Bracket</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {bracketLoading ? (
                          <div className="py-6 text-center text-gray-500 text-sm">Loading bracket…</div>
                        ) : bracketMatches.length > 0 ? (
                          <BracketPyramidNew
                            matches={bracketMatches}
                            showConnectingLines={showConnectingLines}
                            totalTeams={bracketData?.standings?.length}
                            bracketSize={bracketData?.bracketSize}
                            onMatchClick={(matchId) => {
                              console.log('Match clicked:', matchId)
                            }}
                          />
                        ) : legacyBracketMatches.length > 0 ? (
                          <BracketPyramid
                            matches={legacyBracketMatches}
                            showConnectingLines={showConnectingLines}
                            onMatchClick={(matchId) => {
                              console.log('Match clicked:', matchId)
                            }}
                          />
                        ) : (
                          <div className="py-6 text-center text-gray-500 text-sm">
                            Bracket not available yet. Generate Play-In or Play-Off matches to view the structure.
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                )}
              </Tabs>
            </div>
          </>
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-500">Select division</p>
          </div>
        )}
      </div>

      {/* Bracket Modal */}
      {showBracketModal && currentDivision && (
        <BracketModal
          isOpen={showBracketModal}
          onClose={() => setShowBracketModal(false)}
          divisionId={currentDivision.id}
          isPublic={true}
        />
      )}
    </div>
  )
}
