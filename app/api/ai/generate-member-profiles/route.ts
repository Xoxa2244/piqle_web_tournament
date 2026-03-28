/**
 * Nightly cron: Generate AI member profiles for all clubs.
 * Runs at 3:00 AM UTC via Vercel Cron.
 *
 * Auth: Bearer CRON_SECRET header
 * Schedule: 0 3 * * * (add to vercel.json)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateMemberProfilesForClub } from '@/lib/ai/member-profile-generator'

export const maxDuration = 300 // 5 minutes (Vercel Pro)
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  // Auth check
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const clubId = body.clubId as string | undefined // optional: run for specific club only
  const forceRegenerate = body.forceRegenerate === true

  const startTime = Date.now()
  const results: Array<{ clubId: string; name: string; generated: number; skipped: number; errors: number }> = []

  try {
    // Get clubs to process
    const clubs = clubId
      ? await prisma.club.findMany({ where: { id: clubId }, select: { id: true, name: true } })
      : await prisma.club.findMany({ select: { id: true, name: true } })

    if (clubs.length === 0) {
      return NextResponse.json({ message: 'No clubs found', results: [] })
    }

    console.log(`[MemberAiProfiles] Starting nightly generation for ${clubs.length} club(s)`)

    // Process clubs sequentially to avoid overloading AI API
    for (const club of clubs) {
      try {
        const result = await generateMemberProfilesForClub(prisma, club.id, {
          batchSize: 10,
          delayMs: 300,
          forceRegenerate,
        })
        results.push({ clubId: club.id, name: club.name, ...result })
        console.log(`[MemberAiProfiles] Club "${club.name}": ${result.generated} generated, ${result.skipped} skipped, ${result.errors} errors`)
      } catch (err) {
        console.error(`[MemberAiProfiles] Club "${club.name}" failed:`, err)
        results.push({ clubId: club.id, name: club.name, generated: 0, skipped: 0, errors: -1 })
      }
    }

    const totalGenerated = results.reduce((sum, r) => sum + r.generated, 0)
    const totalErrors = results.reduce((sum, r) => sum + r.errors, 0)
    const durationMs = Date.now() - startTime

    return NextResponse.json({
      success: true,
      clubs: clubs.length,
      totalGenerated,
      totalErrors,
      durationMs,
      results,
    })
  } catch (err) {
    console.error('[MemberAiProfiles] Cron job failed:', err)
    return NextResponse.json(
      { error: 'Internal server error', message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}

// Also support GET for manual trigger from browser/admin panel
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return POST(req)
}
