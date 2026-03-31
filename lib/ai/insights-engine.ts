/**
 * AI Insights Engine
 *
 * Generates actionable club insights from SQL queries — no LLM needed.
 * Each insight is a data-driven observation with a recommended action.
 */

// ── Types ──

export interface Insight {
  id: string
  type: 'court_optimization' | 'member_retention' | 'growth' | 'alert' | 'schedule'
  priority: 'high' | 'medium' | 'low'
  title: string
  description: string
  action: string
  actionLink?: string
  metrics: Record<string, number>
}

// ── Constants ──

const DAYS_LOOKBACK = 30

// ── Helper: generate deterministic insight ID ──
function insightId(slug: string): string {
  return `insight_${slug}_${new Date().toISOString().slice(0, 10)}`
}

// ── Priority ordering helper ──
const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 }

// ── 1. Underutilized Courts ──
async function underutilizedCourts(prisma: any, clubId: string): Promise<Insight | null> {
  const rows: Array<{
    courtId: string
    courtName: string
    bookedSlots: bigint
    totalSlots: bigint
    occupancyPct: number
  }>[] = await prisma.$queryRawUnsafe(`
    WITH scheduled_slots AS (
      SELECT
        cc.id AS "courtId",
        cc.name AS "courtName",
        COUNT(DISTINCT (ps.date::date || '-' || ps."startTime"::text)) AS "totalSlots"
      FROM play_sessions ps
      JOIN club_courts cc ON cc.id = ps."courtId"
      WHERE ps."clubId" = $1::uuid
        AND ps.date >= NOW() - INTERVAL '30 days'
        AND ps.date <= NOW()
      GROUP BY cc.id, cc.name
    ),
    booked_slots AS (
      SELECT
        ps."courtId",
        COUNT(DISTINCT (ps.date::date || '-' || ps."startTime"::text)) AS "bookedSlots"
      FROM play_sessions ps
      JOIN play_session_bookings b ON b."sessionId" = ps.id
      WHERE ps."clubId" = $1::uuid
        AND ps.date >= NOW() - INTERVAL '30 days'
        AND ps.date <= NOW()
        AND b.status::text = 'CONFIRMED'
      GROUP BY ps."courtId"
    )
    SELECT
      ss."courtId",
      ss."courtName",
      COALESCE(bs."bookedSlots", 0) AS "bookedSlots",
      ss."totalSlots",
      ROUND(COALESCE(bs."bookedSlots", 0)::numeric / ss."totalSlots" * 100, 1) AS "occupancyPct"
    FROM scheduled_slots ss
    LEFT JOIN booked_slots bs ON bs."courtId" = ss."courtId"
    WHERE ss."totalSlots" > 0
    ORDER BY ss."courtName" ASC
  `, clubId)

  if (!rows || rows.length < 2) return null

  const underused = (rows as any[]).filter((r: any) => Number(r.occupancyPct) < 25)
  const busiest = (rows as any[]).reduce((a: any, b: any) => Number(a.occupancyPct) > Number(b.occupancyPct) ? a : b)

  if (underused.length === 0) return null

  const worst = underused[0] as any
  return {
    id: insightId('underutilized_courts'),
    type: 'court_optimization',
    priority: 'medium',
    title: `${underused.length} court${underused.length > 1 ? 's' : ''} under 25% occupancy`,
    description: `${worst.courtName} is at ${Number(worst.occupancyPct)}% occupancy vs ${busiest.courtName} at ${Number(busiest.occupancyPct)}%. Consider consolidating sessions to fewer courts or adding programming to underused ones.`,
    action: 'Review court allocation and consider moving sessions to underutilized courts',
    actionLink: '/sessions',
    metrics: {
      underutilizedCourts: underused.length,
      lowestOccupancy: Number(worst.occupancyPct),
      highestOccupancy: Number(busiest.occupancyPct),
    },
  }
}

