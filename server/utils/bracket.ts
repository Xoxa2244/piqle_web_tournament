// Bracket generation utilities according to TZ

export type MatchStatus = 'scheduled' | 'in_progress' | 'finished'

export interface SeedSlot {
  seed: number              // always present
  teamId?: string           // appears when match is assigned
  teamName?: string         // for UI - when team is known
  isBye?: boolean           // autopass
}

export interface BracketMatch {
  id: string
  round: number             // 0 = Play-In, 1..N
  position: number          // index within round from top to bottom
  left: SeedSlot
  right: SeedSlot
  status: MatchStatus
  winnerSeed?: number       // winner seed (reserve)
  winnerTeamId?: string     // winning team
  winnerTeamName?: string   // winning team name
  nextMatchId?: string      // where winner goes
  nextSlot?: 'left' | 'right'
  matchId?: string          // database match ID if exists
  games?: Array<{ scoreA: number; scoreB: number }>
}

// Calculate nearest power of 2
export const nextPow2 = (n: number): number => {
  if (n <= 0) return 1
  if (n === 1) return 1
  return 1 << Math.ceil(Math.log2(n))
}

// Calculate play-in spots needed
// Logic: If B < N && N < 2 * B, then play-in is needed
// E = N - B (number of play-in matches)
// Play-in teams: bottom 2E teams
// Direct qualified: top (N - 2E) teams
export const calculatePlayInSpots = (totalTeams: number, bracketSize: number): number => {
  if (totalTeams === bracketSize) return 0
  if (bracketSize < totalTeams && totalTeams < 2 * bracketSize) {
    return 2 * (totalTeams - bracketSize)  // 2E teams go to play-in
  }
  return 0
}

// Generate bracket pairs using standard seeding order
// Returns ordered pairs of seeds for Round 1 (classic bracket order: 1 vs N, 4 vs N-3, etc.)
// Works with any size, not just powers of 2
export function bracketPairs(size: number): [number, number][] {
  if (size <= 1) return []
  if (size === 2) return [[1, 2]]
  
  // Round up to nearest power of 2 for bracket structure
  const bracketPower = nextPow2(size)
  
  // Recursively expand bracket order
  function expand(arr: number[]): number[] {
    if (arr.length * 2 === bracketPower) return arr
    const next: number[] = []
    const s = arr.length * 2
    for (const a of arr) {
      next.push(a, s + 1 - a)
    }
    return expand(next)
  }
  
  const list = expand([1])
  const mirrored = list.map(x => bracketPower + 1 - x)
  const slots = list.flatMap((x, i) => [x, mirrored[i]])
  
  // Filter out pairs where both seeds are greater than actual size
  const pairs: [number, number][] = []
  for (let i = 0; i < slots.length; i += 2) {
    const seedA = slots[i]
    const seedB = slots[i + 1]
    // Only include pairs where at least one seed is within the actual size
    if (seedA <= size || seedB <= size) {
      pairs.push([seedA, seedB])
    }
  }
  
  return pairs
}

// Build Play-In matches (Round 0)
export function buildPlayInMatches(
  lowerSeeds: Array<{ seed: number; teamId?: string; teamName?: string }>,
  bracketSize: number
): BracketMatch[] {
  const matches: BracketMatch[] = []
  const E = lowerSeeds.length / 2  // Number of play-in matches
  
  // Pair lower seeds: first vs last, second vs second-last, etc.
  for (let i = 0; i < E; i++) {
    const seedA = lowerSeeds[i]
    const seedB = lowerSeeds[lowerSeeds.length - 1 - i]
    
    matches.push({
      id: `playin-${i}`,
      round: 0,
      position: i,
      left: {
        seed: seedA.seed,
        teamId: seedA.teamId,
        teamName: seedA.teamName,
        isBye: false,
      },
      right: {
        seed: seedB.seed,
        teamId: seedB.teamId,
        teamName: seedB.teamName,
        isBye: false,
      },
      status: seedA.teamId && seedB.teamId ? 'scheduled' : 'scheduled',
    })
  }
  
  return matches
}

