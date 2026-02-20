import { type TournamentFormat } from '../data/mockData'
import { trpcClient } from './trpcClient'

export type ManagerDataSource = 'live' | 'fallback'

type ManagerResult<T> = {
  data: T
  source: ManagerDataSource
}

export type ManagerPool = {
  id: string
  name: string
  order: number
}

export type ManagerTeam = {
  id: string
  name: string
  seed: number | null
  note: string | null
  poolId: string | null
}

export type ManagerGame = {
  id: string
  index: number
  scoreA: number | null
  scoreB: number | null
}

export type ManagerMatch = {
  id: string
  stage: string
  roundIndex: number
  locked: boolean
  teamAId: string | null
  teamBId: string | null
  teamAName: string
  teamBName: string
  games: ManagerGame[]
}

export type ManagerDivision = {
  id: string
  name: string
  teamKind: 'SINGLES_1v1' | 'DOUBLES_2v2' | 'SQUAD_4v4'
  pairingMode: 'FIXED' | 'MIX_AND_MATCH'
  poolCount: number
  maxTeams: number | null
  pools: ManagerPool[]
  teams: ManagerTeam[]
  matches: ManagerMatch[]
}

export type ManagerTournament = {
  id: string
  title: string
  description: string
  format: TournamentFormat
  venueName: string
  venueAddress: string
  startDateIso: string
  endDateIso: string
  entryFeeCents: number
  isPublicBoardEnabled: boolean
  allowDuprSubmission: boolean
  divisions: ManagerDivision[]
}

type TeamKind = ManagerDivision['teamKind']
type PairingMode = ManagerDivision['pairingMode']

const knownFormats: TournamentFormat[] = [
  'SINGLE_ELIMINATION',
  'ROUND_ROBIN',
  'MLP',
  'INDY_LEAGUE',
  'LEAGUE_ROUND_ROBIN',
  'ONE_DAY_LADDER',
  'LADDER_LEAGUE',
]

const normalizeFormat = (value: unknown): TournamentFormat => {
  if (typeof value === 'string' && knownFormats.includes(value as TournamentFormat)) {
    return value as TournamentFormat
  }
  return 'ROUND_ROBIN'
}

const toIsoString = (value: unknown) => {
  const date = new Date(String(value || ''))
  if (Number.isNaN(date.getTime())) return new Date().toISOString()
  return date.toISOString()
}

const toManagerTournament = (raw: any): ManagerTournament => {
  const divisions = Array.isArray(raw?.divisions) ? raw.divisions : []
  return {
    id: String(raw?.id ?? ''),
    title: String(raw?.title ?? 'Untitled tournament'),
    description: String(raw?.description ?? ''),
    format: normalizeFormat(raw?.format),
    venueName: String(raw?.venueName ?? ''),
    venueAddress: String(raw?.venueAddress ?? ''),
    startDateIso: toIsoString(raw?.startDate),
    endDateIso: toIsoString(raw?.endDate),
    entryFeeCents:
      typeof raw?.entryFeeCents === 'number'
        ? raw.entryFeeCents
        : Math.max(0, Math.round(Number(raw?.entryFee ?? 0) * 100)),
    isPublicBoardEnabled: Boolean(raw?.isPublicBoardEnabled),
    allowDuprSubmission: Boolean(raw?.allowDuprSubmission),
    divisions: divisions.map((division: any) => {
      const pools = Array.isArray(division?.pools) ? division.pools : []
      const teams = Array.isArray(division?.teams) ? division.teams : []
      const matches = Array.isArray(division?.matches) ? division.matches : []

      return {
        id: String(division?.id ?? ''),
        name: String(division?.name ?? 'Division'),
        teamKind: (division?.teamKind as TeamKind) || 'DOUBLES_2v2',
        pairingMode: (division?.pairingMode as PairingMode) || 'FIXED',
        poolCount: Number(division?.poolCount ?? pools.length ?? 0),
        maxTeams: typeof division?.maxTeams === 'number' ? division.maxTeams : null,
        pools: pools
          .map((pool: any) => ({
            id: String(pool?.id ?? ''),
            name: String(pool?.name ?? ''),
            order: Number(pool?.order ?? 0),
          }))
          .sort((a: ManagerPool, b: ManagerPool) => a.order - b.order),
        teams: teams.map((team: any) => ({
          id: String(team?.id ?? ''),
          name: String(team?.name ?? 'Team'),
          seed: typeof team?.seed === 'number' ? team.seed : null,
          note: team?.note == null ? null : String(team.note),
          poolId: team?.poolId == null ? null : String(team.poolId),
        })),
        matches: matches
          .map((match: any) => ({
            id: String(match?.id ?? ''),
            stage: String(match?.stage ?? 'ROUND_ROBIN'),
            roundIndex: Number(match?.roundIndex ?? 0),
            locked: Boolean(match?.locked),
            teamAId: match?.teamAId == null ? null : String(match.teamAId),
            teamBId: match?.teamBId == null ? null : String(match.teamBId),
            teamAName: String(match?.teamA?.name ?? 'TBD'),
            teamBName: String(match?.teamB?.name ?? 'TBD'),
            games: (Array.isArray(match?.games) ? match.games : []).map((game: any) => ({
              id: String(game?.id ?? ''),
              index: Number(game?.index ?? 0),
              scoreA: typeof game?.scoreA === 'number' ? game.scoreA : null,
              scoreB: typeof game?.scoreB === 'number' ? game.scoreB : null,
            })),
          }))
          .sort((a: ManagerMatch, b: ManagerMatch) => {
            if (a.roundIndex !== b.roundIndex) return a.roundIndex - b.roundIndex
            return a.id.localeCompare(b.id)
          }),
      } satisfies ManagerDivision
    }),
  }
}

