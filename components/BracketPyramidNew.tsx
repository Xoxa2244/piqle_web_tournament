'use client'

import { useMemo } from 'react'
import {
  SingleEliminationBracket,
  MATCH_STATES,
  createTheme,
  type MatchType,
  type ParticipantType,
  type MatchComponentProps,
} from '@g-loot/react-tournament-brackets'

type MatchStatus = 'scheduled' | 'in_progress' | 'finished'

interface SeedSlot {
  seed: number
  teamId?: string
  teamName?: string
  isBye?: boolean
}

interface BracketMatch {
  id: string
  round: number // 0 = Play-In, 1..N
  position: number
  left: SeedSlot
  right: SeedSlot
  status: MatchStatus
  winnerSeed?: number
  winnerTeamId?: string
  winnerTeamName?: string
  nextMatchId?: string
  nextSlot?: 'left' | 'right'
  matchId?: string
  games?: Array<{ scoreA: number; scoreB: number }>
}

interface BracketPyramidNewProps {
  matches: BracketMatch[]
  showConnectingLines?: boolean
  onMatchClick?: (matchId: string) => void
  totalTeams?: number
  bracketSize?: number
}

type ExtendedParticipant = ParticipantType & {
  seedNumber?: number
  teamName?: string
  isByeSlot?: boolean
  isUnknown?: boolean
}

interface SeedMatchProps extends MatchComponentProps {
  originalMatch?: BracketMatch
  externalOnMatchClick?: (match: BracketMatch) => void
}

const DEFAULT_START_TIME = '2024-01-01T00:00:00.000Z'

const bracketTheme = createTheme({
  canvasBackground: 'transparent',
  textColor: {
    main: '#111827',
    highlighted: '#111827',
    dark: '#111827',
    disabled: '#9CA3AF',
  },
  border: {
    color: '#D1D5DB',
    highlightedColor: '#60A5FA',
  },
  roundHeaders: {
    background: 'transparent',
  },
  matchBackground: {
    wonColor: '#DCFCE7',
    lostColor: '#E0E7FF',
  },
  score: {
    text: {
      highlightedWonColor: '#166534',
      highlightedLostColor: '#1D4ED8',
    },
    background: {
      wonColor: '#DCFCE7',
      lostColor: '#DBEAFE',
    },
  },
})

const getRoundName = (round: number, maxRound: number, hasPlayIn: boolean): string => {
  if (hasPlayIn && round === 0) return 'Play-In'

  const roundsFromEnd = maxRound - round
  const teamsInRound = Math.pow(2, roundsFromEnd + 1)

  if (teamsInRound === 2) return 'Final'
  if (teamsInRound === 4) return 'Semi-Finals'
  if (teamsInRound === 8) return 'Quarter-Finals'
  if (teamsInRound === 16) return 'Round of 16'
  if (teamsInRound === 32) return 'Round of 32'

  return teamsInRound > 1 ? `Round of ${teamsInRound}` : `Round ${round}`
}

const buildParticipant = (
  match: BracketMatch,
  slot: SeedSlot,
  slotKey: 'top' | 'bottom'
): ExtendedParticipant => {
  const hasSeed = slot.seed > 0
  const isUnknown = !slot.isBye && (!hasSeed || (!slot.teamId && !slot.teamName))
  const label = slot.isBye
    ? hasSeed
      ? `#${slot.seed}`
      : 'BYE'
    : hasSeed
    ? `#${slot.seed}`
    : '?'

  const participantId = slot.teamId ?? `${match.id}-${slotKey}`

  const participant: ExtendedParticipant = {
    id: participantId,
    name: label,
    seedNumber: hasSeed ? slot.seed : undefined,
    teamName: slot.teamName,
    isByeSlot: !!slot.isBye,
    isUnknown,
  }

  if (slot.isBye) {
    participant.status = MATCH_STATES.WALK_OVER
  } else if (isUnknown) {
    participant.status = MATCH_STATES.NO_PARTY
  } else if (match.status === 'finished') {
    participant.status = MATCH_STATES.PLAYED
  }

  if (match.status === 'finished') {
    const isWinner =
      (slot.seed > 0 && slot.seed === match.winnerSeed) ||
      (!!slot.teamId && slot.teamId === match.winnerTeamId)
    participant.isWinner = isWinner
    participant.resultText = isWinner ? 'W' : undefined
  }

  return participant
}

