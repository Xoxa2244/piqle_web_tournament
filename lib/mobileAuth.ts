import crypto from 'crypto'
import type { Session } from 'next-auth'

import { prisma } from './prisma'

const MOBILE_TOKEN_VERSION = 2
const MOBILE_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60

type MobileTokenUser = {
  id: string
  email: string
  name?: string | null
  image?: string | null
  isActive?: boolean
}

type MobileTokenPayload = {
  v: number
  sub: string
  iat: number
  exp: number
  email?: string
  name?: string | null
  image?: string | null
  isActive?: boolean
}

const getMobileAuthSecret = () => {
  const secret = process.env.MOBILE_AUTH_SECRET || process.env.NEXTAUTH_SECRET
  if (!secret) {
    throw new Error('MOBILE_AUTH_SECRET or NEXTAUTH_SECRET must be set')
  }
  return secret
}

const encodeBase64Url = (value: string) => Buffer.from(value, 'utf8').toString('base64url')

const decodeBase64Url = (value: string) => Buffer.from(value, 'base64url').toString('utf8')

const signPayload = (value: string) =>
  crypto.createHmac('sha256', getMobileAuthSecret()).update(value).digest('base64url')

const isSignatureValid = (value: string, signature: string) => {
  const expected = signPayload(value)
  const actualBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (actualBuffer.length !== expectedBuffer.length) return false
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer)
}

export const createMobileAccessToken = (
  user: MobileTokenUser,
  ttlSeconds = MOBILE_TOKEN_TTL_SECONDS
) => {
  const now = Math.floor(Date.now() / 1000)
  const payload: MobileTokenPayload = {
    v: MOBILE_TOKEN_VERSION,
    sub: user.id,
    iat: now,
    exp: now + ttlSeconds,
    email: user.email,
    name: user.name ?? null,
    image: user.image ?? null,
    isActive: typeof user.isActive === 'boolean' ? user.isActive : true,
  }

  const encodedPayload = encodeBase64Url(JSON.stringify(payload))
  const signature = signPayload(encodedPayload)
  return `${encodedPayload}.${signature}`
}

export const verifyMobileAccessToken = (token: string): MobileTokenPayload | null => {
  try {
    const [encodedPayload, signature] = token.split('.')
    if (!encodedPayload || !signature) return null
    if (!isSignatureValid(encodedPayload, signature)) return null

    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as MobileTokenPayload
    if (payload.v !== 1 && payload.v !== MOBILE_TOKEN_VERSION) return null
    if (!payload.sub || typeof payload.sub !== 'string') return null
    if (!payload.exp || payload.exp * 1000 <= Date.now()) return null
    return payload
  } catch {
    return null
  }
}

export const getSessionFromMobileToken = async (token: string): Promise<Session | null> => {
  const payload = verifyMobileAccessToken(token)
  if (!payload) return null

  if (typeof payload.email === 'string' && payload.email.trim()) {
    return {
      user: {
        id: payload.sub,
        email: payload.email,
        name: payload.name ?? null,
        image: payload.image ?? null,
        isActive: typeof payload.isActive === 'boolean' ? payload.isActive : true,
      },
      expires: new Date(payload.exp * 1000).toISOString(),
    }
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      isActive: true,
    },
  })

  if (!user) return null

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      isActive: user.isActive,
    },
    expires: new Date(payload.exp * 1000).toISOString(),
  }
}