// Build Round 1 matches with proper seeding distribution
export function buildRound1Matches(
  upperSeeds: Array<{ seed: number; teamId?: string; teamName?: string }>,
  playInWinners: Array<{ seed: number; teamId?: string; teamName?: string }>,
  bracketSize: number,
  playInSpots: number
): BracketMatch[] {
  console.log('[buildRound1Matches] Starting with:', {
    upperSeedsCount: upperSeeds.length,
    playInWinnersCount: playInWinners.length,
    bracketSize,
    playInSpots,
  })
  
  try {
    const matches: BracketMatch[] = []
    console.log('[buildRound1Matches] Calling bracketPairs with bracketSize:', bracketSize)
    const pairs = bracketPairs(bracketSize)
    console.log('[buildRound1Matches] bracketPairs returned:', pairs.length, 'pairs')
  
  // Combine all teams for Round 1: upper seeds + play-in winners
  // The order matters: upper seeds keep their seeds, play-in winners get assigned positions
  const allRound1Teams: Array<{ seed: number; teamId?: string; teamName?: string; isBye?: boolean }> = []
  
  // Add upper seeds (direct qualifiers) - they keep their original seeds
  upperSeeds.forEach(team => {
    allRound1Teams.push({ ...team, isBye: false })
  })
  
  // Add play-in winners - they get assigned positions after upper seeds
  // Play-in winners should be placed at positions that match bracket pairs
  // For example, if bracketSize=16, play-in winners go to specific positions
  playInWinners.forEach((winner) => {
    allRound1Teams.push({ ...winner, isBye: false })
  })
  
  // Create BYE slots for missing teams (if bracketSize > totalTeams)
  const totalTeams = allRound1Teams.length
  if (bracketSize > totalTeams) {
    const missing = bracketSize - totalTeams
    for (let i = 0; i < missing; i++) {
      const byeSeed = totalTeams + i + 1
      allRound1Teams.push({ seed: byeSeed, isBye: true })
    }
  }
  
  // Create a seed map for quick lookup
  // For bracket pairs, we need to map bracket positions to actual teams
  // The bracket pairs define the seed positions, and we need to fill them with actual teams
  const seedMap = new Map<number, { seed: number; teamId?: string; teamName?: string; isBye?: boolean }>()
  
  // For a bracket of size B, we need to assign teams to bracket positions
  // The bracketPairs function returns pairs like [1,16], [8,9], [4,13], etc.
  // We assign teams based on their seeds: seed 1 goes to position 1, seed 2 to position 2, etc.
  // But we need to handle the case where play-in winners don't have direct seeds
  
  // Simple approach: assign teams by their seed order
  // If a team has seed N, it goes to bracket position N (if within bracket size)
  allRound1Teams.forEach(team => {
    if (team.seed <= bracketSize) {
      seedMap.set(team.seed, team)
    }
  })
  
  // For play-in winners without explicit seeds matching bracket positions,
  // assign them to the remaining positions
  let positionIndex = 0
  for (let seed = 1; seed <= bracketSize; seed++) {
    if (!seedMap.has(seed)) {
      // Find next available team (play-in winner or BYE)
      while (positionIndex < allRound1Teams.length && seedMap.has(allRound1Teams[positionIndex].seed)) {
        positionIndex++
      }
      if (positionIndex < allRound1Teams.length) {
        const team = allRound1Teams[positionIndex]
        seedMap.set(seed, { ...team, seed: seed }) // Assign to bracket position
        positionIndex++
      } else {
        // Create BYE
        seedMap.set(seed, { seed: seed, isBye: true })
      }
    }
  }
  
    // Generate matches based on bracket pairs
    console.log('[buildRound1Matches] Generating matches from pairs...')
    for (let i = 0; i < pairs.length; i++) {
      const [seedA, seedB] = pairs[i]
      const teamA = seedMap.get(seedA)
      const teamB = seedMap.get(seedB)
      
      if (!teamA || !teamB) {
        console.warn(`[buildRound1Matches] Missing team for pair [${seedA}, ${seedB}]`)
        continue
      }
    
    // If one is BYE, the other automatically advances
    if (teamA.isBye) {
      matches.push({
        id: `round1-${i}`,
        round: 1,
        position: i,
        left: { seed: seedB, teamId: teamB.teamId, teamName: teamB.teamName, isBye: false },
        right: { seed: seedA, isBye: true },
        status: 'finished', // BYE is automatically finished
        winnerSeed: seedB,
        winnerTeamId: teamB.teamId,
        winnerTeamName: teamB.teamName,
      })
    } else if (teamB.isBye) {
      matches.push({
        id: `round1-${i}`,
        round: 1,
        position: i,
        left: { seed: seedA, teamId: teamA.teamId, teamName: teamA.teamName, isBye: false },
        right: { seed: seedB, isBye: true },
        status: 'finished', // BYE is automatically finished
        winnerSeed: seedA,
        winnerTeamId: teamA.teamId,
        winnerTeamName: teamA.teamName,
      })
    } else {
      matches.push({
        id: `round1-${i}`,
        round: 1,
        position: i,
        left: { seed: seedA, teamId: teamA.teamId, teamName: teamA.teamName, isBye: false },
        right: { seed: seedB, teamId: teamB.teamId, teamName: teamB.teamName, isBye: false },
        status: teamA.teamId && teamB.teamId ? 'scheduled' : 'scheduled',
      })
    }
  }
  
  return matches
}

// Build subsequent rounds recursively
export function buildSubsequentRounds(
  previousRoundMatches: BracketMatch[],
  roundNumber: number,
  totalRounds: number
): BracketMatch[] {
  const matches: BracketMatch[] = []
  const matchesInRound = previousRoundMatches.length / 2
  
  for (let i = 0; i < matchesInRound; i++) {
    const prevMatch1 = previousRoundMatches[i * 2]
    const prevMatch2 = previousRoundMatches[i * 2 + 1]
    
    const matchId = `round${roundNumber}-${i}`
    
    // Determine left and right slots
    let left: SeedSlot = { seed: 0, isBye: false }
    let right: SeedSlot = { seed: 0, isBye: false }
    
    if (prevMatch1.winnerTeamId) {
      left = {
        seed: prevMatch1.winnerSeed || 0,
        teamId: prevMatch1.winnerTeamId,
        teamName: prevMatch1.winnerTeamName,
        isBye: false,
      }
    } else if (prevMatch1.status === 'finished' && prevMatch1.left.isBye) {
      // BYE case - should not happen in subsequent rounds, but handle it
      left = prevMatch1.left
    } else {
      left = {
        seed: prevMatch1.left.seed || prevMatch1.right.seed || 0,
        isBye: false,
      }
    }
    
    if (prevMatch2.winnerTeamId) {
      right = {
        seed: prevMatch2.winnerSeed || 0,
        teamId: prevMatch2.winnerTeamId,
        teamName: prevMatch2.winnerTeamName,
        isBye: false,
      }
    } else if (prevMatch2.status === 'finished' && prevMatch2.right.isBye) {
      right = prevMatch2.right
    } else {
      right = {
        seed: prevMatch2.left.seed || prevMatch2.right.seed || 0,
        isBye: false,
      }
    }
    
    // Link previous matches to this one
    prevMatch1.nextMatchId = matchId
    prevMatch1.nextSlot = 'left'
    prevMatch2.nextMatchId = matchId
    prevMatch2.nextSlot = 'right'
    
    matches.push({
      id: matchId,
      round: roundNumber,
      position: i,
      left,
      right,
      status: left.teamId && right.teamId ? 'scheduled' : 'scheduled',
    })
  }
  
  return matches
}

// Build complete bracket structure
export function buildCompleteBracket(
  totalTeams: number,
  bracketSize: number,
  standings: Array<{ teamId: string; teamName: string; seed: number }>,
  playInMatches?: Array<{ id: string; winnerTeamId?: string; teamAId: string; teamBId: string }>,
  existingPlayoffMatches?: Array<{ id: string; roundIndex: number; teamAId: string; teamBId: string; winnerId?: string; games: Array<{ scoreA: number; scoreB: number }> }>
): BracketMatch[] {
  console.log('[buildCompleteBracket] Starting with:', {
    totalTeams,
    bracketSize,
    standingsCount: standings.length,
    playInMatchesCount: playInMatches?.length || 0,
    existingPlayoffMatchesCount: existingPlayoffMatches?.length || 0,
  })
  
  try {
    // Validate inputs
    if (!Number.isFinite(totalTeams) || totalTeams <= 0) {
      console.error('[buildCompleteBracket] Invalid totalTeams:', totalTeams)
      return []
    }
    
    if (!Number.isFinite(bracketSize) || bracketSize <= 0) {
      console.error('[buildCompleteBracket] Invalid bracketSize:', bracketSize)
      return []
    }
    
    if (!Array.isArray(standings) || standings.length === 0) {
      console.error('[buildCompleteBracket] Invalid standings:', standings)
      return []
    }
    
    console.log('[buildCompleteBracket] Inputs validated')
    
    const allMatches: BracketMatch[] = []
    console.log('[buildCompleteBracket] Calculating play-in spots...')
    const playInSpots = calculatePlayInSpots(totalTeams, bracketSize)
    const needsPlayIn = playInSpots > 0
    
    console.log('[buildCompleteBracket] Play-in calculation:', { playInSpots, needsPlayIn })
  
    // Separate teams into upper and lower seeds
    // Logic: If play-in is needed, E = N - B
    // Bottom 2E teams go to play-in
    // Top (N - 2E) teams directly qualify
    console.log('[buildCompleteBracket] Separating teams into upper and lower seeds...')
    const upperSeeds: Array<{ seed: number; teamId?: string; teamName?: string }> = []
    const lowerSeeds: Array<{ seed: number; teamId?: string; teamName?: string }> = []
    
    if (needsPlayIn) {
      console.log('[buildCompleteBracket] Play-in needed, calculating team distribution...')
      const E = totalTeams - bracketSize  // Number of play-in matches
      const playInTeamCount = 2 * E  // Bottom 2E teams
      
      standings.forEach((team) => {
        if (team.seed <= totalTeams - playInTeamCount) {
          upperSeeds.push({ seed: team.seed, teamId: team.teamId, teamName: team.teamName })
        } else {
          lowerSeeds.push({ seed: team.seed, teamId: team.teamId, teamName: team.teamName })
        }
      })
    } else {
      // All teams directly qualify
      console.log('[buildCompleteBracket] No play-in needed, all teams qualify directly')
      standings.forEach((team) => {
        upperSeeds.push({ seed: team.seed, teamId: team.teamId, teamName: team.teamName })
      })
    }
    
    console.log('[buildCompleteBracket] Team separation complete:', {
      upperSeedsCount: upperSeeds.length,
      lowerSeedsCount: lowerSeeds.length,
    })
  
  // Build Play-In matches if needed
  if (needsPlayIn && lowerSeeds.length > 0) {
    const playInBracketMatches = buildPlayInMatches(lowerSeeds, bracketSize)
    
    // Update with actual play-in match data if available
    if (playInMatches) {
      playInBracketMatches.forEach((match, index) => {
        const dbMatch = playInMatches.find(m => 
          (m.teamAId === match.left.teamId && m.teamBId === match.right.teamId) ||
          (m.teamAId === match.right.teamId && m.teamBId === match.left.teamId)
        )
        if (dbMatch) {
          match.matchId = dbMatch.id
          if (dbMatch.winnerTeamId) {
            match.status = 'finished'
            match.winnerTeamId = dbMatch.winnerTeamId
            match.winnerSeed = dbMatch.winnerTeamId === match.left.teamId ? match.left.seed : match.right.seed
            match.winnerTeamName = dbMatch.winnerTeamId === match.left.teamId ? match.left.teamName : match.right.teamName
          }
        }
      })
    }
    
    allMatches.push(...playInBracketMatches)
  }
  
  // Get play-in winners
  const playInWinners: Array<{ seed: number; teamId?: string; teamName?: string }> = []
  if (needsPlayIn && playInMatches) {
    playInMatches.forEach(match => {
      if (match.winnerTeamId) {
        const winnerStanding = standings.find(t => t.teamId === match.winnerTeamId)
        if (winnerStanding) {
          playInWinners.push({
            seed: winnerStanding.seed,
            teamId: winnerStanding.teamId,
            teamName: winnerStanding.teamName,
          })
        }
      }
    })
  }
  
    // Build Round 1 matches
    console.log('[buildCompleteBracket] Building Round 1 matches...')
    const round1Matches = buildRound1Matches(upperSeeds, playInWinners, bracketSize, playInSpots)
    console.log('[buildCompleteBracket] Round 1 matches built:', round1Matches.length)
    
      // Update with existing playoff match data
    // Note: roundIndex in DB: Round 1 = 0, Round 2 = 1, etc.
    // In our structure: Round 1 = 1, Round 2 = 2, etc.
    console.log('[buildCompleteBracket] Updating Round 1 matches with existing data...')
    if (existingPlayoffMatches) {
      round1Matches.forEach(match => {
        const dbMatch = existingPlayoffMatches.find(m => m.roundIndex === 0 && 
          ((m.teamAId === match.left.teamId && m.teamBId === match.right.teamId) ||
           (m.teamAId === match.right.teamId && m.teamBId === match.left.teamId))
        )
        if (dbMatch) {
          match.matchId = dbMatch.id
          if (dbMatch.games && dbMatch.games.length > 0) {
            match.games = dbMatch.games
            const totalScoreA = dbMatch.games.reduce((sum, g) => sum + g.scoreA, 0)
            const totalScoreB = dbMatch.games.reduce((sum, g) => sum + g.scoreB, 0)
            if (totalScoreA > 0 || totalScoreB > 0) {
              match.status = totalScoreA > totalScoreB || totalScoreB > totalScoreA ? 'finished' : 'in_progress'
              if (match.status === 'finished') {
                match.winnerTeamId = totalScoreA > totalScoreB ? dbMatch.teamAId : dbMatch.teamBId
                match.winnerSeed = match.winnerTeamId === match.left.teamId ? match.left.seed : match.right.seed
                match.winnerTeamName = match.winnerTeamId === match.left.teamId ? match.left.teamName : match.right.teamName
              }
            }
          }
          // Also check winnerId if available
          if (dbMatch.winnerId) {
            match.winnerTeamId = dbMatch.winnerId
            match.winnerSeed = match.winnerTeamId === match.left.teamId ? match.left.seed : match.right.seed
            match.winnerTeamName = match.winnerTeamId === match.left.teamId ? match.left.teamName : match.right.teamName
            match.status = 'finished'
          }
        }
      })
    }
    
    allMatches.push(...round1Matches)
    console.log('[buildCompleteBracket] Round 1 matches added to allMatches')
  
    // Build subsequent rounds
    console.log('[buildCompleteBracket] Building subsequent rounds...')
    // Validate bracketSize to prevent infinite loops
    if (bracketSize <= 0 || !Number.isFinite(bracketSize)) {
      console.error('[buildCompleteBracket] Invalid bracketSize:', bracketSize)
      return allMatches // Return what we have so far
    }
    
    const totalRounds = Math.ceil(Math.log2(bracketSize))
    console.log('[buildCompleteBracket] Total rounds calculated:', totalRounds)
    
    // Safety check: limit to reasonable number of rounds
    if (totalRounds > 10 || !Number.isFinite(totalRounds)) {
      console.error('[buildCompleteBracket] Invalid totalRounds calculated:', totalRounds, 'for bracketSize:', bracketSize)
      return allMatches // Return what we have so far
    }
    
    let previousRound = round1Matches
    
    for (let round = 2; round <= totalRounds; round++) {
      console.log('[buildCompleteBracket] Building round', round, 'of', totalRounds)
      const nextRoundMatches = buildSubsequentRounds(previousRound, round, totalRounds)
    
    // Update with existing match data
    // Note: roundIndex in DB: Round 1 = 0, Round 2 = 1, etc.
    // In our structure: Round 1 = 1, Round 2 = 2, etc.
    if (existingPlayoffMatches) {
      nextRoundMatches.forEach(match => {
        const dbMatch = existingPlayoffMatches.find(m => m.roundIndex === round - 1 &&
          ((m.teamAId === match.left.teamId && m.teamBId === match.right.teamId) ||
           (m.teamAId === match.right.teamId && m.teamBId === match.left.teamId))
        )
        if (dbMatch) {
          match.matchId = dbMatch.id
          if (dbMatch.games && dbMatch.games.length > 0) {
            match.games = dbMatch.games
            const totalScoreA = dbMatch.games.reduce((sum, g) => sum + g.scoreA, 0)
            const totalScoreB = dbMatch.games.reduce((sum, g) => sum + g.scoreB, 0)
            if (totalScoreA > 0 || totalScoreB > 0) {
              match.status = totalScoreA > totalScoreB || totalScoreB > totalScoreA ? 'finished' : 'in_progress'
              if (match.status === 'finished') {
                match.winnerTeamId = totalScoreA > totalScoreB ? dbMatch.teamAId : dbMatch.teamBId
                match.winnerSeed = match.winnerTeamId === match.left.teamId ? match.left.seed : match.right.seed
                match.winnerTeamName = match.winnerTeamId === match.left.teamId ? match.left.teamName : match.right.teamName
              }
            }
          }
          // Also check winnerId if available
          if (dbMatch.winnerId) {
            match.winnerTeamId = dbMatch.winnerId
            match.winnerSeed = match.winnerTeamId === match.left.teamId ? match.left.seed : match.right.seed
            match.winnerTeamName = match.winnerTeamId === match.left.teamId ? match.left.teamName : match.right.teamName
            match.status = 'finished'
          }
        }
      })
    }
    
      allMatches.push(...nextRoundMatches)
      previousRound = nextRoundMatches
      console.log('[buildCompleteBracket] Round', round, 'complete:', nextRoundMatches.length, 'matches')
    }
    
    console.log('[buildCompleteBracket] All rounds built successfully. Total matches:', allMatches.length)
    return allMatches
  } catch (error) {
    console.error('[buildCompleteBracket] Error occurred:', error)
    console.error('[buildCompleteBracket] Error details:', {
      totalTeams,
      bracketSize,
      standingsCount: standings.length,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
    })
    throw error
  }
}