// ── 2. Peak Hour Overflow ──
async function peakHourOverflow(prisma: any, clubId: string): Promise<Insight | null> {
  const rows: any[] = await prisma.$queryRawUnsafe(`
    SELECT
      EXTRACT(HOUR FROM ps.date) AS hour,
      COUNT(*) AS "sessionCount",
      SUM(COALESCE(ps."registered_count", 0)) AS "totalBooked",
      SUM(ps."maxPlayers") AS "totalCapacity",
      ROUND(SUM(COALESCE(ps."registered_count", 0))::numeric / NULLIF(SUM(ps."maxPlayers"), 0) * 100, 1) AS "occupancyPct"
    FROM play_sessions ps
    WHERE ps."clubId" = $1::uuid
      AND ps.date >= NOW() - INTERVAL '30 days'
      AND ps.date <= NOW()
      AND ps.status::text != 'CANCELLED'
    GROUP BY EXTRACT(HOUR FROM ps.date)
    HAVING SUM(ps."maxPlayers") > 0
    ORDER BY "occupancyPct" DESC
  `, clubId)

  if (!rows || rows.length === 0) return null

  const overflow = rows.filter((r: any) => Number(r.occupancyPct) > 80)
  if (overflow.length === 0) return null

  const peakHour = Number(overflow[0].hour)
  const peakPct = Number(overflow[0].occupancyPct)
  const label = peakHour <= 12 ? `${peakHour}AM` : `${peakHour - 12}PM`

  return {
    id: insightId('peak_overflow'),
    type: 'schedule',
    priority: 'high',
    title: `${overflow.length} time slot${overflow.length > 1 ? 's' : ''} over 80% capacity`,
    description: `The ${label} slot runs at ${peakPct}% capacity on average. ${overflow.length > 1 ? `${overflow.length} slots total are near overflow.` : ''} Adding parallel sessions or extending hours could capture unmet demand.`,
    action: 'Add parallel sessions during peak hours to capture overflow demand',
    actionLink: '/sessions',
    metrics: {
      overflowSlots: overflow.length,
      peakHour,
      peakOccupancy: peakPct,
    },
  }
}

// ── 3. VIP Members at Risk ──
async function vipMembersAtRisk(prisma: any, clubId: string): Promise<Insight | null> {
  const rows: any[] = await prisma.$queryRawUnsafe(`
    WITH vip_members AS (
      SELECT
        de.source_id AS "userId",
        de.metadata->>'membership' AS membership,
        de.metadata->>'membershipStatus' AS status,
        de.metadata->>'monthlyDues' AS dues
      FROM document_embeddings de
      WHERE de.club_id = $1::uuid
        AND de.content_type = 'member'
        AND de.source_table = 'csv_import'
        AND de.metadata->>'membershipStatus' = 'Currently Active'
        AND (de.metadata->>'membership' ILIKE '%VIP%' OR de.metadata->>'membership' ILIKE '%Premium%' OR de.metadata->>'membership' ILIKE '%Unlimited%')
    ),
    last_play AS (
      SELECT
        b."userId",
        MAX(ps.date) AS "lastPlayed"
      FROM play_session_bookings b
      JOIN play_sessions ps ON ps.id = b."sessionId"
      WHERE ps."clubId" = $1::uuid
        AND b.status::text = 'CONFIRMED'
      GROUP BY b."userId"
    )
    SELECT
      v."userId",
      v.membership,
      v.dues,
      lp."lastPlayed",
      EXTRACT(DAY FROM NOW() - lp."lastPlayed") AS "daysSincePlayed"
    FROM vip_members v
    LEFT JOIN last_play lp ON lp."userId" = v."userId"
    WHERE lp."lastPlayed" IS NULL OR lp."lastPlayed" < NOW() - INTERVAL '14 days'
  `, clubId)

  if (!rows || rows.length === 0) return null

  const totalDues = rows.reduce((sum: number, r: any) => {
    const d = parseFloat(r.dues)
    return sum + (isNaN(d) ? 0 : d)
  }, 0)

  return {
    id: insightId('vip_at_risk'),
    type: 'member_retention',
    priority: 'high',
    title: `${rows.length} VIP member${rows.length > 1 ? 's' : ''} at risk`,
    description: `${rows.length} premium members haven't played in 14+ days, representing $${Math.round(totalDues)}/mo in revenue at risk. Personal outreach can prevent cancellations.`,
    action: 'Send personal outreach to VIP members inactive 14+ days',
    actionLink: '/members?view=reactivation',
    metrics: {
      atRiskVips: rows.length,
      monthlyRevenueAtRisk: Math.round(totalDues),
    },
  }
}

