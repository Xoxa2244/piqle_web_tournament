import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createTRPCRouter, protectedProcedure } from '../trpc'

const MIN_PUBLIC_RATINGS = 5
const COMMENT_LIMIT = 400
const TOURNAMENT_PROMPT_MIN_HOURS = 2
const CLUB_PROMPT_DAYS = 3
const APP_PROMPT_DAYS = 3

const entityTypeSchema = z.enum(['TOURNAMENT', 'CLUB', 'TD', 'APP'])

const surveyChips: Record<string, Record<number, string[]>> = {
  TOURNAMENT: {
    5: ['Excellent organization', 'Clear schedule', 'Strong opponents', 'Great atmosphere', 'No delays'],
    4: ['Good, but delays happened', 'Not enough updates/announcements', 'Registration felt hard', 'Matches felt slow', 'Organization could be better'],
    3: ['Frequent delays', 'Poor communication', 'Unclear rules', 'Bracket/schedule issues', 'Long waits between matches'],
    2: ['Chaotic schedule', 'Refereeing/rules felt questionable', 'Conflicts were not resolved', 'Poor court conditions', 'Reality did not match expectations'],
    1: ['Very poorly organized', 'Disrespectful behavior', 'Would not recommend'],
  },
  TD: {
    5: ['Solved issues quickly', 'Great communication', 'Fair decisions', 'Professional', 'Handled conflicts well'],
    4: ['Overall good, but responses were not always fast', 'Sometimes lacked clarity', 'Issues were solved, but slowly'],
    3: ['Slow responses', 'Weak announcements/instructions', 'Limited process control'],
    2: ['Ignored problems', 'Harsh/disrespectful communication', 'Questionable decisions'],
    1: ['Very unprofessional', 'Conflict-prone / toxic', 'Situations were not resolved'],
  },
  CLUB: {
    5: ['Regular events', 'Good value for money', 'Great atmosphere', 'Active community', 'Helpful support'],
    4: ['Overall good, but with some issues', 'Queues / event organization issues', 'Issues were solved, but slowly'],
    3: ['Rare events', 'Too expensive', 'Low community engagement', 'Low support quality'],
    2: ['Poor service', 'No events', 'Ignored requests'],
    1: ['Toxic/conflict atmosphere', 'No events'],
  },
  APP: {
    5: ['User-friendly interface', 'Fast tournament creation', 'Easy payments', 'Everything is clear', 'Convenient navigation'],
    4: ['Hard to find what I need', 'Too many steps', 'Unclear statuses/rules', 'Weak calendar/timezone flow', 'Navigation could be better'],
    3: ['Lags', 'Bugs', 'Errors'],
    2: ['Poor service', 'Lags', 'Bugs', 'Errors'],
    1: ['I am a hater'],
  },
}

const tdAchievementTitleByChip: Record<string, string> = {
  'Solved issues quickly': 'Fast Resolver',
  'Great communication': 'Clear Communicator',
  'Fair decisions': 'Fair Referee',
  Professional: 'Professional Lead',
  'Handled conflicts well': 'Conflict Solver',
}

const isMissingFeedbackTable = (err: unknown) => {
  const msg = String((err as Error)?.message ?? '').toLowerCase()
  return msg.includes('feedback') && msg.includes('does not exist')
}

const computeTopChips = (rows: Array<{ chips: string[] }>) => {
  const freq = new Map<string, number>()
  for (const row of rows) {
    for (const chip of row.chips ?? []) {
      const key = chip.trim()
      if (!key) continue
      freq.set(key, (freq.get(key) ?? 0) + 1)
    }
  }
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, count]) => ({ label, count }))
}

