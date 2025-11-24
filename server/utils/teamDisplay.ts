/**
 * Helper function to get display name for a team
 * For SINGLES_1v1: returns player name (FirstName LastName)
 * For DOUBLES_2v2 and SQUAD_4v4: returns team name
 */
export function getTeamDisplayName(
  team: { 
    id: string
    name: string
    teamPlayers?: Array<{ 
      player: { 
        firstName: string
        lastName: string 
      } 
    }> 
  },
  teamKind: 'SINGLES_1v1' | 'DOUBLES_2v2' | 'SQUAD_4v4' | null | undefined
): string {
  // If teamKind is SINGLES_1v1 and team has players, return player name
  if (teamKind === 'SINGLES_1v1' && team.teamPlayers && team.teamPlayers.length > 0) {
    const player = team.teamPlayers[0].player
    const playerName = `${player.firstName} ${player.lastName}`.trim()
    if (playerName) {
      return playerName
    }
  }
  
  // Fallback to team name
  return team.name || 'Unknown Team'
}

