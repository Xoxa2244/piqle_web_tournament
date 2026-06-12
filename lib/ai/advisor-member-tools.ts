import 'server-only'

import { tool, jsonSchema, type ToolSet } from 'ai'
import { prisma } from '@/lib/prisma'

/**
 * On-demand member tools for the AI Advisor chat (Layer 2 of the Advisor fix).
 *
 * WHY: the prefetched "Members by Tier" block only shows a CAPPED sample
 * (top lapsed + top active) per tier. When a user asks for "more", a specific
 * sort, or a deeper page, the model used to run out of shown names and
 * FABRICATE (invent people, or relabel members from other tiers). This tool
 * lets the model fetch the REAL next page / sort / filter for an exact tier on
 * demand, so there is never a reason to invent.
 *
 * Defined with jsonSchema() (NOT Zod) to avoid the Zod-serialization issue on
 * Vercel documented in lib/ai/onboarding-tools.ts. Enable in streamText with
 * `stopWhen: stepCountIs(N)` so the tool result is fed back for the final text.
 *
 * Recency = last CONFIRMED past session (ps."date" <= now); future-dated
 * bookings never count as a visit. Same prod raw-SQL rules as the roster
 * helper: quoted camelCase (ps."clubId"/b."userId"/b."sessionId"), snake
 * cf.club_id, plain text params, NO ::uuid casts.
 */

// AI SDK tool() overloads are strict with jsonSchema — cast to bypass TS.
const t = tool as (...args: any[]) => any

type MemberRow = {
  name: string | null
  played_total: bigint | number
  played_30d: bigint | number
  last_played: Date | string | null
  total_matching: bigint | number
}

const SORTS: Record<string, string> = {
  most_active: 'm.played_total DESC, m.played_30d DESC, m.name ASC',
  recent: 'm.last_played DESC NULLS LAST, m.name ASC',
  least_recent: 'm.last_played ASC NULLS FIRST, m.name ASC',
}

const FILTERS: Record<string, string> = {
  all: 'TRUE',
  attended_30d: 'm.played_30d > 0',
  never_attended: 'm.last_played IS NULL',
  lapsed: "m.last_played IS NOT NULL AND m.last_played < now() - interval '30 days'",
}

