import { getServerSession } from 'next-auth'
import { parse as parseCookie } from 'cookie'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { appRouter } from '@/server/routers/_app'
import { detectLanguage, type SupportedLanguage } from '@/lib/ai/llm/language'
import { buildAdvisorActionTag, extractAdvisorAction, type AdvisorAction } from '@/lib/ai/advisor-actions'
import { getAdvisorActionCopy, planAdvisorActionIntent } from '@/lib/ai/advisor-action-planner'
import {
  type AdvisorConversationState,
  buildAdvisorConversationStateFromAction,
  deriveAdvisorConversationState,
  withAdvisorPendingClarification,
} from '@/lib/ai/advisor-conversation-state'
import { getAdvisorEditCopy, maybeEditAdvisorDraft } from '@/lib/ai/advisor-draft-editor'
import {
  evaluateAdvisorContactGuardrails,
  formatAdvisorGuardrailDigest,
} from '@/lib/ai/advisor-contact-guardrails'
import {
  formatAdvisorContactPolicyDigest,
  resolveAdvisorContactPolicy,
  updateAdvisorContactPolicyFromMessage,
  type AdvisorContactPolicyDraft,
} from '@/lib/ai/advisor-contact-policy'
import {
  maybeStartAdvisorClarification,
  resolveAdvisorClarification,
} from '@/lib/ai/advisor-clarifications'
import {
  buildAdvisorReactivationLabel,
  parseAdvisorInactivityDays,
} from '@/lib/ai/advisor-reactivation'
import {
  formatAdvisorScheduledLabel,
  parseAdvisorScheduledSend,
  resolveAdvisorClubTimeZone,
} from '@/lib/ai/advisor-scheduling'
import {
  buildAdvisorSlotSessionOptions,
  formatAdvisorSlotSessionLabel,
  resolveAdvisorSlotSession,
  type AdvisorSlotSessionOption,
} from '@/lib/ai/advisor-slot-filler'
import { buildCohortWhereClause, type CohortFilter } from '@/server/routers/intelligence'

async function getSessionFromRequest(req: Request) {
  try {
    const nextAuthSession = await getServerSession(authOptions)
    if (nextAuthSession?.user?.id) {
      return { userId: nextAuthSession.user.id, user: nextAuthSession.user }
    }
  } catch (e) {
    console.warn('[Advisor Action] getServerSession failed, falling back to cookie:', e)
  }

  const cookieHeader = req.headers.get('cookie')
  if (!cookieHeader) return null

  const cookies = parseCookie(cookieHeader)
  const sessionToken =
    cookies['__Secure-next-auth.session-token'] ||
    cookies['__Host-next-auth.session-token'] ||
    cookies['next-auth.session-token'] ||
    cookies['_Secure-next-auth.session-token'] ||
    null

  if (!sessionToken) return null

  const dbSession = await prisma.session.findUnique({
    where: { sessionToken },
    include: { user: true },
  })

  if (!dbSession || dbSession.expires < new Date()) return null
  return { userId: dbSession.userId, user: dbSession.user }
}

async function verifyClubMembership(clubId: string, userId: string) {
  const [admin, follower] = await Promise.all([
    prisma.clubAdmin.findFirst({ where: { clubId, userId } }),
    prisma.clubFollower.findFirst({ where: { clubId, userId } }),
  ])

  return { isAdmin: !!admin, hasAccess: !!(admin || follower) }
}

function buildSessionForCaller(session: Awaited<ReturnType<typeof getSessionFromRequest>>) {
  if (!session) return null
  return {
    user: {
      id: session.userId,
      email: session.user?.email || null,
      name: session.user?.name || null,
      image: session.user?.image || null,
    },
    expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  }
}

async function getOrCreateConversation(opts: {
  clubId: string
  userId: string
  conversationId?: string | null
  titleSource: string
  language: SupportedLanguage
}) {
  if (opts.conversationId) {
    const existing = await prisma.aIConversation.findFirst({
      where: { id: opts.conversationId, clubId: opts.clubId, userId: opts.userId },
      select: { id: true },
    })
    if (existing) return existing.id
  }

  const conversation = await prisma.aIConversation.create({
    data: {
      clubId: opts.clubId,
      userId: opts.userId,
      title: opts.titleSource.slice(0, 100) || 'New conversation',
      language: opts.language,
    },
    select: { id: true },
  })

  return conversation.id
}

async function getLastAdvisorAction(conversationId: string): Promise<AdvisorAction | null> {
  const priorMessages = await prisma.aIMessage.findMany({
    where: { conversationId, role: 'assistant' },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { content: true },
  })

  for (const message of priorMessages) {
    const action = extractAdvisorAction(message.content)
    if (action) return action
  }

  return null
}

async function getAdvisorConversationMemory(conversationId: string) {
  const priorMessages = await prisma.aIMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    take: 20,
    select: { role: true, content: true, metadata: true },
  })

  let lastAction: AdvisorAction | null = null
  for (let index = priorMessages.length - 1; index >= 0; index -= 1) {
    const message = priorMessages[index]
    if (message.role !== 'assistant') continue
    const action = extractAdvisorAction(message.content)
    if (action) {
      lastAction = action
      break
    }
  }

  return {
    state: deriveAdvisorConversationState(priorMessages),
    lastAction,
  }
}

function withSuggested(text: string, suggestions: string[]) {
  return `${text}\n\n<suggested>\n${suggestions.join('\n')}\n</suggested>`
}

function truncateAdvisorText(text: string, maxChars: number) {
  const trimmed = text.trim()
  if (trimmed.length <= maxChars) return trimmed
  return `${trimmed.slice(0, Math.max(0, maxChars - 1)).trim()}…`
}

