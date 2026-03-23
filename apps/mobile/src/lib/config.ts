const normalizeBaseUrl = (value?: string | null) => {
  const fallback = 'http://localhost:3000'
  const raw = String(value ?? '').trim() || fallback
  return raw.replace(/\/$/, '')
}

export const API_BASE_URL = normalizeBaseUrl(process.env.EXPO_PUBLIC_API_URL)
export const WEB_BASE_URL = API_BASE_URL
export const FEEDBACK_API_ENABLED =
  !__DEV__ && String(process.env.EXPO_PUBLIC_ENABLE_FEEDBACK_API ?? '').trim().toLowerCase() === 'true'

// Prefer Expo public var, but also support DUPR_CLIENT_KEY for convenience.
export const DUPR_CLIENT_KEY = String(
  process.env.EXPO_PUBLIC_DUPR_CLIENT_KEY ??
    process.env.DUPR_CLIENT_KEY ??
    ''
).trim()

export const buildApiUrl = (path: string) => `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
export const buildWebUrl = (path: string) => `${WEB_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
