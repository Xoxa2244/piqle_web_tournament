import { initTRPC, TRPCError } from '@trpc/server'
import { type FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch'
import { getServerSession } from 'next-auth'
import type { Session } from 'next-auth'
import { parse as parseCookie } from 'cookie'

import { authOptions } from '@/lib/auth'
import { getSessionFromMobileToken } from '@/lib/mobileAuth'
import { prisma } from '@/lib/prisma'

interface CreateContextOptions {
  session: Session | null
  requestOrigin: string | null
}

const createInnerTRPCContext = (opts: CreateContextOptions) => {
  return {
    session: opts.session,
    prisma,
    requestOrigin: opts.requestOrigin,
  }
}

const getRequestOrigin = (req: Request) => {
  const originHeader = req.headers.get('origin')?.trim()
  if (originHeader) {
    return originHeader.replace(/\/$/, '')
  }

  const forwardedHost = req.headers.get('x-forwarded-host') || req.headers.get('host')
  const forwardedProto = req.headers.get('x-forwarded-proto')
  if (forwardedHost) {
    const protocol = forwardedProto || (forwardedHost.startsWith('localhost') ? 'http' : 'https')
    return `${protocol}://${forwardedHost}`
  }

  try {
    return new URL(req.url).origin
  } catch {
    return null
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

const getBearerTokenFromRequest = (req: Request) => {
  const header = req.headers.get('authorization')
  if (!header) return null
  const [scheme, token] = header.split(' ')
  if (!scheme || !token) return null
  if (scheme.toLowerCase() !== 'bearer') return null
  return token.trim() || null
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
      isActive: dbSession.user.isActive,
    },
    expires: dbSession.expires.toISOString(),
  }
}

export const createTRPCContext = async (opts: FetchCreateContextFnOptions) => {
  let session: Session | null = null
  const bearerToken = getBearerTokenFromRequest(opts.req)

  if (bearerToken) {
    try {
      session = await getSessionFromMobileToken(bearerToken)
    } catch (error) {
      console.error('[TRPC] getSessionFromMobileToken failed', error)
    }
  }

  if (!session) {
    try {
      session = await getServerSession(authOptions)
    } catch (error) {
      console.error('[TRPC] getServerSession failed, falling back to other auth modes', error)
    }
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
    requestOrigin: getRequestOrigin(opts.req),
  })
}

const t = initTRPC.context<typeof createTRPCContext>().create()

export const createTRPCRouter = t.router

export const publicProcedure = t.procedure

const requireActiveSession = (session: Session | null) => {
  if (!session?.user?.id) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }

  if (session.user.isActive === false) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'User account is blocked.' })
  }

  return session as Session & { user: { id: string; isActive?: boolean } }
}

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  const session = requireActiveSession(ctx.session)
  return next({
    ctx: {
      ...ctx,
      session,
    },
  })
})

export const tdProcedure = t.procedure.use(async ({ ctx, next }) => {
  const session = requireActiveSession(ctx.session)

  return next({
    ctx: {
      ...ctx,
      session,
    },
  })
})
