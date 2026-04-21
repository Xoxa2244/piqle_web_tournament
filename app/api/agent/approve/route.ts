/**
 * Agent Action Approve — executes a queued pending action
 *
 * Called via link in morning digest email:
 *   GET /api/agent/approve?id=xxx&token=yyy
 *
 * Token is HMAC-SHA256(actionId + clubId, CRON_SECRET) — simple, no JWT needed.
 * Expires: actions older than 48h are rejected.
 */

import { NextResponse } from 'next/server'
import { cronLogger as log } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { createHmac } from 'crypto'
import { evaluateAgentControlPlaneAction } from '@/lib/ai/agent-control-plane'
import { evaluateAgentOutreachRollout } from '@/lib/ai/agent-outreach-rollout'
import { persistAgentDecisionRecord } from '@/lib/ai/agent-decision-records'
import { checkRateLimit, getIpFromRequest, buildRateLimitHeaders } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_AGE_MS = 48 * 60 * 60 * 1000 // 48 hours

function generateToken(actionId: string, clubId: string): string {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    throw new Error('CRON_SECRET environment variable is required')
  }
  // Use full SHA256 hash (64 hex chars) for maximum entropy
  return createHmac('sha256', secret).update(`${actionId}:${clubId}`).digest('hex')
}

export async function GET(request: Request) {
  // Rate limit per IP — blocks brute-forcing HMAC tokens
  const ip = getIpFromRequest(request)
  const rateLimit = await checkRateLimit('agentAction', ip)
  if (!rateLimit.success) {
    return new NextResponse('Too many requests — slow down', {
      status: 429,
      headers: buildRateLimitHeaders(rateLimit),
    })
  }

  const url = new URL(request.url)
  const actionId = url.searchParams.get('id')
  const token = url.searchParams.get('token')

  if (!actionId || !token) {
    return NextResponse.json({ error: 'Missing id or token' }, { status: 400 })
  }

  // Find the pending action
  const action = await prisma.aIRecommendationLog.findUnique({
    where: { id: actionId },
    include: {
      user: { select: { id: true, email: true, name: true } },
      club: { select: { id: true, name: true, automationSettings: true } },
    },
  })

  if (!action) {
    return redirectWithMessage('Action not found', 'error')
  }

  // Verify token
  const expectedToken = generateToken(actionId, action.clubId)
  if (token !== expectedToken) {
    return redirectWithMessage('Invalid token', 'error')
  }

  // Check age
  if (Date.now() - action.createdAt.getTime() > MAX_AGE_MS) {
    return redirectWithMessage('Action expired (>48h)', 'expired')
  }

  // Check status — must be pending
  if (action.status !== 'pending') {
    return redirectWithMessage(`Action already ${action.status}`, 'info')
  }

  // ATOMIC STATUS TRANSITION: prevent double-processing on simultaneous clicks.
  // updateMany with WHERE status='pending' either updates 1 row (we won the race)
  // or 0 rows (someone else got there first). This is safer than the previous
  // read-then-write pattern which allowed two requests to both pass the check.
  const claimed = await prisma.aIRecommendationLog.updateMany({
    where: { id: actionId, status: 'pending' },
    data: { status: 'approving' },
  })
  if (claimed.count === 0) {
    return redirectWithMessage('Action already being processed', 'info')
  }

  // Execute the action
  try {
    const controlPlane = evaluateAgentControlPlaneAction({
      automationSettings: action.club.automationSettings,
      action: 'outreachSend',
      clubName: action.club.name,
    })
    const rollout = evaluateAgentOutreachRollout({
      clubId: action.clubId,
      automationSettings: action.club.automationSettings,
      actionKind: action.type === 'SLOT_FILLER' ? 'fill_session' : 'create_campaign',
      clubName: action.club.name,
    })

    if (!controlPlane.allowed || controlPlane.shadow || !rollout.allowed) {
      const summary = controlPlane.allowed
        ? controlPlane.shadow
          ? `${controlPlane.reason} This email approval stayed in shadow mode.`
          : rollout.reason
        : controlPlane.reason

      await persistAgentDecisionRecord(prisma, {
        clubId: action.clubId,
        action: 'outreachSend',
        targetType: 'email_approval_link',
        targetId: actionId,
        mode: controlPlane.mode,
        result: controlPlane.shadow ? 'shadowed' : 'blocked',
        summary,
        metadata: {
          source: 'agent_approve_link',
          reason: controlPlane.allowed
            ? (controlPlane.shadow ? 'control_plane_shadow' : 'outreach_rollout_blocked')
            : 'control_plane_disabled',
          actionKind: action.type === 'SLOT_FILLER' ? 'fill_session' : 'create_campaign',
          rolloutClubAllowlisted: rollout.clubAllowlisted,
          rolloutActionEnabled: rollout.actionEnabled,
        },
      })

      // Revert 'approving' → 'pending' so the user can retry once the gate is opened
      await prisma.aIRecommendationLog.update({
        where: { id: actionId },
        data: { status: 'pending' },
      }).catch(() => {})

      return redirectWithMessage(summary, controlPlane.shadow ? 'info' : 'error')
    }

    const { sendOutreachEmail } = await import('@/lib/email')
    const reasoning = action.reasoning as any
    const firstName = action.user?.name?.split(' ')[0] || 'there'
    let sentMessageId: string | undefined

    // Send the outreach email
    if (action.user?.email) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.iqsport.ai'
      const bookingUrl = `${baseUrl}/clubs/${action.clubId}/play`

      const sendResult = await sendOutreachEmail({
        to: action.user.email,
        subject: `${action.club.name} — We'd love to see you back!`,
        body: `Hey ${firstName}!\n\nWe noticed it's been a while since your last session at ${action.club.name}. We'd love to have you back — there are some great sessions coming up that match your level.\n\nBook now and reconnect with the community!`,
        clubName: action.club.name,
        bookingUrl,
        // CRITICAL: metadata flows through Mandrill to webhooks → AIRecommendationLog correlation
        metadata: {
          logId: actionId,
          clubId: action.clubId,
          userId: action.user.id,
        },
        tags: ['outreach', 'approve-link', String(action.type).toLowerCase()],
      })
      sentMessageId = sendResult.messageId
    }

    // Update status to sent + store externalMessageId for webhook tracking
    await prisma.aIRecommendationLog.update({
      where: { id: actionId },
      data: {
        status: 'sent',
        ...(sentMessageId ? { externalMessageId: sentMessageId } : {}),
        reasoning: {
          ...reasoning,
          approvedAt: new Date().toISOString(),
          approvedVia: 'email_link',
        },
      },
    })

    log.info(`Action ${actionId} approved and executed for ${action.user?.name}`)

    // Report usage
    import('@/lib/stripe-usage').then(({ reportUsage }) => {
      reportUsage(action.clubId, 'email', 1)
    }).catch(() => {})

    return redirectWithMessage(`Approved! Message sent to ${action.user?.name || 'member'}`, 'success')
  } catch (err) {
    // Revert 'approving' → 'pending' so the user can retry
    await prisma.aIRecommendationLog.update({
      where: { id: actionId },
      data: { status: 'pending' },
    }).catch(() => {})
    log.error(`Action ${actionId} approve failed:`, (err as Error).message)
    return redirectWithMessage('Failed to send message', 'error')
  }
}

function redirectWithMessage(message: string, type: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.iqsport.ai'
  // Simple HTML response with auto-close
  return new Response(`
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><title>Agent Action</title></head>
    <body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:system-ui;background:#0B0D17;color:white;">
      <div style="text-align:center;max-width:400px;padding:32px;">
        <div style="font-size:48px;margin-bottom:16px;">${type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'expired' ? '⏰' : 'ℹ️'}</div>
        <h1 style="font-size:20px;margin-bottom:8px;">${message}</h1>
        <p style="color:#94a3b8;font-size:14px;">You can close this tab.</p>
        <a href="${baseUrl}" style="display:inline-block;margin-top:16px;padding:10px 24px;background:linear-gradient(135deg,#8B5CF6,#06B6D4);color:white;text-decoration:none;border-radius:12px;font-size:14px;">Go to Dashboard</a>
      </div>
    </body>
    </html>
  `, { status: 200, headers: { 'Content-Type': 'text/html' } })
}
