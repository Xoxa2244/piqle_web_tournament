import 'server-only'

import { z } from 'zod'
import { generateWithFallback } from '@/lib/ai/llm/provider'
import type { SupportedLanguage } from '@/lib/ai/llm/language'
import { advisorActionSchema, cohortFilterSchema, type AdvisorAction } from './advisor-actions'
import type { AdvisorConversationState } from './advisor-conversation-state'

const advisorEditResultSchema = z.object({
  handled: z.boolean(),
  action: advisorActionSchema.optional(),
})

type AudienceFilter = z.infer<typeof cohortFilterSchema>

function cleanJson(text: string) {
  return text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
}

function containsAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text))
}

function truncateText(text: string, maxChars: number) {
  const trimmed = text.trim()
  if (trimmed.length <= maxChars) return trimmed

  const sentences = trimmed.split(/(?<=[.!?])\s+/)
  let output = ''
  for (const sentence of sentences) {
    const next = output ? `${output} ${sentence}` : sentence
    if (next.length > maxChars) break
    output = next
  }

  if (output) return output
  return `${trimmed.slice(0, Math.max(0, maxChars - 1)).trim()}…`
}

function replaceFilter(filters: AudienceFilter[], nextFilter: AudienceFilter) {
  return [...filters.filter((filter) => filter.field !== nextFilter.field), nextFilter]
}

function isLikelyEditRequest(message: string, state: AdvisorConversationState | null) {
  if (!state?.currentAudience && !state?.currentCampaign) return false

  const lower = message.toLowerCase()
  const explicitEdit = containsAny(lower, [
    /\b(edit|change|update|revise|rewrite|adjust|refine|switch|make)\b/,
    /\b(shorter|shorten|longer|long-form|concise|brief)\b/,
    /\b(subject|body|copy|tone|message|campaign|email|sms)\b/,
    /\b(exclude|include|remove|add|only|filter|narrow|broaden)\b/,
  ]) || containsAny(lower, [
    /\b(короче|длиннее|измени|исправь|обнови|убери|добавь|оставь|только)\b/,
    /\b(mas corto|más corto|actualiza|edita|cambia|quita|solo)\b/,
  ])

  const pronounEdit = containsAny(lower, [
    /\b(it|them|that|this)\b/,
    /\b(его|ее|её|их|это|эту|этот)\b/,
    /\b(eso|esa|ese|ellos|ellas)\b/,
  ])

  return explicitEdit || pronounEdit
}

function applyHeuristicAudienceEdit(message: string, state: AdvisorConversationState): AdvisorAction | null {
  if (!state.currentAudience) return null
  const lower = message.toLowerCase()
  let audience = { ...state.currentAudience, filters: [...state.currentAudience.filters] }
  let changed = false

  if (containsAny(lower, [/\b(active this week|played this week|recently active)\b/, /\b(играл[аи] на этой неделе|активн\w+ на этой неделе)\b/])) {
    audience = {
      ...audience,
      name: `${audience.name} (excluding recent players)`,
      filters: replaceFilter(audience.filters as any, { field: 'recency', op: 'gt', value: 7 }),
    }
    changed = true
  }

  if (containsAny(lower, [/\b(inactive members|inactive players)\b/, /\b(неактивн\w+ игроков?|неактивн\w+ участников?)\b/])) {
    audience = {
      ...audience,
      name: `${audience.name} (inactive)`,
      filters: replaceFilter(audience.filters as any, { field: 'recency', op: 'gte', value: 14 }),
    }
    changed = true
  }

  if (containsAny(lower, [/\b(women|female)\b/, /\b(женщин|женские)\b/])) {
    audience = {
      ...audience,
      name: `${audience.name} - Women`,
      filters: replaceFilter(audience.filters as any, { field: 'gender', op: 'eq', value: 'F' }),
    }
    changed = true
  }

  if (containsAny(lower, [/\b(men|male)\b/, /\b(мужчин|мужские)\b/])) {
    audience = {
      ...audience,
      name: `${audience.name} - Men`,
      filters: replaceFilter(audience.filters as any, { field: 'gender', op: 'eq', value: 'M' }),
    }
    changed = true
  }

  const agePlus = lower.match(/\b(\d{2})\+\b/)
  if (agePlus) {
    audience = {
      ...audience,
      name: `${audience.name} ${agePlus[1]}+`,
      filters: replaceFilter(audience.filters as any, { field: 'age', op: 'gte', value: Number(agePlus[1]) }),
    }
    changed = true
  }

  if (!changed) return null

  if (state.currentCampaign) {
    return {
      kind: 'create_campaign',
      title: `Update campaign audience: ${audience.name}`,
      summary: `${state.currentCampaign.channel.toUpperCase()} outreach for ${audience.count || state.currentCampaign.audienceCount || 0} members`,
      requiresApproval: true,
      audience,
      campaign: {
        type: state.currentCampaign.type,
        channel: state.currentCampaign.channel,
        subject: state.currentCampaign.subject,
        body: state.currentCampaign.body,
        smsBody: state.currentCampaign.smsBody,
      },
    }
  }

  return {
    kind: 'create_cohort',
    title: `Update audience: ${audience.name}`,
    summary: `${audience.count || 0} matching members`,
    requiresApproval: true,
    cohort: audience,
  }
}

