import { z } from 'zod'

export const advisorActionRuntimeStateSchema = z.object({
  status: z.enum(['active', 'declined', 'snoozed']).default('active'),
  snoozedUntil: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
})

export type AdvisorActionRuntimeState = z.infer<typeof advisorActionRuntimeStateSchema>

function parseAdvisorActionRuntimeState(value: unknown): AdvisorActionRuntimeState | null {
  const parsed = advisorActionRuntimeStateSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export function getAdvisorActionRuntimeState(
  metadata: unknown,
  now: Date = new Date(),
): AdvisorActionRuntimeState {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return { status: 'active' }
  }

  const record = metadata as Record<string, unknown>
  const state = parseAdvisorActionRuntimeState(record.advisorActionState)
  if (!state) return { status: 'active' }

  if (state.status === 'snoozed' && state.snoozedUntil) {
    const snoozedUntil = new Date(state.snoozedUntil)
    if (!Number.isNaN(snoozedUntil.getTime()) && snoozedUntil.getTime() <= now.getTime()) {
      return { status: 'active', updatedAt: state.updatedAt }
    }
  }

  return state
}

export function isAdvisorActionHidden(metadata: unknown, now: Date = new Date()) {
  return getAdvisorActionRuntimeState(metadata, now).status !== 'active'
}

export function withAdvisorActionRuntimeState(
  metadata: unknown,
  state: AdvisorActionRuntimeState,
) {
  const next =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, unknown>) }
      : {}

  next.advisorActionState = state
  return next
}
