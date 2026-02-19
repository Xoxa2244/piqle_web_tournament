import { createTRPCProxyClient, httpBatchLink } from '@trpc/client'

let runtimeSessionToken: string | null = null

export const getApiBaseUrl = () => {
  const explicit = process.env.EXPO_PUBLIC_API_BASE_URL?.trim()
  if (explicit) {
    return explicit.replace(/\/$/, '')
  }
  return 'http://localhost:3000'
}

const getSessionToken = () =>
  runtimeSessionToken || process.env.EXPO_PUBLIC_NEXT_AUTH_SESSION_TOKEN?.trim() || null

export const setRuntimeSessionToken = (sessionToken: string | null) => {
  runtimeSessionToken = sessionToken
}

export const trpcClient: any = createTRPCProxyClient<any>({
  links: [
    httpBatchLink({
      url: `${getApiBaseUrl()}/api/mobile/trpc`,
      headers() {
        const token = getSessionToken()
        const headers: Record<string, string> = {
          'x-client-type': 'mobile',
        }
        if (token) {
          headers.cookie = [
            `next-auth.session-token=${token}`,
            `__Secure-next-auth.session-token=${token}`,
            `__Host-next-auth.session-token=${token}`,
          ].join('; ')
        }
        return headers
      },
    }),
  ],
})
