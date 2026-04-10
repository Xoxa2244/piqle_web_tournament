export const maxDuration = 300 // Pro plan: 5 min for large imports

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { runCourtReserveRowImport } from '@/lib/connectors/courtreserve-excel-import'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { clubId, fileType, rows } = body as {
      clubId: string
      fileType: 'members' | 'reservations' | 'events'
      rows: Record<string, any>[]
      chunkIndex?: number
      totalChunks?: number
      isLastChunk?: boolean
    }

    if (!clubId || !fileType || !Array.isArray(rows)) {
      return NextResponse.json({ error: 'Missing required fields: clubId, fileType, rows' }, { status: 400 })
    }

    const admin = await prisma.clubAdmin.findFirst({
      where: { clubId, userId: session.user.id },
    })
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const result = await runCourtReserveRowImport(clubId, [{ type: fileType, rows }])

    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('[import-rows]', err)
    return NextResponse.json({ error: err.message || 'Import failed' }, { status: 500 })
  }
}
