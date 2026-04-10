export const maxDuration = 300 // Pro plan: 5 min for large imports

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { runCourtReserveExcelImport } from '@/lib/connectors/courtreserve-excel-import'

// Allow large file uploads (no body size limit on this route)
export const config = {
  api: { bodyParser: false },
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let clubId: string
    let fileType: string
    let base64Data: string

    const contentType = req.headers.get('content-type') || ''

    if (contentType.includes('multipart/form-data')) {
      // FormData upload — raw file bytes, no 4.5MB base64 limit
      const formData = await req.formData()
      clubId = formData.get('clubId') as string
      fileType = formData.get('fileType') as string
      const file = formData.get('file') as File | null
      if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

      const arrayBuffer = await file.arrayBuffer()
      const bytes = new Uint8Array(arrayBuffer)
      let binary = ''
      for (let j = 0; j < bytes.length; j++) binary += String.fromCharCode(bytes[j])
      base64Data = btoa(binary)
    } else {
      // Legacy JSON with base64 (small files only)
      const body = await req.json()
      clubId = body.clubId
      fileType = body.fileType
      base64Data = body.data
    }

    if (!clubId || !fileType || !base64Data) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const admin = await prisma.clubAdmin.findFirst({
      where: { clubId, userId: session.user.id },
    })
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const result = await runCourtReserveExcelImport(clubId, [{ type: fileType, data: base64Data }])

    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('[import-excel]', err)
    return NextResponse.json({ error: err.message || 'Import failed' }, { status: 500 })
  }
}
