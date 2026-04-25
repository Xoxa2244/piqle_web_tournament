import { z } from 'zod'
import {
  resolveAdvisorSandboxRouting,
  advisorSandboxRoutingSettingsSchema,
} from './advisor-sandbox-routing'

export const advisorSandboxRoutingDraftSchema = advisorSandboxRoutingSettingsSchema.extend({
  changes: z.array(z.string().min(1).max(180)).max(8).default([]),
})

export type AdvisorSandboxRoutingDraft = z.infer<typeof advisorSandboxRoutingDraftSchema>

function containsAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text))
}

function dedupe(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean),
    ),
  )
}

function normalizePhone(raw: string) {
  const trimmed = raw.trim()
  const normalized = trimmed.replace(/[^\d+]/g, '')
  if (!normalized) return null
  if (!/^\+?\d{7,15}$/.test(normalized)) return null
  return normalized
}

function extractEmails(message: string) {
  return dedupe(message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).slice(0, 10)
}

function extractPhones(message: string) {
  const matches = message.match(/(?:\+\d[\d\s().-]{6,}\d|\b\d[\d\s().-]{7,}\d\b)/g) || []
  return dedupe(matches.map(normalizePhone)).slice(0, 10)
}

function buildPolicyChanges(previous: AdvisorSandboxRoutingDraft, next: AdvisorSandboxRoutingDraft) {
  const changes: string[] = []

  if (previous.mode !== next.mode) {
    changes.push(`Sandbox mode: ${next.mode === 'preview_only' ? 'Preview only' : 'Route to test recipients'}`)
  }

  if (JSON.stringify(previous.emailRecipients) !== JSON.stringify(next.emailRecipients)) {
    changes.push(
      next.emailRecipients.length > 0
        ? `Email test recipients: ${next.emailRecipients.join(', ')}`
        : 'Email test recipients cleared',
    )
  }

  if (JSON.stringify(previous.smsRecipients) !== JSON.stringify(next.smsRecipients)) {
    changes.push(
      next.smsRecipients.length > 0
        ? `SMS test recipients: ${next.smsRecipients.join(', ')}`
        : 'SMS test recipients cleared',
    )
  }

  return changes.slice(0, 8)
}

function shouldMergeRecipients(message: string) {
  const lower = message.toLowerCase()
  return containsAny(lower, [
    /\b(add|also|include|plus|append|another)\b/,
    /\b(добавь|еще|ещё|также|плюс)\b/,
    /\b(agrega|añade|también|además)\b/,
  ])
}

function wantsClearAll(message: string) {
  const lower = message.toLowerCase()
  return containsAny(lower, [
    /\b(clear|remove|delete|reset)\s+(all\s+)?(sandbox|test)\s+recipients\b/,
    /\b(no test recipients|no sandbox recipients)\b/,
    /\b(очисти|убери|сбрось)\s+(всех\s+)?(test|sandbox)\s+получател\w+\b/,
    /\b(sin destinatarios de prueba|borra todos los destinatarios de prueba)\b/,
  ])
}

function wantsClearEmailRecipients(message: string) {
  const lower = message.toLowerCase()
  return containsAny(lower, [
    /\b(clear|remove|delete)\s+(all\s+)?(email|mail)\s+test recipients\b/,
    /\bno\s+(email|mail)\s+test recipients\b/,
    /\b(очисти|убери)\s+email\s+test\b/,
    /\b(sin destinatarios de prueba por email|borra los destinatarios de email)\b/,
  ])
}

function wantsClearSmsRecipients(message: string) {
  const lower = message.toLowerCase()
  return containsAny(lower, [
    /\b(clear|remove|delete)\s+(all\s+)?(sms|text|phone)\s+test recipients\b/,
    /\bno\s+(sms|text)\s+test recipients\b/,
    /\b(очисти|убери)\s+(sms|смс)\s+test\b/,
    /\b(sin destinatarios de prueba por sms|borra los destinatarios de sms)\b/,
  ])
}

function parseSandboxMode(message: string): AdvisorSandboxRoutingDraft['mode'] | null {
  const lower = message.toLowerCase()

  if (containsAny(lower, [
    /\b(preview only|preview mode|preview inbox only|just preview|do not route)\b/,
    /\b(только preview|режим preview|только превью|без routing|не маршрутизируй)\b/,
    /\b(solo preview|modo preview|solo vista previa)\b/,
  ])) {
    return 'preview_only'
  }

  if (containsAny(lower, [
    /\b(test recipients?|route sandbox|sandbox routing|whitelist|qa recipients?)\b/,
    /\b(тестов\w+\s+получател\w+|sandbox routing|маршрутиз\w+ sandbox|whitelist)\b/,
    /\b(destinatarios de prueba|sandbox routing|whitelist)\b/,
  ])) {
    return 'test_recipients'
  }

  return null
}

