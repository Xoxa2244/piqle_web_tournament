/**
 * Frequent partners helper — shared between PlayerProfile, RAG indexer, and slot filler automation.
 * Finds users who frequently share sessions (co-bookings).
 */

import type { PrismaClient } from '@prisma/client'

interface FrequentPartner {
  id: string
  name: string | null
  sharedSessions: number
  favoriteFormat: string | null
  lastPlayedTogether: string | null
}

/**
 * Get IDs of frequent partners for a user at a club.
 * Used for social proof in slot filler invites.
 */
export async function getFrequentPartnerIds(
  prisma: PrismaClient,
  userId: string,
  clubId: string,
  minSessions = 3,
): Promise<string[]> {
  const partners = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT b2."userId" as id
    FROM play_session_bookings b1
    JOIN play_session_bookings b2 ON b1."sessionId" = b2."sessionId" AND b1."userId" != b2."userId"
    JOIN play_sessions ps ON ps.id = b1."sessionId"
    WHERE b1."userId" = ${userId}
      AND ps."clubId" = ${clubId}
      AND b1.status = 'CONFIRMED'
      AND b2.status = 'CONFIRMED'
    GROUP BY b2."userId"
    HAVING COUNT(DISTINCT b1."sessionId") >= ${minSessions}
    ORDER BY COUNT(DISTINCT b1."sessionId") DESC
    LIMIT 20
  `
  return partners.map(p => p.id)
}

/**
 * Get detailed frequent partners for a user (for profile display).
 */
export async function getFrequentPartners(
  prisma: PrismaClient,
  userId: string,
  clubId: string,
  minSessions = 2,
  limit = 10,
): Promise<FrequentPartner[]> {
  const partners = await prisma.$queryRaw<Array<{
    id: string; name: string | null; shared_sessions: bigint;
    favorite_format: string | null; last_played_together: Date | null;
  }>>`
    SELECT
      u.id, u.name,
      COUNT(DISTINCT b2."sessionId")::bigint as shared_sessions,
      MODE() WITHIN GROUP (ORDER BY ps.format) as favorite_format,
      MAX(ps.date) as last_played_together
    FROM play_session_bookings b1
    JOIN play_session_bookings b2 ON b1."sessionId" = b2."sessionId" AND b1."userId" != b2."userId"
    JOIN play_sessions ps ON ps.id = b1."sessionId"
    JOIN users u ON u.id = b2."userId"
    WHERE b1."userId" = ${userId}
      AND ps."clubId" = ${clubId}
      AND b1.status = 'CONFIRMED'
      AND b2.status = 'CONFIRMED'
    GROUP BY u.id, u.name
    HAVING COUNT(DISTINCT b2."sessionId") >= ${minSessions}
    ORDER BY shared_sessions DESC
    LIMIT ${limit}
  `
  return partners.map(p => ({
    id: p.id,
    name: p.name,
    sharedSessions: Number(p.shared_sessions),
    favoriteFormat: p.favorite_format,
    lastPlayedTogether: p.last_played_together?.toISOString().split('T')[0] || null,
  }))
}
