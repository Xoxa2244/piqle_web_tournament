import { initTRPC, TRPCError } from '@trpc/server'
import { type FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { Session } from 'next-auth'
import { parse as parseCookie } from 'cookie'

interface CreateContextOptions {
  session: Session | null
}

const createInnerTRPCContext = (opts: CreateContextOptions) => {
  return {
    session: opts.session,
    prisma,
  }
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
  // In App Router, getServerSession uses cookies() internally
  let session = await getServerSession(authOptions)

  if (!session) {
    const sessionToken = getSessionTokenFromRequest(opts.req)
    if (sessionToken) {
      session = await getSessionFromDb(sessionToken)
    }
  }

  return createInnerTRPCContext({
    session,
  })
}

const t = initTRPC.context<typeof createTRPCContext>().create()

export const createTRPCRouter = t.router

export const publicProcedure = t.procedure

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session?.user?.id) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }
  const user = await ctx.prisma.user.findUnique({
    where: { id: ctx.session.user.id },
    select: { isActive: true },
  })
  if (user && user.isActive === false) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'User account is blocked.' })
  }
  return next({
    ctx: {
      ...ctx,
      session: ctx.session as Session & { user: { id: string } },
    },
  })
})

export const tdProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session?.user?.id) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }
  const user = await ctx.prisma.user.findUnique({
    where: { id: ctx.session.user.id },
    select: { isActive: true },
  })
  if (user && user.isActive === false) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'User account is blocked.' })
  }

  // For now, tdProcedure just checks authentication
  // Tournament ownership/access will be checked in individual endpoints
  // This ensures user is logged in and has an ID

  return next({
    ctx: {
      ...ctx,
      session: ctx.session as Session & { user: { id: string } },
    },
  })
})