function buildCampaignReadyText(
  copy: ReturnType<typeof getAdvisorActionCopy>,
  count: number,
  name: string,
  mode: 'save_draft' | 'send_now' | 'send_later',
  scheduledLabel?: string | null,
) {
  if (mode === 'send_now') return copy.campaignReady(count, name)
  if (mode === 'send_later') return copy.campaignScheduledReady(count, name, scheduledLabel || 'the selected time')
  return copy.campaignDraftReady(count, name)
}

type AdvisorCampaignAction = Extract<AdvisorAction, { kind: 'create_campaign' }>
type AdvisorContactPolicyAction = Extract<AdvisorAction, { kind: 'update_contact_policy' }>

async function queryAdvisorAudienceMembers(clubId: string, filters: CohortFilter[]) {
  const where = buildCohortWhereClause(filters)
  return prisma.$queryRawUnsafe<Array<{
    id: string
    name: string | null
    email: string | null
    phone: string | null
    smsOptIn: boolean | null
  }>>(`
    SELECT u.id, u.name, u.email, u.phone, u.sms_opt_in as "smsOptIn"
    FROM club_followers cf
    JOIN users u ON u.id = cf.user_id
    JOIN (
      SELECT DISTINCT psb."userId"
      FROM play_session_bookings psb
      JOIN play_sessions ps ON ps.id = psb."sessionId"
      WHERE ps."clubId" = $1 AND psb.status = 'CONFIRMED'
    ) active ON active."userId" = u.id
    WHERE cf.club_id = $1 AND ${where}
    ORDER BY u.name ASC
    LIMIT 500
  `, clubId)
}

function applyAdvisorCampaignRecipientRules(
  members: Array<{ id: string; email?: string | null; phone?: string | null; smsOptIn?: boolean | null }>,
  rules?: AdvisorCampaignAction['campaign']['execution']['recipientRules'],
) {
  if (!rules) return members

  return members.filter((member) => {
    if (rules.requireEmail && !member.email) return false
    if (rules.requirePhone && !member.phone) return false
    if (rules.smsOptInOnly && !member.smsOptIn) return false
    return true
  })
}

function buildCampaignSummary(
  channel: AdvisorCampaignAction['campaign']['channel'],
  mode: AdvisorCampaignAction['campaign']['execution']['mode'],
  eligibleCount: number,
) {
  const modeLabel = mode === 'send_now'
    ? 'outreach'
    : mode === 'send_later'
      ? 'scheduled outreach'
      : 'draft'
  return `${channel.toUpperCase()} ${modeLabel} for ${eligibleCount} eligible member${eligibleCount === 1 ? '' : 's'}`
}

async function hydrateAdvisorCampaignAction(opts: {
  clubId: string
  action: AdvisorCampaignAction
  timeZone?: string | null
  automationSettings?: unknown
}) {
  const members = await queryAdvisorAudienceMembers(opts.clubId, opts.action.audience.filters as CohortFilter[])
  const ruleEligibleMembers = applyAdvisorCampaignRecipientRules(
    members,
    opts.action.campaign.execution.recipientRules,
  )
  const guardrails = await evaluateAdvisorContactGuardrails({
    prisma,
    clubId: opts.clubId,
    type: opts.action.campaign.type,
    requestedChannel: opts.action.campaign.channel,
    candidates: ruleEligibleMembers.map((member) => ({ memberId: member.id })),
    timeZone: opts.action.campaign.execution.timeZone || opts.timeZone,
    automationSettings: opts.automationSettings,
    now: opts.action.campaign.execution.mode === 'send_later' && opts.action.campaign.execution.scheduledFor
      ? new Date(opts.action.campaign.execution.scheduledFor)
      : new Date(),
  })
  const excludedByRules = Math.max(0, members.length - ruleEligibleMembers.length)

  const action: AdvisorCampaignAction = {
    ...opts.action,
    summary: buildCampaignSummary(
      opts.action.campaign.channel,
      opts.action.campaign.execution.mode,
      guardrails.summary.eligibleCount,
    ),
    audience: {
      ...opts.action.audience,
      count: members.length,
    },
    campaign: {
      ...opts.action.campaign,
      guardrails: guardrails.summary,
    },
  }

  return {
    action,
    audienceCount: members.length,
    excludedByRules,
    guardrails: guardrails.summary,
  }
}

function buildContactPolicyAction(policy: AdvisorContactPolicyDraft): AdvisorContactPolicyAction {
  return {
    kind: 'update_contact_policy',
    title: 'Update club contact policy',
    summary: formatAdvisorContactPolicyDigest(policy),
    requiresApproval: true,
    policy,
  }
}

