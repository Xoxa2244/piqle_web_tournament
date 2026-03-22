/** Как на вебе: показываем remote image только для http(s) / data URL. */
export function isRemoteImageUri(uri: string | null | undefined): boolean {
  if (uri == null || typeof uri !== 'string') return false
  const t = uri.trim()
  if (!t) return false
  return t.startsWith('http://') || t.startsWith('https://') || t.startsWith('data:')
}
