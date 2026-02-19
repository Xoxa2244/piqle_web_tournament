import { initTRPC, TRPCError } from '@trpc/server'
import { type FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { Session } from 'next-auth'
import { parse as parseCookie } from 'cookie'

export type ClientType = 'web' | 'mobile'

interface CreateContextOptions {
  session: Session | null
  clientType: ClientType
}

const createInnerTRPCContext = (opts: CreateContextOptions) => {
  return {
    session: opts.session,
    clientType: opts.clientType,
    prisma,
  }
}

const isWebOnlyManagementFormat = (format: unknown) =>
  format === 'MLP' || format === 'INDY_LEAGUE'

const getInputObject = (rawInput: unknown): Record<string, unknown> | null => {
  if (!rawInput || typeof rawInput !== 'object') return null
  return rawInput as Record<string, unknown>
}

const getStringField = (input: Record<string, unknown>, key: string): string | null => {
  const value = input[key]
  return typeof value === 'string' ? value : null
}

const resolveClientType = (req: Request): ClientType => {
  const explicitClientType = req.headers.get('x-client-type')?.toLowerCase()
  if (explicitClientType === 'mobile') {
    return 'mobile'
  }
  try {
    const pathname = new URL(req.url).pathname
    if (pathname.startsWith('/api/mobile/trpc')) {
      return 'mobile'
    }
  } catch {
    // no-op: fall back to web
  }
  return 'web'
}

const getSessionTokenFromRequest = (req: Request) => {
  const cookieHeader = req.headers.get('cookie')
  if (!cookieHeader) return null
  const cookies = parseCookie(cookieHeader)
  return (
    cookies['__Secure-next-auth.session-token'] ||
    cookies['__Host-next-auth.session-token'] ||
    cookies['next-auth.session-token'] ||
    cookies['_Secure-next-auth.session-token'] ||
    null
  )
}

const getSessionFromDb = async (sessionToken: string): Promise<Session | null> => {
  const dbSession = await prisma.session.findUnique({
    where: { sessionToken },
    include: { user: true },
  })

  if (!dbSession) return null

  return {
    user: {
      id: dbSession.userId,
      email: dbSession.user.email,
      name: dbSession.user.name,
      image: dbSession.user.image,
    },
    expires: dbSession.expires.toISOString(),
  }
}

export const createTRPCContext = async (opts: FetchCreateContextFnOptions) => {
  // In App Router, getServerSession uses cookies() internally.
  // If NextAuth is misconfigured (e.g. missing NEXTAUTH_SECRET in an env),
  // do not break all TRPC requests; gracefully continue as anonymous/fallback.
  let session: Session | null = null
  try {
    session = await getServerSession(authOptions)
  } catch (error) {
    console.error('[TRPC] getServerSession failed, falling back to DB session lookup', error)
  }

  if (!session) {
    const sessionToken = getSessionTokenFromRequest(opts.req)
    if (sessionToken) {
      try {
        session = await getSessionFromDb(sessionToken)
      } catch (error) {
        console.error('[TRPC] getSessionFromDb failed', error)
      }
    }
  }

  return createInnerTRPCContext({
    session,
    clientType: resolveClientType(opts.req),
  })
}

const t = initTRPC.context<typeof createTRPCContext>().create()

export const createTRPCRouter = t.router

export const publicProcedure = t.procedure

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session?.user?.id) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }
  return next({
    ctx: {
      ...ctx,
      session: ctx.session as Session & { user: { id: string } },
    },
  })
})

