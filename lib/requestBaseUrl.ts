const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '')
const isStripeRedirectDebugEnabled = process.env.STRIPE_REDIRECT_DEBUG === 'true'

const parseOrigin = (value: string | null): string | null => {
  if (!value) return null
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return normalizeBaseUrl(parsed.origin)
  } catch {
    return null
  }
}

const resolveEnvBaseUrl = () => {
  const env = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
  if (!env) return 'http://localhost:3000'
  return normalizeBaseUrl(env.startsWith('http') ? env : `https://${env}`)
}

const originsMatchHost = (origin: string, hostBaseUrl: string) => {
  try {
    return new URL(origin).host === new URL(hostBaseUrl).host
  } catch {
    return false
  }
}

export const getRequestBaseUrl = (request: Request, options?: { scope?: string }) => {
  const forwardedHost = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  const forwardedProto = request.headers.get('x-forwarded-proto')
  const protocol =
    forwardedProto === 'http' || forwardedProto === 'https'
      ? forwardedProto
      : forwardedHost && (forwardedHost.includes('localhost') || forwardedHost.startsWith('127.0.0.1'))
      ? 'http'
      : 'https'
  const hostBaseUrl = forwardedHost ? normalizeBaseUrl(`${protocol}://${forwardedHost}`) : null

  const origin = parseOrigin(request.headers.get('origin'))
  const refererOrigin = parseOrigin(request.headers.get('referer'))
  let selectedSource = 'fallback'
  let baseUrl = hostBaseUrl ?? resolveEnvBaseUrl()

  if (origin && (!hostBaseUrl || originsMatchHost(origin, hostBaseUrl))) {
    selectedSource = 'origin'
    baseUrl = origin
  } else if (refererOrigin && (!hostBaseUrl || originsMatchHost(refererOrigin, hostBaseUrl))) {
    selectedSource = 'referer'
    baseUrl = refererOrigin
  } else if (hostBaseUrl) {
    selectedSource = 'forwarded-host'
  }

  if (isStripeRedirectDebugEnabled) {
    console.info(
      '[Stripe Redirect Base URL]',
      JSON.stringify({
        scope: options?.scope ?? 'unknown',
        selectedSource,
        baseUrl,
        forwardedHost,
        forwardedProto,
        origin,
        refererOrigin,
      })
    )
  }

  return baseUrl
}