const mapMatchesToBracket = (
  matches: BracketMatch[]
): { converted: MatchType[]; originalMap: Map<string, BracketMatch>; roundLabels: Map<number, string> } => {
  const originalMap = new Map<string, BracketMatch>()
  matches.forEach(match => originalMap.set(match.id, match))

  if (matches.length === 0) {
    return { converted: [], originalMap, roundLabels: new Map() }
  }

  const maxRound = Math.max(...matches.map(match => match.round))
  const hasPlayIn = matches.some(match => match.round === 0)

  const roundLabels = new Map<number, string>()
  for (let round = hasPlayIn ? 0 : 1; round <= maxRound; round++) {
    roundLabels.set(round, getRoundName(round, maxRound, hasPlayIn))
  }

  const matchesByRound = new Map<number, BracketMatch[]>()
  matches.forEach(match => {
    if (!matchesByRound.has(match.round)) {
      matchesByRound.set(match.round, [])
    }
    matchesByRound.get(match.round)!.push(match)
  })

  matchesByRound.forEach(roundMatches => roundMatches.sort((a, b) => a.position - b.position))

  const converted = matches.map(match => {
    const nextMatchId = (() => {
      if (match.nextMatchId) return match.nextMatchId
      const nextRoundMatches = matchesByRound.get(match.round + 1)
      if (!nextRoundMatches || nextRoundMatches.length === 0) {
        return null
      }
      const fallback = nextRoundMatches.find(next => next.position === Math.floor(match.position / 2))
      return fallback ? fallback.id : null
    })()

    const participants: ParticipantType[] = [
      buildParticipant(match, match.left, 'top'),
      buildParticipant(match, match.right, 'bottom'),
    ]

    const state = match.status === 'finished' ? MATCH_STATES.SCORE_DONE : 'SCHEDULED'

    return {
      id: match.id,
      name: `${roundLabels.get(match.round) || 'Round'} - Match ${match.position + 1}`,
      nextMatchId,
      tournamentRoundText: roundLabels.get(match.round) || String(match.round),
      startTime: DEFAULT_START_TIME,
      state,
      participants,
      originalMatchId: match.id,
    }
  })

  return { converted, originalMap, roundLabels }
}

const SeedMatch = ({
  match,
  topParty,
  bottomParty,
  topWon,
  bottomWon,
  onMatchClick,
  onPartyClick,
  externalOnMatchClick,
  originalMatch,
}: SeedMatchProps) => {
  const renderCircle = (party: ExtendedParticipant, won: boolean, position: 'top' | 'bottom') => {
    const seed = party.seedNumber
    const display = seed ? seed : party.name || '?'
    const isBye = party.isByeSlot
    const isUnknown = party.isUnknown

    const baseClasses = [
      'flex items-center justify-center rounded-full border-2 text-sm font-semibold transition-all',
      'h-11 w-11',
      won ? 'bg-green-100 border-green-500 text-green-700' : '',
      !won && !isBye && !isUnknown ? 'bg-blue-50 border-blue-300 text-blue-900' : '',
      isBye ? 'bg-white border-gray-300 text-gray-400 opacity-50' : '',
      isUnknown ? 'bg-white border-gray-300 text-gray-400' : '',
    ]

    const titleParts = []
    if (seed) titleParts.push(`#${seed}`)
    if (party.teamName) titleParts.push(party.teamName)
    if (isBye) titleParts.push('BYE')

    const title = titleParts.join(' – ')

    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      onMatchClick?.({ match, topWon, bottomWon, event: event as unknown as React.MouseEvent<HTMLAnchorElement> })
      if (originalMatch && externalOnMatchClick) {
        externalOnMatchClick(originalMatch)
      }
      const partyWon = position === 'top' ? topWon : bottomWon
      onPartyClick?.(party, partyWon)
    }

    return (
      <button
        key={party.id}
        type="button"
        className="focus:outline-none"
        onClick={handleClick}
        disabled={isUnknown && !originalMatch}
        title={title || undefined}
      >
        <div className={baseClasses.join(' ')}>
          {display}
        </div>
      </button>
    )
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {renderCircle(topParty as ExtendedParticipant, topWon, 'top')}
      <div className="h-6 w-px bg-gray-300" />
      {renderCircle(bottomParty as ExtendedParticipant, bottomWon, 'bottom')}
    </div>
  )
}