// ── 4. Guest Pass Upsell ──
async function guestPassUpsell(prisma: any, clubId: string): Promise<Insight | null> {
  const rows: any[] = await prisma.$queryRawUnsafe(`
    WITH guest_members AS (
      SELECT
        de.source_id AS "userId",
        de.metadata->>'membership' AS membership
      FROM document_embeddings de
      WHERE de.club_id = $1::uuid
        AND de.content_type = 'member'
        AND de.source_table = 'csv_import'
        AND de.metadata->>'membershipStatus' = 'Currently Active'
        AND (
          de.metadata->>'membership' ILIKE '%guest%'
          OR de.metadata->>'membership' ILIKE '%pay per%'
          OR de.metadata->>'membership' ILIKE '%drop%in%'
          OR de.metadata->>'membership' ILIKE '%trial%'
        )
    ),
    booking_counts AS (
      SELECT
        b."userId",
        COUNT(*) AS "bookingCount"
      FROM play_session_bookings b
      JOIN play_sessions ps ON ps.id = b."sessionId"
      WHERE ps."clubId" = $1::uuid
        AND ps.date >= NOW() - INTERVAL '30 days'
        AND ps.date <= NOW()
        AND b.status::text = 'CONFIRMED'
      GROUP BY b."userId"
    )
    SELECT
      g."userId",
      g.membership,
      bc."bookingCount"
    FROM guest_members g
    JOIN booking_counts bc ON bc."userId" = g."userId"
    WHERE bc."bookingCount" >= 5
    ORDER BY bc."bookingCount" DESC
  `, clubId)

  if (!rows || rows.length === 0) return null

  const avgBookings = Math.round(rows.reduce((s: number, r: any) => s + Number(r.bookingCount), 0) / rows.length)

  return {
    id: insightId('guest_upsell'),
    type: 'growth',
    priority: 'high',
    title: `${rows.length} guest${rows.length > 1 ? 's' : ''} ready for membership`,
    description: `${rows.length} Guest Pass holders played ${avgBookings}+ times in 30 days. They're clearly engaged and likely to convert to a full membership.`,
    action: 'Send membership conversion offers to frequent guests',
    actionLink: '/members?view=at-risk',
    metrics: {
      readyToConvert: rows.length,
      avgBookings,
    },
  }
}

// ── 5. Suspended Members Win-back ──
async function suspendedWinback(prisma: any, clubId: string): Promise<Insight | null> {
  const rows: any[] = await prisma.$queryRawUnsafe(`
    WITH suspended AS (
      SELECT
        de.source_id AS "userId",
        de.metadata->>'membership' AS membership
      FROM document_embeddings de
      WHERE de.club_id = $1::uuid
        AND de.content_type = 'member'
        AND de.source_table = 'csv_import'
        AND de.metadata->>'membershipStatus' = 'Suspended'
    ),
    recent_activity AS (
      SELECT
        b."userId",
        MAX(ps.date) AS "lastPlayed"
      FROM play_session_bookings b
      JOIN play_sessions ps ON ps.id = b."sessionId"
      WHERE ps."clubId" = $1::uuid
        AND b.status::text = 'CONFIRMED'
      GROUP BY b."userId"
    )
    SELECT
      s."userId",
      s.membership,
      ra."lastPlayed",
      CASE WHEN ra."lastPlayed" >= NOW() - INTERVAL '30 days' THEN true ELSE false END AS "recentlyActive"
    FROM suspended s
    LEFT JOIN recent_activity ra ON ra."userId" = s."userId"
  `, clubId)

  if (!rows || rows.length === 0) return null

  const recentlyActive = rows.filter((r: any) => r.recentlyActive === true).length

  return {
    id: insightId('suspended_winback'),
    type: 'member_retention',
    priority: recentlyActive > 0 ? 'medium' : 'low',
    title: `${rows.length} suspended member${rows.length > 1 ? 's' : ''} — ${recentlyActive} were recently active`,
    description: `${rows.length} members are suspended. ${recentlyActive > 0 ? `${recentlyActive} of them played within the last 30 days — they may reactivate with a targeted offer.` : 'None have played recently, but a win-back campaign could re-engage some.'}`,
    action: recentlyActive > 0 ? 'Send targeted win-back offers to recently active suspended members' : 'Consider a win-back campaign for suspended members',
    actionLink: '/members?view=reactivation',
    metrics: {
      suspendedMembers: rows.length,
      recentlyActive,
    },
  }
}

