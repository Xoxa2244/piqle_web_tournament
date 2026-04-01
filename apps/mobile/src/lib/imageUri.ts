import { buildWebUrl } from './config'

/** Как на вебе: показываем remote image только для http(s) / data URL. */
export function isRemoteImageUri(uri: string | null | undefined): boolean {
  if (uri == null || typeof uri !== 'string') return false
  const t = uri.trim()
  if (!t) return false
  return t.startsWith('http://') || t.startsWith('https://') || t.startsWith('data:')
}

/**
 * Веб часто отдаёт `/uploads/...` или `//host/...`; в нативе без домена Image не грузится.
 */
export function resolveRemoteImageUriForApp(uri: string | null | undefined): string | null {
  if (uri == null || typeof uri !== 'string') return null
  const t = uri.trim()
  if (!t) return null
  if (t.startsWith('http://') || t.startsWith('https://') || t.startsWith('data:')) return t
  if (t.startsWith('//')) return `https:${t}`
  if (t.startsWith('/')) return buildWebUrl(t)
  return null
}
