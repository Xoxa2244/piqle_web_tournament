import crypto from 'crypto'
import { parse as parseCookie } from 'cookie'
import type { NextRequest } from 'next/server'
import { prisma } from './prisma'

const MOBILE_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

const SESSION_COOKIE_KEYS = [
  '__Secure-next-auth.session-token',
  '__Host-next-auth.session-token',
  'next-auth.session-token',
  '_Secure-next-auth.session-token',
]

export const extractMobileSessionToken = (req: NextRequest): string | null => {
  const xSessionToken = req.headers.get('x-session-token')
  if (xSessionToken) return xSessionToken

  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim()
  }

  const cookieHeader = req.headers.get('cookie')
  if (!cookieHeader) return null

  const cookies = parseCookie(cookieHeader)
  for (const cookieKey of SESSION_COOKIE_KEYS) {
    const token = cookies[cookieKey]
    if (token) return token
  }
  return null
}

export const createMobileSession = async (userId: string) => {
  const sessionToken = crypto.randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + MOBILE_SESSION_TTL_MS)

  await prisma.session.create({
    data: {
      userId,
      sessionToken,
      expires,
    },
  })

  return { sessionToken, expires }
}

export const revokeMobileSession = async (sessionToken: string) => {
  await prisma.session.deleteMany({
    where: { sessionToken },
  })
}

export const getMobileSessionUser = async (sessionToken: string) => {
  const session = await prisma.session.findUnique({
    where: { sessionToken },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
        },
      },
    },
  })

  if (!session) return null

  if (session.expires.getTime() <= Date.now()) {
    await prisma.session.deleteMany({ where: { sessionToken } })
    return null
  }

  return {
    user: session.user,
    expires: session.expires,
  }
}
