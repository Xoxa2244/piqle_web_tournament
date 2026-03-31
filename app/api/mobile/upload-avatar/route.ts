import { NextRequest, NextResponse } from 'next/server'

import { getSessionFromMobileToken } from '@/lib/mobileAuth'
import { supabaseAdmin } from '@/lib/supabase'

const getBearerToken = (req: NextRequest) => {
  const header = req.headers.get('authorization') || req.headers.get('Authorization')
  if (!header) return null
  const [scheme, token] = header.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null
  return token.trim()
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
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'BAD_REQUEST', message: 'No file provided.' }, { status: 400 })
  }
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'BAD_REQUEST', message: 'File must be an image.' }, { status: 400 })
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json(
      { error: 'BAD_REQUEST', message: 'File size must be less than 5MB.' },
      { status: 400 }
    )
  }

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const extension = file.name.split('.').pop() || 'jpg'
  const fileName = `${session.user.id}-${Date.now()}.${extension}`

  const { error: uploadError } = await supabaseAdmin.storage
    .from('avatars')
    .upload(fileName, buffer, { contentType: file.type, upsert: false })

  if (uploadError) {
    return NextResponse.json({ error: 'UPLOAD_FAILED', message: 'Failed to upload avatar.' }, { status: 500 })
  }

  const { data: publicUrlData } = supabaseAdmin.storage.from('avatars').getPublicUrl(fileName)
  return NextResponse.json({ url: publicUrlData.publicUrl })
}

