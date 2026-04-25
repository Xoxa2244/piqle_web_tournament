import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { cronLogger as log } from '@/lib/logger'
import { sendHtmlEmail } from '@/lib/sendTransactionEmail'
import { sendSms } from '@/lib/sms'
import { pushToUser } from '@/lib/realtime'
import {
  buildAdminProactivePingCandidates,
  buildAdminReminderEmail,
  buildAdminReminderSms,
  resolveAdminReminderDeliveryModeFromMetadata,
  resolveAdminReminderTarget,
  shouldSendAdminReminderChannel,
  toAbsoluteAppUrl,
  withAdminReminderChannelResult,
} from '@/lib/ai/agent-admin-reminders'
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

type ReminderProfile = {
  adminReminderEmail: string | null
  adminReminderPhone: string | null
  adminReminderChannel: string | null
}

type ReminderWorkItem = {
  source: 'snoozed' | 'proactive'
  clubId: string
  clubName: string
  userId: string
  title: string
  href: string
  metadata: Record<string, unknown>
  automationSettings?: unknown
  reminderProfile: ReminderProfile
  persist: (metadata: Record<string, unknown>) => Promise<void>
}

async function processReminderDelivery(
  item: ReminderWorkItem,
  now: Date,
  dryRun: boolean,
) {
  const targetUrl = toAbsoluteAppUrl(item.href)
  const description =
    typeof item.metadata.description === 'string' ? item.metadata.description : null
  const deliveryMode = resolveAdminReminderDeliveryModeFromMetadata(
    item.metadata,
    item.reminderProfile.adminReminderChannel,
  )
  const reminderEmail = resolveAdminReminderTarget({
    explicit: item.reminderProfile.adminReminderEmail,
    fallback: null,
  })
  const reminderPhone = resolveAdminReminderTarget({
    explicit: item.reminderProfile.adminReminderPhone,
    fallback: null,
  })

  const shouldSendEmail =
    (deliveryMode === 'email' || deliveryMode === 'both') &&
    !!reminderEmail &&
    shouldSendAdminReminderChannel(item.metadata, 'email', now)
  const shouldSendSms =
    (deliveryMode === 'sms' || deliveryMode === 'both') &&
    !!reminderPhone &&
    shouldSendAdminReminderChannel(item.metadata, 'sms', now)
  const requestedExternalDelivery = shouldSendEmail || shouldSendSms
  const controlPlane = requestedExternalDelivery
    ? evaluateAgentControlPlaneAction({
        automationSettings: item.automationSettings,
        action: 'adminReminderExternal',
      })
    : null

  const remindAt =
    typeof item.metadata.remindAt === 'string' ? new Date(item.metadata.remindAt) : null
  const inAppQueuedAt =
    typeof item.metadata.inAppReminderQueuedAt === 'string'
      ? new Date(item.metadata.inAppReminderQueuedAt)
      : null
  const shouldRefreshInAppRecord =
    !remindAt
    || Number.isNaN(remindAt.getTime())
    || !inAppQueuedAt
    || inAppQueuedAt.getTime() < remindAt.getTime()
  const shouldCreateInAppRecord =
    item.source === 'proactive'
    && shouldRefreshInAppRecord
    && (
      deliveryMode === 'in_app'
      || (!!controlPlane && requestedExternalDelivery && (!controlPlane.allowed || controlPlane.shadow))
    )

  if (!shouldSendEmail && !shouldSendSms && !shouldCreateInAppRecord) {
    return {
      processed: false,
      inAppOnly: false,
      email: 'skipped' as const,
      sms: 'skipped' as const,
    }
  }

  let nextMetadata = { ...item.metadata }
  let email: 'sent' | 'skipped' | 'error' = 'skipped'
  let sms: 'sent' | 'skipped' | 'error' = 'skipped'

  if (controlPlane && (!controlPlane.allowed || controlPlane.shadow)) {
    nextMetadata = {
      ...nextMetadata,
      externalReminderControlPlaneMode: controlPlane.mode,
      externalReminderControlPlaneReason: controlPlane.reason,
      externalReminderControlPlaneReviewedAt: now.toISOString(),
    }

    if (!dryRun) {
      await persistAgentDecisionRecord(prisma, {
        clubId: item.clubId,
        userId: item.userId,
        actorType: 'system',
        action: 'adminReminderExternal',
        targetType: 'admin_reminder',
        targetId: `${item.source}:${item.userId}:${item.href}`,
        mode: controlPlane.mode,
        result: controlPlane.shadow ? 'shadowed' : 'blocked',
        summary: controlPlane.shadow
          ? `Admin reminder for ${item.title} was reviewed in shadow mode.`
          : controlPlane.reason,
        metadata: {
          source: item.source,
          href: item.href,
          title: item.title,
          deliveryMode,
          emailRequested: shouldSendEmail,
          smsRequested: shouldSendSms,
        },
      })
      if (shouldCreateInAppRecord) {
        nextMetadata.inAppReminderQueuedAt = now.toISOString()
      }
      await item.persist(nextMetadata)
      pushToUser(item.userId, { type: 'invalidate', keys: ['notification.list'] })
    }

    return {
      processed: true,
      inAppOnly: shouldCreateInAppRecord,
      email: 'skipped' as const,
      sms: 'skipped' as const,
    }
  }

  if (shouldSendEmail && reminderEmail) {
    try {
      const emailPayload = buildAdminReminderEmail({
        title: item.title,
        clubName: item.clubName,
        description,
        targetUrl,
      })
      if (!dryRun) {
        await sendHtmlEmail(reminderEmail, emailPayload.subject, emailPayload.html)
        nextMetadata = withAdminReminderChannelResult(nextMetadata, 'email', { sentAt: now.toISOString() })
      }
      email = 'sent'
    } catch (err) {
      nextMetadata = withAdminReminderChannelResult(nextMetadata, 'email', {
        error: (err as Error).message?.slice(0, 200) || 'email_failed',
      })
      email = 'error'
    }
  }

  if (shouldSendSms && reminderPhone) {
    try {
      const body = buildAdminReminderSms({
        title: item.title,
        clubName: item.clubName,
        targetUrl,
      })
      if (!dryRun) {
        const response = await sendSms({ to: reminderPhone, body })
        if (response.status === 'invalid_phone') {
          throw new Error('invalid_phone')
        }
        nextMetadata = withAdminReminderChannelResult(nextMetadata, 'sms', { sentAt: now.toISOString() })
      }
      sms = 'sent'
    } catch (err) {
      nextMetadata = withAdminReminderChannelResult(nextMetadata, 'sms', {
        error: (err as Error).message?.slice(0, 200) || 'sms_failed',
      })
      sms = 'error'
    }
  }

  if (!dryRun) {
    if (shouldCreateInAppRecord) {
      nextMetadata.inAppReminderQueuedAt = now.toISOString()
    }
    await item.persist(nextMetadata)
    pushToUser(item.userId, { type: 'invalidate', keys: ['notification.list'] })
  }

  return {
    processed: true,
    inAppOnly: shouldCreateInAppRecord && !shouldSendEmail && !shouldSendSms,
    email,
    sms,
  }
}

