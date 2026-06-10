import 'server-only'

import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { isNetworkTierName } from './network-tier'

/**
 * Network vs non-network membership split (WS6c, operator feedback 1.1).
 *
 * Two complementary signals:
 *  - membership NAME: "(Network)"-suffixed CourtReserve packages = chain-wide
 *    access (the operator's own definition of a network membership);
 *  - BEHAVIOR: follower rows / confirmed bookings at sibling clubs of the
 *    same network (do they actually use more than one location?).
 *
 * Privacy: everything about sibling clubs is aggregate counts only — a club
 * admin never sees another club's member list through this engine.
 */

export type NetworkMembershipSplit = {
  inNetwork: boolean
  networkName: string | null
  /** Sibling clubs in the same network (id+name only — needed for labels). */
  siblingClubs: Array<{ id: string; name: string }>
  rollup: {
    /** Active members of THIS club on a network-named tier. */
    networkMembers: number
    /** Active members of this club on a non-network tier. */
    singleClubMembers: number
    /** This club's members who also hold a follower row at ≥1 sibling club. */
    multiClubMembers: number
    /** This club's members with a confirmed booking at a sibling club in the last 90 days. */
    crossClubVisitors90d: number
  }
  /** Per-tier flag so the UI can badge network tiers without re-deriving. */
  tiers: Array<{ name: string; isNetworkTier: boolean; activeMembers: number }>
}

const EMPTY: NetworkMembershipSplit = {
  inNetwork: false,
  networkName: null,
  siblingClubs: [],
  rollup: { networkMembers: 0, singleClubMembers: 0, multiClubMembers: 0, crossClubVisitors90d: 0 },
  tiers: [],
}

export async function getNetworkMembershipSplit(clubId: string): Promise<NetworkMembershipSplit> {
  const clubRows = await prisma.$queryRaw<Array<{ network_id: string | null; network_name: string | null }>>`
    SELECT c.network_id, cn.name AS network_name
    FROM clubs c
    LEFT JOIN club_networks cn ON cn.id = c.network_id
    WHERE c.id = ${clubId}
  `
  const networkId = clubRows[0]?.network_id ?? null
  if (!networkId) return EMPTY

  const siblings = await prisma.$queryRaw<Array<{ id: string; name: string }>>`
    SELECT id, name FROM clubs
    WHERE network_id = ${networkId} AND id <> ${clubId}
    ORDER BY name
  `
  const siblingIds = siblings.map((s) => s.id)

  const since90 = new Date(Date.now() - 90 * 86_400_000)

  const [tierRows, multiClubRows, crossVisitorRows] = await Promise.all([
    // Active members per tier at THIS club (same JOIN shape as getTierHealth).
    prisma.$queryRaw<Array<{ tier: string | null; active: number | bigint }>>`
      SELECT u.membership_type AS tier,
             COUNT(*) FILTER (WHERE u.membership_status = 'Active') AS active
      FROM users u
      JOIN club_followers cf ON cf.user_id = u.id
      WHERE cf.club_id = ${clubId}
        AND u.membership_type IS NOT NULL
      GROUP BY u.membership_type
    `,
    siblingIds.length === 0
      ? Promise.resolve([{ cnt: 0 }] as Array<{ cnt: number | bigint }>)
      : prisma.$queryRaw<Array<{ cnt: number | bigint }>>`
          SELECT COUNT(DISTINCT cf.user_id) AS cnt
          FROM club_followers cf
          WHERE cf.club_id = ${clubId}
            AND EXISTS (
              SELECT 1 FROM club_followers cf2
              WHERE cf2.user_id = cf.user_id
                AND cf2.club_id IN (${Prisma.join(siblingIds)})
            )
        `,
    siblingIds.length === 0
      ? Promise.resolve([{ cnt: 0 }] as Array<{ cnt: number | bigint }>)
      : prisma.$queryRaw<Array<{ cnt: number | bigint }>>`
          SELECT COUNT(DISTINCT psb."userId") AS cnt
          FROM play_session_bookings psb
          JOIN play_sessions ps ON ps.id = psb."sessionId"
          WHERE ps."clubId" IN (${Prisma.join(siblingIds)})
            AND psb.status = 'CONFIRMED'
            AND ps.date >= ${since90}
            AND psb."userId" IN (
              SELECT user_id FROM club_followers WHERE club_id = ${clubId}
            )
        `,
  ])

  let networkMembers = 0
  let singleClubMembers = 0
  const tiers = tierRows
    .filter((r): r is { tier: string; active: number | bigint } => !!r.tier)
    .map((r) => {
      const active = Number(r.active)
      const isNet = isNetworkTierName(r.tier)
      if (isNet) networkMembers += active
      else singleClubMembers += active
      return { name: r.tier, isNetworkTier: isNet, activeMembers: active }
    })
    .sort((a, b) => b.activeMembers - a.activeMembers)

  return {
    inNetwork: true,
    networkName: clubRows[0]?.network_name ?? null,
    siblingClubs: siblings,
    rollup: {
      networkMembers,
      singleClubMembers,
      multiClubMembers: Number(multiClubRows[0]?.cnt ?? 0),
      crossClubVisitors90d: Number(crossVisitorRows[0]?.cnt ?? 0),
    },
    tiers,
  }
}
