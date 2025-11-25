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
  // Play-in is needed when: bracketSize < totalTeams < 2 * bracketSize
  // This means we have more teams than bracket size, but not enough for a full double bracket
  if (bracketSize < totalTeams && totalTeams < 2 * bracketSize) {
    return 2 * (totalTeams - bracketSize)  // 2E teams go to play-in
  }
  // If totalTeams < bracketSize, no play-in needed (teams get BYEs)
  // If totalTeams >= 2 * bracketSize, no play-in needed (different bracket structure)
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
    
    // CRITICAL: Do NOT create BYE slots here
    // BYE are determined dynamically when processing bracket pairs:
    // if seed > totalTeams, it's a BYE (upper seeds get BYE when paired with non-existent seeds)
    const totalTeams = allRound1Teams.length
    
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
    let matchPosition = 0
    for (let i = 0; i < pairs.length; i++) {
      const [seedA, seedB] = pairs[i]
      
      // Skip pairs where both seeds exceed bracketSize (these are for the expanded bracket)
      if (seedA > bracketSize && seedB > bracketSize) {
        console.log(`[buildRound1Matches] Skipping pair [${seedA}, ${seedB}] - both seeds exceed bracketSize ${bracketSize}`)
        continue
      }
      
      // Determine which team should be on left/right based on bracket pair order
      // In bracket pairs, lower seed is typically on left
      const leftSeed = Math.min(seedA, seedB)
      const rightSeed = Math.max(seedA, seedB)
      
      // Get teams for these seeds (if they exist)
      const leftTeam = leftSeed <= bracketSize ? seedMap.get(leftSeed) : undefined
      const rightTeam = rightSeed <= bracketSize ? seedMap.get(rightSeed) : undefined
      
      // If both teams are missing (both seeds > bracketSize), skip
      if (!leftTeam && !rightTeam) {
        console.log(`[buildRound1Matches] Skipping pair [${seedA}, ${seedB}] - both seeds exceed bracketSize`)
        continue
      }
      
      // CRITICAL: If seed > totalTeams, it's a BYE
      // Upper B seeds (1, 2, ..., missing) get BYE when their opponent seed > totalTeams
      // This ensures upper seeds autopass when paired with non-existent seeds
      const leftIsBye = !leftTeam && leftSeed > totalTeams
      const rightIsBye = !rightTeam && rightSeed > totalTeams
      
      if (leftIsBye && rightTeam) {
        // Left team is BYE - right team autopasses
        matches.push({
          id: `round1-${matchPosition}`,
          round: 1,
          position: matchPosition,
          left: { seed: leftSeed, isBye: true },
          right: { seed: rightSeed, teamId: rightTeam.teamId, teamName: rightTeam.teamName, isBye: false },
          status: 'finished',
          winnerSeed: rightSeed,
          winnerTeamId: rightTeam.teamId,
          winnerTeamName: rightTeam.teamName,
        })
        matchPosition++
      } else if (leftTeam && rightIsBye) {
        // Right team is BYE - left team autopasses
        matches.push({
          id: `round1-${matchPosition}`,
          round: 1,
          position: matchPosition,
          left: { seed: leftSeed, teamId: leftTeam.teamId, teamName: leftTeam.teamName, isBye: false },
          right: { seed: rightSeed, isBye: true },
          status: 'finished',
          winnerSeed: leftSeed,
          winnerTeamId: leftTeam.teamId,
          winnerTeamName: leftTeam.teamName,
        })
        matchPosition++
      } else if (leftTeam && rightTeam) {
        // Both teams exist
        // If one is BYE, the other automatically advances
        if (leftTeam.isBye) {
          matches.push({
            id: `round1-${matchPosition}`,
            round: 1,
            position: matchPosition,
            left: { seed: leftSeed, isBye: true },
            right: { seed: rightSeed, teamId: rightTeam.teamId, teamName: rightTeam.teamName, isBye: false },
            status: 'finished', // BYE is automatically finished
            winnerSeed: rightSeed,
            winnerTeamId: rightTeam.teamId,
            winnerTeamName: rightTeam.teamName,
          })
        } else if (rightTeam.isBye) {
          matches.push({
            id: `round1-${matchPosition}`,
            round: 1,
            position: matchPosition,
            left: { seed: leftSeed, teamId: leftTeam.teamId, teamName: leftTeam.teamName, isBye: false },
            right: { seed: rightSeed, isBye: true },
            status: 'finished', // BYE is automatically finished
            winnerSeed: leftSeed,
            winnerTeamId: leftTeam.teamId,
            winnerTeamName: leftTeam.teamName,
          })
        } else {
          // Both teams exist and neither is BYE - create regular match
          matches.push({
            id: `round1-${matchPosition}`,
            round: 1,
            position: matchPosition,
            left: { seed: leftSeed, teamId: leftTeam.teamId, teamName: leftTeam.teamName, isBye: false },
            right: { seed: rightSeed, teamId: rightTeam.teamId, teamName: rightTeam.teamName, isBye: false },
            status: leftTeam.teamId && rightTeam.teamId ? 'scheduled' : 'scheduled',
          })
        }
        matchPosition++
      }
    }
    
    console.log('[buildRound1Matches] Generated', matches.length, 'matches')
    return matches
  } catch (error) {
    console.error('[buildRound1Matches] Error occurred:', error)
    console.error('[buildRound1Matches] Error details:', {
      upperSeedsCount: upperSeeds.length,
      playInWinnersCount: playInWinners.length,
      bracketSize,
      playInSpots,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
    })
    throw error
  }
}

