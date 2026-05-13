import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { cronLogger as log } from '@/lib/logger'
import { authorizeCampaignSendCron, runCampaignSendTick } from '@/lib/campaign-send-runner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function run(request: Request) {
  const auth = authorizeCampaignSendCron(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const url = new URL(request.url)
  const limit = Number(url.searchParams.get('limit') || 200)

  try {
    const result = await runCampaignSendTick(prisma, { limit })
    return NextResponse.json(result)
  } catch (error: any) {
    log.error?.(`[Campaign Sends] Failed: ${String(error?.message ?? error).slice(0, 200)}`)
    return NextResponse.json(
      { error: 'campaign-sends failed', message: String(error?.message ?? error).slice(0, 200) },
      { status: 500 },
    )
  }
}

export async function GET(request: Request) {
  return run(request)
}

export async function POST(request: Request) {
  return run(request)
}
