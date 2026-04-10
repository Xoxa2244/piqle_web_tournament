/**
 * Agent Utilities — shared helpers for agent crons and actions
 */

import { cronLogger as log } from '@/lib/logger'

/**
 * Get notification emails for a club.
 * Priority: automationSettings.intelligence.notificationEmail → ClubAdmin → User emails
 */
export async function getClubNotificationEmails(prisma: any, clubId: string): Promise<string[]> {
  // 1. Check settings override
  try {
    const club = await prisma.club.findUnique({
      where: { id: clubId },
      select: { automationSettings: true },
    })
    const settings = club?.automationSettings as any
    const overrideEmail = settings?.intelligence?.notificationEmail
    if (overrideEmail && typeof overrideEmail === 'string') {
      return [overrideEmail]
    }
  } catch { /* continue to fallback */ }

  // 2. Get ClubAdmin emails
  const admins = await prisma.clubAdmin.findMany({
    where: { clubId },
    include: { user: { select: { email: true } } },
  })

  return admins
    .map((a: any) => a.user?.email)
    .filter((e: string | null): e is string => !!e && !e.includes('placeholder'))
}

/**
 * Check if agent is live for this club (not in dryRun mode).
 * Default: false (dryRun). Club admin enables via Settings toggle.
 */
export async function isAgentLive(prisma: any, clubId: string): Promise<boolean> {
  try {
    const club = await prisma.club.findUnique({
      where: { id: clubId },
      select: { automationSettings: true },
    })
    const settings = club?.automationSettings as any
    return settings?.intelligence?.agentLive === true
  } catch {
    return false
  }
}

/**
 * Check if club has API connector (CourtReserve) — determines daily vs weekly agent mode.
 */
export async function hasApiConnector(prisma: any, clubId: string): Promise<boolean> {
  const count = await prisma.clubConnector.count({
    where: {
      clubId,
      provider: 'courtreserve',
      autoSync: true,
      status: { in: ['connected', 'error'] },
    },
  }).catch(() => 0)
  return count > 0
}
