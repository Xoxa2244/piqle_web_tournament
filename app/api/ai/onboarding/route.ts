import { streamText, convertToModelMessages } from 'ai'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getModel, getFallbackModel } from '@/lib/ai/llm/provider'
import { ONBOARDING_SYSTEM_PROMPT } from '@/lib/ai/onboarding-prompt'
import { detectLanguage, getLanguageInstruction, type SupportedLanguage } from '@/lib/ai/llm/language'
import { createOnboardingTools } from '@/lib/ai/onboarding-tools'
import { parse as parseCookie } from 'cookie'

export const maxDuration = 60

// ── Auth helper (same as chat route) ──
async function getSessionFromRequest(req: Request) {
  try {
    const nextAuthSession = await getServerSession(authOptions)
    if (nextAuthSession?.user?.id) {
      return { userId: nextAuthSession.user.id, user: nextAuthSession.user }
    }
  } catch (e) {
    console.warn('[AI Onboarding] getServerSession failed, falling back to cookie:', e)
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

// ── Verify club membership ──
async function verifyClubAccess(clubId: string, userId: string) {
  const [admin, follower] = await Promise.all([
    prisma.clubAdmin.findFirst({ where: { clubId, userId } }),
    prisma.clubFollower.findFirst({ where: { clubId, userId } }),
  ])
  return !!(admin || follower)
}

// ── Extract text from UIMessage ──
function getMessageText(msg: { parts?: Array<{ type: string; text?: string }>; content?: string }): string {
  if (msg.parts && Array.isArray(msg.parts)) {
    const text = msg.parts
      .filter((p) => p.type === 'text')
      .map((p) => p.text || '')
      .join('')
    if (text) return text
  }
  if (typeof msg.content === 'string') return msg.content
  return ''
}

export async function POST(req: Request) {
  let step = 'init'
  try {
    // 1. Authenticate
    step = 'auth'
    const session = await getSessionFromRequest(req)
    if (!session) {
      return new Response('Unauthorized', { status: 401 })
    }

    // 2. Parse request — clubId is now OPTIONAL (null for new clubs)
    step = 'parse'
    const body = await req.json()
    const { messages, clubId: rawClubId, conversationId } = body

    if (!messages || !Array.isArray(messages)) {
      return new Response('Bad request: messages are required', { status: 400 })
    }

    // clubId can be null (new club, will be created via createClub tool)
    let clubId: string | null = rawClubId || null

    // 3. Verify club access (only if club already exists)
    step = 'access'
    if (clubId) {
      const hasAccess = await verifyClubAccess(clubId, session.userId)
      if (!hasAccess) {
        return new Response('Forbidden: not a member of this club', { status: 403 })
      }
    }

    // 4. Get or create onboarding conversation
    step = 'conversation'
    let convId = conversationId
    const lastUserText = getMessageText(messages[messages.length - 1])
    const conversationLanguage: SupportedLanguage = detectLanguage(lastUserText)

    try {
      if (!convId) {
        const newConv = await prisma.aIConversation.create({
          data: {
            clubId: clubId || 'pending', // placeholder if no club yet
            userId: session.userId,
            title: '[onboarding] Club setup',
            language: conversationLanguage,
          },
        })
        convId = newConv.id

        // Store conversation ID in club settings (if club exists)
        if (clubId) {
          const club: any = await prisma.club.findUnique({ where: { id: clubId } })
          const existing = club?.automationSettings || {}
          await (prisma.club as any).update({
            where: { id: clubId },
            data: {
              automationSettings: {
                ...existing,
                intelligence: {
                  ...(existing.intelligence || {}),
                  onboardingConversationId: convId,
                },
              },
            },
          })
        }

        console.log(`[AI Onboarding] New conversation ${convId}, clubId=${clubId || 'pending'}, lang=${conversationLanguage}`)
      } else {
        await prisma.aIConversation.update({
          where: { id: convId },
          data: { language: conversationLanguage },
        }).catch(() => {})
        console.log(`[AI Onboarding] Existing conversation ${convId}, lang=${conversationLanguage}`)
      }
    } catch (convError) {
      console.warn('[AI Onboarding] Failed to create/load conversation:', convError instanceof Error ? convError.message : convError)
      convId = null
    }

    // 5. Load prior messages for recovery
    step = 'history'
    let fullMessages = messages
    if (convId && conversationId) {
      try {
        const priorMessages = await prisma.aIMessage.findMany({
          where: { conversationId: convId },
          orderBy: { createdAt: 'asc' },
        })

        if (priorMessages.length > 0) {
          const dbMessages = priorMessages
            .filter(m => m.role !== 'system')
            .map(m => ({
              id: m.id,
              role: m.role as 'user' | 'assistant',
              parts: [{ type: 'text' as const, text: m.content }],
            }))

          const newUserMsg = messages[messages.length - 1]
          fullMessages = [...dbMessages, newUserMsg]
          console.log(`[AI Onboarding] Loaded ${priorMessages.length} prior messages`)
        }
      } catch (err) {
        console.warn('[AI Onboarding] Failed to load history:', err instanceof Error ? err.message : err)
      }
    }

    // 6. Build system prompt
    step = 'prompt'
    const languageInstruction = getLanguageInstruction(conversationLanguage)
    const systemPrompt = `${ONBOARDING_SYSTEM_PROMPT}${languageInstruction}`

    // 7. Verify API key
    step = 'apikey'
    if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
      return Response.json({
        error: 'AI service not configured',
        hint: 'Set OPENAI_API_KEY or ANTHROPIC_API_KEY in Vercel env vars.',
      }, { status: 503 })
    }

    // 8. Convert messages
    step = 'convert'
    const modelMessages = await convertToModelMessages(fullMessages)

    // 9. Create tools — pass userId for createClub tool
    step = 'tools'
    const { tools: onboardingTools, ctx: toolsCtx } = createOnboardingTools(clubId, session.userId)

    // 10. Persistence
    const persistMessages = async (event: { text: string; usage: { inputTokens: number | undefined; outputTokens: number | undefined } }, modelName: string, isFallback = false) => {
      if (!convId) return
      try {
        // Update conversation clubId if it was created during this request
        const currentClubId = toolsCtx.getClubId()
        if (currentClubId && currentClubId !== clubId) {
          await prisma.aIConversation.update({
            where: { id: convId },
            data: { clubId: currentClubId },
          }).catch(() => {})

          // Store conversation ID in the new club's settings
          const club: any = await prisma.club.findUnique({ where: { id: currentClubId } })
          const existing = club?.automationSettings || {}
          await (prisma.club as any).update({
            where: { id: currentClubId },
            data: {
              automationSettings: {
                ...existing,
                intelligence: {
                  ...(existing.intelligence || {}),
                  onboardingConversationId: convId,
                },
              },
            },
          }).catch(() => {})
        }

        await prisma.aIMessage.createMany({
          data: [
            { conversationId: convId, role: 'user', content: lastUserText, metadata: {} },
            {
              conversationId: convId, role: 'assistant', content: event.text,
              metadata: {
                model: modelName,
                inputTokens: event.usage.inputTokens,
                outputTokens: event.usage.outputTokens,
                type: 'onboarding',
                language: conversationLanguage,
                ...(isFallback ? { fallback: true } : {}),
              },
            },
          ],
        })
        await prisma.aIConversation.update({
          where: { id: convId },
          data: { updatedAt: new Date() },
        })
      } catch (err) {
        console.error('[AI Onboarding] Failed to persist messages:', err instanceof Error ? err.message : err)
      }
    }

    // 11. Stream
    step = 'stream'
    const primaryModel = process.env.AI_PRIMARY_MODEL || 'gpt-4o'
    const fallbackModelName = process.env.AI_FALLBACK_MODEL || 'claude-3-5-haiku-20241022'

    // Tools re-enabled — using jsonSchema() instead of Zod to bypass schema serialization issue
    let result
    try {
      result = streamText({
        model: getModel('standard'),
        system: systemPrompt,
        messages: modelMessages,
        tools: onboardingTools,
        maxOutputTokens: 1500,
        onFinish: async (event) => persistMessages(event, primaryModel),
      })
      console.log(`[AI Onboarding] Stream started with model=${primaryModel}`)
    } catch (error) {
      console.warn('[AI Onboarding] Primary model failed, trying fallback:', error instanceof Error ? error.message : error)
      result = streamText({
        model: getFallbackModel('standard'),
        system: systemPrompt,
        messages: modelMessages,
        tools: onboardingTools,
        maxOutputTokens: 1500,
        onFinish: async (event) => persistMessages(event, fallbackModelName, true),
      })
    }

    // 12. Return — include clubId in headers so client can track it
    step = 'response'
    const responseHeaders: Record<string, string> = {
      'X-Conversation-Language': conversationLanguage,
    }
    if (convId) {
      responseHeaders['X-Conversation-Id'] = convId
    }
    // Return clubId (may be set by createClub tool during streaming)
    const currentClubId = toolsCtx.getClubId()
    if (currentClubId) {
      responseHeaders['X-Club-Id'] = currentClubId
    }

    return result.toUIMessageStreamResponse({ headers: responseHeaders })
  } catch (error) {
    const errMsg = error instanceof Error ? `${error.message}\n${error.stack}` : String(error)
    console.error(`[AI Onboarding] FATAL at step="${step}":`, errMsg)
    return Response.json({
      error: 'Internal server error',
      step,
      detail: process.env.NODE_ENV === 'development' ? errMsg : undefined,
    }, { status: 500 })
  }
}
