import 'server-only'

import { z } from 'zod'
import type { SupportedLanguage } from '@/lib/ai/llm/language'
import { advisorCampaignTypeEnum, advisorChannelEnum, advisorDeliveryModeEnum } from './advisor-actions'
import type { AdvisorIntentPlan } from './advisor-action-planner'
import type { AdvisorConversationState } from './advisor-conversation-state'
import { parseAdvisorScheduledSend } from './advisor-scheduling'
import { advisorSlotSessionOptionSchema } from './advisor-slot-filler'

export const advisorPendingClarificationSchema = z.object({
  action: z.enum(['create_cohort', 'draft_campaign', 'fill_session', 'reactivate_members']),
  field: z.enum(['audience', 'audience_mode', 'channel', 'schedule', 'session']),
  question: z.string().min(1).max(240),
  options: z.array(z.string().min(1).max(80)).max(4).default([]),
  originalMessage: z.string().min(1).max(500),
  audienceText: z.string().max(500).optional(),
  campaignType: advisorCampaignTypeEnum.optional(),
  channel: advisorChannelEnum.optional(),
  deliveryMode: advisorDeliveryModeEnum.optional(),
  candidateLimit: z.number().int().min(1).max(20).optional(),
  sessionOptions: z.array(advisorSlotSessionOptionSchema).max(6).optional(),
  usePreviousCohort: z.boolean().optional(),
  timeZone: z.string().max(80).optional(),
})

export type AdvisorPendingClarification = z.infer<typeof advisorPendingClarificationSchema>

type ClarificationResponse = {
  text: string
  suggestions: string[]
  pending: AdvisorPendingClarification
}

type ClarificationResolution = {
  plan?: AdvisorIntentPlan
  clarification?: ClarificationResponse
}

const COPY: Record<'en' | 'ru' | 'es', {
  needAudienceForAudience: string
  needAudienceForCampaign: string
  needAudienceMode: string
  needChannel: string
  needSchedule: string
  repeatAudience: string
  repeatChannel: string
  repeatSchedule: string
  audienceOptions: string[]
  audienceModeOptions: string[]
  channelOptions: string[]
  scheduleOptions: string[]
}> = {
  en: {
    needAudienceForAudience: 'Who should be included in this audience?',
    needAudienceForCampaign: 'Who should this campaign target?',
    needAudienceMode: 'Should I use the current audience or build a new one for this campaign?',
    needChannel: 'Which channel should I use for this campaign?',
    needSchedule: 'When should I send this campaign?',
    repeatAudience: 'I still need the audience to continue. Tell me who should be included or targeted.',
    repeatChannel: 'I still need the delivery channel. Choose email, SMS, or both.',
    repeatSchedule: 'I still need a send time. Tell me something like "tomorrow at 6pm" or "Friday at 9am".',
    audienceOptions: ['Inactive members', 'Weekday evening players', 'Women 55+'],
    audienceModeOptions: ['Use current audience', 'Inactive members', 'Weekday evening players'],
    channelOptions: ['Email', 'SMS', 'Both email and SMS'],
    scheduleOptions: ['Tomorrow at 6pm', 'Friday at 9am', 'Next Tuesday at 3pm'],
  },
  ru: {
    needAudienceForAudience: 'Кого включить в эту аудиторию?',
    needAudienceForCampaign: 'На какую аудиторию должна идти эта кампания?',
    needAudienceMode: 'Использовать текущую аудиторию или собрать новую для этой кампании?',
    needChannel: 'Какой канал использовать для этой кампании?',
    needSchedule: 'Когда отправить эту кампанию?',
    repeatAudience: 'Мне все еще нужна аудитория. Напиши, кого включить или на кого таргетировать кампанию.',
    repeatChannel: 'Мне все еще нужен канал отправки. Выбери email, SMS или оба канала.',
    repeatSchedule: 'Мне все еще нужно время отправки. Напиши что-то вроде "завтра в 18:00" или "в пятницу в 9 утра".',
    audienceOptions: ['Неактивные участники', 'Вечерние игроки по будням', 'Женщины 55+'],
    audienceModeOptions: ['Используй текущую аудиторию', 'Неактивные участники', 'Вечерние игроки по будням'],
    channelOptions: ['Email', 'SMS', 'И email и SMS'],
    scheduleOptions: ['Завтра в 18:00', 'В пятницу в 9 утра', 'Во вторник в 15:00'],
  },
  es: {
    needAudienceForAudience: 'Quien debe estar en esta audiencia?',
    needAudienceForCampaign: 'A quien debe dirigirse esta campana?',
    needAudienceMode: 'Debo usar la audiencia actual o crear una nueva para esta campana?',
    needChannel: 'Que canal debo usar para esta campana?',
    needSchedule: 'Cuando debo enviar esta campana?',
    repeatAudience: 'Todavia necesito la audiencia. Dime a quien debo incluir o a quien debo dirigirme.',
    repeatChannel: 'Todavia necesito el canal de envio. Elige email, SMS o ambos.',
    repeatSchedule: 'Todavia necesito la hora de envio. Dime algo como "manana a las 6pm" o "viernes a las 9am".',
    audienceOptions: ['Miembros inactivos', 'Jugadores de noche entre semana', 'Mujeres 55+'],
    audienceModeOptions: ['Usa la audiencia actual', 'Miembros inactivos', 'Jugadores de noche entre semana'],
    channelOptions: ['Email', 'SMS', 'Email y SMS'],
    scheduleOptions: ['Mañana a las 6pm', 'Viernes a las 9am', 'Martes a las 3pm'],
  },
}

