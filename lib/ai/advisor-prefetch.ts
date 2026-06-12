import 'server-only'

import { Redis } from '@upstash/redis'
import { prisma } from '@/lib/prisma'
import { createChatTools } from '@/lib/ai/chat-tools'
import { buildAdvisorOutcomeInsightsBlock, buildAdvisorRecentSendSnapshotBlock } from '@/lib/ai/advisor-outcome-insights'
import { buildAdvisorTierRosterBlock } from '@/lib/ai/advisor-tier-roster'

/**
 * Advisor prefetch cache (3-layer).
 *
 * The /api/ai/chat prompt bakes in a large "live data" snapshot (club metrics,
 * member health, tier roster over all active members, sessions, RAG-adjacent
 * blocks). Computing it cold takes ~8-12s (deploy-cold ~28s). It used to be
 * cached only in a per-lambda in-memory Map (5 min) — useless across the many
 * serverless instances Vercel spins up, so a user landing on a cold instance
 * paid the full cost.
 *
 * Layers:
 *   L1 in-memory Map (per instance, fastest)  →
 *   L2 Upstash Redis (SHARED across instances, refreshed by a cron every ~5m) →
 *   L3 compute (and write back to L1 + L2).
 *
 * The cron /api/cron/advisor-prefetch-warm keeps L2 warm for advisor-active
 * clubs, so real users almost always read warm shared data (~5-6s answers).
 * Redis is best-effort: every Redis op degrades to compute on failure, so the
 * Advisor never breaks if Redis is slow/down.
 */

export type AdvisorPrefetchData = {
  metrics: any
  memberHealth: any
  courtOcc: any
  reactivation: any
  membershipData: any
  upcomingSessions: any
  todayOpenSessions: any
  tonightOpenSessions: any
  outcomeInsights: string
  overnightSends: string
  ratedPlayers: any
  tierEconomics: any
  tierHealth: any
  tierRoster: string
}

type Entry = { ts: number; data: AdvisorPrefetchData }

const L1_TTL_MS = 5 * 60 * 1000 // in-memory freshness
const L2_TTL_MS = 12 * 60 * 1000 // accept Redis data up to 12 min old
const REDIS_EX_SECONDS = 15 * 60 // Redis key lifetime

const l1 = new Map<string, Entry>()

function redisKey(clubId: string) {
  return `advisor_prefetch:v1:${clubId}`
}

let redisSingleton: Redis | null = null
let redisResolved = false
function getRedis(): Redis | null {
  if (redisResolved) return redisSingleton
  redisResolved = true
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (url && token) redisSingleton = new Redis({ url, token })
  return redisSingleton
}

/** Run the heavy parallel prefetch. appOrigin is NOT needed here — session
 *  URLs are resolved at render time in the route. */
export async function fetchAdvisorPrefetchData(clubId: string): Promise<AdvisorPrefetchData> {
  const tools = createChatTools(clubId)
  const exec = (t: any, args: any) =>
    t.execute(args, { toolCallId: 'prefetch', messages: [] }).catch(() => null)

  const club = await prisma.club
    .findUnique({ where: { id: clubId }, select: { automationSettings: true } })
    .catch(() => null)
  const clubTimeZone =
    ((club?.automationSettings as any)?.intelligence?.timezone as string | undefined) ||
    'America/New_York'

  const [
    metrics, memberHealth, courtOcc, reactivation, membershipData,
    upcomingSessions, todayOpenSessions, tonightOpenSessions,
    outcomeInsights, overnightSends, ratedPlayers, tierEconomics, tierHealth, tierRoster,
  ] = await Promise.all([
    exec(tools.getClubMetrics, {}),
    exec(tools.getMemberHealth, { filter: 'all', limit: 50 }),
    exec(tools.getCourtOccupancy, { days: 30 }),
    exec(tools.getReactivationCandidates, { limit: 10 }),
    exec(tools.getMembershipBreakdown, {}),
    exec(tools.getUpcomingSessions, { limit: 30, onlyOpenSpots: true }),
    exec(tools.getUpcomingSessions, { limit: 50, onlyOpenSpots: true, dayScope: 'today' }),
    exec(tools.getUpcomingSessions, { limit: 50, onlyOpenSpots: true, dayScope: 'tonight' }),
    buildAdvisorOutcomeInsightsBlock({ prisma, clubId, days: 30 }).catch(() => ''),
    buildAdvisorRecentSendSnapshotBlock({ prisma, clubId, timeZone: clubTimeZone }).catch(() => ''),
    exec(tools.getRatedPlayers, { limit: 30 }),
    exec(tools.getTierEconomics, {}),
    exec(tools.getTierHealth, {}),
    buildAdvisorTierRosterBlock({ prisma, clubId }).catch(() => ''),
  ])

  return {
    metrics, memberHealth, courtOcc, reactivation, membershipData,
    upcomingSessions, todayOpenSessions, tonightOpenSessions,
    outcomeInsights: outcomeInsights || '', overnightSends: overnightSends || '',
    ratedPlayers, tierEconomics, tierHealth, tierRoster: tierRoster || '',
  }
}

async function readRedis(clubId: string): Promise<Entry | null> {
  const redis = getRedis()
  if (!redis) return null
  try {
    const raw = await redis.get<Entry>(redisKey(clubId))
    if (raw && typeof raw.ts === 'number' && raw.data) return raw
    return null
  } catch (e) {
    console.warn('[AdvisorPrefetch] Redis read failed:', (e as Error).message?.slice(0, 80))
    return null
  }
}

async function writeRedis(clubId: string, entry: Entry): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  try {
    await redis.set(redisKey(clubId), entry, { ex: REDIS_EX_SECONDS })
  } catch (e) {
    console.warn('[AdvisorPrefetch] Redis write failed:', (e as Error).message?.slice(0, 80))
  }
}

/**
 * Get the prefetch snapshot for a club: L1 → L2(Redis) → L3(compute).
 * Always returns data (computes on total miss). Best-effort writes back.
 */
export async function getAdvisorPrefetchData(
  clubId: string,
): Promise<{ data: AdvisorPrefetchData; source: 'memory' | 'redis' | 'fresh' }> {
  const now = Date.now()

  // L1
  const mem = l1.get(clubId)
  if (mem && now - mem.ts < L1_TTL_MS) {
    return { data: mem.data, source: 'memory' }
  }

  // L2
  const fromRedis = await readRedis(clubId)
  if (fromRedis && now - fromRedis.ts < L2_TTL_MS) {
    l1.set(clubId, fromRedis) // promote to L1
    return { data: fromRedis.data, source: 'redis' }
  }

  // L3
  const data = await fetchAdvisorPrefetchData(clubId)
  const entry: Entry = { ts: Date.now(), data }
  l1.set(clubId, entry)
  await writeRedis(clubId, entry)
  return { data, source: 'fresh' }
}

/** Force a fresh compute + write to L1 and L2. Used by the warm cron. */
export async function refreshAdvisorPrefetch(clubId: string): Promise<void> {
  const data = await fetchAdvisorPrefetchData(clubId)
  const entry: Entry = { ts: Date.now(), data }
  l1.set(clubId, entry)
  await writeRedis(clubId, entry)
}
