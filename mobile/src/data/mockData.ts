export type TournamentFormat =
  | 'SINGLE_ELIMINATION'
  | 'ROUND_ROBIN'
  | 'MLP'
  | 'INDY_LEAGUE'
  | 'LEAGUE_ROUND_ROBIN'
  | 'ONE_DAY_LADDER'
  | 'LADDER_LEAGUE'

export type ManagementPolicy = 'WEB_ONLY' | 'MOBILE_ALLOWED'

export interface Tournament {
  id: string
  title: string
  club: string
  city: string
  format: TournamentFormat
  startAt: string
  endAt: string
  participants: number
  capacity: number
  entryFeeUsd: number
  description: string
  chatCount: number
  role: 'PLAYER' | 'ORGANIZER'
}

export interface ChatThread {
  id: string
  title: string
  kind: 'TOURNAMENT' | 'CLUB'
  lastMessage: string
  updatedAtLabel: string
  unread: number
}

const allTournaments: Tournament[] = [
  {
    id: 't1',
    title: 'San Diego Spring Open',
    club: 'Coastline Pickle Club',
    city: 'San Diego, CA',
    format: 'ROUND_ROBIN',
    startAt: 'Mar 8, 2026 9:00 AM',
    endAt: 'Mar 8, 2026 6:00 PM',
    participants: 46,
    capacity: 64,
    entryFeeUsd: 45,
    description: 'Mixed doubles event with two guaranteed stages and social finals.',
    chatCount: 72,
    role: 'ORGANIZER',
  },
  {
    id: 't2',
    title: 'California MLP Showcase',
    club: 'Bayline Sports Hub',
    city: 'San Jose, CA',
    format: 'MLP',
    startAt: 'Mar 14, 2026 8:00 AM',
    endAt: 'Mar 15, 2026 8:30 PM',
    participants: 118,
    capacity: 128,
    entryFeeUsd: 120,
    description: 'Premier team event with advanced playoff logic and stage operations.',
    chatCount: 214,
    role: 'ORGANIZER',
  },
  {
    id: 't3',
    title: 'Downtown Night Ladder',
    club: 'Urban Serve Community',
    city: 'Los Angeles, CA',
    format: 'ONE_DAY_LADDER',
    startAt: 'Mar 18, 2026 6:30 PM',
    endAt: 'Mar 18, 2026 10:30 PM',
    participants: 22,
    capacity: 32,
    entryFeeUsd: 25,
    description: 'Fast one-evening ladder with rolling courts and instant updates.',
    chatCount: 19,
    role: 'PLAYER',
  },
  {
    id: 't4',
    title: 'Indy League West Division',
    club: 'Summit Racquet Center',
    city: 'Sacramento, CA',
    format: 'INDY_LEAGUE',
    startAt: 'Apr 4, 2026 9:00 AM',
    endAt: 'Jun 28, 2026 6:00 PM',
    participants: 192,
    capacity: 192,
    entryFeeUsd: 0,
    description: 'Season league with match days, rosters, court scheduling, and standings.',
    chatCount: 460,
    role: 'ORGANIZER',
  },
  {
    id: 't5',
    title: 'Saturday Doubles Cup',
    club: 'Orange County Pickle',
    city: 'Irvine, CA',
    format: 'SINGLE_ELIMINATION',
    startAt: 'Mar 22, 2026 10:00 AM',
    endAt: 'Mar 22, 2026 7:00 PM',
    participants: 30,
    capacity: 40,
    entryFeeUsd: 35,
    description: 'Straight bracket tournament for intermediate and advanced divisions.',
    chatCount: 33,
    role: 'ORGANIZER',
  },
]

export const chatThreads: ChatThread[] = [
  {
    id: 'c1',
    title: 'San Diego Spring Open',
    kind: 'TOURNAMENT',
    lastMessage: 'Schedule dropped for quarterfinal courts.',
    updatedAtLabel: '2m ago',
    unread: 4,
  },
  {
    id: 'c2',
    title: 'Urban Serve Community',
    kind: 'CLUB',
    lastMessage: 'Looking for one sub for tonight at 7 PM.',
    updatedAtLabel: '18m ago',
    unread: 1,
  },
  {
    id: 'c3',
    title: 'Saturday Doubles Cup',
    kind: 'TOURNAMENT',
    lastMessage: 'Registration closes tomorrow at midnight.',
    updatedAtLabel: '1h ago',
    unread: 0,
  },
]

export const feedTournaments = allTournaments
export const organizerTournaments = allTournaments.filter((t) => t.role === 'ORGANIZER')

export function getTournamentById(tournamentId: string): Tournament | null {
  return allTournaments.find((t) => t.id === tournamentId) ?? null
}

export function getManagementPolicy(format: TournamentFormat): ManagementPolicy {
  if (format === 'MLP' || format === 'INDY_LEAGUE') {
    return 'WEB_ONLY'
  }
  return 'MOBILE_ALLOWED'
}

export function isWebOnlyTournament(tournament: Tournament): boolean {
  return getManagementPolicy(tournament.format) === 'WEB_ONLY'
}