// ── 6. Format Mismatch ──
async function formatMismatch(prisma: any, clubId: string): Promise<Insight | null> {
  const rows: any[] = await prisma.$queryRawUnsafe(`
    SELECT
      ps."skillLevel"::text AS "skillLevel",
      ps.format::text AS format,
      COUNT(*) AS "sessionCount",
      AVG(COALESCE(ps."registered_count", 0)::numeric / NULLIF(ps."maxPlayers", 0) * 100) AS "avgOccupancy"
    FROM play_sessions ps
    WHERE ps."clubId" = $1::uuid
      AND ps.date >= NOW() - INTERVAL '30 days'
      AND ps.date <= NOW()
      AND ps.status::text != 'CANCELLED'
    GROUP BY ps."skillLevel"::text, ps.format::text
    HAVING COUNT(*) >= 3
    ORDER BY "avgOccupancy" ASC
  `, clubId)

  if (!rows || rows.length < 2) return null

  const empty = rows.filter((r: any) => Number(r.avgOccupancy) < 30)
  const full = rows.filter((r: any) => Number(r.avgOccupancy) > 75)

  if (empty.length === 0 || full.length === 0) return null

  const emptyLabel = `${empty[0].skillLevel} ${empty[0].format}`
  const fullLabel = `${full[0].skillLevel} ${full[0].format}`

  return {
    id: insightId('format_mismatch'),
    type: 'schedule',
    priority: 'medium',
    title: `Format imbalance: ${emptyLabel} underbooked`,
    description: `${emptyLabel} sessions average ${Math.round(Number(empty[0].avgOccupancy))}% occupancy while ${fullLabel} runs at ${Math.round(Number(full[0].avgOccupancy))}%. Consider converting some ${emptyLabel} slots to ${fullLabel}.`,
    action: `Rebalance schedule: convert low-demand ${emptyLabel} sessions to high-demand ${fullLabel}`,
    actionLink: '/sessions',
    metrics: {
      lowOccupancyPct: Math.round(Number(empty[0].avgOccupancy)),
      highOccupancyPct: Math.round(Number(full[0].avgOccupancy)),
      lowDemandSessions: Number(empty[0].sessionCount),
      highDemandSessions: Number(full[0].sessionCount),
    },
  }
}

// ── 7. Day-of-Week Gap ──
async function dayOfWeekGap(prisma: any, clubId: string): Promise<Insight | null> {
  const rows: any[] = await prisma.$queryRawUnsafe(`
    SELECT
      TO_CHAR(ps.date, 'Day') AS "dayName",
      EXTRACT(DOW FROM ps.date) AS "dayNum",
      COUNT(*) AS "sessionCount",
      SUM(COALESCE(ps."registered_count", 0)) AS "totalBooked",
      SUM(ps."maxPlayers") AS "totalCapacity",
      ROUND(SUM(COALESCE(ps."registered_count", 0))::numeric / NULLIF(SUM(ps."maxPlayers"), 0) * 100, 1) AS "occupancyPct"
    FROM play_sessions ps
    WHERE ps."clubId" = $1::uuid
      AND ps.date >= NOW() - INTERVAL '30 days'
      AND ps.date <= NOW()
      AND ps.status::text != 'CANCELLED'
    GROUP BY TO_CHAR(ps.date, 'Day'), EXTRACT(DOW FROM ps.date)
    HAVING SUM(ps."maxPlayers") > 0
    ORDER BY "occupancyPct" ASC
  `, clubId)

  if (!rows || rows.length < 2) return null

  const quietest = rows[0] as any
  const busiest = rows[rows.length - 1] as any
  const gap = Number(busiest.occupancyPct) - Number(quietest.occupancyPct)

  if (gap < 20) return null

  return {
    id: insightId('dow_gap'),
    type: 'schedule',
    priority: gap > 40 ? 'high' : 'medium',
    title: `${quietest.dayName.trim()} is ${Math.round(gap)}pp behind ${busiest.dayName.trim()}`,
    description: `${quietest.dayName.trim()} averages ${Number(quietest.occupancyPct)}% occupancy vs ${Number(busiest.occupancyPct)}% on ${busiest.dayName.trim()}. A promotion or social event on ${quietest.dayName.trim()} could balance the week.`,
    action: `Run a promotion or add social events on ${quietest.dayName.trim()} to boost attendance`,
    actionLink: '/sessions',
    metrics: {
      quietestDayOccupancy: Number(quietest.occupancyPct),
      busiestDayOccupancy: Number(busiest.occupancyPct),
      gapPercentagePoints: Math.round(gap),
    },
  }
}