function getSlotFillerCopy(language: SupportedLanguage | string) {
  if (language === 'ru') {
    return {
      needSession: 'Какую недозаполненную сессию мне заполнить?',
      repeatSession: 'Мне все еще нужна конкретная сессия. Выбери одну из вариантов ниже или опиши ее по времени/формату.',
      noSessions: 'Я не вижу недозаполненных сессий на ближайшие дни. Когда появятся свободные слоты, я смогу подобрать игроков и подготовить приглашения.',
      noCandidates: (sessionLabel: string) => `Я нашел нужную сессию, но пока не вижу сильных кандидатов для приглашения на ${sessionLabel}.`,
      ready: (count: number, sessionLabel: string) => `Я подобрал ${count} кандидатов для ${sessionLabel}. Проверь приглашение ниже и подтверди отправку.`,
      suggestions: ['Переключи на SMS', 'Пригласи топ-8 игроков', 'Покажи другую недозаполненную сессию'],
    }
  }

  if (language === 'es') {
    return {
      needSession: '¿Qué sesión con huecos debo llenar?',
      repeatSession: 'Todavía necesito una sesión específica. Elige una de las opciones de abajo o descríbela por hora o formato.',
      noSessions: 'No veo sesiones con huecos en los próximos días. En cuanto aparezcan, podré elegir jugadores y preparar invitaciones.',
      noCandidates: (sessionLabel: string) => `Encontré la sesión correcta, pero todavía no veo buenos candidatos para invitar a ${sessionLabel}.`,
      ready: (count: number, sessionLabel: string) => `Elegí ${count} candidatos para ${sessionLabel}. Revisa la invitación abajo y apruébala para enviarla.`,
      suggestions: ['Usa SMS en su lugar', 'Invita a los mejores 8 jugadores', 'Muéstrame otra sesión con huecos'],
    }
  }

  return {
    needSession: 'Which underfilled session should I fill?',
    repeatSession: 'I still need a specific session. Pick one of the options below or describe it by time or format.',
    noSessions: `I don't see any underfilled sessions coming up right now. As soon as there are open spots, I can pick the best players and prepare invites.`,
    noCandidates: (sessionLabel: string) => `I found the right session, but I couldn't find strong invite candidates for ${sessionLabel} yet.`,
    ready: (count: number, sessionLabel: string) => `I picked ${count} candidates for ${sessionLabel}. Review the invite below, then approve to send it.`,
    suggestions: ['Use SMS instead', 'Invite the top 8 players', 'Show me another underfilled session'],
  }
}

function getReactivationCopy(language: SupportedLanguage | string) {
  if (language === 'ru') {
    return {
      empty: (label: string) => `Сейчас я не вижу сильных кандидатов на реактивацию в сегменте "${label}".`,
      ready: (count: number, label: string) => `Я нашел ${count} кандидатов на реактивацию в сегменте "${label}". Проверь win-back сообщение ниже и подтверди отправку.`,
      suggestions: ['Переключи на SMS', 'Оставь только топ-5', 'Возьми тех, кто не играл 30+ дней'],
    }
  }

  if (language === 'es') {
    return {
      empty: (label: string) => `No encuentro buenos candidatos de reactivación en "${label}" ahora mismo.`,
      ready: (count: number, label: string) => `Encontré ${count} candidatos de reactivación en "${label}". Revisa el mensaje abajo y apruébalo para enviarlo.`,
      suggestions: ['Usa SMS en su lugar', 'Solo los mejores 5 miembros', 'Apunta a quienes llevan 30+ días inactivos'],
    }
  }

  return {
    empty: (label: string) => `I couldn't find strong reactivation candidates in "${label}" right now.`,
    ready: (count: number, label: string) => `I found ${count} reactivation candidates in "${label}". Review the win-back message below, then approve to send it.`,
    suggestions: ['Use SMS instead', 'Only top 5 members', 'Target 30+ day inactive members'],
  }
}

function getContactPolicyCopy(language: SupportedLanguage | string) {
  if (language === 'ru') {
    return {
      needChanges: 'Скажи, что именно поменять в contact policy: quiet hours, cooldown, дневной лимит, недельный лимит или окно recent booking.',
    }
  }

  if (language === 'es') {
    return {
      needChanges: 'Dime que quieres cambiar en la politica de contacto: quiet hours, cooldown, limite diario, limite semanal o la ventana de recent booking.',
    }
  }

  return {
    needChanges: 'Tell me what to change in the contact policy: quiet hours, cooldown, daily cap, weekly cap, or the recent booking suppression window.',
  }
}

function normalizeSlotSession(raw: any): AdvisorSlotSessionOption {
  const registered = raw.registered ?? raw.confirmedCount ?? 0
  const maxPlayers = raw.maxPlayers || 1
  const occupancy = raw.occupancy ?? Math.round((registered / Math.max(maxPlayers, 1)) * 100)
  return {
    id: raw.id ?? raw.sessionId,
    title: raw.title || raw.format || 'Session',
    date: String(raw.date || ''),
    startTime: raw.startTime || raw.time || '',
    endTime: raw.endTime || null,
    format: raw.format || null,
    skillLevel: raw.skillLevel || null,
    court: raw.court || raw.courtName || null,
    registered,
    maxPlayers,
    occupancy,
    spotsRemaining: raw.spotsRemaining ?? Math.max(0, maxPlayers - registered),
  }
}

async function loadAdvisorSlotSessions(caller: ReturnType<typeof appRouter.createCaller>, clubId: string) {
  const result = await caller.intelligence.getUnderfilledSessions({ clubId, days: 14 })
  return ((result as any)?.sessions || []).map(normalizeSlotSession)
}

