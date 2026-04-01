const normalizeBaseUrl = (value?: string | null) => {
  const fallback = 'http://localhost:3000'
  const raw = String(value ?? '').trim() || fallback
  return raw.replace(/\/$/, '')
}

const normalizePublicSecret = (value?: string | null) => {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  // EAS/CI variables are sometimes pasted with wrapping quotes.
  return raw.replace(/^['"]+|['"]+$/g, '').trim()
}

export const API_BASE_URL = normalizeBaseUrl(process.env.EXPO_PUBLIC_API_URL)
export const WEB_BASE_URL = normalizeBaseUrl(process.env.EXPO_PUBLIC_WEB_URL ?? process.env.EXPO_PUBLIC_API_URL)
export const FEEDBACK_API_ENABLED =
  !__DEV__ && String(process.env.EXPO_PUBLIC_ENABLE_FEEDBACK_API ?? '').trim().toLowerCase() === 'true'

// Prefer Expo public var, but also support DUPR_CLIENT_KEY for convenience.
export const DUPR_CLIENT_KEY = normalizePublicSecret(
  process.env.EXPO_PUBLIC_DUPR_CLIENT_KEY ??
    process.env.DUPR_CLIENT_KEY
)

export const buildApiUrl = (path: string) => `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
export const buildWebUrl = (path: string) => `${WEB_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`

/**
 * URL лого из `public/logodupr.png` на веб-домене.
 * После замены файла подними `EXPO_PUBLIC_LOGO_VERSION` в `.env` (и на Vercel),
 * иначе CDN/кэш приложения может показывать старую картинку по тому же пути.
 */
export const duprLogoWebUrl = () => {
  const v = String(process.env.EXPO_PUBLIC_LOGO_VERSION ?? '1').trim() || '1'
  const base = buildWebUrl('/logodupr.png')
  const sep = base.includes('?') ? '&' : '?'
  return `${base}${sep}v=${encodeURIComponent(v)}`
}

/** Официальный wordmark (как на dashboard.dupr.com). */
export const DUPR_LOGO_PNG_URL = 'https://dupr.s3.amazonaws.com/static/logo/dupr.png'
export const DUPR_LOGO_LIGHT_PNG_URL = 'https://dupr.s3.amazonaws.com/static/logo/dupr_light.png'