function getCopy(language: SupportedLanguage | string) {
  return COPY[language === 'ru' || language === 'es' ? language : 'en']
}

function containsAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text))
}

export function extractExplicitAdvisorChannel(message: string): z.infer<typeof advisorChannelEnum> | null {
  const lower = message.toLowerCase()
  if (containsAny(lower, [/\b(email|e-mail)\b/]) && containsAny(lower, [/\b(sms|text)\b/])) return 'both'
  if (containsAny(lower, [/\b(both|both channels|all channels)\b/, /\b(оба канала|и email и sms)\b/, /\b(email y sms|ambos)\b/])) return 'both'
  if (containsAny(lower, [/\b(sms|text)\b/, /\b(смс|sms)\b/])) return 'sms'
  if (containsAny(lower, [/\b(email|e-mail)\b/, /\b(имейл|емейл|почта)\b/])) return 'email'
  return null
}

function wantsCurrentAudience(message: string) {
  const lower = message.toLowerCase()
  return containsAny(lower, [
    /\b(use|keep|reuse)\s+(the\s+)?(current|existing|same)\s+(audience|segment|group|list)\b/,
    /\b(use|keep)\s+them\b/,
    /\b(используй|оставь)\s+(текущую|эту)\s+аудитори\w+\b/,
    /\b(current audience|same audience|that audience|this audience)\b/,
  ])
}

function wantsNewAudience(message: string) {
  const lower = message.toLowerCase()
  return containsAny(lower, [
    /\b(new|different|another)\s+(audience|segment|group|list)\b/,
    /\b(create|build)\s+(a\s+)?new\s+(audience|segment)\b/,
    /\b(новую|другую)\s+аудитори\w+\b/,
  ])
}

function isLikelyFreshRequest(message: string) {
  const lower = message.toLowerCase()
  return containsAny(lower, [
    /\b(create|build|draft|launch|send|show|analyze|compare|find|why|what|how)\b/,
    /\b(создай|подготовь|отправь|покажи|проанализируй|почему|что|как)\b/,
  ])
}

function hasMeaningfulAudienceDescription(text: string) {
  const lower = text.toLowerCase().trim()
  if (!lower) return false

  return containsAny(lower, [
    /\b(inactive|at risk|churn|lapsed)\b/,
    /\b(weekday|weekend|morning|afternoon|evening|night)\b/,
    /\b(beginner|intermediate|advanced|competitive)\b/,
    /\b(women|female|men|male)\b/,
    /\b(new members?|returning players?)\b/,
    /\b(age|over \d{2}|under \d{2}|\d{2}\+)\b/,
    /\b(skill|dupr|rating|membership|zip|city)\b/,
    /\b(members?|players?)\s+(who|with|from|in)\b/,
    /\b(неактивн|риск|утр|вечер|будн|выходн|женщин|мужчин|новых участников|возвращающихся игроков|игроков \d{2}\+)\b/,
    /\b(inactivos|riesgo|manana|tarde|noche|mujeres|hombres|nuevos miembros|\d{2}\+)\b/,
  ])
}

function buildClarification(
  language: SupportedLanguage | string,
  pending: AdvisorPendingClarification,
  text: string,
  suggestions: string[],
): ClarificationResponse {
  return { text, suggestions, pending }
}