export async function fetchManagerTournament(
  tournamentId: string
): Promise<ManagerResult<ManagerTournament | null>> {
  try {
    const tournament = await trpcClient.tournament.get.query({ id: tournamentId })
    return {
      data: tournament ? toManagerTournament(tournament) : null,
      source: 'live',
    }
  } catch {
    return {
      data: null,
      source: 'fallback',
    }
  }
}

export async function updateManagerTournamentSettings(input: {
  id: string
  title: string
  description: string
  venueName: string
  venueAddress: string
  startDateIso: string
  endDateIso: string
  entryFeeCents: number
  isPublicBoardEnabled: boolean
  allowDuprSubmission: boolean
}) {
  return trpcClient.tournament.update.mutate({
    id: input.id,
    title: input.title,
    description: input.description || undefined,
    venueName: input.venueName || undefined,
    venueAddress: input.venueAddress || undefined,
    startDate: new Date(input.startDateIso).toISOString(),
    endDate: new Date(input.endDateIso).toISOString(),
    entryFeeCents: Math.max(0, Math.floor(input.entryFeeCents || 0)),
    isPublicBoardEnabled: input.isPublicBoardEnabled,
    allowDuprSubmission: input.allowDuprSubmission,
  })
}

export async function createManagerDivision(input: {
  tournamentId: string
  name: string
  teamKind: TeamKind
  pairingMode: PairingMode
  poolCount: number
  maxTeams?: number | null
}) {
  return trpcClient.division.create.mutate({
    tournamentId: input.tournamentId,
    name: input.name,
    teamKind: input.teamKind,
    pairingMode: input.pairingMode,
    poolCount: Math.max(0, Math.floor(input.poolCount)),
    maxTeams: typeof input.maxTeams === 'number' ? Math.max(2, Math.floor(input.maxTeams)) : undefined,
  })
}

export async function updateManagerDivision(input: {
  id: string
  name: string
  poolCount: number
  maxTeams?: number | null
}) {
  return trpcClient.division.update.mutate({
    id: input.id,
    name: input.name,
    poolCount: Math.max(0, Math.floor(input.poolCount)),
    maxTeams: typeof input.maxTeams === 'number' ? Math.max(2, Math.floor(input.maxTeams)) : undefined,
  })
}

export async function deleteManagerDivision(divisionId: string) {
  return trpcClient.division.delete.mutate({ id: divisionId })
}

export async function createManagerTeam(input: {
  divisionId: string
  name: string
  seed?: number | null
  poolId?: string | null
}) {
  return trpcClient.team.create.mutate({
    divisionId: input.divisionId,
    name: input.name,
    seed: typeof input.seed === 'number' ? input.seed : undefined,
    poolId: input.poolId || undefined,
  })
}

export async function updateManagerTeam(input: {
  id: string
  name: string
  seed?: number | null
  poolId?: string | null
}) {
  return trpcClient.team.update.mutate({
    id: input.id,
    name: input.name,
    seed: typeof input.seed === 'number' ? input.seed : undefined,
    poolId: input.poolId || undefined,
  })
}

export async function deleteManagerTeam(teamId: string) {
  return trpcClient.team.delete.mutate({ id: teamId })
}

export async function generateManagerRoundRobin(divisionId: string, mode: 'generate' | 'regenerate') {
  if (mode === 'generate') {
    return trpcClient.match.generateRR.mutate({ divisionId })
  }
  return trpcClient.match.regenerateRR.mutate({ divisionId })
}

export async function saveManagerMatchScore(input: {
  matchId: string
  scoreA: number | null
  scoreB: number | null
}) {
  return trpcClient.match.updateGameScore.mutate({
    matchId: input.matchId,
    gameIndex: 0,
    scoreA: input.scoreA,
    scoreB: input.scoreB,
  })
}
