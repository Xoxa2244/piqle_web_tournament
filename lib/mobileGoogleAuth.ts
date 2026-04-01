import { createRemoteJWKSet, decodeJwt, jwtVerify } from 'jose'
import type { JWTPayload } from 'jose'

import { normalizeEmail } from './emailOtp'
import { createMobileAccessToken } from './mobileAuth'
import { prisma } from './prisma'

const GOOGLE_PROVIDER = 'google'
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com']
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))

const summarizeGoogleClientId = (clientId?: string | null) => {
  const value = clientId?.trim() ?? ''
  if (!value) return null
  return `${value.slice(0, 24)}...${value.slice(-18)}`
}

const summarizeSubject = (subject?: string | null) => {
  const value = subject?.trim() ?? ''
  if (!value) return null
  return `${value.slice(0, 6)}...${value.slice(-6)}`
}

const maskEmail = (email?: string | null) => {
  const value = email?.trim() ?? ''
  if (!value) return null
  const [localPart, domain = ''] = value.split('@')
  return `${localPart.slice(0, 2)}***@${domain}`
}

export class MobileGoogleAuthError extends Error {
  status: number
  code: string

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'MobileGoogleAuthError'
    this.code = code
    this.status = status
  }
}

const getAllowedGoogleClientIds = () => {
  const candidates = [
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_IOS_CLIENT_ID,
    process.env.GOOGLE_ANDROID_CLIENT_ID,
  ]
    .map((value) => value?.trim() ?? '')
    .filter(Boolean)

  if (!candidates.length) {
    throw new MobileGoogleAuthError(
      'GOOGLE_OAUTH_NOT_CONFIGURED',
      'Google sign-in is not configured on the server.',
      500
    )
  }

  return Array.from(new Set(candidates))
}

const linkPlayersToUserByEmail = async (userId: string, email?: string | null) => {
  if (!email) return

  const normalized = normalizeEmail(email)
  const players = await prisma.player.findMany({
    where: {
      userId: null,
      email: { equals: normalized, mode: 'insensitive' },
    },
    select: { id: true },
  })

  if (!players.length) return

  await prisma.player.updateMany({
    where: { id: { in: players.map((player) => player.id) } },
    data: { userId },
  })
}

const parseBooleanClaim = (value: unknown) => value === true || value === 'true'

export const exchangeGoogleIdTokenForMobileSession = async (idToken: string) => {
  let payload: JWTPayload
  const allowedGoogleClientIds = getAllowedGoogleClientIds()

  try {
    const decoded = decodeJwt(idToken)
    console.log('[Mobile Auth] Decoded Google idToken summary', {
      aud: decoded.aud,
      azp: typeof decoded.azp === 'string' ? summarizeGoogleClientId(decoded.azp) : null,
      iss: decoded.iss,
      email: typeof decoded.email === 'string' ? maskEmail(decoded.email) : null,
      emailVerified: decoded.email_verified,
      sub: typeof decoded.sub === 'string' ? summarizeSubject(decoded.sub) : null,
      exp: decoded.exp,
      allowedClientIds: allowedGoogleClientIds.map((clientId) => summarizeGoogleClientId(clientId)),
    })
  } catch (error) {
    console.error('[Mobile Auth] Failed to decode Google idToken before verification', error)
  }

  try {
    const verified = await jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: GOOGLE_ISSUERS,
      audience: allowedGoogleClientIds,
    })
    payload = verified.payload
    console.log('[Mobile Auth] Google idToken verified', {
      aud: verified.payload.aud,
      azp: typeof verified.payload.azp === 'string' ? summarizeGoogleClientId(verified.payload.azp) : null,
      iss: verified.payload.iss,
      email: typeof verified.payload.email === 'string' ? maskEmail(verified.payload.email) : null,
      sub: typeof verified.payload.sub === 'string' ? summarizeSubject(verified.payload.sub) : null,
    })
  } catch (error) {
    console.error('[Mobile Auth] Google idToken verification failed', {
      message: error instanceof Error ? error.message : String(error),
      allowedClientIds: allowedGoogleClientIds.map((clientId) => summarizeGoogleClientId(clientId)),
    })
    throw new MobileGoogleAuthError(
      'GOOGLE_TOKEN_INVALID',
      'Google sign-in could not be verified.',
      401
    )
  }

  const providerAccountId = typeof payload.sub === 'string' ? payload.sub.trim() : ''
  const email = normalizeEmail(typeof payload.email === 'string' ? payload.email : '')
  const name = typeof payload.name === 'string' ? payload.name.trim() || null : null
  const image = typeof payload.picture === 'string' ? payload.picture.trim() || null : null
  const expiresAt = typeof payload.exp === 'number' ? payload.exp : null

  if (!providerAccountId || !email) {
    throw new MobileGoogleAuthError(
      'GOOGLE_PROFILE_INCOMPLETE',
      'Google sign-in did not return a usable account profile.',
      401
    )
  }

  if (!parseBooleanClaim(payload.email_verified)) {
    throw new MobileGoogleAuthError(
      'GOOGLE_EMAIL_NOT_VERIFIED',
      'This Google account does not have a verified email address.',
      401
    )
  }

  const existingAccount = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: GOOGLE_PROVIDER,
        providerAccountId,
      },
    },
    include: {
      user: true,
    },
  })

  let user = existingAccount?.user ?? (await prisma.user.findUnique({ where: { email } }))
  console.log('[Mobile Auth] Resolved Google account', {
    providerAccountId: summarizeSubject(providerAccountId),
    email: maskEmail(email),
    hasExistingAccount: Boolean(existingAccount),
    hasExistingUser: Boolean(user),
  })

  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        emailVerified: new Date(),
        name,
        image,
      },
    })
  } else {
    const updates: {
      emailVerified?: Date
      name?: string
      image?: string
    } = {}

    if (!user.emailVerified) {
      updates.emailVerified = new Date()
    }
    if (!user.name && name) {
      updates.name = name
    }
    if (!user.image && image) {
      updates.image = image
    }

    if (Object.keys(updates).length > 0) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: updates,
      })
    }
  }

  await prisma.account.upsert({
    where: {
      provider_providerAccountId: {
        provider: GOOGLE_PROVIDER,
        providerAccountId,
      },
    },
    update: {
      userId: user.id,
      type: 'oauth',
      id_token: idToken,
      expires_at: expiresAt,
    },
    create: {
      userId: user.id,
      type: 'oauth',
      provider: GOOGLE_PROVIDER,
      providerAccountId,
      id_token: idToken,
      expires_at: expiresAt,
    },
  })

  await linkPlayersToUserByEmail(user.id, email)

  console.log('[Mobile Auth] Mobile session ready', {
    userId: user.id,
    email: maskEmail(user.email),
  })

  return {
    token: createMobileAccessToken(user.id),
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
    },
  }
}

