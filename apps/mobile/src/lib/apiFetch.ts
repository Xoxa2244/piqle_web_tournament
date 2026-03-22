/** Обёртка над fetch с таймаутом, чтобы запросы не висели бесконечно (RN без своего network timeout). */
const DEFAULT_TIMEOUT_MS = 60_000

export type FetchWithTimeoutInit = RequestInit & { timeoutMs?: number }

const abortError = () => {
  const err = new Error('The operation was aborted')
  err.name = 'AbortError'
  return err
}

export const fetchWithTimeout = async (
  input: RequestInfo | URL,
  init?: FetchWithTimeoutInit
): Promise<Response> => {
  const timeoutMs = init?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  const outer = init?.signal
  const onOuterAbort = () => {
    clearTimeout(timeoutId)
    controller.abort()
  }
  if (outer) {
    if (outer.aborted) {
      clearTimeout(timeoutId)
      throw abortError()
    }
    outer.addEventListener('abort', onOuterAbort, { once: true })
  }

  const { timeoutMs: _omit, ...rest } = init ?? {}

  try {
    return await fetch(input, { ...rest, signal: controller.signal })
  } finally {
    clearTimeout(timeoutId)
    if (outer) {
      outer.removeEventListener('abort', onOuterAbort)
    }
  }
}
