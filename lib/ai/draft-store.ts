/**
 * Draft store for deep-link prefill.
 *
 * Step 11 of DASHBOARD_AND_ACTION_CENTER_SPEC.md §7.2 + §8.1.
 *
 * When a Business Insight or Operational Signal action button is clicked,
 * the card creates a draft row capturing the prefill payload, then routes
 * the operator to the destination page with `?draftId=<id>`. The page
 * reads the draft and applies the prefill — cohort filters, campaign
 * template, or programming hint — so the operator lands on a screen
 * already populated for the action.
 *
 * Why not URL-encoded filters: complex JSONB shapes (CohortFilter[],
 * ProgrammingPrefill) don't round-trip cleanly through query params,
 * and the URL would carry sensitive partial data in browser history.
 * The draftId pattern keeps URLs compact, attribution traceable via
 * `source_insight_id`, and history clean.
 *
 * Lifecycle: created on click → consumed on page load → kept for 7
 * days for back/forward navigation → expired by daily cleanup cron.
 */

import type { PrismaClient } from '@prisma/client'

// ─── Helpers ────────────────────────────────────────────────────────────

/**
 * Generate a draft id. Short, URL-safe, no DB collision worry.
 */
function newDraftId(prefix: 'co' | 'ca' | 'pg'): string {
  // 24 random base36 chars after the prefix — same cardinality as cuid
  // without the dependency. Collision probability is effectively zero
  // at our scale.
  const rand = Math.random().toString(36).slice(2, 14) +
    Math.random().toString(36).slice(2, 14)
  return `${prefix}_${rand}`
}

// ─── Cohort drafts ──────────────────────────────────────────────────────

/**
 * Filter clause shape — must mirror `cohortFilterSchema` in
 * `server/routers/intelligence.ts` (Spec §5.4). Out-of-band shapes
 * will be rejected when the Cohorts builder tries to apply them.
 */
export interface CohortDraftFilter {
  field: string
  op: 'eq' | 'ne' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in'
  value: string | number | string[]
}

export interface CreateCohortDraftInput {
  clubId: string
  filters: CohortDraftFilter[]
  suggestedName?: string
  sourceInsightId?: string
}

export async function createCohortDraft(
  prisma: PrismaClient,
  input: CreateCohortDraftInput,
): Promise<{ draftId: string }> {
  const id = newDraftId('co')
  await prisma.$executeRawUnsafe(
    `
    INSERT INTO cohort_draft (id, club_id, filters, suggested_name, source_insight_id)
    VALUES ($1, $2::uuid, $3::jsonb, $4, $5)
    `,
    id,
    input.clubId,
    JSON.stringify(input.filters),
    input.suggestedName ?? null,
    input.sourceInsightId ?? null,
  )
  return { draftId: id }
}

export interface CohortDraftRow {
  id: string
  clubId: string
  filters: CohortDraftFilter[]
  suggestedName: string | null
  sourceInsightId: string | null
  createdAt: Date
  expiresAt: Date
}

export async function getCohortDraft(
  prisma: PrismaClient,
  draftId: string,
): Promise<CohortDraftRow | null> {
  const rows = (await prisma.$queryRawUnsafe(
    `
    SELECT id,
           club_id          AS "clubId",
           filters,
           suggested_name   AS "suggestedName",
           source_insight_id AS "sourceInsightId",
           created_at       AS "createdAt",
           expires_at       AS "expiresAt"
    FROM cohort_draft
    WHERE id = $1
      AND expires_at > NOW()
    `,
    draftId,
  )) as Array<CohortDraftRow>
  return rows[0] ?? null
}

// ─── Campaign drafts ────────────────────────────────────────────────────

export interface CreateCampaignDraftInput {
  clubId: string
  templateKey: string
  cohortRef?: string
  channelMix?: Record<string, unknown>
  sourceInsightId?: string
}

