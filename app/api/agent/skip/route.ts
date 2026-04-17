/**
 * Agent Action Skip — marks a queued pending action as skipped
 *
 * Called via link in morning digest email:
 *   GET /api/agent/skip?id=xxx&token=yyy
 */

import { NextResponse } from 'next/server'
import { cronLogger as log } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { createHmac } from 'crypto'

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
  const url = new URL(request.url)
  const actionId = url.searchParams.get('id')
  const token = url.searchParams.get('token')

  if (!actionId || !token) {
    return NextResponse.json({ error: 'Missing id or token' }, { status: 400 })
  }

  const action = await prisma.aIRecommendationLog.findUnique({
    where: { id: actionId },
    select: { id: true, clubId: true, status: true, userId: true },
  })

  if (!action) {
    return respondHtml('Action not found', 'error')
  }

  const expectedToken = generateToken(actionId, action.clubId)
  if (token !== expectedToken) {
    return respondHtml('Invalid token', 'error')
  }

  if (action.status !== 'pending') {
    return respondHtml(`Action already ${action.status}`, 'info')
  }

  // Mark as skipped
  await prisma.aIRecommendationLog.update({
    where: { id: actionId },
    data: {
      status: 'skipped',
      reasoning: {
        skippedAt: new Date().toISOString(),
        skippedVia: 'email_link',
      },
    },
  })

  log.info(`Action ${actionId} skipped by manager`)

  return respondHtml('Action skipped', 'success')
}

function respondHtml(message: string, type: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.iqsport.ai'
  return new Response(`
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><title>Agent Action</title></head>
    <body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:system-ui;background:#0B0D17;color:white;">
      <div style="text-align:center;max-width:400px;padding:32px;">
        <div style="font-size:48px;margin-bottom:16px;">${type === 'success' ? '⏭️' : type === 'error' ? '❌' : 'ℹ️'}</div>
        <h1 style="font-size:20px;margin-bottom:8px;">${message}</h1>
        <p style="color:#94a3b8;font-size:14px;">You can close this tab.</p>
        <a href="${baseUrl}" style="display:inline-block;margin-top:16px;padding:10px 24px;background:linear-gradient(135deg,#8B5CF6,#06B6D4);color:white;text-decoration:none;border-radius:12px;font-size:14px;">Go to Dashboard</a>
      </div>
    </body>
    </html>
  `, { status: 200, headers: { 'Content-Type': 'text/html' } })
}
