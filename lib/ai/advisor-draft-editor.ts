import 'server-only'

import { z } from 'zod'
import { generateWithFallback } from '@/lib/ai/llm/provider'
import type { SupportedLanguage } from '@/lib/ai/llm/language'
import { advisorActionSchema, cohortFilterSchema, type AdvisorAction } from './advisor-actions'
import type { AdvisorConversationState } from './advisor-conversation-state'
import { containsAdvisorSchedulingIntent, parseAdvisorScheduledSend } from './advisor-scheduling'
import { getActiveReactivationAction, parseAdvisorInactivityDays } from './advisor-reactivation'
import { resolveAdvisorSlotSession, type AdvisorSlotSessionOption } from './advisor-slot-filler'

const advisorEditResultSchema = z.object({
  handled: z.boolean(),
  action: advisorActionSchema.optional(),
})

type AudienceFilter = z.infer<typeof cohortFilterSchema>
type FillSessionAction = Extract<AdvisorAction, { kind: 'fill_session' }>
type ReactivationAction = Extract<AdvisorAction, { kind: 'reactivate_members' }>
type MembershipLifecycleAction = Extract<AdvisorAction, { kind: 'trial_follow_up' | 'renewal_reactivation' }>

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

function getActiveFillSessionAction(lastAction: AdvisorAction | null | undefined): FillSessionAction | null {
  return lastAction?.kind === 'fill_session' ? lastAction : null
}

function getActiveMembershipLifecycleAction(lastAction: AdvisorAction | null | undefined): MembershipLifecycleAction | null {
  return lastAction?.kind === 'trial_follow_up' || lastAction?.kind === 'renewal_reactivation'
    ? lastAction
    : null
}

function isLikelyEditRequest(
  message: string,
  state: AdvisorConversationState | null,
  activeFillSession: FillSessionAction | null,
  activeReactivation: ReactivationAction | null,
  activeMembershipLifecycle: MembershipLifecycleAction | null,
) {
  if (!state?.currentAudience && !state?.currentCampaign && !activeFillSession && !activeReactivation && !state?.currentMembershipLifecycle && !activeMembershipLifecycle) return false

  const lower = message.toLowerCase()
  const explicitEdit = containsAny(lower, [
    /\b(edit|change|update|revise|rewrite|adjust|refine|switch|make)\b/,
    /\b(shorter|shorten|longer|long-form|concise|brief)\b/,
    /\b(subject|body|copy|tone|message|campaign|email|sms)\b/,
    /\b(exclude|include|remove|add|only|filter|narrow|broaden)\b/,
    /\b(schedule|scheduled|later|send now|save as draft)\b/,
    /\b(top\s+\d{1,2}|best\s+\d{1,2}|another session|different session|other session)\b/,
    /\b(inactive\s+\d{1,3}\s*days|\d{1,3}\+?\s*day inactive|reactivat|win[- ]?back)\b/,
    /\b(trial|renewal|first[- ]?play|first booking|expired membership|suspended membership)\b/,
  ]) || containsAny(lower, [
    /\b(короче|длиннее|измени|исправь|обнови|убери|добавь|оставь|только)\b/,
    /\b(другую сессию|другой слот|топ-\d{1,2}|топ \d{1,2})\b/,
    /\b(mas corto|más corto|actualiza|edita|cambia|quita|solo)\b/,
  ])

  const pronounEdit = containsAny(lower, [
    /\b(it|them|that|this)\b/,
    /\b(его|ее|её|их|это|эту|этот)\b/,
    /\b(eso|esa|ese|ellos|ellas)\b/,
  ])

  return explicitEdit || pronounEdit || containsAdvisorSchedulingIntent(message)
}

function extractCandidateLimit(message: string) {
  const lower = message.toLowerCase()
  const match =
    lower.match(/\btop\s+(\d{1,2})\b/) ||
    lower.match(/\bbest\s+(\d{1,2})\b/) ||
    lower.match(/\binvite(?:\s+only)?\s+(\d{1,2})\s+(?:players?|members?|people)\b/) ||
    lower.match(/\bonly\s+(\d{1,2})\s+(?:players?|members?|people)\b/) ||
    lower.match(/\bтоп[- ]?(\d{1,2})\b/)

  if (!match) return null

  const value = Number(match[1])
  if (!Number.isInteger(value) || value < 1 || value > 20) return null
  return value
}

