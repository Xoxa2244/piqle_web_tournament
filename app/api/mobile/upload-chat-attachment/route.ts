import { NextRequest, NextResponse } from 'next/server'

import { getSessionFromMobileToken } from '@/lib/mobileAuth'
import { supabaseAdmin } from '@/lib/supabase'

const CHAT_ATTACHMENTS_BUCKET = 'chat-attachments'

const getBearerToken = (req: NextRequest) => {
  const header = req.headers.get('authorization') || req.headers.get('Authorization')
  if (!header) return null
  const [scheme, token] = header.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null
  return token.trim()
}

async function ensureBucketExists() {
  const { data } = await supabaseAdmin.storage.listBuckets()
  const exists = data?.some((bucket) => bucket.name === CHAT_ATTACHMENTS_BUCKET)
  if (exists) return
  await supabaseAdmin.storage.createBucket(CHAT_ATTACHMENTS_BUCKET, {
    public: true,
    fileSizeLimit: '26214400',
  })
}

const sanitizeFilePart = (value: string) =>
  value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'file'

export async function POST(req: NextRequest) {
  const token = getBearerToken(req)
  if (!token) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'Missing mobile auth token.' },
      { status: 401 }
    )
  }

  const session = await getSessionFromMobileToken(token)
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'Invalid or expired mobile auth token.' },
      { status: 401 }
    )
  }

  const formData = await req.formData()
  const file = formData.get('file')
  const kind = String(formData.get('kind') ?? '').trim() === 'image' ? 'image' : 'file'

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'BAD_REQUEST', message: 'No file provided.' }, { status: 400 })
  }

  if (kind === 'image' && !file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'BAD_REQUEST', message: 'File must be an image.' }, { status: 400 })
  }

  const sizeLimit = kind === 'image' ? 12 * 1024 * 1024 : 25 * 1024 * 1024
  if (file.size > sizeLimit) {
    return NextResponse.json(
      {
        error: 'BAD_REQUEST',
        message: kind === 'image' ? 'Image must be smaller than 12MB.' : 'File must be smaller than 25MB.',
      },
      { status: 400 }
    )
  }

  await ensureBucketExists()

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const extension = sanitizeFilePart(file.name.split('.').pop() || (kind === 'image' ? 'jpg' : 'bin'))
  const baseName = sanitizeFilePart(file.name.replace(/\.[^.]+$/, ''))
  const objectPath = `${session.user.id}/${kind}/${Date.now()}-${baseName}.${extension}`

  const { error: uploadError } = await supabaseAdmin.storage
    .from(CHAT_ATTACHMENTS_BUCKET)
    .upload(objectPath, buffer, { contentType: file.type || undefined, upsert: false })

  if (uploadError) {
    return NextResponse.json(
      { error: 'UPLOAD_FAILED', message: `Failed to upload ${kind}.` },
      { status: 500 }
    )
  }

  const { data: publicUrlData } = supabaseAdmin.storage.from(CHAT_ATTACHMENTS_BUCKET).getPublicUrl(objectPath)
  return NextResponse.json({
    url: publicUrlData.publicUrl,
    fileName: file.name || `${baseName}.${extension}`,
    mimeType: file.type || (kind === 'image' ? 'image/jpeg' : 'application/octet-stream'),
    size: file.size,
    kind,
  })
}
