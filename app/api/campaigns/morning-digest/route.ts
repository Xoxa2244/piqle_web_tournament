/**
 * Morning Digest Cron — AI Agent Daily Report
 *
 * Sends a summary email to club admins:
 * - What the agent did (auto-approved actions)
 * - What needs approval
 * - Health overview
 *
 * Only for API-connected clubs (CourtReserve sync).
 * CSV-only clubs get digest after import instead.
 *
 * Schedule: daily at 2 PM UTC (8-10 AM US timezones)
 */

import { NextResponse } from 'next/server'
import { cronLogger as log } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { evaluateAgentControlPlaneAction } from '@/lib/ai/agent-control-plane'
import { persistAgentDecisionRecord } from '@/lib/ai/agent-decision-records'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

function getAuthorized(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return { ok: false as const, status: 500, error: 'CRON_SECRET is not set' }
  const authHeader = request.headers.get('authorization')
  if (authHeader === `Bearer ${cronSecret}`) return { ok: true as const }
  return { ok: false as const, status: 401, error: 'Unauthorized' }
}

async function sendDigests(dryRun: boolean) {
  // Find clubs with active API connector (not CSV-only)
  const connectedClubs: any[] = await prisma.$queryRawUnsafe(`
    SELECT DISTINCT cc.club_id as "clubId", c.name as "clubName", c.automation_settings as "automationSettings"
    FROM club_connectors cc
    JOIN clubs c ON c.id = cc.club_id
    WHERE cc.provider = 'courtreserve'
      AND cc.auto_sync = true
      AND cc.status IN ('connected', 'error')
  `)

  if (connectedClubs.length === 0) {
    log.info('No API-connected clubs found for morning digest')
    return { sent: 0, skipped: 0, clubs: [] }
  }

  const { generateDigestData, renderDigestEmail } = await import('@/lib/ai/morning-digest')

  let sent = 0
  let skipped = 0
  const results: { clubId: string; clubName: string; status: string }[] = []

  for (const club of connectedClubs) {
    try {
      const controlPlane = evaluateAgentControlPlaneAction({
        automationSettings: club.automationSettings,
        action: 'adminReminderExternal',
      })

      if (!controlPlane.allowed || controlPlane.shadow) {
        skipped++
        results.push({
          clubId: club.clubId,
          clubName: club.clubName,
          status: controlPlane.shadow ? 'shadowed' : 'blocked',
        })
        await persistAgentDecisionRecord(prisma, {
          clubId: club.clubId,
          actorType: 'system',
          action: 'adminReminderExternal',
          targetType: 'morning_digest',
          mode: controlPlane.mode,
          result: controlPlane.shadow ? 'shadowed' : 'blocked',
          summary: controlPlane.shadow
            ? `${controlPlane.reason} Morning digest stayed in shadow mode.`
            : controlPlane.reason,
          metadata: {
            source: 'morning_digest_cron',
            reason: controlPlane.shadow ? 'control_plane_shadow' : 'control_plane_disabled',
          },
        })
        continue
      }

      // Get club admin emails
      const admins = await prisma.clubAdmin.findMany({
        where: { clubId: club.clubId },
        include: { user: { select: { email: true, name: true } } },
      })

      if (admins.length === 0) {
        skipped++
        results.push({ clubId: club.clubId, clubName: club.clubName, status: 'skipped_no_admins' })
        continue
      }

      // Generate digest data
      const digestData = await generateDigestData(prisma, club.clubId)
      if (!digestData) {
        skipped++
        results.push({ clubId: club.clubId, clubName: club.clubName, status: 'skipped_no_data' })
        continue
      }

      // Skip if no actions and no pending
      if (digestData.totalActionsTaken === 0 && digestData.totalPending === 0 && digestData.healthy === 0) {
        skipped++
        results.push({ clubId: club.clubId, clubName: club.clubName, status: 'skipped_empty' })
        continue
      }

      const { subject, html, text } = renderDigestEmail(digestData)

      if (dryRun) {
        log.info(`[DRY RUN] Would send digest to ${admins.length} admin(s) for ${club.clubName}: ${subject}`)
        results.push({ clubId: club.clubId, clubName: club.clubName, status: 'dry_run' })
        continue
      }

      // Send to all admins
      const { sendOutreachEmail } = await import('@/lib/email')
      for (const admin of admins) {
        if (!admin.user.email) continue
        try {
          await sendOutreachEmail({
            to: admin.user.email,
            subject,
            body: text,
            clubName: club.clubName,
            bookingUrl: digestData.dashboardUrl,
          })
        } catch (err) {
          log.error(`Digest email failed for ${admin.user.email}:`, (err as Error).message?.slice(0, 80))
        }
      }

      sent++
      results.push({ clubId: club.clubId, clubName: club.clubName, status: 'sent' })
    } catch (err) {
      log.error(`Digest failed for ${club.clubName}:`, (err as Error).message?.slice(0, 100))
      skipped++
      results.push({ clubId: club.clubId, clubName: club.clubName, status: 'error' })
    }
  }

  return { sent, skipped, clubs: results }
}

async function run(request: Request) {
  const auth = getAuthorized(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const url = new URL(request.url)
  const dryRun = url.searchParams.get('dryRun') === 'true'

  const startedAt = new Date()
  try {
    const result = await sendDigests(dryRun)
    log.info(`Morning digest: ${result.sent} sent, ${result.skipped} skipped`)
    return NextResponse.json({
      ok: true,
      dryRun,
      startedAt: startedAt.toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      ...result,
    })
  } catch (err) {
    log.error('Morning digest cron failed:', (err as Error).message)
    return NextResponse.json({ ok: false, error: (err as Error).message?.slice(0, 200) }, { status: 500 })
  }
}

export async function POST(request: Request) { return run(request) }
export async function GET(request: Request) { return run(request) }
