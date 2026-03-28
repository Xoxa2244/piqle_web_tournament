import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { runCourtReserveExcelImport } from '@/lib/connectors/courtreserve-excel-import'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { clubId, fileType, data, fileName } = body

    if (!clubId || !fileType || !data) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Verify user is club admin
    const membership = await prisma.clubFollower.findFirst({
      where: { clubId, userId: session.user.id, role: { in: ['ADMIN', 'OWNER'] } },
    })
    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const result = await runCourtReserveExcelImport(clubId, [{ type: fileType, data }])

    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('[import-excel]', err)
    return NextResponse.json({ error: err.message || 'Import failed' }, { status: 500 })
  }
}
