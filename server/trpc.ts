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
  
  // Debug logging for all tRPC requests
  if (opts.req.url?.includes('/api/trpc/')) {
    const url = opts.req.url
    const hasCookie = opts.req.headers.get('cookie') ? 'PRESENT' : 'MISSING'
    const sessionExists = !!session
    const userId = session?.user?.id || 'NO ID'
    
    console.log('[tRPC Context] URL:', url)
    console.log('[tRPC Context] Cookie:', hasCookie)
    console.log('[tRPC Context] Session exists:', sessionExists)
    console.log('[tRPC Context] User ID:', userId)
    
    // Log cookie names if present
    if (hasCookie === 'PRESENT') {
      const cookieHeader = opts.req.headers.get('cookie') || ''
      const cookies = cookieHeader.split(';').map(c => c.trim().split('=')[0])
      console.log('[tRPC Context] Cookie names:', cookies.join(', '))
    }
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
    console.log('[tRPC protectedProcedure] UNAUTHORIZED - no session or user.id')
    console.log('[tRPC protectedProcedure] Session exists:', !!ctx.session)
    console.log('[tRPC protectedProcedure] Session user:', ctx.session?.user || 'NO USER')
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
