/**
 * Morning Digest — AI Agent Daily Report
 *
 * Generates a summary of agent actions and pending decisions for club managers.
 * Two modes:
 * - API clubs (CourtReserve): daily automatic digest at 8 AM
 * - CSV clubs: triggered after data import
 */

import { cronLogger as log } from '@/lib/logger'

// ── Types ──

export interface DigestAction {
  type: 'check_in' | 'win_back' | 'slot_fill' | 'review_request' | 'welcome'
  memberNames: string[]
  count: number
  detail?: string
}

export interface PendingAction {
  id: string // AIRecommendationLog ID or synthetic
  type: 'win_back' | 'slot_fill' | 'retention_boost'
  description: string
  memberCount: number
  approveToken?: string
  skipToken?: string
}

export interface HealthChange {
  improved: number
  declined: number
}

export interface DigestData {
  clubName: string
  clubId: string
  // Actions agent already took (auto-approved)
  actionsTaken: DigestAction[]
  totalActionsTaken: number
  // Actions needing approval
  pendingActions: PendingAction[]
  totalPending: number
  // Health overview
  healthy: number
  watch: number
  atRisk: number
  critical: number
  churned: number
  avgHealthScore: number
  healthChanges: HealthChange
  // Links
  dashboardUrl: string
}

// ── Generate Digest Data ──

