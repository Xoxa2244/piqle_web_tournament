import { streamText, convertToModelMessages } from 'ai';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getModel, getFallbackModel } from '@/lib/ai/llm/provider';
import { ADVISOR_SYSTEM_PROMPT } from '@/lib/ai/llm/prompts';
import { retrieveContext, buildRAGContext } from '@/lib/ai/rag/retriever';
import { parse as parseCookie } from 'cookie';

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
function getMessageText(msg: any): string {
  // v6 UIMessage format: { parts: [{ type: 'text', text: '...' }] }
  if (msg.parts && Array.isArray(msg.parts)) {
    return msg.parts
      .filter((p: any) => p.type === 'text')
      .map((p: any) => p.text)
      .join('');
  }
  // Fallback for legacy format or plain content string
  if (typeof msg.content === 'string') return msg.content;
  return '';
}

export async function POST(req: Request) {
  try {
    // 1. Authenticate
    const session = await getSessionFromRequest(req);
    if (!session) {
      return new Response('Unauthorized', { status: 401 });
    }

    // 2. Parse request
    const body = await req.json();
    const { messages, clubId, conversationId } = body;

    if (!clubId || !messages || !Array.isArray(messages)) {
      return new Response('Bad request: clubId and messages are required', { status: 400 });
    }

    // 3. Verify club access
    const hasAccess = await verifyClubAccess(clubId, session.userId);
    if (!hasAccess) {
      return new Response('Forbidden: not a member of this club', { status: 403 });
    }

    // 4. Get or create conversation (gracefully handle if table not ready)
    let convId = conversationId;
    const lastUserText = getMessageText(messages[messages.length - 1]);

    try {
      if (!convId) {
        const newConv = await prisma.aIConversation.create({
          data: {
            clubId,
            userId: session.userId,
            title: lastUserText.slice(0, 100) || 'New conversation',
          },
        });
        convId = newConv.id;
      }
    } catch (convError) {
      console.warn('[AI Chat] Failed to create conversation (continuing without persistence):', convError);
      convId = null;
    }

    // 5. RAG: retrieve relevant context (gracefully handle failures)
    let ragChunks: Awaited<ReturnType<typeof retrieveContext>> = [];
    try {
      const lastUserMessage = messages.filter((m: any) => m.role === 'user').pop();
      const queryText = lastUserMessage ? getMessageText(lastUserMessage) : '';
      if (queryText) {
        ragChunks = await retrieveContext(queryText, clubId, { limit: 6, threshold: 0.6 });
      }
    } catch (ragError) {
      console.warn('[AI Chat] RAG retrieval failed (continuing without context):', ragError);
    }

    const ragContext = buildRAGContext(ragChunks);

    // 6. Build system prompt with RAG context
    const systemPrompt = `${ADVISOR_SYSTEM_PROMPT}

--- Club Data (retrieved from knowledge base) ---
${ragContext}
--- End of Club Data ---

Use the data above to answer the user's question. If the data doesn't contain relevant information, say so honestly.`;

    // 7. Verify API key is available
    if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
      console.error('[AI Chat] No API keys configured');
      return Response.json({
        error: 'AI service not configured',
        hint: 'Set OPENAI_API_KEY or ANTHROPIC_API_KEY in Vercel env vars.',
      }, { status: 503 });
    }

    // 8. Convert UIMessages to model messages (required in AI SDK v6)
    const modelMessages = await convertToModelMessages(messages);

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
      } catch (err) {
        console.error('[AI Chat] Failed to persist messages:', err);
      }
    };

    // 10. Stream with primary model, fallback on error
    const primaryModel = process.env.AI_PRIMARY_MODEL || 'gpt-4o-mini';
    const fallbackModelName = process.env.AI_FALLBACK_MODEL || 'claude-3-5-haiku-20241022';

    let result;
    try {
      result = streamText({
        model: getModel('standard'),
        system: systemPrompt,
        messages: modelMessages,
        maxOutputTokens: 1500,
        onFinish: async (event) => persistMessages(event, primaryModel),
      });
    } catch (error) {
      console.warn('[AI Chat] Primary model failed, trying fallback:', error);
      result = streamText({
        model: getFallbackModel('standard'),
        system: systemPrompt,
        messages: modelMessages,
        maxOutputTokens: 1500,
        onFinish: async (event) => persistMessages(event, fallbackModelName, true),
      });
    }

    // 11. Return streaming response
    const responseHeaders: Record<string, string> = {};
    if (convId) {
      responseHeaders['X-Conversation-Id'] = convId;
    }

    return result.toTextStreamResponse({
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('[AI Chat] Unexpected error:', error);
    return new Response('Internal server error', { status: 500 });
  }
}
