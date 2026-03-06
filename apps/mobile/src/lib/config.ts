const normalizeBaseUrl = (value?: string | null) => {
  const fallback = 'http://localhost:3000'
  const raw = String(value ?? '').trim() || fallback
  return raw.replace(/\/$/, '')
}

export const API_BASE_URL = normalizeBaseUrl(process.env.EXPO_PUBLIC_API_URL)
export const WEB_BASE_URL = API_BASE_URL

export const buildApiUrl = (path: string) => `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
export const buildWebUrl = (path: string) => `${WEB_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