export function createAdvisorMemberTools(clubId: string): ToolSet {
  return {
    getMembersByTier: t({
      description:
        'Fetch the REAL members of one membership tier, sorted/filtered/paginated, when you need more than the prefetched "Members by Tier" sample (e.g. the user asks for "more", a longer list, a specific sort, or page 2). Returns actual member names with attendance recency — ALWAYS use these instead of guessing or inventing names. Pass the tier name exactly as it appears in the "Members by Tier" / "Membership Subscription Breakdown" context (e.g. "Court Pass - $99 Annually or $14.99/Month"); a partial name works but if it matches several tiers the tool returns the candidates so you can re-call with the exact one. To page through "more", call again with a larger offset.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          tier: {
            type: 'string',
            description:
              'Membership tier name (exact or partial substring). "(Network)" variants are separate tiers.',
          },
          sortBy: {
            type: 'string',
            enum: ['most_active', 'recent', 'least_recent'],
            description:
              'most_active = highest total plays (use for "most active / best / power users"); least_recent = longest-lapsed / never-attended first (use for "haven\'t visited / at risk / win-back"); recent = most recently attended first. Default most_active.',
          },
          filter: {
            type: 'string',
            enum: ['all', 'attended_30d', 'never_attended', 'lapsed'],
            description:
              'all = every active subscriber in the tier; attended_30d = attended a session in last 30 days; never_attended = no past attendance on record; lapsed = attended before but not in last 30 days. Default all.',
          },
          limit: {
            type: 'number',
            description: 'How many members to return (1-50). Default 15.',
          },
          offset: {
            type: 'number',
            description: 'Skip this many before returning — for paging "more". Default 0.',
          },
        },
        required: ['tier'],
      }),
      execute: async (args: {
        tier?: string
        sortBy?: string
        filter?: string
        limit?: number
        offset?: number
      }) => {
        try {
          const tierInput = (args.tier || '').trim()
          if (!tierInput) return { error: 'Provide a tier name.' }

          const sort = SORTS[args.sortBy || 'most_active'] || SORTS.most_active
          const filterClause = FILTERS[args.filter || 'all'] || FILTERS.all
          const limit = Math.min(50, Math.max(1, Math.floor(args.limit ?? 15)))
          const offset = Math.max(0, Math.floor(args.offset ?? 0))
          const pattern = `%${tierInput}%`

          // 1) Resolve the tier to an EXACT membership_type. If the partial
          // matches several tiers, hand the candidates back so the model can
          // re-call with the exact string (prevents cross-tier mislabeling).
          const matched: Array<{ tier: string; active: bigint | number }> =
            await prisma.$queryRawUnsafe(
              `
              SELECT u.membership_type AS tier, COUNT(*) AS active
              FROM club_followers cf JOIN users u ON u.id = cf.user_id
              WHERE cf.club_id = $1
                AND u.membership_type ILIKE $2
                AND lower(coalesce(u.membership_status, '')) IN ('active','trial','trialing')
              GROUP BY u.membership_type
              ORDER BY active DESC
              `,
              clubId,
              pattern,
            )

          if (!matched || matched.length === 0) {
            return { error: `No active members found for a tier matching "${tierInput}". Check the exact tier name in the Membership Breakdown.` }
          }
          // Exact-match-wins: a non-Network tier name is a substring of its
          // "(Network)" sibling, so ILIKE returns both. If the input equals one
          // candidate exactly (case-insensitive), use that — otherwise a bare
          // partial that hits several tiers is genuinely ambiguous.
          const exactMatch = matched.find(
            (r) => (r.tier || '').trim().toLowerCase() === tierInput.toLowerCase(),
          )
          const resolved = exactMatch ?? (matched.length === 1 ? matched[0] : null)
          if (!resolved) {
            return {
              ambiguous: true,
              message: `"${tierInput}" matches ${matched.length} tiers. Re-call getMembersByTier with one exact tier name (copy it verbatim, including any "(Network)" suffix).`,
              matchedTiers: matched.map((r) => ({ tier: r.tier, activeMembers: Number(r.active) })),
            }
          }

          const exactTier = resolved.tier
          const activeInTier = Number(resolved.active)

          // 2) Page of members for that exact tier.
          const rows: MemberRow[] = await prisma.$queryRawUnsafe(
            `
            WITH m AS (
              SELECT u.id, u.name,
                COUNT(b.*) FILTER (WHERE b.status::text='CONFIRMED' AND ps."date" <= now())                                            AS played_total,
                COUNT(b.*) FILTER (WHERE b.status::text='CONFIRMED' AND ps."date" <= now() AND ps."date" >= now() - interval '30 days') AS played_30d,
                MAX(ps."date") FILTER (WHERE b.status::text='CONFIRMED' AND ps."date" <= now())                                         AS last_played
              FROM club_followers cf
              JOIN users u ON u.id = cf.user_id
              LEFT JOIN play_session_bookings b ON b."userId" = u.id
              LEFT JOIN play_sessions ps ON ps.id = b."sessionId" AND ps."clubId" = cf.club_id
              WHERE cf.club_id = $1
                AND u.membership_type = $2
                AND lower(coalesce(u.membership_status, '')) IN ('active','trial','trialing')
              GROUP BY u.id, u.name
            )
            SELECT m.name, m.played_total, m.played_30d, m.last_played,
                   COUNT(*) OVER() AS total_matching
            FROM m
            WHERE ${filterClause}
            ORDER BY ${sort}
            LIMIT ${limit} OFFSET ${offset}
            `,
            clubId,
            exactTier,
          )

          const now = Date.now()
          const totalMatching = rows.length > 0 ? Number(rows[0].total_matching) : 0
          const members = rows.map((r) => {
            const last = r.last_played ? new Date(r.last_played) : null
            return {
              name: r.name || 'Unknown',
              playsTotal: Number(r.played_total) || 0,
              plays30d: Number(r.played_30d) || 0,
              lastAttendedDaysAgo: last ? Math.floor((now - last.getTime()) / 86_400_000) : null,
            }
          })

          return {
            tier: exactTier,
            activeInTier,
            filter: args.filter || 'all',
            sortBy: args.sortBy || 'most_active',
            totalMatchingFilter: totalMatching,
            offset,
            returned: members.length,
            hasMore: offset + members.length < totalMatching,
            members,
            note: 'These are the ONLY members for this tier+filter. If returned < total, the rest are on the next page (increase offset). NEVER invent additional names.',
          }
        } catch (err) {
          console.error('[Advisor getMembersByTier] failed:', err instanceof Error ? err.message : err)
          return { error: 'Failed to load tier members.' }
        }
      },
    }),
  }
}