function applyHeuristicCampaignEdit(message: string, state: AdvisorConversationState): AdvisorAction | null {
  if (!state.currentCampaign || !state.currentAudience) return null

  const lower = message.toLowerCase()
  let campaign = { ...state.currentCampaign }
  let changed = false

  if (containsAny(lower, [/\b(sms only|text only)\b/, /\b(только sms|только смс)\b/])) {
    campaign.channel = 'sms'
    campaign.smsBody = truncateText(campaign.smsBody || campaign.body, 160)
    changed = true
  } else if (containsAny(lower, [/\b(email only)\b/, /\b(только email|только имейл|только емейл)\b/])) {
    campaign.channel = 'email'
    changed = true
  } else if (containsAny(lower, [/\b(both channels|email and sms|both)\b/, /\b(и email и sms|оба канала)\b/])) {
    campaign.channel = 'both'
    campaign.smsBody = campaign.smsBody || truncateText(campaign.body, 160)
    changed = true
  }

  if (containsAny(lower, [/\b(shorter|shorten|more concise|brief)\b/, /\b(короче|сократи|более коротк)\b/])) {
    campaign.body = truncateText(campaign.body, 320)
    if (campaign.smsBody) campaign.smsBody = truncateText(campaign.smsBody, 140)
    if (campaign.subject) campaign.subject = truncateText(campaign.subject, 60)
    changed = true
  }

  if (!changed) return null

  return {
    kind: 'create_campaign',
    title: `Update campaign draft: ${state.currentAudience.name}`,
    summary: `${campaign.channel.toUpperCase()} outreach for ${state.currentAudience.count || state.currentCampaign.audienceCount || 0} members`,
    requiresApproval: true,
    audience: state.currentAudience,
    campaign: {
      type: campaign.type,
      channel: campaign.channel,
      subject: campaign.subject,
      body: campaign.body,
      smsBody: campaign.smsBody,
    },
  }
}

const EDITOR_SYSTEM = `You revise the active working draft inside IQSport's AI Advisor.

Return ONLY valid JSON:
{"handled":true|false,"action":{...}}

Rules:
- Use the current audience and current campaign provided in the prompt.
- If the user is revising the message, channel, subject, or delivery settings, return a create_campaign action.
- If the user is refining the audience and there is an active campaign, return a create_campaign action with the UPDATED audience and the EXISTING campaign unless the user also asks to rewrite the campaign.
- If the user is refining the audience and there is no active campaign, return a create_cohort action.
- Preserve unrelated fields unless the user explicitly changes them.
- Keep requiresApproval=true.
- Use only these audience filter fields: age, gender, membershipType, membershipStatus, skillLevel, city, zipCode, duprRating, recency, frequency, sessionFormat, dayOfWeek.
- For "exclude people who played this week", use recency gt 7.
- For "inactive members", use recency gte 14 unless the user gave a different threshold.
- For "SMS only", set channel=sms and provide smsBody.
- For "email only", set channel=email.
- For "both", set channel=both.
- If this is not clearly an edit of the active draft, return {"handled":false}.`

