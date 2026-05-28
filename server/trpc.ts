import { cache } from 'react'
import { initTRPC, TRPCError } from '@trpc/server'
import { type FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { Session } from 'next-auth'
import { parse as parseCookie } from 'cookie'
import { assertSuperadminAccess } from './utils/superadminAccess'

// Per-request memoized session lookup. Within a single lambda invocation
// — covering the whole tRPC batch and any Server Components rendered
// alongside it — getServerSession() only runs once even if many code
// paths call it. Each call decrypts the JWT cookie; the cached version
// makes that a no-op after the first hit.
//
// Note: this does NOT dedupe across separate lambda invocations or
// across separate HTTP requests. To dedupe across the dashboard mount
// we rely on httpBatchLink (see components/providers.tsx).
const getCachedSession = cache(async (): Promise<Session | null> => {
  try {
    return await getServerSession(authOptions)
  } catch (error) {
    console.error('[TRPC] getServerSession failed', error)
    return null
  }
})

interface CreateContextOptions {
  session: Session | null
  req?: Request
}

const createInnerTRPCContext = (opts: CreateContextOptions) => {
  return {
    session: opts.session,
    prisma,
    req: opts.req,
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
  // In App Router, getServerSession uses cookies() internally.
  // `getCachedSession` wraps it with React.cache so any other server-
  // side caller in the same request (Server Components, middleware
  // helpers) reuses the result.
  let session: Session | null = await getCachedSession()

  // Defensive fallback: if JWT decode failed for any reason, check the
  // DB Session table directly using the raw cookie. NextAuth's JWT
  // strategy doesn't normally populate that table, so this is almost
  // always a no-op — but keeping it preserves the legacy behaviour
  // for environments that switched strategy mid-flight.
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
    req: opts.req,
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

export const superadminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const superadminAccess = assertSuperadminAccess({ session: ctx.session })

  return next({
    ctx: {
      ...ctx,
      superadminAccess,
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
