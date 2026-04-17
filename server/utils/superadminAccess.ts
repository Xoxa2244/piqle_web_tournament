import { TRPCError } from '@trpc/server'

type SessionLike = {
  user?: {
    id?: string | null
    email?: string | null
    name?: string | null
  } | null
} | null

type ResolveSuperadminAccessInput = {
  session: SessionLike
}

export type SuperadminAccess = {
  allowed: boolean
  envConfigured: boolean
  userId: string | null
  email: string | null
  label: string | null
  matchedBy: 'email' | 'userId' | null
  reason: string | null
}

const parseAllowlist = (raw: string | undefined) =>
  String(raw || '')
    .split(/[,\n]/)
    .map((value) => value.trim())
    .filter(Boolean)

const getSuperadminAllowlist = () => {
  const allowlistedUserIds = parseAllowlist(process.env.SUPERADMIN_USER_ID_ALLOWLIST)
  const allowlistedEmails = parseAllowlist(process.env.SUPERADMIN_EMAIL_ALLOWLIST).map((email) => email.toLowerCase())

  return {
    allowlistedUserIds,
    allowlistedEmails,
    envConfigured: allowlistedUserIds.length > 0 || allowlistedEmails.length > 0,
  }
}

export const resolveSuperadminAccess = (
  input: ResolveSuperadminAccessInput,
): SuperadminAccess => {
  const { allowlistedUserIds, allowlistedEmails, envConfigured } = getSuperadminAllowlist()
  const userId = input.session?.user?.id ?? null
  const email = input.session?.user?.email?.toLowerCase() ?? null
  const label = input.session?.user?.name || input.session?.user?.email || userId

  if (!userId) {
    return {
      allowed: false,
      envConfigured,
      userId: null,
      email,
      label,
      matchedBy: null,
      reason: 'Sign in required.',
    }
  }

  if (!envConfigured) {
    return {
      allowed: false,
      envConfigured,
      userId,
      email,
      label,
      matchedBy: null,
      reason: 'Superadmin allowlist is not configured in this environment.',
    }
  }

  if (allowlistedUserIds.includes(userId)) {
    return {
      allowed: true,
      envConfigured,
      userId,
      email,
      label,
      matchedBy: 'userId',
      reason: null,
    }
  }

  if (email && allowlistedEmails.includes(email)) {
    return {
      allowed: true,
      envConfigured,
      userId,
      email,
      label,
      matchedBy: 'email',
      reason: null,
    }
  }

  return {
    allowed: false,
    envConfigured,
    userId,
    email,
    label,
    matchedBy: null,
    reason: 'Your account is not allowlisted for superadmin access.',
  }
}

export const assertSuperadminAccess = (input: ResolveSuperadminAccessInput) => {
  const access = resolveSuperadminAccess(input)
  if (access.allowed) {
    return access
  }

  throw new TRPCError({
    code: input.session?.user?.id ? 'FORBIDDEN' : 'UNAUTHORIZED',
    message: access.reason || 'Superadmin access required.',
  })
}
