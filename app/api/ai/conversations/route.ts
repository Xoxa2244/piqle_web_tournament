import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { parse as parseCookie } from 'cookie';

// ── Auth helper (same pattern as /api/ai/chat) ──
async function getSessionFromRequest(req: Request) {
  try {
    const nextAuthSession = await getServerSession(authOptions);
    if (nextAuthSession?.user?.id) {
      return { userId: nextAuthSession.user.id };
    }
  } catch (e) {
    console.warn('[AI Conversations] getServerSession failed, falling back to cookie:', e);
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
  return { userId: dbSession.userId };
}

export async function GET(req: Request) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return new Response('Unauthorized', { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const clubId = searchParams.get('clubId');

    if (!clubId) {
      return Response.json({ error: 'clubId is required' }, { status: 400 });
    }

    const conversations = await prisma.aIConversation.findMany({
      where: {
        clubId,
        userId: session.userId,
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        title: true,
        language: true,
        summary: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return Response.json({ conversations });
  } catch (error) {
    console.error('[AI Conversations] GET error:', error instanceof Error ? error.message : error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
