export type ChatMentionNotificationItem = {
  id?: string | null
  type?: string | null
  clubId?: string | null
  tournamentId?: string | null
  divisionId?: string | null
  messageId?: string | null
}

export function buildClubMentionNotificationId(messageId: string): string {
  return `chat-mention-club-${messageId}`
}

export function buildTournamentMentionNotificationId(messageId: string): string {
  return `chat-mention-tournament-${messageId}`
}

export function buildDivisionMentionNotificationId(messageId: string): string {
  return `chat-mention-division-${messageId}`
}

export function buildMentionCountMaps(items: ChatMentionNotificationItem[]) {
  const clubCounts = new Map<string, number>()
  const tournamentCounts = new Map<string, number>()
  const divisionCounts = new Map<string, number>()

  for (const item of items) {
    if (String(item.type ?? '') !== 'CHAT_MENTION') continue

    const clubId = String(item.clubId ?? '').trim()
    const tournamentId = String(item.tournamentId ?? '').trim()
    const divisionId = String(item.divisionId ?? '').trim()

    if (clubId) {
      clubCounts.set(clubId, (clubCounts.get(clubId) ?? 0) + 1)
      continue
    }

    if (divisionId) {
      divisionCounts.set(divisionId, (divisionCounts.get(divisionId) ?? 0) + 1)
    }

    if (tournamentId) {
      tournamentCounts.set(tournamentId, (tournamentCounts.get(tournamentId) ?? 0) + 1)
    }
  }

  return { clubCounts, tournamentCounts, divisionCounts }
}

export function getClubMentionMessageIds(items: ChatMentionNotificationItem[], clubId: string): string[] {
  const normalizedClubId = String(clubId ?? '').trim()
  if (!normalizedClubId) return []
  return items
    .filter(
      (item) =>
        String(item.type ?? '') === 'CHAT_MENTION' &&
        String(item.clubId ?? '').trim() === normalizedClubId
    )
    .map((item) => String(item.messageId ?? '').trim())
    .filter(Boolean)
}

export function getTournamentMentionMessageIds(items: ChatMentionNotificationItem[], tournamentId: string): string[] {
  const normalizedTournamentId = String(tournamentId ?? '').trim()
  if (!normalizedTournamentId) return []
  return items
    .filter(
      (item) =>
        String(item.type ?? '') === 'CHAT_MENTION' &&
        !String(item.divisionId ?? '').trim() &&
        String(item.tournamentId ?? '').trim() === normalizedTournamentId
    )
    .map((item) => String(item.messageId ?? '').trim())
    .filter(Boolean)
}

export function getDivisionMentionMessageIds(items: ChatMentionNotificationItem[], divisionId: string): string[] {
  const normalizedDivisionId = String(divisionId ?? '').trim()
  if (!normalizedDivisionId) return []
  return items
    .filter(
      (item) =>
        String(item.type ?? '') === 'CHAT_MENTION' &&
        String(item.divisionId ?? '').trim() === normalizedDivisionId
    )
    .map((item) => String(item.messageId ?? '').trim())
    .filter(Boolean)
}
