import { buildApiUrl } from './config'
import type { MobileUser, StoredAuthSession } from './authStorage'

type RequestCodeResponse = {
  ok: true
  expiresAt: string
}

type LoginResponse = StoredAuthSession

type NativeGoogleSignInInput = {
  idToken: string
}

type GoogleSignInConfigResponse = {
  webClientId: string
  iosClientId: string | null
}

const looksLikeHtml = (value: string) => /^\s*</.test(value)

const parseJson = async <T>(response: Response, path: string): Promise<T> => {
  const text = await response.text()
  if (!text) {
    return {} as T
  }

  try {
    return JSON.parse(text) as T
  } catch {
    const isGoogleMobileAuthPath = path.includes('/api/mobile/auth/google/native')
    if (looksLikeHtml(text)) {
      throw new Error(
        isGoogleMobileAuthPath
          ? 'Google sign-in endpoint is not available on the current backend. The mobile app is likely pointing to an outdated deployment.'
          : 'The server returned HTML instead of JSON. The mobile app may be pointing to the wrong backend.'
      )
    }

    throw new Error(`The server returned an invalid JSON response for ${path}.`)
  }
}

const requestJson = async <T>(path: string, init: RequestInit): Promise<T> => {
  const response = await fetch(buildApiUrl(path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })

  const payload = await parseJson<any>(response, path)
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || 'Request failed')
  }

  return payload as T
}

export type SignUpInput = {
  email: string
  code: string
  firstName: string
  lastName: string
  password: string
}

export type ResetPasswordInput = {
  email: string
  code: string
  password: string
}

export const authApi = {
  requestCode(email: string) {
    return requestJson<RequestCodeResponse>('/api/auth/email/request-code', {
      method: 'POST',
      body: JSON.stringify({ email }),
    })
  },

  requestPasswordReset(email: string) {
    return requestJson<RequestCodeResponse>('/api/auth/email/password-reset/request-code', {
      method: 'POST',
      body: JSON.stringify({ email }),
    })
  },

  signIn(email: string, password: string) {
    return requestJson<LoginResponse>('/api/mobile/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
  },

  getGoogleSignInConfig() {
    return requestJson<GoogleSignInConfigResponse>('/api/mobile/auth/google/native', {
      method: 'GET',
    })
  },

  signInWithGoogle(input: NativeGoogleSignInInput) {
    return requestJson<LoginResponse>('/api/mobile/auth/google/native', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  getMobileSession(token: string) {
    return requestJson<LoginResponse>('/api/mobile/auth/session', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
  },

  resetPassword(input: ResetPasswordInput) {
    return requestJson<{ ok: true }>('/api/auth/email/password-reset/confirm', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  async signUp(input: SignUpInput) {
    await requestJson<{ ok: true }>('/api/auth/email/signup', {
      method: 'POST',
      body: JSON.stringify(input),
    })

    return this.signIn(input.email, input.password)
  },
}

export type { MobileUser }
