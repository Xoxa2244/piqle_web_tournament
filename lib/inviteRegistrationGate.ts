import { isInviteRegistrationComment } from './inviteRegistration'

export const INVITE_REGISTRATION_TOURNAMENT_COOKIE = 'piqle_invite_registration_tournaments'

const MAX_TRACKED_TOURNAMENTS = 20

export function parseInviteRegistrationTournamentIds(value?: string | null): string[] {
  if (!value) return []

  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item, index, items) => item.length > 0 && items.indexOf(item) === index)
}

export function addInviteRegistrationTournamentId(value: string | null | undefined, tournamentId: string) {
  const existingIds = parseInviteRegistrationTournamentIds(value).filter((id) => id !== tournamentId)
  return [tournamentId, ...existingIds].slice(0, MAX_TRACKED_TOURNAMENTS).join(',')
}

export function isInviteRegistrationRequiredForTournament(
  tournamentId: string,
  trackedTournamentIds?: ReadonlySet<string> | readonly string[] | null
) {
  const configuredIds = parseInviteRegistrationTournamentIds(
    process.env.INVITE_REGISTRATION_REQUIRED_TOURNAMENT_IDS
  )
  if (configuredIds.includes(tournamentId)) return true

  if (!trackedTournamentIds) return false

  if ('has' in trackedTournamentIds) {
    return trackedTournamentIds.has(tournamentId)
  }

  return trackedTournamentIds.includes(tournamentId)
}

export function hasInviteRegistrationDetails(registrationComment: unknown) {
  return isInviteRegistrationComment(registrationComment)
}
