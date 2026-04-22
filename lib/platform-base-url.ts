const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '')

export function getPlatformOriginFromUrl(value?: string | null): string | null {
  if (!value) return null
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return normalizeBaseUrl(parsed.origin)
  } catch {
    return null
  }
}

export function getPlatformBaseUrl(explicitBaseUrl?: string | null): string {
  const candidate =
    explicitBaseUrl?.trim()
    || process.env.NEXT_PUBLIC_APP_URL
    || process.env.NEXTAUTH_URL
    || process.env.VERCEL_URL
    || 'http://localhost:3000'

  return normalizeBaseUrl(candidate.startsWith('http') ? candidate : `https://${candidate}`)
}

export function buildPlatformUrl(path: string, explicitBaseUrl?: string | null): string {
  const baseUrl = getPlatformBaseUrl(explicitBaseUrl)
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${baseUrl}${normalizedPath}`
}
