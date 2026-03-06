import { buildApiUrl } from './config'
import type { MobileUser, StoredAuthSession } from './authStorage'

type RequestCodeResponse = {
  ok: true
  expiresAt: string
}

type LoginResponse = StoredAuthSession

const parseJson = async <T>(response: Response): Promise<T> => {
  const text = await response.text()
  return text ? (JSON.parse(text) as T) : ({} as T)
}

const requestJson = async <T>(path: string, init: RequestInit): Promise<T> => {
  const response = await fetch(buildApiUrl(path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })

  const payload = await parseJson<any>(response)
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

export const authApi = {
  requestCode(email: string) {
    return requestJson<RequestCodeResponse>('/api/auth/email/request-code', {
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

  async signUp(input: SignUpInput) {
    await requestJson<{ ok: true }>('/api/auth/email/signup', {
      method: 'POST',
      body: JSON.stringify(input),
    })

    return this.signIn(input.email, input.password)
  },
}

export type { MobileUser }
