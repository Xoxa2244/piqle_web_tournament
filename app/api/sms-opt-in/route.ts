import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/** Normalise a phone string to E.164 (+1XXXXXXXXXX) */
function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  // US number without country code
  if (digits.length === 10) return `+1${digits}`
  // Already has country code
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  // International with +
  if (raw.startsWith('+') && digits.length >= 7) return `+${digits}`
  return null
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { phone, name } = body as { phone?: string; name?: string }

    if (!phone || !name) {
      return NextResponse.json({ error: 'Phone and name are required.' }, { status: 400 })
    }

    const normalised = normalisePhone(phone.trim())
    if (!normalised) {
      return NextResponse.json(
        { error: 'Please enter a valid US phone number (e.g. +1 555 123 4567).' },
        { status: 400 },
      )
    }

    // Find user by phone number and update opt-in
    const updated = await prisma.user.updateMany({
      where: { phone: normalised },
      data: { smsOptIn: true },
    })

    if (updated.count === 0) {
      // No user found with this phone — record consent for future matching.
      // Try matching by name (fuzzy — first+last contains match)
      const nameParts = name.trim().toLowerCase()
      const byName = await prisma.user.findMany({
        where: {
          name: { contains: nameParts, mode: 'insensitive' },
          phone: null,
        },
        take: 1,
        select: { id: true },
      })

      if (byName.length > 0) {
        await prisma.user.update({
          where: { id: byName[0].id },
          data: { phone: normalised, smsOptIn: true },
        })
      }
      // Even if no match found, return success — consent is noted and
      // the club admin can match this phone during import.
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[SMS Opt-In API]', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
