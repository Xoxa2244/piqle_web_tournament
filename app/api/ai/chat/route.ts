import { streamText, convertToModelMessages } from 'ai';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getModel, getFallbackModel } from '@/lib/ai/llm/provider';
import { ADVISOR_SYSTEM_PROMPT, buildClubContextPrompt } from '@/lib/ai/llm/prompts';
import { retrieveContext, buildRAGContext } from '@/lib/ai/rag/retriever';
import { detectLanguage, getLanguageInstruction, type SupportedLanguage } from '@/lib/ai/llm/language';
import { generateConversationSummary } from '@/lib/ai/llm/summarizer';
import { parse as parseCookie } from 'cookie';
import { createChatTools } from '@/lib/ai/chat-tools';
import {
  buildAdvisorStatePrompt,
  clearAdvisorPendingClarification,
  deriveAdvisorConversationState,
} from '@/lib/ai/advisor-conversation-state';

// Allow up to 60s for RAG + LLM streaming (default 10s is too tight)
export const maxDuration = 60;

// ── In-memory cache for advisor pre-fetch (5 min TTL per club) ──
const advisorDataCache = new Map<string, { ts: number; data: any }>()

// ── Auth helper (mirrors server/trpc.ts pattern exactly) ──
async function getSessionFromRequest(req: Request) {
  try {
    const nextAuthSession = await getServerSession(authOptions);
    if (nextAuthSession?.user?.id) {
      return { userId: nextAuthSession.user.id, user: nextAuthSession.user };
    }
  } catch (e) {
    console.warn('[AI Chat] getServerSession failed, falling back to cookie:', e);
  }

  const cookieHeader = req.headers.get('cookie');
  if (!cookieHeader) return null;

  const cookies = parseCookie(cookieHeader);
  const sessionToken =
    cookies['__Secure-next-auth.session-token'] ||
    cookies['__Host-next-auth.session-token'] ||
    cookies['next-auth.session-token'] ||
    cookies['_Secure-next-auth.session-token'] ||
    null;

  if (!sessionToken) return null;

  const dbSession = await prisma.session.findUnique({
    where: { sessionToken },
    include: { user: true },
  });

  if (!dbSession || dbSession.expires < new Date()) return null;
  return { userId: dbSession.userId, user: dbSession.user };
}

// ── Verify club membership ──
async function verifyClubAccess(clubId: string, userId: string) {
  const [admin, follower] = await Promise.all([
    prisma.clubAdmin.findFirst({ where: { clubId, userId } }),
    prisma.clubFollower.findFirst({ where: { clubId, userId } }),
  ]);
  return !!(admin || follower);
}

// ── Extract text from a UIMessage (v6 uses parts[], not content) ──
function getMessageText(msg: { parts?: Array<{ type: string; text?: string }>; content?: string }): string {
  if (msg.parts && Array.isArray(msg.parts)) {
    const text = msg.parts
      .filter((p) => p.type === 'text')
      .map((p) => p.text || '')
      .join('');
    if (text) return text;
  }
  if (typeof msg.content === 'string') return msg.content;
  return '';
}

// ── Max messages to load from DB for conversation context ──
const MAX_HISTORY_MESSAGES = 100;