const EDIT_COPY: Record<'en' | 'ru' | 'es', {
  audienceUpdated: (name: string, count: number) => string
  campaignUpdated: (name: string, count: number) => string
  suggestions: Record<'create_cohort' | 'create_campaign', string[]>
}> = {
  en: {
    audienceUpdated: (name, count) => `I updated the active audience "${name}" and it now targets ${count} matching members. Review the draft below and approve when you're ready.`,
    campaignUpdated: (name, count) => `I updated the active campaign for the audience "${name}" with ${count} matching members. Review the revised draft below and approve when you're ready.`,
    suggestions: {
      create_cohort: [
        'Draft a campaign for this audience',
        'Exclude members active this week',
        'Show me this audience again',
      ],
      create_campaign: [
        'Make it shorter',
        'Switch to SMS only',
        'Exclude members active this week',
      ],
    },
  },
  ru: {
    audienceUpdated: (name, count) => `Я обновил активную аудиторию "${name}". Сейчас в ней ${count} подходящих участников. Проверь черновик ниже и подтверди, когда будешь готов.`,
    campaignUpdated: (name, count) => `Я обновил активную кампанию для аудитории "${name}" на ${count} участников. Проверь обновленный черновик ниже и подтверди отправку.`,
    suggestions: {
      create_cohort: [
        'Подготовь кампанию для этой аудитории',
        'Убери тех, кто играл на этой неделе',
        'Снова покажи эту аудиторию',
      ],
      create_campaign: [
        'Сделай текст короче',
        'Переключи только на SMS',
        'Убери тех, кто играл на этой неделе',
      ],
    },
  },
  es: {
    audienceUpdated: (name, count) => `Actualicé la audiencia activa "${name}" y ahora apunta a ${count} miembros. Revisa el borrador abajo y apruébalo cuando quieras.`,
    campaignUpdated: (name, count) => `Actualicé la campaña activa para la audiencia "${name}" con ${count} miembros. Revisa el borrador actualizado abajo y apruébalo cuando quieras.`,
    suggestions: {
      create_cohort: [
        'Prepara una campaña para esta audiencia',
        'Excluye a quienes jugaron esta semana',
        'Muéstrame esta audiencia otra vez',
      ],
      create_campaign: [
        'Hazlo más corto',
        'Cámbialo a solo SMS',
        'Excluye a quienes jugaron esta semana',
      ],
    },
  },
}

export function getAdvisorEditCopy(language: SupportedLanguage | string) {
  const locale = language === 'ru' || language === 'es' ? language : 'en'
  return EDIT_COPY[locale]
}

export async function maybeEditAdvisorDraft(opts: {
  message: string
  state: AdvisorConversationState | null
}): Promise<AdvisorAction | null> {
  const { message, state } = opts
  if (!isLikelyEditRequest(message, state)) return null
  if (!state?.currentAudience && !state?.currentCampaign) return null

  const heuristicAudienceEdit = applyHeuristicAudienceEdit(message, state)
  if (heuristicAudienceEdit) return heuristicAudienceEdit

  const heuristicCampaignEdit = applyHeuristicCampaignEdit(message, state)
  if (heuristicCampaignEdit) return heuristicCampaignEdit

  try {
    const result = await generateWithFallback({
      system: EDITOR_SYSTEM,
      prompt: JSON.stringify({
        userRequest: message,
        currentAudience: state.currentAudience || null,
        currentCampaign: state.currentCampaign || null,
        lastActionKind: state.lastActionKind || null,
      }),
      tier: 'fast',
      maxTokens: 1400,
    })

    const parsed = advisorEditResultSchema.safeParse(JSON.parse(cleanJson(result.text)))
    if (!parsed.success) return null
    if (!parsed.data.handled || !parsed.data.action) return null
    return parsed.data.action
  } catch {
    return null
  }
}
