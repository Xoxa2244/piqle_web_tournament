import { PlaySessionSkillLevel, TimeSlot, DayOfWeek } from '../../types/intelligence';

// Get day name from Date
export function getDayName(date: Date): DayOfWeek {
  const days: DayOfWeek[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[date.getDay()];
}

// Get time slot from HH:MM string
export function getTimeSlot(time: string): TimeSlot {
  const hour = parseInt(time.split(':')[0], 10);
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

// Get time slot display label
export function getTimeSlotLabel(slot: TimeSlot): string {
  const labels: Record<TimeSlot, string> = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' };
  return labels[slot];
}

// Format display label
export function getFormatLabel(format: string): string {
  const labels: Record<string, string> = {
    OPEN_PLAY: 'Open Play', CLINIC: 'Clinic', DRILL: 'Drill',
    LEAGUE_PLAY: 'League', LEAGUE: 'League', SOCIAL: 'Social',
    TOURNAMENT: 'Tournament', LADDER: 'Ladder', ROUND_ROBIN: 'Round Robin',
  };
  return labels[format?.toUpperCase()] || format;
}

// Skill level from DUPR rating
export function inferSkillLevel(duprRating: number | null): PlaySessionSkillLevel {
  if (!duprRating) return 'INTERMEDIATE';
  if (duprRating < 3.0) return 'BEGINNER';
  if (duprRating < 4.5) return 'INTERMEDIATE';
  return 'ADVANCED';
}

// Check if skill levels are adjacent
export function isAdjacentSkillLevel(a: PlaySessionSkillLevel, b: PlaySessionSkillLevel): boolean {
  const levels: PlaySessionSkillLevel[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];
  const idxA = levels.indexOf(a);
  const idxB = levels.indexOf(b);
  if (idxA === -1 || idxB === -1) return false;
  return Math.abs(idxA - idxB) === 1;
}

// Skill level display label
export function getSkillLevelLabel(level: PlaySessionSkillLevel): string {
  const labels: Record<PlaySessionSkillLevel, string> = {
    BEGINNER: 'Beginner (2.5-3.0)', INTERMEDIATE: 'Intermediate (3.5-4.5)',
    ADVANCED: 'Advanced (5.0+)', ALL_LEVELS: 'All Levels'
  };
  return labels[level];
}

// Calculate occupancy percentage
export function getOccupancyPercent(confirmedCount: number, maxPlayers: number): number {
  if (maxPlayers === 0) return 100;
  return Math.round((confirmedCount / maxPlayers) * 100);
}

// Days between two dates
export function daysBetween(a: Date, b: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.floor(Math.abs(b.getTime() - a.getTime()) / msPerDay);
}

// Clamp a number between min and max
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
