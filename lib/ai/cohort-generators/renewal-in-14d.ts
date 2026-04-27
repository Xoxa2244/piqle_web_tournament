/**
 * Cohort: Renewal in 14d (P3-T1).
 *
 * Members whose package/membership expires within the next 14 days.
 * Currently sourced from `document_embeddings` metadata (CSV imports),
 * since `User` itself has no `membershipExpiresAt` field. When proper
 * subscription tracking lands, swap to that table.
 *
 * Returns null when no expiry metadata is available for the club —
 * the registry filters that out, so UI just doesn't show the card.
 */

import type { CohortGenerator } from './index'
import { computeEstImpactCents } from '../attribution'

const FOURTEEN_DAYS_MS = 14 * 86400000

export const generateRenewalIn14d: CohortGenerator = async (clubId, db) => {
  const now = Date.now()

  // Pull member embeddings (csv_import) for this club. Each row's metadata
  // may carry a membership expiry date string; format varies by importer.
  let rows: Array<{ source_id: string; metadata: any }> = []
  try {
    rows = await db.$queryRaw<Array<{ source_id: string; metadata: any }>>`
      SELECT source_id, metadata FROM document_embeddings
      WHERE club_id = ${clubId}
        AND content_type = 'member'
        AND source_table = 'csv_import'
    `
  } catch {
    return null
  }

  if (rows.length === 0) return null

  const userIds: string[] = []
  for (const row of rows) {
    let m: any
    try {
      m = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata
    } catch {
      continue
    }
    const expiresRaw = m?.membershipExpiresAt || m?.expiresAt || m?.membership_expires_at || null
    if (!expiresRaw) continue

    const expiresAt = new Date(expiresRaw)
    if (Number.isNaN(expiresAt.getTime())) continue

    const delta = expiresAt.getTime() - now
    // Within the next 14 days (and not yet expired)
    if (delta > 0 && delta <= FOURTEEN_DAYS_MS) {
      // source_id is typically the userId for member embeddings
      if (typeof row.source_id === 'string' && row.source_id.length > 0) {
        userIds.push(row.source_id)
      }
    }
  }

  if (userIds.length === 0) return null

  // P5-T3: shared formula (lib/ai/attribution.ts → computeEstImpactCents)
  const estImpactCents = computeEstImpactCents({ memberCount: userIds.length, action: 'renewal_reminder' })

  return {
    id: `renewal_in_14d:${clubId}:${new Date().toISOString().slice(0, 10)}`,
    generatorKey: 'renewal_in_14d',
    name: 'Renewal in 14d',
    description: `${userIds.length} member${userIds.length === 1 ? '' : 's'} with packages expiring in the next 2 weeks. A nudge converts.`,
    suggestedAction: 'Renewal nudge',
    suggestedTemplateKey: 'renewal_reminder',
    userIds,
    memberCount: userIds.length,
    estImpactCents,
    emoji: '📅',
  }
}
