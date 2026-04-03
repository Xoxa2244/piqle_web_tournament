/**
 * PodPlay CSV Import API — accepts pre-parsed rows from client.
 *
 * POST /api/connectors/podplay/import
 * Body: { clubId: string, fileType: 'customers' | 'settlements', rows: Record<string, any>[] }
 */

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { runPodPlayImport } from '@/lib/connectors/podplay-csv-import'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { clubId, fileType, rows } = body

  if (!clubId || !fileType || !Array.isArray(rows)) {
    return NextResponse.json({ error: 'Missing clubId, fileType, or rows' }, { status: 400 })
  }

  // Check admin
  const admin = await prisma.clubAdmin.findUnique({
    where: { clubId_userId: { clubId, userId: session.user.id } },
  })
  if (!admin) {
    return NextResponse.json({ error: 'Not a club admin' }, { status: 403 })
  }

  try {
    const result = await runPodPlayImport(clubId, [{ type: fileType, rows }])
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('[PodPlay Import] Failed:', err.message)
    return NextResponse.json({ error: err.message || 'Import failed' }, { status: 500 })
  }
}