export function maybeStartAdvisorClarification(opts: {
  message: string
  plan: AdvisorIntentPlan
  state: AdvisorConversationState | null
  language: SupportedLanguage | string
  timeZone?: string | null
}): ClarificationResponse | null {
  const { message, plan, state, language, timeZone } = opts
  const copy = getCopy(language)

  if (
    plan.action === 'none' ||
    plan.action === 'fill_session' ||
    plan.action === 'reactivate_members' ||
    plan.action === 'trial_follow_up' ||
    plan.action === 'renewal_reactivation' ||
    plan.action === 'update_contact_policy' ||
    plan.action === 'update_autonomy_policy' ||
    plan.action === 'update_sandbox_routing' ||
    plan.action === 'update_admin_reminder_routing' ||
    // Ops actions render their own response in the route's later if-else
    // chain (see app/api/ai/advisor-action/route.ts ~L2624). They were
    // missing here, so any ops query fell through to the generic
    // draft_campaign clarification ("Who should this campaign target?")
    // which then prevented the ops branch from running because the
    // route bails early once assistantMessage is set. Verified the
    // hijack on 2026-04-26 against "what did the agent do today" and
    // "show me pending approvals".
    plan.action === 'ops_kill_switch' ||
    plan.action === 'ops_approve_pending' ||
    plan.action === 'ops_skip_pending' ||
    plan.action === 'ops_snooze_pending' ||
    plan.action === 'ops_show_pending' ||
    plan.action === 'ops_show_activity' ||
    plan.action === 'ops_show_decisions'
  ) return null

  if (plan.action === 'create_cohort') {
    if (hasMeaningfulAudienceDescription(plan.audienceText || message)) return null
    return buildClarification(language, {
      action: 'create_cohort',
      field: 'audience',
      question: copy.needAudienceForAudience,
      options: copy.audienceOptions,
      originalMessage: message,
    }, copy.needAudienceForAudience, copy.audienceOptions)
  }

  const explicitChannel = extractExplicitAdvisorChannel(message)
  const hasCurrentAudience = !!state?.currentAudience
  const usesCurrentAudience = plan.usePreviousCohort || wantsCurrentAudience(message)
  const hasAudienceDescription = usesCurrentAudience || hasMeaningfulAudienceDescription(plan.audienceText || message)

  if (hasCurrentAudience && !usesCurrentAudience && !hasAudienceDescription) {
    return buildClarification(language, {
      action: 'draft_campaign',
      field: 'audience_mode',
      question: copy.needAudienceMode,
      options: copy.audienceModeOptions,
      originalMessage: message,
      campaignType: plan.campaignType,
      channel: explicitChannel || undefined,
      deliveryMode: plan.deliveryMode,
    }, copy.needAudienceMode, copy.audienceModeOptions)
  }

  if (!hasCurrentAudience && !hasAudienceDescription) {
    return buildClarification(language, {
      action: 'draft_campaign',
      field: 'audience',
      question: copy.needAudienceForCampaign,
      options: copy.audienceOptions,
      originalMessage: message,
      campaignType: plan.campaignType,
      channel: explicitChannel || undefined,
      deliveryMode: plan.deliveryMode,
    }, copy.needAudienceForCampaign, copy.audienceOptions)
  }

  if (!explicitChannel && !plan.channel && !state?.currentCampaign?.channel) {
    return buildClarification(language, {
      action: 'draft_campaign',
      field: 'channel',
      question: copy.needChannel,
      options: copy.channelOptions,
      originalMessage: message,
      audienceText: usesCurrentAudience ? undefined : (plan.audienceText || message),
      campaignType: plan.campaignType,
      deliveryMode: plan.deliveryMode,
      usePreviousCohort: usesCurrentAudience,
    }, copy.needChannel, copy.channelOptions)
  }

  if (plan.deliveryMode === 'send_later' && !plan.scheduledFor) {
    const scheduled = parseAdvisorScheduledSend({ message, timeZone })
    if (!scheduled) {
      return buildClarification(language, {
        action: 'draft_campaign',
        field: 'schedule',
        question: copy.needSchedule,
        options: copy.scheduleOptions,
        originalMessage: message,
        audienceText: usesCurrentAudience ? undefined : (plan.audienceText || message),
        campaignType: plan.campaignType,
        channel: explicitChannel || state?.currentCampaign?.channel || undefined,
        deliveryMode: 'send_later',
        usePreviousCohort: usesCurrentAudience,
        timeZone: timeZone || undefined,
      }, copy.needSchedule, copy.scheduleOptions)
    }
  }

  return null
}