async function buildFillSessionAssistantResponse(opts: {
  caller: ReturnType<typeof appRouter.createCaller>
  prisma: any
  clubId: string
  language: SupportedLanguage
  state: AdvisorConversationState | null
  message: string
  sessionId?: string | null
  channel?: Extract<AdvisorAction, { kind: 'fill_session' }>['outreach']['channel']
  candidateLimit?: number
  timeZone?: string | null
  automationSettings?: unknown
}) {
  const { caller, prisma, clubId, language, state, message, sessionId, channel = 'email' } = opts
  const slotCopy = getSlotFillerCopy(language)
  const sessions = await loadAdvisorSlotSessions(caller, clubId)

  if (sessions.length === 0) {
    const assistantState: AdvisorConversationState = {
      ...(state || {}),
      currentSession: undefined,
      lastActionKind: 'fill_session',
      lastActionTitle: 'Fill an underfilled session',
      updatedAt: new Date().toISOString(),
    }

    return {
      assistantState,
      assistantMessage: withSuggested(slotCopy.noSessions, slotCopy.suggestions),
    }
  }

  const explicitSession = sessionId
    ? sessions.find((session: AdvisorSlotSessionOption) => session.id === sessionId) || null
    : null
  const resolvedSession = explicitSession
    ? explicitSession
    : resolveAdvisorSlotSession({
        message,
        sessions,
        currentSession: state?.currentSession,
      }).session

  if (!resolvedSession) {
    const pending = {
      action: 'fill_session' as const,
      field: 'session' as const,
      question: slotCopy.needSession,
      options: buildAdvisorSlotSessionOptions(sessions),
      originalMessage: message,
      channel,
      candidateLimit: opts.candidateLimit,
      sessionOptions: sessions.slice(0, 6),
    }

    return {
      assistantState: withAdvisorPendingClarification(state, pending),
      assistantMessage: withSuggested(slotCopy.needSession, pending.options),
    }
  }

  const candidateLimit = Math.min(Math.max(opts.candidateLimit || 5, 1), 20)
  const recommendations = await caller.intelligence.getSlotFillerRecommendations({
    sessionId: resolvedSession.id,
    limit: candidateLimit,
    clubId,
  })
  const rawCandidates = ((recommendations as any)?.recommendations || [])
    .slice(0, candidateLimit)
    .map((candidate: any) => ({
      memberId: candidate.member?.id || candidate.memberId,
      name: candidate.member?.name || 'Unknown',
      score: Math.max(0, Math.min(100, Math.round(candidate.score || 0))),
      likelihood: candidate.estimatedLikelihood || undefined,
      email: candidate.member?.email || undefined,
    }))
    .filter((candidate: any) => !!candidate.memberId)

  const guardrails = await evaluateAdvisorContactGuardrails({
    prisma,
    clubId,
    type: 'SLOT_FILLER',
    requestedChannel: channel,
    candidates: rawCandidates.map((candidate: any) => ({ memberId: candidate.memberId })),
    sessionId: resolvedSession.id,
    timeZone: opts.timeZone,
    automationSettings: opts.automationSettings,
  })
  const candidates = rawCandidates
    .map((candidate: any) => {
      const eligible = guardrails.eligibleCandidates.find((entry) => entry.memberId === candidate.memberId)
      if (!eligible) return null
      return {
        ...candidate,
        channel: eligible.channel,
      }
    })
    .filter(Boolean)

  if (candidates.length === 0) {
    const assistantState: AdvisorConversationState = {
      ...(state || {}),
      currentSession: resolvedSession,
      lastActionKind: 'fill_session',
      lastActionTitle: `Fill session: ${resolvedSession.title}`,
      updatedAt: new Date().toISOString(),
    }

    return {
      assistantState,
      assistantMessage: withSuggested(
        `${slotCopy.noCandidates(formatAdvisorSlotSessionLabel(resolvedSession))} ${formatAdvisorGuardrailDigest(guardrails.summary)}`.trim(),
        slotCopy.suggestions,
      ),
    }
  }

  const generated = await caller.intelligence.generateCampaignMessage({
    clubId,
    campaignType: 'SLOT_FILLER',
    channel,
    audienceCount: candidates.length,
    context: {
      sessionTitle: resolvedSession.title,
    },
  })

  const action: AdvisorAction = {
    kind: 'fill_session',
    title: `Fill session: ${resolvedSession.title}`,
      summary: `${channel.toUpperCase()} invites for ${candidates.length} matched players`,
      requiresApproval: true,
      session: resolvedSession,
      outreach: {
        channel,
        candidateCount: candidates.length,
        message: channel === 'sms'
          ? (generated.smsBody || generated.body)
          : generated.body,
        candidates,
        guardrails: guardrails.summary,
      },
    }

  const guardrailNote = formatAdvisorGuardrailDigest(guardrails.summary)
  return {
    assistantState: buildAdvisorConversationStateFromAction(action),
    assistantMessage: withSuggested(
      `${slotCopy.ready(candidates.length, formatAdvisorSlotSessionLabel(resolvedSession))}${guardrailNote ? `\n\n${guardrailNote}` : ''}\n\n${buildAdvisorActionTag(action)}`,
      slotCopy.suggestions,
    ),
    action,
  }
}

