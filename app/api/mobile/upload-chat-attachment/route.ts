import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'

import { getSessionFromMobileToken } from '@/lib/mobileAuth'
import { supabaseAdmin } from '@/lib/supabase'

const CHAT_ATTACHMENTS_BUCKET = 'chat-attachments'
const CHAT_IMAGE_MAX_DIMENSION = 1600
const CHAT_IMAGE_QUALITY = 80
const OPTIMIZABLE_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/avif',
])

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

const decodeFileName = (value: string) => {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return ''
  try {
    return decodeURIComponent(trimmed)
  } catch {
    return trimmed
  }
}

async function prepareUploadPayload({
  file,
  kind,
  buffer,
  baseName,
  originalExtension,
  decodedFileName,
}: {
  file: File
  kind: 'image' | 'file'
  buffer: Buffer
  baseName: string
  originalExtension: string
  decodedFileName: string
}) {
  if (kind !== 'image' || !OPTIMIZABLE_IMAGE_TYPES.has(file.type.toLowerCase())) {
    return {
      buffer,
      contentType: file.type || undefined,
      extension: originalExtension,
      fileName: decodedFileName || `${baseName}.${originalExtension}`,
      size: file.size,
    }
  }

  try {
    const optimized = await sharp(buffer, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({
        width: CHAT_IMAGE_MAX_DIMENSION,
        height: CHAT_IMAGE_MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({
        quality: CHAT_IMAGE_QUALITY,
        mozjpeg: true,
      })
      .toBuffer()

    return {
      buffer: optimized,
      contentType: 'image/jpeg',
      extension: 'jpg',
      fileName: `${baseName}.jpg`,
      size: optimized.byteLength,
    }
  } catch {
    return {
      buffer,
      contentType: file.type || undefined,
      extension: originalExtension,
      fileName: decodedFileName || `${baseName}.${originalExtension}`,
      size: file.size,
    }
  }
}

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
  const decodedFileName = decodeFileName(file.name)
  const baseName = sanitizeFilePart(decodedFileName.replace(/\.[^.]+$/, ''))
  const originalExtension = sanitizeFilePart(decodedFileName.split('.').pop() || (kind === 'image' ? 'jpg' : 'bin'))
  const prepared = await prepareUploadPayload({
    file,
    kind,
    buffer,
    baseName,
    originalExtension,
    decodedFileName,
  })
  const objectPath = `${session.user.id}/${kind}/${Date.now()}-${baseName}.${prepared.extension}`

  const { error: uploadError } = await supabaseAdmin.storage
    .from(CHAT_ATTACHMENTS_BUCKET)
    .upload(objectPath, prepared.buffer, { contentType: prepared.contentType, upsert: false })

  if (uploadError) {
    return NextResponse.json(
      { error: 'UPLOAD_FAILED', message: `Failed to upload ${kind}.` },
      { status: 500 }
    )
  }

  const { data: publicUrlData } = supabaseAdmin.storage.from(CHAT_ATTACHMENTS_BUCKET).getPublicUrl(objectPath)
  return NextResponse.json({
    url: publicUrlData.publicUrl,
    fileName: prepared.fileName,
    mimeType: prepared.contentType || (kind === 'image' ? 'image/jpeg' : 'application/octet-stream'),
    size: prepared.size,
    kind,
  })
}
