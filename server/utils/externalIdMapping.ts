import { prisma } from '@/lib/prisma'
import { ExternalEntityType } from '@prisma/client'

/**
 * Get internal ID from external ID
 */
export async function getInternalId(
  partnerId: string,
  entityType: ExternalEntityType,
  externalId: string
): Promise<string | null> {
  const mapping = await prisma.externalIdMapping.findUnique({
    where: {
      partnerId_entityType_externalId: {
        partnerId,
        entityType,
        externalId,
      },
    },
  })

  return mapping?.internalId || null
}

/**
 * Create or update external ID mapping
 */
export async function setExternalIdMapping(
  partnerId: string,
  entityType: ExternalEntityType,
  externalId: string,
  internalId: string
): Promise<void> {
  await prisma.externalIdMapping.upsert({
    where: {
      partnerId_entityType_externalId: {
        partnerId,
        entityType,
        externalId,
      },
    },
    create: {
      partnerId,
      entityType,
      externalId,
      internalId,
    },
    update: {
      internalId, // Update if mapping exists but internal ID changed
    },
  })
}

/**
 * Get external ID from internal ID (reverse lookup)
 */
export async function getExternalId(
  partnerId: string,
  entityType: ExternalEntityType,
  internalId: string
): Promise<string | null> {
  const mapping = await prisma.externalIdMapping.findFirst({
    where: {
      partnerId,
      entityType,
      internalId,
    },
  })

  return mapping?.externalId || null
}

/**
 * Batch get internal IDs
 */
export async function getInternalIds(
  partnerId: string,
  entityType: ExternalEntityType,
  externalIds: string[]
): Promise<Map<string, string>> {
  const mappings = await prisma.externalIdMapping.findMany({
    where: {
      partnerId,
      entityType,
      externalId: { in: externalIds },
    },
  })

  const result = new Map<string, string>()
  for (const mapping of mappings) {
    result.set(mapping.externalId, mapping.internalId)
  }

  return result
}