async function loadSnoozedReminderItems(now: Date): Promise<ReminderWorkItem[]> {
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
      club: {
        select: {
          name: true,
          automationSettings: true,
        },
      },
      user: {
        select: {
          adminReminderEmail: true,
          adminReminderPhone: true,
          adminReminderChannel: true,
        },
      },
    },
  }).catch((err) => {
    log.warn('[Admin Reminders] Snoozed decision query failed:', err)
    return []
  })

  return decisions.map((decision) => ({
    source: 'snoozed' as const,
    clubId: decision.clubId,
    clubName: decision.club.name,
    userId: decision.userId,
    title: decision.title,
    href: decision.href,
    metadata: ((decision.metadata && typeof decision.metadata === 'object')
      ? decision.metadata
      : {}) as Record<string, unknown>,
    automationSettings: decision.club.automationSettings,
    reminderProfile: {
      adminReminderEmail: decision.user.adminReminderEmail,
      adminReminderPhone: decision.user.adminReminderPhone,
      adminReminderChannel: decision.user.adminReminderChannel,
    },
    persist: async (metadata) => {
      await prisma.agentAdminTodoDecision.update({
        where: { id: decision.id },
        data: { metadata: metadata as any },
      }).catch((err) => {
        log.warn('[Admin Reminders] Snoozed metadata update failed:', err)
      })
    },
  }))
}

