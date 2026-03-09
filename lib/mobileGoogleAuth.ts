import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { JWTPayload } from 'jose'

import { normalizeEmail } from './emailOtp'
import { createMobileAccessToken } from './mobileAuth'
import { prisma } from './prisma'

const GOOGLE_PROVIDER = 'google'
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com']
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))

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

  try {
    const verified = await jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: GOOGLE_ISSUERS,
      audience: getAllowedGoogleClientIds(),
    })
    payload = verified.payload
  } catch {
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

