export type MentionCandidate = {
  id: string
  name: string
  image: string | null
  handle: string
}

export type ParsedMentionToken = {
  handle: string
  userId: string | null
}

export function buildMentionHandle(name: string | null | undefined): string {
  const source = String(name ?? '').trim()
  if (!source) return 'user'
  const collapsed = source.replace(/\s+/g, '_')
  const cleaned = collapsed.replace(/[^\p{L}\p{N}_.-]/gu, '')
  return cleaned || 'user'
}

export function toMentionCandidate(user: { id: string; name: string | null; image: string | null }): MentionCandidate {
  return {
    id: user.id,
    name: String(user.name ?? 'User').trim() || 'User',
    image: user.image,
    handle: buildMentionHandle(user.name),
  }
}

export function findActiveMentionQuery(text: string): string | null {
  const match = text.match(/(?:^|\s)@([^\s@]*)$/u)
  return match ? match[1] ?? '' : null
}

export function buildMentionToken(candidate: MentionCandidate): string {
  return `@${candidate.handle}~${candidate.id}`
}

export function applyMentionCandidate(text: string, candidate: MentionCandidate): string {
  return text.replace(/(?:^|\s)@([^\s@]*)$/u, (full) => {
    const prefix = full.startsWith(' ') ? ' ' : ''
    return `${prefix}@${candidate.handle} `
  })
}

export function encodeMentionsForSend(text: string, candidates: MentionCandidate[]): string {
  const candidateByHandle = new Map<string, MentionCandidate>()
  for (const candidate of candidates) {
    const key = candidate.handle.trim().toLowerCase()
    if (key && !candidateByHandle.has(key)) {
      candidateByHandle.set(key, candidate)
    }
  }

  return text.replace(/(^|\s)@([^\s@~]+)(?=$|[\s.,!?;:])/g, (full, prefix: string, rawHandle: string) => {
    const handle = String(rawHandle ?? '').trim()
    if (!handle) return full
    const candidate = candidateByHandle.get(handle.toLowerCase())
    if (!candidate) return full
    return `${prefix}${buildMentionToken(candidate)}`
  })
}

export function parseMentionToken(token: string): ParsedMentionToken | null {
  const match = token.match(/^@([^\s@~]+)(?:~([^\s@]+))?$/u)
  if (!match) return null
  return {
    handle: match[1] ?? '',
    userId: match[2] ?? null,
  }
}

export function getMentionDisplayText(token: string, displayName?: string | null): string {
  const parsed = parseMentionToken(token)
  if (!parsed) return token
  const normalizedName = String(displayName ?? '').trim()
  const fallback = parsed.handle.replace(/_/g, ' ').trim()
  return normalizedName ? `@${normalizedName}` : `@${fallback || parsed.handle}`
}

export function formatMentionsForPreview(text: string, candidates: MentionCandidate[] = []): string {
  const candidateByHandle = new Map<string, MentionCandidate>()
  const candidateById = new Map<string, MentionCandidate>()
  for (const candidate of candidates) {
    candidateById.set(candidate.id, candidate)
    candidateByHandle.set(candidate.handle.toLowerCase(), candidate)
    candidateByHandle.set(buildMentionHandle(candidate.name).toLowerCase(), candidate)
  }

  return String(text ?? '').replace(/@[^\s@~]+(?:~[^\s@]+)?/g, (token) => {
    const parsed = parseMentionToken(token)
    if (!parsed) return token
    const candidate =
      (parsed.userId ? candidateById.get(parsed.userId) : null) ??
      candidateByHandle.get(parsed.handle.toLowerCase()) ??
      null
    return getMentionDisplayText(token, candidate?.name)
  })
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function messageMentionsHandle(
  text: string | null | undefined,
  handle: string | null | undefined,
  userId?: string | null
): boolean {
  const normalizedText = String(text ?? '')
  const normalizedHandle = String(handle ?? '').trim()
  const normalizedUserId = String(userId ?? '').trim()
  if (!normalizedText) return false
  if (normalizedUserId) {
    const idRegex = new RegExp(`(?:^|\\s)@[^\\s@~]+~${escapeRegex(normalizedUserId)}(?=$|\\s|[.,!?;:])`, 'iu')
    if (idRegex.test(normalizedText)) return true
  }
  if (!normalizedHandle) return false
  const legacyRegex = new RegExp(`(?:^|\\s)@${escapeRegex(normalizedHandle)}(?=$|\\s|[.,!?;:])`, 'iu')
  return legacyRegex.test(normalizedText)
}
