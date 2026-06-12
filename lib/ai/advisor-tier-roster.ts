import 'server-only'

import type { PrismaClient } from '@prisma/client'

/**
 * Members-by-Tier roster block for the AI Advisor system prompt.
 *
 * WHY THIS EXISTS: the Advisor's prefetched context carried tier data only as
 * aggregate counts (Membership Breakdown, Tier Economics/Health) and a flat,
 * tier-LESS member-health sample. So "How many VIP members?" was answerable but
 * "WHICH VIP members haven't visited in 45 days?" was not — the LLM had no
 * member→tier mapping and fell back to reciting one aggregate. This block gives
 * the LLM, per real CourtReserve tier, the actual members with their attendance
 * recency + play counts so it can answer the whole "Which [TIER] members …"
 * family of questions (and expose Create-Audience) with real names.
 *
 * Recency = last CONFIRMED session the member actually attended, PAST sessions
 * only (ps.date <= now) — a future-dated booking is not a "visit". This mirrors
 * the past-only recency rule used by member-health / slot-filler / reactivation.
 *
 * Caps keep the prompt bounded: per tier we surface the longest-lapsed (the
 * at-risk / win-back shape) and the most-active (the "who are the best" shape),
 * which together cover the dominant question shapes without dumping ~2,700 rows.
 */

const LAPSED_PER_TIER = 10
const ACTIVE_PER_TIER = 5

type RosterRow = {
  tier: string
  user_id: string
  name: string | null
  played_total: bigint | number
  played_30d: bigint | number
  last_played: Date | string | null
}

type Member = {
  name: string
  playedTotal: number
  played30d: number
  lastPlayed: Date | null
  daysSince: number | null
}

function daysBetween(now: Date, then: Date): number {
  return Math.floor((now.getTime() - then.getTime()) / 86_400_000)
}

export async function buildAdvisorTierRosterBlock(opts: {
  prisma: PrismaClient
  clubId: string
  now?: Date
}): Promise<string> {
  const { prisma, clubId } = opts
  const now = opts.now ?? new Date()

  let rows: RosterRow[]
  try {
    // One pass over active subscribers with a real tier. clubId columns are
    // TEXT on prod — pass as a plain text param, NO ::uuid cast (documented
    // trap). club_followers uses snake_case (cf.club_id); play_sessions uses
    // quoted camelCase (ps."clubId"); booking→session FK is b."sessionId".
    rows = await prisma.$queryRawUnsafe<RosterRow[]>(
      `
      SELECT
        u.membership_type AS tier,
        u.id              AS user_id,
        u.name            AS name,
        COUNT(b.*) FILTER (WHERE b.status::text = 'CONFIRMED' AND ps."date" <= now())                                            AS played_total,
        COUNT(b.*) FILTER (WHERE b.status::text = 'CONFIRMED' AND ps."date" <= now() AND ps."date" >= now() - interval '30 days') AS played_30d,
        MAX(ps."date") FILTER (WHERE b.status::text = 'CONFIRMED' AND ps."date" <= now())                                         AS last_played
      FROM club_followers cf
      JOIN users u ON u.id = cf.user_id
      LEFT JOIN play_session_bookings b ON b."userId" = u.id
      LEFT JOIN play_sessions ps ON ps.id = b."sessionId" AND ps."clubId" = cf.club_id
      WHERE cf.club_id = $1
        AND u.membership_type IS NOT NULL
        AND lower(coalesce(u.membership_status, '')) IN ('active', 'trial', 'trialing')
      GROUP BY u.membership_type, u.id, u.name
      `,
      clubId,
    )
  } catch (err) {
    console.error('[Advisor TierRoster] query failed:', err instanceof Error ? err.message : err)
    return ''
  }

  if (!rows || rows.length === 0) return ''

  // Bucket by tier
  const byTier = new Map<string, Member[]>()
  for (const r of rows) {
    const lastPlayed = r.last_played ? new Date(r.last_played) : null
    const member: Member = {
      name: r.name || 'Unknown',
      playedTotal: Number(r.played_total) || 0,
      played30d: Number(r.played_30d) || 0,
      lastPlayed,
      daysSince: lastPlayed ? daysBetween(now, lastPlayed) : null,
    }
    const list = byTier.get(r.tier) || []
    list.push(member)
    byTier.set(r.tier, list)
  }

  // Tiers sorted by active size desc
  const tiers = Array.from(byTier.entries()).sort((a, b) => b[1].length - a[1].length)

  const sections: string[] = []
  for (const [tier, members] of tiers) {
    const active = members.length
    const played30dCt = members.filter((m) => m.played30d > 0).length
    const neverCt = members.filter((m) => m.lastPlayed === null).length
    const totalPlays = members.reduce((s, m) => s + m.playedTotal, 0)
    const avgPlays = active > 0 ? (totalPlays / active).toFixed(1) : '0'

    // Longest-lapsed / never attended first: never (null) ranks oldest, then by daysSince desc
    const lapsed = [...members]
      .sort((a, b) => {
        if (a.lastPlayed === null && b.lastPlayed === null) return 0
        if (a.lastPlayed === null) return -1
        if (b.lastPlayed === null) return 1
        return (b.daysSince ?? 0) - (a.daysSince ?? 0)
      })
      .slice(0, LAPSED_PER_TIER)

    // Most active by total confirmed plays
    const topActive = [...members]
      .filter((m) => m.playedTotal > 0)
      .sort((a, b) => b.playedTotal - a.playedTotal)
      .slice(0, ACTIVE_PER_TIER)

    const lapsedLines = lapsed
      .map((m) =>
        m.lastPlayed === null
          ? `  - ${m.name} — never attended · ${m.playedTotal} plays total`
          : `  - ${m.name} — last attended ${m.daysSince}d ago · ${m.playedTotal} plays total`,
      )
      .join('\n')

    const activeLines = topActive.length
      ? topActive
          .map(
            (m) =>
              `  - ${m.name} — ${m.playedTotal} plays · ${m.played30d} in last 30d · last ${m.daysSince}d ago`,
          )
          .join('\n')
      : '  - (no members with any attendance on record)'

    sections.push(
      `### ${tier}
${active} active subscribers · ${played30dCt} attended a session in last 30d · ${neverCt} never attended · avg ${avgPlays} plays/member
Longest-lapsed / never attended (oldest first; use for "haven't visited", "at risk", "stopped attending", "likely to churn"):
${lapsedLines}
Most active (use for "most active", "best", "power users"):
${activeLines}
(showing up to ${LAPSED_PER_TIER} lapsed + ${ACTIVE_PER_TIER} active of ${active} active in this tier)`,
    )
  }

  return `## Members by Tier (active subscribers, grouped by their REAL CourtReserve membership tier name)
Use this to answer any "Which [TIER] members …" question with actual member names — match the tier by its exact name below (Network variants are listed as separate tiers, e.g. "… (Network)"). "Attended/visited/played" = a CONFIRMED past session; counts exclude future-dated bookings. For tier-level totals (counts, MRR) also see the Membership Breakdown and Tier Economics blocks.

${sections.join('\n\n')}`
}