function pickAlternateSession(
  sessions: AdvisorSlotSessionOption[],
  currentSession: AdvisorSlotSessionOption,
): AdvisorSlotSessionOption | null {
  if (sessions.length < 2) return null

  const currentIndex = sessions.findIndex((session) => session.id === currentSession.id)
  if (currentIndex === -1) return sessions[0] || null

  return sessions[(currentIndex + 1) % sessions.length] || null
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
      summary: `${state.currentCampaign.channel.toUpperCase()} ${state.currentCampaign.execution.mode === 'send_now' ? 'outreach' : 'draft'} for ${audience.count || state.currentCampaign.audienceCount || 0} members`,
      requiresApproval: true,
      audience,
      campaign: {
        type: state.currentCampaign.type,
        channel: state.currentCampaign.channel,
        subject: state.currentCampaign.subject,
        body: state.currentCampaign.body,
        smsBody: state.currentCampaign.smsBody,
        execution: state.currentCampaign.execution,
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

function applyHeuristicCampaignEdit(
  message: string,
  state: AdvisorConversationState,
  timeZone?: string | null,
): AdvisorAction | null {
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

  if (containsAny(lower, [
    /\b(send now|launch now|go ahead|approve and send|send it)\b/,
    /\b(отправь сейчас|запускай|запусти сейчас)\b/,
  ])) {
    campaign.execution = {
      ...campaign.execution,
      mode: 'send_now',
      scheduledFor: undefined,
    }
    changed = true
  } else if (containsAny(lower, [
    /\b(save as draft|keep as draft|draft only|don'?t send|do not send|hold for now|preview only)\b/,
    /\b(сохрани как черновик|оставь как черновик|не отправляй|только черновик)\b/,
  ])) {
    campaign.execution = {
      ...campaign.execution,
      mode: 'save_draft',
      scheduledFor: undefined,
    }
    changed = true
  }

  if (containsAdvisorSchedulingIntent(message)) {
    const scheduled = parseAdvisorScheduledSend({
      message,
      timeZone: timeZone || campaign.execution.timeZone,
    })
    if (scheduled) {
      campaign.execution = {
        ...campaign.execution,
        mode: 'send_later',
        scheduledFor: scheduled.scheduledFor,
        timeZone: scheduled.timeZone,
      }
      changed = true
    } else if (containsAny(lower, [/\b(send later|schedule|scheduled|later|tomorrow|tonight|next)\b/])) {
      campaign.execution = {
        ...campaign.execution,
        mode: 'send_later',
      }
      changed = true
    }
  }

  if (containsAny(lower, [
    /\b(only members with email|email only recipients|exclude members without email|only reachable by email)\b/,
    /\b(только с email|убери без email|исключи без email)\b/,
  ])) {
    campaign.execution = {
      ...campaign.execution,
      recipientRules: {
        ...campaign.execution.recipientRules,
        requireEmail: true,
      },
    }
    changed = true
  }

  if (containsAny(lower, [
    /\b(only members with phone|exclude members without phone|phone only recipients)\b/,
    /\b(только с телефоном|убери без телефона|исключи без телефона)\b/,
  ])) {
    campaign.execution = {
      ...campaign.execution,
      recipientRules: {
        ...campaign.execution.recipientRules,
        requirePhone: true,
      },
    }
    changed = true
  }

  if (containsAny(lower, [
    /\b(sms opt-?ins only|opt-?ins only|only opted in members)\b/,
    /\b(только sms opt-?in|только с согласием на sms|только opt-?in)\b/,
  ])) {
    campaign.execution = {
      ...campaign.execution,
      recipientRules: {
        ...campaign.execution.recipientRules,
        smsOptInOnly: true,
      },
    }
    changed = true
  }

  if (!changed) return null
  if (campaign.execution.mode === 'send_later' && !campaign.execution.scheduledFor) return null

  return {
    kind: 'create_campaign',
    title: `Update campaign draft: ${state.currentAudience.name}`,
    summary: `${campaign.channel.toUpperCase()} ${campaign.execution.mode === 'send_now' ? 'outreach' : campaign.execution.mode === 'send_later' ? 'scheduled outreach' : 'draft'} for ${state.currentAudience.count || state.currentCampaign.audienceCount || 0} members`,
    requiresApproval: true,
    audience: state.currentAudience,
    campaign: {
      type: campaign.type,
      channel: campaign.channel,
      subject: campaign.subject,
      body: campaign.body,
      smsBody: campaign.smsBody,
      execution: campaign.execution,
    },
  }
}

function applyHeuristicFillSessionEdit(
  message: string,
  currentAction: FillSessionAction | null,
  sessions: AdvisorSlotSessionOption[] | undefined,
): AdvisorAction | null {
  if (!currentAction) return null

  const lower = message.toLowerCase()
  let nextAction: FillSessionAction = {
    ...currentAction,
    session: { ...currentAction.session },
    outreach: {
      ...currentAction.outreach,
      candidates: [...currentAction.outreach.candidates],
    },
  }
  let changed = false

  if (containsAny(lower, [/\b(sms only|text only|use sms instead|switch to sms)\b/, /\b(только sms|только смс|переключи на sms|смс вместо email)\b/])) {
    nextAction.outreach.channel = 'sms'
    nextAction.outreach.message = truncateText(nextAction.outreach.message, 160)
    changed = true
  } else if (containsAny(lower, [/\b(email only|use email instead|switch to email)\b/, /\b(только email|только имейл|только емейл|переключи на email)\b/])) {
    nextAction.outreach.channel = 'email'
    changed = true
  } else if (containsAny(lower, [/\b(both|both channels|email and sms)\b/, /\b(оба канала|и email и sms|и емейл и смс)\b/])) {
    nextAction.outreach.channel = 'both'
    changed = true
  }

  const candidateLimit = extractCandidateLimit(message)
  if (candidateLimit && candidateLimit !== nextAction.outreach.candidateCount) {
    nextAction.outreach.candidateCount = candidateLimit
    nextAction.outreach.candidates = nextAction.outreach.candidates.slice(0, candidateLimit)
    changed = true
  }

  let nextSession: AdvisorSlotSessionOption | null = null
  if (sessions?.length) {
    if (containsAny(lower, [
      /\b(another|different|other)\s+(session|slot|match)\b/,
      /\b(show me another|pick another|choose another)\b/,
      /\b(другую сессию|другой слот|покажи другую)\b/,
    ])) {
      nextSession = pickAlternateSession(sessions, nextAction.session)
    } else {
      const resolved = resolveAdvisorSlotSession({
        message,
        sessions,
        currentSession: nextAction.session,
      })
      if (resolved.session && resolved.session.id !== nextAction.session.id && resolved.reason !== 'current') {
        nextSession = resolved.session
      }
    }
  }

  if (nextSession) {
    nextAction.session = nextSession
    changed = true
  }

  if (!changed) return null

  nextAction.title = `Fill session: ${nextAction.session.title}`
  nextAction.summary = `${nextAction.outreach.channel.toUpperCase()} invites for ${nextAction.outreach.candidateCount} matched player${nextAction.outreach.candidateCount === 1 ? '' : 's'}`

  return nextAction
}

function applyHeuristicReactivationEdit(
  message: string,
  currentAction: ReactivationAction | null,
): AdvisorAction | null {
  if (!currentAction) return null

  const lower = message.toLowerCase()
  const nextAction: ReactivationAction = {
    ...currentAction,
    reactivation: {
      ...currentAction.reactivation,
      candidates: [...currentAction.reactivation.candidates],
    },
  }
  let changed = false

  if (containsAny(lower, [/\b(sms only|text only|use sms instead|switch to sms)\b/, /\b(только sms|только смс|переключи на sms)\b/])) {
    nextAction.reactivation.channel = 'sms'
    nextAction.reactivation.message = truncateText(nextAction.reactivation.message, 160)
    changed = true
  } else if (containsAny(lower, [/\b(email only|use email instead|switch to email)\b/, /\b(только email|переключи на email)\b/])) {
    nextAction.reactivation.channel = 'email'
    changed = true
  } else if (containsAny(lower, [/\b(both|both channels|email and sms)\b/, /\b(оба канала|и email и sms)\b/])) {
    nextAction.reactivation.channel = 'both'
    nextAction.reactivation.message = truncateText(nextAction.reactivation.message, 160)
    changed = true
  }

  const candidateLimit = extractCandidateLimit(message)
  if (candidateLimit && candidateLimit !== nextAction.reactivation.candidateCount) {
    nextAction.reactivation.candidateCount = candidateLimit
    nextAction.reactivation.candidates = nextAction.reactivation.candidates.slice(0, candidateLimit)
    changed = true
  }

  const inactivityDays = parseAdvisorInactivityDays(message)
  if (inactivityDays && inactivityDays !== nextAction.reactivation.inactivityDays) {
    nextAction.reactivation.inactivityDays = inactivityDays
    nextAction.reactivation.segmentLabel = `${inactivityDays}+ day inactive members`
    changed = true
  }

  if (!changed) return null

  nextAction.title = `Reactivate: ${nextAction.reactivation.segmentLabel}`
  nextAction.summary = `${nextAction.reactivation.channel.toUpperCase()} win-back outreach for ${nextAction.reactivation.candidateCount} inactive members`

  return nextAction
}

function applyHeuristicMembershipLifecycleEdit(
  message: string,
  currentAction: MembershipLifecycleAction | null,
  timeZone?: string | null,
): AdvisorAction | null {
  if (!currentAction) return null

  const lower = message.toLowerCase()
  const nextAction = (
    currentAction.kind === 'trial_follow_up'
      ? {
          ...currentAction,
          lifecycle: {
            ...currentAction.lifecycle,
            execution: { ...currentAction.lifecycle.execution },
            candidates: [...currentAction.lifecycle.candidates],
          },
        }
      : {
          ...currentAction,
          lifecycle: {
            ...currentAction.lifecycle,
            execution: { ...currentAction.lifecycle.execution },
            candidates: [...currentAction.lifecycle.candidates],
          },
        }
  ) as MembershipLifecycleAction
  let changed = false

  if (containsAny(lower, [/\b(sms only|text only|use sms instead|switch to sms)\b/, /\b(только sms|только смс|переключи на sms)\b/])) {
    nextAction.lifecycle.channel = 'sms'
    nextAction.lifecycle.message = truncateText(nextAction.lifecycle.message, 160)
    nextAction.lifecycle.smsBody = truncateText(nextAction.lifecycle.smsBody || nextAction.lifecycle.message, 160)
    changed = true
  } else if (containsAny(lower, [/\b(email only|use email instead|switch to email)\b/, /\b(только email|переключи на email)\b/])) {
    nextAction.lifecycle.channel = 'email'
    changed = true
  } else if (containsAny(lower, [/\b(both|both channels|email and sms)\b/, /\b(оба канала|и email и sms)\b/])) {
    nextAction.lifecycle.channel = 'both'
    nextAction.lifecycle.smsBody = truncateText(nextAction.lifecycle.smsBody || nextAction.lifecycle.message, 160)
    changed = true
  }

  const candidateLimit = extractCandidateLimit(message)
  if (candidateLimit && candidateLimit !== nextAction.lifecycle.candidateCount) {
    nextAction.lifecycle.candidateCount = candidateLimit
    nextAction.lifecycle.candidates = nextAction.lifecycle.candidates.slice(0, candidateLimit)
    changed = true
  }

  if (containsAny(lower, [
    /\b(send now|launch now|go ahead|approve and send|send it)\b/,
    /\b(отправь сейчас|запускай|запусти сейчас)\b/,
  ])) {
    nextAction.lifecycle.execution = {
      ...nextAction.lifecycle.execution,
      mode: 'send_now',
      scheduledFor: undefined,
    }
    changed = true
  } else if (containsAny(lower, [
    /\b(save as draft|keep as draft|draft only|don'?t send|do not send|hold for now|preview only)\b/,
    /\b(сохрани как черновик|оставь как черновик|не отправляй|только черновик)\b/,
  ])) {
    nextAction.lifecycle.execution = {
      ...nextAction.lifecycle.execution,
      mode: 'save_draft',
      scheduledFor: undefined,
    }
    changed = true
  }

  if (containsAdvisorSchedulingIntent(message)) {
    const scheduled = parseAdvisorScheduledSend({
      message,
      timeZone: timeZone || nextAction.lifecycle.execution.timeZone,
    })
    if (scheduled) {
      nextAction.lifecycle.execution = {
        ...nextAction.lifecycle.execution,
        mode: 'send_later',
        scheduledFor: scheduled.scheduledFor,
        timeZone: scheduled.timeZone,
      }
      changed = true
    } else if (containsAny(lower, [/\b(send later|schedule|scheduled|later|tomorrow|tonight|next)\b/])) {
      nextAction.lifecycle.execution = {
        ...nextAction.lifecycle.execution,
        mode: 'send_later',
      }
      changed = true
    }
  }

  if (!changed) return null
  if (nextAction.lifecycle.execution.mode === 'send_later' && !nextAction.lifecycle.execution.scheduledFor) return null

  const flowLabel = currentAction.kind === 'trial_follow_up' ? 'Trial follow-up' : 'Renewal outreach'
  const modeLabel = nextAction.lifecycle.execution.mode === 'send_now'
    ? 'outreach'
    : nextAction.lifecycle.execution.mode === 'send_later'
      ? 'scheduled outreach'
      : 'draft'
  nextAction.title = currentAction.kind === 'trial_follow_up'
    ? 'Prepare trial follow-up'
    : 'Prepare renewal outreach'
  nextAction.summary = `${nextAction.lifecycle.channel.toUpperCase()} ${modeLabel} for ${nextAction.lifecycle.candidateCount} ${flowLabel.toLowerCase()} members`

  return nextAction
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
- Preserve campaign.execution unless the user clearly changes send timing or recipient restrictions.
- For "send now", set campaign.execution.mode=send_now.
- For "save as draft" or "don't send yet", set campaign.execution.mode=save_draft.
- For "send later" or any scheduled send request, set campaign.execution.mode=send_later and provide campaign.execution.scheduledFor as a UTC ISO string plus campaign.execution.timeZone.
- For "only members with email", set recipientRules.requireEmail=true.
- For "only members with phone", set recipientRules.requirePhone=true.
- For "SMS opt-ins only", set recipientRules.smsOptInOnly=true.
- If this is not clearly an edit of the active draft, return {"handled":false}.`

const EDIT_COPY: Record<'en' | 'ru' | 'es', {
  audienceUpdated: (name: string, count: number) => string
  campaignUpdated: (name: string, count: number) => string
  fillSessionUpdated: (title: string, count: number) => string
  reactivationUpdated: (title: string, count: number) => string
  membershipUpdated: (title: string, count: number) => string
  suggestions: Record<'create_cohort' | 'create_campaign' | 'fill_session' | 'reactivate_members' | 'trial_follow_up' | 'renewal_reactivation', string[]>
}> = {
  en: {
    audienceUpdated: (name, count) => `I updated the active audience "${name}" and it now targets ${count} matching members. Review the draft below and approve when you're ready.`,
    campaignUpdated: (name, count) => `I updated the active campaign for the audience "${name}" with ${count} matching members. Review the revised draft below and approve when you're ready.`,
    fillSessionUpdated: (title, count) => `I updated the active session fill draft for "${title}" with ${count} target players. Review the invite below and approve when you're ready.`,
    reactivationUpdated: (title, count) => `I updated the active reactivation draft for "${title}" with ${count} inactive members. Review the win-back message below and approve when you're ready.`,
    membershipUpdated: (title, count) => `I updated the active membership flow "${title}" with ${count} candidates. Review the revised draft below and approve when you're ready.`,
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
      fill_session: [
        'Use SMS instead',
        'Invite the top 3 players',
        'Pick another session',
      ],
      reactivate_members: [
        'Use SMS instead',
        'Only top 5 members',
        'Target 30+ day inactive members',
      ],
      trial_follow_up: [
        'Use SMS instead',
        'Only top 3 trial members',
        'Schedule this for tomorrow at 6pm',
      ],
      renewal_reactivation: [
        'Use SMS instead',
        'Only top 5 renewal candidates',
        'Schedule this for tomorrow at 9am',
      ],
    },
  },
  ru: {
    audienceUpdated: (name, count) => `Я обновил активную аудиторию "${name}". Сейчас в ней ${count} подходящих участников. Проверь черновик ниже и подтверди, когда будешь готов.`,
    campaignUpdated: (name, count) => `Я обновил активную кампанию для аудитории "${name}" на ${count} участников. Проверь обновленный черновик ниже и подтверди отправку.`,
    fillSessionUpdated: (title, count) => `Я обновил активный черновик заполнения для "${title}" на ${count} игроков. Проверь приглашение ниже и подтверди, когда будешь готов.`,
    reactivationUpdated: (title, count) => `Я обновил активный черновик реактивации для "${title}" на ${count} неактивных участников. Проверь win-back сообщение ниже и подтверди, когда будешь готов.`,
    membershipUpdated: (title, count) => `Я обновил активный membership-flow "${title}" на ${count} кандидатов. Проверь обновленный черновик ниже и подтверди, когда будешь готов.`,
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
      fill_session: [
        'Переключи на SMS',
        'Пригласи топ-3 игроков',
        'Выбери другую сессию',
      ],
      reactivate_members: [
        'Переключи на SMS',
        'Оставь только топ-5',
        'Возьми тех, кто не играл 30+ дней',
      ],
      trial_follow_up: [
        'Переключи на SMS',
        'Оставь только топ-3 trial-участников',
        'Запланируй это на завтра в 18:00',
      ],
      renewal_reactivation: [
        'Переключи на SMS',
        'Оставь только топ-5 renewal-кандидатов',
        'Запланируй это на завтра в 9 утра',
      ],
    },
  },
  es: {
    audienceUpdated: (name, count) => `Actualicé la audiencia activa "${name}" y ahora apunta a ${count} miembros. Revisa el borrador abajo y apruébalo cuando quieras.`,
    campaignUpdated: (name, count) => `Actualicé la campaña activa para la audiencia "${name}" con ${count} miembros. Revisa el borrador actualizado abajo y apruébalo cuando quieras.`,
    fillSessionUpdated: (title, count) => `Actualicé el borrador activo para llenar "${title}" con ${count} jugadores objetivo. Revisa la invitación abajo y apruébala cuando quieras.`,
    reactivationUpdated: (title, count) => `Actualicé el borrador activo de reactivación para "${title}" con ${count} miembros inactivos. Revisa el mensaje abajo y apruébalo cuando quieras.`,
    membershipUpdated: (title, count) => `Actualicé el flujo activo "${title}" con ${count} candidatos. Revisa el borrador abajo y apruébalo cuando quieras.`,
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
      fill_session: [
        'Usa SMS en su lugar',
        'Invita a los mejores 3 jugadores',
        'Elige otra sesión',
      ],
      reactivate_members: [
        'Usa SMS en su lugar',
        'Solo los mejores 5 miembros',
        'Apunta a quienes llevan 30+ días inactivos',
      ],
      trial_follow_up: [
        'Usa SMS en su lugar',
        'Solo los mejores 3 trial members',
        'Programa esto para mañana a las 6pm',
      ],
      renewal_reactivation: [
        'Usa SMS en su lugar',
        'Solo los mejores 5 candidatos',
        'Programa esto para mañana a las 9am',
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
  lastAction?: AdvisorAction | null
  sessions?: AdvisorSlotSessionOption[]
  timeZone?: string | null
}): Promise<AdvisorAction | null> {
  const { message, state, lastAction, sessions, timeZone } = opts
  const activeFillSession = getActiveFillSessionAction(lastAction)
  const activeReactivation = getActiveReactivationAction(lastAction)
  const activeMembershipLifecycle = getActiveMembershipLifecycleAction(lastAction)

  if (!isLikelyEditRequest(message, state, activeFillSession, activeReactivation, activeMembershipLifecycle)) return null
  if (!state?.currentAudience && !state?.currentCampaign && !activeFillSession && !activeReactivation && !state?.currentMembershipLifecycle && !activeMembershipLifecycle) return null

  const heuristicFillSessionEdit = applyHeuristicFillSessionEdit(message, activeFillSession, sessions)
  if (heuristicFillSessionEdit) return heuristicFillSessionEdit

  const heuristicReactivationEdit = applyHeuristicReactivationEdit(message, activeReactivation)
  if (heuristicReactivationEdit) return heuristicReactivationEdit

  const heuristicMembershipLifecycleEdit = applyHeuristicMembershipLifecycleEdit(message, activeMembershipLifecycle, timeZone)
  if (heuristicMembershipLifecycleEdit) return heuristicMembershipLifecycleEdit

  if (!state?.currentAudience && !state?.currentCampaign) return null

  const heuristicAudienceEdit = applyHeuristicAudienceEdit(message, state)
  if (heuristicAudienceEdit) return heuristicAudienceEdit

  const heuristicCampaignEdit = applyHeuristicCampaignEdit(message, state, timeZone)
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
    if (
      parsed.data.action.kind === 'create_campaign' &&
      parsed.data.action.campaign.execution.mode === 'send_later' &&
      !parsed.data.action.campaign.execution.scheduledFor
    ) {
      return null
    }
    return parsed.data.action
  } catch {
    return null
  }
}
