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
  maybeStartAdvisorClarification,
  resolveAdvisorClarification,
} from '@/lib/ai/advisor-clarifications'

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

function buildCampaignReadyText(
  copy: ReturnType<typeof getAdvisorActionCopy>,
  count: number,
  name: string,
  mode: 'save_draft' | 'send_now',
) {
  if (mode === 'send_now') return copy.campaignReady(count, name)
  return copy.campaignDraftReady(count, name)
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

    if (!plan) {
      plan = await planAdvisorActionIntent(effectiveMessage)
    }

    if (!access.isAdmin) {
      if (plan.action !== 'none') {
        assistantMessage = withSuggested(copy.adminOnly, copy.suggestions[plan.action === 'create_cohort' ? 'create_cohort' : 'create_campaign'])
      }
    } else {
      if (!assistantMessage && !hadPendingClarification) {
        const editedAction = await maybeEditAdvisorDraft({
          message,
          state: memory.state,
        })

        if (editedAction) {
          const editCopy = getAdvisorEditCopy(language)
          assistantState = buildAdvisorConversationStateFromAction(editedAction)
          const audienceName = editedAction.kind === 'create_campaign'
            ? editedAction.audience.name
            : editedAction.cohort.name
          const audienceCount = editedAction.kind === 'create_campaign'
            ? editedAction.audience.count || 0
            : editedAction.cohort.count || 0
          const editText = editedAction.kind === 'create_campaign'
            ? editCopy.campaignUpdated(audienceName, audienceCount)
            : editCopy.audienceUpdated(audienceName, audienceCount)

          assistantMessage = withSuggested(
            `${editText}\n\n${buildAdvisorActionTag(editedAction)}`,
            editCopy.suggestions[editedAction.kind],
          )
        }
      }

      if (!assistantMessage) {
        const clarification = maybeStartAdvisorClarification({
          message: effectiveMessage,
          plan,
          state: memory.state,
          language,
        })

        if (clarification) {
          assistantState = withAdvisorPendingClarification(memory.state, clarification.pending)
          assistantMessage = withSuggested(clarification.text, clarification.suggestions)
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
      const generated = await caller.intelligence.generateCampaignMessage({
        clubId,
        campaignType,
        channel,
        audienceCount: audienceDraft.count || 0,
        context: {
          riskSegment: audienceDraft.name,
        },
      })

      const action: AdvisorAction = {
        kind: 'create_campaign',
        title: `Launch ${campaignType.replace(/_/g, ' ').toLowerCase()} campaign`,
        summary: `${channel.toUpperCase()} ${deliveryMode === 'send_now' ? 'outreach' : 'draft'} for ${audienceDraft.count || 0} members`,
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
          },
        },
      }

      assistantState = buildAdvisorConversationStateFromAction(action)
      assistantMessage = withSuggested(
        `${buildCampaignReadyText(copy, audienceDraft.count || 0, audienceDraft.name, deliveryMode)}\n\n${buildAdvisorActionTag(action)}`,
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
