import { prisma } from '@/lib/prisma'

/**
 * Validate that a partner has an active binding to a club.
 * Returns the clubId if valid, throws if not.
 */
export async function validatePartnerClubAccess(
  partnerId: string,
  clubId: string
): Promise<string> {
  const binding = await prisma.partnerClubBinding.findUnique({
    where: {
      partnerId_clubId: {
        partnerId,
        clubId,
      },
    },
  })

  if (!binding || !binding.isActive) {
    throw Object.assign(
      new Error(`Partner does not have access to club ${clubId}`),
      { code: 'CLUB_ACCESS_DENIED' }
    )
  }

  return clubId
}

/**
 * Get all active club IDs for a partner
 */
export async function getPartnerClubIds(partnerId: string): Promise<string[]> {
  const bindings = await prisma.partnerClubBinding.findMany({
    where: {
      partnerId,
      isActive: true,
    },
    select: { clubId: true },
  })

  return bindings.map((b) => b.clubId)
}
