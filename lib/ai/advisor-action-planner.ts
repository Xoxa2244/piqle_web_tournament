import 'server-only'

import { z } from 'zod'
import { generateWithFallback } from '@/lib/ai/llm/provider'
import type { SupportedLanguage } from '@/lib/ai/llm/language'
import { advisorCampaignTypeEnum, advisorChannelEnum, advisorDeliveryModeEnum } from './advisor-actions'
import { containsAdvisorSchedulingIntent } from './advisor-scheduling'

const advisorIntentSchema = z.object({
  action: z.enum(['none', 'create_cohort', 'draft_campaign', 'fill_session']),
  usePreviousCohort: z.boolean().default(false),
  audienceText: z.string().optional(),
  campaignType: advisorCampaignTypeEnum.optional(),
  channel: advisorChannelEnum.optional(),
  deliveryMode: advisorDeliveryModeEnum.optional(),
  candidateLimit: z.number().int().min(1).max(20).optional(),
  sessionId: z.string().optional(),
  scheduledFor: z.string().datetime().optional(),
  timeZone: z.string().optional(),
})

export type AdvisorIntentPlan = z.infer<typeof advisorIntentSchema>

const PLANNER_SYSTEM = `You are an intent planner for IQSport's AI Advisor.
Your job is to recognize whether a user is asking the platform to DO something, not just explain something.

Supported actions:
- create_cohort: create/save an audience or reusable member segment
- draft_campaign: draft or launch a campaign/email/SMS/invite for an audience
- fill_session: choose an underfilled session and invite the best matching players into it
- none: any analytics/support/general question

Return ONLY valid JSON:
{"action":"none|create_cohort|draft_campaign|fill_session","usePreviousCohort":true|false,"audienceText":"...","campaignType":"...","channel":"...","deliveryMode":"save_draft|send_now|send_later","candidateLimit":5}

Rules:
- If the user asks to create/build/save an audience, segment, cohort, group, or list, use create_cohort.
- If the user asks to draft/create/launch/send a campaign, email, outreach, invite, or reactivation message, use draft_campaign.
- If the user asks to fill a specific session, underfilled slot, open spot, or invite players into a session, use fill_session.
- If the user refers to a previous audience with phrases like "that audience", "this segment", "those players", "that list", or "them", set usePreviousCohort=true.
- audienceText should be ONLY the audience description, not the whole request, when you can isolate it.
- campaignType must be one of: CHECK_IN, RETENTION_BOOST, REACTIVATION, SLOT_FILLER, EVENT_INVITE, NEW_MEMBER_WELCOME.
- channel must be one of: email, sms, both.
- deliveryMode must be one of: save_draft, send_now, send_later.
- candidateLimit should be set when the user specifies how many players to invite, like "top 5" or "invite 8 players".
- Default campaignType to REACTIVATION for inactive/win-back/churn language.
- Default campaignType to SLOT_FILLER for fill session / empty slots / invite players to session.
- Default channel to email if unspecified.
- If the user says draft, prepare, save, or don't send yet, use deliveryMode=save_draft.
- If the user says later, schedule, tomorrow, tonight, next Tuesday, or names a future send time, use deliveryMode=send_later.
- If the user says send now, launch now, go ahead, or explicitly wants delivery now, use deliveryMode=send_now.
- If the user asks to create a campaign but does not clearly say send now, default to save_draft.
- If the request is mostly informational, return action=none.`

function cleanJson(text: string) {
  return text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
}