// ── 8. New Member Onboarding ──
async function newMemberOnboarding(prisma: any, clubId: string): Promise<Insight | null> {
  const rows: any[] = await prisma.$queryRawUnsafe(`
    WITH new_members AS (
      SELECT
        de.source_id AS "userId",
        (de.metadata->>'firstMembershipStartDate')::date AS "joinDate"
      FROM document_embeddings de
      WHERE de.club_id = $1::uuid
        AND de.content_type = 'member'
        AND de.source_table = 'csv_import'
        AND de.metadata->>'membershipStatus' = 'Currently Active'
        AND de.metadata->>'firstMembershipStartDate' IS NOT NULL
        AND (de.metadata->>'firstMembershipStartDate')::date >= NOW() - INTERVAL '90 days'
    ),
    booking_counts AS (
      SELECT
        b."userId",
        COUNT(*) AS "bookingCount"
      FROM play_session_bookings b
      JOIN play_sessions ps ON ps.id = b."sessionId"
      WHERE ps."clubId" = $1::uuid
        AND b.status::text = 'CONFIRMED'
      GROUP BY b."userId"
    )
    SELECT
      nm."userId",
      nm."joinDate",
      COALESCE(bc."bookingCount", 0) AS "bookingCount"
    FROM new_members nm
    LEFT JOIN booking_counts bc ON bc."userId" = nm."userId"
    WHERE COALESCE(bc."bookingCount", 0) <= 2
  `, clubId)

  if (!rows || rows.length === 0) return null

  const neverPlayed = rows.filter((r: any) => Number(r.bookingCount) === 0).length

  return {
    id: insightId('new_member_onboarding'),
    type: 'member_retention',
    priority: rows.length >= 5 ? 'high' : 'medium',
    title: `${rows.length} new member${rows.length > 1 ? 's' : ''} need onboarding follow-up`,
    description: `${rows.length} members joined in the last 30 days but played only 0-2 times. ${neverPlayed > 0 ? `${neverPlayed} haven't played at all.` : 'They need encouragement to build the habit.'} Early engagement is critical for retention.`,
    action: 'Send a welcome sequence with session recommendations to new members',
    actionLink: '/members?view=reactivation',
    metrics: {
      newMembersNeedingFollowup: rows.length,
      neverPlayed,
    },
  }
}

