import {
  chatThreads,
  feedTournaments,
  getTournamentById,
  organizerTournaments,
  type ChatThread,
  type Tournament,
  type TournamentFormat,
} from '../data/mockData'
import { trpcClient } from './trpcClient'

export type DataSource = 'live' | 'fallback'
export type TournamentFeedPolicy = 'ALL' | 'MOBILE' | 'WEB_ONLY'
export type TournamentFeedFormat = 'ALL' | TournamentFormat

type DataResult<T> = {
  data: T
  source: DataSource
}

export type TournamentFeedPage = {
  items: Tournament[]
  nextCursor: string | null
  totalCount: number
}

type FetchTournamentFeedPageInput = {
  limit: number
  cursor?: string | null
  searchQuery?: string
  policy?: TournamentFeedPolicy
  format?: TournamentFeedFormat
}

const knownFormats: TournamentFormat[] = [
  'SINGLE_ELIMINATION',
  'ROUND_ROBIN',
  'MLP',
  'INDY_LEAGUE',
  'LEAGUE_ROUND_ROBIN',
  'ONE_DAY_LADDER',
  'LADDER_LEAGUE',
]

const normalizeFormat = (rawFormat: unknown): TournamentFormat => {
  if (typeof rawFormat === 'string' && knownFormats.includes(rawFormat as TournamentFormat)) {
    return rawFormat as TournamentFormat
  }
  return 'ROUND_ROBIN'
}

const inferCity = (address: string | null | undefined) => {
  if (!address) return 'Unknown city'
  const parts = address.split(',').map((part) => part.trim())
  if (parts.length >= 2) {
    return `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`
  }
  return address
}