export function resolveAdvisorClarification(opts: {
  message: string
  pending: AdvisorPendingClarification
  state: AdvisorConversationState | null
  language: SupportedLanguage | string
}): ClarificationResolution | null {
  const { message, pending, state, language } = opts
  const copy = getCopy(language)
  const explicitChannel = extractExplicitAdvisorChannel(message)

  if (pending.action === 'fill_session' || pending.field === 'session') return null

  if (pending.field === 'channel') {
    if (!explicitChannel) {
      return {
        clarification: buildClarification(language, {
          ...pending,
          question: copy.repeatChannel,
          options: copy.channelOptions,
        }, copy.repeatChannel, copy.channelOptions),
      }
    }

    return {
      plan: {
        action: 'draft_campaign',
        usePreviousCohort: pending.usePreviousCohort || false,
        audienceText: pending.usePreviousCohort ? undefined : pending.audienceText,
        campaignType: pending.campaignType,
        channel: explicitChannel,
        deliveryMode: pending.deliveryMode,
        timeZone: pending.timeZone,
      },
    }
  }

  if (pending.field === 'schedule') {
    const scheduled = parseAdvisorScheduledSend({
      message,
      timeZone: pending.timeZone,
    })
    if (!scheduled) {
      return {
        clarification: buildClarification(language, {
          ...pending,
          question: copy.repeatSchedule,
          options: copy.scheduleOptions,
        }, copy.repeatSchedule, copy.scheduleOptions),
      }
    }

    return {
      plan: {
        action: 'draft_campaign',
        usePreviousCohort: pending.usePreviousCohort || false,
        audienceText: pending.usePreviousCohort ? undefined : pending.audienceText,
        campaignType: pending.campaignType,
        channel: pending.channel,
        deliveryMode: 'send_later',
        scheduledFor: scheduled.scheduledFor,
        timeZone: scheduled.timeZone,
      },
    }
  }

  if (pending.field === 'audience_mode') {
    if (state?.currentAudience && wantsCurrentAudience(message)) {
      return {
        plan: {
          action: 'draft_campaign',
          usePreviousCohort: true,
          campaignType: pending.campaignType,
          channel: pending.channel,
          deliveryMode: pending.deliveryMode,
          timeZone: pending.timeZone,
        },
      }
    }

    if (wantsNewAudience(message) && !hasMeaningfulAudienceDescription(message)) {
      return {
        clarification: buildClarification(language, {
          ...pending,
          field: 'audience',
          question: copy.needAudienceForCampaign,
          options: copy.audienceOptions,
        }, copy.needAudienceForCampaign, copy.audienceOptions),
      }
    }

    if (!hasMeaningfulAudienceDescription(message)) {
      if (isLikelyFreshRequest(message)) return null
      return {
        clarification: buildClarification(language, {
          ...pending,
          question: copy.needAudienceMode,
          options: copy.audienceModeOptions,
        }, copy.needAudienceMode, copy.audienceModeOptions),
      }
    }

    return {
      plan: {
        action: 'draft_campaign',
        usePreviousCohort: false,
        audienceText: message,
        campaignType: pending.campaignType,
        channel: pending.channel,
        deliveryMode: pending.deliveryMode,
        timeZone: pending.timeZone,
      },
    }
  }

  if (pending.field === 'audience') {
    if (pending.action === 'draft_campaign' && state?.currentAudience && wantsCurrentAudience(message)) {
      return {
        plan: {
          action: 'draft_campaign',
          usePreviousCohort: true,
          campaignType: pending.campaignType,
          channel: pending.channel,
          deliveryMode: pending.deliveryMode,
          timeZone: pending.timeZone,
        },
      }
    }

    if (!hasMeaningfulAudienceDescription(message)) {
      if (isLikelyFreshRequest(message)) return null
      const question = pending.action === 'create_cohort' ? copy.repeatAudience : copy.repeatAudience
      return {
        clarification: buildClarification(language, {
          ...pending,
          question,
          options: copy.audienceOptions,
        }, question, copy.audienceOptions),
      }
    }

    if (pending.action === 'create_cohort') {
      return {
        plan: {
          action: 'create_cohort',
          usePreviousCohort: false,
          audienceText: message,
        },
      }
    }

    if (!pending.channel && !explicitChannel && !state?.currentCampaign?.channel) {
      return {
        clarification: buildClarification(language, {
          action: 'draft_campaign',
          field: 'channel',
          question: copy.needChannel,
          options: copy.channelOptions,
          originalMessage: pending.originalMessage,
          audienceText: message,
          campaignType: pending.campaignType,
          deliveryMode: pending.deliveryMode,
          usePreviousCohort: false,
          timeZone: pending.timeZone,
        }, copy.needChannel, copy.channelOptions),
      }
    }

    return {
      plan: {
        action: 'draft_campaign',
        usePreviousCohort: false,
        audienceText: message,
        campaignType: pending.campaignType,
        channel: pending.channel || explicitChannel || undefined,
        deliveryMode: pending.deliveryMode,
        timeZone: pending.timeZone,
      },
    }
  }

  return null
}
