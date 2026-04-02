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

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_AGE_MS = 48 * 60 * 60 * 1000 // 48 hours

function generateToken(actionId: string, clubId: string): string {
  const secret = process.env.CRON_SECRET || 'fallback-dev-secret'
  return createHmac('sha256', secret).update(`${actionId}:${clubId}`).digest('hex').slice(0, 32)
}

export async function GET(request: Request) {
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
      club: { select: { id: true, name: true } },
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

  // Execute the action
  try {
    const { sendOutreachEmail } = await import('@/lib/email')
    const reasoning = action.reasoning as any
    const firstName = action.user?.name?.split(' ')[0] || 'there'

    // Send the outreach email
    if (action.user?.email) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.iqsport.ai'
      const bookingUrl = `${baseUrl}/clubs/${action.clubId}/play`

      await sendOutreachEmail({
        to: action.user.email,
        subject: `${action.club.name} — We'd love to see you back!`,
        body: `Hey ${firstName}!\n\nWe noticed it's been a while since your last session at ${action.club.name}. We'd love to have you back — there are some great sessions coming up that match your level.\n\nBook now and reconnect with the community!`,
        clubName: action.club.name,
        bookingUrl,
      })
    }

    // Update status to sent
    await prisma.aIRecommendationLog.update({
      where: { id: actionId },
      data: {
        status: 'sent',
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
