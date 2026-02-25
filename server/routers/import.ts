import { z } from 'zod'
import { createTRPCRouter, protectedProcedure, tdProcedure } from '../trpc'
import { normalizeEmail } from '@/lib/emailOtp'

export const importRouter = createTRPCRouter({
  resetTournament: tdProcedure
    .input(z.object({ tournamentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const tournamentId = input.tournamentId

      // Collect IDs to clean partner external mappings for deleted entities.
      const [divisionRows, teamRows, playerRows, matchDayRows, matchupRows] = await Promise.all([
        ctx.prisma.division.findMany({
          where: { tournamentId },
          select: { id: true },
        }),
        ctx.prisma.team.findMany({
          where: { division: { tournamentId } },
          select: { id: true },
        }),
        ctx.prisma.player.findMany({
          where: { tournamentId },
          select: { id: true },
        }),
        ctx.prisma.matchDay.findMany({
          where: { tournamentId },
          select: { id: true },
        }),
        ctx.prisma.indyMatchup.findMany({
          where: { matchDay: { tournamentId } },
          select: { id: true },
        }),
      ])

      const divisionIds = divisionRows.map((r) => r.id)
      const teamIds = teamRows.map((r) => r.id)
      const playerIds = playerRows.map((r) => r.id)
      const matchDayIds = matchDayRows.map((r) => r.id)
      const matchupIds = matchupRows.map((r) => r.id)

      await ctx.prisma.$transaction(async (tx) => {
        // Remove partner mappings for entities that will be deleted.
        if (divisionIds.length > 0) {
          await tx.externalIdMapping.deleteMany({
            where: { entityType: 'DIVISION', internalId: { in: divisionIds } },
          })
        }
        if (teamIds.length > 0) {
          await tx.externalIdMapping.deleteMany({
            where: { entityType: 'TEAM', internalId: { in: teamIds } },
          })
        }
        if (playerIds.length > 0) {
          await tx.externalIdMapping.deleteMany({
            where: { entityType: 'PLAYER', internalId: { in: playerIds } },
          })
        }
        if (matchDayIds.length > 0) {
          await tx.externalIdMapping.deleteMany({
            where: { entityType: 'MATCH_DAY', internalId: { in: matchDayIds } },
          })
        }
        if (matchupIds.length > 0) {
          await tx.externalIdMapping.deleteMany({
            where: { entityType: 'MATCHUP', internalId: { in: matchupIds } },
          })
        }

        // Tournament-scoped mutable data.
        await tx.auditLog.deleteMany({ where: { tournamentId } })
        await tx.tournamentComment.deleteMany({ where: { tournamentId } })
        await tx.tournamentRating.deleteMany({ where: { tournamentId } })
        await tx.tournamentInvitation.deleteMany({ where: { tournamentId } })
        await tx.importJob.deleteMany({ where: { tournamentId } })
        await tx.waitlistEntry.deleteMany({ where: { tournamentId } })
        await tx.payment.deleteMany({ where: { tournamentId } })

        // Indy League structures.
        await tx.dayRoster.deleteMany({
          where: { matchup: { matchDay: { tournamentId } } },
        })
        await tx.indyGame.deleteMany({
          where: { matchup: { matchDay: { tournamentId } } },
        })
        await tx.indyMatchup.deleteMany({
          where: { matchDay: { tournamentId } },
        })
        await tx.matchDay.deleteMany({ where: { tournamentId } })

        // Brackets / RR structures.
        await tx.tiebreaker.deleteMany({
          where: {
            match: {
              OR: [{ division: { tournamentId } }, { rrGroup: { tournamentId } }],
            },
          },
        })
        await tx.game.deleteMany({
          where: {
            match: {
              OR: [{ division: { tournamentId } }, { rrGroup: { tournamentId } }],
            },
          },
        })
        await tx.match.deleteMany({
          where: {
            OR: [{ division: { tournamentId } }, { rrGroup: { tournamentId } }],
          },
        })
        await tx.standing.deleteMany({
          where: {
            OR: [{ division: { tournamentId } }, { rrGroup: { tournamentId } }],
          },
        })

        // Teams/divisions/players.
        await tx.teamPlayer.deleteMany({
          where: {
            OR: [{ team: { division: { tournamentId } } }, { player: { tournamentId } }],
          },
        })
        await tx.team.deleteMany({ where: { division: { tournamentId } } })
        await tx.pool.deleteMany({ where: { division: { tournamentId } } })
        await tx.divisionRRBinding.deleteMany({
          where: {
            OR: [{ division: { tournamentId } }, { rrGroup: { tournamentId } }],
          },
        })
        await tx.roundRobinGroup.deleteMany({ where: { tournamentId } })
        await tx.divisionConstraints.deleteMany({
          where: { division: { tournamentId } },
        })
        await tx.division.deleteMany({ where: { tournamentId } })
        await tx.prize.deleteMany({ where: { tournamentId } })
        await tx.player.deleteMany({ where: { tournamentId } })

        // Keep tournament row/settings/public slug intact and write fresh reset log.
        await tx.auditLog.create({
          data: {
            actorUserId: ctx.session.user.id,
            tournamentId,
            action: 'RESET',
            entityType: 'Tournament',
            entityId: tournamentId,
            payload: { message: 'Tournament data reset - tournament settings preserved' },
          },
        })
      })

      return { success: true, message: 'Tournament data reset successfully' }
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
      const headers = lines[0]
        .split(',')
        .map(h => h.trim().replace(/\*+$/, '').trim())
      
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
        
        // Count unique pools if enabled, otherwise default to 1 pool
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
          console.log(`Division ${divisionName}: Found ${uniquePools.size} unique pools:`, Array.from(uniquePools), `Setting poolCount to ${poolCount}`)
        } else {
          console.log(`Division ${divisionName}: No pools specified in CSV, creating default pool`)
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
            // Create pools if poolCount >= 1
            pools: poolCount >= 1 ? {
              create: Array.from({ length: poolCount }, (_, i) => ({
                name: String(i + 1), // Use "1", "2", etc. to match CSV values
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
          if (poolCount >= 1) {
            const teamPool = teamParticipants[0]?.['Pool']?.trim()
            if (teamPool) {
              // Find the pool by name
              const pool = division.pools.find(p => p.name === teamPool)
              if (pool) {
                poolId = pool.id
                console.log(`Team ${teamName} assigned to pool ${teamPool} (ID: ${poolId})`)
              } else {
                console.log(`Pool not found for team ${teamName}, pool value: "${teamPool}", available pools:`, division.pools.map(p => p.name))
                // If pool not found, assign to first pool
                if (division.pools.length > 0) {
                  poolId = division.pools[0].id
                  console.log(`Team ${teamName} assigned to first pool (ID: ${poolId})`)
                }
              }
            } else {
              // No pool specified, assign to first pool
              if (division.pools.length > 0) {
                poolId = division.pools[0].id
                console.log(`Team ${teamName} assigned to first pool (ID: ${poolId})`)
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
          for (let index = 0; index < teamParticipants.length; index++) {
            const participant = teamParticipants[index]
            // Parse age and create birthDate only if age is valid
            let birthDate: Date | undefined = undefined
            const ageStr = participant['Age']?.trim()
            if (ageStr) {
              const age = parseInt(ageStr)
              if (!isNaN(age) && age > 0 && age < 150) {
                birthDate = new Date(new Date().getFullYear() - age, 0, 1)
              }
            }

            const rawEmail = participant['Email']?.trim()
            const normalizedEmail = rawEmail ? normalizeEmail(rawEmail) : null
            const player = await ctx.prisma.player.create({
              data: {
                tournamentId: input.tournamentId,
                firstName: participant['First Name'],
                lastName: participant['Last Name'],
                email: normalizedEmail,
                gender: participant['Gender'] === 'M' ? 'M' : participant['Gender'] === 'F' ? 'F' : undefined,
                birthDate,
                dupr: participant['DUPR ID']?.trim() || null,
                duprRating: participant['DUPR rating']?.trim() ? parseFloat(participant['DUPR rating']) : null,
              }
            })

            // Add player to team with slotIndex so they show in division roster (same as other formats)
            await ctx.prisma.teamPlayer.create({
              data: {
                teamId: team.id,
                playerId: player.id,
                role: index === 0 ? 'CAPTAIN' : 'PLAYER',
                slotIndex: index,
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
