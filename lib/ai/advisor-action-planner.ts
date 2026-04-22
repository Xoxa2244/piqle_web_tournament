import 'server-only'

import { z } from 'zod'
import { generateWithFallback } from '@/lib/ai/llm/provider'
import type { SupportedLanguage } from '@/lib/ai/llm/language'
import { advisorCampaignTypeEnum, advisorChannelEnum, advisorDeliveryModeEnum } from './advisor-actions'
import { isAdvisorAdminReminderRoutingRequest } from './advisor-admin-reminder-policy'
import { isAdvisorAutonomyPolicyRequest } from './advisor-autonomy-policy'
import { isAdvisorContactPolicyRequest } from './advisor-contact-policy'
import { isAdvisorSandboxRoutingRequest } from './advisor-sandbox-policy'
import { containsAdvisorSchedulingIntent } from './advisor-scheduling'
import { parseAdvisorInactivityDays } from './advisor-reactivation'

const advisorIntentSchema = z.object({
  action: z.enum([
    'none',
    'create_cohort', 'draft_campaign', 'fill_session', 'reactivate_members',
    'trial_follow_up', 'renewal_reactivation', 'program_schedule',
    'update_contact_policy', 'update_autonomy_policy', 'update_sandbox_routing',
    'update_admin_reminder_routing',
    // ── Ops-oriented intents (read-only queries + kill switch) ──
    // Advisor is the single AI surface; these bring "Agent Dashboard"
    // interactions ("what's pending?", "stop the agent") inside the chat
    // so admins don't need to learn two paradigms.
    'ops_show_pending',       // "What needs approval?"
    'ops_show_activity',      // "What did the agent do today?"
    'ops_kill_switch',        // "Stop all AI sending"
    'ops_approve_pending',    // "Approve the reactivation one" / "approve all"
    'ops_skip_pending',       // "Skip all SMS" / "skip #2"
    'ops_snooze_pending',     // "Snooze all"
    'ops_show_decisions',     // "Why did you skip X?" / "show recent decisions"
  ]),
  usePreviousCohort: z.boolean().default(false),
  audienceText: z.string().optional(),
  campaignType: advisorCampaignTypeEnum.optional(),
  channel: advisorChannelEnum.optional(),
  deliveryMode: advisorDeliveryModeEnum.optional(),
  candidateLimit: z.number().int().min(1).max(20).optional(),
  inactivityDays: z.number().int().min(7).max(365).optional(),
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
- reactivate_members: pick inactive members worth winning back and prepare direct reactivation outreach
- trial_follow_up: prepare first-play outreach for trial members who joined recently but still have no confirmed booking
- renewal_reactivation: prepare renewal outreach for recently active members whose membership expired, was cancelled, or was suspended
- program_schedule: propose new recurring sessions or schedule changes as draft-only programming plans
- update_contact_policy: change quiet hours, cooldowns, or contact frequency rules for the club
- update_autonomy_policy: change what the agent can auto-run, what needs approval, or what stays off
- update_sandbox_routing: change whether sandbox runs stay preview-only or route to approved test recipients
- update_admin_reminder_routing: change how admin reminders are delivered and where reminder email/SMS should go
- none: any analytics/support/general question

Return ONLY valid JSON:
{"action":"none|create_cohort|draft_campaign|fill_session|reactivate_members|trial_follow_up|renewal_reactivation|program_schedule|update_contact_policy|update_autonomy_policy|update_sandbox_routing|update_admin_reminder_routing","usePreviousCohort":true|false,"audienceText":"...","campaignType":"...","channel":"...","deliveryMode":"save_draft|send_now|send_later","candidateLimit":5,"inactivityDays":21}

Rules:
- If the user asks to create/build/save an audience, segment, cohort, group, or list, use create_cohort.
- If the user asks to draft/create/launch/send a campaign, email, outreach, invite, or reactivation message, use draft_campaign.
- If the user asks to fill a specific session, underfilled slot, open spot, or invite players into a session, use fill_session.
- If the user asks to reactivate, win back, or bring back inactive/lapsed members directly, use reactivate_members.
- If the user asks to follow up with trial members who have not booked yet, use trial_follow_up.
- If the user asks for renewal outreach, expiring membership follow-up, or outreach to recently active expired/cancelled/suspended members, use renewal_reactivation.
- If the user asks what session to add, how to improve programming, what belongs on the schedule, to add a clinic/open play/drill/league slot, or to propose schedule changes, use program_schedule.
- If the user asks to change quiet hours, cooldowns, daily/weekly message caps, or outreach/contact policy rules, use update_contact_policy.
- If the user asks to change what the agent can do automatically, what needs approval, disable autopilot for an action, or change autonomy thresholds, use update_autonomy_policy.
- If the user asks to keep sandbox runs preview-only, route sandbox runs to test recipients, update sandbox whitelists, or change preview inbox routing, use update_sandbox_routing.
- If the user asks how admin reminders should be delivered, asks to email/text them reminders, or wants to set the admin reminder email/phone, use update_admin_reminder_routing.
- If the user is only asking what the current contact rules are, or wants an explanation of them, return action=none.
- If the user is only asking what the current autonomy/autopilot setup is, or wants an explanation of it, return action=none.
- If the user is only asking how sandbox preview works, or wants an explanation of it, return action=none.
- If the user refers to a previous audience with phrases like "that audience", "this segment", "those players", "that list", or "them", set usePreviousCohort=true.
- audienceText should be ONLY the audience description, not the whole request, when you can isolate it.
- campaignType must be one of: CHECK_IN, RETENTION_BOOST, REACTIVATION, SLOT_FILLER, EVENT_INVITE, NEW_MEMBER_WELCOME.
- channel must be one of: email, sms, both.
- deliveryMode must be one of: save_draft, send_now, send_later.
- candidateLimit should be set when the user specifies how many players to invite, like "top 5" or "invite 8 players".
- inactivityDays should be set when the user specifies how long members have been inactive, like "inactive 30 days" or "haven't played in 45 days".
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
  const wantsReactivation =
    /\b(reactivat|win[- ]?back|bring back|re-engage|inactive members?|inactive players?|lapsed members?|lapsed players?|churn(?:ed|ing)?)\b/.test(lower)
  const wantsTrialFollowUp =
    /\b(trial members?|trial players?|trial follow[- ]?up|first[- ]play|first booking|no confirmed booking|joined recently)\b/.test(lower) &&
    /\b(follow[- ]?up|nudge|reach out|outreach|message|draft|prepare|send)\b/.test(lower)
  const wantsRenewalReactivation =
    /\b(renew|renewal|membership expiring|expired membership|cancelled membership|canceled membership|suspended membership|renewal outreach)\b/.test(lower) &&
    /\b(outreach|message|reactivat|win[- ]?back|follow[- ]?up|draft|prepare|send)\b/.test(lower)
  const wantsProgramming =
    (
      /\b(program|programming|schedule|calendar|session mix|weekly plan|add)\b/.test(lower) &&
      /\b(session|clinic|drill|open play|league|social|slot|class|programming)\b/.test(lower)
    ) ||
    /\b(what should we add|what should i add|recommend sessions?|new session ideas?|add a beginner|add an intermediate|add an advanced)\b/.test(lower)
  const wantsSessionFill =
    /\b(fill|slot filler|underfilled|open spots?|empty slots?)\b/.test(lower) &&
    /\b(session|slot|court|today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|beginner|intermediate|advanced|\d{1,2}(:\d{2})?\s*(am|pm))\b/.test(lower)
  const wantsContactPolicy = isAdvisorContactPolicyRequest(message)
  const wantsAutonomyPolicy = isAdvisorAutonomyPolicyRequest(message)
  const wantsSandboxRouting = isAdvisorSandboxRoutingRequest(message)
  const wantsAdminReminderRouting = isAdvisorAdminReminderRoutingRequest(message)
  const inactivityDays = parseAdvisorInactivityDays(message) || undefined

  // ── Ops intents (read-only queries + kill switch) ──
  // Checked before campaign-draft fallbacks so "stop all sending" doesn't
  // get mis-classified as a draft request.
  const wantsShowPending =
    /\b(pending|awaiting|waiting|approval|approvals?|queue|review)\b/.test(lower) &&
    /\b(show|what|list|display|see|view|any)\b/.test(lower)
  const wantsShowActivity =
    /\b(activity|what did|what'?s.* done|recent actions?|history|today|today'?s)\b/.test(lower) &&
    /\b(agent|ai|assistant|it|you|system)\b/.test(lower)
  const wantsKillSwitch =
    /\b(stop|kill|halt|disable|pause|turn off|shut down|shutoff)\b/.test(lower) &&
    /\b(ai|agent|sending|sends|everything|all|outreach)\b/.test(lower)

  // Actionable pending-queue commands — "approve/skip/snooze" + at least
  // one selector keyword so we don't misread "approve later" as an
  // immediate action. Selectors: bulk ("all"/"every"), ordinal
  // ("first"/"#1"/"second"), type ("reactivation"/"slot filler"), or
  // channel ("sms"/"email").
  const hasPendingSelector =
    /\b(all|every|everything|first|second|third|fourth|last|1st|2nd|3rd|4th|5th|the\s+\w+\s+one)\b/.test(lower) ||
    /\b(sms|text|texts|emails?)\b/.test(lower) ||
    /\b(reactivat|slot[- ]?filler?|check[- ]?in|retention|invite|referral|trial|win[- ]?back)\b/.test(lower) ||
    /(?:#|item|number)\s*\d{1,2}\b/.test(lower)
  const wantsApprovePending =
    /\b(approve|go ahead with|send(?: it)?|launch|ok to send|approve\s+and\s+send)\b/.test(lower) &&
    hasPendingSelector
  const wantsSkipPending =
    /\b(skip|reject|decline|ignore|dismiss|cancel)\b/.test(lower) &&
    hasPendingSelector
  const wantsSnoozePending =
    /\b(snooze|later|postpone|hold|delay|remind me)\b/.test(lower) &&
    hasPendingSelector

  // "Why did you skip X?" / "show recent decisions" / "why was this
  // blocked?" — pulls from AgentDecisionRecord for audit clarity.
  const wantsShowDecisions =
    /\b(why|reasoning|decision|decisions|explain|because|skipped|blocked|reject(?:ed)?)\b/.test(lower) &&
    /\b(agent|ai|last|recent|previously|earlier|you|it)\b/.test(lower)

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

  // ── Ops intents first — "stop the agent" is unambiguous and should
  // never fall through to campaign drafting.
  if (wantsKillSwitch) {
    return { action: 'ops_kill_switch', usePreviousCohort: false }
  }
  // Action commands before read-only to catch "approve all SMS" rather
  // than letting it fall through to "sms campaign".
  if (wantsApprovePending) {
    return { action: 'ops_approve_pending', audienceText: message, usePreviousCohort: false }
  }
  if (wantsSkipPending) {
    return { action: 'ops_skip_pending', audienceText: message, usePreviousCohort: false }
  }
  if (wantsSnoozePending) {
    return { action: 'ops_snooze_pending', audienceText: message, usePreviousCohort: false }
  }
  if (wantsShowPending) {
    return { action: 'ops_show_pending', usePreviousCohort: false }
  }
  if (wantsShowActivity) {
    return { action: 'ops_show_activity', usePreviousCohort: false }
  }
  if (wantsShowDecisions) {
    return { action: 'ops_show_decisions', audienceText: message, usePreviousCohort: false }
  }

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

  if (wantsReactivation && !/\b(campaign|email campaign|sms campaign|draft campaign|audience|segment|cohort|list)\b/.test(lower)) {
    return {
      action: 'reactivate_members',
      usePreviousCohort: false,
      channel,
      candidateLimit,
      inactivityDays,
    }
  }

  if (wantsTrialFollowUp) {
    return {
      action: 'trial_follow_up',
      usePreviousCohort: false,
      channel,
      deliveryMode,
      candidateLimit,
    }
  }

  if (wantsRenewalReactivation) {
    return {
      action: 'renewal_reactivation',
      usePreviousCohort: false,
      channel,
      deliveryMode,
      candidateLimit,
    }
  }

  if (wantsProgramming) {
    return {
      action: 'program_schedule',
      usePreviousCohort: false,
    }
  }

  if (wantsContactPolicy) {
    return {
      action: 'update_contact_policy',
      usePreviousCohort: false,
    }
  }

  if (wantsAutonomyPolicy) {
    return {
      action: 'update_autonomy_policy',
      usePreviousCohort: false,
    }
  }

  if (wantsSandboxRouting) {
    return {
      action: 'update_sandbox_routing',
      usePreviousCohort: false,
    }
  }

  if (wantsAdminReminderRouting) {
    return {
      action: 'update_admin_reminder_routing',
      usePreviousCohort: false,
    }
  }

  if (wantsCampaign) {
    return { action: 'draft_campaign', audienceText: message, usePreviousCohort, campaignType, channel, deliveryMode, candidateLimit, inactivityDays }
  }

  return { action: 'none', usePreviousCohort: false }
}

export async function planAdvisorActionIntent(message: string): Promise<AdvisorIntentPlan> {
  const fallback = heuristicPlan(message)

  // Fast-path: when the regex/keyword heuristic already matched a concrete
  // action ("reactivate inactive members", "fill the Thursday slot",
  // "change quiet hours"), skip the LLM round-trip entirely — it saves
  // 2-5s on the critical path for the ~70% of prompts where our keyword
  // lexicon is unambiguous. The LLM is still consulted for genuinely
  // ambiguous or analytical phrasing where `action === 'none'`.
  if (fallback.action !== 'none') {
    return fallback
  }

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
  reactivationReady: (count: number, label: string) => string
  reactivationEmpty: (label: string) => string
  trialReady: (count: number, label: string) => string
  trialEmpty: (label: string) => string
  renewalReady: (count: number, label: string) => string
  renewalEmpty: (label: string) => string
  programmingReady: (count: number, title: string) => string
  programmingEmpty: string
  contactPolicyReady: (changes: number) => string
  autonomyPolicyReady: (changes: number) => string
  sandboxRoutingReady: (changes: number) => string
  adminReminderRoutingReady: (changes: number) => string
  adminOnly: string
  suggestions: Record<'create_cohort' | 'create_campaign' | 'fill_session' | 'reactivate_members' | 'trial_follow_up' | 'renewal_reactivation' | 'program_schedule' | 'update_contact_policy' | 'update_autonomy_policy' | 'update_sandbox_routing' | 'update_admin_reminder_routing', string[]>
}> = {
  en: {
    audienceReady: (count, name) => `I drafted the audience "${name}" and previewed ${count} matching members. Review it below and approve when you're ready.`,
    campaignReady: (count, name) => `I drafted a campaign for the audience "${name}" with ${count} matching members. Review the audience and message below, then approve to send it.`,
    campaignDraftReady: (count, name) => `I drafted a campaign for the audience "${name}" with ${count} matching members. Review it below, then approve to save it as a draft for later.`,
    campaignScheduledReady: (count, name, when) => `I drafted a campaign for the audience "${name}" with ${count} matching members. Review it below, then approve to schedule delivery for ${when}.`,
    fillSessionReady: (count, name, sessionLabel) => `I picked ${count} strong candidates for ${sessionLabel}. Review the invite below, then approve to message ${name}.`,
    fillSessionEmpty: (sessionLabel) => `I found the right session to fill, but I couldn't find strong invite candidates for ${sessionLabel} yet.`,
    reactivationReady: (count, label) => `I found ${count} reactivation candidates in "${label}". Review the win-back message below, then approve to send it.`,
    reactivationEmpty: (label) => `I couldn't find strong reactivation candidates in "${label}" right now.`,
    trialReady: (count, label) => `I found ${count} trial members in "${label}" who still need a first-play follow-up. Review the draft below, then approve when you're ready.`,
    trialEmpty: (label) => `I couldn't find strong trial follow-up candidates in "${label}" right now.`,
    renewalReady: (count, label) => `I found ${count} renewal candidates in "${label}". Review the outreach below, then approve when you're ready.`,
    renewalEmpty: (label) => `I couldn't find strong renewal outreach candidates in "${label}" right now.`,
    programmingReady: (count, title) => `I drafted ${count} schedule ideas around "${title}". Review the programming plan below, then approve to save it into the workspace.`,
    programmingEmpty: `I need a bit more schedule or preference data before I can draft strong programming ideas. Once the club has session history or member preferences, I can suggest what to add next.`,
    contactPolicyReady: (changes) => `I drafted ${changes} contact policy update${changes === 1 ? '' : 's'} for the club. Review the policy below, then approve to apply it.`,
    autonomyPolicyReady: (changes) => `I drafted ${changes} autonomy policy update${changes === 1 ? '' : 's'} for the club. Review the autopilot rules below, then approve to apply them.`,
    sandboxRoutingReady: (changes) => `I drafted ${changes} sandbox routing update${changes === 1 ? '' : 's'} for the club. Review the preview routing below, then approve to apply it.`,
    adminReminderRoutingReady: (changes) => `I drafted ${changes} admin reminder routing update${changes === 1 ? '' : 's'}. Review the reminder delivery below, then approve to apply it.`,
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
      program_schedule: [
        'Make the primary option an evening session',
        'Focus this on beginner programming',
        'Show me another schedule idea',
      ],
      update_contact_policy: [
        'Set quiet hours to 10pm-8am',
        'Use a 6 hour cooldown',
        'Limit outreach to 1 message per day',
      ],
      update_autonomy_policy: [
        'Set welcome to auto',
        'Keep slot filler on approval',
        'Turn reactivation off until membership data is stronger',
      ],
      update_sandbox_routing: [
        'Keep sandbox preview only',
        'Route sandbox emails to qa@iqsport.ai',
        'Add +15555550123 as an SMS test recipient',
      ],
      update_admin_reminder_routing: [
        'Remind me by email',
        'Text me admin reminders at +15555550123',
        'Keep admin reminders in-app only',
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
    reactivationReady: (count, label) => `Я нашел ${count} кандидатов на реактивацию в сегменте "${label}". Проверь win-back сообщение ниже и подтверди отправку.`,
    reactivationEmpty: (label) => `Сейчас я не вижу сильных кандидатов на реактивацию в сегменте "${label}".`,
    trialReady: (count, label) => `Я нашел ${count} trial-участников в сегменте "${label}", которым нужен first-play follow-up. Проверь черновик ниже и подтверди отправку.`,
    trialEmpty: (label) => `Сейчас я не вижу сильных trial-кандидатов для follow-up в сегменте "${label}".`,
    renewalReady: (count, label) => `Я нашел ${count} кандидатов на renewal outreach в сегменте "${label}". Проверь сообщение ниже и подтверди отправку.`,
    renewalEmpty: (label) => `Сейчас я не вижу сильных кандидатов на renewal outreach в сегменте "${label}".`,
    programmingReady: (count, title) => `Я подготовил ${count} идеи для расписания вокруг "${title}". Проверь programming plan ниже и подтверди, чтобы сохранить его в workspace.`,
    programmingEmpty: `Мне нужно чуть больше данных по расписанию или предпочтениям игроков, чтобы собрать сильный programming plan. Как только появится история сессий или member preferences, я предложу, что добавить в расписание.`,
    contactPolicyReady: (changes) => `Я подготовил ${changes} изменени${changes === 1 ? 'е' : changes < 5 ? 'я' : 'й'} contact policy клуба. Проверь правила ниже и подтверди применение.`,
    autonomyPolicyReady: (changes) => `Я подготовил ${changes} изменени${changes === 1 ? 'е' : changes < 5 ? 'я' : 'й'} autonomy policy клуба. Проверь правила автопилота ниже и подтверди применение.`,
    sandboxRoutingReady: (changes) => `Я подготовил ${changes} изменени${changes === 1 ? 'е' : changes < 5 ? 'я' : 'й'} sandbox routing клуба. Проверь preview-маршрутизацию ниже и подтверди применение.`,
    adminReminderRoutingReady: (changes) => `Я подготовил ${changes} изменени${changes === 1 ? 'е' : changes < 5 ? 'я' : 'й'} для admin reminders. Проверь способ доставки ниже и подтверди применение.`,
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
      program_schedule: [
        'Сделай основной вариант вечерней сессией',
        'Сфокусируй это на beginner-программировании',
        'Покажи другую идею для расписания',
      ],
      update_contact_policy: [
        'Поставь quiet hours с 22:00 до 8:00',
        'Сделай cooldown 6 часов',
        'Ограничь касания до 1 сообщения в день',
      ],
      update_autonomy_policy: [
        'Поставь welcome в auto',
        'Оставь slot filler на approve',
        'Выключи reactivation, пока membership-данные слабые',
      ],
      update_sandbox_routing: [
        'Оставь sandbox только в preview',
        'Маршрутизируй sandbox email на qa@iqsport.ai',
        'Добавь +15555550123 как SMS test recipient',
      ],
      update_admin_reminder_routing: [
        'Напоминай мне по email',
        'Шли admin reminders на +15555550123',
        'Оставь admin reminders только в приложении',
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
    reactivationReady: (count, label) => `Encontré ${count} candidatos de reactivación en "${label}". Revisa el mensaje abajo y apruébalo para enviarlo.`,
    reactivationEmpty: (label) => `No encuentro buenos candidatos de reactivación en "${label}" ahora mismo.`,
    trialReady: (count, label) => `Encontré ${count} miembros trial en "${label}" que todavía necesitan un follow-up para su primera reserva. Revisa el borrador abajo y apruébalo cuando quieras.`,
    trialEmpty: (label) => `No encuentro buenos candidatos trial para follow-up en "${label}" ahora mismo.`,
    renewalReady: (count, label) => `Encontré ${count} candidatos de renewal outreach en "${label}". Revisa el mensaje abajo y apruébalo cuando quieras.`,
    renewalEmpty: (label) => `No encuentro buenos candidatos de renewal outreach en "${label}" ahora mismo.`,
    programmingReady: (count, title) => `Preparé ${count} ideas de programación alrededor de "${title}". Revisa el plan abajo y apruébalo para guardarlo en el workspace.`,
    programmingEmpty: `Necesito un poco más de datos de horario o preferencias de miembros para armar un programming plan sólido. En cuanto haya más historial o preferencias, podré sugerir qué agregar al calendario.`,
    contactPolicyReady: (changes) => `Preparé ${changes} cambio${changes === 1 ? '' : 's'} en la política de contacto del club. Revisa la política abajo y apruébala para aplicarla.`,
    autonomyPolicyReady: (changes) => `Preparé ${changes} cambio${changes === 1 ? '' : 's'} en la política de autonomía del club. Revisa las reglas del autopiloto abajo y apruébalas para aplicarlas.`,
    sandboxRoutingReady: (changes) => `Preparé ${changes} cambio${changes === 1 ? '' : 's'} en el sandbox routing del club. Revisa la ruta de preview abajo y apruébala para aplicarla.`,
    adminReminderRoutingReady: (changes) => `Preparé ${changes} cambio${changes === 1 ? '' : 's'} en el routing de recordatorios del admin. Revisa la entrega abajo y apruébala para aplicarla.`,
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
      program_schedule: [
        'Haz la opción principal una sesión por la tarde',
        'Enfócalo en programación para principiantes',
        'Muéstrame otra idea de horario',
      ],
      update_contact_policy: [
        'Pon quiet hours de 10pm a 8am',
        'Usa un cooldown de 6 horas',
        'Limita el outreach a 1 mensaje por día',
      ],
      update_autonomy_policy: [
        'Pon welcome en auto',
        'Deja slot filler con aprobación',
        'Apaga reactivation hasta que membership sea más fiable',
      ],
      update_sandbox_routing: [
        'Mantén el sandbox solo en preview',
        'Enruta los emails sandbox a qa@iqsport.ai',
        'Agrega +15555550123 como destinatario de prueba por SMS',
      ],
      update_admin_reminder_routing: [
        'Recuérdame por email',
        'Envíame recordatorios admin por SMS al +15555550123',
        'Deja los recordatorios solo dentro de la app',
      ],
    },
  },
}

export function getAdvisorActionCopy(language: SupportedLanguage | string) {
  const locale = language === 'ru' || language === 'es' ? language : 'en'
  return ACTION_COPY[locale]
}
