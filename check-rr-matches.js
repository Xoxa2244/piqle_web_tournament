const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const tournamentId = '7ed5aa94-7b73-4c89-b600-f771710bea15'
const problemDivisionId = '819fb3ad-07cc-4513-8b7e-ebab44a79a57' // Mixed Doubles 3.0 60+

async function checkRRMatches() {
  console.log('=== Round Robin Matches Analysis ===\n')
  console.log(`Tournament ID: ${tournamentId}`)
  console.log(`Division ID: ${problemDivisionId}\n`)

  try {
    // Get division with teams
    const division = await prisma.division.findUnique({
      where: { id: problemDivisionId },
      include: {
        teams: {
          orderBy: { name: 'asc' }
        }
      }
    })

    if (!division) {
      console.log('❌ Division not found!')
      return
    }

    console.log(`Division: ${division.name}`)
    console.log(`Teams count: ${division.teams.length}\n`)

    // Get all Round Robin matches
    const rrMatches = await prisma.match.findMany({
      where: {
        divisionId: problemDivisionId,
        stage: 'ROUND_ROBIN'
      },
      include: {
        teamA: true,
        teamB: true,
        games: {
          orderBy: { index: 'asc' }
        }
      },
      orderBy: [
        { roundIndex: 'asc' },
        { id: 'asc' }
      ]
    })

    console.log(`Total RR matches: ${rrMatches.length}\n`)

    // Expected number of matches for Round Robin
    const n = division.teams.length
    const expectedMatches = (n * (n - 1)) / 2
    console.log(`Expected RR matches for ${n} teams: ${expectedMatches}`)
    console.log(`Actual RR matches: ${rrMatches.length}`)
    
    if (rrMatches.length !== expectedMatches) {
      console.log(`⚠️  MISMATCH: Expected ${expectedMatches}, got ${rrMatches.length}`)
    } else {
      console.log(`✅ Match count is correct`)
    }
    console.log()

    // Check for duplicate pairs
    console.log('=== Checking for Duplicate Pairs ===')
    const pairMap = new Map()
    const duplicates = []
    
    rrMatches.forEach(match => {
      // Create a canonical pair key (always smaller ID first)
      const pairKey = match.teamAId < match.teamBId 
        ? `${match.teamAId}-${match.teamBId}`
        : `${match.teamBId}-${match.teamAId}`
      
      if (pairMap.has(pairKey)) {
        duplicates.push({
          match1: pairMap.get(pairKey),
          match2: match
        })
      } else {
        pairMap.set(pairKey, match)
      }
    })

    if (duplicates.length > 0) {
      console.log(`❌ Found ${duplicates.length} duplicate pair(s):`)
      duplicates.forEach((dup, idx) => {
        console.log(`\n  Duplicate ${idx + 1}:`)
        console.log(`    Match 1 (ID: ${dup.match1.id}):`)
        console.log(`      ${dup.match1.teamA.name} vs ${dup.match1.teamB.name}`)
        console.log(`      Round: ${dup.match1.roundIndex}`)
        console.log(`    Match 2 (ID: ${dup.match2.id}):`)
        console.log(`      ${dup.match2.teamA.name} vs ${dup.match2.teamB.name}`)
        console.log(`      Round: ${dup.match2.roundIndex}`)
      })
    } else {
      console.log(`✅ No duplicate pairs found`)
    }
    console.log()

    // Check for missing pairs
    console.log('=== Checking for Missing Pairs ===')
    const allPairs = new Set()
    division.teams.forEach((teamA, i) => {
      division.teams.forEach((teamB, j) => {
        if (i !== j) {
          const pairKey = teamA.id < teamB.id 
            ? `${teamA.id}-${teamB.id}`
            : `${teamB.id}-${teamA.id}`
          allPairs.add(pairKey)
        }
      })
    })

    const foundPairs = new Set()
    rrMatches.forEach(match => {
      const pairKey = match.teamAId < match.teamBId 
        ? `${match.teamAId}-${match.teamBId}`
        : `${match.teamBId}-${match.teamAId}`
      foundPairs.add(pairKey)
    })

    const missingPairs = []
    allPairs.forEach(pairKey => {
      if (!foundPairs.has(pairKey)) {
        const [teamAId, teamBId] = pairKey.split('-')
        const teamA = division.teams.find(t => t.id === teamAId)
        const teamB = division.teams.find(t => t.id === teamBId)
        missingPairs.push({ teamA, teamB })
      }
    })

    if (missingPairs.length > 0) {
      console.log(`❌ Found ${missingPairs.length} missing pair(s):`)
      missingPairs.forEach((pair, idx) => {
        console.log(`  ${idx + 1}. ${pair.teamA.name} vs ${pair.teamB.name}`)
      })
    } else {
      console.log(`✅ All pairs are present`)
    }
    console.log()

    // Check match results
    console.log('=== Checking Match Results ===')
    const matchesWithResults = []
    const matchesWithoutResults = []
    const matchesWithInvalidResults = []

    rrMatches.forEach(match => {
      if (match.games.length === 0) {
        matchesWithoutResults.push(match)
      } else {
        const hasValidResult = match.games.some(game => game.scoreA > 0 || game.scoreB > 0)
        if (hasValidResult) {
          matchesWithResults.push(match)
        } else {
          matchesWithInvalidResults.push(match)
        }
      }
    })

    console.log(`Matches with results: ${matchesWithResults.length}`)
    console.log(`Matches without results: ${matchesWithoutResults.length}`)
    console.log(`Matches with invalid results (all zeros): ${matchesWithInvalidResults.length}`)
    console.log()

    if (matchesWithoutResults.length > 0) {
      console.log(`⚠️  Matches without results:`)
      matchesWithoutResults.forEach((match, idx) => {
        console.log(`  ${idx + 1}. ${match.teamA.name} vs ${match.teamB.name} (Round ${match.roundIndex})`)
      })
      console.log()
    }

    if (matchesWithInvalidResults.length > 0) {
      console.log(`⚠️  Matches with invalid results (all zeros):`)
      matchesWithInvalidResults.forEach((match, idx) => {
        console.log(`  ${idx + 1}. ${match.teamA.name} vs ${match.teamB.name} (Round ${match.roundIndex})`)
      })
      console.log()
    }

    // Check for teams playing against themselves
    console.log('=== Checking for Self-Matches ===')
    const selfMatches = rrMatches.filter(m => m.teamAId === m.teamBId)
    if (selfMatches.length > 0) {
      console.log(`❌ Found ${selfMatches.length} self-match(es):`)
      selfMatches.forEach((match, idx) => {
        console.log(`  ${idx + 1}. Match ID: ${match.id}, Team: ${match.teamA.name}`)
      })
    } else {
      console.log(`✅ No self-matches found`)
    }
    console.log()

    // Verify standings calculation
    console.log('=== Verifying Standings Calculation ===')
    const teamStats = new Map()
    
    division.teams.forEach(team => {
      teamStats.set(team.id, {
        teamId: team.id,
        teamName: team.name,
        wins: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        pointDiff: 0,
        matchesPlayed: 0
      })
    })

    matchesWithResults.forEach(match => {
      const teamAStats = teamStats.get(match.teamAId)
      const teamBStats = teamStats.get(match.teamBId)
      
      if (!teamAStats || !teamBStats) return

      let teamAPoints = 0
      let teamBPoints = 0
      
      match.games.forEach(game => {
        teamAPoints += game.scoreA
        teamBPoints += game.scoreB
      })

      teamAStats.pointsFor += teamAPoints
      teamAStats.pointsAgainst += teamBPoints
      teamBStats.pointsFor += teamBPoints
      teamBStats.pointsAgainst += teamAPoints
      teamAStats.matchesPlayed += 1
      teamBStats.matchesPlayed += 1

      if (teamAPoints > teamBPoints) {
        teamAStats.wins += 1
        teamBStats.losses += 1
      } else if (teamBPoints > teamAPoints) {
        teamBStats.wins += 1
        teamAStats.losses += 1
      }
    })

    teamStats.forEach(stats => {
      stats.pointDiff = stats.pointsFor - stats.pointsAgainst
    })

    const calculatedStandings = Array.from(teamStats.values()).sort((a, b) => {
      if (a.wins !== b.wins) return b.wins - a.wins
      return b.pointDiff - a.pointDiff
    })

    console.log('Calculated standings from RR matches:')
    calculatedStandings.forEach((team, idx) => {
      console.log(`  ${idx + 1}. ${team.teamName} - W:${team.wins} L:${team.losses} PD:${team.pointDiff > 0 ? '+' : ''}${team.pointDiff} (Matches: ${team.matchesPlayed}/${expectedMatches / n * 2})`)
    })
    console.log()

    // Check for matches with same teams in different rounds
    console.log('=== Checking Round Distribution ===')
    const rounds = new Map()
    rrMatches.forEach(match => {
      if (!rounds.has(match.roundIndex)) {
        rounds.set(match.roundIndex, [])
      }
      rounds.get(match.roundIndex).push(match)
    })

    console.log(`Total rounds: ${rounds.size}`)
    rounds.forEach((matches, roundIndex) => {
      console.log(`  Round ${roundIndex}: ${matches.length} matches`)
    })
    console.log()

    // Check for teams playing multiple times in same round
    console.log('=== Checking for Teams Playing Multiple Times in Same Round ===')
    const roundTeamMap = new Map()
    rrMatches.forEach(match => {
      const roundKey = match.roundIndex
      if (!roundTeamMap.has(roundKey)) {
        roundTeamMap.set(roundKey, new Map())
      }
      const teamMap = roundTeamMap.get(roundKey)
      
      // Count appearances of each team in this round
      teamMap.set(match.teamAId, (teamMap.get(match.teamAId) || 0) + 1)
      teamMap.set(match.teamBId, (teamMap.get(match.teamBId) || 0) + 1)
    })

    let foundIssue = false
    roundTeamMap.forEach((teamMap, roundIndex) => {
      teamMap.forEach((count, teamId) => {
        if (count > 1) {
          if (!foundIssue) {
            console.log(`❌ Found teams playing multiple times in same round:`)
            foundIssue = true
          }
          const team = division.teams.find(t => t.id === teamId)
          console.log(`  Round ${roundIndex}: ${team.name} appears ${count} times`)
        }
      })
    })

    if (!foundIssue) {
      console.log(`✅ No team plays multiple times in the same round`)
    }
    console.log()

    // Check match order and verify all unique pairs
    console.log('=== Verifying All Unique Pairs ===')
    const pairDetails = new Map()
    rrMatches.forEach(match => {
      const pairKey = match.teamAId < match.teamBId 
        ? `${match.teamAId}-${match.teamBId}`
        : `${match.teamBId}-${match.teamAId}`
      
      if (!pairDetails.has(pairKey)) {
        pairDetails.set(pairKey, {
          teamA: match.teamA,
          teamB: match.teamB,
          matches: []
        })
      }
      pairDetails.get(pairKey).matches.push({
        id: match.id,
        roundIndex: match.roundIndex,
        teamAId: match.teamAId,
        teamBId: match.teamBId,
        result: match.games.length > 0 
          ? match.games.map(g => `${g.scoreA}-${g.scoreB}`).join(', ')
          : 'No result'
      })
    })

    const duplicatePairs = []
    pairDetails.forEach((details, pairKey) => {
      if (details.matches.length > 1) {
        duplicatePairs.push(details)
      }
    })

    if (duplicatePairs.length > 0) {
      console.log(`❌ Found ${duplicatePairs.length} pair(s) with multiple matches:`)
      duplicatePairs.forEach((details, idx) => {
        console.log(`\n  Pair ${idx + 1}: ${details.teamA.name} vs ${details.teamB.name}`)
        details.matches.forEach(m => {
          console.log(`    Match ID: ${m.id}, Round: ${m.roundIndex}, Result: ${m.result}`)
        })
      })
    } else {
      console.log(`✅ All pairs are unique (each pair plays exactly once)`)
    }
    console.log()

    // Detailed match list
    console.log('=== Detailed Match List ===')
    rrMatches.forEach((match, idx) => {
      const hasResult = match.games.length > 0 && match.games.some(g => g.scoreA > 0 || g.scoreB > 0)
      const result = hasResult 
        ? match.games.map(g => `${g.scoreA}-${g.scoreB}`).join(', ')
        : 'No result'
      console.log(`${idx + 1}. Round ${match.roundIndex}: ${match.teamA.name} vs ${match.teamB.name} - ${result}`)
    })

  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

checkRRMatches()

