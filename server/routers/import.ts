import { z } from 'zod'
import { createTRPCRouter, protectedProcedure, tdProcedure } from '../trpc'

export const importRouter = createTRPCRouter({
  resetTournament: tdProcedure
    .input(z.object({ tournamentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Delete all related data in correct order (respecting foreign keys)
      await ctx.prisma.auditLog.deleteMany({
        where: { tournamentId: input.tournamentId }
      })
      
      await ctx.prisma.match.deleteMany({
        where: { 
          OR: [
            { division: { tournamentId: input.tournamentId } },
            { rrGroup: { tournamentId: input.tournamentId } }
          ]
        }
      })
      
      await ctx.prisma.standing.deleteMany({
        where: { 
          OR: [
            { division: { tournamentId: input.tournamentId } },
            { rrGroup: { tournamentId: input.tournamentId } }
          ]
        }
      })
      
      await ctx.prisma.teamPlayer.deleteMany({
        where: { team: { division: { tournamentId: input.tournamentId } } }
      })
      
      await ctx.prisma.team.deleteMany({
        where: { division: { tournamentId: input.tournamentId } }
      })
      
      await ctx.prisma.pool.deleteMany({
        where: { division: { tournamentId: input.tournamentId } }
      })
      
      await ctx.prisma.divisionRRBinding.deleteMany({
        where: { division: { tournamentId: input.tournamentId } }
      })
      
      await ctx.prisma.roundRobinGroup.deleteMany({
        where: { tournamentId: input.tournamentId }
      })
      
      await ctx.prisma.divisionConstraints.deleteMany({
        where: { division: { tournamentId: input.tournamentId } }
      })
      
      await ctx.prisma.division.deleteMany({
        where: { tournamentId: input.tournamentId }
      })
      
      await ctx.prisma.prize.deleteMany({
        where: { tournamentId: input.tournamentId }
      })

      // Log the reset
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: input.tournamentId,
          action: 'RESET',
          entityType: 'Tournament',
          entityId: input.tournamentId,
          payload: { message: 'Tournament reset - all data cleared' },
        },
      })

      return { success: true, message: 'Tournament reset successfully' }
    }),

  importCSV: tdProcedure
    .input(z.object({ 
      tournamentId: z.string(),
      csvData: z.string() // Base64 encoded CSV content
    }))
    .mutation(async ({ ctx, input }) => {
      // Parse CSV data
      const csvText = Buffer.from(input.csvData, 'base64').toString('utf-8')
      const lines = csvText.split('\n').filter(line => line.trim())
      const headers = lines[0].split(',').map(h => h.trim())
      
      // Validate headers
      const requiredHeaders = ['First Name', 'Last Name', 'Gender', 'Age', 'DUPR ID', 'DUPR rating', 'Division', 'Type', 'Team']
      const missingHeaders = requiredHeaders.filter(h => !headers.includes(h))
      if (missingHeaders.length > 0) {
        throw new Error(`Missing required headers: ${missingHeaders.join(', ')}`)
      }

      const participants = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim())
        const participant: any = {}
        headers.forEach((header, index) => {
          participant[header] = values[index] || ''
        })
        return participant
      }).filter(p => p['First Name'] && p['Last Name'])

      // Group participants by division and team
      const divisionMap = new Map()
      
      for (const participant of participants) {
        const divisionName = participant['Division']
        const teamName = participant['Team']
        
        if (!divisionMap.has(divisionName)) {
          divisionMap.set(divisionName, new Map())
        }
        
        if (!divisionMap.get(divisionName).has(teamName)) {
          divisionMap.get(divisionName).set(teamName, [])
        }
        
        divisionMap.get(divisionName).get(teamName).push(participant)
      }

      // Create divisions and teams
      const createdDivisions = new Map()
      const createdTeams = new Map()
      
      for (const [divisionName, teams] of Array.from(divisionMap.entries())) {
        // Get first participant to determine division settings
        const firstParticipant = teams.values().next().value[0]
        const teamKind = firstParticipant['Type'] === '1v1' ? 'SINGLES_1v1' : 
                        firstParticipant['Type'] === '2v2' ? 'DOUBLES_2v2' : 'SQUAD_4v4'
        
        // Parse age constraints
        const ageConstraint = firstParticipant['Age Constraint'] || ''
        const ageMatch = ageConstraint.match(/(\d+)-(\d+)/)
        const minAge = ageMatch ? parseInt(ageMatch[1]) : null
        const maxAge = ageMatch ? parseInt(ageMatch[2]) : null
        
        // Parse DUPR constraints
        const duprConstraint = firstParticipant['DUPR Constraint'] || ''
        const duprMatch = duprConstraint.match(/(\d+\.?\d*)-(\d+\.?\d*)/)
        const minDupr = duprMatch ? parseFloat(duprMatch[1]) : null
        const maxDupr = duprMatch ? parseFloat(duprMatch[2]) : null
        
        // Check if pools are enabled and count them
        const poolsEnabled = Array.from(teams.values() as any[]).some((team: any[]) => 
          team.some((p: any) => p['Pool'] && p['Pool'].trim())
        )
        
        // Count unique pools if enabled
        let poolCount = 1
        if (poolsEnabled) {
          const uniquePools = new Set()
          Array.from(teams.values() as any[]).forEach((team: any[]) => {
            team.forEach((p: any) => {
              if (p['Pool'] && p['Pool'].trim()) {
                uniquePools.add(p['Pool'].trim())
              }
            })
          })
          poolCount = Math.max(uniquePools.size, 1)
        }
        
        // Create division
        const division = await ctx.prisma.division.create({
          data: {
            tournamentId: input.tournamentId,
            name: divisionName,
            teamKind,
            pairingMode: 'FIXED',
            poolCount,
            constraints: {
              create: {
                minAge,
                maxAge,
                minDupr,
                maxDupr,
                genders: 'ANY' as any
              }
            },
            // Create pools if poolCount > 1
            pools: poolCount > 1 ? {
              create: Array.from({ length: poolCount }, (_, i) => ({
                name: `Pool ${i + 1}`,
                order: i + 1,
              }))
            } : undefined
          },
          include: {
            pools: true
          }
        })
        
        createdDivisions.set(divisionName, division)
        
        // Create teams and players
        for (const [teamName, teamParticipants] of Array.from(teams.entries() as any[])) {
          // Determine which pool this team belongs to
          let poolId = null
          if (poolCount > 1) {
            const teamPool = teamParticipants[0]?.['Pool']?.trim()
            if (teamPool) {
              // Find the pool by name
              const pool = division.pools.find(p => p.name === teamPool)
              if (pool) {
                poolId = pool.id
              }
            }
          }
          
          const team = await ctx.prisma.team.create({
            data: {
              divisionId: division.id,
              poolId,
              name: teamName,
            }
          })
          
          createdTeams.set(`${divisionName}-${teamName}`, team)
          
          // Create players
          for (const participant of teamParticipants) {
            const player = await ctx.prisma.player.create({
              data: {
                tournamentId: input.tournamentId,
                firstName: participant['First Name'],
                lastName: participant['Last Name'],
                gender: participant['Gender'] === 'M' ? 'M' : 'F',
                birthDate: new Date(new Date().getFullYear() - parseInt(participant['Age']), 0, 1),
                dupr: participant['DUPR ID'] || null,
                duprRating: participant['DUPR rating'] ? parseFloat(participant['DUPR rating']) : null,
              }
            })
            
            // Add player to team
            await ctx.prisma.teamPlayer.create({
              data: {
                teamId: team.id,
                playerId: player.id,
                role: 'CAPTAIN' // First player is captain
              }
            })
          }
        }
      }

      // Log the import
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: input.tournamentId,
          action: 'IMPORT_CSV',
          entityType: 'Tournament',
          entityId: input.tournamentId,
          payload: { 
            participantsCount: participants.length,
            divisionsCount: createdDivisions.size,
            teamsCount: createdTeams.size
          },
        },
      })

      return { 
        success: true, 
        message: `Imported ${participants.length} participants into ${createdDivisions.size} divisions`,
        divisions: createdDivisions.size,
        teams: createdTeams.size
      }
    }),
})