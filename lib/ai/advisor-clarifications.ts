import 'server-only'

import { z } from 'zod'
import type { SupportedLanguage } from '@/lib/ai/llm/language'
import { advisorCampaignTypeEnum, advisorChannelEnum } from './advisor-actions'
import type { AdvisorIntentPlan } from './advisor-action-planner'
import type { AdvisorConversationState } from './advisor-conversation-state'

export const advisorPendingClarificationSchema = z.object({
  action: z.enum(['create_cohort', 'draft_campaign']),
  field: z.enum(['audience', 'audience_mode', 'channel']),
  question: z.string().min(1).max(240),
  options: z.array(z.string().min(1).max(80)).max(4).default([]),
  originalMessage: z.string().min(1).max(500),
  audienceText: z.string().max(500).optional(),
  campaignType: advisorCampaignTypeEnum.optional(),
  channel: advisorChannelEnum.optional(),
  usePreviousCohort: z.boolean().optional(),
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
  repeatAudience: string
  repeatChannel: string
  audienceOptions: string[]
  audienceModeOptions: string[]
  channelOptions: string[]
}> = {
  en: {
    needAudienceForAudience: 'Who should be included in this audience?',
    needAudienceForCampaign: 'Who should this campaign target?',
    needAudienceMode: 'Should I use the current audience or build a new one for this campaign?',
    needChannel: 'Which channel should I use for this campaign?',
    repeatAudience: 'I still need the audience to continue. Tell me who should be included or targeted.',
    repeatChannel: 'I still need the delivery channel. Choose email, SMS, or both.',
    audienceOptions: ['Inactive members', 'Weekday evening players', 'Women 55+'],
    audienceModeOptions: ['Use current audience', 'Inactive members', 'Weekday evening players'],
    channelOptions: ['Email', 'SMS', 'Both email and SMS'],
  },
  ru: {
    needAudienceForAudience: 'Кого включить в эту аудиторию?',
    needAudienceForCampaign: 'На какую аудиторию должна идти эта кампания?',
    needAudienceMode: 'Использовать текущую аудиторию или собрать новую для этой кампании?',
    needChannel: 'Какой канал использовать для этой кампании?',
    repeatAudience: 'Мне все еще нужна аудитория. Напиши, кого включить или на кого таргетировать кампанию.',
    repeatChannel: 'Мне все еще нужен канал отправки. Выбери email, SMS или оба канала.',
    audienceOptions: ['Неактивные участники', 'Вечерние игроки по будням', 'Женщины 55+'],
    audienceModeOptions: ['Используй текущую аудиторию', 'Неактивные участники', 'Вечерние игроки по будням'],
    channelOptions: ['Email', 'SMS', 'И email и SMS'],
  },
  es: {
    needAudienceForAudience: 'Quien debe estar en esta audiencia?',
    needAudienceForCampaign: 'A quien debe dirigirse esta campana?',
    needAudienceMode: 'Debo usar la audiencia actual o crear una nueva para esta campana?',
    needChannel: 'Que canal debo usar para esta campana?',
    repeatAudience: 'Todavia necesito la audiencia. Dime a quien debo incluir o a quien debo dirigirme.',
    repeatChannel: 'Todavia necesito el canal de envio. Elige email, SMS o ambos.',
    audienceOptions: ['Miembros inactivos', 'Jugadores de noche entre semana', 'Mujeres 55+'],
    audienceModeOptions: ['Usa la audiencia actual', 'Miembros inactivos', 'Jugadores de noche entre semana'],
    channelOptions: ['Email', 'SMS', 'Email y SMS'],
  },
}

function getCopy(language: SupportedLanguage | string) {
  return COPY[language === 'ru' || language === 'es' ? language : 'en']
}

function containsAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text))
}

function extractExplicitChannel(message: string): z.infer<typeof advisorChannelEnum> | null {
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
}): ClarificationResponse | null {
  const { message, plan, state, language } = opts
  const copy = getCopy(language)

  if (plan.action === 'none') return null

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

  const explicitChannel = extractExplicitChannel(message)
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
    }, copy.needAudienceForCampaign, copy.audienceOptions)
  }

  if (!explicitChannel && !state?.currentCampaign?.channel) {
    return buildClarification(language, {
      action: 'draft_campaign',
      field: 'channel',
      question: copy.needChannel,
      options: copy.channelOptions,
      originalMessage: message,
      audienceText: usesCurrentAudience ? undefined : (plan.audienceText || message),
      campaignType: plan.campaignType,
      usePreviousCohort: usesCurrentAudience,
    }, copy.needChannel, copy.channelOptions)
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
  const explicitChannel = extractExplicitChannel(message)

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
          usePreviousCohort: false,
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
      },
    }
  }

  return null
}