async function buildReactivationAssistantResponse(opts: {
  caller: ReturnType<typeof appRouter.createCaller>
  prisma: any
  clubId: string
  language: SupportedLanguage
  state: AdvisorConversationState | null
  message: string
  inactivityDays?: number
  channel?: Extract<AdvisorAction, { kind: 'reactivate_members' }>['reactivation']['channel']
  candidateLimit?: number
  timeZone?: string | null
  automationSettings?: unknown
}) {
  const { caller, prisma, clubId, language, state, message, channel = 'email' } = opts
  const reactivationCopy = getReactivationCopy(language)
  const inactivityDays = parseAdvisorInactivityDays(message) || opts.inactivityDays || 21
  const candidateLimit = Math.min(Math.max(opts.candidateLimit || 10, 1), 25)
  const segmentLabel = buildAdvisorReactivationLabel(inactivityDays)

  const result = await caller.intelligence.getReactivationCandidates({
    clubId,
    inactivityDays,
    limit: candidateLimit,
  })

  const rawCandidates = ((result as any)?.candidates || [])
    .slice(0, candidateLimit)
    .map((candidate: any) => ({
      memberId: candidate.member?.id || candidate.memberId,
      name: candidate.member?.name || candidate.member?.email || 'Unknown',
      score: Math.max(0, Math.min(100, Math.round(candidate.score || 0))),
      daysSinceLastActivity: Math.max(0, Math.round(candidate.daysSinceLastActivity || 0)),
      topReason: candidate.churnReasons?.[0]?.summary || undefined,
      suggestedSessionTitle: candidate.suggestedSessions?.[0]?.title || undefined,
    }))
    .filter((candidate: any) => !!candidate.memberId)

  const guardrails = await evaluateAdvisorContactGuardrails({
    prisma,
    clubId,
    type: 'REACTIVATION',
    requestedChannel: channel,
    candidates: rawCandidates.map((candidate: any) => ({ memberId: candidate.memberId })),
    timeZone: opts.timeZone,
    automationSettings: opts.automationSettings,
  })
  const candidates = rawCandidates
    .map((candidate: any) => {
      const eligible = guardrails.eligibleCandidates.find((entry) => entry.memberId === candidate.memberId)
      if (!eligible) return null
      return {
        ...candidate,
        channel: eligible.channel,
      }
    })
    .filter(Boolean)

  if (candidates.length === 0) {
    const assistantState: AdvisorConversationState = {
      ...(state || {}),
      currentReactivation: undefined,
      lastActionKind: 'reactivate_members',
      lastActionTitle: `Reactivate: ${segmentLabel}`,
      updatedAt: new Date().toISOString(),
    }

    return {
      assistantState,
      assistantMessage: withSuggested(
        `${reactivationCopy.empty(segmentLabel)} ${formatAdvisorGuardrailDigest(guardrails.summary)}`.trim(),
        reactivationCopy.suggestions,
      ),
    }
  }

  const generated = await caller.intelligence.generateCampaignMessage({
    clubId,
    campaignType: 'REACTIVATION',
    channel,
    audienceCount: candidates.length,
    context: {
      riskSegment: segmentLabel,
      inactivityDays,
    },
  })

  const messagePreview = channel === 'email'
    ? truncateAdvisorText(generated.body, 500)
    : truncateAdvisorText(generated.smsBody || generated.body, 160)

  const action: AdvisorAction = {
    kind: 'reactivate_members',
    title: `Reactivate: ${segmentLabel}`,
    summary: `${channel.toUpperCase()} win-back outreach for ${candidates.length} inactive members`,
    requiresApproval: true,
    reactivation: {
      segmentLabel,
      inactivityDays,
      channel,
      candidateCount: candidates.length,
      message: messagePreview,
      candidates,
      guardrails: guardrails.summary,
    },
  }

  const guardrailNote = formatAdvisorGuardrailDigest(guardrails.summary)
  return {
    assistantState: buildAdvisorConversationStateFromAction(action),
    assistantMessage: withSuggested(
      `${reactivationCopy.ready(candidates.length, segmentLabel)}${guardrailNote ? `\n\n${guardrailNote}` : ''}\n\n${buildAdvisorActionTag(action)}`,
      reactivationCopy.suggestions,
    ),
    action,
  }
}

function isCampaignOnlyFollowUp(message: string) {
  const lower = message.toLowerCase()
  const hasCampaignVerb = /\b(campaign|email|sms|text|message|outreach|send|launch|draft|reactivat|invite)\b/.test(lower)
  const hasAudienceHint = /\b(audience|segment|cohort|group|list|players?|members?|this|that|those|them|inactive|morning|evening|weekday|weekend|beginner|intermediate|competitive|women|men|\d+\+)\b/.test(lower)
  return hasCampaignVerb && !hasAudienceHint
}

