import { streamText } from 'ai';
import { prisma } from '@/lib/prisma';
import { getModel, getFallbackModel } from '@/lib/ai/llm/provider';
import { ADVISOR_SYSTEM_PROMPT } from '@/lib/ai/llm/prompts';
import { retrieveContext, buildRAGContext } from '@/lib/ai/rag/retriever';
import { parse as parseCookie } from 'cookie';

// ── Auth helper (mirrors server/trpc.ts pattern) ──
async function getSessionFromRequest(req: Request) {
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

  return {
    userId: dbSession.userId,
    user: dbSession.user,
  };
}

// ── Verify club membership ──
async function verifyClubAccess(clubId: string, userId: string) {
  const [admin, follower] = await Promise.all([
    prisma.clubAdmin.findFirst({ where: { clubId, userId } }),
    prisma.clubFollower.findFirst({ where: { clubId, userId } }),
  ]);
  return !!(admin || follower);
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

    // 4. Get or create conversation
    let convId = conversationId;
    if (!convId) {
      const newConv = await prisma.aIConversation.create({
        data: {
          clubId,
          userId: session.userId,
          title: messages[messages.length - 1]?.content?.slice(0, 100) || 'New conversation',
        },
      });
      convId = newConv.id;
    }

    // 5. RAG: retrieve relevant context
    const lastUserMessage = messages.filter((m: any) => m.role === 'user').pop();
    const ragChunks = lastUserMessage
      ? await retrieveContext(lastUserMessage.content, clubId, { limit: 6, threshold: 0.6 })
      : [];

    const ragContext = buildRAGContext(ragChunks);

    // 6. Build system prompt with RAG context
    const systemPrompt = `${ADVISOR_SYSTEM_PROMPT}

--- Club Data (retrieved from knowledge base) ---
${ragContext}
--- End of Club Data ---

Use the data above to answer the user's question. If the data doesn't contain relevant information, say so honestly.`;

    // 7. Stream response with fallback
    let result;
    try {
      result = streamText({
        model: getModel('standard'),
        system: systemPrompt,
        messages,
        maxOutputTokens: 1500,
        onFinish: async (event) => {
          // Persist messages after stream completes
          try {
            const userMsg = messages[messages.length - 1];
            await prisma.aIMessage.createMany({
              data: [
                {
                  conversationId: convId,
                  role: 'user',
                  content: userMsg.content,
                  metadata: {},
                },
                {
                  conversationId: convId,
                  role: 'assistant',
                  content: event.text,
                  metadata: {
                    model: process.env.AI_PRIMARY_MODEL || 'gpt-4o-mini',
                    inputTokens: event.usage.inputTokens,
                    outputTokens: event.usage.outputTokens,
                    ragChunksUsed: ragChunks.length,
                  },
                },
              ],
            });

            // Update conversation title if first message
            const msgCount = await prisma.aIMessage.count({ where: { conversationId: convId } });
            if (msgCount <= 2) {
              await prisma.aIConversation.update({
                where: { id: convId },
                data: {
                  title: userMsg.content.slice(0, 100),
                  updatedAt: new Date(),
                },
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
        },
      });
    } catch (error) {
      console.warn('[AI Chat] Primary model failed, trying fallback:', error);
      result = streamText({
        model: getFallbackModel('standard'),
        system: systemPrompt,
        messages,
        maxOutputTokens: 1500,
        onFinish: async (event) => {
          try {
            const userMsg = messages[messages.length - 1];
            await prisma.aIMessage.createMany({
              data: [
                { conversationId: convId, role: 'user', content: userMsg.content, metadata: {} },
                {
                  conversationId: convId, role: 'assistant', content: event.text,
                  metadata: {
                    model: process.env.AI_FALLBACK_MODEL || 'claude-3-5-haiku',
                    inputTokens: event.usage.inputTokens,
                    outputTokens: event.usage.outputTokens,
                    ragChunksUsed: ragChunks.length,
                    fallback: true,
                  },
                },
              ],
            });
          } catch (err) {
            console.error('[AI Chat] Failed to persist messages (fallback):', err);
          }
        },
      });
    }

    // 8. Return streaming response with conversation ID header
    const response = result.toTextStreamResponse();

    // Add conversation ID to response headers so client can track it
    const headers = new Headers(response.headers);
    headers.set('X-Conversation-Id', convId);

    return new Response(response.body, {
      status: response.status,
      headers,
    });
  } catch (error) {
    console.error('[AI Chat] Unexpected error:', error);
    return new Response('Internal server error', { status: 500 });
  }
}