export default function BracketPyramidNew({
  matches,
  showConnectingLines = true,
  onMatchClick,
}: BracketPyramidNewProps) {
  const { converted: bracketMatches, originalMap, roundLabels } = useMemo(() => mapMatchesToBracket(matches), [matches])

  const legend = useMemo(() => {
    const seedMap = new Map<number, string>()

    matches.forEach(match => {
      const maybeStore = (slot: SeedSlot) => {
        if (slot.seed > 0 && !slot.isBye) {
          if (slot.teamName) {
            seedMap.set(slot.seed, slot.teamName)
          } else if (!seedMap.has(slot.seed)) {
            seedMap.set(slot.seed, '?')
          }
        }
      }

      maybeStore(match.left)
      maybeStore(match.right)

      if (match.status === 'finished' && match.winnerSeed) {
        if (match.winnerTeamName) {
          seedMap.set(match.winnerSeed, match.winnerTeamName)
        } else if (!seedMap.has(match.winnerSeed)) {
          seedMap.set(match.winnerSeed, '?')
        }
      }
    })

    return Array.from(seedMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([seed, name]) => ({ seed, name }))
  }, [matches])

  if (matches.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">Bracket not started yet</p>
        <p className="text-sm text-gray-400">Matches will appear here once bracket begins</p>
      </div>
    )
  }

  const handleExternalMatchClick = (match: BracketMatch) => {
    onMatchClick?.(match.matchId || match.id)
  }

  return (
    <div className="w-full">
      <div className="overflow-auto max-h-[75vh]">
        <SingleEliminationBracket
          matches={bracketMatches}
          matchComponent={(props) => (
            <SeedMatch
              {...props}
              originalMatch={originalMap.get(String(props.match.id))}
              externalOnMatchClick={handleExternalMatchClick}
            />
          )}
          options={{
            style: {
              connectorColor: showConnectingLines ? '#CBD5F5' : 'transparent',
              connectorColorHighlight: '#60A5FA',
              spaceBetweenColumns: 120,
              spaceBetweenRows: 32,
              roundHeader: {
                isShown: true,
                height: 36,
                marginBottom: 16,
                fontSize: 14,
                fontColor: '#111827',
                backgroundColor: 'transparent',
                roundTextGenerator: (currentRoundNumber: number) => {
                  const label = Array.from(roundLabels.values())[currentRoundNumber - 1]
                  return label ?? `Round ${currentRoundNumber}`
                },
              },
            },
          }}
          theme={bracketTheme}
        />
      </div>

      {legend.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Legend</h3>
          <div className="border border-gray-200 rounded-lg p-4 bg-white inline-block">
            <table className="min-w-[220px]">
              <tbody>
                {legend.map(({ seed, name }) => (
                  <tr key={seed} className="border-b last:border-b-0">
                    <td className="py-1 pr-6 text-right font-semibold text-gray-900">#{seed}</td>
                    <td className="py-1 text-left text-gray-600">{name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

