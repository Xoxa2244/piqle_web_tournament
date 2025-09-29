import { initTRPC, TRPCError } from '@trpc/server'
import { type FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch'
import { type Session } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabase'
import { prisma } from '@/lib/prisma'

interface CreateContextOptions {
  session: Session | null
}

const createInnerTRPCContext = (opts: CreateContextOptions) => {
  return {
    session: opts.session,
    prisma,
    supabaseAdmin,
  }
}

export const createTRPCContext = async (opts: FetchCreateContextFnOptions) => {
  // Get session from Supabase
  const { data: { session } } = await supabaseAdmin.auth.getSession()

  // For now, create a mock session for testing
  const mockSession = {
    user: {
      id: 'test-user-id',
      email: 'test@example.com',
      app_metadata: { role: 'TD' },
      user_metadata: {},
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    },
    access_token: 'mock-token',
    refresh_token: 'mock-refresh-token',
    expires_in: 3600,
    expires_at: Date.now() + 3600000,
    token_type: 'bearer',
  } as Session

  return createInnerTRPCContext({
    session: mockSession,
  })
}

const t = initTRPC.context<typeof createTRPCContext>().create()

export const createTRPCRouter = t.router

export const publicProcedure = t.procedure

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }
  return next({
    ctx: {
      ...ctx,
      session: { ...ctx.session, user: ctx.session.user },
    },
  })
})

export const tdProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }

  // Check if user is TD
  const user = ctx.session.user
  const userRole = user.app_metadata?.role || 'ASSISTANT'
  if (userRole !== 'TD') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Tournament Director access required' })
  }

  return next({
    ctx: {
      ...ctx,
      session: { ...ctx.session, user: ctx.session.user },
    },
  })
})
