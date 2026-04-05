import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { enrichMemberData } from '@/lib/ai/gender-inference'

// Vercel Cron: monthly member data enrichment (gender + skill level)
// Schedule in vercel.json: { "path": "/api/ai/enrich-members", "schedule": "0 6 1 * *" }
// Runs 1st of every month at 6 AM UTC

export const maxDuration = 300 // 5 min — LLM batches take time

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get all clubs with connectors (active clubs)
    const clubs = await prisma.club.findMany({
      where: {
        connectors: { some: { status: 'connected' } },
      },
      select: { id: true, name: true },
    })

    const results = []

    for (const club of clubs) {
      try {
        const result = await enrichMemberData(club.id)
        results.push({
          clubId: club.id,
          clubName: club.name,
          gender: result.gender.inferred,
          skill: result.skill.inferred,
        })
        console.log(`[Enrich] ${club.name}: gender=${result.gender.inferred}, skill=${result.skill.inferred}`)
      } catch (err: any) {
        console.error(`[Enrich] Failed for ${club.name}:`, err.message)
        results.push({
          clubId: club.id,
          clubName: club.name,
          error: err.message,
        })
      }
    }

    return NextResponse.json({
      success: true,
      clubsProcessed: clubs.length,
      results,
    })
  } catch (err: any) {
    console.error('[Enrich] Cron failed:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
