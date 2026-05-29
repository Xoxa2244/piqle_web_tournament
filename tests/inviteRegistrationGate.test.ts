import { afterEach, describe, expect, it } from 'vitest'
import {
  addInviteRegistrationTournamentId,
  hasInviteRegistrationDetails,
  isInviteRegistrationRequiredForTournament,
  parseInviteRegistrationTournamentIds,
} from '@/lib/inviteRegistrationGate'

describe('inviteRegistrationGate', () => {
  afterEach(() => {
    delete process.env.INVITE_REGISTRATION_REQUIRED_TOURNAMENT_IDS
  })

  it('tracks invite tournament ids without duplicates', () => {
    expect(addInviteRegistrationTournamentId('a,b', 'c')).toBe('c,a,b')
    expect(addInviteRegistrationTournamentId('a,b', 'a')).toBe('a,b')
    expect(parseInviteRegistrationTournamentIds(' a, b, a ,, c ')).toEqual(['a', 'b', 'c'])
  })

  it('requires invite registration from cookie or env configuration', () => {
    expect(isInviteRegistrationRequiredForTournament('t1', new Set(['t1']))).toBe(true)
    expect(isInviteRegistrationRequiredForTournament('t2', new Set(['t1']))).toBe(false)

    process.env.INVITE_REGISTRATION_REQUIRED_TOURNAMENT_IDS = 't2,t3'
    expect(isInviteRegistrationRequiredForTournament('t2', null)).toBe(true)
  })

  it('recognizes submitted invite registration details', () => {
    expect(hasInviteRegistrationDetails({ source: 'invite_registration' })).toBe(true)
    expect(hasInviteRegistrationDetails({ source: 'manual' })).toBe(false)
    expect(hasInviteRegistrationDetails(null)).toBe(false)
  })
})
