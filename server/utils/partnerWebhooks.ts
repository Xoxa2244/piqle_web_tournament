import crypto from 'crypto'

export type PartnerWebhookEvent = 'schedule.updated' | 'results.updated'

const EVENT_TO_ENUM: Record<PartnerWebhookEvent, 'SCHEDULE_UPDATED' | 'RESULTS_UPDATED'> = {
  'schedule.updated': 'SCHEDULE_UPDATED',
  'results.updated': 'RESULTS_UPDATED',
}

export interface PartnerWebhookDetails {
  matchDayId?: string
  matchupId?: string
}

export async function sendPartnerWebhookForTournament(
  prisma: any,
  tournamentId: string,
  event: PartnerWebhookEvent,
  details: PartnerWebhookDetails = {}
) {
  const tournamentMappings = await prisma.externalIdMapping.findMany({
    where: {
      entityType: 'TOURNAMENT',
      internalId: tournamentId,
    },
    select: {
      partnerId: true,
      externalId: true,
    },
  })

  if (tournamentMappings.length === 0) {
    return
  }

  const partnerIds = tournamentMappings.map((m: any) => m.partnerId)
  const webhooks = await prisma.partnerWebhook.findMany({
    where: {
      partnerId: { in: partnerIds },
      eventType: EVENT_TO_ENUM[event],
      isActive: true,
    },
    select: {
      partnerId: true,
      url: true,
      secret: true,
    },
  })

  if (webhooks.length === 0) {
    return
  }

  const matchDayIds = details.matchDayId ? [details.matchDayId] : []
  const matchupIds = details.matchupId ? [details.matchupId] : []

  const [dayMappings, matchupMappings] = await Promise.all([
    matchDayIds.length > 0
      ? prisma.externalIdMapping.findMany({
          where: {
            entityType: 'MATCH_DAY',
            internalId: { in: matchDayIds },
            partnerId: { in: partnerIds },
          },
          select: { partnerId: true, internalId: true, externalId: true },
        })
      : Promise.resolve([]),
    matchupIds.length > 0
      ? prisma.externalIdMapping.findMany({
          where: {
            entityType: 'MATCHUP',
            internalId: { in: matchupIds },
            partnerId: { in: partnerIds },
          },
          select: { partnerId: true, internalId: true, externalId: true },
        })
      : Promise.resolve([]),
  ])

  const dayMap = new Map<string, string>()
  dayMappings.forEach((m: any) => {
    dayMap.set(`${m.partnerId}:${m.internalId}`, m.externalId)
  })

  const matchupMap = new Map<string, string>()
  matchupMappings.forEach((m: any) => {
    matchupMap.set(`${m.partnerId}:${m.internalId}`, m.externalId)
  })

  await Promise.all(
    webhooks.map(async (hook: any) => {
      const tournamentExternalId =
        tournamentMappings.find((m: any) => m.partnerId === hook.partnerId)?.externalId || null
      if (!tournamentExternalId) return

      const payload = {
        event,
        partnerId: hook.partnerId,
        tournamentExternalId,
        changedAt: new Date().toISOString(),
        details: {
          matchDayExternalId: details.matchDayId
            ? dayMap.get(`${hook.partnerId}:${details.matchDayId}`) || null
            : null,
          matchupExternalId: details.matchupId
            ? matchupMap.get(`${hook.partnerId}:${details.matchupId}`) || null
            : null,
        },
      }

      await sendWebhook(hook.url, hook.secret, event, payload)
    })
  )
}

export async function sendPartnerWebhookForPartner(
  prisma: any,
  partnerId: string,
  tournamentExternalId: string,
  event: PartnerWebhookEvent,
  details: PartnerWebhookDetails = {}
) {
  const webhooks = await prisma.partnerWebhook.findMany({
    where: {
      partnerId,
      eventType: EVENT_TO_ENUM[event],
      isActive: true,
    },
    select: {
      url: true,
      secret: true,
    },
  })

  if (webhooks.length === 0) {
    return
  }

  const matchDayIds = details.matchDayId ? [details.matchDayId] : []
  const matchupIds = details.matchupId ? [details.matchupId] : []

  const [dayMappings, matchupMappings] = await Promise.all([
    matchDayIds.length > 0
      ? prisma.externalIdMapping.findMany({
          where: {
            entityType: 'MATCH_DAY',
            internalId: { in: matchDayIds },
            partnerId,
          },
          select: { internalId: true, externalId: true },
        })
      : Promise.resolve([]),
    matchupIds.length > 0
      ? prisma.externalIdMapping.findMany({
          where: {
            entityType: 'MATCHUP',
            internalId: { in: matchupIds },
            partnerId,
          },
          select: { internalId: true, externalId: true },
        })
      : Promise.resolve([]),
  ])

  const dayMap = new Map<string, string>()
  dayMappings.forEach((m: any) => {
    dayMap.set(m.internalId, m.externalId)
  })

  const matchupMap = new Map<string, string>()
  matchupMappings.forEach((m: any) => {
    matchupMap.set(m.internalId, m.externalId)
  })

  const payload = {
    event,
    partnerId,
    tournamentExternalId,
    changedAt: new Date().toISOString(),
    details: {
      matchDayExternalId: details.matchDayId ? dayMap.get(details.matchDayId) || null : null,
      matchupExternalId: details.matchupId ? matchupMap.get(details.matchupId) || null : null,
    },
  }

  await Promise.all(
    webhooks.map((hook: any) => sendWebhook(hook.url, hook.secret, event, payload))
  )
}

async function sendWebhook(url: string, secret: string, event: PartnerWebhookEvent, payload: any) {
  try {
    const body = JSON.stringify(payload)
    const signature = crypto.createHmac('sha256', secret).update(body).digest('hex')
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Piqle-Event': event,
        'X-Piqle-Timestamp': payload.changedAt,
        'X-Piqle-Signature': `sha256=${signature}`,
      },
      body,
      signal: controller.signal,
    })

    clearTimeout(timeout)
  } catch (error) {
    console.error('Partner webhook failed', { event, url, error })
  }
}
