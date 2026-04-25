import type { AdvisorAction } from './advisor-actions'

function clampDays(value: number) {
  return Math.max(7, Math.min(365, value))
}

export function parseAdvisorInactivityDays(message: string): number | null {
  const lower = message.toLowerCase()
  const patterns = [
    /\b(?:inactive|inactivity|lapsed|haven't played|have not played|without playing|for|last)\s+(?:for\s+)?(\d{1,3})\s*(?:day|days|d)\b/,
    /\b(\d{1,3})\+\s*(?:day|days|d)\s+(?:inactive|inactivity|lapsed|without playing)\b/,
    /\b(\d{1,3})\s*(?:day|days|d)\s+(?:inactive|inactivity|lapsed|without playing)\b/,
    /\b(?:не играл[аи]?|не играли|неактивн\w*|без игры)\s+(\d{1,3})\s*дн/i,
    /\b(\d{1,3})\s*дн\w*\s+(?:неактивн\w*|без игры|не играл[аи]?)/i,
  ]

  for (const pattern of patterns) {
    const match = lower.match(pattern)
    if (!match) continue
    const value = Number(match[1])
    if (!Number.isInteger(value)) continue
    return clampDays(value)
  }

  return null
}

export function buildAdvisorReactivationLabel(inactivityDays: number) {
  return `${clampDays(inactivityDays)}+ day inactive members`
}

export function getActiveReactivationAction(lastAction: AdvisorAction | null | undefined) {
  return lastAction?.kind === 'reactivate_members' ? lastAction : null
}
