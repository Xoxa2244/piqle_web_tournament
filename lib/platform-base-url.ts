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

export function getPlatformBaseUrlFromRequest(request?: Request | null): string | null {
  if (!request) return null

  const urlOrigin = getPlatformOriginFromUrl(request.url)
  if (urlOrigin) return urlOrigin

  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host')
  if (!forwardedHost) return null

  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https'
  return normalizeBaseUrl(`${forwardedProto}://${forwardedHost}`)
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
