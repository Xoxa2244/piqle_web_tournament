import type { CsvSessionMeta as BaseCsvSessionMeta } from './event-recommendations'
import type { SessionCalendarItem, SessionCalendarData, SessionRecommendation } from '@/types/intelligence'

// Extend with revenue fields that exist in CSV import data
interface CsvSessionMeta extends BaseCsvSessionMeta {
  revenue?: number | null
  lostRevenue?: number | null
}

// ── Helpers ──

interface PeerAvg {
  avgOccupancy: number
  avgRevenue: number
  count: number
}

function getTimeSlot(time: string): 'morning' | 'afternoon' | 'evening' {
  const hour = parseInt(time.split(':')[0], 10)
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}

function getDayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()]
}

function peerKey(format: string, day: string, slot: string): string {
  return `${format}|${day}|${slot}`
}

function getSessionStatus(dateStr: string): 'past' | 'today' | 'upcoming' {
  const today = new Date().toISOString().slice(0, 10)
  if (dateStr < today) return 'past'
  if (dateStr === today) return 'today'
  return 'upcoming'
}

// ── Peer Averages ──

export function computePeerAverages(sessions: CsvSessionMeta[]): Record<string, PeerAvg> {
  const groups: Record<string, { occupancies: number[]; revenues: number[] }> = {}

  for (const s of sessions) {
    const day = getDayOfWeek(s.date)
    const slot = getTimeSlot(s.startTime)
    const key = peerKey(s.format, day, slot)
    if (!groups[key]) groups[key] = { occupancies: [], revenues: [] }
    groups[key].occupancies.push(s.occupancy)
    groups[key].revenues.push(s.revenue ?? (s.pricePerPlayer ?? 0) * s.registered)
  }

  const result: Record<string, PeerAvg> = {}
  for (const [key, g] of Object.entries(groups)) {
    const avgOcc = g.occupancies.reduce((a, b) => a + b, 0) / g.occupancies.length
    const avgRev = g.revenues.reduce((a, b) => a + b, 0) / g.revenues.length
    result[key] = { avgOccupancy: Math.round(avgOcc), avgRevenue: Math.round(avgRev), count: g.occupancies.length }
  }
  return result
}

// ── Recommendations ──

export function generateSessionRecommendations(
  session: CsvSessionMeta,
  peerAverages: Record<string, PeerAvg>,
  allSessions: CsvSessionMeta[],
  clubId: string,
  status: 'past' | 'today' | 'upcoming',
): SessionRecommendation[] {
  const recs: SessionRecommendation[] = []
  const day = getDayOfWeek(session.date)
  const slot = getTimeSlot(session.startTime)
  const key = peerKey(session.format, day, slot)
  const peer = peerAverages[key]

  // Only recommend actions for upcoming/today sessions (except analytics recs for past)
  const isActionable = status !== 'past'

  // 1. Send invites for underfilled upcoming sessions
  if (isActionable && session.occupancy < 50) {
    recs.push({
      type: 'send_invites',
      label: 'Send targeted invites',
      reason: `Only ${session.registered}/${session.capacity} spots filled (${session.occupancy}%). Use Slot Filler to invite matching players.`,
      priority: session.occupancy < 30 ? 'high' : 'medium',
      actionLink: `/clubs/${clubId}/intelligence/slot-filler`,
    })
  }

  // 2. Swap format if another format performs much better on same day+slot
  if (session.occupancy < 40) {
    const sameDaySlotKeys = Object.entries(peerAverages)
      .filter(([k]) => {
        const [, d, s] = k.split('|')
        return d === day && s === slot && k !== key
      })
      .sort((a, b) => b[1].avgOccupancy - a[1].avgOccupancy)

    if (sameDaySlotKeys.length > 0) {
      const [bestKey, bestPeer] = sameDaySlotKeys[0]
      const bestFormat = bestKey.split('|')[0]
      if (bestPeer.avgOccupancy > session.occupancy + 20) {
        recs.push({
          type: 'swap_format',
          label: `Try ${formatLabel(bestFormat)}`,
          reason: `${formatLabel(session.format)} averages ${peer?.avgOccupancy ?? session.occupancy}% here, while ${formatLabel(bestFormat)} averages ${bestPeer.avgOccupancy}%.`,
          priority: 'medium',
        })
      }
    }
  }

  // 3. Price adjustments
  if (peer && session.pricePerPlayer && peer.count >= 3) {
    const avgPrice = peer.avgRevenue / (peer.avgOccupancy / 100 * session.capacity || 1)
    if (session.occupancy < peer.avgOccupancy - 15 && session.pricePerPlayer > avgPrice * 1.2) {
      recs.push({
        type: 'lower_price',
        label: 'Consider lower price',
        reason: `$${session.pricePerPlayer} may be high for this slot. Similar sessions average ${peer.avgOccupancy}% fill at lower prices.`,
        priority: 'low',
      })
    }
  }

  // 4. Raise price or add session if consistently full
  if (peer && peer.avgOccupancy > 90 && peer.count >= 3 && session.occupancy > 85) {
    recs.push({
      type: 'raise_price',
      label: 'High demand — raise price?',
      reason: `This slot averages ${peer.avgOccupancy}% fill across ${peer.count} sessions. Consider raising the price or adding a parallel session.`,
      priority: 'low',
    })
  }

  // 5. Cancel consideration for very low fill
  if (session.occupancy < 25 && peer && peer.avgOccupancy < 30 && peer.count >= 3) {
    recs.push({
      type: 'cancel_consider',
      label: 'Consistently low — reconsider?',
      reason: `This format+time averages only ${peer.avgOccupancy}% fill over ${peer.count} sessions. Consider removing or replacing it.`,
      priority: 'high',
    })
  }

  // 6. Time adjustment
  if (session.occupancy < 50) {
    const sameFmtKeys = Object.entries(peerAverages)
      .filter(([k]) => {
        const [f, , s] = k.split('|')
        return f === session.format && s !== slot
      })
      .sort((a, b) => b[1].avgOccupancy - a[1].avgOccupancy)

    if (sameFmtKeys.length > 0) {
      const [bestKey, bestPeer] = sameFmtKeys[0]
      const bestSlot = bestKey.split('|')[2]
      if (bestPeer.avgOccupancy > session.occupancy + 25) {
        recs.push({
          type: 'adjust_time',
          label: `Move to ${bestSlot}?`,
          reason: `${formatLabel(session.format)} averages ${bestPeer.avgOccupancy}% in the ${bestSlot} vs ${session.occupancy}% now.`,
          priority: 'low',
        })
      }
    }
  }

  return recs
}