function heuristicPlan(message: string): AdvisorIntentPlan {
  const lower = message.toLowerCase()
  const usePreviousCohort =
    /\b(that|this|those|these)\s+(cohort|segment|audience|group|list|members|players)\b/.test(lower) ||
    /\b(them|that list|this list|that audience|this audience)\b/.test(lower)
  const wantsCampaign = /\b(campaign|email|sms|text|message|outreach|invite|reactivat|win[- ]?back|send|launch|draft|reach out)\b/.test(lower)
  const wantsCohort = /\b(cohort|segment|audience|group|list)\b/.test(lower) && /\b(create|build|make|save|new|draft)\b/.test(lower)
  const wantsSessionFill =
    /\b(fill|slot filler|underfilled|open spots?|empty slots?)\b/.test(lower) &&
    /\b(session|slot|court|today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|beginner|intermediate|advanced|\d{1,2}(:\d{2})?\s*(am|pm))\b/.test(lower)

  let campaignType: z.infer<typeof advisorCampaignTypeEnum> | undefined
  if (/\b(reactivat|win[- ]?back|inactive|churn)\b/.test(lower)) campaignType = 'REACTIVATION'
  else if (/\b(fill|slot|underfilled|open spots?|empty slots?)\b/.test(lower)) campaignType = 'SLOT_FILLER'
  else if (/\bwelcome|new members?\b/.test(lower)) campaignType = 'NEW_MEMBER_WELCOME'
  else if (wantsCampaign) campaignType = 'CHECK_IN'

  let channel: z.infer<typeof advisorChannelEnum> | undefined = 'email'
  if (/\b(email|e-mail)\b/.test(lower) && /\b(sms|text)\b/.test(lower)) channel = 'both'
  else if (/\b(sms|text)\b/.test(lower)) channel = 'sms'

  let deliveryMode: z.infer<typeof advisorDeliveryModeEnum> | undefined = 'save_draft'
  if (/\b(send later|schedule|scheduled|later)\b/.test(lower) || containsAdvisorSchedulingIntent(message)) {
    deliveryMode = 'send_later'
  } else if (/\b(send now|launch now|go ahead|approve and send|deliver now)\b/.test(lower)) {
    deliveryMode = 'send_now'
  } else if (/\b(send it)\b/.test(lower) && !/\b(later|tomorrow|tonight|next)\b/.test(lower)) {
    deliveryMode = 'send_now'
  } else if (/\b(send|launch|reach out|invite)\b/.test(lower) && !/\b(draft|prepare|save|preview)\b/.test(lower)) {
    deliveryMode = 'send_now'
  } else if (/\b(draft|prepare|save|preview|don'?t send|do not send|hold)\b/.test(lower)) {
    deliveryMode = 'save_draft'
  }

  const limitMatch =
    lower.match(/\btop\s+(\d{1,2})\b/) ||
    lower.match(/\bbest\s+(\d{1,2})\b/) ||
    lower.match(/\binvite\s+(\d{1,2})\s+(players?|members?|people)\b/) ||
    lower.match(/\b(\d{1,2})\s+(players?|members?|people)\b/)
  const candidateLimit = limitMatch ? Number(limitMatch[1]) : undefined

  if (wantsCohort) {
    return { action: 'create_cohort', audienceText: message, usePreviousCohort }
  }

  if (wantsSessionFill && !/\b(campaign|draft campaign|email campaign|sms campaign)\b/.test(lower)) {
    return {
      action: 'fill_session',
      usePreviousCohort: false,
      channel,
      candidateLimit,
    }
  }

  if (wantsCampaign) {
    return { action: 'draft_campaign', audienceText: message, usePreviousCohort, campaignType, channel, deliveryMode, candidateLimit }
  }

  return { action: 'none', usePreviousCohort: false }
}

export async function planAdvisorActionIntent(message: string): Promise<AdvisorIntentPlan> {
  const fallback = heuristicPlan(message)

  try {
    const result = await generateWithFallback({
      system: PLANNER_SYSTEM,
      prompt: message,
      tier: 'fast',
      maxTokens: 300,
    })
    const parsed = advisorIntentSchema.safeParse(JSON.parse(cleanJson(result.text)))
    return parsed.success ? parsed.data : fallback
  } catch {
    return fallback
  }
}

const ACTION_COPY: Record<'en' | 'ru' | 'es', {
  audienceReady: (count: number, name: string) => string
  campaignReady: (count: number, name: string) => string
  campaignDraftReady: (count: number, name: string) => string
  campaignScheduledReady: (count: number, name: string, when: string) => string
  fillSessionReady: (count: number, name: string, sessionLabel: string) => string
  fillSessionEmpty: (sessionLabel: string) => string
  adminOnly: string
  suggestions: Record<'create_cohort' | 'create_campaign' | 'fill_session', string[]>
}> = {
  en: {
    audienceReady: (count, name) => `I drafted the audience "${name}" and previewed ${count} matching members. Review it below and approve when you're ready.`,
    campaignReady: (count, name) => `I drafted a campaign for the audience "${name}" with ${count} matching members. Review the audience and message below, then approve to send it.`,
    campaignDraftReady: (count, name) => `I drafted a campaign for the audience "${name}" with ${count} matching members. Review it below, then approve to save it as a draft for later.`,
    campaignScheduledReady: (count, name, when) => `I drafted a campaign for the audience "${name}" with ${count} matching members. Review it below, then approve to schedule delivery for ${when}.`,
    fillSessionReady: (count, name, sessionLabel) => `I picked ${count} strong candidates for ${sessionLabel}. Review the invite below, then approve to message ${name}.`,
    fillSessionEmpty: (sessionLabel) => `I found the right session to fill, but I couldn't find strong invite candidates for ${sessionLabel} yet.`,
    adminOnly: `I can help draft actions here, but only club admins can approve and run them.`,
    suggestions: {
      create_cohort: [
        'Draft a reactivation campaign for this audience',
        'Create an audience of evening players',
        'Show me the most at-risk members',
      ],
      create_campaign: [
        'Create another campaign for competitive players',
        'Build an audience for weekday morning players',
        'Show me inactive members again',
      ],
      fill_session: [
        'Use SMS instead',
        'Invite the top 8 players',
        'Show me another underfilled session',
      ],
    },
  },
  ru: {
    audienceReady: (count, name) => `Я подготовил аудиторию "${name}" и нашел ${count} подходящих участников. Ниже можно все проверить и подтвердить создание.`,
    campaignReady: (count, name) => `Я подготовил кампанию для аудитории "${name}" на ${count} участников. Проверь аудиторию и текст ниже, затем подтверди отправку.`,
    campaignDraftReady: (count, name) => `Я подготовил кампанию для аудитории "${name}" на ${count} участников. Проверь ее ниже и подтверди, чтобы сохранить как черновик.`,
    campaignScheduledReady: (count, name, when) => `Я подготовил кампанию для аудитории "${name}" на ${count} участников. Проверь ее ниже и подтверди, чтобы запланировать отправку на ${when}.`,
    fillSessionReady: (count, name, sessionLabel) => `Я подобрал ${count} сильных кандидатов для ${sessionLabel}. Проверь приглашение ниже и подтверди, чтобы написать ${name}.`,
    fillSessionEmpty: (sessionLabel) => `Я нашел нужную сессию, но пока не вижу сильных кандидатов для приглашения на ${sessionLabel}.`,
    adminOnly: `Я могу готовить такие действия в чате, но запускать их может только админ клуба.`,
    suggestions: {
      create_cohort: [
        'Подготовь реактивационную кампанию для этой аудитории',
        'Создай аудиторию вечерних игроков',
        'Покажи самых рискованных участников',
      ],
      create_campaign: [
        'Сделай еще кампанию для сильных игроков',
        'Создай аудиторию утренних игроков по будням',
        'Снова покажи неактивных участников',
      ],
      fill_session: [
        'Переключи на SMS',
        'Пригласи топ-8 игроков',
        'Покажи другую недозаполненную сессию',
      ],
    },
  },
  es: {
    audienceReady: (count, name) => `Preparé la audiencia "${name}" y encontré ${count} miembros coincidentes. Revísala abajo y apruébala cuando quieras.`,
    campaignReady: (count, name) => `Preparé una campaña para la audiencia "${name}" con ${count} miembros. Revisa la audiencia y el mensaje abajo y luego apruébalo para enviarlo.`,
    campaignDraftReady: (count, name) => `Preparé una campaña para la audiencia "${name}" con ${count} miembros. Revísala abajo y apruébala para guardarla como borrador.`,
    campaignScheduledReady: (count, name, when) => `Preparé una campaña para la audiencia "${name}" con ${count} miembros. Revísala abajo y apruébala para programarla para ${when}.`,
    fillSessionReady: (count, name, sessionLabel) => `Elegí ${count} candidatos fuertes para ${sessionLabel}. Revisa la invitación abajo y apruébala para contactar a ${name}.`,
    fillSessionEmpty: (sessionLabel) => `Encontré la sesión correcta, pero todavía no veo buenos candidatos para invitar a ${sessionLabel}.`,
    adminOnly: `Puedo preparar acciones aquí, pero solo los administradores del club pueden aprobarlas y ejecutarlas.`,
    suggestions: {
      create_cohort: [
        'Prepara una campaña de reactivación para esta audiencia',
        'Crea una audiencia de jugadores de la noche',
        'Muéstrame los miembros con más riesgo',
      ],
      create_campaign: [
        'Crea otra campaña para jugadores competitivos',
        'Arma una audiencia para jugadores de la mañana',
        'Muéstrame otra vez los miembros inactivos',
      ],
      fill_session: [
        'Usa SMS en su lugar',
        'Invita a los mejores 8 jugadores',
        'Muéstrame otra sesión con huecos',
      ],
    },
  },
}

export function getAdvisorActionCopy(language: SupportedLanguage | string) {
  const locale = language === 'ru' || language === 'es' ? language : 'en'
  return ACTION_COPY[locale]
}
