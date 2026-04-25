import { z } from 'zod'
import { getOutreachBypassReason, isOutreachBypassClubId } from './outreach-club-bypass'

export const advisorSandboxRoutingModeEnum = z.enum(['preview_only', 'test_recipients'])

export const advisorSandboxRoutingSettingsSchema = z.object({
  mode: advisorSandboxRoutingModeEnum.default('preview_only'),
  emailRecipients: z.array(z.string().email()).max(10).default([]),
  smsRecipients: z.array(z.string().min(3).max(40)).max(10).default([]),
})

export const advisorSandboxRoutingSummarySchema = z.object({
  mode: advisorSandboxRoutingModeEnum,
  configuredMode: advisorSandboxRoutingModeEnum,
  emailRecipients: z.array(z.string().email()).max(10).default([]),
  smsRecipients: z.array(z.string().min(3).max(40)).max(10).default([]),
  label: z.string().min(1).max(120),
  note: z.string().min(1).max(240),
})

export type AdvisorSandboxRoutingSettings = z.infer<typeof advisorSandboxRoutingSettingsSchema>
export type AdvisorSandboxRoutingSummary = z.infer<typeof advisorSandboxRoutingSummarySchema>
export type AdvisorSandboxChannel = 'email' | 'sms' | 'both'

function dedupeStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean),
    ),
  )
}

function getSandboxRoutingSource(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const record = input as Record<string, unknown>
  const intelligence =
    record.intelligence && typeof record.intelligence === 'object' && !Array.isArray(record.intelligence)
      ? (record.intelligence as Record<string, unknown>)
      : null

  if (intelligence?.sandboxRouting) return intelligence.sandboxRouting
  if (record.sandboxRouting) return record.sandboxRouting
  return null
}

export function resolveAdvisorSandboxRouting(input: unknown): AdvisorSandboxRoutingSettings {
  const parsed = advisorSandboxRoutingSettingsSchema.safeParse(getSandboxRoutingSource(input) ?? input ?? {})
  if (parsed.success) {
    return {
      ...parsed.data,
      emailRecipients: dedupeStrings(parsed.data.emailRecipients),
      smsRecipients: dedupeStrings(parsed.data.smsRecipients),
    }
  }

  return {
    mode: 'preview_only',
    emailRecipients: [],
    smsRecipients: [],
  }
}

export function buildAdvisorSandboxRoutingSummary(opts: {
  settings?: unknown
  channel: AdvisorSandboxChannel
  clubId?: string | null
}): AdvisorSandboxRoutingSummary {
  if (isOutreachBypassClubId(opts.clubId)) {
    return {
      mode: 'test_recipients',
      configuredMode: 'test_recipients',
      emailRecipients: [],
      smsRecipients: [],
      label: 'Live delivery unlocked',
      note: getOutreachBypassReason(opts.clubId) || 'QA outreach bypass is enabled for this club.',
    }
  }

  const routing = resolveAdvisorSandboxRouting(opts.settings)
  const emailRecipients = opts.channel === 'sms' ? [] : routing.emailRecipients
  const smsRecipients = opts.channel === 'email' ? [] : routing.smsRecipients
  const hasTargets = emailRecipients.length > 0 || smsRecipients.length > 0
  const effectiveMode = routing.mode === 'test_recipients' && hasTargets ? 'test_recipients' : 'preview_only'

  if (effectiveMode === 'test_recipients') {
    const destinationParts = [
      emailRecipients.length > 0 ? `${emailRecipients.length} email test recipient${emailRecipients.length === 1 ? '' : 's'}` : null,
      smsRecipients.length > 0 ? `${smsRecipients.length} SMS test recipient${smsRecipients.length === 1 ? '' : 's'}` : null,
    ].filter(Boolean)

    return {
      mode: effectiveMode,
      configuredMode: routing.mode,
      emailRecipients,
      smsRecipients,
      label: `Test recipients · ${destinationParts.join(' + ')}`,
      note: 'Live members stay protected. Sandbox runs can be routed only to approved test recipients.',
    }
  }

  if (routing.mode === 'test_recipients') {
    return {
      mode: effectiveMode,
      configuredMode: routing.mode,
      emailRecipients: [],
      smsRecipients: [],
      label: 'Preview only · test recipients needed',
      note: 'Sandbox is armed for test routing, but no approved recipient exists for this channel yet.',
    }
  }

  return {
    mode: 'preview_only',
    configuredMode: routing.mode,
    emailRecipients: [],
    smsRecipients: [],
    label: 'Preview only',
    note: 'Live delivery stays locked. Sandbox runs create a preview inbox entry without contacting members.',
  }
}
