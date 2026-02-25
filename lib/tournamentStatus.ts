export type TournamentStatus = 'past' | 'upcoming' | 'in_progress'

export function getTournamentStatus(tournament: {
  startDate: Date | string
  endDate: Date | string
}): TournamentStatus {
  const now = new Date()
  const start = new Date(tournament.startDate)
  const end = new Date(tournament.endDate)
  const endWithGrace = new Date(end)
  endWithGrace.setHours(endWithGrace.getHours() + 12)
  const nextDay = new Date(now)
  nextDay.setDate(nextDay.getDate() + 1)
  nextDay.setHours(0, 0, 0, 0)
  if (endWithGrace < nextDay) return 'past'
  if (start > now) return 'upcoming'
  return 'in_progress'
}

export function getTournamentStatusLabel(status: TournamentStatus) {
  switch (status) {
    case 'past':
      return 'Past'
    case 'upcoming':
      return 'Upcoming'
    case 'in_progress':
      return 'In progress'
  }
}

export function getTournamentStatusBadgeClass(status: TournamentStatus) {
  switch (status) {
    case 'past':
      return 'bg-gray-100 text-gray-700'
    case 'upcoming':
      return 'bg-blue-50 text-blue-700'
    case 'in_progress':
      return 'bg-green-50 text-green-700'
  }
}