export async function POST(req: Request) {
  let step = 'init';
  try {
    // 1. Authenticate
    step = 'auth';
    const session = await getSessionFromRequest(req);
    if (!session) {
      return new Response('Unauthorized', { status: 401 });
    }

    // 2. Parse request
    step = 'parse';
    const body = await req.json();
    const { messages, clubId, conversationId, pageContext } = body;

    if (!clubId || !messages || !Array.isArray(messages)) {
      return new Response('Bad request: clubId and messages are required', { status: 400 });
    }

    // 3. Verify club access
    step = 'access';
    const hasAccess = await verifyClubAccess(clubId, session.userId);
    if (!hasAccess) {
      return new Response('Forbidden: not a member of this club', { status: 403 });
    }

    // 3.5 Check AI Advisor daily usage limit
    step = 'usage_limit';
    try {
      const { checkUsageLimit } = await import('@/lib/subscription');
      const advisorCheck = await checkUsageLimit(clubId, 'ai_advisor');
      if (!advisorCheck.allowed) {
        return new Response(JSON.stringify({
          type: 'USAGE_LIMIT_REACHED',
          resource: 'ai_advisor',
          used: advisorCheck.used,
          limit: advisorCheck.limit,
          plan: advisorCheck.plan,
          message: `AI Advisor daily limit reached (${advisorCheck.used}/${advisorCheck.limit}). Upgrade your plan for more conversations.`,
        }), { status: 429, headers: { 'Content-Type': 'application/json' } });
      }
    } catch (e) {
      // Non-critical — allow chat if usage check fails
      console.warn('[AI Chat] Usage limit check failed:', (e as Error).message?.slice(0, 80));
    }

    // 4. Get or create conversation + detect language per message
    step = 'conversation';
    let convId = conversationId;
    const lastUserText = getMessageText(messages[messages.length - 1]);
    // Always detect from the latest message so language can switch mid-conversation
    const conversationLanguage: SupportedLanguage = detectLanguage(lastUserText);

    try {
      if (!convId) {
        // New conversation
        const newConv = await prisma.aIConversation.create({
          data: {
            clubId,
            userId: session.userId,
            title: lastUserText.slice(0, 100) || 'New conversation',
            language: conversationLanguage,
          },
        });
        convId = newConv.id;
        console.log(`[AI Chat] New conversation ${convId}, lang=${conversationLanguage}`);
      } else {
        // Existing conversation — update language to match latest message
        await prisma.aIConversation.update({
          where: { id: convId },
          data: { language: conversationLanguage },
        }).catch(() => {}); // non-critical
        console.log(`[AI Chat] Existing conversation ${convId}, lang=${conversationLanguage}`);
      }
    } catch (convError) {
      console.warn('[AI Chat] Failed to create/load conversation (continuing without persistence):', convError instanceof Error ? convError.message : convError);
      convId = null;
    }

    // 4.5 Load prior conversation messages for multi-turn context
    step = 'history';
    let fullMessages = messages;
    let storedConversationMessages: Array<{ role: string; content: string; metadata?: unknown }> = [];
    if (convId && conversationId) {
      try {
        const priorMessages = await prisma.aIMessage.findMany({
          where: { conversationId: convId },
          orderBy: { createdAt: 'asc' },
        });

        storedConversationMessages = priorMessages.map((message) => ({
          role: message.role,
          content: message.content,
          metadata: message.metadata,
        }))

        if (priorMessages.length > 0) {
          const dbMessages = priorMessages
            .filter(m => m.role !== 'system')
            .map(m => ({
              id: m.id,
              role: m.role as 'user' | 'assistant',
              parts: [{ type: 'text' as const, text: m.content }],
            }));

          // Cap very long conversations: keep first 2 + most recent messages
          const capped = dbMessages.length > MAX_HISTORY_MESSAGES
            ? [...dbMessages.slice(0, 2), ...dbMessages.slice(-(MAX_HISTORY_MESSAGES - 2))]
            : dbMessages;

          // Append only the NEW user message from client
          const newUserMsg = messages[messages.length - 1];
          fullMessages = [...capped, newUserMsg];

          console.log(`[AI Chat] Loaded ${priorMessages.length} prior messages (capped to ${capped.length}), total context: ${fullMessages.length} messages`);
        }
      } catch (err) {
        console.warn('[AI Chat] Failed to load conversation history, using client messages only:', err instanceof Error ? err.message : err);
      }
    }

    // 4.6 Load cross-session summaries for new conversations
    step = 'cross-session';
    let crossSessionContext = '';
    if (!conversationId) {
      try {
        const recentConvs = await prisma.aIConversation.findMany({
          where: {
            clubId,
            userId: session.userId,
            summary: { not: null },
          },
          orderBy: { updatedAt: 'desc' },
          take: 5,
          select: { title: true, summary: true, updatedAt: true },
        });

        if (recentConvs.length > 0) {
          crossSessionContext = '\n\n--- Previous Conversations (for context) ---\n' +
            recentConvs.map(c =>
              `[${c.updatedAt.toLocaleDateString()}] ${c.title || 'Untitled'}: ${c.summary}`
            ).join('\n') +
            '\n--- End of Previous Conversations ---\n' +
            'Use these summaries for context if the user references past discussions. Do not proactively mention them.';
        }
        console.log(`[AI Chat] Cross-session: ${recentConvs.length} prior summaries loaded`);
      } catch (err) {
        console.warn('[AI Chat] Failed to load cross-session context:', err instanceof Error ? err.message : err);
      }
    }

    // 5. RAG: retrieve relevant context (gracefully handle failures)
    step = 'rag';
    let ragChunks: Awaited<ReturnType<typeof retrieveContext>> = [];
    let ragStatus = 'skipped';
    let ragQueryText = '';
    try {
      const lastUserMessage = messages.filter((m: { role: string }) => m.role === 'user').pop();
      ragQueryText = lastUserMessage ? getMessageText(lastUserMessage) : '';
      console.log(`[AI Chat] RAG query: "${ragQueryText?.slice(0, 80)}", clubId: ${clubId}`);
      if (ragQueryText) {
        ragChunks = await retrieveContext(ragQueryText, clubId, { limit: 10, threshold: 0.3 });
        ragStatus = ragChunks.length > 0 ? 'ok' : 'empty';
        console.log(`[AI Chat] RAG retrieved ${ragChunks.length} chunks`);
      } else {
        ragStatus = 'no_query_text';
        console.warn(`[AI Chat] RAG skipped: no query text extracted from message`);
      }
    } catch (ragError) {
      ragStatus = 'error';
      console.error('[AI Chat] RAG retrieval failed (continuing without context):', ragError instanceof Error ? ragError.message : ragError);
    }

    // 6. Pre-fetch real-time club data (cached 5 min per club)
    step = 'prefetch';
    let liveDataBlock = ''
    try {
      const cacheKey = `advisor_prefetch_${clubId}`
      const cached = advisorDataCache.get(cacheKey)
      let metrics: any, memberHealth: any, courtOcc: any, reactivation: any, membershipData: any, upcomingSessions: any

      if (cached && Date.now() - cached.ts < 5 * 60 * 1000) {
        // Use cached data (< 5 min old)
        ;({ metrics, memberHealth, courtOcc, reactivation, membershipData, upcomingSessions } = cached.data)
        console.log(`[AI Chat] Using cached prefetch data (${Math.round((Date.now() - cached.ts) / 1000)}s old)`)
      } else {
        // Fresh fetch
        const tools = createChatTools(clubId)
        const exec = (t: any, args: any) => t.execute(args, { toolCallId: 'prefetch', messages: [] }).catch(() => null)
        ;[metrics, memberHealth, courtOcc, reactivation, membershipData, upcomingSessions] = await Promise.all([
          exec(tools.getClubMetrics, {}),
          exec(tools.getMemberHealth, { filter: 'all', limit: 50 }),
          exec(tools.getCourtOccupancy, { days: 30 }),
          exec(tools.getReactivationCandidates, { limit: 10 }),
          exec(tools.getMembershipBreakdown, {}),
          exec(tools.getUpcomingSessions, { limit: 10 }),
        ])
        advisorDataCache.set(cacheKey, { ts: Date.now(), data: { metrics, memberHealth, courtOcc, reactivation, membershipData, upcomingSessions } })
        console.log(`[AI Chat] Fresh prefetch completed, cached for 5 min`)
      }

      const parts: string[] = []

      if (metrics && !('error' in metrics)) {
        parts.push(`## Club Metrics (real-time)
Total members: ${metrics.totalMembers}
Active members (last 30d): ${metrics.activeMembers}
Inactive members: ${metrics.inactiveMembers}
Bookings last 7 days: ${metrics.bookingsLast7Days}
Bookings last 30 days: ${metrics.bookingsLast30Days}
Sessions last 30 days: ${metrics.sessionsLast30Days}
Average occupancy: ${metrics.averageOccupancy}`)
      }

      if (courtOcc && !('error' in courtOcc)) {
        parts.push(`## Court Occupancy (${courtOcc.period})
Overall occupancy: ${courtOcc.overallOccupancy}
Total courts: ${courtOcc.totalCourts}
Total sessions: ${courtOcc.totalSessions}

Busiest time slots:
${(courtOcc.busiestSlots as any[]).slice(0, 8).map((s: any) => `- ${s.slot}: ${s.occupancy} (${s.totalPlayers} players, formats: ${s.formats})`).join('\n')}

Quietest time slots:
${(courtOcc.quietestSlots as any[]).slice(0, 5).map((s: any) => `- ${s.slot}: ${s.occupancy}`).join('\n')}`)
      }

      if (memberHealth && !('error' in memberHealth)) {
        const s = memberHealth.summary
        const allMembers = memberHealth.members as any[]
        // Most active = highest bookings
        const mostActive = [...allMembers].sort((a, b) => (b.totalBookings || 0) - (a.totalBookings || 0)).slice(0, 10)
        // Most at risk = lowest health score
        const mostAtRisk = [...allMembers].filter((m: any) => m.riskLevel === 'at_risk' || m.riskLevel === 'critical').slice(0, 10)

        parts.push(`## Member Health Summary
Healthy: ${s.healthy} | Watch: ${s.watch} | At-Risk: ${s.atRisk} | Critical: ${s.critical} | Churned: ${s.churned}
Average health score: ${s.avgHealthScore}

Most active members (by total bookings):
${mostActive.map((m: any) => `- ${m.name}: ${m.totalBookings} bookings, score ${m.healthScore}, ${m.riskLevel}, trend: ${m.trend}`).join('\n')}

Most at-risk members (lowest health scores):
${mostAtRisk.map((m: any) => `- ${m.name}: score ${m.healthScore}, ${m.totalBookings} bookings, last visit ${m.daysSinceLastVisit ?? 'never'} days ago, trend: ${m.trend}`).join('\n')}`)
      }

      if (reactivation && !('error' in reactivation)) {
        parts.push(`## Reactivation Candidates (inactive 14+ days)
Total inactive: ${reactivation.totalInactive}
${(reactivation.candidates as any[]).map((c: any) => `- ${c.name}: ${c.daysSinceLastVisit} days since last visit (${c.lastVisitDate})`).join('\n')}`)
      }

      if (upcomingSessions && !('error' in upcomingSessions)) {
        parts.push(`## Upcoming Sessions
${(upcomingSessions.sessions as any[]).map((s: any) => `- ${s.title} | ${s.date} ${s.time} | ${s.format} | ${s.confirmed}/${s.maxPlayers} (${s.occupancy}) | ${s.spotsRemaining} spots left`).join('\n')}`)
      }

      if (membershipData && !('error' in membershipData)) {
        parts.push(`## Membership Breakdown
${Object.entries(membershipData.breakdown as Record<string, number>).map(([status, count]) => `- ${status}: ${count}`).join('\n')}
${(membershipData.membershipTypes as any[])?.length ? `\nActive membership types:\n${(membershipData.membershipTypes as any[]).map((t: any) => `- ${t.type}: ${t.count}`).join('\n')}` : ''}`)
      }

      liveDataBlock = parts.join('\n\n')
      console.log(`[AI Chat] Pre-fetched ${parts.length} live data blocks (${liveDataBlock.length} chars)`)
    } catch (err) {
      console.error('[AI Chat] Pre-fetch failed (continuing with RAG only):', (err as Error).message)
    }

    // 7. Build system prompt with RAG context + live data + language + cross-session memory
    step = 'prompt';
    let ragContext: string;
    try {
      ragContext = buildRAGContext(ragChunks || []);
    } catch (ragBuildError) {
      console.error('[AI Chat] buildRAGContext failed:', ragBuildError instanceof Error ? ragBuildError.message : ragBuildError);
      ragContext = 'No relevant data found in the knowledge base.';
    }
    console.log(`[AI Chat] RAG status=${ragStatus}, chunks=${ragChunks.length}, contextLen=${ragContext.length}, lang=${conversationLanguage}`);

    const languageInstruction = getLanguageInstruction(conversationLanguage);

    // Resolve deep link placeholders in system prompt
    const clubBaseUrl = `/clubs/${clubId}`
    const resolvedAdvisorPrompt = ADVISOR_SYSTEM_PROMPT.replace(/\{\{clubBaseUrl\}\}/g, clubBaseUrl)

    // Load club intelligence settings for context
    let clubContextBlock = ''
    try {
      const club: any = await prisma.club.findUnique({ where: { id: clubId } })
      const intelligenceSettings = club?.automationSettings?.intelligence || null
      clubContextBlock = buildClubContextPrompt(intelligenceSettings)
    } catch { /* non-critical */ }

    const advisorStateBlock = buildAdvisorStatePrompt(
      deriveAdvisorConversationState(storedConversationMessages)
    )
    const pageContextBlock = pageContext ? `\n\nCurrent page context: ${pageContext}` : ''

    const systemPrompt = `${resolvedAdvisorPrompt}${languageInstruction}${clubContextBlock}${advisorStateBlock}${pageContextBlock}

--- Real-Time Club Data (live from database) ---
${liveDataBlock || 'No live data available.'}
--- End of Real-Time Data ---

--- Historical Context (from knowledge base) ---
${ragContext}
--- End of Historical Context ---
${crossSessionContext}

IMPORTANT: Use the Real-Time Club Data above to answer questions about current metrics, members, occupancy, and bookings. Use Historical Context for trends and patterns. Always cite specific numbers from the data. Never say "I don't have access to data" — the data is provided above.`;

    // 7. Verify API key is available
    step = 'apikey';
    if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
      console.error('[AI Chat] No API keys configured');
      return Response.json({
        error: 'AI service not configured',
        hint: 'Set OPENAI_API_KEY or ANTHROPIC_API_KEY in Vercel env vars.',
      }, { status: 503 });
    }

    // 8. Convert UIMessages to model messages (required in AI SDK v6)
    step = 'convert';
    let modelMessages;
    try {
      modelMessages = await convertToModelMessages(fullMessages);
      console.log(`[AI Chat] Converted ${fullMessages.length} UIMessages to ${modelMessages.length} model messages`);
    } catch (convertError) {
      console.error('[AI Chat] convertToModelMessages failed:', convertError instanceof Error ? convertError.message : convertError, 'fullMessages sample:', JSON.stringify(fullMessages.slice(0, 2)).slice(0, 500));
      return Response.json({ error: 'Failed to process messages' }, { status: 400 });
    }

    // 9. Persistence callback
    const persistMessages = async (event: { text: string; usage: { inputTokens: number | undefined; outputTokens: number | undefined } }, modelName: string, isFallback = false) => {
      if (!convId) return;
      try {
        const advisorState = clearAdvisorPendingClarification(
          deriveAdvisorConversationState(storedConversationMessages)
        )
        await prisma.aIMessage.createMany({
          data: [
            { conversationId: convId, role: 'user', content: lastUserText, metadata: {} },
            {
              conversationId: convId, role: 'assistant', content: event.text,
              metadata: {
                model: modelName,
                inputTokens: event.usage.inputTokens,
                outputTokens: event.usage.outputTokens,
                ragChunksUsed: ragChunks.length,
                language: conversationLanguage,
                ...(advisorState ? { advisorState } : {}),
                ...(isFallback ? { fallback: true } : {}),
              },
            },
          ],
        });

        const msgCount = await prisma.aIMessage.count({ where: { conversationId: convId } });
        if (msgCount <= 2) {
          await prisma.aIConversation.update({
            where: { id: convId },
            data: { title: lastUserText.slice(0, 100), updatedAt: new Date() },
          });
        } else {
          await prisma.aIConversation.update({
            where: { id: convId },
            data: { updatedAt: new Date() },
          });
        }

        // Generate/update conversation summary after enough messages (fire-and-forget)
        if (msgCount >= 6 && msgCount % 4 === 0) {
          generateConversationSummary(convId).catch(err =>
            console.error('[AI Chat] Summary generation failed:', err)
          );
        }
      } catch (err) {
        console.error('[AI Chat] Failed to persist messages:', err instanceof Error ? err.message : err);
      }
    };

    // 10. Stream with primary model, fallback on error
    step = 'stream';
    const primaryModel = process.env.AI_PRIMARY_MODEL || 'gpt-4o';
    const fallbackModelName = process.env.AI_FALLBACK_MODEL || 'claude-3-5-haiku-20241022';

    // Tools disabled for now — AI SDK v6 streamText doesn't support maxSteps,
    // so tool results can't be fed back to LLM for text generation.
    // RAG context provides all club data the LLM needs to answer questions.
    // TODO: Re-enable when AI SDK adds maxSteps support to streamText.

    let result;
    try {
      result = streamText({
        model: getModel('standard'),
        system: systemPrompt,
        messages: modelMessages,
        maxOutputTokens: 2500,
        onFinish: async (event) => persistMessages(event, primaryModel),
      });
      console.log(`[AI Chat] Stream started with model=${primaryModel}`);
    } catch (error) {
      console.warn('[AI Chat] Primary model failed, trying fallback:', error instanceof Error ? error.message : error);
      result = streamText({
        model: getFallbackModel('standard'),
        system: systemPrompt,
        messages: modelMessages,
        maxOutputTokens: 2500,
        onFinish: async (event) => persistMessages(event, fallbackModelName, true),
      });
      console.log(`[AI Chat] Stream started with fallback model=${fallbackModelName}`);
    }

    // 11. Return streaming response
    step = 'response';
    const responseHeaders: Record<string, string> = {
      'X-RAG-Status': ragStatus,
      'X-RAG-Chunks': String(ragChunks.length),
      'X-RAG-Context-Length': String(ragContext.length),
      'X-RAG-Query': encodeURIComponent(ragQueryText.slice(0, 100)),
      'X-Conversation-Language': conversationLanguage,
    };
    if (convId) {
      responseHeaders['X-Conversation-Id'] = convId;
    }

    return result.toUIMessageStreamResponse({
      headers: responseHeaders,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? `${error.message}\n${error.stack}` : String(error);
    console.error(`[AI Chat] FATAL at step="${step}":`, errMsg);
    return Response.json({
      error: 'Internal server error',
      step,
      detail: process.env.NODE_ENV === 'development' ? errMsg : undefined,
    }, { status: 500 });
  }
}