export async function POST(req: Request) {
  try {
    const session = await getSessionFromRequest(req)
    if (!session) {
      return new Response('Unauthorized', { status: 401 })
    }

    const body = await req.json()
    const { clubId, message, conversationId } = body as {
      clubId?: string
      message?: string
      conversationId?: string | null
    }

    if (!clubId || !message?.trim()) {
      return Response.json({ error: 'clubId and message are required' }, { status: 400 })
    }

    const access = await verifyClubMembership(clubId, session.userId)
    if (!access.hasAccess) {
      return new Response('Forbidden', { status: 403 })
    }

    const clubContext = await prisma.club.findUnique({
      where: { id: clubId },
      select: {
        automationSettings: true,
        address: true,
        state: true,
        country: true,
      },
    })
    const clubTimeZone = resolveAdvisorClubTimeZone({
      automationSettings: clubContext?.automationSettings,
      address: clubContext?.address,
      state: clubContext?.state,
      country: clubContext?.country,
    })

    const language = detectLanguage(message)

    const convId = await getOrCreateConversation({
      clubId,
      userId: session.userId,
      conversationId,
      titleSource: message,
      language,
    })

    const caller = appRouter.createCaller({
      prisma,
      session: buildSessionForCaller(session),
    } as any)

    const memory = await getAdvisorConversationMemory(convId)
    let effectiveMessage = message
    let plan = memory.state?.pendingClarification
      ? null
      : await planAdvisorActionIntent(message)
    let assistantMessage = ''
    const copy = getAdvisorActionCopy(language)
    let assistantState: AdvisorConversationState | null = null
    const hadPendingClarification = !!memory.state?.pendingClarification

    if (access.isAdmin && memory.state?.pendingClarification) {
      if (
        memory.state.pendingClarification.action === 'fill_session' &&
        memory.state.pendingClarification.field === 'session'
      ) {
        const slotCopy = getSlotFillerCopy(language)
        const sessionOptions = memory.state.pendingClarification.sessionOptions || []
        const resolved = resolveAdvisorSlotSession({
          message,
          sessions: sessionOptions,
          currentSession: memory.state.currentSession,
        })

        if (!resolved.session) {
          assistantState = withAdvisorPendingClarification(memory.state, {
            ...memory.state.pendingClarification,
            question: slotCopy.repeatSession,
            options: buildAdvisorSlotSessionOptions(sessionOptions),
          })
          assistantMessage = withSuggested(slotCopy.repeatSession, buildAdvisorSlotSessionOptions(sessionOptions))
        } else {
          plan = {
            action: 'fill_session',
            usePreviousCohort: false,
            channel: memory.state.pendingClarification.channel,
            candidateLimit: memory.state.pendingClarification.candidateLimit,
            sessionId: resolved.session.id,
          }
        }
      } else {
        const resolution = resolveAdvisorClarification({
          message,
          pending: memory.state.pendingClarification,
          state: memory.state,
          language,
        })

        if (resolution?.clarification) {
          assistantState = withAdvisorPendingClarification(memory.state, resolution.clarification.pending)
          assistantMessage = withSuggested(resolution.clarification.text, resolution.clarification.suggestions)
        } else if (resolution?.plan) {
          plan = resolution.plan
          effectiveMessage = resolution.plan.audienceText || message
        }
      }
    }

    if (!plan) {
      plan = await planAdvisorActionIntent(effectiveMessage)
    }

    if (!access.isAdmin) {
      if (plan.action !== 'none') {
        const suggestionKey = plan.action === 'create_cohort'
          ? 'create_cohort'
          : plan.action === 'fill_session'
            ? 'fill_session'
            : plan.action === 'reactivate_members'
              ? 'reactivate_members'
            : plan.action === 'update_contact_policy'
              ? 'update_contact_policy'
            : 'create_campaign'
        assistantMessage = withSuggested(copy.adminOnly, copy.suggestions[suggestionKey])
      }
    } else {
      if (!assistantMessage && !hadPendingClarification) {
        const editedContactPolicy = memory.state?.currentContactPolicy
          ? updateAdvisorContactPolicyFromMessage({
              message,
              currentPolicy: memory.state.currentContactPolicy,
              allowImplicit: true,
            })
          : null
        if (editedContactPolicy) {
          const action = buildContactPolicyAction(editedContactPolicy)
          assistantState = buildAdvisorConversationStateFromAction(action)
          assistantMessage = withSuggested(
            [
              copy.contactPolicyReady(action.policy.changes.length),
              ...action.policy.changes,
              buildAdvisorActionTag(action),
            ].join('\n\n'),
            copy.suggestions.update_contact_policy,
          )
        }
      }

      if (!assistantMessage && !hadPendingClarification) {
        const activeFillSession = memory.lastAction?.kind === 'fill_session'
        const fillSessionEditSessions = activeFillSession
          ? await loadAdvisorSlotSessions(caller, clubId)
          : undefined
        const editedAction = await maybeEditAdvisorDraft({
          message,
          state: memory.state,
          lastAction: memory.lastAction,
          sessions: fillSessionEditSessions,
          timeZone: clubTimeZone,
        })

        if (editedAction) {
          if (editedAction.kind === 'fill_session') {
            const editedResponse = await buildFillSessionAssistantResponse({
              caller,
              prisma,
              clubId,
              language,
              state: memory.state,
              message,
              sessionId: editedAction.session.id,
              channel: editedAction.outreach.channel,
              candidateLimit: editedAction.outreach.candidateCount,
              timeZone: clubTimeZone,
              automationSettings: clubContext?.automationSettings,
            })

            assistantState = editedResponse.assistantState
            assistantMessage = editedResponse.assistantMessage
          } else if (editedAction.kind === 'reactivate_members') {
            const editedResponse = await buildReactivationAssistantResponse({
              caller,
              prisma,
              clubId,
              language,
              state: memory.state,
              message,
              inactivityDays: editedAction.reactivation.inactivityDays,
              channel: editedAction.reactivation.channel,
              candidateLimit: editedAction.reactivation.candidateCount,
              timeZone: clubTimeZone,
              automationSettings: clubContext?.automationSettings,
            })

            assistantState = editedResponse.assistantState
            assistantMessage = editedResponse.assistantMessage
          } else if (editedAction.kind === 'create_campaign') {
            const hydratedCampaign = await hydrateAdvisorCampaignAction({
              clubId,
              action: editedAction,
              timeZone: clubTimeZone,
              automationSettings: clubContext?.automationSettings,
            })
            const editCopy = getAdvisorEditCopy(language)
            const guardrailNote = formatAdvisorGuardrailDigest(hydratedCampaign.guardrails)
            const ruleNote = hydratedCampaign.excludedByRules > 0
              ? `${hydratedCampaign.excludedByRules} member${hydratedCampaign.excludedByRules === 1 ? '' : 's'} excluded by recipient rules.`
              : ''
            assistantState = buildAdvisorConversationStateFromAction(hydratedCampaign.action)
            assistantMessage = withSuggested(
              [
                editCopy.campaignUpdated(
                  hydratedCampaign.action.audience.name,
                  hydratedCampaign.action.audience.count || 0,
                ),
                [ruleNote, guardrailNote].filter(Boolean).join(' ').trim(),
                buildAdvisorActionTag(hydratedCampaign.action),
              ].filter(Boolean).join('\n\n'),
              editCopy.suggestions.create_campaign,
            )
          } else if (editedAction.kind === 'update_contact_policy') {
            assistantState = buildAdvisorConversationStateFromAction(editedAction)
            assistantMessage = withSuggested(
              [
                copy.contactPolicyReady(editedAction.policy.changes.length),
                ...editedAction.policy.changes,
                buildAdvisorActionTag(editedAction),
              ].join('\n\n'),
              copy.suggestions.update_contact_policy,
            )
          } else {
            const editCopy = getAdvisorEditCopy(language)
            assistantState = buildAdvisorConversationStateFromAction(editedAction)
            const audienceName = editedAction.cohort.name
            const audienceCount = editedAction.cohort.count || 0
            const editText = editCopy.audienceUpdated(audienceName, audienceCount)

            assistantMessage = withSuggested(
              `${editText}\n\n${buildAdvisorActionTag(editedAction)}`,
              editCopy.suggestions[editedAction.kind],
            )
          }
        }
      }

      if (!assistantMessage) {
        if (plan.action === 'fill_session') {
          const slotCopy = getSlotFillerCopy(language)
          const sessions = await loadAdvisorSlotSessions(caller, clubId)
          if (sessions.length === 0) {
            assistantState = {
              ...(memory.state || {}),
              currentSession: undefined,
              lastActionKind: 'fill_session',
              lastActionTitle: 'Fill an underfilled session',
              updatedAt: new Date().toISOString(),
            }
            assistantMessage = withSuggested(slotCopy.noSessions, slotCopy.suggestions)
          } else {
            const sessionId = plan.sessionId
            const explicitSession = sessionId
              ? sessions.find((session: AdvisorSlotSessionOption) => session.id === sessionId) || null
              : null
            const resolved = explicitSession
              ? { session: explicitSession, reason: 'best_match' as const }
              : resolveAdvisorSlotSession({
                  message: effectiveMessage,
                  sessions,
                  currentSession: memory.state?.currentSession,
                })

            if (!resolved.session) {
              const pending = {
                action: 'fill_session' as const,
                field: 'session' as const,
                question: slotCopy.needSession,
                options: buildAdvisorSlotSessionOptions(sessions),
                originalMessage: message,
                channel: plan.channel,
                candidateLimit: plan.candidateLimit,
                sessionOptions: sessions.slice(0, 6),
              }
              assistantState = withAdvisorPendingClarification(memory.state, pending)
              assistantMessage = withSuggested(slotCopy.needSession, pending.options)
            }
          }
        } else {
          const clarification = maybeStartAdvisorClarification({
            message: effectiveMessage,
            plan,
            state: memory.state,
            language,
            timeZone: clubTimeZone,
          })

          if (clarification) {
            assistantState = withAdvisorPendingClarification(memory.state, clarification.pending)
            assistantMessage = withSuggested(clarification.text, clarification.suggestions)
          }
        }
      }
    }

    if (assistantMessage) {
      await prisma.aIMessage.createMany({
        data: [
          { conversationId: convId, role: 'user', content: message, metadata: {} },
          {
            conversationId: convId,
            role: 'assistant',
            content: assistantMessage,
            metadata: {
              source: 'advisor_action',
              handled: true,
              ...(assistantState ? { advisorState: assistantState } : {}),
            },
          },
        ],
      })

      await prisma.aIConversation.update({
        where: { id: convId },
        data: {
          title: message.slice(0, 100),
          language,
          updatedAt: new Date(),
        },
      }).catch(() => {})

      return Response.json({
        handled: true,
        conversationId: convId,
        assistantMessage,
      })
    }

    if (plan.action === 'none') {
      return Response.json({ handled: false })
    } else if (plan.action === 'create_cohort') {
      const parsed = await caller.intelligence.parseCohortFromText({
        clubId,
        text: plan.audienceText || message,
      })

      const action: AdvisorAction = {
        kind: 'create_cohort',
        title: `Create audience: ${parsed.name}`,
        summary: `${parsed.count} matching members`,
        requiresApproval: true,
        cohort: {
          name: parsed.name,
          description: parsed.description,
          filters: parsed.filters as any,
          count: parsed.count,
        },
      }

      assistantState = buildAdvisorConversationStateFromAction(action)
      assistantMessage = withSuggested(
        `${copy.audienceReady(parsed.count, parsed.name)}\n\n${buildAdvisorActionTag(action)}`,
        copy.suggestions.create_cohort,
      )
    } else if (plan.action === 'fill_session') {
      const fillSessionResponse = await buildFillSessionAssistantResponse({
        caller,
        prisma,
        clubId,
        language,
        state: memory.state,
        message: effectiveMessage,
        sessionId: plan.sessionId,
        channel: plan.channel,
        candidateLimit: plan.candidateLimit,
        timeZone: clubTimeZone,
        automationSettings: clubContext?.automationSettings,
      })

      assistantState = fillSessionResponse.assistantState
      assistantMessage = fillSessionResponse.assistantMessage
    } else if (plan.action === 'reactivate_members') {
      const reactivationResponse = await buildReactivationAssistantResponse({
        caller,
        prisma,
        clubId,
        language,
        state: memory.state,
        message: effectiveMessage,
        inactivityDays: plan.inactivityDays,
        channel: plan.channel,
        candidateLimit: plan.candidateLimit,
        timeZone: clubTimeZone,
        automationSettings: clubContext?.automationSettings,
      })

      assistantState = reactivationResponse.assistantState
      assistantMessage = reactivationResponse.assistantMessage
    } else if (plan.action === 'update_contact_policy') {
      const contactPolicyCopy = getContactPolicyCopy(language)
      const currentPolicy = resolveAdvisorContactPolicy({
        timeZone: clubTimeZone,
        automationSettings: clubContext?.automationSettings,
      })
      const updatedPolicy = updateAdvisorContactPolicyFromMessage({
        message: effectiveMessage,
        currentPolicy,
      })

      if (!updatedPolicy) {
        assistantState = {
          ...(memory.state || {}),
          currentContactPolicy: currentPolicy,
          lastActionKind: 'update_contact_policy',
          lastActionTitle: 'Update club contact policy',
          updatedAt: new Date().toISOString(),
        }
        assistantMessage = withSuggested(
          contactPolicyCopy.needChanges,
          copy.suggestions.update_contact_policy,
        )
      } else {
        const action = buildContactPolicyAction(updatedPolicy)
        assistantState = buildAdvisorConversationStateFromAction(action)
        assistantMessage = withSuggested(
          [
            copy.contactPolicyReady(action.policy.changes.length),
            ...action.policy.changes,
            buildAdvisorActionTag(action),
          ].join('\n\n'),
          copy.suggestions.update_contact_policy,
        )
      }
    } else {
      let audienceDraft: Extract<AdvisorAction, { kind: 'create_campaign' }>['audience']
      const shouldReuseAudience = plan.usePreviousCohort || isCampaignOnlyFollowUp(message)
      const activeMemory = shouldReuseAudience ? memory : null
      const previousAction = activeMemory?.lastAction || (shouldReuseAudience ? await getLastAdvisorAction(convId) : null)

      if (activeMemory?.state?.currentAudience) {
        audienceDraft = activeMemory.state.currentAudience
      } else if (previousAction?.kind === 'create_cohort') {
        audienceDraft = previousAction.cohort
      } else if (previousAction?.kind === 'create_campaign') {
        audienceDraft = previousAction.audience
      } else {
        const parsed = await caller.intelligence.parseCohortFromText({
          clubId,
          text: plan.audienceText || message,
        })
        audienceDraft = {
          name: parsed.name,
          description: parsed.description,
          filters: parsed.filters as any,
          count: parsed.count,
        }
      }

      const campaignType = plan.campaignType || 'REACTIVATION'
      const channel = plan.channel || 'email'
      const deliveryMode = plan.deliveryMode || 'save_draft'
      const scheduledSend = deliveryMode === 'send_later'
        ? (
            plan.scheduledFor
              ? {
                  scheduledFor: plan.scheduledFor,
                  timeZone: plan.timeZone || clubTimeZone,
                  label: formatAdvisorScheduledLabel(plan.scheduledFor, plan.timeZone || clubTimeZone),
                }
              : parseAdvisorScheduledSend({
                  message: effectiveMessage,
                  timeZone: plan.timeZone || clubTimeZone,
                })
          )
        : null
      const generated = await caller.intelligence.generateCampaignMessage({
        clubId,
        campaignType,
        channel,
        audienceCount: audienceDraft.count || 0,
        context: {
          riskSegment: audienceDraft.name,
        },
      })

      const baseAction: AdvisorCampaignAction = {
        kind: 'create_campaign',
        title: `Launch ${campaignType.replace(/_/g, ' ').toLowerCase()} campaign`,
        summary: `${channel.toUpperCase()} ${deliveryMode === 'send_now' ? 'outreach' : deliveryMode === 'send_later' ? 'scheduled outreach' : 'draft'} for ${audienceDraft.count || 0} members`,
        requiresApproval: true,
        audience: audienceDraft,
        campaign: {
          type: campaignType,
          channel,
          subject: generated.subject,
          body: generated.body,
          smsBody: generated.smsBody || undefined,
          execution: {
            mode: deliveryMode,
            ...(scheduledSend
              ? {
                  scheduledFor: scheduledSend.scheduledFor,
                  timeZone: scheduledSend.timeZone,
                }
              : {}),
          },
        },
      }
      const hydratedCampaign = await hydrateAdvisorCampaignAction({
        clubId,
        action: baseAction,
        timeZone: clubTimeZone,
        automationSettings: clubContext?.automationSettings,
      })
      const guardrailNote = formatAdvisorGuardrailDigest(hydratedCampaign.guardrails)
      const ruleNote = hydratedCampaign.excludedByRules > 0
        ? `${hydratedCampaign.excludedByRules} member${hydratedCampaign.excludedByRules === 1 ? '' : 's'} excluded by recipient rules.`
        : ''

      assistantState = buildAdvisorConversationStateFromAction(hydratedCampaign.action)
      assistantMessage = withSuggested(
        [
          buildCampaignReadyText(
            copy,
            hydratedCampaign.guardrails.eligibleCount,
            hydratedCampaign.action.audience.name,
            deliveryMode,
            scheduledSend?.label,
          ),
          [ruleNote, guardrailNote].filter(Boolean).join(' ').trim(),
          buildAdvisorActionTag(hydratedCampaign.action),
        ].filter(Boolean).join('\n\n'),
        copy.suggestions.create_campaign,
      )
    }

    await prisma.aIMessage.createMany({
      data: [
        { conversationId: convId, role: 'user', content: message, metadata: {} },
        {
          conversationId: convId,
          role: 'assistant',
          content: assistantMessage,
          metadata: {
            source: 'advisor_action',
            handled: true,
            ...(assistantState ? { advisorState: assistantState } : {}),
          },
        },
      ],
    })

    await prisma.aIConversation.update({
      where: { id: convId },
      data: {
        title: message.slice(0, 100),
        language,
        updatedAt: new Date(),
      },
    }).catch(() => {})

    return Response.json({
      handled: true,
      conversationId: convId,
      assistantMessage,
    })
  } catch (error) {
    console.error('[Advisor Action] POST error:', error instanceof Error ? error.message : error)
    return Response.json({ handled: false, error: 'Internal server error' }, { status: 500 })
  }
}