// ── 9. Skill Progression ──
async function skillProgression(prisma: any, clubId: string): Promise<Insight | null> {
  const rows: any[] = await prisma.$queryRawUnsafe(`
    WITH member_levels AS (
      SELECT
        b."userId",
        ps."skillLevel"::text AS "skillLevel",
        ps.date,
        ROW_NUMBER() OVER (PARTITION BY b."userId" ORDER BY ps.date ASC) AS rn_first,
        ROW_NUMBER() OVER (PARTITION BY b."userId" ORDER BY ps.date DESC) AS rn_last
      FROM play_session_bookings b
      JOIN play_sessions ps ON ps.id = b."sessionId"
      WHERE ps."clubId" = $1::uuid
        AND b.status::text = 'CONFIRMED'
        AND ps."skillLevel"::text IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED')
    ),
    first_level AS (
      SELECT "userId", "skillLevel" AS "firstLevel" FROM member_levels WHERE rn_first = 1
    ),
    last_level AS (
      SELECT "userId", "skillLevel" AS "lastLevel" FROM member_levels WHERE rn_last = 1
    )
    SELECT
      fl."userId",
      fl."firstLevel",
      ll."lastLevel"
    FROM first_level fl
    JOIN last_level ll ON ll."userId" = fl."userId"
    WHERE fl."firstLevel" = 'BEGINNER' AND ll."lastLevel" IN ('INTERMEDIATE', 'ADVANCED')
  `, clubId)

  if (!rows || rows.length === 0) return null

  const toAdvanced = rows.filter((r: any) => r.lastLevel === 'ADVANCED').length

  return {
    id: insightId('skill_progression'),
    type: 'growth',
    priority: 'low',
    title: `${rows.length} member${rows.length > 1 ? 's' : ''} leveled up from Beginner`,
    description: `${rows.length} members started at Beginner and now play at ${toAdvanced > 0 ? 'Intermediate/Advanced' : 'Intermediate'} level. Recognizing their progress builds loyalty and encourages others.`,
    action: 'Send congratulations and offer advanced programming to progressed members',
    actionLink: '/members'
,
    metrics: {
      progressedMembers: rows.length,
      reachedAdvanced: toAdvanced,
    },
  }
}

// ── 10. Empty Evening Slots ──
async function emptyEveningSlots(prisma: any, clubId: string): Promise<Insight | null> {
  const rows: any[] = await prisma.$queryRawUnsafe(`
    SELECT
      COUNT(*) AS "totalEvening",
      AVG(COALESCE(ps."registered_count", 0)::numeric / NULLIF(ps."maxPlayers", 0) * 100) AS "avgOccupancy",
      SUM(ps."maxPlayers" - COALESCE(ps."registered_count", 0)) AS "emptySlots"
    FROM play_sessions ps
    WHERE ps."clubId" = $1::uuid
      AND ps.date >= NOW() - INTERVAL '30 days'
      AND ps.date <= NOW()
      AND EXTRACT(HOUR FROM ps.date) >= 19
      AND ps.status::text != 'CANCELLED'
  `, clubId)

  if (!rows || rows.length === 0) return null

  const r = rows[0] as any
  const totalEvening = Number(r.totalEvening)
  const avgOcc = Number(r.avgOccupancy)
  const emptySlots = Number(r.emptySlots)

  if (totalEvening < 3 || avgOcc > 50) return null

  return {
    id: insightId('empty_evenings'),
    type: 'schedule',
    priority: emptySlots > 50 ? 'medium' : 'low',
    title: `Evening sessions averaging ${Math.round(avgOcc)}% occupancy`,
    description: `${totalEvening} evening sessions (after 7 PM) in the last 30 days averaged only ${Math.round(avgOcc)}% occupancy with ${emptySlots} empty player slots. Social events or league nights could fill these.`,
    action: 'Launch social events or league nights for evening time slots',
    actionLink: '/sessions',
    metrics: {
      eveningSessions: totalEvening,
      avgEveningOccupancy: Math.round(avgOcc),
      emptyPlayerSlots: emptySlots,
    },
  }
}

// ── Main Entry Point ──

export async function generateClubInsights(
  prisma: any,
  clubId: string
): Promise<Insight[]> {
  // Run all insight generators in parallel
  const results = await Promise.allSettled([
    underutilizedCourts(prisma, clubId),
    peakHourOverflow(prisma, clubId),
    vipMembersAtRisk(prisma, clubId),
    guestPassUpsell(prisma, clubId),
    suspendedWinback(prisma, clubId),
    formatMismatch(prisma, clubId),
    dayOfWeekGap(prisma, clubId),
    newMemberOnboarding(prisma, clubId),
    skillProgression(prisma, clubId),
    emptyEveningSlots(prisma, clubId),
  ])

  const insights: Insight[] = []

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value !== null) {
      insights.push(result.value)
    } else if (result.status === 'rejected') {
      console.error('[InsightsEngine] Insight generator failed:', result.reason)
    }
  }

  // Sort by priority (high first), then take max 10
  insights.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])

  return insights.slice(0, 10)
}