export const tdProcedure = t.procedure.use(async ({ ctx, next, rawInput, path, type }) => {
  if (!ctx.session?.user?.id) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }

  if (ctx.clientType === 'mobile' && type === 'mutation') {
    const input = getInputObject(rawInput)
    if (input) {
      const inputFormat = getStringField(input, 'format')
      if (path === 'tournament.create' && isWebOnlyManagementFormat(inputFormat)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'WEB_ONLY_MANAGEMENT' })
      }

      const assertAllowedFormat = (format: unknown) => {
        if (isWebOnlyManagementFormat(format)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'WEB_ONLY_MANAGEMENT' })
        }
      }

      const findTournamentFormat = async (tournamentId: string) => {
        const tournament = await ctx.prisma.tournament.findUnique({
          where: { id: tournamentId },
          select: { format: true },
        })
        return tournament?.format ?? null
      }

      const findDivisionFormat = async (divisionId: string) => {
        const division = await ctx.prisma.division.findUnique({
          where: { id: divisionId },
          select: { tournament: { select: { format: true } } },
        })
        return division?.tournament?.format ?? null
      }

      const findTeamFormat = async (teamId: string) => {
        const team = await ctx.prisma.team.findUnique({
          where: { id: teamId },
          select: { division: { select: { tournament: { select: { format: true } } } } },
        })
        return team?.division?.tournament?.format ?? null
      }

      const findPoolFormat = async (poolId: string) => {
        const pool = await ctx.prisma.pool.findUnique({
          where: { id: poolId },
          select: { division: { select: { tournament: { select: { format: true } } } } },
        })
        return pool?.division?.tournament?.format ?? null
      }

      const findMatchFormat = async (matchId: string) => {
        const match = await ctx.prisma.match.findUnique({
          where: { id: matchId },
          select: { division: { select: { tournament: { select: { format: true } } } } },
        })
        return match?.division?.tournament?.format ?? null
      }

      const findMatchDayFormat = async (matchDayId: string) => {
        const matchDay = await ctx.prisma.matchDay.findUnique({
          where: { id: matchDayId },
          select: { tournament: { select: { format: true } } },
        })
        return matchDay?.tournament?.format ?? null
      }

      const findIndyMatchupFormat = async (matchupId: string) => {
        const matchup = await ctx.prisma.indyMatchup.findUnique({
          where: { id: matchupId },
          select: { matchDay: { select: { tournament: { select: { format: true } } } } },
        })
        return matchup?.matchDay?.tournament?.format ?? null
      }

      const findCourtFormat = async (courtId: string) => {
        const court = await ctx.prisma.court.findUnique({
          where: { id: courtId },
          select: { tournament: { select: { format: true } } },
        })
        return court?.tournament?.format ?? null
      }

      const findPlayerFormat = async (playerId: string) => {
        const player = await ctx.prisma.player.findUnique({
          where: { id: playerId },
          select: { tournament: { select: { format: true } } },
        })
        return player?.tournament?.format ?? null
      }

      const findTeamPlayerFormat = async (teamPlayerId: string) => {
        const teamPlayer = await ctx.prisma.teamPlayer.findUnique({
          where: { id: teamPlayerId },
          select: { team: { select: { division: { select: { tournament: { select: { format: true } } } } } } },
        })
        return teamPlayer?.team?.division?.tournament?.format ?? null
      }

      const findAccessFormat = async (accessId: string) => {
        const access = await ctx.prisma.tournamentAccess.findUnique({
          where: { id: accessId },
          select: { tournament: { select: { format: true } } },
        })
        return access?.tournament?.format ?? null
      }

      const findAccessRequestFormat = async (requestId: string) => {
        const request = await ctx.prisma.tournamentAccessRequest.findUnique({
          where: { id: requestId },
          select: { tournament: { select: { format: true } } },
        })
        return request?.tournament?.format ?? null
      }

      const findTournamentFormatFromInput = async () => {
        const tournamentId = getStringField(input, 'tournamentId')
        if (tournamentId) return findTournamentFormat(tournamentId)

        const divisionId = getStringField(input, 'divisionId') || getStringField(input, 'mergedDivisionId')
        if (divisionId) return findDivisionFormat(divisionId)

        const teamId = getStringField(input, 'teamId')
        if (teamId) return findTeamFormat(teamId)

        const poolId = getStringField(input, 'poolId')
        if (poolId) return findPoolFormat(poolId)

        const matchId = getStringField(input, 'matchId')
        if (matchId) return findMatchFormat(matchId)

        const matchDayId = getStringField(input, 'matchDayId')
        if (matchDayId) return findMatchDayFormat(matchDayId)

        const matchupId = getStringField(input, 'matchupId')
        if (matchupId) return findIndyMatchupFormat(matchupId)

        const courtId = getStringField(input, 'courtId')
        if (courtId) return findCourtFormat(courtId)

        const playerId = getStringField(input, 'playerId')
        if (playerId) return findPlayerFormat(playerId)

        const teamPlayerId = getStringField(input, 'teamPlayerId')
        if (teamPlayerId) return findTeamPlayerFormat(teamPlayerId)

        const accessId = getStringField(input, 'accessId')
        if (accessId) return findAccessFormat(accessId)

        const requestId = getStringField(input, 'requestId')
        if (requestId) return findAccessRequestFormat(requestId)

        return null
      }

      let format = await findTournamentFormatFromInput()

      if (!format) {
        const id = getStringField(input, 'id')
        if (id) {
          if (path?.startsWith('tournament.')) {
            format = await findTournamentFormat(id)
          } else if (path?.startsWith('division.')) {
            format = await findDivisionFormat(id)
          } else if (path?.startsWith('team.')) {
            format = await findTeamFormat(id)
          } else if (path?.startsWith('player.')) {
            format = await findPlayerFormat(id)
          } else if (path?.startsWith('match.')) {
            format = await findMatchFormat(id)
          } else if (path?.startsWith('teamPlayer.')) {
            format = await findTeamPlayerFormat(id)
          }
        }
      }

      assertAllowedFormat(format)
    }
  }

  return next({
    ctx: {
      ...ctx,
      session: ctx.session as Session & { user: { id: string } },
    },
  })
})