export async function generateDigestData(
  prisma: any,
  clubId: string,
): Promise<DigestData | null> {
  // Load club
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { id: true, name: true },
  })
  if (!club) return null

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.iqsport.ai'
  const appUrl = baseUrl.startsWith('http') ? baseUrl.replace(/\/$/, '') : `https://${baseUrl}`

  const now = new Date()
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  // ── Actions taken in last 24h ──
  const recentLogs: any[] = await prisma.aIRecommendationLog.findMany({
    where: {
      clubId,
      createdAt: { gte: yesterday },
      status: { in: ['sent', 'delivered', 'opened', 'clicked', 'converted'] },
    },
    include: {
      user: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Group by type
  const actionsByType = new Map<string, DigestAction>()
  for (const log of recentLogs) {
    const type = mapLogType(log.type, log.variantId)
    if (!actionsByType.has(type)) {
      actionsByType.set(type, { type: type as any, memberNames: [], count: 0 })
    }
    const action = actionsByType.get(type)!
    action.count++
    const name = log.user?.name?.split(' ')[0] || log.user?.email?.split('@')[0] || 'Member'
    if (action.memberNames.length < 5) action.memberNames.push(name)
  }
  const actionsTaken = Array.from(actionsByType.values())

  // ── Health summary ──
  let healthSummary = { healthy: 0, watch: 0, atRisk: 0, critical: 0, churned: 0, avgHealthScore: 0 }
  let healthChanges: HealthChange = { improved: 0, declined: 0 }

  try {
    const { generateMemberHealth } = await import('@/lib/ai/member-health')
    // Quick health calculation — reuse getMemberHealth logic
    const followers = await prisma.clubFollower.findMany({
      where: { clubId },
      include: { user: { select: { id: true, email: true, name: true, image: true, gender: true, city: true, duprRatingDoubles: true, duprRatingSingles: true } } },
    })

    if (followers.length > 0) {
      // Use snapshot data if available (faster than recalculating)
      const snapshots: any[] = await prisma.$queryRawUnsafe(`
        SELECT
          COUNT(*) FILTER (WHERE health_score >= 60) as healthy,
          COUNT(*) FILTER (WHERE health_score >= 35 AND health_score < 60) as watch,
          COUNT(*) FILTER (WHERE health_score >= 15 AND health_score < 35) as at_risk,
          COUNT(*) FILTER (WHERE health_score < 15) as critical,
          ROUND(AVG(health_score), 0) as avg_score
        FROM member_health_snapshots
        WHERE club_id = $1::uuid
          AND date = (SELECT MAX(date) FROM member_health_snapshots WHERE club_id = $1::uuid)
      `, clubId)

      if (snapshots[0] && Number(snapshots[0].healthy) > 0) {
        healthSummary = {
          healthy: Number(snapshots[0].healthy),
          watch: Number(snapshots[0].watch),
          atRisk: Number(snapshots[0].at_risk),
          critical: Number(snapshots[0].critical),
          churned: 0, // Not tracked in snapshots yet
          avgHealthScore: Number(snapshots[0].avg_score || 0),
        }
      }

      // Health changes: compare today's snapshots vs yesterday's
      const changes: any[] = await prisma.$queryRawUnsafe(`
        WITH latest AS (
          SELECT user_id, health_score, date
          FROM member_health_snapshots
          WHERE club_id = $1::uuid AND date = (SELECT MAX(date) FROM member_health_snapshots WHERE club_id = $1::uuid)
        ),
        previous AS (
          SELECT user_id, health_score
          FROM member_health_snapshots
          WHERE club_id = $1::uuid AND date = (
            SELECT MAX(date) FROM member_health_snapshots
            WHERE club_id = $1::uuid AND date < (SELECT MAX(date) FROM member_health_snapshots WHERE club_id = $1::uuid)
          )
        )
        SELECT
          COUNT(*) FILTER (WHERE l.health_score > p.health_score) as improved,
          COUNT(*) FILTER (WHERE l.health_score < p.health_score) as declined
        FROM latest l
        JOIN previous p ON l.user_id = p.user_id
      `, clubId)

      if (changes[0]) {
        healthChanges = {
          improved: Number(changes[0].improved || 0),
          declined: Number(changes[0].declined || 0),
        }
      }
    }
  } catch (err) {
    log.warn('Morning digest health calculation failed:', (err as Error).message?.slice(0, 80))
  }

  // ── Pending actions (queued but not sent) ──
  const pendingLogs: any[] = await prisma.aIRecommendationLog.findMany({
    where: {
      clubId,
      status: 'pending',
      createdAt: { gte: yesterday },
    },
    select: { id: true, type: true, reasoning: true },
    take: 10,
  })

  const pendingActions: PendingAction[] = pendingLogs.map(p => ({
    id: p.id,
    type: mapLogType(p.type, null) as any,
    description: describeAction(p.type, p.reasoning),
    memberCount: 1,
  }))

  return {
    clubName: club.name,
    clubId,
    actionsTaken,
    totalActionsTaken: recentLogs.length,
    pendingActions,
    totalPending: pendingActions.length,
    ...healthSummary,
    healthChanges,
    dashboardUrl: `${appUrl}/clubs/${clubId}/intelligence`,
  }
}

// ── Render Digest Email HTML ──

export function renderDigestEmail(data: DigestData): { subject: string; html: string; text: string } {
  const subject = `${data.clubName} — Agent Report: ${data.totalActionsTaken} actions taken${data.totalPending > 0 ? `, ${data.totalPending} need approval` : ''}`

  const actionsList = data.actionsTaken.length > 0
    ? data.actionsTaken.map(a =>
        `<li style="margin-bottom:8px;">
          <strong>${actionLabel(a.type)}</strong> — ${a.count} member${a.count > 1 ? 's' : ''}
          <span style="color:#6b7280;"> (${a.memberNames.slice(0, 3).join(', ')}${a.count > 3 ? ` +${a.count - 3} more` : ''})</span>
        </li>`
      ).join('')
    : '<li style="color:#6b7280;">No automated actions in the last 24 hours</li>'

  const pendingList = data.pendingActions.length > 0
    ? data.pendingActions.map(p =>
        `<li style="margin-bottom:12px;">
          <strong>${p.description}</strong><br/>
          <a href="${data.dashboardUrl}/campaigns" style="color:#8B5CF6;text-decoration:none;font-weight:600;">View in Dashboard →</a>
        </li>`
      ).join('')
    : ''

  const healthBar = (label: string, count: number, color: string) =>
    `<span style="display:inline-block;padding:4px 12px;border-radius:8px;background:${color}15;color:${color};font-weight:600;font-size:13px;margin-right:8px;">${label}: ${count}</span>`

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f9fafb;color:#111827;">
  <table width="100%" cellspacing="0" cellpadding="0" style="background:#f9fafb;">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;">

        <!-- Header -->
        <tr><td style="padding:24px;background:#0B0D17;border-radius:16px 16px 0 0;">
          <h1 style="margin:0;color:white;font-size:20px;">🤖 AI Agent Report</h1>
          <p style="margin:4px 0 0;color:#94a3b8;font-size:14px;">${data.clubName} — ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </td></tr>

        <!-- Actions Taken -->
        <tr><td style="padding:20px 24px;background:white;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
          <h2 style="margin:0 0 12px;font-size:15px;color:#111827;">✅ Actions Taken (auto-approved)</h2>
          <ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.6;">${actionsList}</ul>
        </td></tr>

        ${data.pendingActions.length > 0 ? `
        <!-- Pending Actions -->
        <tr><td style="padding:20px 24px;background:#FFFBEB;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
          <h2 style="margin:0 0 12px;font-size:15px;color:#92400E;">⚠️ Needs Your Approval</h2>
          <ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.6;">${pendingList}</ul>
        </td></tr>
        ` : ''}

        <!-- Health Summary -->
        <tr><td style="padding:20px 24px;background:white;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
          <h2 style="margin:0 0 12px;font-size:15px;color:#111827;">📊 Member Health</h2>
          <div style="margin-bottom:8px;">
            ${healthBar('Healthy', data.healthy, '#10B981')}
            ${healthBar('Watch', data.watch, '#F59E0B')}
            ${healthBar('At-Risk', data.atRisk, '#EF4444')}
          </div>
          <p style="margin:8px 0 0;font-size:13px;color:#6b7280;">
            Avg score: ${data.avgHealthScore}/100
            ${data.healthChanges.improved > 0 ? ` · ↑ ${data.healthChanges.improved} improved` : ''}
            ${data.healthChanges.declined > 0 ? ` · ↓ ${data.healthChanges.declined} declined` : ''}
          </p>
        </td></tr>

        <!-- CTA -->
        <tr><td style="padding:20px 24px;background:white;border-radius:0 0 16px 16px;border:1px solid #e5e7eb;border-top:none;text-align:center;">
          <a href="${data.dashboardUrl}" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,#8B5CF6,#06B6D4);color:white;text-decoration:none;border-radius:12px;font-weight:600;font-size:14px;">View Dashboard</a>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px;text-align:center;">
          <p style="font-size:11px;color:#9ca3af;margin:0;">
            Sent by IQSport AI Agent · <a href="${data.dashboardUrl}/settings" style="color:#9ca3af;">Manage preferences</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

  const text = `${data.clubName} — AI Agent Report

Actions Taken: ${data.totalActionsTaken}
${data.actionsTaken.map(a => `- ${actionLabel(a.type)}: ${a.count} members`).join('\n')}

${data.pendingActions.length > 0 ? `Needs Approval: ${data.totalPending}\n${data.pendingActions.map(p => `- ${p.description}`).join('\n')}` : ''}

Health: ${data.healthy} healthy, ${data.watch} watch, ${data.atRisk} at-risk

Dashboard: ${data.dashboardUrl}`

  return { subject, html, text }
}

// ── Helpers ──

function mapLogType(type: string, variantId: string | null): string {
  if (variantId === 'review_request') return 'review_request'
  switch (type) {
    case 'CHECK_IN': return 'check_in'
    case 'RETENTION_BOOST': return 'win_back'
    case 'REACTIVATION': return 'win_back'
    case 'SLOT_FILLER': return 'slot_fill'
    case 'NEW_MEMBER_WELCOME': return 'welcome'
    default: return 'check_in'
  }
}

function actionLabel(type: string): string {
  switch (type) {
    case 'check_in': return 'Check-in emails'
    case 'win_back': return 'Win-back outreach'
    case 'slot_fill': return 'Slot fill invites'
    case 'review_request': return 'Google Review requests'
    case 'welcome': return 'Welcome messages'
    default: return 'Outreach'
  }
}

function describeAction(type: string, reasoning: any): string {
  const r = typeof reasoning === 'object' ? reasoning : {}
  switch (type) {
    case 'RETENTION_BOOST': return `Win-back campaign for at-risk members`
    case 'SLOT_FILLER': return `Slot fill invites for underfilled session${r.sessionTitle ? ` (${r.sessionTitle})` : ''}`
    case 'REACTIVATION': return `Reactivation outreach for inactive members`
    default: return `${type} action pending`
  }
}
