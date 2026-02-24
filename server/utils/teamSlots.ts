import { PrismaClient, Prisma } from '@prisma/client'

type TeamKind = 'SINGLES_1v1' | 'DOUBLES_2v2' | 'SQUAD_4v4'

// Indy League: no fixed roster limit (use high cap for slot indexing only)
export const INDY_LEAGUE_MAX_ROSTER = 32

export const getTeamSlotCount = (teamKind: TeamKind, tournamentFormat?: string | null) => {
  if (tournamentFormat === 'INDY_LEAGUE' && teamKind === 'SQUAD_4v4') {
    return INDY_LEAGUE_MAX_ROSTER
  }

  switch (teamKind) {
    case 'SINGLES_1v1':
      return 1
    case 'DOUBLES_2v2':
      return 2
    case 'SQUAD_4v4':
      return 4
    default:
      return 2
  }
}

export const normalizeTeamSlots = async (
  prisma: PrismaClient | Prisma.TransactionClient,
  teamId: string,
  slotCount: number
) => {
  const teamPlayers = await prisma.teamPlayer.findMany({
    where: { teamId },
    orderBy: { createdAt: 'asc' },
  })

  const usedSlots = new Set(
    teamPlayers
      .map((tp) => tp.slotIndex)
      .filter((slotIndex): slotIndex is number => slotIndex !== null && slotIndex !== undefined)
  )

  let nextSlot = 0
  for (const teamPlayer of teamPlayers) {
    if (teamPlayer.slotIndex !== null && teamPlayer.slotIndex !== undefined) {
      continue
    }

    while (usedSlots.has(nextSlot) && nextSlot < slotCount) {
      nextSlot += 1
    }

    if (nextSlot >= slotCount) {
      break
    }

    await prisma.teamPlayer.update({
      where: { id: teamPlayer.id },
      data: { slotIndex: nextSlot },
    })

    usedSlots.add(nextSlot)
    nextSlot += 1
  }
}