const toDateLabel = (value: unknown) => {
  if (!value) return 'TBD'
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return 'TBD'
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const toEntryFeeUsd = (value: any, cents: any) => {
  if (typeof cents === 'number') return Math.max(0, Math.round(cents / 100))
  if (typeof value === 'number') return value
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const mapTournament = (raw: any, role: 'PLAYER' | 'ORGANIZER'): Tournament => {
  const divisionCount = Array.isArray(raw?.divisions) ? raw.divisions.length : 0
  const participants = Math.max(0, divisionCount * 8)
  const capacity = participants > 0 ? participants + 16 : 64
  const venueName = raw?.club?.name || raw?.venueName || 'Piqle Club'
  const venueAddress = raw?.venueAddress || ''

  return {
    id: String(raw?.id ?? ''),
    title: String(raw?.title ?? 'Untitled event'),
    club: String(venueName),
    city: inferCity(venueAddress),
    format: normalizeFormat(raw?.format),
    startAt: toDateLabel(raw?.startDate),
    endAt: toDateLabel(raw?.endDate),
    participants,
    capacity,
    entryFeeUsd: toEntryFeeUsd(raw?.entryFee, raw?.entryFeeCents),
    description: String(raw?.description ?? 'No description yet.'),
    chatCount: 0,
    role,
  }
}

function isMatchByPolicy(tournament: Tournament, policy: TournamentFeedPolicy) {
  if (policy === 'ALL') return true
  const webOnly = tournament.format === 'MLP' || tournament.format === 'INDY_LEAGUE'
  return policy === 'WEB_ONLY' ? webOnly : !webOnly
}

function isMatchBySearch(tournament: Tournament, rawQuery: string) {
  const query = rawQuery.trim().toLowerCase()
  if (!query) return true
  return [tournament.title, tournament.club, tournament.city, tournament.description, tournament.format]
    .join(' ')
    .toLowerCase()
    .includes(query)
}

function isMatchByFormat(tournament: Tournament, formatFilter: TournamentFeedFormat) {
  if (formatFilter === 'ALL') return true
  return tournament.format === formatFilter
}

function parseFallbackCursor(cursor: string | null | undefined) {
  const value = Number(cursor)
  if (!Number.isFinite(value) || value < 0) return 0
  return Math.floor(value)
}

function sortByStartDateDesc(a: Tournament, b: Tournament) {
  const aDate = Date.parse(a.startAt)
  const bDate = Date.parse(b.startAt)
  if (!Number.isFinite(aDate) && !Number.isFinite(bDate)) {
    return b.id.localeCompare(a.id)
  }
  if (!Number.isFinite(aDate)) return 1
  if (!Number.isFinite(bDate)) return -1
  if (aDate !== bDate) return bDate - aDate
  return b.id.localeCompare(a.id)
}

export async function fetchTournamentFeedPage(
  input: FetchTournamentFeedPageInput
): Promise<DataResult<TournamentFeedPage>> {
  const limit = Math.max(1, Math.min(30, Math.floor(input.limit || 12)))
  const policy = input.policy ?? 'ALL'
  const format = input.format ?? 'ALL'
  const searchQuery = input.searchQuery?.trim() ?? ''

  try {
    const payload = await trpcClient.public.listMobileFeed.query({
      limit,
      cursor: input.cursor ?? undefined,
      search: searchQuery || undefined,
      policy,
      format,
    })

    return {
      data: {
        items: (payload?.items ?? []).map((item: any) => mapTournament(item, 'PLAYER')),
        nextCursor: payload?.nextCursor ?? null,
        totalCount: Number(payload?.totalCount ?? 0),
      },
      source: 'live',
    }
  } catch {
    const filtered = [...feedTournaments]
      .filter((tournament) => isMatchByPolicy(tournament, policy))
      .filter((tournament) => isMatchByFormat(tournament, format))
      .filter((tournament) => isMatchBySearch(tournament, searchQuery))
      .sort(sortByStartDateDesc)

    const offset = parseFallbackCursor(input.cursor)
    const items = filtered.slice(offset, offset + limit)
    const nextOffset = offset + items.length
    const nextCursor = nextOffset < filtered.length ? String(nextOffset) : null

    return {
      data: {
        items,
        nextCursor,
        totalCount: filtered.length,
      },
      source: 'fallback',
    }
  }
}

export async function fetchFeedTournaments(): Promise<DataResult<Tournament[]>> {
  try {
    const tournaments = await trpcClient.tournament.list.query()
    return {
      data: (tournaments as any[]).map((item) =>
        mapTournament(item, item?.isOwner ? 'ORGANIZER' : 'PLAYER')
      ),
      source: 'live',
    }
  } catch {
    try {
      const boards = await trpcClient.public.listBoards.query()
      return {
        data: (boards as any[]).map((board) => mapTournament(board, 'PLAYER')),
        source: 'live',
      }
    } catch {
      return { data: feedTournaments, source: 'fallback' }
    }
  }
}

export async function fetchTournamentDetails(tournamentId: string): Promise<DataResult<Tournament | null>> {
  try {
    const tournament = await trpcClient.public.getTournamentById.query({ id: tournamentId })
    return {
      data: tournament ? mapTournament(tournament, 'PLAYER') : null,
      source: 'live',
    }
  } catch {
    return { data: getTournamentById(tournamentId), source: 'fallback' }
  }
}

export async function fetchMyTournaments(): Promise<DataResult<Tournament[]>> {
  try {
    const tournaments = await trpcClient.tournament.list.query()
    return {
      data: (tournaments as any[])
        .filter((item) => Boolean(item?.isOwner))
        .map((item) => mapTournament(item, 'ORGANIZER')),
      source: 'live',
    }
  } catch {
    return { data: organizerTournaments, source: 'fallback' }
  }
}

export async function fetchEventChatThreads(): Promise<DataResult<ChatThread[]>> {
  try {
    const events = await trpcClient.tournamentChat.listMyEventChats.query()
    const mapped = (events as any[]).map((event) => ({
      id: String(event.id),
      title: String(event.title),
      kind: 'TOURNAMENT' as const,
      lastMessage:
        event.unreadCount > 0
          ? `${event.unreadCount} unread messages`
          : `${Array.isArray(event.divisions) ? event.divisions.length : 0} divisions`,
      updatedAtLabel: toDateLabel(event.startDate),
      unread: Number(event.unreadCount ?? 0),
    }))

    return { data: mapped, source: 'live' }
  } catch {
    return { data: chatThreads, source: 'fallback' }
  }
}

export async function fetchRegistrationSummary(
  tournamentId: string
): Promise<DataResult<{ entryFeeUsd: number; statusLabel: string }>> {
  try {
    const [seatMap, myStatus] = await Promise.all([
      trpcClient.registration.getSeatMap.query({ tournamentId }),
      trpcClient.registration.getMyStatus.query({ tournamentId }),
    ])

    const statusLabel =
      myStatus?.status === 'active'
        ? 'Registered'
        : myStatus?.status === 'waitlist'
          ? 'On waitlist'
          : 'Not registered'

    return {
      data: {
        entryFeeUsd: toEntryFeeUsd(null, seatMap?.entryFeeCents),
        statusLabel,
      },
      source: 'live',
    }
  } catch {
    const fallback = getTournamentById(tournamentId)
    return {
      data: {
        entryFeeUsd: fallback?.entryFeeUsd ?? 0,
        statusLabel: 'Status unavailable (sign in required)',
      },
      source: 'fallback',
    }
  }
}

export async function fetchRegistrationStatusMessage(
  tournamentId: string
): Promise<DataResult<string>> {
  try {
    const myStatus = await trpcClient.registration.getMyStatus.query({ tournamentId })
    const message =
      myStatus?.status === 'active'
        ? 'You are already registered.'
        : myStatus?.status === 'waitlist'
          ? 'You are on the waitlist.'
          : 'No registration found yet.'
    return { data: message, source: 'live' }
  } catch {
    return { data: 'Could not verify registration. Sign in is required for live status.', source: 'fallback' }
  }
}

const getTeamSlotCount = (teamKind: unknown) => {
  switch (teamKind) {
    case 'SINGLES_1v1':
      return 1
    case 'DOUBLES_2v2':
      return 2
    default:
      return 4
  }
}

export async function submitRegistration(
  tournamentId: string,
  registrationType: 'individual' | 'team'
): Promise<DataResult<string>> {
  try {
    const myStatus = await trpcClient.registration.getMyStatus.query({ tournamentId })
    if (myStatus?.status === 'active') {
      return { data: 'You are already registered in this tournament.', source: 'live' }
    }
    if (myStatus?.status === 'waitlist') {
      return { data: 'You are already on the waitlist.', source: 'live' }
    }

    const seatMap = await trpcClient.registration.getSeatMap.query({ tournamentId })
    const divisions = Array.isArray(seatMap?.divisions) ? seatMap.divisions : []

    for (const division of divisions) {
      const teams = Array.isArray(division?.teams) ? division.teams : []
      const slotCount = getTeamSlotCount(division?.teamKind)

      for (const team of teams) {
        const occupiedSlots = new Set<number>(
          (Array.isArray(team?.teamPlayers) ? team.teamPlayers : [])
            .map((teamPlayer: any) => teamPlayer?.slotIndex)
            .filter((slotIndex: any) => Number.isInteger(slotIndex))
        )

        const preferredSlots = registrationType === 'team' ? [0] : [...Array(slotCount)].map((_, i) => i)
        const fallbackSlots = registrationType === 'team' ? [...Array(slotCount)].map((_, i) => i) : preferredSlots

        const candidateSlots = Array.from(new Set([...preferredSlots, ...fallbackSlots]))

        for (const slotIndex of candidateSlots) {
          if (occupiedSlots.has(slotIndex)) continue
          try {
            await trpcClient.registration.claimSlot.mutate({
              teamId: team.id,
              slotIndex,
            })
            return {
              data: 'Registration confirmed. Your slot is reserved.',
              source: 'live',
            }
          } catch (claimError: any) {
            const message = String(claimError?.message || '')
            const recoverable =
              message.includes('Slot already taken') ||
              message.includes('CONFLICT') ||
              message.includes('Registration closed')
            if (!recoverable) {
              throw claimError
            }
          }
        }
      }
    }

    if (divisions.length > 0) {
      await trpcClient.registration.joinWaitlist.mutate({ divisionId: divisions[0].id })
      return {
        data: 'No open slots found. You were added to the waitlist.',
        source: 'live',
      }
    }

    return {
      data: 'No divisions available for registration.',
      source: 'live',
    }
  } catch (error: any) {
    const message = String(error?.message || '')
    if (message.includes('UNAUTHORIZED')) {
      return { data: 'Sign in required to register.', source: 'fallback' }
    }
    if (message.includes('Registration closed')) {
      return { data: 'Registration is currently closed.', source: 'live' }
    }
    return { data: 'Could not complete registration. Please try again.', source: 'fallback' }
  }
}
