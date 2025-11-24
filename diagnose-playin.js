const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const tournamentId = '7ed5aa94-7b73-4c89-b600-f771710bea15'

async function diagnosePlayIn() {
  console.log('=== DIAGNOSTIC: Play-In Analysis ===\n')
  console.log(`Tournament ID: ${tournamentId}\n`)

  try {
    // 1. Get tournament info
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        divisions: {
          include: {
            teams: true
          }
        }
      }
    })

    if (!tournament) {
      console.log('❌ Tournament not found!')
      return
    }

    console.log(`Tournament: ${tournament.title}`)
    console.log(`Divisions: ${tournament.divisions.length}\n`)

    // 2. Check each division
    for (const division of tournament.divisions) {
      console.log(`\n${'='.repeat(60)}`)
      console.log(`Division: ${division.name}`)
      console.log(`Division ID: ${division.id}`)
      console.log(`Teams count: ${division.teams.length}`)
      console.log(`Stage: ${division.stage}`)
      console.log(`${'='.repeat(60)}\n`)

      // 3. Get current standings
      const rrMatches = await prisma.match.findMany({
        where: {
          divisionId: division.id,
          stage: 'ROUND_ROBIN'
        },
        include: {
          teamA: true,
          teamB: true,
          games: true
        }
      })

      // Calculate standings manually
      const teamStats = new Map()
      
      division.teams.forEach(team => {
        teamStats.set(team.id, {
          teamId: team.id,
          teamName: team.name,
          wins: 0,
          losses: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          pointDiff: 0
        })
      })

      rrMatches.forEach(match => {
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

      const standings = Array.from(teamStats.values()).sort((a, b) => {
        if (a.wins !== b.wins) return b.wins - a.wins
        return b.pointDiff - a.pointDiff
      })

      console.log('📊 CURRENT STANDINGS:')
      standings.forEach((team, idx) => {
        console.log(`  ${idx + 1}. ${team.teamName} - W:${team.wins} L:${team.losses} PD:${team.pointDiff > 0 ? '+' : ''}${team.pointDiff}`)
      })
      console.log()

      // 4. Calculate expected Play-In teams
      const N = standings.length
      const getTargetBracketSize = (teamCount) => {
        if (teamCount <= 8) return 4
        if (teamCount <= 16) return 8
        if (teamCount <= 24) return 16
        if (teamCount <= 32) return 32
        return 64
      }
      
      const targetBracketSize = getTargetBracketSize(N)
      const needsPlayIn = targetBracketSize < N && N < 2 * targetBracketSize
      const E = needsPlayIn ? N - targetBracketSize : 0
      const autoQualifiedCount = needsPlayIn ? N - 2 * E : Math.min(targetBracketSize, N)

      console.log('🔢 BRACKET CALCULATION:')
      console.log(`  Total teams (N): ${N}`)
      console.log(`  Target bracket size (B): ${targetBracketSize}`)
      console.log(`  Needs Play-In: ${needsPlayIn}`)
      if (needsPlayIn) {
        console.log(`  E (excess) = N - B = ${E}`)
        console.log(`  Auto-qualified count = N - 2*E = ${autoQualifiedCount}`)
        console.log(`  Play-In teams count = 2*E = ${2 * E}`)
      }
      console.log()

      // 5. Get actual Play-In matches
      const playInMatches = await prisma.match.findMany({
        where: {
          divisionId: division.id,
          stage: 'PLAY_IN'
        },
        include: {
          teamA: true,
          teamB: true,
          games: true
        }
      })

      console.log('🎯 ACTUAL PLAY-IN MATCHES:')
      if (playInMatches.length === 0) {
        console.log('  No Play-In matches found')
      } else {
        playInMatches.forEach((match, idx) => {
          const teamAStanding = standings.findIndex(s => s.teamId === match.teamAId) + 1
          const teamBStanding = standings.findIndex(s => s.teamId === match.teamBId) + 1
          const hasResult = match.games.length > 0 && (match.games[0].scoreA > 0 || match.games[0].scoreB > 0)
          console.log(`  Match ${idx + 1}:`)
          console.log(`    [#${teamAStanding}] ${match.teamA.name} vs [#${teamBStanding}] ${match.teamB.name}`)
          if (hasResult) {
            console.log(`    Score: ${match.games[0].scoreA} - ${match.games[0].scoreB}`)
          } else {
            console.log(`    Score: Not entered`)
          }
        })
      }
      console.log()

      // 6. Compare expected vs actual
      if (needsPlayIn && playInMatches.length > 0) {
        console.log('🔍 COMPARISON: Expected vs Actual')
        
        const expectedPlayInTeams = standings.slice(N - 2 * E)
        const actualPlayInTeamIds = new Set()
        playInMatches.forEach(match => {
          actualPlayInTeamIds.add(match.teamAId)
          actualPlayInTeamIds.add(match.teamBId)
        })

        console.log('\n  Expected Play-In teams (bottom 2E):')
        expectedPlayInTeams.forEach((team, idx) => {
          const standingPos = standings.findIndex(s => s.teamId === team.teamId) + 1
          console.log(`    ${standingPos}. ${team.teamName}`)
        })

        console.log('\n  Actual Play-In teams:')
        Array.from(actualPlayInTeamIds).forEach(teamId => {
          const team = division.teams.find(t => t.id === teamId)
          const standingPos = standings.findIndex(s => s.teamId === teamId) + 1
          if (team) {
            console.log(`    ${standingPos}. ${team.name}`)
          }
        })

        // Check for mismatches
        const expectedIds = new Set(expectedPlayInTeams.map(t => t.teamId))
        const mismatches = []
        
        expectedPlayInTeams.forEach(team => {
          if (!actualPlayInTeamIds.has(team.teamId)) {
            mismatches.push({ type: 'missing', team, position: standings.findIndex(s => s.teamId === team.teamId) + 1 })
          }
        })

        Array.from(actualPlayInTeamIds).forEach(teamId => {
          if (!expectedIds.has(teamId)) {
            const team = division.teams.find(t => t.id === teamId)
            const standingPos = standings.findIndex(s => s.teamId === teamId) + 1
            mismatches.push({ type: 'unexpected', team: { teamId, teamName: team?.name }, position: standingPos })
          }
        })

        if (mismatches.length > 0) {
          console.log('\n  ⚠️  MISMATCHES FOUND:')
          mismatches.forEach(m => {
            if (m.type === 'missing') {
              console.log(`    ❌ Missing: ${m.team.teamName} (position ${m.position}) should be in Play-In but is not`)
            } else {
              console.log(`    ❌ Unexpected: ${m.team.teamName} (position ${m.position}) is in Play-In but should not be`)
            }
          })
        } else {
          console.log('\n  ✅ All teams match expected Play-In teams')
        }
      }
      console.log()

      // 7. Check audit logs
      console.log('📋 AUDIT LOGS (Play-In related):')
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          tournamentId: tournamentId,
          OR: [
            { action: 'GENERATE_PLAYOFFS' },
            { action: 'SWAP_PLAYOFF_TEAMS' },
            { entityId: division.id, action: { contains: 'PLAY' } }
          ]
        },
        include: {
          actor: {
            select: { email: true, name: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 20
      })

      if (auditLogs.length === 0) {
        console.log('  No relevant audit logs found')
      } else {
        auditLogs.forEach(log => {
          console.log(`  [${log.createdAt.toISOString()}] ${log.action}`)
          console.log(`    Actor: ${log.actor.email || log.actor.name || 'Unknown'}`)
          if (log.payload) {
            const payload = typeof log.payload === 'string' ? JSON.parse(log.payload) : log.payload
            if (payload.bracketSize) console.log(`    Bracket Size: ${payload.bracketSize}`)
            if (payload.teamsCount) console.log(`    Teams Count: ${payload.teamsCount}`)
            if (payload.swaps) {
              console.log(`    Swaps: ${JSON.stringify(payload.swaps, null, 6)}`)
            }
          }
          console.log()
        })
      }
      console.log()

      // 8. Check Playoff matches
      const playoffMatches = await prisma.match.findMany({
        where: {
          divisionId: division.id,
          stage: 'ELIMINATION'
        },
        include: {
          teamA: true,
          teamB: true
        },
        orderBy: { roundIndex: 'asc' }
      })

      if (playoffMatches.length > 0) {
        console.log('🏆 PLAYOFF MATCHES:')
        const rounds = new Map()
        playoffMatches.forEach(match => {
          if (!rounds.has(match.roundIndex)) {
            rounds.set(match.roundIndex, [])
          }
          rounds.get(match.roundIndex).push(match)
        })

        rounds.forEach((matches, roundIndex) => {
          console.log(`  Round ${roundIndex}:`)
          matches.forEach(match => {
            const teamAStanding = standings.findIndex(s => s.teamId === match.teamAId) + 1
            const teamBStanding = standings.findIndex(s => s.teamId === match.teamBId) + 1
            console.log(`    [#${teamAStanding}] ${match.teamA.name} vs [#${teamBStanding}] ${match.teamB.name}`)
          })
        })
        console.log()
      }
    }

  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

diagnosePlayIn()




