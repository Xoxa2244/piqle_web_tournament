import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { Prisma } from '@prisma/client'
import { createTRPCRouter, protectedProcedure, superadminProcedure } from '../trpc'
import {
  buildAgentControlPlaneChangeSummary,
  diffAgentControlPlaneResolved,
  getAgentControlPlaneAudit,
  resolveAgentControlPlane,
} from '@/lib/ai/agent-control-plane'
import { getAgentOutreachRolloutStatus } from '@/lib/ai/agent-outreach-rollout'
import { buildAgentOutreachPilotSnapshot } from '@/lib/ai/agent-outreach-pilot'
import { persistAgentDecisionRecord } from '@/lib/ai/agent-decision-records'
import { buildSuperadminIntegrationOpsDashboard } from '@/lib/ai/integration-superadmin'
import { runCourtReserveSync } from '@/lib/connectors/courtreserve-sync'
import { resolveSuperadminAccess } from '../utils/superadminAccess'

export const superadminRouter = createTRPCRouter({
  getAccess: protectedProcedure
    .query(async ({ ctx }) => resolveSuperadminAccess({ session: ctx.session })),

  getAgentRolloutDashboard: superadminProcedure
    .input(z.object({
      days: z.number().int().min(1).max(30).default(7),
      limit: z.number().int().min(1).max(200).default(80),
    }).optional())
    .query(async ({ ctx, input }) => {
      const days = input?.days ?? 7
      const limit = input?.limit ?? 80
      const since = new Date(Date.now() - days * 86400000)

      const clubs = await ctx.prisma.club.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          name: true,
          automationSettings: true,
          admins: {
            select: {
              role: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
        },
      })

      const clubIds = clubs.map((club) => club.id)
      const decisionRecords = clubIds.length > 0
        ? await ctx.prisma.agentDecisionRecord.findMany({
            where: {
              clubId: { in: clubIds },
              createdAt: { gte: since },
            },
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              clubId: true,
              action: true,
              mode: true,
              result: true,
              summary: true,
              metadata: true,
              createdAt: true,
            },
          }).catch(() => [])
        : []
      const outreachLogs = clubIds.length > 0
        ? await ctx.prisma.aIRecommendationLog.findMany({
            where: {
              clubId: { in: clubIds },
              createdAt: { gte: since },
            },
            orderBy: { createdAt: 'desc' },
            select: {
              clubId: true,
              type: true,
              channel: true,
              status: true,
              reasoning: true,
              createdAt: true,
              openedAt: true,
              clickedAt: true,
              respondedAt: true,
              deliveredAt: true,
              bouncedAt: true,
              bounceType: true,
            },
          }).catch(() => [])
        : []

      const decisionsByClub = new Map<string, typeof decisionRecords>()
      for (const record of decisionRecords) {
        const list = decisionsByClub.get(record.clubId) || []
        list.push(record)
        decisionsByClub.set(record.clubId, list)
      }
      const outreachLogsByClub = new Map<string, typeof outreachLogs>()
      for (const log of outreachLogs) {
        const list = outreachLogsByClub.get(log.clubId) || []
        list.push(log)
        outreachLogsByClub.set(log.clubId, list)
      }

      const clubsOverview = clubs.map((club) => {
        const intelligence = (club.automationSettings as any)?.intelligence || {}
        const controlPlane = resolveAgentControlPlane({ intelligence })
        const controlPlaneAudit = getAgentControlPlaneAudit({ intelligence })
        const outreachRollout = getAgentOutreachRolloutStatus({
          clubId: club.id,
          automationSettings: { intelligence },
        })
        const armedActions = outreachRollout.enabledActionKinds.length
        const clubDecisionRecords = decisionsByClub.get(club.id) || []
        const clubOutreachLogs = outreachLogsByClub.get(club.id) || []
        const outreachPilot = buildAgentOutreachPilotSnapshot({
          logs: clubOutreachLogs,
          days,
        })
        const blockedCount = clubDecisionRecords.filter((record) => record.result === 'blocked').length
        const shadowedCount = clubDecisionRecords.filter((record) => record.result === 'shadowed').length
        const executedCount = clubDecisionRecords.filter((record) => record.result === 'executed').length

        const readiness =
          controlPlane.killSwitch || controlPlane.actions.outreachSend.mode === 'disabled'
            ? 'blocked'
            : controlPlane.actions.outreachSend.mode === 'shadow'
              ? 'shadow'
              : outreachRollout.clubAllowlisted && armedActions > 0
                ? 'ready'
                : 'shadow'

        return {
          id: club.id,
          name: club.name,
          readiness,
          controlPlane: {
            killSwitch: controlPlane.killSwitch,
            outreachMode: controlPlane.actions.outreachSend.mode,
            schedulePublishMode: controlPlane.actions.schedulePublish.mode,
            adminReminderMode: controlPlane.actions.adminReminderExternal.mode,
            audit: controlPlaneAudit,
          },
          outreachRollout: {
            envAllowlistConfigured: outreachRollout.envAllowlistConfigured,
            clubAllowlisted: outreachRollout.clubAllowlisted,
            summary: outreachRollout.summary,
            armedActions,
            totalActions: Object.keys(outreachRollout.actions || {}).length,
            actions: Object.values(outreachRollout.actions),
          },
          outreachPilot,
          admins: club.admins.map((admin) => ({
            id: admin.user.id,
            name: admin.user.name,
            email: admin.user.email,
            role: admin.role,
          })),
          decisions: {
            blockedCount,
            shadowedCount,
            executedCount,
            recent: clubDecisionRecords.slice(0, 5),
          },
        }
      })
      const overallOutreachPilot = buildAgentOutreachPilotSnapshot({
        logs: outreachLogs,
        days,
      })

      return {
        windowDays: days,
        summary: {
          totalClubs: clubsOverview.length,
          readyClubs: clubsOverview.filter((club) => club.readiness === 'ready').length,
          shadowClubs: clubsOverview.filter((club) => club.readiness === 'shadow').length,
          blockedClubs: clubsOverview.filter((club) => club.readiness === 'blocked').length,
          allowlistedClubs: clubsOverview.filter((club) => club.outreachRollout.clubAllowlisted).length,
          armedClubs: clubsOverview.filter((club) => club.outreachRollout.armedActions > 0).length,
          blockedDecisions: clubsOverview.reduce((sum, club) => sum + club.decisions.blockedCount, 0),
          shadowedDecisions: clubsOverview.reduce((sum, club) => sum + club.decisions.shadowedCount, 0),
          executedDecisions: clubsOverview.reduce((sum, club) => sum + club.decisions.executedCount, 0),
          activePilotClubs: clubsOverview.filter((club) => club.outreachPilot.totals.sent > 0).length,
          healthyPilotClubs: clubsOverview.filter((club) => club.outreachPilot.health === 'healthy').length,
          watchPilotClubs: clubsOverview.filter((club) => club.outreachPilot.health === 'watch').length,
          atRiskPilotClubs: clubsOverview.filter((club) => club.outreachPilot.health === 'at_risk').length,
        },
        outreachPilot: overallOutreachPilot,
        clubs: clubsOverview,
      }
    }),

  getIntegrationOpsDashboard: superadminProcedure
    .input(z.object({
      days: z.number().int().min(1).max(60).default(14),
      limit: z.number().int().min(1).max(200).default(120),
    }).optional())
    .query(async ({ ctx, input }) => {
      const days = input?.days ?? 14
      const limit = input?.limit ?? 120
      const since = new Date(Date.now() - days * 86400000)

      const clubs = await ctx.prisma.club.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          name: true,
          connectors: {
            orderBy: { updatedAt: 'desc' },
            take: 1,
            select: {
              id: true,
              provider: true,
              status: true,
              lastSyncAt: true,
              lastSyncResult: true,
              lastError: true,
              autoSync: true,
              syncIntervalHours: true,
            },
          },
          admins: {
            select: {
              role: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
        },
      })

      const clubIds = clubs.map((club) => club.id)
      const [activeIncidents, recentIncidents, remediationDecisions] = clubIds.length > 0
        ? await Promise.all([
            ctx.prisma.integrationAnomalyIncident.findMany({
              where: {
                clubId: { in: clubIds },
                resolvedAt: null,
              },
              orderBy: { updatedAt: 'desc' },
              select: {
                id: true,
                clubId: true,
                anomalyKey: true,
                severity: true,
                category: true,
                title: true,
                summary: true,
                evidenceLabel: true,
                firstSeenAt: true,
                lastSeenAt: true,
                activeDays: true,
                resolvedAt: true,
              },
            }).catch(() => []),
            ctx.prisma.integrationAnomalyIncident.findMany({
              where: {
                clubId: { in: clubIds },
                lastSeenAt: { gte: since },
              },
              orderBy: { updatedAt: 'desc' },
              select: {
                id: true,
                clubId: true,
                anomalyKey: true,
                severity: true,
                category: true,
                title: true,
                summary: true,
                evidenceLabel: true,
                firstSeenAt: true,
                lastSeenAt: true,
                activeDays: true,
                resolvedAt: true,
              },
            }).catch(() => []),
            ctx.prisma.agentDecisionRecord.findMany({
              where: {
                clubId: { in: clubIds },
                action: 'integrationAnomalyOps',
                targetType: 'integration_anomaly_incident',
              },
              orderBy: { createdAt: 'desc' },
              select: {
                id: true,
                clubId: true,
                targetId: true,
                createdAt: true,
                metadata: true,
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            }).catch(() => []),
          ])
        : [[], [], []]

      return buildSuperadminIntegrationOpsDashboard({
        clubs: clubs.map((club) => ({
          id: club.id,
          name: club.name,
          connectors: club.connectors.map((connector) => ({
            id: connector.id,
            provider: connector.provider,
            status: connector.status,
            lastSyncAt: connector.lastSyncAt,
            lastSyncResult: connector.lastSyncResult as Record<string, unknown> | null,
            lastError: connector.lastError,
            autoSync: connector.autoSync,
            syncIntervalHours: connector.syncIntervalHours,
          })),
          admins: club.admins.map((admin) => ({
            role: admin.role,
            user: {
              id: admin.user.id,
              name: admin.user.name,
              email: admin.user.email,
            },
          })),
        })),
        activeIncidents,
        recentIncidents,
        decisions: remediationDecisions,
        windowDays: days,
      })
    }),

  updateIntegrationOpsIncident: superadminProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      incidentId: z.string().uuid(),
      decision: z.enum(['acknowledge', 'assign', 'escalate']),
      ownerUserId: z.string().uuid().optional(),
      note: z.string().min(1).max(400).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const incident = await ctx.prisma.integrationAnomalyIncident.findFirst({
        where: {
          id: input.incidentId,
          clubId: input.clubId,
          resolvedAt: null,
        },
        select: {
          id: true,
          clubId: true,
          anomalyKey: true,
          title: true,
          summary: true,
          club: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      })

      if (!incident) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Active integration anomaly incident not found',
        })
      }

      let ownerLabel: string | null = null
      if (input.decision === 'assign') {
        if (!input.ownerUserId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Owner is required when assigning an integration incident',
          })
        }

        const owner = await ctx.prisma.clubAdmin.findFirst({
          where: {
            clubId: input.clubId,
            userId: input.ownerUserId,
          },
          select: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        })

        if (!owner) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Selected owner is not a club admin for this club',
          })
        }

        ownerLabel = owner.user.name || owner.user.email || 'Assigned owner'
      }

      const actorLabel = ctx.session.user.name || ctx.session.user.email || 'Superadmin'
      const summary =
        input.decision === 'assign'
          ? `${actorLabel} assigned ${incident.title} to ${ownerLabel}.`
          : input.decision === 'escalate'
            ? `${actorLabel} escalated ${incident.title}${input.note ? `: ${input.note}` : '.'}`
            : `${actorLabel} acknowledged ${incident.title}.`

      await persistAgentDecisionRecord(ctx.prisma, {
        clubId: incident.clubId,
        userId: ctx.session.user.id,
        actorType: 'user',
        action: 'integrationAnomalyOps',
        targetType: 'integration_anomaly_incident',
        targetId: incident.id,
        mode: 'review',
        result: 'reviewed',
        summary,
        metadata: {
          decision: input.decision,
          ownerUserId: input.ownerUserId || null,
          ownerLabel,
          note: input.note || null,
          source: 'superadmin_integration_ops',
          anomalyKey: incident.anomalyKey,
          incidentTitle: incident.title,
          clubName: incident.club.name,
        },
      }).catch(() => null)

      return {
        success: true,
        incidentId: incident.id,
        decision: input.decision,
        ownerLabel,
      }
    }),

  syncIntegrationClub: superadminProcedure
    .input(z.object({
      clubId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      const connector = await ctx.prisma.clubConnector.findFirst({
        where: {
          clubId: input.clubId,
          status: { not: 'disconnected' },
        },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          provider: true,
          lastSyncAt: true,
          club: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      })

      if (!connector) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No active connector found for this club',
        })
      }

      if (connector.provider !== 'courtreserve') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Unsupported connector provider: ${connector.provider}`,
        })
      }

      const result = await runCourtReserveSync(connector.id, {
        isInitial: !connector.lastSyncAt,
        maxTimeMs: 260_000,
      })

      await persistAgentDecisionRecord(ctx.prisma, {
        clubId: connector.club.id,
        userId: ctx.session.user.id,
        actorType: 'user',
        action: 'integrationSyncRun',
        targetType: 'connector',
        targetId: connector.id,
        mode: 'live',
        result: 'executed',
        summary: `${ctx.session.user.name || ctx.session.user.email || 'Superadmin'} ran ${connector.provider} sync from superadmin integration ops.`,
        metadata: {
          source: 'superadmin_integration_ops',
          clubName: connector.club.name,
          provider: connector.provider,
        },
      }).catch(() => null)

      return {
        success: true,
        clubId: connector.club.id,
        connectorId: connector.id,
        provider: connector.provider,
        result,
      }
    }),

  shadowBackOutreachAction: superadminProcedure
    .input(z.object({
      clubId: z.string().uuid(),
      actionKind: z.enum(['create_campaign', 'fill_session', 'reactivate_members', 'trial_follow_up', 'renewal_reactivation']),
      reason: z.string().min(1).max(400).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const club: any = await ctx.prisma.club.findUniqueOrThrow({
        where: { id: input.clubId },
        select: {
          id: true,
          name: true,
          automationSettings: true,
        },
      })

      const existing = club.automationSettings || {}
      const existingIntelligence = existing.intelligence || {}
      const previousControlPlane = resolveAgentControlPlane({ intelligence: existingIntelligence })
      const previousOutreachRollout = getAgentOutreachRolloutStatus({
        clubId: input.clubId,
        automationSettings: { intelligence: existingIntelligence },
      })

      const nextIntelligence = {
        ...existingIntelligence,
        controlPlane: {
          ...(existingIntelligence.controlPlane || {}),
          outreachRollout: {
            ...(existingIntelligence.controlPlane?.outreachRollout || {}),
            actions: {
              ...(existingIntelligence.controlPlane?.outreachRollout?.actions || {}),
              [input.actionKind]: {
                ...(existingIntelligence.controlPlane?.outreachRollout?.actions?.[input.actionKind] || {}),
                enabled: false,
              },
            },
          },
        },
      }

      const nextControlPlane = resolveAgentControlPlane({ intelligence: nextIntelligence })
      const controlPlaneChanges = diffAgentControlPlaneResolved(previousControlPlane, nextControlPlane)
      const nextOutreachRollout = getAgentOutreachRolloutStatus({
        clubId: input.clubId,
        automationSettings: { intelligence: nextIntelligence },
      })

      if (previousOutreachRollout.summary !== nextOutreachRollout.summary) {
        controlPlaneChanges.push({
          key: 'outreachRollout',
          label: 'Outreach rollout',
          from: previousOutreachRollout.summary,
          to: nextOutreachRollout.summary,
        })
      }

      const previousControlPlaneAudit = getAgentControlPlaneAudit({ intelligence: existingIntelligence })
      const sanitizedControlPlane = nextIntelligence.controlPlane
        ? { ...nextIntelligence.controlPlane }
        : undefined
      if (sanitizedControlPlane && 'audit' in sanitizedControlPlane) {
        delete sanitizedControlPlane.audit
      }

      const actorLabel = ctx.session.user.name || ctx.session.user.email || 'Superadmin'
      if (controlPlaneChanges.length > 0) {
        nextIntelligence.controlPlane = {
          ...(sanitizedControlPlane || {}),
          audit: {
            ...(previousControlPlaneAudit || {}),
            lastChangedAt: new Date().toISOString(),
            lastChangedByUserId: ctx.session.user.id,
            lastChangedByLabel: `Superadmin: ${actorLabel}`,
            summary: buildAgentControlPlaneChangeSummary(controlPlaneChanges),
            changes: controlPlaneChanges,
          },
        }
      } else if (previousControlPlaneAudit) {
        nextIntelligence.controlPlane = {
          ...(sanitizedControlPlane || {}),
          audit: previousControlPlaneAudit,
        }
      }

      await (ctx.prisma.club as any).update({
        where: { id: input.clubId },
        data: {
          automationSettings: {
            ...existing,
            intelligence: nextIntelligence,
          },
        },
      })

      await persistAgentDecisionRecord(ctx.prisma, {
        clubId: input.clubId,
        userId: ctx.session.user.id,
        actorType: 'user',
        action: 'outreachRolloutShadowBack',
        targetType: 'outreach_action',
        targetId: input.actionKind,
        mode: 'shadow',
        result: 'reviewed',
        summary: `${actorLabel} moved ${input.actionKind} back to shadow from superadmin rollout ops.`,
        metadata: {
          actionKind: input.actionKind,
          label: nextOutreachRollout.actions[input.actionKind]?.label,
          reason: input.reason || null,
          source: 'superadmin_rollout_dashboard',
          clubName: club.name,
        },
      }).catch(() => null)

      return {
        success: true,
        clubId: input.clubId,
        actionKind: input.actionKind,
        outreachRolloutStatus: nextOutreachRollout,
      }
    }),

  // Get all tournaments (no access checks)
  getAllTournaments: superadminProcedure
    .input(z.object({
      userId: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const tournaments = await ctx.prisma.tournament.findMany({
        where: input?.userId ? { userId: input.userId } : undefined,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          divisions: {
            select: {
              id: true,
              name: true,
              _count: {
                select: {
                  teams: true,
                  matches: true,
                },
              },
            },
          },
          _count: {
            select: {
              divisions: true,
            },
          },
        },
      })

      return tournaments
    }),

  // Get all users who own tournaments
  getAllTournamentOwners: superadminProcedure
    .query(async ({ ctx }) => {
      // Get unique user IDs from tournaments
      const tournaments = await ctx.prisma.tournament.findMany({
        select: {
          userId: true,
        },
        distinct: ['userId'],
      })

      const userIds = tournaments.map(t => t.userId).filter(Boolean)

      if (userIds.length === 0) {
        return []
      }

      // Get user details
      const users = await ctx.prisma.user.findMany({
        where: {
          id: {
            in: userIds,
          },
        },
        select: {
          id: true,
          name: true,
          email: true,
        },
        orderBy: {
          name: 'asc',
        },
      })

      return users
    }),

  listPlayers: superadminProcedure
    .input(z.object({ query: z.string().max(120).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const query = input?.query?.trim()
      const where = query
        ? {
            OR: [
              { name: { contains: query, mode: 'insensitive' as const } },
              { email: { contains: query, mode: 'insensitive' as const } },
              { city: { contains: query, mode: 'insensitive' as const } },
            ],
          }
        : undefined
      const users = await ctx.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 500,
        select: {
          id: true,
          name: true,
          email: true,
          city: true,
          gender: true,
          role: true,
          organizerTier: true,
          isActive: true,
        },
      })
      return users
    }),

  setUserActive: superadminProcedure
    .input(z.object({ userId: z.string(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.update({
        where: { id: input.userId },
        data: { isActive: input.isActive },
        select: { id: true, isActive: true },
      })
      return user
    }),

  setOrganizerTier: superadminProcedure
    .input(z.object({ userId: z.string(), organizerTier: z.enum(['BASIC', 'PRO']) }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.update({
        where: { id: input.userId },
        data: { organizerTier: input.organizerTier },
        select: {
          id: true,
          organizerTier: true,
        },
      })
      return user
    }),

  // Get tournament by ID (no access checks)
  getTournament: superadminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const tournament = await ctx.prisma.tournament.findUnique({
        where: { id: input.id },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          divisions: {
            include: {
              teams: {
                include: {
                  teamPlayers: {
                    include: {
                      player: true,
                    },
                  },
                },
              },
              matches: {
                include: {
                  teamA: true,
                  teamB: true,
                  games: {
                    orderBy: { index: 'asc' },
                  },
                },
              },
              pools: true,
              constraints: true,
            },
          },
          prizes: true,
        },
      })

      if (!tournament) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Tournament not found',
        })
      }

      return tournament
    }),

  // Update tournament (no access checks)
  updateTournament: superadminProcedure
    .input(z.object({
      id: z.string(),
      title: z.string().min(1).optional(),
      description: z.string().optional(),
      rulesUrl: z.string().url().optional(),
      venueName: z.string().optional(),
      venueAddress: z.string().optional(),
      startDate: z.string().transform((str) => new Date(str)).optional(),
      endDate: z.string().transform((str) => new Date(str)).optional(),
      entryFeeCents: z.number().int().min(0).optional(),
      currency: z.literal('usd').optional(),
      isPublicBoardEnabled: z.boolean().optional(),
      publicSlug: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, entryFeeCents, ...rest } = input
      const entryFeeDecimal =
        typeof entryFeeCents === 'number'
          ? entryFeeCents > 0
            ? new Prisma.Decimal(entryFeeCents / 100)
            : null
          : undefined
      const data = {
        ...rest,
        entryFee: entryFeeDecimal,
        entryFeeCents,
      }
      const tournament = await ctx.prisma.tournament.update({
        where: { id },
        data,
      })

      return tournament
    }),

  // Delete tournament (no access checks)
  deleteTournament: superadminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Delete all related data
      const tournament = await ctx.prisma.tournament.findUnique({
        where: { id: input.id },
        include: {
          divisions: {
            include: {
              matches: {
                include: {
                  games: true,
                },
              },
            },
          },
        },
      })

      if (!tournament) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Tournament not found',
        })
      }

      // Delete all games
      for (const division of tournament.divisions) {
        for (const match of division.matches) {
          await ctx.prisma.game.deleteMany({
            where: { matchId: match.id },
          })
        }
      }

      // Delete all matches
      for (const division of tournament.divisions) {
        await ctx.prisma.match.deleteMany({
          where: { divisionId: division.id },
        })
      }

      // Delete standings
      await ctx.prisma.standing.deleteMany({
        where: {
          divisionId: {
            in: tournament.divisions.map(d => d.id),
          },
        },
      })

      // Delete tournament access
      await ctx.prisma.tournamentAccess.deleteMany({
        where: { tournamentId: input.id },
      })

      // Delete divisions (this will cascade delete teams, teamPlayers, etc.)
      await ctx.prisma.division.deleteMany({
        where: { tournamentId: input.id },
      })

      // Delete prizes
      await ctx.prisma.prize.deleteMany({
        where: { tournamentId: input.id },
      })

      // Finally delete tournament
      return ctx.prisma.tournament.delete({
        where: { id: input.id },
      })
    }),
})
