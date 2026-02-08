import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const SAMPLE_TOURNAMENTS = [
  {
    id: 'sample-1',
    name: 'Spring Pickleball Classic',
    startDate: '2026-05-12T16:00:00.000Z',
    endDate: '2026-05-14T16:00:00.000Z',
    clubName: 'Piqle Athletics Club',
    address: '701 Mission St, San Francisco, CA 94103, USA',
  },
  {
    id: 'sample-2',
    name: 'Midwest Open',
    startDate: '2026-04-22T14:30:00.000Z',
    endDate: '2026-04-23T14:30:00.000Z',
    clubName: 'Chicago Pickleball Center',
    address: '300 N State St, Chicago, IL 60654, USA',
  },
  {
    id: 'sample-3',
    name: 'East Coast Invitational',
    startDate: '2026-06-03T13:00:00.000Z',
    endDate: '2026-06-05T13:00:00.000Z',
    clubName: 'Brooklyn Piqle Hub',
    address: '30 Rockefeller Plaza, New York, NY 10112, USA',
  },
]

export async function GET() {
  const tournaments = await prisma.tournament.findMany({
    where: {
      venueAddress: {
        not: null,
      },
    },
    select: {
      id: true,
      title: true,
      startDate: true,
      endDate: true,
      venueName: true,
      venueAddress: true,
      publicSlug: true,
    },
    orderBy: { startDate: 'asc' },
  })

  const normalized = tournaments
    .filter((tournament) => tournament.venueAddress?.trim())
    .map((tournament) => ({
      id: tournament.id,
      name: tournament.title,
      startDate: tournament.startDate.toISOString(),
      endDate: tournament.endDate?.toISOString(),
      clubName: tournament.venueName ?? 'Tournament Club',
      address: tournament.venueAddress as string,
      publicSlug: tournament.publicSlug ?? undefined,
    }))

  if (!normalized.length) {
    return NextResponse.json({
      tournaments: SAMPLE_TOURNAMENTS,
      isSample: true,
    })
  }

  return NextResponse.json({
    tournaments: normalized,
    isSample: false,
  })
}