// Build subsequent rounds recursively
export function buildSubsequentRounds(
  previousRoundMatches: BracketMatch[],
  roundNumber: number,
  totalRounds: number
): BracketMatch[] {
  console.log('[buildSubsequentRounds] Starting with:', {
    previousRoundMatchesCount: previousRoundMatches.length,
    roundNumber,
    totalRounds,
  })
  
  const matches: BracketMatch[] = []
  const matchesInRound = Math.floor(previousRoundMatches.length / 2)
  
  console.log('[buildSubsequentRounds] Matches in round:', matchesInRound)
  
  for (let i = 0; i < matchesInRound; i++) {
    const prevMatch1 = previousRoundMatches[i * 2]
    const prevMatch2 = previousRoundMatches[i * 2 + 1]
    
    // Check if both matches exist
    if (!prevMatch1 || !prevMatch2) {
      console.warn(`[buildSubsequentRounds] Missing match for round ${roundNumber}, position ${i}:`, {
        prevMatch1: !!prevMatch1,
        prevMatch2: !!prevMatch2,
      })
      // Create a BYE match if one is missing
      if (prevMatch1 && !prevMatch2) {
        // Only prevMatch1 exists - create BYE for right side
        const matchId = `round${roundNumber}-${i}`
        let left: SeedSlot = { seed: 0, isBye: false }
        
        if (prevMatch1.winnerTeamId) {
          left = {
            seed: prevMatch1.winnerSeed || 0,
            teamId: prevMatch1.winnerTeamId,
            teamName: prevMatch1.winnerTeamName,
            isBye: false,
          }
        } else if (prevMatch1.status === 'finished' && prevMatch1.left.isBye) {
          left = prevMatch1.left
        } else {
          left = {
            seed: prevMatch1.left?.seed || prevMatch1.right?.seed || 0,
            isBye: false,
          }
        }
        
        prevMatch1.nextMatchId = matchId
        prevMatch1.nextSlot = 'left'
        
        matches.push({
          id: matchId,
          round: roundNumber,
          position: i,
          left,
          right: { seed: 0, isBye: true },
          status: 'finished',
          winnerTeamId: left.teamId,
          winnerTeamName: left.teamName,
          winnerSeed: left.seed,
        })
        continue
      } else if (!prevMatch1 && prevMatch2) {
        // Only prevMatch2 exists - create BYE for left side
        const matchId = `round${roundNumber}-${i}`
        let right: SeedSlot = { seed: 0, isBye: false }
        
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
            seed: prevMatch2.left?.seed || prevMatch2.right?.seed || 0,
            isBye: false,
          }
        }
        
        prevMatch2.nextMatchId = matchId
        prevMatch2.nextSlot = 'right'
        
        matches.push({
          id: matchId,
          round: roundNumber,
          position: i,
          left: { seed: 0, isBye: true },
          right,
          status: 'finished',
          winnerTeamId: right.teamId,
          winnerTeamName: right.teamName,
          winnerSeed: right.seed,
        })
        continue
      } else {
        // Both missing - skip this match
        continue
      }
    }
    
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
    } else if (prevMatch1.status === 'finished' && prevMatch1.left?.isBye) {
      // BYE case - should not happen in subsequent rounds, but handle it
      left = prevMatch1.left
    } else {
      left = {
        seed: prevMatch1.left?.seed || prevMatch1.right?.seed || 0,
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
    } else if (prevMatch2.status === 'finished' && prevMatch2.right?.isBye) {
      right = prevMatch2.right
    } else {
      right = {
        seed: prevMatch2.left?.seed || prevMatch2.right?.seed || 0,
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
  
  console.log('[buildSubsequentRounds] Generated', matches.length, 'matches')
  return matches
}

// Build complete bracket structure
export function buildCompleteBracket(
  totalTeams: number,
  bracketSize: number,
  standings: Array<{ teamId: string; teamName: string; seed: number }>,
  playInMatches?: Array<{ id: string; winnerTeamId?: string; teamAId: string; teamBId: string }>,
  existingPlayoffMatches?: Array<{ id: string; roundIndex: number; teamAId: string; teamBId: string; winnerId?: string; games?: Array<{ scoreA: number; scoreB: number }>; note?: string }>
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
    
    // Create a map for quick team lookup by ID
    const teamMap = new Map<string, { teamId: string; teamName: string; seed: number }>()
    standings.forEach(team => {
      teamMap.set(team.teamId, team)
    })
    
    // CRITICAL: Always build structure the same way, regardless of DB matches
    // Structure is built once and never changes - DB matches only fill in data
    
    // Step 1: Build Round 0 (Play-In) structure if needed
    const playInSpots = calculatePlayInSpots(totalTeams, bracketSize)
    const needsPlayIn = playInSpots > 0
    
    if (needsPlayIn) {
      // CRITICAL: If Play-In matches exist in DB, use them directly (no duplicates)
      // Only build structure from standings if matches don't exist in DB
      if (playInMatches && playInMatches.length > 0) {
        // Use existing Play-In matches from DB
        playInMatches.forEach((dbMatch, index) => {
          const teamA = teamMap.get(dbMatch.teamAId)
          const teamB = teamMap.get(dbMatch.teamBId)
          
          if (teamA && teamB) {
            const match: BracketMatch = {
              id: dbMatch.id || `playin-${index}`,
              round: 0,
              position: index,
              left: {
                seed: teamA.seed,
                teamId: teamA.teamId,
                teamName: teamA.teamName,
                isBye: false,
              },
              right: {
                seed: teamB.seed,
                teamId: teamB.teamId,
                teamName: teamB.teamName,
                isBye: false,
              },
              status: dbMatch.winnerTeamId ? 'finished' : 'scheduled',
              matchId: dbMatch.id,
            }
            
            if (dbMatch.winnerTeamId) {
              match.winnerTeamId = dbMatch.winnerTeamId
              const winnerTeam = teamMap.get(dbMatch.winnerTeamId)
              if (winnerTeam) {
                match.winnerSeed = winnerTeam.seed
                match.winnerTeamName = winnerTeam.teamName
              }
            }
            
            allMatches.push(match)
          }
        })
        console.log('[buildCompleteBracket] Round 0 (Play-In) matches from DB:', playInMatches.length)
      } else {
        // Build Play-In structure from standings (when no DB matches exist yet)
        const E = totalTeams - bracketSize
        const playInTeamCount = 2 * E
        const playInTeams = standings.slice(totalTeams - playInTeamCount)
        
        // Pair teams: first vs last, second vs second-last, etc.
        for (let i = 0; i < E; i++) {
          const teamA = playInTeams[i]
          const teamB = playInTeams[playInTeamCount - 1 - i]
          
          allMatches.push({
            id: `playin-${i}`,
            round: 0,
            position: i,
            left: {
              seed: teamA.seed,
              teamId: teamA.teamId,
              teamName: teamA.teamName,
              isBye: false,
            },
            right: {
              seed: teamB.seed,
              teamId: teamB.teamId,
              teamName: teamB.teamName,
              isBye: false,
            },
            status: 'scheduled',
          })
        }
        console.log('[buildCompleteBracket] Round 0 (Play-In) structure built from standings:', E)
      }
    }
    
    // Step 2: Always build Round 1+ structure deterministically
    console.log('[buildCompleteBracket] Building bracket structure deterministically...')
    
    // Extract play-in winners from Play-In matches (if any)
    const playInWinners: Array<{ seed: number; teamId?: string; teamName?: string }> = []
    if (playInMatches && playInMatches.length > 0) {
      playInMatches.forEach(match => {
        if (match.winnerTeamId) {
          const winnerTeam = teamMap.get(match.winnerTeamId)
          if (winnerTeam) {
            playInWinners.push({
              seed: winnerTeam.seed,
              teamId: winnerTeam.teamId,
              teamName: winnerTeam.teamName,
            })
          }
        }
      })
    }
    
    // Determine auto-qualified teams (upper seeds)
    // CRITICAL: If Play-In matches exist, exclude teams that play in Play-In from auto-qualified
    // This prevents duplicate teams in the bracket (teams in Play-In should not appear as auto-qualified)
    const hasPlayInMatches = playInMatches && playInMatches.length > 0
    const hasPlayInWinners = playInWinners.length > 0
    
    const upperSeeds: Array<{ seed: number; teamId?: string; teamName?: string }> = []
    if (needsPlayIn) {
      // Play-In is needed - exclude teams that go to Play-In from auto-qualified
      const E = totalTeams - bracketSize
      const playInTeamCount = 2 * E
      const playInStartSeed = totalTeams - playInTeamCount + 1 // First seed that goes to Play-In
      
      standings.forEach(team => {
        // Only include teams that are NOT in Play-In (seeds 1 to totalTeams - playInTeamCount)
        if (team.seed < playInStartSeed) {
          upperSeeds.push({ seed: team.seed, teamId: team.teamId, teamName: team.teamName })
        }
      })
    } else {
      // No Play-In needed - all teams directly qualify
      standings.forEach(team => {
        upperSeeds.push({ seed: team.seed, teamId: team.teamId, teamName: team.teamName })
      })
    }
    
    console.log('[buildCompleteBracket] Generating bracket structure:', {
      upperSeedsCount: upperSeeds.length,
      playInWinnersCount: playInWinners.length,
      bracketSize,
      playInSpots,
    })
    
    // Build Round 1 matches - use bracketPairs to determine which seeds play each other
    // CRITICAL: Structure is always built the same way, regardless of DB matches
    const pairs = bracketPairs(bracketSize)
    const round1Matches: BracketMatch[] = []
    
    // Create seed map for quick lookup - map bracket seed positions to teams
    const seedMap = new Map<number, { seed: number; teamId?: string; teamName?: string }>()
    
    // First, map upper seeds (auto-qualified) to their bracket positions
    upperSeeds.forEach(team => {
      if (team.seed <= bracketSize) {
        seedMap.set(team.seed, team)
      }
    })
    
    // Map Play-In winners to the positions they should fill
    if (needsPlayIn && playInWinners.length > 0) {
      const E = totalTeams - bracketSize
      const playInStartSeed = totalTeams - 2 * E + 1
      
      // Sort Play-In winners by seed to maintain order
      const sortedPlayInWinners = [...playInWinners].sort((a, b) => a.seed - b.seed)
      
      // Map Play-In winners to bracket positions
      let playInWinnerIndex = 0
      pairs.forEach(([seedA, seedB]) => {
        if (playInWinnerIndex < sortedPlayInWinners.length) {
          if (seedA >= playInStartSeed && !seedMap.has(seedA)) {
            const winner = sortedPlayInWinners[playInWinnerIndex]
            seedMap.set(seedA, { ...winner, seed: seedA })
            playInWinnerIndex++
          } else if (seedB >= playInStartSeed && !seedMap.has(seedB)) {
            const winner = sortedPlayInWinners[playInWinnerIndex]
            seedMap.set(seedB, { ...winner, seed: seedB })
            playInWinnerIndex++
          }
        }
      })
    }
    
    // Calculate total qualified teams and missing (BYE slots)
    // Structure is always based on actual qualified teams (upperSeeds + playInWinners)
    // If Play-In winners are not determined yet, those positions show as TBD
    const totalQualified = upperSeeds.length + playInWinners.length
    const missing = bracketSize - totalQualified
      
      // CRITICAL: Always create matches for ALL pairs to maintain consistent structure
      // Position must match the index in pairs array to preserve bracket structure
      // Even if teams are TBD (Play-In positions without winners), we still create the match
      let matchPosition = 0
      pairs.forEach(([seedA, seedB], pairIndex) => {
        // Determine left/right based on seed order (lower seed on left)
        const leftSeed = Math.min(seedA, seedB)
        const rightSeed = Math.max(seedA, seedB)
        const leftTeam = seedMap.get(leftSeed)
        const rightTeam = seedMap.get(rightSeed)
        
        // If seed > totalQualified, it's a BYE or TBD (for Play-In positions without winners yet)
        // For Play-In positions: if no winner yet, show as TBD (not BYE)
        const E = needsPlayIn ? totalTeams - bracketSize : 0
        const playInStartSeed = needsPlayIn ? totalTeams - 2 * E + 1 : bracketSize + 1
        const isLeftPlayInPosition = needsPlayIn && leftSeed >= playInStartSeed && !leftTeam
        const isRightPlayInPosition = needsPlayIn && rightSeed >= playInStartSeed && !rightTeam
        
        const leftIsBye = !isLeftPlayInPosition && (leftSeed > totalQualified || (leftSeed <= missing && !leftTeam))
        const rightIsBye = !isRightPlayInPosition && (rightSeed > totalQualified || (rightSeed <= missing && !rightTeam))
        
        // Always create match - structure must be consistent
        // If both sides are unknown and not BYE/Play-In, still create with TBD
        const left: SeedSlot = leftTeam ? {
          seed: leftSeed,
          teamId: leftTeam.teamId,
          teamName: leftTeam.teamName,
          isBye: false,
        } : {
          seed: leftSeed,
          isBye: leftIsBye,
        }
        
        const right: SeedSlot = rightTeam ? {
          seed: rightSeed,
          teamId: rightTeam.teamId,
          teamName: rightTeam.teamName,
          isBye: false,
        } : {
          seed: rightSeed,
          isBye: rightIsBye,
        }
        
        // Determine winner if one side is BYE
        let winnerSeed: number | undefined
        let winnerTeamId: string | undefined
        let winnerTeamName: string | undefined
        let status: MatchStatus = 'scheduled'
        
        if (leftIsBye && rightTeam) {
          // Left is BYE, right autopasses
          winnerSeed = rightSeed
          winnerTeamId = rightTeam.teamId
          winnerTeamName = rightTeam.teamName
          status = 'finished'
        } else if (rightIsBye && leftTeam) {
          // Right is BYE, left autopasses
          winnerSeed = leftSeed
          winnerTeamId = leftTeam.teamId
          winnerTeamName = leftTeam.teamName
          status = 'finished'
        }
        
        // CRITICAL: Use matchPosition (sequential) not pairIndex to maintain structure
        // This ensures position is consistent even if some pairs are skipped in future
        round1Matches.push({
          id: `round1-${matchPosition}`,
          round: 1,
          position: matchPosition,
          left,
          right,
          status,
          winnerSeed,
          winnerTeamId,
          winnerTeamName,
        })
        matchPosition++
      })
      
      allMatches.push(...round1Matches)
      console.log('[buildCompleteBracket] Round 1 matches generated:', round1Matches.length)
      
      // Build subsequent rounds - only show empty structure (no seeds) until matches are played
      const totalRounds = Math.ceil(Math.log2(bracketSize))
      let previousRound = round1Matches
      
      for (let round = 2; round <= totalRounds; round++) {
        console.log(`[buildCompleteBracket] Generating round ${round} of ${totalRounds}`)
        const matchesInRound = Math.floor(previousRound.length / 2)
        const nextRoundMatches: BracketMatch[] = []
        
        for (let i = 0; i < matchesInRound; i++) {
          const prevMatch1 = previousRound[i * 2]
          const prevMatch2 = previousRound[i * 2 + 1]
          
          if (prevMatch1 && prevMatch2) {
            // Only show seeds if both previous matches have winners
            let left: SeedSlot = { seed: 0, isBye: false }
            let right: SeedSlot = { seed: 0, isBye: false }
            
            if (prevMatch1.winnerTeamId) {
              left = {
                seed: prevMatch1.winnerSeed || 0,
                teamId: prevMatch1.winnerTeamId,
                teamName: prevMatch1.winnerTeamName,
                isBye: false,
              }
            } else {
              // No winner yet - show empty circle
              left = { seed: 0, isBye: false }
            }
            
            if (prevMatch2.winnerTeamId) {
              right = {
                seed: prevMatch2.winnerSeed || 0,
                teamId: prevMatch2.winnerTeamId,
                teamName: prevMatch2.winnerTeamName,
                isBye: false,
              }
            } else {
              // No winner yet - show empty circle
              right = { seed: 0, isBye: false }
            }
            
            // Link previous matches
            prevMatch1.nextMatchId = `round${round}-${i}`
            prevMatch1.nextSlot = 'left'
            prevMatch2.nextMatchId = `round${round}-${i}`
            prevMatch2.nextSlot = 'right'
            
            nextRoundMatches.push({
              id: `round${round}-${i}`,
              round: round,
              position: i,
              left,
              right,
              status: left.teamId && right.teamId ? 'scheduled' : 'scheduled',
            })
          }
        }
        
      allMatches.push(...nextRoundMatches)
      previousRound = nextRoundMatches
      console.log(`[buildCompleteBracket] Round ${round} generated:`, nextRoundMatches.length, 'matches')
    }
    
    // Step 3: Fill structure with data from DB matches (if they exist)
    // CRITICAL: This only updates data (teamId, teamName, winner, status), NOT structure
    if (existingPlayoffMatches && existingPlayoffMatches.length > 0) {
      console.log('[buildCompleteBracket] Filling structure with DB match data...')
      
      // Filter out third place matches
      const playoffMatches = existingPlayoffMatches.filter(m => !m.note || m.note !== 'Third Place Match')
      
      // Group by round
      const matchesByRound = new Map<number, typeof playoffMatches>()
      playoffMatches.forEach(match => {
        const round = (match.roundIndex || 0) + 1
        if (!matchesByRound.has(round)) {
          matchesByRound.set(round, [])
        }
        matchesByRound.get(round)!.push(match)
      })
      
      // Update matches in structure with DB data
      matchesByRound.forEach((roundMatches, round) => {
        roundMatches.forEach(dbMatch => {
          const teamA = teamMap.get(dbMatch.teamAId)
          const teamB = teamMap.get(dbMatch.teamBId)
          
          if (teamA && teamB) {
            // Find matching match in structure by seeds
            const structureMatch = allMatches.find(m => {
              if (m.round !== round) return false
              // Match by seeds (either order)
              return (m.left.seed === teamA.seed && m.right.seed === teamB.seed) ||
                     (m.left.seed === teamB.seed && m.right.seed === teamA.seed)
            })
            
            if (structureMatch) {
              // Update data, keep structure
              structureMatch.matchId = dbMatch.id
              structureMatch.id = dbMatch.id || structureMatch.id
              
              // Update team data (in case seeds changed)
              if (structureMatch.left.seed === teamA.seed) {
                structureMatch.left.teamId = teamA.teamId
                structureMatch.left.teamName = teamA.teamName
                structureMatch.right.teamId = teamB.teamId
                structureMatch.right.teamName = teamB.teamName
              } else {
                structureMatch.left.teamId = teamB.teamId
                structureMatch.left.teamName = teamB.teamName
                structureMatch.right.teamId = teamA.teamId
                structureMatch.right.teamName = teamA.teamName
              }
              
              // Update winner and status
              if (dbMatch.winnerId) {
                structureMatch.winnerTeamId = dbMatch.winnerId
                const winnerTeam = teamMap.get(dbMatch.winnerId)
                if (winnerTeam) {
                  structureMatch.winnerSeed = winnerTeam.seed
                  structureMatch.winnerTeamName = winnerTeam.teamName
                }
                structureMatch.status = 'finished'
              } else if (dbMatch.games && dbMatch.games.length > 0) {
                structureMatch.games = dbMatch.games
                const totalScoreA = dbMatch.games.reduce((sum, g) => sum + g.scoreA, 0)
                const totalScoreB = dbMatch.games.reduce((sum, g) => sum + g.scoreB, 0)
                
                if (totalScoreA > 0 || totalScoreB > 0) {
                  structureMatch.status = totalScoreA > totalScoreB || totalScoreB > totalScoreA ? 'finished' : 'in_progress'
                  if (structureMatch.status === 'finished') {
                    structureMatch.winnerTeamId = totalScoreA > totalScoreB ? dbMatch.teamAId : dbMatch.teamBId
                    const winnerTeam = teamMap.get(structureMatch.winnerTeamId)
                    if (winnerTeam) {
                      structureMatch.winnerSeed = winnerTeam.seed
                      structureMatch.winnerTeamName = winnerTeam.teamName
                    }
                  }
                }
              }
            }
          }
        })
      })
      
      console.log('[buildCompleteBracket] Structure filled with DB data')
    }
    
    // Sort matches by round and position
    allMatches.sort((a, b) => {
      if (a.round !== b.round) return a.round - b.round
      return a.position - b.position
    })
    
    console.log('[buildCompleteBracket] Complete bracket built:', allMatches.length, 'matches')
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
