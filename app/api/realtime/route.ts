import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getSessionFromMobileToken } from '@/lib/mobileAuth'
import { addConnection, removeConnection, type RealtimeEvent } from '@/lib/realtime'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const getBearerToken = (request: Request) => {
  const header = request.headers.get('authorization') || request.headers.get('Authorization')
  if (header) {
    const [scheme, token] = header.split(' ')
    if (scheme?.toLowerCase() === 'bearer' && token?.trim()) {
      return token.trim()
    }
  }

  try {
    const url = new URL(request.url)
    return url.searchParams.get('access_token')?.trim() || null
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  let session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    const bearerToken = getBearerToken(request)
    if (bearerToken) {
      session = await getSessionFromMobileToken(bearerToken)
    }
  }

  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 })
  }

  const userId = session.user.id
  let cleanup: (() => void) | null = null

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: RealtimeEvent) => {
        try {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`))
        } catch {
          cleanup?.()
        }
      }
      addConnection(userId, send)

      const interval = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(': keepalive\n\n'))
        } catch {
          cleanup?.()
        }
      }, 10_000)

      cleanup = () => {
        clearInterval(interval)
        removeConnection(userId, send)
      }
    },
    cancel() {
      cleanup?.()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Connection: 'keep-alive',
    },
  })
}
