import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { cronLogger as log } from '@/lib/logger'
import { sendHtmlEmail } from '@/lib/sendTransactionEmail'
import { sendSms } from '@/lib/sms'
import {
  buildAdminReminderEmail,
  buildAdminReminderSms,
  shouldSendAdminReminderChannel,
  toAbsoluteAppUrl,
  withAdminReminderChannelResult,
} from '@/lib/ai/agent-admin-reminders'

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

async function sendAdminReminders(dryRun: boolean) {
  const now = new Date()
  const recentWindow = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const decisions = await prisma.agentAdminTodoDecision.findMany({
    where: {
      decision: 'not_now',
      updatedAt: { gte: recentWindow },
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      clubId: true,
      userId: true,
      title: true,
      href: true,
      metadata: true,
      updatedAt: true,
      club: {
        select: {
          name: true,
        },
      },
      user: {
        select: {
          email: true,
          phone: true,
          smsOptIn: true,
        },
      },
    },
  }).catch((err) => {
    log.warn('[Admin Reminders] Query failed:', err)
    return []
  })

  let processed = 0
  let emailSent = 0
  let smsSent = 0
  let skipped = 0
  const results: Array<Record<string, unknown>> = []

  for (const decision of decisions) {
    const metadata = ((decision.metadata && typeof decision.metadata === 'object') ? decision.metadata : {}) as Record<string, unknown>
    const targetUrl = toAbsoluteAppUrl(decision.href)
    const description = typeof metadata.description === 'string' ? metadata.description : null
    const reminderResult = {
      id: decision.id,
      clubId: decision.clubId,
      userId: decision.userId,
      title: decision.title,
      email: 'skipped' as 'sent' | 'skipped' | 'error',
      sms: 'skipped' as 'sent' | 'skipped' | 'error',
    }

    const shouldSendEmail = !!decision.user.email && shouldSendAdminReminderChannel(metadata, 'email', now)
    const shouldSendSms = !!decision.user.phone && !!decision.user.smsOptIn && shouldSendAdminReminderChannel(metadata, 'sms', now)

    if (!shouldSendEmail && !shouldSendSms) {
      skipped += 1
      continue
    }

    processed += 1
    let nextMetadata: Record<string, unknown> = { ...metadata }

    if (shouldSendEmail && decision.user.email) {
      try {
        const emailPayload = buildAdminReminderEmail({
          title: decision.title,
          clubName: decision.club.name,
          description,
          targetUrl,
        })
        if (!dryRun) {
          await sendHtmlEmail(decision.user.email, emailPayload.subject, emailPayload.html)
          nextMetadata = withAdminReminderChannelResult(nextMetadata, 'email', { sentAt: now.toISOString() })
        }
        emailSent += 1
        reminderResult.email = 'sent'
      } catch (err) {
        nextMetadata = withAdminReminderChannelResult(nextMetadata, 'email', {
          error: (err as Error).message?.slice(0, 200) || 'email_failed',
        })
        reminderResult.email = 'error'
      }
    }

    if (shouldSendSms && decision.user.phone) {
      try {
        const body = buildAdminReminderSms({
          title: decision.title,
          clubName: decision.club.name,
          targetUrl,
        })
        if (!dryRun) {
          const response = await sendSms({ to: decision.user.phone, body })
          if (response.status === 'invalid_phone') {
            throw new Error('invalid_phone')
          }
          nextMetadata = withAdminReminderChannelResult(nextMetadata, 'sms', { sentAt: now.toISOString() })
        }
        smsSent += 1
        reminderResult.sms = 'sent'
      } catch (err) {
        nextMetadata = withAdminReminderChannelResult(nextMetadata, 'sms', {
          error: (err as Error).message?.slice(0, 200) || 'sms_failed',
        })
        reminderResult.sms = 'error'
      }
    }

    if (!dryRun) {
      await prisma.agentAdminTodoDecision.update({
        where: { id: decision.id },
        data: {
          metadata: nextMetadata as any,
        },
      }).catch((err) => {
        log.warn('[Admin Reminders] Metadata update failed:', err)
      })
    }

    results.push(reminderResult)
  }

  return {
    processed,
    skipped,
    emailSent,
    smsSent,
    results,
  }
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
    const result = await sendAdminReminders(dryRun)
    log.info(`[Admin Reminders] ${result.processed} processed, ${result.skipped} skipped, ${result.emailSent} email, ${result.smsSent} sms`)
    return NextResponse.json({
      ok: true,
      dryRun,
      startedAt: startedAt.toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      ...result,
    })
  } catch (err) {
    log.error('[Admin Reminders] Cron failed:', (err as Error).message)
    return NextResponse.json({ ok: false, error: (err as Error).message?.slice(0, 200) }, { status: 500 })
  }
}

export async function GET(request: Request) { return run(request) }
export async function POST(request: Request) { return run(request) }
