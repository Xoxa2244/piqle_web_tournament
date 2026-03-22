/**
 * Отмена in-flight fetch (смена экрана, новый refetch, AbortSignal от React Query).
 * tRPC оборачивает это в TRPCClientError с message "Aborted" — это не сбой API.
 */
export function isAbortLikeError(error: unknown): boolean {
  if (error == null) return false
  const e = error as { name?: string; message?: string; cause?: unknown }
  if (e.name === 'AbortError') return true
  const msg = typeof e.message === 'string' ? e.message : String(error)
  if (msg === 'Aborted' || /aborted/i.test(msg)) return true
  const c = e.cause
  if (c && typeof c === 'object' && 'name' in c && (c as { name: string }).name === 'AbortError') return true
  return false
}