export function resolveAdvisorSandboxRoutingDraft(automationSettings?: unknown): AdvisorSandboxRoutingDraft {
  return {
    ...resolveAdvisorSandboxRouting(automationSettings),
    changes: [],
  }
}

export function formatAdvisorSandboxRoutingDigest(policy: AdvisorSandboxRoutingDraft) {
  const emailPart = `${policy.emailRecipients.length} email test${policy.emailRecipients.length === 1 ? '' : 's'}`
  const smsPart = `${policy.smsRecipients.length} SMS test${policy.smsRecipients.length === 1 ? '' : 's'}`

  return policy.mode === 'preview_only'
    ? 'Preview only · live delivery stays locked'
    : `Test recipients · ${emailPart} · ${smsPart}`
}

export function isAdvisorSandboxRoutingRequest(message: string) {
  const lower = message.toLowerCase()
  const mentionsSandbox = containsAny(lower, [
    /\b(sandbox|preview inbox|preview mode|test recipients?|whitelist|qa recipients?)\b/,
    /\b(preview only|route sandbox)\b/,
    /\b(sandbox|превью|preview|тестов\w+\s+получател\w+|whitelist)\b/,
    /\b(destinatarios de prueba|sandbox|vista previa|whitelist)\b/,
  ]) || extractEmails(message).length > 0

  const wantsChange = containsAny(lower, [
    /\b(set|change|update|use|route|send|add|remove|clear|switch|keep)\b/,
    /\b(поставь|измени|обнови|используй|маршрутиз\w+|добавь|убери|очисти|оставь)\b/,
    /\b(usa|cambia|actualiza|agrega|borra|mantén|enruta)\b/,
  ])

  return mentionsSandbox && wantsChange
}

export function updateAdvisorSandboxRoutingFromMessage(opts: {
  message: string
  currentPolicy: AdvisorSandboxRoutingDraft
  allowImplicit?: boolean
}) {
  const { message, currentPolicy, allowImplicit = false } = opts
  if (!allowImplicit && !isAdvisorSandboxRoutingRequest(message)) return null

  const next: AdvisorSandboxRoutingDraft = {
    ...currentPolicy,
    emailRecipients: [...currentPolicy.emailRecipients],
    smsRecipients: [...currentPolicy.smsRecipients],
    changes: [],
  }
  let changed = false

  const mode = parseSandboxMode(message)
  if (mode && next.mode !== mode) {
    next.mode = mode
    changed = true
  }

  if (wantsClearAll(message)) {
    if (next.emailRecipients.length > 0 || next.smsRecipients.length > 0) {
      next.emailRecipients = []
      next.smsRecipients = []
      changed = true
    }
  } else {
    if (wantsClearEmailRecipients(message) && next.emailRecipients.length > 0) {
      next.emailRecipients = []
      changed = true
    }

    if (wantsClearSmsRecipients(message) && next.smsRecipients.length > 0) {
      next.smsRecipients = []
      changed = true
    }
  }

  const mergeRecipients = shouldMergeRecipients(message)
  const emails = extractEmails(message)
  if (emails.length > 0) {
    const nextEmails = mergeRecipients
      ? dedupe([...next.emailRecipients, ...emails]).slice(0, 10)
      : emails
    if (JSON.stringify(nextEmails) !== JSON.stringify(next.emailRecipients)) {
      next.emailRecipients = nextEmails
      changed = true
    }
  }

  const phones = extractPhones(message)
  if (phones.length > 0) {
    const nextPhones = mergeRecipients
      ? dedupe([...next.smsRecipients, ...phones]).slice(0, 10)
      : phones
    if (JSON.stringify(nextPhones) !== JSON.stringify(next.smsRecipients)) {
      next.smsRecipients = nextPhones
      changed = true
    }
  }

  if (!changed) return null

  const parsed = advisorSandboxRoutingDraftSchema.safeParse(next)
  if (!parsed.success) return null

  const normalized = parsed.data
  normalized.changes = buildPolicyChanges(currentPolicy, normalized)
  if (normalized.changes.length === 0) return null
  return normalized
}