export async function createCampaignDraft(
  prisma: PrismaClient,
  input: CreateCampaignDraftInput,
): Promise<{ draftId: string }> {
  const id = newDraftId('ca')
  await prisma.$executeRawUnsafe(
    `
    INSERT INTO campaign_draft (id, club_id, template_key, cohort_ref, channel_mix, source_insight_id)
    VALUES ($1, $2::uuid, $3, $4, $5::jsonb, $6)
    `,
    id,
    input.clubId,
    input.templateKey,
    input.cohortRef ?? null,
    input.channelMix ? JSON.stringify(input.channelMix) : null,
    input.sourceInsightId ?? null,
  )
  return { draftId: id }
}

export interface CampaignDraftRow {
  id: string
  clubId: string
  templateKey: string
  cohortRef: string | null
  channelMix: Record<string, unknown> | null
  sourceInsightId: string | null
  createdAt: Date
  expiresAt: Date
}

export async function getCampaignDraft(
  prisma: PrismaClient,
  draftId: string,
): Promise<CampaignDraftRow | null> {
  const rows = (await prisma.$queryRawUnsafe(
    `
    SELECT id,
           club_id          AS "clubId",
           template_key     AS "templateKey",
           cohort_ref       AS "cohortRef",
           channel_mix      AS "channelMix",
           source_insight_id AS "sourceInsightId",
           created_at       AS "createdAt",
           expires_at       AS "expiresAt"
    FROM campaign_draft
    WHERE id = $1
      AND expires_at > NOW()
    `,
    draftId,
  )) as Array<CampaignDraftRow>
  return rows[0] ?? null
}

// ─── Programming drafts ─────────────────────────────────────────────────

export type ProgrammingDraftPrefill = Record<string, unknown>

export interface CreateProgrammingDraftInput {
  clubId: string
  prefill: ProgrammingDraftPrefill
  sourceInsightId?: string
}

export async function createProgrammingDraft(
  prisma: PrismaClient,
  input: CreateProgrammingDraftInput,
): Promise<{ draftId: string }> {
  const id = newDraftId('pg')
  await prisma.$executeRawUnsafe(
    `
    INSERT INTO programming_draft (id, club_id, prefill, source_insight_id)
    VALUES ($1, $2::uuid, $3::jsonb, $4)
    `,
    id,
    input.clubId,
    JSON.stringify(input.prefill),
    input.sourceInsightId ?? null,
  )
  return { draftId: id }
}

export interface ProgrammingDraftRow {
  id: string
  clubId: string
  prefill: ProgrammingDraftPrefill
  sourceInsightId: string | null
  createdAt: Date
  expiresAt: Date
}

export async function getProgrammingDraft(
  prisma: PrismaClient,
  draftId: string,
): Promise<ProgrammingDraftRow | null> {
  const rows = (await prisma.$queryRawUnsafe(
    `
    SELECT id,
           club_id          AS "clubId",
           prefill,
           source_insight_id AS "sourceInsightId",
           created_at       AS "createdAt",
           expires_at       AS "expiresAt"
    FROM programming_draft
    WHERE id = $1
      AND expires_at > NOW()
    `,
    draftId,
  )) as Array<ProgrammingDraftRow>
  return rows[0] ?? null
}

// ─── Cleanup ────────────────────────────────────────────────────────────

/**
 * Sweep expired draft rows across all three tables. Called by the daily
 * cleanup cron — see app/api/cron/draft-cleanup/route.ts.
 *
 * Returns per-table counts so the cron log can show what was reaped.
 */
export async function cleanupExpiredDrafts(
  prisma: PrismaClient,
): Promise<{ cohort: number; campaign: number; programming: number }> {
  const cohort = await prisma.$executeRawUnsafe(
    `DELETE FROM cohort_draft WHERE expires_at < NOW()`,
  )
  const campaign = await prisma.$executeRawUnsafe(
    `DELETE FROM campaign_draft WHERE expires_at < NOW()`,
  )
  const programming = await prisma.$executeRawUnsafe(
    `DELETE FROM programming_draft WHERE expires_at < NOW()`,
  )
  return {
    cohort: Number(cohort) || 0,
    campaign: Number(campaign) || 0,
    programming: Number(programming) || 0,
  }
}
