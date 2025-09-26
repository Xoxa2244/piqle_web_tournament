import { initTRPC, TRPCError } from '@trpc/server'
import { type CreateNextContextOptions } from '@trpc/server/adapters/next'
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

export const createTRPCContext = async (opts: CreateNextContextOptions) => {
  const { req, res } = opts

  // Get session from Supabase
  const { data: { session } } = await supabaseAdmin.auth.getSession()

  return createInnerTRPCContext({
    session,
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
  if (user.role !== 'TD') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Tournament Director access required' })
  }

  return next({
    ctx: {
      ...ctx,
      session: { ...ctx.session, user: ctx.session.user },
    },
  })
})
