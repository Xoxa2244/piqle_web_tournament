export const INVITE_REGISTRATION_LEVELS = [
  '2.5',
  '3.0',
  '3.5',
  '4.0',
  '4.5',
  'Free agent',
] as const

export const INVITE_REGISTRATION_CLUBS = [
  '3rd Shot Indy',
  'The Dink House',
  'Go West Sports',
  'Indianapolis Pickleball Club North',
  'Indianapolis Pickleball Club East',
  'Indianapolis Pickleball Club South',
  'Pickle on Penn',
  'No club',
] as const

export type InviteRegistrationLevel = (typeof INVITE_REGISTRATION_LEVELS)[number]
export type InviteRegistrationClub = (typeof INVITE_REGISTRATION_CLUBS)[number]

export type InviteRegistrationComment = {
  source: 'invite_registration'
  fullName: string
  phoneNumber?: string
  desiredLevel: InviteRegistrationLevel
  clubName: InviteRegistrationClub
  duprRating: number
  gender: 'M' | 'F'
  submittedAt: string
}

export function parseInviteRegistrationName(fullName: string) {
  const parts = fullName.trim().replace(/\s+/g, ' ').split(' ')
  const lastName = parts[0] ?? ''
  const firstName = parts.slice(1).join(' ')

  return {
    firstName,
    lastName,
  }
}

export function isInviteRegistrationComment(value: unknown): value is InviteRegistrationComment {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return record.source === 'invite_registration'
}
