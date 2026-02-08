import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure, tdProcedure } from '../trpc'
import { assertTournamentAdmin } from '../utils/access'

const seedingSchema = z.enum(['BY_SEED', 'RANDOM'])

const shuffle = <T,>(items: T[]) => {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

const computeMatchPoints = (games: Array<{ scoreA: number | null; scoreB: number | null }>) => {
  let pointsA = 0
  let pointsB = 0
  for (const g of games) {
    pointsA += g.scoreA ?? 0
    pointsB += g.scoreB ?? 0
  }
  return { pointsA, pointsB }
}

const computePoolStandings = (input: {
  poolId: string
  teamIds: string[]
  matches: Array<{
    teamAId: string
    teamBId: string
    winnerTeamId: string | null
    games: Array<{ scoreA: number | null; scoreB: number | null }>
  }>
}) => {
  const byTeam: Record<
    string,
    { teamId: string; wins: number; losses: number; pointsFor: number; pointsAgainst: number; pointDiff: number }
  > = {}

  for (const teamId of input.teamIds) {
    byTeam[teamId] = { teamId, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, pointDiff: 0 }
  }

  for (const match of input.matches) {
    const teamA = byTeam[match.teamAId]
    const teamB = byTeam[match.teamBId]
    if (!teamA || !teamB) continue

    const { pointsA, pointsB } = computeMatchPoints(match.games)
    teamA.pointsFor += pointsA
    teamA.pointsAgainst += pointsB
    teamB.pointsFor += pointsB
    teamB.pointsAgainst += pointsA

    if (match.winnerTeamId === match.teamAId) {
      teamA.wins += 1
      teamB.losses += 1
    } else if (match.winnerTeamId === match.teamBId) {
      teamB.wins += 1
      teamA.losses += 1
    }
  }

  for (const stats of Object.values(byTeam)) {
    stats.pointDiff = stats.pointsFor - stats.pointsAgainst
  }

  return Object.values(byTeam).sort((a, b) => {
    if (a.wins !== b.wins) return b.wins - a.wins
    if (a.pointDiff !== b.pointDiff) return b.pointDiff - a.pointDiff
    return b.pointsFor - a.pointsFor
  })
}

export const ladderRouter = createTRPCRouter({
  oneDayGetStatus: protectedProcedure
    .input(z.object({ divisionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const division = await ctx.prisma.division.findUnique({
        where: { id: input.divisionId },
        include: {
          tournament: { select: { id: true, format: true, title: true } },
          pools: { orderBy: { order: 'asc' } },
          teams: { select: { id: true, name: true, seed: true, poolId: true } },
        },
      })

      if (!division) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Division not found' })
      }

      if (division.tournament.format !== 'ONE_DAY_LADDER') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This division is not a One-day Ladder tournament' })
      }

      const roundAgg = await ctx.prisma.match.aggregate({
        where: { divisionId: input.divisionId, stage: 'ROUND_ROBIN', matchDayId: null },
        _max: { roundIndex: true },
      })
      const currentRound = roundAgg._max.roundIndex ?? 0

      const matches =
        currentRound > 0
          ? await ctx.prisma.match.findMany({
              where: {
                divisionId: input.divisionId,
                stage: 'ROUND_ROBIN',
                matchDayId: null,
                roundIndex: currentRound,
              },
              include: {
                teamA: { select: { id: true, name: true } },
                teamB: { select: { id: true, name: true } },
                games: { orderBy: { index: 'asc' } },
              },
            })
          : []

      const poolOrder = new Map(division.pools.map((p) => [p.id, p.order]))
      matches.sort((a, b) => (poolOrder.get(a.poolId ?? '') ?? 0) - (poolOrder.get(b.poolId ?? '') ?? 0))

      const matchesByPool = new Map<string, (typeof matches)[number]>()
      for (const m of matches) {
        if (!m.poolId) continue
        matchesByPool.set(m.poolId, m)
      }

      const canAdvance =
        currentRound > 0 &&
        division.pools.length > 0 &&
        division.pools.every((p) => {
          const match = matchesByPool.get(p.id)
          return Boolean(match?.winnerTeamId)
        })

      return {
        tournament: division.tournament,
        division: { id: division.id, name: division.name },
        pools: division.pools,
        teams: division.teams,
        currentRound,
        matches,
        canAdvance,
      }
    }),

  oneDayInit: tdProcedure
    .input(z.object({ divisionId: z.string(), seeding: seedingSchema.default('BY_SEED') }))
    .mutation(async ({ ctx, input }) => {
      const division = await ctx.prisma.division.findUnique({
        where: { id: input.divisionId },
        include: {
          tournament: { select: { id: true, format: true } },
          pools: { orderBy: { order: 'asc' } },
          teams: { select: { id: true, name: true, seed: true } },
        },
      })

      if (!division) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Division not found' })
      }

      if (division.tournament.format !== 'ONE_DAY_LADDER') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Tournament format must be ONE_DAY_LADDER' })
      }

      await assertTournamentAdmin(ctx.prisma, ctx.session.user.id, division.tournament.id)

      const existing = await ctx.prisma.match.findFirst({
        where: { divisionId: input.divisionId, stage: 'ROUND_ROBIN', matchDayId: null },
        select: { id: true },
      })
      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Ladder already initialized (matches already exist). Delete matches to re-initialize.',
        })
      }

      const teamCount = division.teams.length
      if (teamCount < 2) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Need at least 2 teams to initialize ladder' })
      }
      if (teamCount % 2 !== 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'One-day ladder requires an even number of teams' })
      }
      const courtCount = teamCount / 2

      const teamsSorted =
        input.seeding === 'RANDOM'
          ? shuffle(division.teams)
          : [...division.teams].sort((a, b) => {
              const sa = a.seed ?? Number.POSITIVE_INFINITY
              const sb = b.seed ?? Number.POSITIVE_INFINITY
              if (sa !== sb) return sa - sb
              return a.name.localeCompare(b.name)
            })

      const result = await ctx.prisma.$transaction(async (tx) => {
        const pools = await tx.pool.findMany({
          where: { divisionId: input.divisionId },
          orderBy: { order: 'asc' },
        })

        const existingPools = [...pools]
        const createdPools = []
        for (let i = existingPools.length; i < courtCount; i++) {
          const order = i + 1
          const created = await tx.pool.create({
            data: {
              divisionId: input.divisionId,
              name: `Court ${order}`,
              order,
            },
          })
          createdPools.push(created)
        }

        const finalPools = [...existingPools, ...createdPools].sort((a, b) => a.order - b.order).slice(0, courtCount)

        // Assign 2 teams per court (pool)
        const updates: Array<{ teamId: string; poolId: string }> = []
        for (let i = 0; i < teamsSorted.length; i++) {
          const pool = finalPools[Math.floor(i / 2)]
          if (!pool) continue
          updates.push({ teamId: teamsSorted[i]!.id, poolId: pool.id })
        }

        for (const u of updates) {
          await tx.team.update({
            where: { id: u.teamId },
            data: { poolId: u.poolId },
          })
        }

        // Create round 1 matches (one per court)
        const matches = []
        for (let i = 0; i < finalPools.length; i++) {
          const pool = finalPools[i]!
          const teamA = teamsSorted[i * 2]
          const teamB = teamsSorted[i * 2 + 1]
          if (!teamA || !teamB) continue

          const match = await tx.match.create({
            data: {
              divisionId: input.divisionId,
              poolId: pool.id,
              teamAId: teamA.id,
              teamBId: teamB.id,
              roundIndex: 1,
              stage: 'ROUND_ROBIN',
              bestOfMode: 'FIXED_GAMES',
              gamesCount: 1,
              targetPoints: 11,
              winBy: 2,
              locked: false,
              note: `Court ${pool.order}`,
            },
          })
          matches.push(match)
        }

        await tx.auditLog.create({
          data: {
            actorUserId: ctx.session.user.id,
            tournamentId: division.tournament.id,
            action: 'ONE_DAY_LADDER_INIT',
            entityType: 'Division',
            entityId: input.divisionId,
            payload: {
              courtCount,
              seeding: input.seeding,
              teamCount,
            },
          },
        })

        return { pools: finalPools, matches }
      })

      return { courtCount: result.pools.length, round: 1, matchesCreated: result.matches.length }
    }),

  oneDayAdvanceRound: tdProcedure
    .input(z.object({ divisionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const division = await ctx.prisma.division.findUnique({
        where: { id: input.divisionId },
        include: {
          tournament: { select: { id: true, format: true } },
          pools: { orderBy: { order: 'asc' } },
          teams: { select: { id: true, poolId: true } },
        },
      })

      if (!division) throw new TRPCError({ code: 'NOT_FOUND', message: 'Division not found' })
      if (division.tournament.format !== 'ONE_DAY_LADDER') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Tournament format must be ONE_DAY_LADDER' })
      }

      await assertTournamentAdmin(ctx.prisma, ctx.session.user.id, division.tournament.id)

      const roundAgg = await ctx.prisma.match.aggregate({
        where: { divisionId: input.divisionId, stage: 'ROUND_ROBIN', matchDayId: null },
        _max: { roundIndex: true },
      })
      const currentRound = roundAgg._max.roundIndex ?? 0
      if (currentRound <= 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Ladder not initialized yet' })
      }

      const matches = await ctx.prisma.match.findMany({
        where: { divisionId: input.divisionId, stage: 'ROUND_ROBIN', matchDayId: null, roundIndex: currentRound },
        select: { id: true, poolId: true, teamAId: true, teamBId: true, winnerTeamId: true },
      })

      const matchesByPool = new Map<string, typeof matches[number]>()
      for (const m of matches) {
        if (!m.poolId) continue
        matchesByPool.set(m.poolId, m)
      }

      if (division.pools.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No courts (pools) found for this division' })
      }

      const winners: string[] = []
      const losers: string[] = []

      for (const pool of division.pools) {
        const match = matchesByPool.get(pool.id)
        if (!match) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Missing match for Court ${pool.order} in round ${currentRound}`,
          })
        }
        if (!match.winnerTeamId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Round ${currentRound} is not complete. Enter scores for Court ${pool.order}.`,
          })
        }

        const winnerId = match.winnerTeamId
        const loserId = winnerId === match.teamAId ? match.teamBId : match.teamAId
        winners.push(winnerId)
        losers.push(loserId)
      }

      const n = division.pools.length
      const nextRound = currentRound + 1

      const nextAssignments: Array<{ poolId: string; teamIds: [string, string] }> = []
      if (n === 1) {
        nextAssignments.push({ poolId: division.pools[0]!.id, teamIds: [winners[0]!, losers[0]!] })
      } else {
        // Court 1: winner stays + winner from Court 2 moves up
        nextAssignments.push({
          poolId: division.pools[0]!.id,
          teamIds: [winners[0]!, winners[1]!],
        })

        // Middle courts: loser from above + winner from below
        for (let i = 1; i <= n - 2; i++) {
          nextAssignments.push({
            poolId: division.pools[i]!.id,
            teamIds: [losers[i - 1]!, winners[i + 1]!],
          })
        }

        // Bottom court: loser from above + loser stays
        nextAssignments.push({
          poolId: division.pools[n - 1]!.id,
          teamIds: [losers[n - 2]!, losers[n - 1]!],
        })
      }

      // Validate: each team appears exactly once
      const flatNext = nextAssignments.flatMap((x) => x.teamIds)
      const uniqueNext = new Set(flatNext)
      if (uniqueNext.size !== flatNext.length) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Invalid ladder transition (duplicate teams detected)',
        })
      }

      const existingNextRound = await ctx.prisma.match.findFirst({
        where: { divisionId: input.divisionId, stage: 'ROUND_ROBIN', matchDayId: null, roundIndex: nextRound },
        select: { id: true },
      })
      if (existingNextRound) {
        throw new TRPCError({ code: 'CONFLICT', message: `Round ${nextRound} already exists` })
      }

      const created = await ctx.prisma.$transaction(async (tx) => {
        // Move teams
        for (const assignment of nextAssignments) {
          for (const teamId of assignment.teamIds) {
            await tx.team.update({
              where: { id: teamId },
              data: { poolId: assignment.poolId },
            })
          }
        }

        // Create next round matches
        const newMatches = []
        for (const assignment of nextAssignments) {
          const [teamAId, teamBId] = assignment.teamIds
          const pool = division.pools.find((p) => p.id === assignment.poolId)
          const match = await tx.match.create({
            data: {
              divisionId: input.divisionId,
              poolId: assignment.poolId,
              teamAId,
              teamBId,
              roundIndex: nextRound,
              stage: 'ROUND_ROBIN',
              bestOfMode: 'FIXED_GAMES',
              gamesCount: 1,
              targetPoints: 11,
              winBy: 2,
              locked: false,
              note: pool ? `Court ${pool.order}` : undefined,
            },
          })
          newMatches.push(match)
        }

        await tx.auditLog.create({
          data: {
            actorUserId: ctx.session.user.id,
            tournamentId: division.tournament.id,
            action: 'ONE_DAY_LADDER_ADVANCE_ROUND',
            entityType: 'Division',
            entityId: input.divisionId,
            payload: {
              fromRound: currentRound,
              toRound: nextRound,
            },
          },
        })

        return newMatches
      })

      return { round: nextRound, matchesCreated: created.length }
    }),

  leagueInit: tdProcedure
    .input(z.object({ divisionId: z.string(), seeding: seedingSchema.default('BY_SEED'), podSizeTeams: z.literal(4).default(4) }))
    .mutation(async ({ ctx, input }) => {
      const division = await ctx.prisma.division.findUnique({
        where: { id: input.divisionId },
        include: {
          tournament: { select: { id: true, format: true } },
          pools: { orderBy: { order: 'asc' } },
          teams: { select: { id: true, name: true, seed: true } },
        },
      })

      if (!division) throw new TRPCError({ code: 'NOT_FOUND', message: 'Division not found' })
      if (division.tournament.format !== 'LADDER_LEAGUE') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Tournament format must be LADDER_LEAGUE' })
      }

      await assertTournamentAdmin(ctx.prisma, ctx.session.user.id, division.tournament.id)

      const teamCount = division.teams.length
      if (teamCount < input.podSizeTeams) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Need at least ${input.podSizeTeams} teams` })
      }
      if (teamCount % input.podSizeTeams !== 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Team count must be a multiple of ${input.podSizeTeams} (got ${teamCount})`,
        })
      }
      const podCount = teamCount / input.podSizeTeams

      const teamsSorted =
        input.seeding === 'RANDOM'
          ? shuffle(division.teams)
          : [...division.teams].sort((a, b) => {
              const sa = a.seed ?? Number.POSITIVE_INFINITY
              const sb = b.seed ?? Number.POSITIVE_INFINITY
              if (sa !== sb) return sa - sb
              return a.name.localeCompare(b.name)
            })

      const result = await ctx.prisma.$transaction(async (tx) => {
        const pools = await tx.pool.findMany({
          where: { divisionId: input.divisionId },
          orderBy: { order: 'asc' },
        })

        const existingPools = [...pools]
        const createdPools = []
        for (let i = existingPools.length; i < podCount; i++) {
          const order = i + 1
          const created = await tx.pool.create({
            data: {
              divisionId: input.divisionId,
              name: `Pod ${order}`,
              order,
            },
          })
          createdPools.push(created)
        }

        const finalPools = [...existingPools, ...createdPools].sort((a, b) => a.order - b.order).slice(0, podCount)

        // Assign teams by pods (fixed size)
        for (let i = 0; i < teamsSorted.length; i++) {
          const pool = finalPools[Math.floor(i / input.podSizeTeams)]
          if (!pool) continue
          await tx.team.update({
            where: { id: teamsSorted[i]!.id },
            data: { poolId: pool.id },
          })
        }

        await tx.auditLog.create({
          data: {
            actorUserId: ctx.session.user.id,
            tournamentId: division.tournament.id,
            action: 'LADDER_LEAGUE_INIT',
            entityType: 'Division',
            entityId: input.divisionId,
            payload: {
              podCount,
              podSizeTeams: input.podSizeTeams,
              seeding: input.seeding,
              teamCount,
            },
          },
        })

        return { pools: finalPools }
      })

      return { podCount: result.pools.length, podSizeTeams: input.podSizeTeams }
    }),

  leagueGetStatus: protectedProcedure
    .input(z.object({ divisionId: z.string(), matchDayId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const division = await ctx.prisma.division.findUnique({
        where: { id: input.divisionId },
        include: {
          tournament: { select: { id: true, format: true, title: true } },
          pools: { orderBy: { order: 'asc' } },
          teams: { select: { id: true, name: true, seed: true, poolId: true } },
        },
      })

      if (!division) throw new TRPCError({ code: 'NOT_FOUND', message: 'Division not found' })
      if (division.tournament.format !== 'LADDER_LEAGUE') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This division is not a Ladder League tournament' })
      }

      const tournamentId = division.tournament.id

      let matchDayId = input.matchDayId ?? null
      let matchDay: { id: string; date: Date; status: string } | null = null

      if (matchDayId) {
        matchDay = await ctx.prisma.matchDay.findFirst({
          where: { id: matchDayId, tournamentId },
          select: { id: true, date: true, status: true },
        })
        if (!matchDay) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Match day not found' })
        }
      } else {
        matchDay = await ctx.prisma.matchDay.findFirst({
          where: { tournamentId },
          orderBy: { date: 'desc' },
          select: { id: true, date: true, status: true },
        })
        matchDayId = matchDay?.id ?? null
      }

      const matches =
        matchDayId != null
          ? await ctx.prisma.match.findMany({
              where: {
                divisionId: input.divisionId,
                stage: 'ROUND_ROBIN',
                matchDayId,
              },
              include: {
                teamA: { select: { id: true, name: true } },
                teamB: { select: { id: true, name: true } },
                games: { orderBy: { index: 'asc' } },
              },
            })
          : []

      const matchesByPool = new Map<string, typeof matches>()
      for (const m of matches) {
        if (!m.poolId) continue
        const list = matchesByPool.get(m.poolId) ?? []
        list.push(m)
        matchesByPool.set(m.poolId, list)
      }

      const teamIdsByPool = new Map<string, string[]>()
      for (const p of division.pools) teamIdsByPool.set(p.id, [])
      for (const t of division.teams) {
        if (!t.poolId) continue
        const list = teamIdsByPool.get(t.poolId) ?? []
        list.push(t.id)
        teamIdsByPool.set(t.poolId, list)
      }

      const standingsByPool = division.pools.map((p) => ({
        poolId: p.id,
        poolOrder: p.order,
        poolName: p.name,
        standings: computePoolStandings({
          poolId: p.id,
          teamIds: teamIdsByPool.get(p.id) ?? [],
          matches: (matchesByPool.get(p.id) ?? []).map((m) => ({
            teamAId: m.teamAId,
            teamBId: m.teamBId,
            winnerTeamId: m.winnerTeamId ?? null,
            games: m.games.map((g) => ({ scoreA: g.scoreA, scoreB: g.scoreB })),
          })),
        }),
      }))

      return {
        tournament: division.tournament,
        division: { id: division.id, name: division.name },
        pools: division.pools,
        teams: division.teams,
        matchDay,
        matches,
        standingsByPool,
      }
    }),

  leagueCloseWeek: tdProcedure
    .input(z.object({ divisionId: z.string(), matchDayId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const division = await ctx.prisma.division.findUnique({
        where: { id: input.divisionId },
        include: {
          tournament: { select: { id: true, format: true } },
          pools: { orderBy: { order: 'asc' } },
          teams: { select: { id: true, poolId: true } },
        },
      })

      if (!division) throw new TRPCError({ code: 'NOT_FOUND', message: 'Division not found' })
      if (division.tournament.format !== 'LADDER_LEAGUE') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Tournament format must be LADDER_LEAGUE' })
      }

      await assertTournamentAdmin(ctx.prisma, ctx.session.user.id, division.tournament.id)

      const matchDay = await ctx.prisma.matchDay.findFirst({
        where: { id: input.matchDayId, tournamentId: division.tournament.id },
        select: { id: true, date: true, status: true },
      })
      if (!matchDay) throw new TRPCError({ code: 'NOT_FOUND', message: 'Match day not found' })

      const matches = await ctx.prisma.match.findMany({
        where: { divisionId: input.divisionId, stage: 'ROUND_ROBIN', matchDayId: input.matchDayId },
        include: { games: true },
      })

      if (matches.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No matches found for this match day' })
      }

      const incomplete = matches.filter((m) => !m.winnerTeamId)
      if (incomplete.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot close week: ${incomplete.length} match(es) are missing winners`,
        })
      }

      const matchesByPool = new Map<string, typeof matches>()
      for (const m of matches) {
        if (!m.poolId) continue
        const list = matchesByPool.get(m.poolId) ?? []
        list.push(m)
        matchesByPool.set(m.poolId, list)
      }

      const teamIdsByPool = new Map<string, string[]>()
      for (const p of division.pools) teamIdsByPool.set(p.id, [])
      for (const t of division.teams) {
        if (!t.poolId) continue
        const list = teamIdsByPool.get(t.poolId) ?? []
        list.push(t.id)
        teamIdsByPool.set(t.poolId, list)
      }

      const standingsByPool = new Map<string, ReturnType<typeof computePoolStandings>>()
      for (const p of division.pools) {
        standingsByPool.set(
          p.id,
          computePoolStandings({
            poolId: p.id,
            teamIds: teamIdsByPool.get(p.id) ?? [],
            matches: (matchesByPool.get(p.id) ?? []).map((m) => ({
              teamAId: m.teamAId,
              teamBId: m.teamBId,
              winnerTeamId: m.winnerTeamId ?? null,
              games: m.games.map((g) => ({ scoreA: g.scoreA, scoreB: g.scoreB })),
            })),
          })
        )
      }

      const swaps: Array<{ fromPoolId: string; toPoolId: string; promotedTeamId: string; demotedTeamId: string }> = []
      for (let i = 0; i < division.pools.length - 1; i++) {
        const upper = division.pools[i]!
        const lower = division.pools[i + 1]!
        const lowerStanding = standingsByPool.get(lower.id) ?? []
        const upperStanding = standingsByPool.get(upper.id) ?? []
        const promoted = lowerStanding[0]
        const demoted = upperStanding[upperStanding.length - 1]
        if (!promoted || !demoted) continue

        swaps.push({
          fromPoolId: lower.id,
          toPoolId: upper.id,
          promotedTeamId: promoted.teamId,
          demotedTeamId: demoted.teamId,
        })
      }

      const applied = await ctx.prisma.$transaction(async (tx) => {
        for (const s of swaps) {
          await tx.team.update({ where: { id: s.promotedTeamId }, data: { poolId: s.toPoolId } })
          await tx.team.update({ where: { id: s.demotedTeamId }, data: { poolId: s.fromPoolId } })
        }

        await tx.matchDay.update({
          where: { id: input.matchDayId },
          data: { status: 'FINALIZED' },
        })

        await tx.auditLog.create({
          data: {
            actorUserId: ctx.session.user.id,
            tournamentId: division.tournament.id,
            action: 'LADDER_LEAGUE_CLOSE_WEEK',
            entityType: 'MatchDay',
            entityId: input.matchDayId,
            payload: {
              date: matchDay.date.toISOString(),
              swaps,
            },
          },
        })

        return swaps.length
      })

      return { matchDayId: input.matchDayId, swaps, swapsApplied: applied }
    }),
})

