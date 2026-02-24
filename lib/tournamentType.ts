export function getTournamentTypeLabel(format?: string | null) {
  switch (format) {
    case 'SINGLE_ELIMINATION':
      return 'Single elim'
    case 'ROUND_ROBIN':
      return 'Round robin'
    case 'MLP':
      return 'MLP'
    case 'INDY_LEAGUE':
      return 'Indy league'
    case 'LEAGUE_ROUND_ROBIN':
      return 'League RR'
    case 'ONE_DAY_LADDER':
      return 'One-day ladder'
    case 'LADDER_LEAGUE':
      return 'Ladder league'
    default:
      return 'Tournament'
  }
}
