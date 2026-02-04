import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import crypto from 'crypto'
import { withPartnerAuth } from '@/server/utils/partnerApiMiddleware'
import { prisma } from '@/lib/prisma'

const webhookSchema = z.object({
  scheduleUpdatedUrl: z.string().url().optional().nullable(),
  resultsUpdatedUrl: z.string().url().optional().nullable(),
})

const EVENT_TYPES = {
  scheduleUpdatedUrl: 'SCHEDULE_UPDATED',
  resultsUpdatedUrl: 'RESULTS_UPDATED',
} as const

export const POST = withPartnerAuth(
  async (req: NextRequest, context) => {
    const body = await req.json()
    const validated = webhookSchema.parse(body)

    const results: Array<{
      event: 'schedule.updated' | 'results.updated'
      url: string | null
      isActive: boolean
      secret?: string
    }> = []

    for (const [key, eventType] of Object.entries(EVENT_TYPES)) {
      const url = validated[key as keyof typeof validated]
      const event =
        key === 'scheduleUpdatedUrl' ? 'schedule.updated' : 'results.updated'

      if (url === undefined) {
        continue
      }

      if (url === null) {
        await prisma.partnerWebhook.updateMany({
          where: { partnerId: context.partnerId, eventType },
          data: { isActive: false },
        })
        results.push({ event, url: null, isActive: false })
        continue
      }

      const existing = await prisma.partnerWebhook.findUnique({
        where: {
          partnerId_eventType: {
            partnerId: context.partnerId,
            eventType,
          },
        },
      })

      if (existing) {
        const updated = await prisma.partnerWebhook.update({
          where: { id: existing.id },
          data: {
            url,
            isActive: true,
          },
        })

        results.push({
          event,
          url: updated.url,
          isActive: updated.isActive,
        })
      } else {
        const secret = crypto.randomBytes(32).toString('hex')
        const created = await prisma.partnerWebhook.create({
          data: {
            partnerId: context.partnerId,
            eventType,
            url,
            secret,
            isActive: true,
          },
        })

        results.push({
          event,
          url: created.url,
          isActive: created.isActive,
          secret,
        })
      }
    }

    return NextResponse.json({ webhooks: results })
  },
  { requiredScope: 'indyleague:write' }
)
