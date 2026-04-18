import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, superadminProcedure } from '../trpc'
import { generateApiKey, hashSecret } from '../utils/partnerAuth'

export const partnerRouter = createTRPCRouter({
  // List all partners
  list: superadminProcedure.query(async ({ ctx }) => {
    try {
      // First, try a simple query to check if table exists
      const partners = await ctx.prisma.partner.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          apps: {
            orderBy: { createdAt: 'desc' },
          },
          director: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          _count: {
            select: {
              apps: true,
            },
          },
        },
      })

      return partners
    } catch (error: any) {
      // Log full error details
      console.error('Error in partner.list:', {
        message: error.message,
        code: error.code,
        meta: error.meta,
        stack: error.stack,
      })
      
      // Check if it's a table not found error
      if (error.message?.includes('does not exist') || error.code === 'P2021') {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Partners table does not exist. Please run the migration.',
        })
      }
      
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: error.message || 'Failed to fetch partners',
        cause: error,
      })
    }
  }),

  // Get partner by ID
  get: superadminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const partner = await ctx.prisma.partner.findUnique({
        where: { id: input.id },
        include: {
          apps: {
            orderBy: { createdAt: 'desc' },
          },
          director: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      })

      if (!partner) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Partner not found',
        })
      }

      return partner
    }),

  // Create partner
  create: superadminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        code: z.string().min(1).regex(/^[a-z0-9_-]+$/i),
        contactEmail: z.string().email().optional(),
        contactName: z.string().optional(),
        directorUserId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check if code already exists
      const existing = await ctx.prisma.partner.findUnique({
        where: { code: input.code },
      })

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Partner code already exists',
        })
      }

      // If directorUserId provided, verify user exists
      if (input.directorUserId) {
        const director = await ctx.prisma.user.findUnique({
          where: { id: input.directorUserId },
        })

        if (!director) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Director user not found',
          })
        }
      }

      const partner = await ctx.prisma.partner.create({
        data: {
          name: input.name,
          code: input.code,
          contactEmail: input.contactEmail || null,
          contactName: input.contactName || null,
          directorUserId: input.directorUserId || null,
          status: 'ACTIVE',
        },
        include: {
          director: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      })

      return partner
    }),

  // Update partner
  update: superadminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        code: z.string().min(1).regex(/^[a-z0-9_-]+$/i).optional(),
        contactEmail: z.string().email().optional().nullable(),
        contactName: z.string().optional().nullable(),
        directorUserId: z.string().optional().nullable(),
        status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input

      // If updating code, check for conflicts
      if (data.code) {
        const existing = await ctx.prisma.partner.findFirst({
          where: {
            code: data.code,
            id: { not: id },
          },
        })

        if (existing) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Partner code already exists',
          })
        }
      }

      // If directorUserId provided, verify user exists
      if (data.directorUserId !== undefined && data.directorUserId !== null) {
        const director = await ctx.prisma.user.findUnique({
          where: { id: data.directorUserId },
        })

        if (!director) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Director user not found',
          })
        }
      }

      const partner = await ctx.prisma.partner.update({
        where: { id },
        data: {
          ...data,
          contactEmail: data.contactEmail === undefined ? undefined : data.contactEmail,
          contactName: data.contactName === undefined ? undefined : data.contactName,
        },
        include: {
          director: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      })

      return partner
    }),

  // Create partner app (credentials)
  createApp: superadminProcedure
    .input(
      z.object({
        partnerId: z.string(),
        environment: z.enum(['SANDBOX', 'PRODUCTION']),
        allowedIps: z.array(z.string()).default([]),
        rateLimitRpm: z.number().int().min(1).default(60),
        scopes: z.array(z.string()).default(['indyleague:write', 'indyleague:read']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify partner exists
      const partner = await ctx.prisma.partner.findUnique({
        where: { id: input.partnerId },
      })

      if (!partner) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Partner not found',
        })
      }

      // Generate API key pair
      const { keyId, secret } = await generateApiKey()
      const secretHash = await hashSecret(secret)

      const app = await ctx.prisma.partnerApp.create({
        data: {
          partnerId: input.partnerId,
          environment: input.environment,
          keyId,
          secretHash,
          allowedIps: input.allowedIps,
          rateLimitRpm: input.rateLimitRpm,
          scopes: input.scopes,
          status: 'ACTIVE',
        },
      })

      // Return app with secret (only shown once)
      return {
        ...app,
        secret, // Only returned on creation
      }
    }),

  // Revoke partner app
  revokeApp: superadminProcedure
    .input(z.object({ appId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const app = await ctx.prisma.partnerApp.update({
        where: { id: input.appId },
        data: { status: 'REVOKED' },
      })

      return app
    }),

  // Get API request logs
  getRequestLogs: superadminProcedure
    .input(
      z.object({
        partnerId: z.string().optional(),
        partnerAppId: z.string().optional(),
        limit: z.number().int().min(1).max(1000).default(100),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const logs = await ctx.prisma.apiRequestLog.findMany({
        where: {
          ...(input.partnerId && { partnerId: input.partnerId }),
          ...(input.partnerAppId && { partnerAppId: input.partnerAppId }),
        },
        orderBy: { createdAt: 'desc' },
        take: input.limit,
        skip: input.offset,
        include: {
          partner: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          partnerApp: {
            select: {
              id: true,
              keyId: true,
              environment: true,
            },
          },
        },
      })

      const total = await ctx.prisma.apiRequestLog.count({
        where: {
          ...(input.partnerId && { partnerId: input.partnerId }),
          ...(input.partnerAppId && { partnerAppId: input.partnerAppId }),
        },
      })

      return {
        logs,
        total,
        hasMore: input.offset + logs.length < total,
      }
    }),
})
