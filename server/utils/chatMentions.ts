export function buildMentionHandle(name: string | null | undefined): string {
  const source = String(name ?? '').trim()
  if (!source) return 'user'
  const collapsed = source.replace(/\s+/g, '_')
  const cleaned = collapsed.replace(/[^\p{L}\p{N}_.-]/gu, '')
  return cleaned || 'user'
}

export function extractMentionedUserIds(text: string | null | undefined): string[] {
  const source = String(text ?? '')
  if (!source) return []
  const ids = new Set<string>()
  const regex = /@([^\s@~]+)~([^\s@]+?)(?=$|[\s.,!?;:])/gu
  for (const match of source.matchAll(regex)) {
    const userId = String(match[2] ?? '').trim()
    if (userId) ids.add(userId)
  }
  return Array.from(ids)
}

export function stripMentionIds(text: string | null | undefined): string {
  return String(text ?? '').replace(/@([^\s@~]+)~([^\s@]+?)(?=$|[\s.,!?;:])/gu, '@$1')
}
