import { z } from 'zod'
import { createTRPCRouter, protectedProcedure, tdProcedure } from '../trpc'

export const importRouter = createTRPCRouter({
  createJob: tdProcedure
    .input(z.object({
      tournamentId: z.string(),
      source: z.enum(['PBT_CSV']).default('PBT_CSV'),
    }))
    .mutation(async ({ ctx, input }) => {
      const importJob = await ctx.prisma.importJob.create({
        data: {
          ...input,
          status: 'PENDING',
        },
      })

      // Log the creation
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: input.tournamentId,
          action: 'CREATE_IMPORT_JOB',
          entityType: 'ImportJob',
          entityId: importJob.id,
          payload: input,
        },
      })

      return importJob
    }),

  uploadCsv: tdProcedure
    .input(z.object({
      importJobId: z.string(),
      fileUrl: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const importJob = await ctx.prisma.importJob.findUnique({
        where: { id: input.importJobId },
        select: { tournamentId: true },
      })

      if (!importJob) {
        throw new Error('Import job not found')
      }

      const updatedJob = await ctx.prisma.importJob.update({
        where: { id: input.importJobId },
        data: {
          rawFileUrl: input.fileUrl,
          status: 'PROCESSING',
        },
      })

      // Log the upload
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: importJob.tournamentId,
          action: 'UPLOAD_CSV',
          entityType: 'ImportJob',
          entityId: input.importJobId,
          payload: { fileUrl: input.fileUrl },
        },
      })

      return updatedJob
    }),

  mapFields: tdProcedure
    .input(z.object({
      importJobId: z.string(),
      mappingJson: z.record(z.any()),
    }))
    .mutation(async ({ ctx, input }) => {
      const importJob = await ctx.prisma.importJob.findUnique({
        where: { id: input.importJobId },
        select: { tournamentId: true },
      })

      if (!importJob) {
        throw new Error('Import job not found')
      }

      const updatedJob = await ctx.prisma.importJob.update({
        where: { id: input.importJobId },
        data: {
          mappingJson: input.mappingJson,
        },
      })

      // Log the mapping
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: importJob.tournamentId,
          action: 'MAP_FIELDS',
          entityType: 'ImportJob',
          entityId: input.importJobId,
          payload: { mappingJson: input.mappingJson },
        },
      })

      return updatedJob
    }),

  commit: tdProcedure
    .input(z.object({ importJobId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const importJob = await ctx.prisma.importJob.findUnique({
        where: { id: input.importJobId },
        select: { tournamentId: true },
      })

      if (!importJob) {
        throw new Error('Import job not found')
      }

      // This will be implemented in M2 with actual CSV processing
      const updatedJob = await ctx.prisma.importJob.update({
        where: { id: input.importJobId },
        data: {
          status: 'COMPLETED',
        },
      })

      // Log the commit
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: importJob.tournamentId,
          action: 'COMMIT_IMPORT',
          entityType: 'ImportJob',
          entityId: input.importJobId,
        },
      })

      return updatedJob
    }),

  undo: tdProcedure
    .input(z.object({ importJobId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const importJob = await ctx.prisma.importJob.findUnique({
        where: { id: input.importJobId },
        select: { tournamentId: true },
      })

      if (!importJob) {
        throw new Error('Import job not found')
      }

      // This will be implemented in M2 with actual undo logic
      const updatedJob = await ctx.prisma.importJob.update({
        where: { id: input.importJobId },
        data: {
          status: 'FAILED',
        },
      })

      // Log the undo
      await ctx.prisma.auditLog.create({
        data: {
          actorUserId: ctx.session.user.id,
          tournamentId: importJob.tournamentId,
          action: 'UNDO_IMPORT',
          entityType: 'ImportJob',
          entityId: input.importJobId,
        },
      })

      return updatedJob
    }),

  list: protectedProcedure
    .input(z.object({ tournamentId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.importJob.findMany({
        where: { tournamentId: input.tournamentId },
        orderBy: { createdAt: 'desc' },
      })
    }),
})
