import { streamText, convertToModelMessages } from 'ai';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getModel, getFallbackModel } from '@/lib/ai/llm/provider';
import { ADVISOR_SYSTEM_PROMPT } from '@/lib/ai/llm/prompts';
import { retrieveContext, buildRAGContext } from '@/lib/ai/rag/retriever';
import { detectLanguage, getLanguageInstruction, type SupportedLanguage } from '@/lib/ai/llm/language';
import { generateConversationSummary } from '@/lib/ai/llm/summarizer';
import { parse as parseCookie } from 'cookie';

// Allow up to 60s for RAG + LLM streaming (default 10s is too tight)
export const maxDuration = 60;

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
    const { messages, clubId, conversationId } = body;

    if (!clubId || !messages || !Array.isArray(messages)) {
      return new Response('Bad request: clubId and messages are required', { status: 400 });
    }

    // 3. Verify club access
    step = 'access';
    const hasAccess = await verifyClubAccess(clubId, session.userId);
    if (!hasAccess) {
      return new Response('Forbidden: not a member of this club', { status: 403 });
    }

    // 4. Get or create conversation + detect language
    step = 'conversation';
    let convId = conversationId;
    const lastUserText = getMessageText(messages[messages.length - 1]);
    let conversationLanguage: SupportedLanguage = 'en';

    try {
      if (!convId) {
        // New conversation — detect language, load cross-session memory
        const detectedLang = detectLanguage(lastUserText);
        const newConv = await prisma.aIConversation.create({
          data: {
            clubId,
            userId: session.userId,
            title: lastUserText.slice(0, 100) || 'New conversation',
            language: detectedLang,
          },
        });
        convId = newConv.id;
        conversationLanguage = detectedLang;
        console.log(`[AI Chat] New conversation ${convId}, lang=${detectedLang}`);
      } else {
        // Existing conversation — load stored language
        const conv = await prisma.aIConversation.findUnique({
          where: { id: convId },
          select: { language: true },
        });
        conversationLanguage = (conv?.language as SupportedLanguage) || 'en';
        console.log(`[AI Chat] Existing conversation ${convId}, lang=${conversationLanguage}`);
      }
    } catch (convError) {
      console.warn('[AI Chat] Failed to create/load conversation (continuing without persistence):', convError instanceof Error ? convError.message : convError);
      convId = null;
    }

    // 4.5 Load prior conversation messages for multi-turn context
    step = 'history';
    let fullMessages = messages;
    if (convId && conversationId) {
      try {
        const priorMessages = await prisma.aIMessage.findMany({
          where: { conversationId: convId },
          orderBy: { createdAt: 'asc' },
        });

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

    // 6. Build system prompt with RAG context + language + cross-session memory
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

    const systemPrompt = `${ADVISOR_SYSTEM_PROMPT}${languageInstruction}

--- Club Data (retrieved from knowledge base) ---
${ragContext}
--- End of Club Data ---
${crossSessionContext}

Use the data above to answer the user's question. If the data doesn't contain relevant information, say so honestly.`;

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
      'X-RAG-Query': ragQueryText.slice(0, 100),
      'X-Conversation-Language': conversationLanguage,
    };
    if (convId) {
      responseHeaders['X-Conversation-Id'] = convId;
    }

    return result.toTextStreamResponse({
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
