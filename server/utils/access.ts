import { TRPCError } from '@trpc/server'
import type { PrismaClient } from '@prisma/client'
import { AccessLevel } from '@prisma/client'

// Re-export for convenience
export { AccessLevel }

export type TournamentAccess = {
  userId: string
  tournamentId: string
  divisionId: string | null
  accessLevel: AccessLevel
}

/**
 * Check if user has access to a tournament
 * Returns the access level if user has access, null otherwise
 */
export async function checkTournamentAccess(
  prisma: PrismaClient,
  userId: string,
  tournamentId: string
): Promise<{ isOwner: boolean; access: TournamentAccess | null }> {
  // Check if user is the owner
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { userId: true },
  })

  if (!tournament) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Tournament not found',
    })
  }

  if (tournament.userId === userId) {
    return { isOwner: true, access: null }
  }

  // Check TournamentAccess
  const access = await prisma.tournamentAccess.findFirst({
    where: {
      userId,
      tournamentId,
    },
  })

  return { isOwner: false, access }
}

/**
 * Check if user has access to a specific division
 * Returns the access level if user has access, null otherwise
 */
export async function checkDivisionAccess(
  prisma: PrismaClient,
  userId: string,
  divisionId: string
): Promise<{ hasAccess: boolean; accessLevel: AccessLevel | null; isOwner: boolean }> {
  // Get division to find tournament
  const division = await prisma.division.findUnique({
    where: { id: divisionId },
    select: { tournamentId: true, tournament: { select: { userId: true } } },
  })

  if (!division) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Division not found',
    })
  }

  // Check if user is tournament owner
  if (division.tournament.userId === userId) {
    return { hasAccess: true, accessLevel: AccessLevel.ADMIN, isOwner: true }
  }

  // Check TournamentAccess for this division or all divisions
  const accesses = await prisma.tournamentAccess.findMany({
    where: {
      userId,
      tournamentId: division.tournamentId,
      OR: [
        { divisionId: null }, // Access to all divisions
        { divisionId }, // Access to this specific division
      ],
    },
  })

  if (accesses.length === 0) {
    return { hasAccess: false, accessLevel: null, isOwner: false }
  }

  // If user has multiple accesses, prioritize ADMIN over SCORE_ONLY
  const hasAdmin = accesses.some((a) => a.accessLevel === AccessLevel.ADMIN)
  return {
    hasAccess: true,
    accessLevel: hasAdmin ? AccessLevel.ADMIN : AccessLevel.SCORE_ONLY,
    isOwner: false,
  }
}

/**
 * Assert that user has admin access to a tournament (owner or ADMIN access)
 */
export async function assertTournamentAdmin(
  prisma: PrismaClient,
  userId: string,
  tournamentId: string
): Promise<void> {
  const { isOwner, access } = await checkTournamentAccess(prisma, userId, tournamentId)

  if (isOwner) {
    return
  }

  if (!access || access.accessLevel !== AccessLevel.ADMIN) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Admin access required',
    })
  }
}

/**
 * Assert that user has admin access to a division (owner or ADMIN access)
 */
export async function assertDivisionAdmin(
  prisma: PrismaClient,
  userId: string,
  divisionId: string
): Promise<void> {
  const { hasAccess, accessLevel, isOwner } = await checkDivisionAccess(
    prisma,
    userId,
    divisionId
  )

  if (!hasAccess || (!isOwner && accessLevel !== AccessLevel.ADMIN)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Admin access required for this division',
    })
  }
}

/**
 * Assert that user has at least score entry access to a division
 */
export async function assertDivisionScoreAccess(
  prisma: PrismaClient,
  userId: string,
  divisionId: string
): Promise<void> {
  const { hasAccess } = await checkDivisionAccess(prisma, userId, divisionId)

  if (!hasAccess) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'No access to this division',
    })
  }
}

/**
 * Get all tournament IDs where user has access (as owner or through TournamentAccess)
 */
export async function getUserTournamentIds(
  prisma: PrismaClient,
  userId: string
): Promise<string[]> {
  // Get tournaments user owns
  const ownedTournaments = await prisma.tournament.findMany({
    where: { userId },
    select: { id: true },
  })

  console.log('[getUserTournamentIds] User ID:', userId)
  console.log('[getUserTournamentIds] Owned tournaments:', ownedTournaments.map(t => t.id))

  // Get tournaments with access
  const accessedTournaments = await prisma.tournamentAccess.findMany({
    where: { userId },
    select: { tournamentId: true },
    distinct: ['tournamentId'],
  })

  console.log('[getUserTournamentIds] Accessed tournaments:', accessedTournaments.map(a => a.tournamentId))

  const allIds = [
    ...ownedTournaments.map((t) => t.id),
    ...accessedTournaments.map((a) => a.tournamentId),
  ]

  const uniqueIds = Array.from(new Set(allIds)) // Remove duplicates
  console.log('[getUserTournamentIds] Final tournament IDs:', uniqueIds)

  return uniqueIds
}

