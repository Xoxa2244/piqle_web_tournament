/**
 * Agent Action Snooze — postpone a pending action to tomorrow's digest
 *
 * Called via link in morning digest email:
 *   GET /api/agent/snooze?id=xxx&token=yyy
 *
 * Resets createdAt to now so it appears in tomorrow's digest.
 */

import { cronLogger as log } from '@/lib/logger'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createHmac } from 'crypto'
import { checkRateLimit, getIpFromRequest, buildRateLimitHeaders } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function generateToken(actionId: string, clubId: string): string {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    throw new Error('CRON_SECRET environment variable is required')
  }
  return createHmac('sha256', secret).update(`${actionId}:${clubId}`).digest('hex')
}

export async function GET(request: Request) {
  const ip = getIpFromRequest(request)
  const rateLimit = await checkRateLimit('agentAction', ip)
  if (!rateLimit.success) {
    return new NextResponse('Too many requests', {
      status: 429,
      headers: buildRateLimitHeaders(rateLimit),
    })
  }

  const url = new URL(request.url)
  const actionId = url.searchParams.get('id')
  const token = url.searchParams.get('token')

  if (!actionId || !token) {
    return respondHtml('Missing id or token', 'error')
  }

  const action = await prisma.aIRecommendationLog.findUnique({
    where: { id: actionId },
    select: { id: true, clubId: true, status: true, reasoning: true },
  })

  if (!action) return respondHtml('Action not found', 'error')

  const expectedToken = generateToken(actionId, action.clubId)
  if (token !== expectedToken) return respondHtml('Invalid token', 'error')

  if (action.status !== 'pending') {
    return respondHtml(`Action already ${action.status}`, 'info')
  }

  const reasoning = typeof action.reasoning === 'object' && action.reasoning !== null ? action.reasoning as any : {}
  const snoozeCount = (reasoning.snoozeCount || 0) + 1

  if (snoozeCount > 3) {
    return respondHtml('Max 3 snoozes — please approve or skip', 'info')
  }

  // Reset createdAt to now → will appear in tomorrow's digest
  await prisma.aIRecommendationLog.update({
    where: { id: actionId },
    data: {
      createdAt: new Date(),
      reasoning: {
        ...reasoning,
        snoozeCount,
        lastSnoozedAt: new Date().toISOString(),
        snoozedVia: 'email_link',
      },
    },
  })

  log.info(`Action ${actionId} snoozed (count: ${snoozeCount})`)

  return respondHtml(`Snoozed — will appear in tomorrow's report`, 'success')
}

function respondHtml(message: string, type: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.iqsport.ai'
  return new Response(`
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><title>Agent Action</title></head>
    <body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:system-ui;background:#0B0D17;color:white;">
      <div style="text-align:center;max-width:400px;padding:32px;">
        <div style="font-size:48px;margin-bottom:16px;">${type === 'success' ? '⏰' : type === 'error' ? '❌' : 'ℹ️'}</div>
        <h1 style="font-size:20px;margin-bottom:8px;">${message}</h1>
        <p style="color:#94a3b8;font-size:14px;">You can close this tab.</p>
        <a href="${baseUrl}" style="display:inline-block;margin-top:16px;padding:10px 24px;background:linear-gradient(135deg,#8B5CF6,#06B6D4);color:white;text-decoration:none;border-radius:12px;font-size:14px;">Go to Dashboard</a>
      </div>
    </body>
    </html>
  `, { status: 200, headers: { 'Content-Type': 'text/html' } })
}
