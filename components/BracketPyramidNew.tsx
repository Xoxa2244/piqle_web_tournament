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

const getEffectiveBracketSize = (
  matches: BracketMatch[],
  totalTeams?: number,
  bracketSizeProp?: number
) => {
  if (bracketSizeProp && bracketSizeProp > 1) {
    const normalized = Math.pow(2, Math.ceil(Math.log2(bracketSizeProp)))
    return normalized
  }

  const seeds = new Set<number>()
  matches.forEach(match => {
    if (match.left.seed > 0) seeds.add(match.left.seed)
    if (match.right.seed > 0) seeds.add(match.right.seed)
  })

  const inferred = Math.max(
    seeds.size > 0 ? Math.max(...Array.from(seeds)) : 1,
    totalTeams ?? 1,
    2
  )

  return Math.pow(2, Math.ceil(Math.log2(inferred)))
}

const mapMatchesToBracket = (
  matches: BracketMatch[],
  totalTeams?: number,
  bracketSizeProp?: number
): {
  converted: MatchType[]
  originalMap: Map<string, BracketMatch>
  roundLabels: Map<number, string>
  roundStats: Array<{ round: number; matchCount: number }>
  hasPlayIn: boolean
} => {
  const workingMatches = matches.map(match => ({
    ...match,
    left: { ...match.left },
    right: { ...match.right },
  }))

  const originalMap = new Map<string, BracketMatch>()
  workingMatches.forEach(match => originalMap.set(match.id, match))

  if (workingMatches.length === 0) {
    return {
      converted: [],
      originalMap,
      roundLabels: new Map(),
      roundStats: [],
      hasPlayIn: false,
    }
  }

  const hasPlayIn = workingMatches.some(match => match.round === 0)
  const effectiveBracketSize = getEffectiveBracketSize(workingMatches, totalTeams, bracketSizeProp)
  const mainRounds = Math.max(1, Math.round(Math.log2(effectiveBracketSize)))

  const matchesByRound = new Map<number, BracketMatch[]>()
  workingMatches.forEach(match => {
    if (!matchesByRound.has(match.round)) {
      matchesByRound.set(match.round, [])
    }
    matchesByRound.get(match.round)!.push(match)
  })

  matchesByRound.forEach(roundMatches => roundMatches.sort((a, b) => a.position - b.position))

  // Link play-in matches (round 0) to their target round 1 slots when available
  const playInMatches = matchesByRound.get(0) ?? []
  if (playInMatches.length > 0) {
    const round1Matches = matchesByRound.get(1) ?? []
    if (round1Matches.length > 0) {
      const seedTargetMap = new Map<number, { match: BracketMatch; slot: 'left' | 'right' }>()

      const registerSeedTarget = (seed: number | undefined, match: BracketMatch, slot: 'left' | 'right') => {
        if (typeof seed !== 'number' || !Number.isFinite(seed) || seed <= 0) return
        if (!seedTargetMap.has(seed)) {
          seedTargetMap.set(seed, { match, slot })
        }
      }

      round1Matches.forEach(match => {
        registerSeedTarget(match.left?.seed, match, 'left')
        registerSeedTarget(match.right?.seed, match, 'right')
      })

      const findSeedTarget = (seeds: number[]): { match: BracketMatch; slot: 'left' | 'right' } | undefined => {
        for (const seed of seeds) {
          const target = seedTargetMap.get(seed)
          if (target) return target
        }
        if (seeds.length === 0) return undefined
        const minSeed = Math.min(...seeds)
        return seedTargetMap.get(minSeed)
      }

      playInMatches.forEach(match => {
        const candidateSeeds = [match.left?.seed, match.right?.seed]
          .filter((seed): seed is number => Number.isFinite(seed) && seed > 0)
        const target = findSeedTarget(candidateSeeds)
        if (!target) {
          if (process.env.NODE_ENV !== 'production') {
            // eslint-disable-next-line no-console
            console.warn('[BracketPyramidNew] Unable to link play-in match to round 1 slot', {
              matchId: match.id,
              seeds: candidateSeeds,
            })
          }
          return
        }

        match.nextMatchId = target.match.id
        match.nextSlot = target.slot

        // If the round 1 match was marked as finished because of a BYE, reset it to scheduled.
        if (target.match.status === 'finished' && (!target.match.games || target.match.games.length === 0)) {
          target.match.status = 'scheduled'
          target.match.winnerSeed = undefined
          target.match.winnerTeamId = undefined
          target.match.winnerTeamName = undefined
        }

        if (target.slot === 'left') {
          target.match.left = {
            ...target.match.left,
            isBye: false,
          }
        } else {
          target.match.right = {
            ...target.match.right,
            isBye: false,
          }
        }
      })
    }
  }

  for (let round = 1; round <= mainRounds; round++) {
    const expectedMatches = Math.max(1, Math.round(effectiveBracketSize / Math.pow(2, round)))
    const existing = matchesByRound.get(round) ?? []
    const normalizedRound: BracketMatch[] = new Array(expectedMatches)

    existing.forEach(match => {
      let targetIndex = Math.min(
        expectedMatches - 1,
        Math.max(0, Math.round(match.position ?? 0))
      )
      while (normalizedRound[targetIndex]) {
        targetIndex = (targetIndex + 1) % expectedMatches
      }
      match.position = targetIndex
      normalizedRound[targetIndex] = match
    })

    for (let i = 0; i < expectedMatches; i++) {
      if (!normalizedRound[i]) {
        normalizedRound[i] = {
          id: `placeholder-${round}-${i}`,
          round,
          position: i,
          left: { seed: 0, isBye: false },
          right: { seed: 0, isBye: false },
          status: 'scheduled',
        }
      }
    }

    matchesByRound.set(round, normalizedRound)
  }

  const allRoundIndices = Array.from(matchesByRound.keys())
  const maxRound = allRoundIndices.length > 0 ? Math.max(...allRoundIndices) : mainRounds

  for (let round = 0; round < maxRound; round++) {
    const currentRound = matchesByRound.get(round)
    const nextRound = matchesByRound.get(round + 1)
    if (!currentRound || !nextRound) continue

    currentRound.forEach((match, index) => {
      const targetMatch = nextRound[Math.floor(index / 2)]
      if (!targetMatch) return

      if (!match.nextMatchId) {
        match.nextMatchId = targetMatch.id
        match.nextSlot = index % 2 === 0 ? 'left' : 'right'
      }
    })
  }

  const sortedRounds = Array.from(matchesByRound.entries()).sort((a, b) => a[0] - b[0])
  const normalizedMatches: BracketMatch[] = []
  const roundStats: Array<{ round: number; matchCount: number }> = []
  sortedRounds.forEach(([roundIndex, roundMatches]) => {
    roundStats.push({ round: roundIndex, matchCount: roundMatches.length })
    roundMatches.forEach(match => {
      normalizedMatches.push(match)
    })
  })

  const roundLabels = new Map<number, string>()
  sortedRounds.forEach(([round]) => {
    roundLabels.set(round, getRoundName(round, maxRound, hasPlayIn))
  })

  const converted = normalizedMatches.map(match => {
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

  if (process.env.NODE_ENV !== 'production') {
    try {
      const normalizedDebug = normalizedMatches.map(match => ({
        id: match.id,
        round: match.round,
        position: match.position,
        nextMatchId: match.nextMatchId ?? null,
        nextExists: normalizedMatches.some(candidate => candidate.id === match.nextMatchId),
        leftSeed: match.left.seed,
        rightSeed: match.right.seed,
      }))
      // eslint-disable-next-line no-console
      console.log('[BracketPyramidNew] normalized matches table below')
      // eslint-disable-next-line no-console
      console.table(normalizedDebug)
      const lightweightConverted = converted.map(match => ({
        id: match.id,
        nextMatchId: match.nextMatchId ?? null,
        round: match.tournamentRoundText,
        participantNames: match.participants.map(p => {
          const participant = p as ExtendedParticipant
          const labelParts = [participant.name]
          if (participant.teamName) labelParts.push(`(${participant.teamName})`)
          if (participant.isByeSlot) labelParts.push('[BYE]')
          return labelParts.join(' ')
        }),
      }))
      // eslint-disable-next-line no-console
      console.log('[BracketPyramidNew] converted matches', JSON.stringify(lightweightConverted, null, 2))
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[BracketPyramidNew] Failed to log normalized matches', error)
    }
  }

  return { converted, originalMap, roundLabels, roundStats, hasPlayIn }
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
  totalTeams,
  bracketSize,
}: BracketPyramidNewProps) {
  const {
    converted: bracketMatches,
    originalMap,
    roundLabels,
    roundStats,
    hasPlayIn,
  } = useMemo(
    () => mapMatchesToBracket(matches, totalTeams, bracketSize),
    [matches, totalTeams, bracketSize]
  )

  if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.log('[BracketPyramidNew props] matches', JSON.stringify(matches, null, 2))
  }

  const totalRounds = roundStats.length
  const maxMatchesPerRound = roundStats.length > 0 ? Math.max(...roundStats.map(r => r.matchCount)) : 1
  const viewerWidth = Math.max(960, (totalRounds || 1) * 260)
  const viewerHeight = Math.max(640, maxMatchesPerRound * 140 + (hasPlayIn ? 120 : 0))

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
      <div className="h-[75vh] w-full overflow-auto">
        <div
          className="flex justify-center"
          style={{ minWidth: `${viewerWidth}px`, minHeight: `${viewerHeight}px` }}
        >
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
      </div>
    </div>
  )
}