async function loadProactiveReminderItems(now: Date): Promise<ReminderWorkItem[]> {
  const todayKey = now.toISOString().slice(0, 10)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const underfilledHorizon = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  const [admins, existingProactiveRecords] = await Promise.all([
    prisma.clubAdmin.findMany({
      select: {
        clubId: true,
        userId: true,
        club: {
          select: {
            name: true,
            automationSettings: true,
          },
        },
        user: {
          select: {
            adminReminderEmail: true,
            adminReminderPhone: true,
            adminReminderChannel: true,
          },
        },
      },
    }).catch((err) => {
      log.warn('[Admin Reminders] Club admin query failed:', err)
      return []
    }),
    prisma.agentAdminTodoDecision.findMany({
      where: {
        decision: 'proactive_ping',
        dateKey: todayKey,
      },
      select: {
        id: true,
        clubId: true,
        userId: true,
        itemId: true,
        metadata: true,
      },
    }).catch((err) => {
      log.warn('[Admin Reminders] Proactive history query failed:', err)
      return []
    }),
  ])

  const existingByKey = new Map(
    existingProactiveRecords.map((record) => [
      `${record.clubId}:${record.userId}:${record.itemId}`,
      record,
    ]),
  )

  const items: ReminderWorkItem[] = []

  for (const admin of admins) {
    const [pendingReviewCount, readyOpsDraftCount, upcomingSessions, opsDrafts] = await Promise.all([
      prisma.aIRecommendationLog.count({
        where: {
          clubId: admin.clubId,
          status: 'pending',
          createdAt: { gte: sevenDaysAgo },
        },
      }).catch(() => 0),
      prisma.opsSessionDraft.count({
        where: {
          clubId: admin.clubId,
          status: 'READY_FOR_OPS',
        },
      }).catch(() => 0),
      prisma.playSession.findMany({
        where: {
          clubId: admin.clubId,
          status: 'SCHEDULED',
          date: {
            gte: now,
            lte: underfilledHorizon,
          },
        },
        include: {
          _count: {
            select: {
              bookings: {
                where: { status: 'CONFIRMED' },
              },
            },
          },
        },
        orderBy: { date: 'asc' },
        take: 8,
      }).catch(() => []),
      prisma.opsSessionDraft.findMany({
        where: {
          clubId: admin.clubId,
          status: { in: ['READY_FOR_OPS', 'SESSION_DRAFT'] },
        },
        select: {
          id: true,
          title: true,
          dayOfWeek: true,
          metadata: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: 40,
      }).catch(() => []),
    ])

    const underfilledSessions = upcomingSessions.filter(
      (session) => session.maxPlayers > 0 && session._count.bookings < session.maxPlayers * 0.5,
    )
    const ownedOpsDrafts = opsDrafts.filter((draft) => {
      const metadata =
        draft.metadata && typeof draft.metadata === 'object' && !Array.isArray(draft.metadata)
          ? (draft.metadata as Record<string, unknown>)
          : {}
      const opsWorkflow =
        metadata.opsWorkflow && typeof metadata.opsWorkflow === 'object' && !Array.isArray(metadata.opsWorkflow)
          ? (metadata.opsWorkflow as Record<string, unknown>)
          : {}
      return typeof opsWorkflow.ownerUserId === 'string' && opsWorkflow.ownerUserId === admin.userId
    })
    const ownedOverdueDrafts = ownedOpsDrafts.filter((draft) => {
      const metadata = draft.metadata as Record<string, unknown> | null
      const opsWorkflow =
        metadata?.opsWorkflow && typeof metadata.opsWorkflow === 'object' && !Array.isArray(metadata.opsWorkflow)
          ? (metadata.opsWorkflow as Record<string, unknown>)
          : {}
      const dueAt = typeof opsWorkflow.dueAt === 'string' ? new Date(opsWorkflow.dueAt) : null
      return !!dueAt && !Number.isNaN(dueAt.getTime()) && dueAt.getTime() <= now.getTime()
    })
    const ownedDueSoonDrafts = ownedOpsDrafts.filter((draft) => {
      const metadata = draft.metadata as Record<string, unknown> | null
      const opsWorkflow =
        metadata?.opsWorkflow && typeof metadata.opsWorkflow === 'object' && !Array.isArray(metadata.opsWorkflow)
          ? (metadata.opsWorkflow as Record<string, unknown>)
          : {}
      const dueAt = typeof opsWorkflow.dueAt === 'string' ? new Date(opsWorkflow.dueAt) : null
      return !!dueAt
        && !Number.isNaN(dueAt.getTime())
        && dueAt.getTime() > now.getTime()
        && dueAt.getTime() <= now.getTime() + 2 * 60 * 60 * 1000
    })
    const candidates = buildAdminProactivePingCandidates({
      clubId: admin.clubId,
      now,
      timeZone: process.env.ADMIN_REMINDER_TIMEZONE || 'America/Los_Angeles',
      pendingReviewCount,
      readyOpsDraftCount,
      underfilledRiskCount: underfilledSessions.length,
      nextUnderfilledTitle: underfilledSessions[0]?.title || null,
      ownedOverdueCount: ownedOverdueDrafts.length,
      ownedDueSoonCount: ownedDueSoonDrafts.length,
      nextOwnedDraftTitle: ownedOverdueDrafts[0]?.title || ownedDueSoonDrafts[0]?.title || null,
    })

    for (const candidate of candidates) {
      const existing = existingByKey.get(`${admin.clubId}:${admin.userId}:${candidate.itemId}`)
      const metadata = {
        ...((existing?.metadata && typeof existing.metadata === 'object')
          ? existing.metadata
          : {}),
        description: candidate.description,
        proactiveKind: candidate.kind,
        reminderChannel:
          typeof (existing?.metadata as Record<string, unknown> | undefined)?.reminderChannel === 'string'
            ? (existing?.metadata as Record<string, unknown>).reminderChannel
            : admin.user.adminReminderChannel || 'in_app',
        remindAt:
          typeof (existing?.metadata as Record<string, unknown> | undefined)?.remindAt === 'string'
            ? (existing?.metadata as Record<string, unknown>).remindAt
            : now.toISOString(),
      } as Record<string, unknown>

      items.push({
        source: 'proactive',
        clubId: admin.clubId,
        clubName: admin.club.name,
        userId: admin.userId,
        title: candidate.title,
        href: candidate.href,
        metadata,
        automationSettings: admin.club.automationSettings,
        reminderProfile: {
          adminReminderEmail: admin.user.adminReminderEmail,
          adminReminderPhone: admin.user.adminReminderPhone,
          adminReminderChannel: admin.user.adminReminderChannel,
        },
        persist: async (nextMetadata) => {
          await prisma.agentAdminTodoDecision.upsert({
            where: {
              clubId_userId_dateKey_itemId: {
                clubId: admin.clubId,
                userId: admin.userId,
                dateKey: todayKey,
                itemId: candidate.itemId,
              },
            },
            update: {
              decision: 'proactive_ping',
              title: candidate.title,
              bucket: 'recommended',
              href: candidate.href,
              metadata: nextMetadata as any,
            },
            create: {
              clubId: admin.clubId,
              userId: admin.userId,
              dateKey: todayKey,
              itemId: candidate.itemId,
              decision: 'proactive_ping',
              title: candidate.title,
              bucket: 'recommended',
              href: candidate.href,
              metadata: nextMetadata as any,
            },
          }).catch((err) => {
            log.warn('[Admin Reminders] Proactive upsert failed:', err)
          })
        },
      })
    }
  }

  return items
}

async function sendAdminReminders(dryRun: boolean) {
  const now = new Date()
  const [snoozedItems, proactiveItems] = await Promise.all([
    loadSnoozedReminderItems(now),
    loadProactiveReminderItems(now),
  ])

  const allItems = [...snoozedItems, ...proactiveItems]

  let processed = 0
  let emailSent = 0
  let smsSent = 0
  let skipped = 0
  let inAppQueued = 0
  const results: Array<Record<string, unknown>> = []

  for (const item of allItems) {
    const result = await processReminderDelivery(item, now, dryRun)

    if (!result.processed) {
      skipped += 1
      continue
    }

    processed += 1
    if (result.inAppOnly) inAppQueued += 1
    if (result.email === 'sent') emailSent += 1
    if (result.sms === 'sent') smsSent += 1

    results.push({
      source: item.source,
      clubId: item.clubId,
      userId: item.userId,
      title: item.title,
      email: result.email,
      sms: result.sms,
      inAppOnly: result.inAppOnly,
    })
  }

  return {
    processed,
    skipped,
    emailSent,
    smsSent,
    inAppQueued,
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
    log.info(
      `[Admin Reminders] ${result.processed} processed, ${result.skipped} skipped, ${result.emailSent} email, ${result.smsSent} sms, ${result.inAppQueued} in-app`,
    )
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