function formatLabel(format: string): string {
  return format
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

// ── Build Calendar Data ──

export function buildSessionCalendarData(
  csvSessions: CsvSessionMeta[],
  clubId: string,
): SessionCalendarData {
  const peerAverages = computePeerAverages(csvSessions)

  const sessions: SessionCalendarItem[] = csvSessions.map((s, i) => {
    const day = getDayOfWeek(s.date)
    const slot = getTimeSlot(s.startTime)
    const key = peerKey(s.format, day, slot)
    const peer = peerAverages[key]
    const status = getSessionStatus(s.date)

    const revenue = s.revenue ?? (s.pricePerPlayer ?? 0) * s.registered
    const lostRevenue = s.lostRevenue ?? (s.pricePerPlayer ?? 0) * (s.capacity - s.registered)

    return {
      id: (s as any).id || `csv-${i}`,
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      court: s.court,
      courtId: (s as any).courtId || null,
      title: (s as any).title || null,
      format: s.format,
      skillLevel: s.skillLevel,
      registered: s.registered,
      capacity: s.capacity,
      occupancy: s.occupancy,
      playerNames: s.playerNames,
      pricePerPlayer: s.pricePerPlayer ?? null,
      revenue: revenue || null,
      lostRevenue: lostRevenue > 0 ? lostRevenue : null,
      status,
      peerAvgOccupancy: peer?.avgOccupancy ?? null,
      deviationFromPeer: peer ? Math.round(s.occupancy - peer.avgOccupancy) : null,
      recommendations: generateSessionRecommendations(s, peerAverages, csvSessions, clubId, status),
    }
  })

  // Sort by date, then startTime
  sessions.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))

  const totalRevenue = sessions.reduce((sum, s) => sum + (s.revenue ?? 0), 0)
  const totalLostRevenue = sessions.reduce((sum, s) => sum + (s.lostRevenue ?? 0), 0)
  const avgOccupancy = sessions.length > 0
    ? Math.round(sessions.reduce((sum, s) => sum + s.occupancy, 0) / sessions.length)
    : 0

  return {
    sessions,
    summary: {
      totalSessions: sessions.length,
      avgOccupancy,
      totalRevenue: Math.round(totalRevenue),
      totalLostRevenue: Math.round(totalLostRevenue),
      upcomingCount: sessions.filter(s => s.status === 'upcoming').length,
      pastCount: sessions.filter(s => s.status === 'past').length,
    },
    peerAverages,
  }
}
