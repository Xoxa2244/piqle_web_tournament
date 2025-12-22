import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Helper function to get display name for a team
 * For SINGLES_1v1: returns player name (FirstName LastName)
 * For DOUBLES_2v2 and SQUAD_4v4: returns team name
 */
export function getTeamDisplayName(
  team: { 
    name: string
    teamPlayers?: Array<{ 
      player: { 
        firstName: string
        lastName: string 
      } 
    }> 
  },
  teamKind?: 'SINGLES_1v1' | 'DOUBLES_2v2' | 'SQUAD_4v4' | null
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

/**
 * Formats DUPR rating to always show 3 decimal places
 * @param rating - Rating value (can be string, number, or null)
 * @returns Formatted rating string with 3 decimal places, or null if rating is invalid
 */
export function formatDuprRating(rating: string | number | null | undefined): string | null {
  if (rating === null || rating === undefined) return null
  
  const numValue = typeof rating === 'string' ? parseFloat(rating) : Number(rating)
  if (isNaN(numValue)) return null
  
  return numValue.toFixed(3)
}