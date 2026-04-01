import { createRemoteJWKSet, decodeJwt, jwtVerify } from 'jose'
import type { JWTPayload } from 'jose'

import { normalizeEmail } from './emailOtp'
import { createMobileAccessToken } from './mobileAuth'
import { prisma } from './prisma'

const APPLE_PROVIDER = 'apple'
const APPLE_ISSUER = 'https://appleid.apple.com'
const APPLE_JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'))

const summarizeAudience = (audience?: string | string[] | null) => {
  if (!audience) return null
  return Array.isArray(audience) ? audience.join(', ') : audience
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

const parseBooleanClaim = (value: unknown) => value === true || value === 'true'

const getAllowedAppleAudiences = () => {
  const candidates = [
    process.env.APPLE_IOS_BUNDLE_ID,
    process.env.APPLE_APP_BUNDLE_ID,
    process.env.APPLE_CLIENT_ID,
    'com.piqle.player',
  ]
    .map((value) => value?.trim() ?? '')
    .filter(Boolean)

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

const buildAppleName = (firstName?: string | null, lastName?: string | null) => {
  const parts = [firstName?.trim(), lastName?.trim()].filter(Boolean)
  return parts.length ? parts.join(' ') : null
}

export class MobileAppleAuthError extends Error {
  status: number
  code: string

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'MobileAppleAuthError'
    this.code = code
    this.status = status
  }
}

type ExchangeAppleIdentityTokenInput = {
  identityToken: string
  user: string
  email?: string | null
  firstName?: string | null
  lastName?: string | null
}

export const exchangeAppleIdentityTokenForMobileSession = async (
  input: ExchangeAppleIdentityTokenInput
) => {
  let payload: JWTPayload
  const allowedAppleAudiences = getAllowedAppleAudiences()

  try {
    const decoded = decodeJwt(input.identityToken)
    console.log('[Mobile Auth] Decoded Apple identity token summary', {
      aud: summarizeAudience(decoded.aud as string | string[] | undefined),
      iss: decoded.iss,
      email: typeof decoded.email === 'string' ? maskEmail(decoded.email) : null,
      emailVerified: decoded.email_verified,
      sub: typeof decoded.sub === 'string' ? summarizeSubject(decoded.sub) : null,
      exp: decoded.exp,
      allowedAudiences: allowedAppleAudiences,
    })
  } catch (error) {
    console.error('[Mobile Auth] Failed to decode Apple identity token before verification', error)
  }

  try {
    const verified = await jwtVerify(input.identityToken, APPLE_JWKS, {
      issuer: APPLE_ISSUER,
      audience: allowedAppleAudiences,
    })
    payload = verified.payload
    console.log('[Mobile Auth] Apple identity token verified', {
      aud: summarizeAudience(
        Array.isArray(verified.payload.aud)
          ? verified.payload.aud
          : typeof verified.payload.aud === 'string'
          ? verified.payload.aud
          : undefined
      ),
      iss: verified.payload.iss,
      email: typeof verified.payload.email === 'string' ? maskEmail(verified.payload.email) : null,
      sub: typeof verified.payload.sub === 'string' ? summarizeSubject(verified.payload.sub) : null,
    })
  } catch (error) {
    console.error('[Mobile Auth] Apple identity token verification failed', {
      message: error instanceof Error ? error.message : String(error),
      allowedAudiences: allowedAppleAudiences,
    })
    throw new MobileAppleAuthError(
      'APPLE_TOKEN_INVALID',
      'Apple sign-in could not be verified.',
      401
    )
  }

  const providerAccountId =
    typeof payload.sub === 'string' && payload.sub.trim()
      ? payload.sub.trim()
      : input.user.trim()
  const tokenEmail =
    typeof payload.email === 'string' && payload.email.trim()
      ? normalizeEmail(payload.email)
      : ''
  const fallbackEmail = input.email?.trim() ? normalizeEmail(input.email) : ''
  const email = tokenEmail || fallbackEmail
  const name = buildAppleName(input.firstName, input.lastName)
  const expiresAt = typeof payload.exp === 'number' ? payload.exp : null

  if (!providerAccountId) {
    throw new MobileAppleAuthError(
      'APPLE_PROFILE_INCOMPLETE',
      'Apple sign-in did not return a usable account profile.',
      401
    )
  }

  if (payload.email_verified != null && !parseBooleanClaim(payload.email_verified)) {
    throw new MobileAppleAuthError(
      'APPLE_EMAIL_NOT_VERIFIED',
      'This Apple account does not have a verified email address.',
      401
    )
  }

  const existingAccount = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: APPLE_PROVIDER,
        providerAccountId,
      },
    },
    include: {
      user: true,
    },
  })

  let user =
    existingAccount?.user ??
    (email ? await prisma.user.findUnique({ where: { email } }) : null)

  console.log('[Mobile Auth] Resolved Apple account', {
    providerAccountId: summarizeSubject(providerAccountId),
    email: maskEmail(email),
    hasExistingAccount: Boolean(existingAccount),
    hasExistingUser: Boolean(user),
  })

  if (!user && !email) {
    throw new MobileAppleAuthError(
      'APPLE_EMAIL_MISSING',
      'Apple sign-in did not return an email for this account. Please try again with the same Apple ID or add a password to your existing account.',
      409
    )
  }

  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        emailVerified: new Date(),
        ...(name ? { name } : {}),
      },
    })
  } else {
    const updates: {
      emailVerified?: Date
      name?: string
    } = {}

    if (!user.emailVerified) {
      updates.emailVerified = new Date()
    }
    if (!user.name && name) {
      updates.name = name
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
        provider: APPLE_PROVIDER,
        providerAccountId,
      },
    },
    update: {
      userId: user.id,
      type: 'oauth',
      id_token: input.identityToken,
      expires_at: expiresAt,
    },
    create: {
      userId: user.id,
      type: 'oauth',
      provider: APPLE_PROVIDER,
      providerAccountId,
      id_token: input.identityToken,
      expires_at: expiresAt,
    },
  })

  await linkPlayersToUserByEmail(user.id, user.email)

  console.log('[Mobile Auth] Apple mobile session ready', {
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
