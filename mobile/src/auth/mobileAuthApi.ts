import { getApiBaseUrl } from '../api/trpcClient'

type MobileAuthUser = {
  id: string
  email: string
  name: string | null
  image: string | null
}

type SignInResponse = {
  ok: true
  sessionToken: string
  expiresAt: string
  user: MobileAuthUser
}

type SessionResponse =
  | {
      authenticated: true
      user: MobileAuthUser
      expiresAt: string
    }
  | {
      authenticated: false
    }

const getJson = async (response: Response) => {
  return response.json().catch(() => ({}))
}

export const signInWithPassword = async (email: string, password: string) => {
  const response = await fetch(`${getApiBaseUrl()}/api/mobile/auth/signin/password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  })

  const payload = await getJson(response)
  if (!response.ok) {
    throw new Error(payload?.message || 'Failed to sign in.')
  }

  return payload as SignInResponse
}

export const fetchMobileSession = async (sessionToken: string) => {
  const response = await fetch(`${getApiBaseUrl()}/api/mobile/auth/session`, {
    method: 'GET',
    headers: {
      'x-session-token': sessionToken,
    },
  })

  const payload = await getJson(response)
  if (!response.ok) {
    throw new Error(payload?.message || 'Failed to load session.')
  }
  return payload as SessionResponse
}

export const signOutMobileSession = async (sessionToken: string) => {
  const response = await fetch(`${getApiBaseUrl()}/api/mobile/auth/signout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sessionToken }),
  })
  if (!response.ok) {
    const payload = await getJson(response)
    throw new Error(payload?.message || 'Failed to sign out.')
  }
}

export const requestSignupCode = async (email: string) => {
  const response = await fetch(`${getApiBaseUrl()}/api/mobile/auth/signup/request-code`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
  })

  const payload = await getJson(response)
  if (!response.ok) {
    throw new Error(payload?.message || 'Failed to send verification code.')
  }
  return payload as { ok: true; expiresAt: string }
}

export const completeSignupWithOtp = async (args: {
  email: string
  code: string
  firstName: string
  lastName: string
  password: string
}) => {
  const response = await fetch(`${getApiBaseUrl()}/api/mobile/auth/signup/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  })

  const payload = await getJson(response)
  if (!response.ok) {
    throw new Error(payload?.message || 'Failed to sign up.')
  }
  return payload as { ok: true }
}
