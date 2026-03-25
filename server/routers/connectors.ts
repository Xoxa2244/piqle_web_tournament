/**
 * tRPC router for external connectors (CourtReserve, etc.)
 */
import { z } from 'zod'
import { createTRPCRouter, protectedProcedure } from '../trpc'
import { TRPCError } from '@trpc/server'
import { CourtReserveClient } from '@/lib/connectors/courtreserve-client'
import { encryptCredentials } from '@/lib/connectors/encryption'
import { runCourtReserveSync } from '@/lib/connectors/courtreserve-sync'

async function requireClubAdmin(prisma: any, clubId: string, userId: string) {
  const admin = await prisma.clubAdmin.findFirst({
    where: { clubId, userId },
  })
  if (!admin) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Not a club admin' })
  }
}

export const connectorsRouter = createTRPCRouter({
  /** Test CourtReserve connection without saving */
  testConnection: protectedProcedure
    .input(z.object({
      clubId: z.string(),
      username: z.string().min(1),
      password: z.string().min(1),
      baseUrl: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      const client = new CourtReserveClient(input.username, input.password, input.baseUrl)
      const result = await client.testConnection()

      if (!result.ok) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error || 'Connection failed',
        })
      }

      return {
        ok: true,
        courtCount: result.courtCount || 0,
      }
    }),

  /** Connect CourtReserve — save encrypted credentials */
  connect: protectedProcedure
    .input(z.object({
      clubId: z.string(),
      username: z.string().min(1),
      password: z.string().min(1),
      baseUrl: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      // Test connection first
      const client = new CourtReserveClient(input.username, input.password, input.baseUrl)
      const testResult = await client.testConnection()
      if (!testResult.ok) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: testResult.error || 'Connection failed',
        })
      }

      // Encrypt and save
      const encrypted = encryptCredentials({
        username: input.username,
        password: input.password,
      })

      const connector = await ctx.prisma.clubConnector.upsert({
        where: { clubId_provider: { clubId: input.clubId, provider: 'courtreserve' } },
        create: {
          clubId: input.clubId,
          provider: 'courtreserve',
          credentialsEncrypted: encrypted,
          baseUrl: input.baseUrl || 'https://api.courtreserve.com',
          status: 'connected',
        },
        update: {
          credentialsEncrypted: encrypted,
          baseUrl: input.baseUrl || 'https://api.courtreserve.com',
          status: 'connected',
          lastError: null,
        },
      })

      return { connectorId: connector.id, courtCount: testResult.courtCount }
    }),

  /** Disconnect — remove credentials */
  disconnect: protectedProcedure
    .input(z.object({ clubId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      await ctx.prisma.clubConnector.updateMany({
        where: { clubId: input.clubId, provider: 'courtreserve' },
        data: {
          status: 'disconnected',
          credentialsEncrypted: '',
          lastError: null,
        },
      })

      return { ok: true }
    }),

  /** Trigger sync manually */
  syncNow: protectedProcedure
    .input(z.object({
      clubId: z.string(),
      isInitial: z.boolean().optional().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      const connector = await ctx.prisma.clubConnector.findFirst({
        where: { clubId: input.clubId, provider: 'courtreserve', status: { not: 'disconnected' } },
      })

      if (!connector) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No active CourtReserve connector found',
        })
      }

      const result = await runCourtReserveSync(connector.id, {
        isInitial: input.isInitial,
      })

      return result
    }),

  /** Get connector status */
  getStatus: protectedProcedure
    .input(z.object({ clubId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      const connector = await ctx.prisma.clubConnector.findFirst({
        where: { clubId: input.clubId, provider: 'courtreserve' },
      })

      if (!connector || connector.status === 'disconnected') {
        return { connected: false, provider: 'courtreserve' as const }
      }

      return {
        connected: true,
        provider: 'courtreserve' as const,
        status: connector.status,
        lastSyncAt: connector.lastSyncAt?.toISOString() || null,
        lastSyncResult: connector.lastSyncResult as any,
        lastError: connector.lastError,
        autoSync: connector.autoSync,
        createdAt: connector.createdAt.toISOString(),
      }
    }),

  /** Toggle auto-sync */
  setAutoSync: protectedProcedure
    .input(z.object({
      clubId: z.string(),
      enabled: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireClubAdmin(ctx.prisma, input.clubId, ctx.session.user.id)

      await ctx.prisma.clubConnector.updateMany({
        where: { clubId: input.clubId, provider: 'courtreserve' },
        data: { autoSync: input.enabled },
      })

      return { ok: true }
    }),
})
