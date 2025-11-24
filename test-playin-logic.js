// Test Play-In logic for 6 teams
const N = 6  // Total teams
const B = 4  // Target bracket size

console.log('=== Testing Play-In Logic for 6 Teams ===\n')
console.log(`N (total teams) = ${N}`)
console.log(`B (bracket size) = ${B}\n`)

// Check if play-in is needed
const needsPlayIn = B < N && N < 2 * B
console.log(`Needs Play-In: ${needsPlayIn} (${B} < ${N} && ${N} < ${2 * B})`)

if (needsPlayIn) {
  const E = N - B
  console.log(`E (excess) = N - B = ${E}\n`)
  
  // Simulate standings (positions 1-6)
  const standings = [
    { teamId: 'team1', teamName: 'Team 3', rank: 1 },
    { teamId: 'team2', teamName: 'Team 5', rank: 2 },
    { teamId: 'team3', teamName: 'Team 1', rank: 3 },
    { teamId: 'team4', teamName: 'Team 6', rank: 4 },
    { teamId: 'team5', teamName: 'Team 2', rank: 5 },
    { teamId: 'team6', teamName: 'Team 4', rank: 6 },
  ]
  
  // Calculate expected Play-In teams
  const playInTeams = standings.slice(N - 2 * E)
  const autoQualified = standings.slice(0, N - 2 * E)
  
  console.log('Expected Auto-Qualified (first N - 2*E):')
  autoQualified.forEach((team, idx) => {
    console.log(`  ${idx + 1}. ${team.teamName} (rank ${team.rank})`)
  })
  
  console.log('\nExpected Play-In teams (last 2*E):')
  playInTeams.forEach((team, idx) => {
    console.log(`  ${idx + 1}. ${team.teamName} (rank ${team.rank})`)
  })
  
  // Test generatePlayInMatches
  console.log('\n=== Testing generatePlayInMatches ===')
  const E_matches = playInTeams.length / 2
  console.log(`E (number of matches) = ${playInTeams.length} / 2 = ${E_matches}`)
  
  const matches = []
  for (let i = 0; i < E_matches; i++) {
    const teamA = playInTeams[i]
    const teamB = playInTeams[playInTeams.length - 1 - i]
    matches.push({
      match: i + 1,
      teamA: teamA.teamName,
      teamB: teamB.teamName
    })
  }
  
  console.log('\nGenerated Play-In matches:')
  matches.forEach(m => {
    console.log(`  Match ${m.match}: ${m.teamA} vs ${m.teamB}`)
  })
  
  // Check for potential bugs
  console.log('\n=== Checking for potential bugs ===')
  
  // Bug 1: Wrong slice direction
  const wrongPlayInTeams = standings.slice(0, 2 * E)  // First 2E instead of last 2E
  console.log('\n❌ WRONG (if using slice(0, 2*E) - first teams):')
  wrongPlayInTeams.forEach((team, idx) => {
    console.log(`  ${idx + 1}. ${team.teamName} (rank ${team.rank})`)
  })
  
  // Bug 2: Wrong calculation of E
  const wrongE = Math.floor(N / 2)  // E = 3 instead of 2
  console.log(`\n❌ WRONG (if E = floor(N/2) = ${wrongE} instead of ${E}):`)
  const wrongPlayInTeams2 = standings.slice(N - 2 * wrongE)
  wrongPlayInTeams2.forEach((team, idx) => {
    console.log(`  ${idx + 1}. ${team.teamName} (rank ${team.rank})`)
  })
  
  // Bug 3: Using wrong bracket size
  const wrongB = 2  // B = 2 instead of 4
  const wrongE2 = N - wrongB
  console.log(`\n❌ WRONG (if B = ${wrongB} instead of ${B}, then E = ${wrongE2}):`)
  const wrongPlayInTeams3 = standings.slice(N - 2 * wrongE2)
  wrongPlayInTeams3.forEach((team, idx) => {
    console.log(`  ${idx + 1}. ${team.teamName} (rank ${team.rank})`)
  })
  
  // Check actual bug scenario: Team 3 and Team 5 in Play-In
  console.log('\n=== Actual Bug Scenario ===')
  console.log('Actual Play-In teams (from diagnostic): Team 3, Team 5')
  console.log('These are ranks 1 and 2 (first 2 teams)')
  console.log('\nPossible causes:')
  console.log('1. Used standings.slice(0, 2) instead of standings.slice(N - 2*E)')
  console.log('2. Used wrong bracket size calculation')
  console.log('3. Manual swap/edit that put wrong teams in Play-In')
}