export const feedbackRouter = createTRPCRouter({
  getSurveyChips: protectedProcedure
    .input(
      z.object({
        entityType: entityTypeSchema,
        rating: z.number().int().min(1).max(5),
      }),
    )
    .query(({ input }) => {
      return {
        chips: surveyChips[input.entityType]?.[input.rating] ?? [],
        commentAllowed: input.rating < 5,
        commentMaxLength: COMMENT_LIMIT,
      }
    }),

  submit: protectedProcedure
    .input(
      z.object({
        entityType: entityTypeSchema,
        entityId: z.string().min(1),
        rating: z.number().int().min(1).max(5),
        chips: z.array(z.string().min(1).max(120)).max(10).default([]),
        comment: z.string().max(COMMENT_LIMIT).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const isPositive = input.rating >= 4
      const comment = input.rating < 5 ? input.comment?.trim() || null : null
      const chipsAllowed = new Set(surveyChips[input.entityType]?.[input.rating] ?? [])
      const normalizedChips = Array.from(new Set((input.chips ?? []).map((x) => x.trim()).filter(Boolean)))
      const chips = normalizedChips.filter((chip) => chipsAllowed.has(chip))

      let tournamentId: string | null = null
      let clubId: string | null = null
      let tdUserId: string | null = null
      if (input.entityType === 'TOURNAMENT') tournamentId = input.entityId
      if (input.entityType === 'CLUB') clubId = input.entityId
      if (input.entityType === 'TD') tdUserId = input.entityId

      try {
        const existing = await ctx.prisma.feedback.findUnique({
          where: {
            userId_entityType_entityId: {
              userId,
              entityType: input.entityType,
              entityId: input.entityId,
            },
          },
          select: { id: true },
        })
        if (existing) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'You already rated this entity.',
          })
        }

        await ctx.prisma.feedback.create({
          data: {
            userId,
            entityType: input.entityType,
            entityId: input.entityId,
            rating: input.rating,
            chips,
            comment,
            isPositive,
            tournamentId,
            clubId,
            tdUserId,
          },
        })
      } catch (err) {
        if (isMissingFeedbackTable(err)) {
          // Schema rollout guard: keep app stable before migration.
          return { ok: false as const, pendingMigration: true as const }
        }
        throw err
      }

      return { ok: true as const }
    }),

  hasRated: protectedProcedure
    .input(
      z.object({
        targets: z
          .array(
            z.object({
              entityType: entityTypeSchema,
              entityId: z.string().min(1),
            }),
          )
          .max(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      try {
        const rows = await ctx.prisma.feedback.findMany({
          where: {
            userId,
            OR: input.targets.map((t) => ({ entityType: t.entityType, entityId: t.entityId })),
          },
          select: {
            entityType: true,
            entityId: true,
          },
        })
        const map: Record<string, true> = {}
        for (const row of rows) {
          map[`${row.entityType}:${row.entityId}`] = true
        }
        return { map }
      } catch (err) {
        if (isMissingFeedbackTable(err)) return { map: {} as Record<string, true> }
        throw err
      }
    }),

  getEntitySummary: protectedProcedure
    .input(
      z.object({
        entityType: entityTypeSchema,
        entityId: z.string().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        const rows = await ctx.prisma.feedback.findMany({
          where: {
            entityType: input.entityType,
            entityId: input.entityId,
          },
          select: {
            rating: true,
            chips: true,
            isPositive: true,
          },
        })

        const total = rows.length
        const positiveRows = rows.filter((r) => r.isPositive)
        const avg = total > 0 ? rows.reduce((acc, r) => acc + r.rating, 0) / total : null
        const topChips = computeTopChips(positiveRows)
        const canPublish = total >= MIN_PUBLIC_RATINGS

        const achievements =
          input.entityType === 'TD'
            ? topChips
                .map((chip) => tdAchievementTitleByChip[chip.label])
                .filter(Boolean)
                .slice(0, 5)
                .map((title, idx) => ({ id: `achv-${idx}`, title }))
            : []

        return {
          total,
          positiveCount: positiveRows.length,
          averageRating: avg,
          canPublish,
          minRatingsForPublish: MIN_PUBLIC_RATINGS,
          topChips: canPublish ? topChips : [],
          achievements: canPublish ? achievements : [],
        }
      } catch (err) {
        if (isMissingFeedbackTable(err)) {
          return {
            total: 0,
            positiveCount: 0,
            averageRating: null as number | null,
            canPublish: false,
            minRatingsForPublish: MIN_PUBLIC_RATINGS,
            topChips: [] as Array<{ label: string; count: number }>,
            achievements: [] as Array<{ id: string; title: string }>,
          }
        }
        throw err
      }
    }),

  getPendingPrompts: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id
    const now = new Date()
    const tournamentCutoff = new Date(now.getTime() - TOURNAMENT_PROMPT_MIN_HOURS * 60 * 60 * 1000)
    const clubCutoff = new Date(now.getTime() - CLUB_PROMPT_DAYS * 24 * 60 * 60 * 1000)
    const appCutoff = new Date(now.getTime() - APP_PROMPT_DAYS * 24 * 60 * 60 * 1000)

    try {
      const [myRatings, joinedClubs, playedTournaments, user] = await Promise.all([
        ctx.prisma.feedback.findMany({
          where: { userId },
          select: { entityType: true, entityId: true },
        }),
        ctx.prisma.clubFollower.findMany({
          where: { userId },
          select: { clubId: true, createdAt: true },
        }),
        ctx.prisma.player.findMany({
          where: { userId },
          select: {
            tournamentId: true,
            tournament: {
              select: {
                id: true,
                title: true,
                endDate: true,
                clubId: true,
                userId: true,
              },
            },
          },
        }),
        ctx.prisma.user.findUnique({
          where: { id: userId },
          select: { createdAt: true },
        }),
      ])

      const rated = new Set(myRatings.map((r) => `${r.entityType}:${r.entityId}`))
      const prompts: Array<{
        promptId: string
        entityType: 'TOURNAMENT' | 'CLUB' | 'TD' | 'APP'
        entityId: string
        title: string
        subtitle: string
        source: 'post_tournament' | 'club_membership' | 'club_event' | 'app_usage'
        createdAt: string
      }> = []

      const tournamentsById = new Map<string, { id: string; title: string; endDate: Date; clubId: string | null; userId: string }>()
      for (const row of playedTournaments) {
        const t = row.tournament
        if (!t) continue
        tournamentsById.set(t.id, {
          id: t.id,
          title: t.title,
          endDate: t.endDate,
          clubId: t.clubId ?? null,
          userId: t.userId,
        })
      }

      for (const tournament of Array.from(tournamentsById.values())) {
        if (tournament.endDate > tournamentCutoff) continue
        if (!rated.has(`TOURNAMENT:${tournament.id}`)) {
          prompts.push({
            promptId: `prompt:tournament:${tournament.id}`,
            entityType: 'TOURNAMENT',
            entityId: tournament.id,
            title: 'Rate tournament',
            subtitle: `How was "${tournament.title}"?`,
            source: 'post_tournament',
            createdAt: tournament.endDate.toISOString(),
          })
        }
        if (!rated.has(`TD:${tournament.userId}`)) {
          prompts.push({
            promptId: `prompt:td:${tournament.userId}:${tournament.id}`,
            entityType: 'TD',
            entityId: tournament.userId,
            title: 'Rate tournament director',
            subtitle: `How did the director perform at "${tournament.title}"?`,
            source: 'post_tournament',
            createdAt: tournament.endDate.toISOString(),
          })
        }
      }

      const clubJoinedAt = new Map<string, Date>()
      for (const row of joinedClubs) {
        const prev = clubJoinedAt.get(row.clubId)
        if (!prev || row.createdAt < prev) clubJoinedAt.set(row.clubId, row.createdAt)
      }
      for (const [clubId, joinedAt] of Array.from(clubJoinedAt.entries())) {
        if (rated.has(`CLUB:${clubId}`)) continue
        if (joinedAt <= clubCutoff) {
          prompts.push({
            promptId: `prompt:club:joined:${clubId}`,
            entityType: 'CLUB',
            entityId: clubId,
            title: 'Rate club',
            subtitle: 'Share your experience with this club.',
            source: 'club_membership',
            createdAt: joinedAt.toISOString(),
          })
          continue
        }
        const hadEvent = Array.from(tournamentsById.values()).some((t) => t.clubId === clubId)
        if (hadEvent) {
          prompts.push({
            promptId: `prompt:club:event:${clubId}`,
            entityType: 'CLUB',
            entityId: clubId,
            title: 'Rate club',
            subtitle: 'You attended a club event. How was it?',
            source: 'club_event',
            createdAt: joinedAt.toISOString(),
          })
        }
      }

      if (user?.createdAt && user.createdAt <= appCutoff && !rated.has('APP:GLOBAL')) {
        prompts.push({
          promptId: 'prompt:app:global',
          entityType: 'APP',
          entityId: 'GLOBAL',
          title: 'Rate app experience',
          subtitle: 'How is your overall app experience so far?',
          source: 'app_usage',
          createdAt: user.createdAt.toISOString(),
        })
      }

      prompts.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      return { items: prompts.slice(0, 20) }
    } catch (err) {
      if (isMissingFeedbackTable(err)) return { items: [] as Array<Record<string, unknown>> }
      throw err
    }
  }),

  getBatchSummaries: protectedProcedure
    .input(
      z.object({
        entityType: entityTypeSchema,
        entityIds: z.array(z.string().min(1)).max(200),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!input.entityIds.length) return { map: {} as Record<string, { total: number; averageRating: number | null; canPublish: boolean }> }
      try {
        const rows = await ctx.prisma.feedback.findMany({
          where: {
            entityType: input.entityType,
            entityId: { in: input.entityIds },
          },
          select: {
            entityId: true,
            rating: true,
          },
        })
        const aggr = new Map<string, { sum: number; count: number }>()
        for (const row of rows) {
          const prev = aggr.get(row.entityId) ?? { sum: 0, count: 0 }
          prev.sum += row.rating
          prev.count += 1
          aggr.set(row.entityId, prev)
        }
        const map: Record<string, { total: number; averageRating: number | null; canPublish: boolean }> = {}
        for (const entityId of input.entityIds) {
          const v = aggr.get(entityId)
          if (!v) {
            map[entityId] = { total: 0, averageRating: null, canPublish: false }
            continue
          }
          map[entityId] = {
            total: v.count,
            averageRating: v.count > 0 ? v.sum / v.count : null,
            canPublish: v.count >= MIN_PUBLIC_RATINGS,
          }
        }
        return { map }
      } catch (err) {
        if (isMissingFeedbackTable(err)) {
          const map: Record<string, { total: number; averageRating: number | null; canPublish: boolean }> = {}
          for (const id of input.entityIds) map[id] = { total: 0, averageRating: null, canPublish: false }
          return { map }
        }
        throw err
      }
    }),
})

