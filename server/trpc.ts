import { initTRPC, TRPCError } from '@trpc/server'
import { type FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { Session } from 'next-auth'

interface CreateContextOptions {
  session: Session | null
}

const createInnerTRPCContext = (opts: CreateContextOptions) => {
  return {
    session: opts.session,
    prisma,
  }
}

export const createTRPCContext = async (opts: FetchCreateContextFnOptions) => {
  // Get session from NextAuth
  // In App Router, getServerSession should work without explicit headers
  // But we'll pass headers explicitly to ensure cookies are available
  const session = await getServerSession(authOptions)
  
  // Debug logging
  const isTournamentList = opts.req.url?.includes('/trpc/tournament.list')
  if (isTournamentList) {
    console.log('[tRPC Context] Tournament.list request')
    console.log('[tRPC Context] Request URL:', opts.req.url)
    console.log('[tRPC Context] Request headers cookie:', opts.req.headers.get('cookie') ? 'PRESENT' : 'MISSING')
    console.log('[tRPC Context] Session exists:', !!session)
    console.log('[tRPC Context] Session user id:', session?.user?.id || 'NO ID')
  }

  return createInnerTRPCContext({
    session,
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

export const tdProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session?.user?.id) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
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
