'use client'

import { useState, useEffect, useMemo, Suspense } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { 
  ChevronLeft, 
  ChevronRight, 
  BarChart3, 
  Play, 
  RotateCcw, 
  Calculator,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Trophy,
  Users,
  Target,
  RefreshCw,
  Edit3,
  GitBranch,
  Upload,
  FileText
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import ScoreInputModal from '@/components/ScoreInputModal'
import MLPScoreInputModal from '@/components/MLPScoreInputModal'
import TiebreakerModal from '@/components/TiebreakerModal'
import PlayoffSwapModal from '@/components/PlayoffSwapModal'
import UnmergeDivisionModal from '@/components/UnmergeDivisionModal'
import BracketModal from '@/components/BracketModal'
import TournamentNavBar from '@/components/TournamentNavBar'
import DuprUploadLogModal from '@/components/DuprUploadLogModal'
import Link from 'next/link'
import { getTeamDisplayName, cn } from '@/lib/utils'

// Helper function to check roster changes (moved outside component to avoid React hooks issues)
const getRosterWarning = (games: any[], homePlayers: any[], awayPlayers: any[]) => {
  // Check if any games are missing saved players (old games before migration)
  const gamesWithoutPlayers = games.filter((g: any) => 
    !g.homePlayer1 || !g.homePlayer2 || !g.awayPlayer1 || !g.awayPlayer2
  )
  
  // Check if roster has changed (saved players don't match current roster)
  const rosterChanged = games.some((game: any) => {
    if (!game.homePlayer1 || !game.homePlayer2 || !game.awayPlayer1 || !game.awayPlayer2) {
      return false // Skip games without saved players
    }
    
    // Check home team players
    const homeLetter1 = game.homePair?.[0]
    const homeLetter2 = game.homePair?.[1]
    const currentHomePlayer1 = homePlayers.find((p: any) => p.letter === homeLetter1)
    const currentHomePlayer2 = homePlayers.find((p: any) => p.letter === homeLetter2)
    
    // Check away team players
    const awayLetter1 = game.awayPair?.[0]
    const awayLetter2 = game.awayPair?.[1]
    const currentAwayPlayer1 = awayPlayers.find((p: any) => p.letter === awayLetter1)
    const currentAwayPlayer2 = awayPlayers.find((p: any) => p.letter === awayLetter2)
    
    // If any saved player doesn't match current roster player with same letter
    return (
      (currentHomePlayer1 && game.homePlayer1.id !== currentHomePlayer1.id) ||
      (currentHomePlayer2 && game.homePlayer2.id !== currentHomePlayer2.id) ||
      (currentAwayPlayer1 && game.awayPlayer1.id !== currentAwayPlayer1.id) ||
      (currentAwayPlayer2 && game.awayPlayer2.id !== currentAwayPlayer2.id)
    )
  })
  
  if (gamesWithoutPlayers.length > 0) {
    return (
      <div className="mb-4 p-3 bg-yellow-50 border border-yellow-300 rounded-md">
        <div className="flex items-center gap-2 text-sm text-yellow-800">
          <span className="font-semibold">⚠️ Warning:</span>
          <span>
            {gamesWithoutPlayers.length} {gamesWithoutPlayers.length === 1 ? 'game' : 'games'} {gamesWithoutPlayers.length === 1 ? 'was' : 'were'} created before player tracking was enabled. 
            Player names may change if roster is updated. Please click &quot;Regenerate Games&quot; to lock in current roster players.
          </span>
        </div>
      </div>
    )
  }
  
  if (rosterChanged) {
    return (
      <div className="mb-4 p-3 bg-orange-50 border border-orange-300 rounded-md">
        <div className="flex items-center gap-2 text-sm text-orange-800">
          <span className="font-semibold">⚠️ Roster Changed:</span>
          <span>
            The roster has been updated since games were generated. Games are still showing players from the old roster. 
            Please click &quot;Regenerate Games&quot; to update games with the current roster players.
          </span>
        </div>
      </div>
    )
  }
  
  return null
}

function DivisionStageManagementContent() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const tournamentId = params.id as string
  const [selectedDivisionId, setSelectedDivisionId] = useState('')
  const [showScoreModal, setShowScoreModal] = useState(false)
  const [selectedMatch, setSelectedMatch] = useState<any>(null)
  const [selectedIndyGame, setSelectedIndyGame] = useState<any>(null)
  const [showTiebreakerModal, setShowTiebreakerModal] = useState(false)
  const [selectedTiebreakerMatch, setSelectedTiebreakerMatch] = useState<any>(null)
  const [showRRMatches, setShowRRMatches] = useState(true)
  const [showPlayInMatches, setShowPlayInMatches] = useState(true)
  const [showPlayoffMatches, setShowPlayoffMatches] = useState(true)
  const [showRegenerateModal, setShowRegenerateModal] = useState(false)
  const [regenerateType, setRegenerateType] = useState<'playin' | 'playoff' | 'rr' | null>(null)
  const [showPlayoffSwapModal, setShowPlayoffSwapModal] = useState(false)
  const [showEditRRPairsModal, setShowEditRRPairsModal] = useState(false)
  const [showEditPlayInPairsModal, setShowEditPlayInPairsModal] = useState(false)
  const [showUnmergeModal, setShowUnmergeModal] = useState(false)
  const [showBracketModal, setShowBracketModal] = useState(false)
  const [showDuprUploadLog, setShowDuprUploadLog] = useState(false)
  const [duprUploadLog, setDuprUploadLog] = useState<Array<{
    matchId: string
    teamAName: string
    teamBName: string
    status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'PROCESSING'
    error?: string | null
  }>>([])
  const [isUploadingToDupr, setIsUploadingToDupr] = useState(false)


  // Load tournament data
  const { data: tournament, refetch: refetchTournament } = trpc.tournament.get.useQuery(
    { id: tournamentId },
    { enabled: !!tournamentId }
  )
  
  // Get access info for nav bar (must be before any conditional returns)
  const isAdmin = tournament?.userAccessInfo?.isOwner || tournament?.userAccessInfo?.accessLevel === 'ADMIN'
  const isOwner = tournament?.userAccessInfo?.isOwner
  const { data: accessRequests } = trpc.tournamentAccess.listRequests.useQuery(
    { tournamentId },
    { enabled: !!isOwner && !!tournamentId }
  )
  const pendingRequestsCount = accessRequests?.length || 0

  // Filter out divisions with 0 teams that were merged (i.e., there's a merged division containing their ID)
  const visibleDivisions = useMemo(() => {
    if (!tournament?.divisions) return []
    const divisions = tournament.divisions as any[]
    const mergedDivisions = divisions.filter((d: any) => d.isMerged && d.mergedFromDivisionIds)
    
    return divisions.filter((div: any) => {
      // Show merged divisions
      if (div.isMerged) return true
      // Show divisions with teams
      if ((div.teams?.length || 0) > 0) return true
      // Hide divisions with 0 teams that were merged into another division
      const wasMerged = mergedDivisions.some((merged: any) => {
        const mergedFromIds = Array.isArray(merged.mergedFromDivisionIds) 
          ? merged.mergedFromDivisionIds 
          : []
        return mergedFromIds.includes(div.id)
      })
      return !wasMerged
    })
  }, [tournament?.divisions])

  // Read division from URL params on mount and when URL changes
  const divisionFromUrl = searchParams.get('division')
  useEffect(() => {
    if (visibleDivisions.length === 0) return
    
    if (divisionFromUrl && visibleDivisions.some((d: any) => d.id === divisionFromUrl)) {
      // Division from URL is valid - use it
      if (selectedDivisionId !== divisionFromUrl) {
        setSelectedDivisionId(divisionFromUrl)
      }
    } else if (!selectedDivisionId && visibleDivisions.length > 0) {
      // No division in URL and no selected division - set first one and update URL
      const firstDivisionId = visibleDivisions[0]?.id || ''
      setSelectedDivisionId(firstDivisionId)
      if (!divisionFromUrl) {
        router.replace(`/admin/${tournamentId}/stages?division=${firstDivisionId}`, { scroll: false })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divisionFromUrl, visibleDivisions, router, tournamentId])

  // Update URL when division changes via selector (not from URL read)
  useEffect(() => {
    if (selectedDivisionId && visibleDivisions.length > 0) {
      const divisionFromUrl = searchParams.get('division')
      // Only update URL if it's different and division was not just set from URL
      if (divisionFromUrl !== selectedDivisionId) {
        // Small delay to avoid race condition with URL reading
        const timeoutId = setTimeout(() => {
          router.replace(`/admin/${tournamentId}/stages?division=${selectedDivisionId}`, { scroll: false })
        }, 0)
        return () => clearTimeout(timeoutId)
      }
    }
  }, [selectedDivisionId, tournamentId, router])

  // Check if tournament is IndyLeague
  const isIndyLeague = tournament?.format === 'INDY_LEAGUE'

  // For IndyLeague, get match days and matchups
  const [selectedMatchDayId, setSelectedMatchDayId] = useState<string>('')
  const { data: matchDays } = trpc.matchDay.list.useQuery(
    { tournamentId },
    { enabled: isIndyLeague && !!tournamentId }
  )

  // Get matchups for selected match day and division
  const { data: matchups, refetch: refetchMatchups } = trpc.indyMatchup.list.useQuery(
    { matchDayId: selectedMatchDayId },
    { enabled: isIndyLeague && !!selectedMatchDayId }
  )

  // Filter matchups by selected division
  const divisionMatchups = matchups?.filter((m: any) => m.divisionId === selectedDivisionId) || []

  // Set first match day as default
  useEffect(() => {
    if (isIndyLeague && matchDays && matchDays.length > 0 && !selectedMatchDayId) {
      setSelectedMatchDayId(matchDays[0].id)
    }
  }, [isIndyLeague, matchDays, selectedMatchDayId])

  // Local state for optimistic updates
  const [localGameScores, setLocalGameScores] = useState<Record<string, { homeScore: number | null; awayScore: number | null }>>({})

  // Update game score mutation with optimistic updates
  const updateGameScore = trpc.indyMatchup.updateGameScore.useMutation({
    onMutate: async (variables) => {
      // Optimistically update local state immediately
      setLocalGameScores((prev) => ({
        ...prev,
        [variables.gameId]: {
          homeScore: variables.homeScore,
          awayScore: variables.awayScore,
        },
      }))
    },
    onSuccess: () => {
      // Refetch to sync with server
      refetchMatchups()
      // Clear local state after successful update
      setTimeout(() => {
        setLocalGameScores({})
      }, 100)
    },
    onError: (error, variables) => {
      // Revert optimistic update on error
      setLocalGameScores((prev) => {
        const newState = { ...prev }
        delete newState[variables.gameId]
        return newState
      })
      alert('Error updating score: ' + error.message)
    },
  })

  // Update tie break mutation
  const updateTieBreak = trpc.indyMatchup.updateTieBreak.useMutation({
    onSuccess: () => {
      refetchMatchups()
    },
    onError: (error) => {
      alert('Error updating tie-break: ' + error.message)
    },
  })

  // Generate games for division
  const generateGamesForDivision = trpc.indyMatchup.generateGamesForDivision.useMutation({
    onSuccess: (result) => {
      refetchMatchups()
      alert(`Games generated: ${result.generated}\nSkipped: ${result.skipped}\nErrors: ${result.errors}`)
    },
    onError: (error) => {
      alert('Error generating games: ' + error.message)
    },
  })

  // Regenerate games for a matchup
  const regenerateGames = trpc.indyMatchup.regenerateGames.useMutation({
    onSuccess: () => {
      refetchMatchups()
      alert('Games regenerated successfully. All scores for this matchup have been reset.')
    },
    onError: (error) => {
      alert('Error regenerating games: ' + error.message)
    },
  })

  // Helper to get game score (from local state if available, otherwise from game data)
  const getGameScore = (game: any) => {
    const localScore = localGameScores[game.id]
    if (localScore) {
      return localScore
    }
    return {
      homeScore: game.homeScore,
      awayScore: game.awayScore,
    }
  }

  const handleGameScoreChange = (gameId: string, homeScore: number | null, awayScore: number | null) => {
    // Update immediately with optimistic update
    updateGameScore.mutate({
      gameId,
      homeScore,
      awayScore,
    })
  }

  const handleTieBreakChange = (matchupId: string, winnerTeamId: string) => {
    updateTieBreak.mutate({
      matchupId,
      tieBreakWinnerTeamId: winnerTeamId,
    })
  }

  // Format date helper
  const formatDate = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  // Load division data
  const { data: divisionData, refetch: refetchDivision } = trpc.divisionStage.getDivisionStage.useQuery(
    { divisionId: selectedDivisionId },
    { enabled: !!selectedDivisionId }
  )

  // Mutations for generation
  const generateRRMutation = trpc.match.generateRR.useMutation({
    onSuccess: () => {
      refetchDivision()
      refetchTournament()
    }
  })

  const generatePlayoffsMutation = trpc.standings.generatePlayoffs.useMutation({
    onMutate: (variables) => {
      console.log('=== generatePlayoffsMutation.onMutate called ===')
      console.log('Variables:', variables)
    },
    onSuccess: (data) => {
      console.log('=== generatePlayoffsMutation.onSuccess called ===')
      console.log('Success data:', data)
      refetchDivision()
      refetchTournament()
    },
    onError: (error) => {
      console.error('=== generatePlayoffsMutation.onError called ===')
      console.error('Error details:', error)
    }
  })

  const generatePlayoffAfterPlayInMutation = trpc.standings.generatePlayoffAfterPlayIn.useMutation({
    onSuccess: () => {
      console.log('generatePlayoffAfterPlayIn success')
      refetchDivision()
      refetchTournament()
    },
    onError: (error) => {
      console.error('generatePlayoffAfterPlayIn error:', error)
    }
  })

  const regeneratePlayInMutation = trpc.standings.generatePlayoffs.useMutation({
    onSuccess: () => {
      console.log('regeneratePlayInMutation success')
      refetchDivision()
      refetchTournament()
    },
    onError: (error) => {
      console.error('regeneratePlayInMutation error:', error)
      alert(`Error regenerating Play-In: ${error.message}`)
    }
  })

  const generateNextPlayoffRoundMutation = trpc.standings.generateNextPlayoffRound.useMutation({
    onSuccess: (data) => {
      console.log('generateNextPlayoffRound success:', data)
      refetchDivision()
      refetchTournament()
    },
    onError: (error) => {
      console.error('generateNextPlayoffRound error:', error)
    }
  })

  const regenerateRRMutation = trpc.match.regenerateRR.useMutation({
    onSuccess: () => {
      console.log('regenerateRRMutation success')
      refetchDivision()
      refetchTournament()
    },
    onError: (error) => {
      console.error('regenerateRRMutation error:', error)
      alert(`Error regenerating RR: ${error.message}`)
    }
  })

  const fillRandomResultsMutation = trpc.match.fillRandomResults.useMutation({
    onSuccess: () => {
      refetchDivision()
      refetchTournament()
    }
  })

  const updateMatchResultMutation = trpc.divisionStage.updateMatchResult.useMutation({
    onSuccess: () => {
      refetchDivision()
      refetchTournament()
    }
  })

  const swapPlayoffTeamsMutation = trpc.standings.swapPlayoffTeams.useMutation({
    onSuccess: () => {
      refetchDivision()
      refetchTournament()
      setShowPlayoffSwapModal(false)
      setShowEditRRPairsModal(false)
      setShowEditPlayInPairsModal(false)
    }
  })

  // Calculate statistics
  const division = divisionData
  
  // DEBUG: Check divisionData
  // Type assertion to avoid TypeScript deep type inference issue
  const divisionDataAny = divisionData as any
  console.log('DEBUG divisionData:', {
    divisionData: divisionData,
    divisionDataIsUndefined: divisionData === undefined,
    divisionDataIsNull: divisionData === null,
    divisionDataMatches: divisionDataAny?.matches,
    divisionDataMatchesLength: divisionDataAny?.matches?.length,
    divisionDataMatchesType: Array.isArray(divisionDataAny?.matches) ? 'array' : typeof divisionDataAny?.matches,
    divisionDataId: divisionData?.id,
    divisionDataStage: divisionData?.stage,
  })
  
  // Type assertion to avoid TypeScript deep type inference issue
  const divisionAny = division as any
  const teams: any[] = Array.isArray(divisionAny?.teams) ? divisionAny.teams : []
  const matches: any[] = Array.isArray(divisionAny?.matches) ? divisionAny.matches : []
  
  // Count games won by each team in MLP match (defined early to avoid "before initialization" error)
  const countMLPGamesWon = (match: any): { teamAWins: number; teamBWins: number } => {
    let teamAWins = 0
    let teamBWins = 0
    
    if (!match.games || match.games.length === 0) {
      return { teamAWins: 0, teamBWins: 0 }
    }
    
    for (const game of match.games) {
      if (game.winner === 'A') {
        teamAWins++
      } else if (game.winner === 'B') {
        teamBWins++
      } else {
        if (game.scoreA !== null && game.scoreB !== null && game.scoreA > game.scoreB) {
          teamAWins++
        } else if (game.scoreA !== null && game.scoreB !== null && game.scoreB > game.scoreA) {
          teamBWins++
        }
      }
    }
    
    return { teamAWins, teamBWins }
  }
  
  // DEBUG: Check matches data before filtering
  console.log('DEBUG matches before filtering:', {
    matchesLength: matches.length,
    matchesIsArray: Array.isArray(matches),
    firstMatch: matches[0] ? {
      id: matches[0].id,
      stage: matches[0].stage,
      stageType: typeof matches[0].stage,
      teamA: matches[0].teamA?.name,
      teamB: matches[0].teamB?.name,
    } : null,
    allStages: matches.map(m => ({ id: m.id, stage: m.stage, stageType: typeof m.stage })),
    matchesWithROUND_ROBIN: matches.filter(m => m.stage === 'ROUND_ROBIN').length,
    matchesWithNullStage: matches.filter(m => m.stage === null || m.stage === undefined).length,
  })
  
  const rrMatches = matches.filter(m => m.stage === 'ROUND_ROBIN')
  const playInMatches = matches.filter(m => m.stage === 'PLAY_IN')
  const eliminationMatches = matches.filter(m => m.stage === 'ELIMINATION')
  const hasLockedRRMatches = rrMatches.some((match: any) => match.locked)
  
  console.log('Matches data:', {
    totalMatches: matches.length,
    rrMatches: rrMatches.length,
    playInMatches: playInMatches.length,
    eliminationMatches: eliminationMatches.length,
    eliminationMatchesDetails: eliminationMatches.map(m => ({
      id: m.id,
      roundIndex: m.roundIndex,
      note: m.note,
      teamA: m.teamA?.name,
      teamB: m.teamB?.name
    }))
  })
  
  const completedRRMatches = rrMatches.filter(m => {
    if (!m.games || m.games.length === 0) return false
    
    // For MLP matches, check if all 4 games are completed
    // Get tournament format safely
    const tournamentFormat = tournament?.format
    const isMLP = tournamentFormat === 'MLP'
    const matchGamesCount = m.gamesCount || m.games.length
    const isMLPMatch = isMLP && matchGamesCount === 4
    
    if (isMLPMatch) {
      // MLP: match is completed if:
      // 1. There is a winnerTeamId (either directly or through tiebreaker), OR
      // 2. All 4 games are completed and score is NOT 2-2 (i.e., 3-1 or 4-0)
      
      // Check if winner is determined (either directly or through tiebreaker)
      const hasWinner = m.winnerTeamId !== null && m.winnerTeamId !== undefined
      const hasTiebreakerWinner = m.tiebreaker && m.tiebreaker.winnerTeamId !== null && m.tiebreaker.winnerTeamId !== undefined
      
      if (hasWinner || hasTiebreakerWinner) {
        // Match has a winner - it's completed
        return true
      }
      
      // If no winner yet, check if all 4 games are completed and count wins
      if (m.games.length !== 4) return false
      const allGamesCompleted = m.games.every((g: any) =>
        g.scoreA !== null &&
        g.scoreA !== undefined &&
        g.scoreB !== null &&
        g.scoreB !== undefined &&
        g.scoreA >= 0 &&
        g.scoreB >= 0 &&
        g.scoreA !== g.scoreB  // Games should not be tied
      )
      
      if (!allGamesCompleted) {
        // Not all games completed yet
        return false
      }
      
      // Count games won by each team
      const { teamAWins, teamBWins } = countMLPGamesWon(m)
      
      // If score is 3-1 or 4-0, match is completed (winner can be determined from games)
      if (teamAWins >= 3 || teamBWins >= 3) {
        return true
      }
      
      // If score is 2-2, match is NOT completed until tiebreaker is played
      if (teamAWins === 2 && teamBWins === 2) {
        return false
      }
      
      // Invalid state (should not happen)
      return false
    } else {
      // Non-MLP: at least one game with non-zero score
      return m.games.some((g: any) =>
        (g.scoreA !== null && g.scoreA !== undefined && g.scoreA > 0) ||
        (g.scoreB !== null && g.scoreB !== undefined && g.scoreB > 0)
      )
    }
  })
  
  const completedPlayInMatches = playInMatches.filter(m => {
    if (!m.games || m.games.length === 0) return false
    
    // For non-MLP: at least one game with non-zero score
    // Check if match has a winner or all games are completed
    if (m.winnerTeamId !== null && m.winnerTeamId !== undefined) {
      return true // Match has a winner, it's completed
    }
    
    // Check if all games are completed (both scores are set and not equal)
    const allGamesCompleted = m.games.every((g: any) =>
      g.scoreA !== null &&
      g.scoreA !== undefined &&
      g.scoreB !== null &&
      g.scoreB !== undefined &&
      g.scoreA >= 0 &&
      g.scoreB >= 0 &&
      g.scoreA !== g.scoreB
    )
    
    return allGamesCompleted
  })

  const completedPlayoffMatches = eliminationMatches.filter(m => {
    if (!m.games || m.games.length === 0) return false
    
    // Check if match has a winner
    if (m.winnerTeamId !== null && m.winnerTeamId !== undefined) {
      return true // Match has a winner, it's completed
    }
    
    // Check if all games are completed (both scores are set and not equal)
    const allGamesCompleted = m.games.every((g: any) =>
      g.scoreA !== null &&
      g.scoreA !== undefined &&
      g.scoreB !== null &&
      g.scoreB !== undefined &&
      g.scoreA >= 0 &&
      g.scoreB >= 0 &&
      g.scoreA !== g.scoreB
    )
    
    return allGamesCompleted
  })

  const hasRRResults = completedRRMatches.length > 0
  const hasPlayInResults = completedPlayInMatches.length > 0
  const hasPlayoffResults = completedPlayoffMatches.length > 0

  // Check if all matches are completed (for DUPR upload button)
  const allMatchesCompleted = useMemo(() => {
    const allMatches = [...rrMatches, ...playInMatches, ...eliminationMatches]
    const allCompletedMatches = [...completedRRMatches, ...completedPlayInMatches, ...completedPlayoffMatches]
    return allMatches.length > 0 && allMatches.length === allCompletedMatches.length
  }, [rrMatches, playInMatches, eliminationMatches, completedRRMatches, completedPlayInMatches, completedPlayoffMatches])

  // Function to upload tournament results to DUPR
  const handleUploadToDupr = async () => {
    if (!tournamentId || !tournament?.allowDuprSubmission) return

    setIsUploadingToDupr(true)
    setDuprUploadLog([])
    setShowDuprUploadLog(true)

    try {
      const response = await fetch('/api/dupr/submit-tournament', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tournamentId }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to upload to DUPR')
      }

      setDuprUploadLog(data.log || [])
      
      // Refetch division and tournament to update UI
      refetchDivision()
      refetchTournament()
    } catch (error: any) {
      console.error('Error uploading to DUPR:', error)
      alert(`Error: ${error.message || 'Failed to upload to DUPR'}`)
    } finally {
      setIsUploadingToDupr(false)
    }
  }

  const teamCount = teams.length
  // Determine target bracket size based on team count
  const getTargetBracketSize = (teamCount: number) => {
    if (teamCount <= 8) return 4      // Up to 8 teams → bracket 4
    if (teamCount <= 16) return 8     // 9-16 teams → bracket 8
    if (teamCount <= 24) return 16    // 17-24 teams → bracket 16
    if (teamCount <= 32) return 32    // 25-32 teams → bracket 32
    return 64                         // 33+ teams → bracket 64
  }
  const targetBracketSize = getTargetBracketSize(teamCount)
  // For MLP tournaments, Play-In is not used - always go directly to Play-Off
  const isMLPTournament = tournament?.format === 'MLP'
  const needsPlayIn = !isMLPTournament && teamCount > targetBracketSize && teamCount < targetBracketSize * 2
  const playInExcess = teamCount - targetBracketSize

  // Find current division in tournament for additional information
  const currentDivision = (tournament?.divisions as any[])?.find((d: any) => d.id === selectedDivisionId)
  
  // Determine current stage
  const currentStage = division?.stage || 'RR_IN_PROGRESS'
  
  // Functions for handling actions
  const handleGenerateRR = () => {
    if (selectedDivisionId) {
      generateRRMutation.mutate({ divisionId: selectedDivisionId })
    }
  }

  const handleGeneratePlayoffAfterPlayIn = () => {
    if (selectedDivisionId) {
      generatePlayoffAfterPlayInMutation.mutate({ 
        divisionId: selectedDivisionId, 
        bracketSize: targetBracketSize.toString() as "4" | "8" | "16"
      })
    }
  }

  const handleGeneratePlayoffs = () => {
    console.log('handleGeneratePlayoffs called:', {
      selectedDivisionId,
      currentStage,
      targetBracketSize,
      needsPlayIn,
      completedPlayInMatches: completedPlayInMatches.length,
      playInMatches: playInMatches.length
    })
    
    if (selectedDivisionId) {
      // If Play-In is completed (based on completed matches), use generatePlayoffAfterPlayIn
      if (needsPlayIn && completedPlayInMatches.length === playInMatches.length && playInMatches.length > 0) {
        console.log('Using generatePlayoffAfterPlayIn')
        generatePlayoffAfterPlayInMutation.mutate({ 
          divisionId: selectedDivisionId, 
          bracketSize: targetBracketSize.toString() as "4" | "8" | "16"
        })
      } else {
        console.log('Using generatePlayoffs')
        // Otherwise use regular Play-Off generation (directly after RR)
        generatePlayoffsMutation.mutate({ 
          divisionId: selectedDivisionId, 
          bracketSize: targetBracketSize.toString() as "4" | "8" | "16"
        })
      }
    }
  }

  // Check if next playoff round can be generated
  const canGenerateNextRound = () => {
    if (!eliminationMatches.length) return false
    
    // Find current round (highest roundIndex)
    const currentRound = Math.max(...eliminationMatches.map(m => m.roundIndex))
    const currentRoundMatches = eliminationMatches.filter(m => m.roundIndex === currentRound)
    
    // Check if all matches of current round are completed
    const allCompleted = currentRoundMatches.every(match => 
        match.games && match.games.length > 0 && match.games[0] && ((match.games[0].scoreA !== null && match.games[0].scoreA !== undefined && match.games[0].scoreA > 0) || (match.games[0].scoreB !== null && match.games[0].scoreB !== undefined && match.games[0].scoreB > 0))
    )
    
    // Check if this is the final round (has both final and third place matches)
    const hasThirdPlaceMatch = currentRoundMatches.some(m => (m as any).note === 'Third Place Match')
    const isFinalRound = currentRoundMatches.length === 2 && hasThirdPlaceMatch
    
    console.log('canGenerateNextRound check:', {
      eliminationMatchesLength: eliminationMatches.length,
      currentRound,
      currentRoundMatchesLength: currentRoundMatches.length,
      allCompleted,
      hasThirdPlaceMatch,
      isFinalRound,
      canGenerate: allCompleted && !isFinalRound
    })
    
    return allCompleted && !isFinalRound // Don't generate next round if this is the final round
  }

  const handleGenerateNextRound = () => {
    console.log('handleGenerateNextRound called with divisionId:', selectedDivisionId)
    if (selectedDivisionId) {
      generateNextPlayoffRoundMutation.mutate({ divisionId: selectedDivisionId })
    }
  }

  const handleRegeneratePlayoffs = () => {
    console.log('=== handleRegeneratePlayoffs called ===')
    console.log('selectedDivisionId:', selectedDivisionId)
    console.log('needsPlayIn:', needsPlayIn)
    console.log('playInMatches.length:', playInMatches.length)
    console.log('targetBracketSize:', targetBracketSize)
    
    if (!selectedDivisionId) {
      console.error('selectedDivisionId is null/undefined - cannot regenerate Play-Off')
      return
    }
    
    // If there's Play-In, regenerate Play-Off based on Play-In results
    if (needsPlayIn && playInMatches.length > 0) {
      console.log('Regenerating Play-Off based on Play-In results')
      generatePlayoffAfterPlayInMutation.mutate({ 
        divisionId: selectedDivisionId,
        bracketSize: targetBracketSize.toString() as "4" | "8" | "16",
      })
    } else {
      // No Play-In, regenerate Play-Off based on Round Robin results
      console.log('Regenerating Play-Off based on Round Robin results')
      generatePlayoffsMutation.mutate({ 
        divisionId: selectedDivisionId,
        bracketSize: targetBracketSize.toString() as "4" | "8" | "16",
        regenerate: true,
        regenerateType: 'playoff'
      })
    }
  }

  const handleScoreInput = (match: any) => {
    if (match?.locked) {
      return
    }
    setSelectedMatch(match)
    setShowScoreModal(true)
  }

  const handleScoreSubmit = (matchId: string, games: Array<{ scoreA: number; scoreB: number }>, sendToDupr?: boolean) => {
    const game = games[0] // Take first game
    if (!game) return // Safety check
    updateMatchResultMutation.mutate({
      matchId,
      scoreA: game.scoreA ?? null,
      scoreB: game.scoreB ?? null,
      sendToDupr: sendToDupr ?? false,
    })
    setShowScoreModal(false)
    setSelectedMatch(null)
  }

  const handleScoreModalClose = () => {
    setShowScoreModal(false)
    setSelectedMatch(null)
  }

  const handleRetryDuprSubmission = async (matchId: string) => {
    // TODO: Implement DUPR retry submission logic
    // For now, just refetch to update UI
    refetchDivision()
    refetchTournament()
  }

  // Check if MLP match needs tiebreaker
  const needsTiebreaker = (match: any) => {
    if (!match) return false
    const isMLP = tournament?.format === 'MLP'
    const matchGamesCount = match.gamesCount || (match.games?.length || 0)
    if (!isMLP || matchGamesCount !== 4) return false
    
    // Check if all 4 games are completed
    if (!match.games || match.games.length !== 4) return false
    const allGamesCompleted = match.games.every((g: any) => 
      (g.scoreA !== null && g.scoreA !== undefined && g.scoreA > 0) || (g.scoreB !== null && g.scoreB !== undefined && g.scoreB > 0) && g.scoreA !== g.scoreB
    )
    if (!allGamesCompleted) return false
    
    const { teamAWins, teamBWins } = countMLPGamesWon(match)
    
    // If 2:2 and no winner and no tiebreaker yet, needs tiebreaker
    return teamAWins === 2 && teamBWins === 2 && !match.winnerTeamId && !match.tiebreaker
  }

  const handleTiebreakerInput = (match: any) => {
    setSelectedTiebreakerMatch(match)
    setShowTiebreakerModal(true)
  }

  const renderScoreActionButton = (match: any) => {
    const hasResult = match?.games && match.games.length > 0 && match.games[0] && ((match.games[0].scoreA !== null && match.games[0].scoreA !== undefined && match.games[0].scoreA > 0) || (match.games[0].scoreB !== null && match.games[0].scoreB !== undefined && match.games[0].scoreB > 0))
    const isLocked = Boolean(match?.locked)
    const matchNeedsTiebreaker = needsTiebreaker(match)
    const hasTiebreaker = match?.tiebreaker !== null && match?.tiebreaker !== undefined
    
    // If match has tiebreaker, show button to edit tiebreaker
    if (hasTiebreaker) {
      return (
        <div className="space-y-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleScoreInput(match)}
            disabled={isLocked}
            className="w-full"
          >
            Change Score
          </Button>
          <Button
            size="sm"
            variant="default"
            onClick={() => handleTiebreakerInput(match)}
            disabled={isLocked}
            className="w-full bg-orange-600 hover:bg-orange-700"
          >
            Edit Tiebreaker
          </Button>
        </div>
      )
    }
    
    // If match needs tiebreaker, show tiebreaker button instead
    if (matchNeedsTiebreaker) {
      return (
        <div className="space-y-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleScoreInput(match)}
            disabled={isLocked}
            className="w-full"
          >
            Change Score
          </Button>
          <Button
            size="sm"
            variant="default"
            onClick={() => handleTiebreakerInput(match)}
            disabled={isLocked}
            className="w-full bg-orange-600 hover:bg-orange-700"
          >
            Enter Tiebreaker
          </Button>
        </div>
      )
    }
    
    const label = isLocked ? 'Scores Locked' : hasResult ? 'Change Score' : 'Enter Score'
    const variant = isLocked ? 'secondary' : hasResult ? 'outline' : 'default'

    return (
      <Button
        size="sm"
        variant={variant}
        onClick={isLocked ? undefined : () => handleScoreInput(match)}
        disabled={isLocked}
        className="w-full"
        title={isLocked ? 'Round Robin results were locked after unmerging divisions. Use Regenerate RR to reset matches.' : undefined}
      >
        {label}
      </Button>
    )
  }

  const renderLockedNote = (match: any) => {
    if (!match?.locked) {
      return null
    }
    return (
      <p className="text-xs text-gray-500 text-center">
        Locked after unmerge. Regenerate RR to edit.
      </p>
    )
  }

  const handleRegenerate = (type: 'playin' | 'playoff' | 'rr') => {
    setRegenerateType(type)
    setShowRegenerateModal(true)
  }

  const handleRegenerateRR = () => {
    if (selectedDivisionId) {
      regenerateRRMutation.mutate({ divisionId: selectedDivisionId })
    }
  }

  const handleFillRandomResults = () => {
    if (selectedDivisionId) {
      fillRandomResultsMutation.mutate({ divisionId: selectedDivisionId })
    }
  }

  const handleSwapPlayoffTeams = (swaps: Array<{ matchId: string; newTeamAId: string; newTeamBId: string }>) => {
    if (selectedDivisionId) {
      swapPlayoffTeamsMutation.mutate({
        divisionId: selectedDivisionId,
        swaps
      })
    }
  }

  const handleSwapRRTeams = (swaps: Array<{ matchId: string; newTeamAId: string; newTeamBId: string }>) => {
    if (selectedDivisionId) {
      swapPlayoffTeamsMutation.mutate({
        divisionId: selectedDivisionId,
        swaps
      })
    }
  }

  const handleSwapPlayInTeams = (swaps: Array<{ matchId: string; newTeamAId: string; newTeamBId: string }>) => {
    if (selectedDivisionId) {
      swapPlayoffTeamsMutation.mutate({
        divisionId: selectedDivisionId,
        swaps
      })
    }
  }

  const confirmRegenerate = () => {
    console.log('=== confirmRegenerate called ===')
    console.log('regenerateType:', regenerateType)
    console.log('selectedDivisionId:', selectedDivisionId)
    
    if (regenerateType === 'rr') {
      console.log('Regenerating Round Robin')
      // Regenerate Round Robin
      handleRegenerateRR()
    } else if (regenerateType === 'playin') {
      console.log('Regenerating Play-In')
      // Regenerate Play-In (resets both Play-In and Play-Off, but recreates only Play-In)
      regeneratePlayInMutation.mutate({ 
        divisionId: selectedDivisionId, 
        bracketSize: targetBracketSize.toString() as "4" | "8" | "16",
        regenerate: true,
        regenerateType: 'playin'
      })
    } else if (regenerateType === 'playoff') {
      console.log('Regenerating Play-Off - calling handleRegeneratePlayoffs')
      // Regenerate Play-Off
      handleRegeneratePlayoffs()
    } else {
      console.error('Unknown regenerateType:', regenerateType)
    }
    setShowRegenerateModal(false)
    setRegenerateType(null)
  }

  // Determine button availability
  const canGenerateRR = !rrMatches.length
  const canInputRRResults = rrMatches.length > 0 && currentStage === 'RR_IN_PROGRESS' && !hasLockedRRMatches
  const canRecalculateSeeding = completedRRMatches.length === rrMatches.length && currentStage === 'RR_COMPLETE'
  const canRegenerateRR = rrMatches.length > 0 // Can regenerate if RR matches exist
  const canGeneratePlayIn = !isMLPTournament && completedRRMatches.length === rrMatches.length && rrMatches.length > 0 && needsPlayIn && !playInMatches.length
  const canRegeneratePlayIn = !isMLPTournament && playInMatches.length > 0
  // Play-Off can be generated if:
  // 1. For MLP: All RR matches are completed AND (stage is RR_IN_PROGRESS or RR_COMPLETE) AND no Play-Off matches yet
  // 2. For non-MLP: All RR matches are completed AND (stage is RR_IN_PROGRESS or RR_COMPLETE) AND no Play-In needed
  // 3. OR Play-In is complete
  // 4. OR Play-In matches are all completed (if Play-In is needed)
  const canGeneratePlayoff = (
    (currentStage === 'RR_IN_PROGRESS' || currentStage === 'RR_COMPLETE') && 
    completedRRMatches.length === rrMatches.length && 
    rrMatches.length > 0 && 
    !eliminationMatches.length &&
    (isMLPTournament || !needsPlayIn)  // For MLP, always allow; for non-MLP, only if no Play-In needed
  ) || (
    !isMLPTournament && currentStage === 'PLAY_IN_COMPLETE' && !eliminationMatches.length
  ) || (
    !isMLPTournament && needsPlayIn && completedPlayInMatches.length === playInMatches.length && playInMatches.length > 0 && !eliminationMatches.length
  )

  // Debug button availability
  console.log('Button availability debug:', {
    canGenerateRR,
    canRegenerateRR,
    canGeneratePlayIn,
    canRegeneratePlayIn,
    canGeneratePlayoff,
    rrMatchesLength: rrMatches.length,
    playInMatchesLength: playInMatches.length,
    eliminationMatchesLength: eliminationMatches.length,
    completedRRMatchesLength: completedRRMatches.length,
    currentStage,
    needsPlayIn,
    completedPlayInMatchesLength: completedPlayInMatches.length
  })

  // Debug information
  console.log('Debug Play-Off generation:', {
    currentStage,
    needsPlayIn,
    eliminationMatchesLength: eliminationMatches.length,
    canGeneratePlayoff,
    teamCount,
    targetBracketSize,
    playInExcess,
    completedPlayInMatches: completedPlayInMatches.length,
    playInMatches: playInMatches.length
  })

  if (!tournament) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading tournament data...</p>
        </div>
      </div>
    )
  }

  // Check if user has access to any divisions
  if (tournament.divisions.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="text-center p-8 bg-white rounded-lg shadow-md max-w-md">
          <h2 className="text-2xl font-bold text-gray-900 mb-3">No divisions yet</h2>
          <p className="text-gray-600 mb-6">
            There aren&apos;t any divisions to manage stages for. Create a division first to unlock score input and bracket tools.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href={`/admin/${tournamentId}/divisions`}
              className="flex-1 inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              Create division
            </Link>
            <Link
              href={`/admin/${tournamentId}`}
              className="flex-1 inline-flex items-center justify-center border border-gray-300 text-gray-700 rounded-lg px-4 py-2 hover:bg-gray-50"
            >
              Back to tournament
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (!division) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading division data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation Bar */}
      <TournamentNavBar
        tournamentTitle={tournament?.title}
        isAdmin={isAdmin}
        isOwner={isOwner}
        pendingRequestsCount={pendingRequestsCount}
        tournamentFormat={tournament?.format}
      />
      
      {/* Top panel */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Left part - division information */}
          <div className="flex items-center space-x-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{division.name}</h1>
              <div className="flex items-center space-x-4 mt-1">
                <span className="text-sm text-gray-600">
                  {teamCount} teams • {currentDivision?.teamKind === 'SINGLES_1v1' ? 'Singles' : 'Doubles'} • {currentDivision?.pairingMode}
                </span>
                <Badge variant="outline" className="text-xs">
                  {currentStage.replace(/_/g, ' ')}
                </Badge>
                <span className="text-sm text-gray-500">
                  Target size: {targetBracketSize}
                </span>
              </div>
            </div>
          </div>

          {/* Right part - quick actions */}
          <div className="flex items-center space-x-3">
            {/* DUPR Upload buttons */}
            {tournament?.allowDuprSubmission && allMatchesCompleted && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleUploadToDupr}
                  disabled={isUploadingToDupr}
                  className="flex items-center space-x-2"
                >
                  <Upload className="h-4 w-4" />
                  <span>{isUploadingToDupr ? 'Uploading...' : 'Upload to DUPR'}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDuprUploadLog(true)}
                  className="flex items-center space-x-2"
                >
                  <FileText className="h-4 w-4" />
                  <span>Show upload log</span>
                </Button>
              </>
            )}
            
            {/* Division switcher */}
            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const currentIndex = visibleDivisions.findIndex((d: any) => d.id === selectedDivisionId)
                  const prevIndex = currentIndex > 0 ? currentIndex - 1 : visibleDivisions.length - 1
                  setSelectedDivisionId(visibleDivisions[prevIndex].id)
                }}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <select
                value={selectedDivisionId}
                onChange={(e) => setSelectedDivisionId(e.target.value)}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm"
              >
                {visibleDivisions.map((div: any) => (
                  <option key={div.id} value={div.id}>
                    {div.name} ({div.teams?.length || 0} teams)
                  </option>
                ))}
              </select>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const currentIndex = visibleDivisions.findIndex((d: any) => d.id === selectedDivisionId)
                  const nextIndex = currentIndex < visibleDivisions.length - 1 ? currentIndex + 1 : 0
                  setSelectedDivisionId(visibleDivisions[nextIndex].id)
                }}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Match Day switcher for IndyLeague */}
        {isIndyLeague && matchDays && matchDays.length > 0 && (
          <div className="flex items-center space-x-2 mt-4 pb-2 border-b border-gray-200">
            <span className="text-sm font-medium text-gray-700">Match Day:</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const currentIndex = matchDays.findIndex((d: any) => d.id === selectedMatchDayId)
                const prevIndex = currentIndex > 0 ? currentIndex - 1 : matchDays.length - 1
                setSelectedMatchDayId(matchDays[prevIndex].id)
              }}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            <select
              value={selectedMatchDayId}
              onChange={(e) => setSelectedMatchDayId(e.target.value)}
              className="px-3 py-1 border border-gray-300 rounded-md text-sm"
            >
              {matchDays.map((day: any) => (
                <option key={day.id} value={day.id}>
                  {formatDate(day.date)} ({day.matchups?.length || 0} matchups)
                </option>
              ))}
            </select>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const currentIndex = matchDays.findIndex((d: any) => d.id === selectedMatchDayId)
                const nextIndex = currentIndex < matchDays.length - 1 ? currentIndex + 1 : 0
                setSelectedMatchDayId(matchDays[nextIndex].id)
              }}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* IndyLeague Score Input */}
        {isIndyLeague ? (
          <div className="space-y-6">
            {divisionMatchups.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-gray-600">No matchups found for this division and match day.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {/* Generate/Regenerate Games button for division */}
                {selectedDivisionId && selectedMatchDayId && (() => {
                  // Check if any matchup has games
                  const hasGames = divisionMatchups.some((m: any) => m.games && m.games.length > 0)
                  const matchupsWithGames = divisionMatchups.filter((m: any) => m.games && m.games.length > 0)
                  
                  return (
                    <Card>
                      <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-gray-600">
                              {hasGames 
                                ? 'Regenerate games for all matchups in this division (this will delete all existing games and scores)'
                                : 'Generate games for all READY matchups in this division'}
                            </p>
                          </div>
                          <Button
                            onClick={async () => {
                              if (hasGames) {
                                if (confirm('Regenerate games for all matchups in this division? This will delete all existing games and reset all scores.')) {
                                  try {
                                    // Regenerate games for each matchup that has games
                                    await Promise.all(
                                      matchupsWithGames.map((matchup: any) =>
                                        regenerateGames.mutateAsync({ matchupId: matchup.id })
                                      )
                                    )
                                    refetchMatchups()
                                  } catch (error: any) {
                                    alert('Error regenerating games: ' + (error?.message || 'Unknown error'))
                                  }
                                }
                              } else {
                                if (confirm('Generate games for all READY matchups in this division?')) {
                                  generateGamesForDivision.mutate({
                                    divisionId: selectedDivisionId,
                                    matchDayId: selectedMatchDayId,
                                  })
                                }
                              }
                            }}
                            disabled={generateGamesForDivision.isPending || regenerateGames.isPending}
                            className="flex items-center space-x-2"
                          >
                            {hasGames ? (
                              <>
                                <RotateCcw className="h-4 w-4" />
                                <span>Regenerate Games</span>
                              </>
                            ) : (
                              <>
                                <Play className="h-4 w-4" />
                                <span>Generate Games</span>
                              </>
                            )}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })()}
                {/* Tabs for matchups */}
                <div className="border-b border-gray-200">
                  <nav className="-mb-px flex space-x-8 overflow-x-auto">
                    {divisionMatchups.map((matchup: any, index: number) => (
                      <button
                        key={matchup.id}
                        onClick={() => {
                          // Scroll to matchup section
                          const element = document.getElementById(`matchup-${matchup.id}`)
                          element?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                        }}
                        className={cn(
                          "whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm",
                          index === 0
                            ? "border-blue-500 text-blue-600"
                            : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                        )}
                      >
                        {matchup.homeTeam.name} vs {matchup.awayTeam.name}
                        <span className="ml-2 text-xs text-gray-400">
                          ({matchup.gamesWonHome} - {matchup.gamesWonAway})
                        </span>
                      </button>
                    ))}
                  </nav>
                </div>

                {/* Matchups */}
                {divisionMatchups.map((matchup: any) => {
                  // Get rosters for this matchup
                  const homeRosters = matchup.rosters?.filter((r: any) => r.teamId === matchup.homeTeamId) || []
                  const awayRosters = matchup.rosters?.filter((r: any) => r.teamId === matchup.awayTeamId) || []
                  
                  // Get active players with letters
                  const homeActivePlayers = homeRosters.filter((r: any) => r.isActive && r.letter).map((r: any) => ({
                    id: r.playerId,
                    name: r.player?.firstName + ' ' + r.player?.lastName,
                    letter: r.letter
                  }))
                  const awayActivePlayers = awayRosters.filter((r: any) => r.isActive && r.letter).map((r: any) => ({
                    id: r.playerId,
                    name: r.player?.firstName + ' ' + r.player?.lastName,
                    letter: r.letter
                  }))

                  // Calculate games won
                  const gamesWonHome = matchup.gamesWonHome || 0
                  const gamesWonAway = matchup.gamesWonAway || 0
                  const needsTieBreak = gamesWonHome === 6 && gamesWonAway === 6

                  return (
                    <Card key={matchup.id} id={`matchup-${matchup.id}`} className="scroll-mt-8">
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                          <div>
                            <div className="text-xl">
                              {matchup.homeTeam.name} vs {matchup.awayTeam.name}
                            </div>
                            <div className="text-sm text-gray-500 mt-1">
                              Score: {gamesWonHome} - {gamesWonAway}
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            {matchup.status && (
                              <Badge variant={matchup.status === 'COMPLETED' ? 'default' : 'outline'}>
                                {matchup.status}
                              </Badge>
                            )}
                            {/* Regenerate Games button - only show if games exist */}
                            {matchup.games && matchup.games.length > 0 && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  if (confirm('Regenerate games for this matchup? This will reset all scores for this matchup.')) {
                                    regenerateGames.mutate({ matchupId: matchup.id })
                                  }
                                }}
                                disabled={regenerateGames.isPending}
                                className="flex items-center space-x-1"
                              >
                                <RotateCcw className="h-4 w-4" />
                                <span>Regenerate Games</span>
                              </Button>
                            )}
                          </div>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {matchup.games && matchup.games.length > 0 ? (
                          <>
                            {/* Check if roster has changed since games were generated */}
                            {getRosterWarning(matchup.games, homeActivePlayers, awayActivePlayers)}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {matchup.games.map((game: any) => {
                              // Use ONLY saved players from game (frozen at generation time)
                              // If saved players are not available, show warning that games need to be regenerated
                              const homePairPlayers = []
                              const awayPairPlayers = []
                              const hasSavedPlayers = game.homePlayer1 && game.homePlayer2 && game.awayPlayer1 && game.awayPlayer2
                              
                              if (hasSavedPlayers) {
                                // Use saved players (frozen at generation time)
                                if (game.homePlayer1) {
                                  homePairPlayers.push({
                                    id: game.homePlayer1.id,
                                    name: `${game.homePlayer1.firstName || ''} ${game.homePlayer1.lastName || ''}`.trim() || 'Unknown',
                                    letter: game.homePair?.[0] || ''
                                  })
                                }
                                if (game.homePlayer2) {
                                  homePairPlayers.push({
                                    id: game.homePlayer2.id,
                                    name: `${game.homePlayer2.firstName || ''} ${game.homePlayer2.lastName || ''}`.trim() || 'Unknown',
                                    letter: game.homePair?.[1] || ''
                                  })
                                }
                                
                                if (game.awayPlayer1) {
                                  awayPairPlayers.push({
                                    id: game.awayPlayer1.id,
                                    name: `${game.awayPlayer1.firstName || ''} ${game.awayPlayer1.lastName || ''}`.trim() || 'Unknown',
                                    letter: game.awayPair?.[0] || ''
                                  })
                                }
                                if (game.awayPlayer2) {
                                  awayPairPlayers.push({
                                    id: game.awayPlayer2.id,
                                    name: `${game.awayPlayer2.firstName || ''} ${game.awayPlayer2.lastName || ''}`.trim() || 'Unknown',
                                    letter: game.awayPair?.[1] || ''
                                  })
                                }
                              }
                              // If no saved players, arrays remain empty and warning will be shown in UI
                              
                              // Get current scores (from local state if available)
                              const currentScores = getGameScore(game)
                              const homeWon = currentScores.homeScore !== null && currentScores.awayScore !== null && currentScores.homeScore > currentScores.awayScore
                              const awayWon = currentScores.homeScore !== null && currentScores.awayScore !== null && currentScores.awayScore > currentScores.homeScore

                              return (
                                <Card key={game.id} className="border-2">
                                  <CardContent className="pt-4">
                                    <div className="space-y-3">
                                      {/* Warning if games don't have saved players (old games before migration) */}
                                      {!hasSavedPlayers && (
                                        <div className="mb-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                                          ⚠️ These games were created before player tracking was enabled. Please regenerate games to lock in current roster players.
                                        </div>
                                      )}
                                      
                                      {/* Teams and players - top */}
                                      <div className="flex items-start gap-4">
                                        {/* Home team - left */}
                                        <div className="flex-1 space-y-1">
                                          <div className="font-semibold text-sm">{matchup.homeTeam.name}</div>
                                          <div className="text-xs text-gray-600 space-y-0.5">
                                            {homePairPlayers.length > 0 ? (
                                              homePairPlayers.map((p: any) => (
                                                <div key={p.id}>
                                                  {p.name} ({p.letter})
                                                </div>
                                              ))
                                            ) : (
                                              <div className="text-gray-400 italic">Players not saved - regenerate games</div>
                                            )}
                                          </div>
                                        </div>

                                        {/* Away team - right */}
                                        <div className="flex-1 space-y-1 text-right">
                                          <div className="font-semibold text-sm">{matchup.awayTeam.name}</div>
                                          <div className="text-xs text-gray-600 space-y-0.5">
                                            {awayPairPlayers.length > 0 ? (
                                              awayPairPlayers.map((p: any) => (
                                                <div key={p.id}>
                                                  {p.name} ({p.letter})
                                                </div>
                                              ))
                                            ) : (
                                              <div className="text-gray-400 italic">Players not saved - regenerate games</div>
                                            )}
                                          </div>
                                        </div>
                                      </div>

                                      {/* Score display and button */}
                                      <div className="pt-2 border-t">
                                        {currentScores.homeScore !== null && currentScores.awayScore !== null ? (
                                          <div className="space-y-2">
                                            <div className="text-center text-sm font-medium flex items-center justify-center gap-2">
                                              <span className={currentScores.homeScore > currentScores.awayScore ? 'text-green-600 font-bold' : currentScores.homeScore < currentScores.awayScore ? 'text-orange-600 font-bold' : ''}>
                                                {currentScores.homeScore}
                                              </span>
                                              <span className="text-gray-400">-</span>
                                              <span className={currentScores.awayScore > currentScores.homeScore ? 'text-green-600 font-bold' : currentScores.awayScore < currentScores.homeScore ? 'text-orange-600 font-bold' : ''}>
                                                {currentScores.awayScore}
                                              </span>
                                            </div>
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              onClick={() => {
                                                setSelectedIndyGame({ game, matchup })
                                                setShowScoreModal(true)
                                              }}
                                              className="w-full"
                                            >
                                              Change Score
                                            </Button>
                                          </div>
                                        ) : (
                                          <Button
                                            size="sm"
                                            variant="default"
                                            onClick={() => {
                                              setSelectedIndyGame({ game, matchup })
                                              setShowScoreModal(true)
                                            }}
                                            className="w-full"
                                          >
                                            Enter Score
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                  </CardContent>
                                </Card>
                              )
                            })}
                            </div>
                          </>
                        ) : (
                          <div className="text-center text-gray-500 py-8">
                            No games generated yet. Generate games from the matchup detail page.
                          </div>
                        )}

                        {/* Tie-break selector */}
                        {needsTieBreak && (
                          <div className="mt-6 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium text-orange-900">Tie-break required (6-6)</p>
                                <p className="text-sm text-orange-700 mt-1">Select the winning team:</p>
                              </div>
                              <select
                                value={matchup.tieBreakWinnerTeamId || ''}
                                onChange={(e) => {
                                  if (e.target.value) {
                                    handleTieBreakChange(matchup.id, e.target.value)
                                  }
                                }}
                                className="px-3 py-2 border border-orange-300 rounded-md"
                              >
                                <option value="">Select winner...</option>
                                <option value={matchup.homeTeamId}>{matchup.homeTeam.name}</option>
                                <option value={matchup.awayTeamId}>{matchup.awayTeam.name}</option>
                              </select>
                            </div>
                            {matchup.tieBreakWinnerTeamId && (
                              <p className="text-sm text-green-700 mt-2">
                                Winner: {matchup.tieBreakWinnerTeamId === matchup.homeTeamId ? matchup.homeTeam.name : matchup.awayTeam.name}
                              </p>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Round Robin Block */}
            {!isIndyLeague && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Users className="h-5 w-5" />
              <span>Round Robin</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* RR Summary */}
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <p className="text-sm text-gray-600">
                  Total matches: {rrMatches.length} • Matches per team: {(() => {
                    // Calculate matches per team within pools
                    if (currentDivision?.pools && currentDivision.pools.length > 0) {
                      const maxMatchesPerTeam = Math.max(...((currentDivision.pools as any[]).map((pool: any) => {
                        const poolTeams = teams.filter((team: any) => team.poolId === pool.id)
                        return poolTeams.length - 1
                      })))
                      return maxMatchesPerTeam
                    }
                    return Math.max(0, teamCount - 1)
                  })()}
                </p>
                {rrMatches.length > 0 && (
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <Progress 
                        value={(completedRRMatches.length / rrMatches.length) * 100} 
                        className="w-32"
                      />
                      <span className="text-sm text-gray-600">
                        {completedRRMatches.length}/{rrMatches.length} completed
                      </span>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="flex items-center space-x-2">
                {canGenerateRR && (
                  <Button
                    onClick={handleGenerateRR}
                    disabled={generateRRMutation.isPending}
                    className="flex items-center space-x-2"
                  >
                    <Play className="h-4 w-4" />
                    <span>Generate RR</span>
                  </Button>
                )}
                
                {canInputRRResults && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      // Show first match for result entry
                      if (rrMatches.length > 0) {
                        handleScoreInput(rrMatches[0])
                      }
                    }}
                    className="flex items-center space-x-2"
                  >
                    <Clock className="h-4 w-4" />
                    <span>Enter Results</span>
                  </Button>
                )}
                
                {canRecalculateSeeding && (
                  <Button
                    variant="outline"
                    onClick={() => {/* Recalculate seeding */}}
                    className="flex items-center space-x-2"
                    title="Recalculate team seeding based on Round Robin results for proper Play-In/Play-Off formation"
                  >
                    <Calculator className="h-4 w-4" />
                    <span>Recalculate Seeding</span>
                  </Button>
                )}
                
                {rrMatches.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={() => setShowEditRRPairsModal(true)}
                    disabled={hasRRResults}
                    className="flex items-center space-x-2 text-blue-600 border-blue-600 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Edit3 className="h-4 w-4" />
                    <span>Edit RR Pairs</span>
                  </Button>
                )}
                
                {canRegenerateRR && (
                  <Button
                    variant="outline"
                    onClick={() => handleRegenerate('rr')}
                    className="flex items-center space-x-2 text-red-600 border-red-600 hover:bg-red-50"
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span>Regenerate RR</span>
                  </Button>
                )}
                
                {rrMatches.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={handleFillRandomResults}
                    disabled={fillRandomResultsMutation.isPending || hasLockedRRMatches}
                    className="flex items-center space-x-2 text-purple-600 border-purple-600 hover:bg-purple-50"
                    title={hasLockedRRMatches ? 'Round Robin results are locked. Regenerate RR to create new matches.' : undefined}
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span>Fill Random Results</span>
                  </Button>
                )}
                
                {/* Dashboard button hidden - available in navigation menu */}
              </div>
            </div>

            {hasLockedRRMatches && (
              <Alert variant="warning">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Round Robin results were carried over from the merged division and are now locked. Regenerate the Round Robin to clear and re-enter scores.
                </AlertDescription>
              </Alert>
            )}

            {/* RR Matches List */}
            {rrMatches.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Round Robin Matches</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowRRMatches(!showRRMatches)}
                    className="flex items-center space-x-2"
                  >
                    <span>{showRRMatches ? 'Collapse' : 'Expand'}</span>
                  </Button>
                </div>
                
                {showRRMatches && (
                  <div className="space-y-6">
                    {/* Group matches by pools */}
                    {(() => {
                      // Get all pools from matches, sort by order
                      const pools = Array.from(new Set(rrMatches.map((m: any) => m.poolId).filter(Boolean)))
                        .map((poolId: any) => {
                          const pool = ((currentDivision?.pools as any[]) || []).find((p: any) => p.id === poolId)
                          return { id: poolId, order: pool?.order || 0 }
                        })
                        .sort((a, b) => a.order - b.order)
                        .map(p => p.id)
                      
                      const waitListMatches = rrMatches.filter(m => m.poolId === null)
                      
                      return (
                        <>
                          {/* Pool matches */}
                          {pools.map((poolId: any) => {
                            const poolMatches = rrMatches.filter((m: any) => m.poolId === poolId)
                            const pool = ((currentDivision?.pools as any[]) || []).find((p: any) => p.id === poolId)
                            const poolName = pool?.name?.startsWith('Pool ') ? pool.name : `Pool ${pool?.name || poolId}`
                            
                            // Group pool matches by rounds and sort
                            const rounds = Array.from(new Set(poolMatches.map(m => m.roundIndex))).sort()
                            
                            return (
                              <div key={poolId} className="space-y-4">
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                  <h4 className="text-lg font-semibold text-blue-900 mb-2">{poolName}</h4>
                                  <p className="text-sm text-blue-700">
                                    {poolMatches.length} matches • {rounds.length} rounds
                                  </p>
                                </div>
                                
                                <div className="space-y-4">
                                  {rounds.map((roundIndex, index) => {
                                    const roundMatches = poolMatches.filter(m => m.roundIndex === roundIndex)
                                    return (
                                      <div key={roundIndex} className="space-y-2">
                                        <h5 className="text-sm font-medium text-gray-700">Round {index + 1}</h5>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                          {roundMatches.map((match) => {
                                            const teamAPlayers = match.teamA?.teamPlayers?.map((tp: any) => 
                                              `${tp.player?.firstName || ''} ${tp.player?.lastName || ''}`.trim()
                                            ).filter(Boolean) || []
                                            const teamBPlayers = match.teamB?.teamPlayers?.map((tp: any) => 
                                              `${tp.player?.firstName || ''} ${tp.player?.lastName || ''}`.trim()
                                            ).filter(Boolean) || []
                                            
                                            return (
                                            <div key={match.id} className="border border-gray-200 rounded-lg p-4">
                                              <div className="mb-2">
                                                <div className="flex items-center justify-between mb-1">
                                                  <div className="text-sm font-medium">
                                                    {getTeamDisplayName(match.teamA, currentDivision?.teamKind)}
                                                  </div>
                                                  <div className="text-sm text-gray-500">vs</div>
                                                  <div className="text-sm font-medium">
                                                    {getTeamDisplayName(match.teamB, currentDivision?.teamKind)}
                                                  </div>
                                                </div>
                                                {(teamAPlayers.length > 0 || teamBPlayers.length > 0) && currentDivision?.teamKind !== 'SINGLES_1v1' && (
                                                  <div className="flex justify-between mt-0.5">
                                                    <div className="text-xs text-gray-500">
                                                      {teamAPlayers.map((player: any, idx: number) => (
                                                        <div key={idx}>{player}</div>
                                                      ))}
                                                    </div>
                                                    <div className="text-xs text-gray-500 text-right">
                                                      {teamBPlayers.map((player: any, idx: number) => (
                                                        <div key={idx}>{player}</div>
                                                      ))}
                                                    </div>
                                                  </div>
                                                )}
                                              </div>
                                              
                                              {(() => {
                                                const isMLP = tournament?.format === 'MLP'
                                                const matchGamesCount = match.gamesCount || (match.games?.length || 0)
                                                const isMLPMatch = isMLP && matchGamesCount === 4
                                                
                                                // For MLP matches, show games won count
                                                if (isMLPMatch && match.games && match.games.length === 4) {
                                                  const { teamAWins, teamBWins } = countMLPGamesWon(match)
                                                  const hasAnyScore = match.games.some((g: any) => 
                                                    (g.scoreA !== null && g.scoreA !== undefined) || (g.scoreB !== null && g.scoreB !== undefined)
                                                  )
                                                  
                                                  if (hasAnyScore) {
                                                    return (
                                                      <div className="text-center space-y-2">
                                                        <div className="text-lg font-bold">
                                                          Games: {teamAWins} - {teamBWins}
                                                        </div>
                                                        {match.tiebreaker && (
                                                          <div className="text-xs text-orange-600 font-medium">
                                                            Tiebreaker: {match.tiebreaker.teamAScore} - {match.tiebreaker.teamBScore}
                                                          </div>
                                                        )}
                                                        {match.winnerTeamId && (
                                                          <div className="text-sm text-green-600 font-medium">
                                                            Winner: {match.winnerTeamId === match.teamAId ? getTeamDisplayName(match.teamA, currentDivision?.teamKind) : getTeamDisplayName(match.teamB, currentDivision?.teamKind)}
                                                          </div>
                                                        )}
                                                        {renderScoreActionButton(match)}
                                                        {renderLockedNote(match)}
                                                      </div>
                                                    )
                                                  }
                                                }
                                                
                                                // For non-MLP matches, show first game score
                                                if (match.games && match.games.length > 0 && match.games[0] && ((match.games[0].scoreA !== null && match.games[0].scoreA !== undefined && match.games[0].scoreA > 0) || (match.games[0].scoreB !== null && match.games[0].scoreB !== undefined && match.games[0].scoreB > 0))) {
                                                  return (
                                                    <div className="text-center space-y-2">
                                                      <div className="text-lg font-bold">
                                                        {match.games[0].scoreA ?? '-'} - {match.games[0].scoreB ?? '-'}
                                                      </div>
                                                      <div className="text-sm text-green-600 font-medium">
                                                        Winner: {match.games[0].winner === 'A' ? getTeamDisplayName(match.teamA, currentDivision?.teamKind) : getTeamDisplayName(match.teamB, currentDivision?.teamKind)}
                                                      </div>
                                                      {renderScoreActionButton(match)}
                                                      {renderLockedNote(match)}
                                                    </div>
                                                  )
                                                }
                                                
                                                return (
                                                  <div className="text-center space-y-2">
                                                    {renderScoreActionButton(match)}
                                                    {renderLockedNote(match)}
                                                  </div>
                                                )
                                              })()}
                                            </div>
                                            )
                                          })}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })}
                          
                          {/* WaitList Matches */}
                          {waitListMatches.length > 0 && (
                            <div className="space-y-4">
                              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                                <h4 className="text-lg font-semibold text-gray-900 mb-2">WaitList</h4>
                                <p className="text-sm text-gray-700">
                                  {waitListMatches.length} matches • {Array.from(new Set(waitListMatches.map(m => m.roundIndex))).length} rounds
                                </p>
                              </div>
                              
                              <div className="space-y-4">
                                {Array.from(new Set(waitListMatches.map(m => m.roundIndex))).sort().map((roundIndex, index) => {
                                  const roundMatches = waitListMatches.filter(m => m.roundIndex === roundIndex)
                                  return (
                                    <div key={roundIndex} className="space-y-2">
                                      <h5 className="text-sm font-medium text-gray-700">Round {index + 1}</h5>
                                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {roundMatches.map((match) => {
                                          const teamAPlayers = match.teamA?.teamPlayers?.map((tp: any) => 
                                            `${tp.player?.firstName || ''} ${tp.player?.lastName || ''}`.trim()
                                          ).filter(Boolean) || []
                                          const teamBPlayers = match.teamB?.teamPlayers?.map((tp: any) => 
                                            `${tp.player?.firstName || ''} ${tp.player?.lastName || ''}`.trim()
                                          ).filter(Boolean) || []
                                          
                                          return (
                                          <div key={match.id} className="border border-gray-200 rounded-lg p-4">
                                            <div className="mb-2">
                                              <div className="flex items-center justify-between mb-1">
                                                <div className="text-sm font-medium">
                                                  {getTeamDisplayName(match.teamA, currentDivision?.teamKind)}
                                                </div>
                                                <div className="text-sm text-gray-500">vs</div>
                                                <div className="text-sm font-medium">
                                                  {getTeamDisplayName(match.teamB, currentDivision?.teamKind)}
                                                </div>
                                              </div>
                                              {(teamAPlayers.length > 0 || teamBPlayers.length > 0) && currentDivision?.teamKind !== 'SINGLES_1v1' && (
                                                <div className="flex justify-between mt-0.5">
                                                  <div className="text-xs text-gray-500">
                                                    {teamAPlayers.map((player: any, idx: number) => (
                                                      <div key={idx}>{player}</div>
                                                    ))}
                                                  </div>
                                                  <div className="text-xs text-gray-500 text-right">
                                                    {teamBPlayers.map((player: any, idx: number) => (
                                                      <div key={idx}>{player}</div>
                                                    ))}
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                            
                                            {(() => {
                                              const isMLP = tournament?.format === 'MLP'
                                              const matchGamesCount = match.gamesCount || (match.games?.length || 0)
                                              const isMLPMatch = isMLP && matchGamesCount === 4
                                              
                                              // For MLP matches, show games won count
                                              if (isMLPMatch && match.games && match.games.length === 4) {
                                                const { teamAWins, teamBWins } = countMLPGamesWon(match)
                                                const hasAnyScore = match.games.some((g: any) => 
                                                  (g.scoreA !== null && g.scoreA !== undefined) || (g.scoreB !== null && g.scoreB !== undefined)
                                                )
                                                
                                                if (hasAnyScore) {
                                                  return (
                                                    <div className="text-center space-y-2">
                                                      <div className="text-lg font-bold">
                                                        Games: {teamAWins} - {teamBWins}
                                                      </div>
                                                      {match.tiebreaker && (
                                                        <div className="text-xs text-orange-600 font-medium">
                                                          Tiebreaker: {match.tiebreaker.teamAScore} - {match.tiebreaker.teamBScore}
                                                        </div>
                                                      )}
                                                      {match.winnerTeamId && (
                                                        <div className="text-sm text-green-600 font-medium">
                                                          Winner: {match.winnerTeamId === match.teamAId ? getTeamDisplayName(match.teamA, currentDivision?.teamKind) : getTeamDisplayName(match.teamB, currentDivision?.teamKind)}
                                                        </div>
                                                      )}
                                                      {renderScoreActionButton(match)}
                                                      {renderLockedNote(match)}
                                                    </div>
                                                  )
                                                }
                                              }
                                              
                                              // For non-MLP matches, show first game score
                                              if (match.games && match.games.length > 0 && match.games[0] && ((match.games[0].scoreA !== null && match.games[0].scoreA !== undefined && match.games[0].scoreA > 0) || (match.games[0].scoreB !== null && match.games[0].scoreB !== undefined && match.games[0].scoreB > 0))) {
                                                return (
                                                  <div className="text-center space-y-2">
                                                    <div className="text-lg font-bold">
                                                      {match.games[0].scoreA ?? '-'} - {match.games[0].scoreB ?? '-'}
                                                    </div>
                                                    <div className="text-sm text-green-600 font-medium">
                                                      Winner: {match.games[0].winner === 'A' ? getTeamDisplayName(match.teamA, currentDivision?.teamKind) : getTeamDisplayName(match.teamB, currentDivision?.teamKind)}
                                                    </div>
                                                    {renderScoreActionButton(match)}
                                                    {renderLockedNote(match)}
                                                  </div>
                                                )
                                              }
                                              
                                              return (
                                                <div className="text-center space-y-2">
                                                  {renderScoreActionButton(match)}
                                                  {renderLockedNote(match)}
                                                </div>
                                              )
                                            })()}
                                          </div>
                                          )
                                        })}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                        </>
                      )
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* Block if RR not completed */}
            {currentStage === 'RR_IN_PROGRESS' && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Complete all Round Robin matches to proceed to Play-In/Play-Off.
                </AlertDescription>
              </Alert>
            )}

            {/* Show Bracket Button */}
            {completedRRMatches.length === rrMatches.length && rrMatches.length > 0 && (
              <div className="flex justify-end">
                <Button
                  onClick={() => setShowBracketModal(true)}
                  variant="outline"
                  className="flex items-center space-x-2"
                >
                  <Trophy className="h-4 w-4" />
                  <span>Show Bracket</span>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
            )}

        {/* Information banner if not enough teams */}
        {teamCount < targetBracketSize && (
          <Card>
            <CardContent className="pt-6">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Not enough teams for selected bracket size. 
                  Teams: {teamCount}, required: {targetBracketSize}.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        )}

        {/* Unmerge Button - show for merged divisions after RR completion */}
        {currentDivision && (currentDivision as any).isMerged && 
         completedRRMatches.length === rrMatches.length && 
         rrMatches.length > 0 && (
          <Card className="border-orange-200 bg-orange-50/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    Unmerge Division
                  </h3>
                  <p className="text-sm text-gray-600">
                    Round Robin is complete. You can now split this merged division back into the original two divisions.
                    Each division will have separate Play-In and Play-Off brackets.
                  </p>
                </div>
                <Button
                  onClick={() => setShowUnmergeModal(true)}
                  className="ml-4 bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white"
                >
                  <GitBranch className="h-4 w-4 mr-2" />
                  Unmerge Division
                </Button>
              </div>
            </CardContent>
          </Card>
            )}

        {/* Play-In Block - show only if B < N < 2B */}
        {!isIndyLeague && needsPlayIn && (
          <Card className={currentStage === 'RR_IN_PROGRESS' ? 'opacity-50 pointer-events-none' : ''}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center space-x-2">
                  <Target className="h-5 w-5" />
                  <span>Play-In</span>
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPlayInMatches(!showPlayInMatches)}
                  className="flex items-center space-x-2"
                >
                  <span>{showPlayInMatches ? 'Collapse' : 'Expand'}</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Play-In Summary */}
              <div className="space-y-2">
                <p className="text-sm text-gray-600">
                  Teams in division: {teamCount}. Target size: {targetBracketSize}. Excess: {playInExcess}.
                </p>
                <p className="text-sm text-gray-600">
                  Play-In includes bottom {playInExcess * 2} seeds. Winners will take {playInExcess} last R1 slots.
                </p>
              </div>

              {/* Play-In Buttons */}
              <div className="flex items-center space-x-2">
                {canGeneratePlayIn && (
                  <Button
                    onClick={() => {
                      // Generate Play-In through standings.generatePlayoffs
                      generatePlayoffsMutation.mutate({ 
                        divisionId: selectedDivisionId, 
                        bracketSize: targetBracketSize.toString() as "4" | "8" | "16",
                        regenerateType: 'playin'
                      })
                    }}
                    disabled={generatePlayoffsMutation.isPending}
                    className="flex items-center space-x-2"
                  >
                    <Play className="h-4 w-4" />
                    <span>Generate Play-In</span>
                  </Button>
                )}
                
                {playInMatches.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={() => setShowEditPlayInPairsModal(true)}
                    disabled={hasPlayInResults}
                    className="flex items-center space-x-2 text-blue-600 border-blue-600 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Edit3 className="h-4 w-4" />
                    <span>Edit Play-In Pairs</span>
                  </Button>
                )}
                
                {canRegeneratePlayIn && (
                  <Button
                    variant="outline"
                    onClick={() => handleRegenerate('playin')}
                    className="flex items-center space-x-2 text-red-600 border-red-600 hover:bg-red-50"
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span>Regenerate Play-In</span>
                  </Button>
                )}
              </div>

              {/* Play-In Progress */}
              {playInMatches.length > 0 && (
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <Progress 
                      value={(completedPlayInMatches.length / playInMatches.length) * 100} 
                      className="w-32"
                    />
                    <span className="text-sm text-gray-600">
                      {completedPlayInMatches.length}/{playInMatches.length} matches completed
                    </span>
                  </div>
                  
                  {completedPlayInMatches.length === playInMatches.length && (
                    <div className="flex items-center space-x-2 text-green-600">
                      <CheckCircle className="h-4 w-4" />
                      <span className="text-sm font-medium">Play-In completed</span>
                    </div>
                  )}
                </div>
              )}

              {/* Play-In Pairings List */}
              {playInMatches.length > 0 && showPlayInMatches && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {playInMatches.map((match) => {
                    const teamAPlayers = match.teamA?.teamPlayers?.map((tp: any) => 
                      `${tp.player?.firstName || ''} ${tp.player?.lastName || ''}`.trim()
                    ).filter(Boolean) || []
                    const teamBPlayers = match.teamB?.teamPlayers?.map((tp: any) => 
                      `${tp.player?.firstName || ''} ${tp.player?.lastName || ''}`.trim()
                    ).filter(Boolean) || []
                    
                    return (
                    <div key={match.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="mb-2">
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-sm font-medium">
                            [{match.teamA.seed || '?'}] {getTeamDisplayName(match.teamA, currentDivision?.teamKind)}
                          </div>
                          <div className="text-sm text-gray-500">vs</div>
                          <div className="text-sm font-medium">
                            [{match.teamB.seed || '?'}] {getTeamDisplayName(match.teamB, currentDivision?.teamKind)}
                          </div>
                        </div>
                        {(teamAPlayers.length > 0 || teamBPlayers.length > 0) && currentDivision?.teamKind !== 'SINGLES_1v1' && (
                          <div className="flex justify-between mt-0.5">
                            <div className="text-xs text-gray-500">
                              {teamAPlayers.map((player: any, idx: number) => (
                                <div key={idx}>{player}</div>
                              ))}
                            </div>
                            <div className="text-xs text-gray-500 text-right">
                              {teamBPlayers.map((player: any, idx: number) => (
                                <div key={idx}>{player}</div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {(() => {
                        const isMLP = tournament?.format === 'MLP'
                        const matchGamesCount = match.gamesCount || (match.games?.length || 0)
                        const isMLPMatch = isMLP && matchGamesCount === 4
                        
                        // For MLP matches, show games won count
                        if (isMLPMatch && match.games && match.games.length === 4) {
                          const { teamAWins, teamBWins } = countMLPGamesWon(match)
                          const hasAnyScore = match.games.some((g: any) => 
                            (g.scoreA !== null && g.scoreA !== undefined) || (g.scoreB !== null && g.scoreB !== undefined)
                          )
                          
                          if (hasAnyScore) {
                            return (
                              <div className="text-center space-y-2">
                                <div className="text-lg font-bold">
                                  Games: {teamAWins} - {teamBWins}
                                </div>
                                {match.tiebreaker && (
                                  <div className="text-xs text-orange-600 font-medium">
                                    Tiebreaker: {match.tiebreaker.teamAScore} - {match.tiebreaker.teamBScore}
                                  </div>
                                )}
                                {match.winnerTeamId && (
                                  <div className="text-sm text-green-600 font-medium">
                                    Winner: {match.winnerTeamId === match.teamAId ? getTeamDisplayName(match.teamA, currentDivision?.teamKind) : getTeamDisplayName(match.teamB, currentDivision?.teamKind)}
                                  </div>
                                )}
                                {renderScoreActionButton(match)}
                                {renderLockedNote(match)}
                              </div>
                            )
                          }
                        }
                        
                        // For non-MLP matches, show first game score
                        if (match.games && match.games.length > 0 && match.games[0] && ((match.games[0].scoreA !== null && match.games[0].scoreA !== undefined && match.games[0].scoreA > 0) || (match.games[0].scoreB !== null && match.games[0].scoreB !== undefined && match.games[0].scoreB > 0))) {
                          return (
                            <div className="text-center space-y-2">
                              <div className="text-lg font-bold">
                                {match.games[0].scoreA ?? '-'} - {match.games[0].scoreB ?? '-'}
                              </div>
                              <div className="text-sm text-green-600 font-medium">
                                Winner: {match.games[0].winner === 'A' ? getTeamDisplayName(match.teamA, currentDivision?.teamKind) : getTeamDisplayName(match.teamB, currentDivision?.teamKind)}
                              </div>
                              {renderScoreActionButton(match)}
                              {renderLockedNote(match)}
                            </div>
                          )
                        }
                        
                        return (
                          <div className="text-center space-y-2">
                            {renderScoreActionButton(match)}
                            {renderLockedNote(match)}
                          </div>
                        )
                      })()}
                    </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Play-Off Block */}
        {!isIndyLeague && (
        <Card className={
          // Block if:
          // 1. RR is in progress AND not all matches completed (for both MLP and non-MLP)
          // 2. OR Play-In is needed and not completed (only for non-MLP)
          (currentStage === 'RR_IN_PROGRESS' && completedRRMatches.length !== rrMatches.length) || 
          (!isMLPTournament && needsPlayIn && completedPlayInMatches.length !== playInMatches.length)
            ? 'opacity-50 pointer-events-none' 
            : ''
        }>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center space-x-2">
                <Trophy className="h-5 w-5" />
                <span>Play-Off</span>
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPlayoffMatches(!showPlayoffMatches)}
                className="flex items-center space-x-2"
              >
                <span>{showPlayoffMatches ? 'Collapse' : 'Expand'}</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Play-Off Summary */}
            <div className="space-y-2">
              <p className="text-sm text-gray-600">
                Teams in division: {teamCount}. Target bracket size: {targetBracketSize}.
              </p>
              
              {/* Show different descriptions based on current stage */}
              {eliminationMatches.length === 0 ? (
                // No playoff matches yet
                needsPlayIn ? (
                  <p className="text-sm text-gray-600">
                    Play-In needed: {playInExcess * 2} teams (bottom {playInExcess * 2} seeds) for {playInExcess} Play-Off slots.
                  </p>
                ) : (
                  <p className="text-sm text-gray-600">
                    All teams advance to Play-Off directly.
                  </p>
                )
              ) : (
                // Playoff matches exist - show current stage info
                (() => {
                  const maxRound = Math.max(...eliminationMatches.map(m => m.roundIndex))
                  const currentRoundMatches = eliminationMatches.filter(m => m.roundIndex === maxRound)
                  const hasThirdPlaceMatch = currentRoundMatches.some(m => (m as any).note === 'Third Place Match')
                  const isFinalRound = currentRoundMatches.length === 2 && hasThirdPlaceMatch
                  
                  if (isFinalRound) {
                    return (
                      <p className="text-sm text-gray-600">
                        Final stage: 1st Place Match + 3rd Place Match
                      </p>
                    )
                  } else if (currentRoundMatches.length === 2) {
                    return (
                      <p className="text-sm text-gray-600">
                        Semi-Final stage: 2 matches
                      </p>
                    )
                  } else {
                    return (
                      <p className="text-sm text-gray-600">
                        Play-Off stage: {currentRoundMatches.length} match{currentRoundMatches.length > 1 ? 'es' : ''}
                      </p>
                    )
                  }
                })()
              )}
              
              <p className="text-sm text-gray-600">
                {eliminationMatches.length > 0 ? `${eliminationMatches.length} matches generated` : 'No matches generated'}
              </p>
            </div>

            {/* Play-Off Buttons */}
            <div className="flex items-center space-x-2">
              {canGeneratePlayoff && (
                <Button
                  onClick={handleGeneratePlayoffs}
                  disabled={generatePlayoffsMutation.isPending || generatePlayoffAfterPlayInMutation.isPending}
                  className="flex items-center space-x-2"
                >
                  <Trophy className="h-4 w-4" />
                  <span>Generate Play-Off</span>
                </Button>
              )}
              
              {canGenerateNextRound() && (
                <Button
                  onClick={handleGenerateNextRound}
                  disabled={generateNextPlayoffRoundMutation.isPending}
                  className="flex items-center space-x-2 bg-green-600 hover:bg-green-700"
                >
                  <Trophy className="h-4 w-4" />
                  <span>Next Round</span>
                </Button>
              )}
              
              {eliminationMatches.length > 0 && (
                <>
                  <Button
                    onClick={() => setShowPlayoffSwapModal(true)}
                    variant="outline"
                    disabled={hasPlayoffResults}
                    className="flex items-center space-x-2 text-blue-600 border-blue-600 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Edit3 className="h-4 w-4" />
                    <span>Edit Play-off Pairs</span>
                  </Button>
                  
                  <Button
                    onClick={() => handleRegenerate('playoff')}
                    variant="outline"
                    className="flex items-center space-x-2 text-red-600 border-red-600 hover:bg-red-50"
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span>Regenerate Play-Off</span>
                  </Button>
                </>
              )}
            </div>

            {/* Block if Play-In in progress */}
            {needsPlayIn && completedPlayInMatches.length !== playInMatches.length && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Complete Play-In to generate Play-Off.
                </AlertDescription>
              </Alert>
            )}

            {/* Play-Off Matches List */}
            {eliminationMatches.length > 0 && showPlayoffMatches && (
              <div className="space-y-6">
                {/* Group matches by rounds */}
                {Array.from({ length: Math.max(...eliminationMatches.map(m => m.roundIndex)) + 1 }, (_, roundIndex) => {
                  const roundMatches = eliminationMatches.filter(m => m.roundIndex === roundIndex)
                  if (roundMatches.length === 0) return null
                  
                  const roundName = (() => {
                    // Check if this round has a third place match
                    const hasThirdPlaceMatch = roundMatches.some(m => m.note === 'Third Place Match')
                    
                    if (roundMatches.length === 2 && !hasThirdPlaceMatch) {
                      // 2 matches without third place = Semi-Final
                      return 'Semi-Final'
                    } else if (roundMatches.length === 2 && hasThirdPlaceMatch) {
                      // 2 matches with third place = Final & 3rd Place
                      return 'Final & 3rd Place'
                    } else if (roundMatches.length === 1) {
                      // 1 match = Final
                      return 'Final'
                    } else {
                      // Other cases
                      return `Round ${roundIndex + 1}`
                    }
                  })()
                  
                  return (
                    <div key={roundIndex} className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-lg">{roundName}</h4>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {roundMatches.map((match) => {
                          // Check if this is a third place match
                          const isThirdPlace = match.note === 'Third Place Match'
                          // Check if this is a final match (1 match in final round or 2 matches where this is not third place)
                          const isFinalMatch = roundMatches.length === 1 || (roundMatches.length === 2 && !isThirdPlace)
                          
                          return (
                            <div key={match.id} className={`border border-gray-200 rounded-lg p-4 ${
                              // Only apply colors to Final round matches
                              roundName === 'Final & 3rd Place' 
                                ? (isThirdPlace ? 'bg-orange-50 border-orange-200' : 'bg-blue-50 border-blue-200')
                                : 'bg-white'
                            }`}>
                              {/* Only show place labels in Final round */}
                              {roundName === 'Final & 3rd Place' && isThirdPlace && (
                                <div className="text-xs text-orange-600 font-medium mb-2 text-center">
                                  3rd Place Match
                                </div>
                              )}
                              {roundName === 'Final & 3rd Place' && isFinalMatch && !isThirdPlace && (
                                <div className="text-xs text-blue-600 font-medium mb-2 text-center">
                                  1st Place Match
                                </div>
                              )}
                              {(() => {
                                const teamAPlayers = match.teamA?.teamPlayers?.map((tp: any) => 
                                  `${tp.player?.firstName || ''} ${tp.player?.lastName || ''}`.trim()
                                ).filter(Boolean) || []
                                const teamBPlayers = match.teamB?.teamPlayers?.map((tp: any) => 
                                  `${tp.player?.firstName || ''} ${tp.player?.lastName || ''}`.trim()
                                ).filter(Boolean) || []
                                
                                return (
                                  <div className="mb-2">
                                    <div className="flex items-center justify-between mb-1">
                                      <div className="text-sm font-medium">
                                        {getTeamDisplayName(match.teamA, currentDivision?.teamKind)}
                                      </div>
                                      <div className="text-sm text-gray-500">vs</div>
                                      <div className="text-sm font-medium">
                                        {getTeamDisplayName(match.teamB, currentDivision?.teamKind)}
                                      </div>
                                    </div>
                                    {(teamAPlayers.length > 0 || teamBPlayers.length > 0) && currentDivision?.teamKind !== 'SINGLES_1v1' && (
                                      <div className="flex justify-between mt-0.5">
                                        <div className="text-xs text-gray-500">
                                          {teamAPlayers.map((player: any, idx: number) => (
                                            <div key={idx}>{player}</div>
                                          ))}
                                        </div>
                                        <div className="text-xs text-gray-500 text-right">
                                          {teamBPlayers.map((player: any, idx: number) => (
                                            <div key={idx}>{player}</div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )
                              })()}
                            
                            {(() => {
                              const isMLP = tournament?.format === 'MLP'
                              const matchGamesCount = match.gamesCount || (match.games?.length || 0)
                              const isMLPMatch = isMLP && matchGamesCount === 4
                              
                              // For MLP matches, show all 4 games scores
                              if (isMLPMatch && match.games && match.games.length === 4) {
                                const allGamesCompleted = match.games.every((g: any) => 
                                  (g.scoreA !== null && g.scoreA !== undefined && g.scoreA > 0) || (g.scoreB !== null && g.scoreB !== undefined && g.scoreB > 0) && g.scoreA !== g.scoreB
                                )
                                
                                if (allGamesCompleted) {
                                  // Count wins
                                  let teamAWins = 0
                                  let teamBWins = 0
                                  for (const game of match.games) {
                                    if (game.winner === 'A') {
                                      teamAWins++
                                    } else if (game.winner === 'B') {
                                      teamBWins++
                                    } else {
                                      if (game.scoreA !== null && game.scoreB !== null && game.scoreA > game.scoreB) {
                                        teamAWins++
                                      } else if (game.scoreA !== null && game.scoreB !== null && game.scoreB > game.scoreA) {
                                        teamBWins++
                                      }
                                    }
                                  }
                                  
                                  const needsTie = teamAWins === 2 && teamBWins === 2 && !match.winnerTeamId && !match.tiebreaker
                                  
                                  return (
                                    <div className="text-center space-y-2">
                                      <div className="text-sm font-medium text-gray-700 mb-1">
                                        Games: {teamAWins} - {teamBWins}
                                      </div>
                                      {match.tiebreaker && (
                                        <div className="text-xs text-orange-600 font-medium mb-1">
                                          Tiebreaker: {match.tiebreaker.teamAScore} - {match.tiebreaker.teamBScore}
                                        </div>
                                      )}
                                      {needsTie && (
                                        <div className="text-xs text-orange-600 font-medium mb-1">
                                          Tiebreaker required
                                        </div>
                                      )}
                                      {match.winnerTeamId && !needsTie && (
                                        <div className="text-sm text-green-600 font-medium">
                                          Winner: {match.winnerTeamId === match.teamAId ? getTeamDisplayName(match.teamA, currentDivision?.teamKind) : getTeamDisplayName(match.teamB, currentDivision?.teamKind)}
                                        </div>
                                      )}
                                      {renderScoreActionButton(match)}
                                      {renderLockedNote(match)}
                                    </div>
                                  )
                                }
                              }
                              
                              // For non-MLP or incomplete matches, show standard display
                              if (match.games && match.games.length > 0 && match.games[0] && ((match.games[0].scoreA !== null && match.games[0].scoreA !== undefined && match.games[0].scoreA > 0) || (match.games[0].scoreB !== null && match.games[0].scoreB !== undefined && match.games[0].scoreB > 0))) {
                                return (
                                  <div className="text-center space-y-2">
                                    <div className="text-lg font-bold">
                                      {match.games[0].scoreA ?? '-'} - {match.games[0].scoreB ?? '-'}
                                    </div>
                                    {match.winnerTeamId && (
                                      <div className="text-sm text-green-600 font-medium">
                                        Winner: {match.winnerTeamId === match.teamAId ? getTeamDisplayName(match.teamA, currentDivision?.teamKind) : getTeamDisplayName(match.teamB, currentDivision?.teamKind)}
                                      </div>
                                    )}
                                    {renderScoreActionButton(match)}
                                    {renderLockedNote(match)}
                                  </div>
                                )
                              }
                              
                              return (
                                <div className="text-center space-y-2">
                                  {renderScoreActionButton(match)}
                                  {renderLockedNote(match)}
                                </div>
                              )
                            })()}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
            )}
          </>
        )}
      </div>

      {/* Score input modal */}
      {!isIndyLeague && showScoreModal && selectedMatch && (() => {
        const isMLP = tournament?.format === 'MLP'
        const matchGamesCount = selectedMatch.gamesCount || (selectedMatch.games?.length || 0)
        const isMLPMatch = isMLP && matchGamesCount === 4

        // Extract players with DUPR info
        // Note: Player model only has 'dupr' field (string), not 'duprId' or 'duprNumericId'
        const teamAPlayers = selectedMatch.teamA?.teamPlayers?.map((tp: any) => ({
          id: tp.player?.id || '',
          firstName: tp.player?.firstName || '',
          lastName: tp.player?.lastName || '',
          duprId: tp.player?.dupr || null, // Player.dupr is the DUPR ID string
          duprNumericId: null, // Player model doesn't have numeric ID
        })) || []
        const teamBPlayers = selectedMatch.teamB?.teamPlayers?.map((tp: any) => ({
          id: tp.player?.id || '',
          firstName: tp.player?.firstName || '',
          lastName: tp.player?.lastName || '',
          duprId: tp.player?.dupr || null, // Player.dupr is the DUPR ID string
          duprNumericId: null, // Player model doesn't have numeric ID
        })) || []

        if (isMLPMatch) {
          return (
            <MLPScoreInputModal
              isOpen={showScoreModal}
              onClose={handleScoreModalClose}
              matchId={selectedMatch.id}
              teamAName={getTeamDisplayName(selectedMatch.teamA, currentDivision?.teamKind)}
              teamBName={getTeamDisplayName(selectedMatch.teamB, currentDivision?.teamKind)}
              poolName={selectedMatch.teamA.pool?.name}
              existingGames={selectedMatch.games?.map((g: any) => ({
                index: g.index,
                scoreA: g.scoreA ?? null,
                scoreB: g.scoreB ?? null,
                gameType: g.gameType,
              })) || []}
              onSuccess={() => {
                refetchDivision()
                refetchTournament()
              }}
              teamAPlayers={teamAPlayers}
              teamBPlayers={teamBPlayers}
              allowDuprSubmission={tournament?.allowDuprSubmission || false}
              duprSubmissionStatus={selectedMatch.duprSubmissionStatus}
              onRetryDuprSubmission={() => handleRetryDuprSubmission(selectedMatch.id)}
            />
          )
        }

        // Don't show for Indy League if we have selectedIndyGame (use separate modal)
        if (isIndyLeague && selectedIndyGame) {
          return null
        }

        return (
          <ScoreInputModal
            isOpen={showScoreModal}
            onClose={handleScoreModalClose}
            onSubmit={(scoreA, scoreB, sendToDupr) => {
              handleScoreSubmit(selectedMatch.id, [{ scoreA, scoreB }], sendToDupr)
            }}
            teamAName={getTeamDisplayName(selectedMatch.teamA, currentDivision?.teamKind)}
            teamBName={getTeamDisplayName(selectedMatch.teamB, currentDivision?.teamKind)}
            poolName={selectedMatch.teamA.pool?.name}
            isLoading={updateMatchResultMutation.isPending}
            teamAPlayers={teamAPlayers}
            teamBPlayers={teamBPlayers}
            teamKind={currentDivision?.teamKind}
            allowDuprSubmission={tournament?.allowDuprSubmission || false}
            duprSubmissionStatus={selectedMatch.duprSubmissionStatus}
            existingScoreA={selectedMatch.games?.[0]?.scoreA ?? null}
            existingScoreB={selectedMatch.games?.[0]?.scoreB ?? null}
            onRetryDuprSubmission={() => handleRetryDuprSubmission(selectedMatch.id)}
          />
        )
      })()}

      {/* Indy League Game Score Modal */}
      {isIndyLeague && selectedIndyGame && (
        <ScoreInputModal
          isOpen={showScoreModal}
          onClose={() => {
            setShowScoreModal(false)
            setSelectedIndyGame(null)
          }}
          onSubmit={(scoreA, scoreB) => {
            const { game } = selectedIndyGame
            handleGameScoreChange(game.id, scoreA, scoreB)
            setShowScoreModal(false)
            setSelectedIndyGame(null)
          }}
          teamAName={selectedIndyGame.matchup.homeTeam.name}
          teamBName={selectedIndyGame.matchup.awayTeam.name}
          poolName={`Game ${selectedIndyGame.game.order} • Court ${selectedIndyGame.game.court}`}
          existingScoreA={selectedIndyGame.game.homeScore ?? null}
          existingScoreB={selectedIndyGame.game.awayScore ?? null}
          isLoading={updateGameScore.isPending}
        />
      )}

      {/* Playoff swap modal */}
      {showPlayoffSwapModal && (() => {
        // Get only teams that participate in Play-Off
        const playoffTeamIds = new Set<string>()
        eliminationMatches.forEach(match => {
          playoffTeamIds.add(match.teamAId)
          playoffTeamIds.add(match.teamBId)
        })
        const playoffTeams = teams.filter(team => playoffTeamIds.has(team.id))

        return (
          <PlayoffSwapModal
            isOpen={showPlayoffSwapModal}
            onClose={() => setShowPlayoffSwapModal(false)}
            onSubmit={handleSwapPlayoffTeams}
            matches={eliminationMatches.map(match => ({
              id: match.id,
              teamA: { id: match.teamAId, name: getTeamDisplayName(match.teamA, currentDivision?.teamKind) },
              teamB: { id: match.teamBId, name: getTeamDisplayName(match.teamB, currentDivision?.teamKind) }
            }))}
            teams={playoffTeams.map(team => ({ id: team.id, name: team.name }))}
            isLoading={swapPlayoffTeamsMutation.isPending}
            title="Edit Play-off Pairs"
            teamKind={currentDivision?.teamKind}
          />
        )
      })()}

      {/* RR swap modal */}
      {!isIndyLeague && showEditRRPairsModal && (
        <PlayoffSwapModal
          isOpen={showEditRRPairsModal}
          onClose={() => setShowEditRRPairsModal(false)}
          onSubmit={handleSwapRRTeams}
          matches={rrMatches.map(match => ({
            id: match.id,
            teamA: { id: match.teamAId, name: getTeamDisplayName(match.teamA, currentDivision?.teamKind) },
            teamB: { id: match.teamBId, name: getTeamDisplayName(match.teamB, currentDivision?.teamKind) }
          }))}
          teams={teams.map(team => ({ id: team.id, name: team.name }))}
          isLoading={swapPlayoffTeamsMutation.isPending}
          title="Edit RR Pairs"
          teamKind={currentDivision?.teamKind}
        />
      )}

      {/* Play-In swap modal */}
      {showEditPlayInPairsModal && (() => {
        // Get only teams that participate in Play-In (not auto-qualified)
        const playInTeamIds = new Set<string>()
        playInMatches.forEach(match => {
          playInTeamIds.add(match.teamAId)
          playInTeamIds.add(match.teamBId)
        })
        const playInTeams = teams.filter(team => playInTeamIds.has(team.id))

        return (
          <PlayoffSwapModal
            isOpen={showEditPlayInPairsModal}
            onClose={() => setShowEditPlayInPairsModal(false)}
            onSubmit={handleSwapPlayInTeams}
            matches={playInMatches.map(match => ({
              id: match.id,
              teamA: { id: match.teamAId, name: getTeamDisplayName(match.teamA, currentDivision?.teamKind) },
              teamB: { id: match.teamBId, name: getTeamDisplayName(match.teamB, currentDivision?.teamKind) }
            }))}
            teams={playInTeams.map(team => ({ id: team.id, name: team.name }))}
            isLoading={swapPlayoffTeamsMutation.isPending}
            title="Edit Play-In Pairs"
            teamKind={currentDivision?.teamKind}
          />
        )
      })()}

      {/* Unmerge Division Modal */}
      {!isIndyLeague && showUnmergeModal && currentDivision && (
        <UnmergeDivisionModal
          isOpen={showUnmergeModal}
          onClose={() => setShowUnmergeModal(false)}
          mergedDivision={currentDivision as any}
          onSuccess={() => {
            refetchTournament()
            // Redirect to divisions page after unmerge
            router.push(`/admin/${tournamentId}/divisions`)
          }}
        />
      )}

      {/* Bracket Modal */}
      {!isIndyLeague && showBracketModal && selectedDivisionId && (
        <BracketModal
          isOpen={showBracketModal}
          onClose={() => setShowBracketModal(false)}
          divisionId={selectedDivisionId}
        />
      )}

      {/* Tiebreaker Modal */}
      {!isIndyLeague && showTiebreakerModal && selectedTiebreakerMatch && (() => {
        const teamAPlayers = selectedTiebreakerMatch.teamA?.teamPlayers?.map((tp: any) => ({
          id: tp.player?.id || '',
          firstName: tp.player?.firstName || '',
          lastName: tp.player?.lastName || '',
        })).filter((p: any) => p.id) || []
        
        const teamBPlayers = selectedTiebreakerMatch.teamB?.teamPlayers?.map((tp: any) => ({
          id: tp.player?.id || '',
          firstName: tp.player?.firstName || '',
          lastName: tp.player?.lastName || '',
        })).filter((p: any) => p.id) || []

        return (
          <TiebreakerModal
            isOpen={showTiebreakerModal}
            onClose={() => {
              setShowTiebreakerModal(false)
              setSelectedTiebreakerMatch(null)
            }}
            matchId={selectedTiebreakerMatch.id}
            teamAName={getTeamDisplayName(selectedTiebreakerMatch.teamA, currentDivision?.teamKind)}
            teamBName={getTeamDisplayName(selectedTiebreakerMatch.teamB, currentDivision?.teamKind)}
            teamAPlayers={teamAPlayers}
            teamBPlayers={teamBPlayers}
            existingTiebreaker={selectedTiebreakerMatch.tiebreaker ? {
              teamAScore: selectedTiebreakerMatch.tiebreaker.teamAScore,
              teamBScore: selectedTiebreakerMatch.tiebreaker.teamBScore,
              sequence: selectedTiebreakerMatch.tiebreaker.sequence as any,
            } : undefined}
            onSuccess={() => {
              refetchDivision()
              refetchTournament()
            }}
          />
        )
      })()}

      {/* Regeneration confirmation modal */}
      {!isIndyLeague && showRegenerateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">
              Regenerate {regenerateType === 'rr' ? 'Round Robin' : regenerateType === 'playin' ? 'Play-In' : 'Play-Off'}
            </h3>
            <p className="text-gray-600 mb-6">
              {regenerateType === 'rr' 
                ? 'All Round Robin matches will be reset. This will allow teams to be redistributed across pools and create new matches. Continue?'
                : regenerateType === 'playin' 
                  ? 'All Play-In and Play-Off matches will be reset. Play-In will be regenerated based on current Round Robin results. Continue?'
                  : (needsPlayIn && playInMatches.length > 0)
                    ? 'All Play-Off matches will be reset and regenerated based on current Play-In results. Continue?'
                    : 'All Play-Off matches will be reset and regenerated based on current Round Robin results. Continue?'
              }
            </p>
            <div className="flex justify-end space-x-3">
              <Button
                variant="outline"
                onClick={() => setShowRegenerateModal(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={confirmRegenerate}
              >
                Regenerate
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* DUPR Upload Log Modal */}
      <DuprUploadLogModal
        isOpen={showDuprUploadLog}
        onClose={() => setShowDuprUploadLog(false)}
        logEntries={duprUploadLog}
        isUploading={isUploadingToDupr}
      />
    </div>
  )
}

// Wrapper with Suspense to prevent hydration errors
export default function DivisionStageManagement() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <DivisionStageManagementContent />
    </Suspense>
  )
}
