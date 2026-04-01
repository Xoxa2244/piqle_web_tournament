type TeamKind = 'SINGLES_1v1' | 'DOUBLES_2v2' | 'SQUAD_4v4'

type TeamLike = {
  _count?: {
    teamPlayers?: number | null
  } | null
  teamPlayers?: Array<{
    slotIndex?: number | null
    playerId?: string | null
    player?: { id?: string | null } | null
  } | null> | null
} | null

type DivisionLike = {
  name?: string | null
  teamKind?: string | null
  maxTeams?: number | null
  _count?: {
    teams?: number | null
  } | null
  teams?: TeamLike[] | null
} | null

type TournamentLike = {
  format?: string | null
  divisions?: DivisionLike[] | null
} | null

const inferTeamKind = (divisionName?: string | null, tournamentFormat?: string | null): TeamKind | null => {
  if (tournamentFormat === 'INDY_LEAGUE' || tournamentFormat === 'MLP') {
    return 'SQUAD_4v4'
  }

  const name = String(divisionName ?? '').trim().toLowerCase()
  if (!name) return null

  if (name.includes('1v1') || name.includes('single')) {
    return 'SINGLES_1v1'
  }
  if (name.includes('4v4') || name.includes('squad')) {
    return 'SQUAD_4v4'
  }
  if (name.includes('2v2') || name.includes('double')) {
    return 'DOUBLES_2v2'
  }

  return null
}

export const getPlayersPerTeam = (
  teamKind?: string | null,
  tournamentFormat?: string | null,
  divisionName?: string | null
) => {
  const resolvedTeamKind = (teamKind as TeamKind | null | undefined) ?? inferTeamKind(divisionName, tournamentFormat)

  if (!resolvedTeamKind) return null

  if (tournamentFormat === 'INDY_LEAGUE' && resolvedTeamKind === 'SQUAD_4v4') {
    return 32
  }

  switch (resolvedTeamKind) {
    case 'SINGLES_1v1':
      return 1
    case 'SQUAD_4v4':
      return 4
    case 'DOUBLES_2v2':
      return 2
    default:
      return null
  }
}

export const getDivisionSlotMetrics = (division: DivisionLike, tournamentFormat?: string | null) => {
  const createdTeams = Array.isArray(division?.teams)
    ? division.teams.length
    : Number(division?._count?.teams ?? 0)
  const slotsPerTeam = getPlayersPerTeam(division?.teamKind, tournamentFormat, division?.name)

  if (!slotsPerTeam) {
    return {
      createdTeams,
      slotsPerTeam: null,
      createdSlots: null,
      filledSlots: null,
      openSlots: null,
    }
  }

  if (!Array.isArray(division?.teams)) {
    return {
      createdTeams,
      slotsPerTeam,
      createdSlots: createdTeams * slotsPerTeam,
      filledSlots: null,
      openSlots: null,
    }
  }

  const createdSlots = createdTeams * slotsPerTeam
  const filledSlots = division.teams.reduce((sum, team) => {
    const teamPlayers = Array.isArray(team?.teamPlayers) ? team.teamPlayers.filter(Boolean) : []
    const assignedPlayers = teamPlayers.filter(
      (teamPlayer) => Boolean(teamPlayer?.playerId || teamPlayer?.player?.id)
    )
    if (assignedPlayers.length === 0) return sum

    const occupiedBySlotIndex = new Set<number>()
    for (const teamPlayer of assignedPlayers) {
      if (typeof teamPlayer?.slotIndex === 'number' && teamPlayer.slotIndex >= 0 && teamPlayer.slotIndex < slotsPerTeam) {
        occupiedBySlotIndex.add(teamPlayer.slotIndex)
      }
    }

    // Mirror the register screen fallback: assigned entries without slotIndex still occupy the next rendered slot.
    const occupiedSlots = occupiedBySlotIndex.size > 0
      ? Math.max(occupiedBySlotIndex.size, Math.min(assignedPlayers.length, slotsPerTeam))
      : Math.min(assignedPlayers.length, slotsPerTeam)

    return sum + Math.min(occupiedSlots, slotsPerTeam)
  }, 0)

  return {
    createdTeams,
    slotsPerTeam,
    createdSlots,
    filledSlots,
    openSlots: filledSlots === null ? null : Math.max(0, createdSlots - filledSlots),
  }
}

export const getTournamentSlotMetrics = (tournament: TournamentLike) => {
  const divisions = Array.isArray(tournament?.divisions) ? tournament.divisions : []

  let createdTeams = 0
  let createdSlots = 0
  let filledSlots = 0
  let hasExactFilledSlots = true

  for (const division of divisions) {
    const metrics = getDivisionSlotMetrics(division, tournament?.format)
    createdTeams += metrics.createdTeams

    if (metrics.createdSlots !== null) {
      createdSlots += metrics.createdSlots
    }

    if (metrics.createdTeams > 0 && metrics.filledSlots === null) {
      hasExactFilledSlots = false
    } else if (metrics.filledSlots !== null) {
      filledSlots += metrics.filledSlots
    }
  }

  const totalCreatedSlots = createdSlots > 0 ? createdSlots : 0
  const exactFilledSlots = hasExactFilledSlots ? filledSlots : null

  const openSlots =
    totalCreatedSlots > 0 && exactFilledSlots !== null
      ? Math.max(0, totalCreatedSlots - exactFilledSlots)
      : null

  return {
    createdTeams,
    createdSlots: totalCreatedSlots > 0 ? totalCreatedSlots : null,
    filledSlots: exactFilledSlots,
    openSlots,
    fillRatio:
      totalCreatedSlots > 0 && exactFilledSlots !== null
        ? exactFilledSlots / totalCreatedSlots
        : null,
  }
}
