import { describe, it, expect } from 'vitest'
import { generateSequenceMessage } from '../../../lib/ai/sequence-messages'

const baseInput = {
  memberName: 'Alex Johnson',
  clubName: 'Padel Club NYC',
  daysSinceLastActivity: 14,
  suggestedSessionTitle: 'Thursday Open Play',
  suggestedSessionDate: 'Thursday, Mar 20',
  suggestedSessionTime: '6:00–8:00 PM',
  confirmedCount: 5,
  sameLevelCount: 3,
  spotsLeft: 4,
}

describe('generateSequenceMessage', () => {
  describe('resend_new_subject', () => {
    it('generates email with different subject', () => {
      const msg = generateSequenceMessage('resend_new_subject', baseInput)
      expect(msg.channel).toBe('email')
      expect(msg.emailSubject).toContain('Alex')
      expect(msg.emailSubject).toContain('Padel Club NYC')
      expect(msg.emailBody).toContain('Thursday Open Play')
      expect(msg.smsBody).toContain('Alex')
    })
  })

  describe('social_proof', () => {
    it('includes social proof in subject and body', () => {
      const msg = generateSequenceMessage('social_proof', baseInput)
      expect(msg.channel).toBe('email')
      expect(msg.emailSubject).toContain('at your level')
      expect(msg.emailBody).toContain('popular')
    })

    it('uses generic proof when no sameLevel count', () => {
      const msg = generateSequenceMessage('social_proof', { ...baseInput, sameLevelCount: 0 })
      // confirmedCount=5 still present → "5 players already signed up"
      expect(msg.emailSubject).toContain('already signed up')
    })

    it('falls back to friends playing when no counts at all', () => {
      const msg = generateSequenceMessage('social_proof', { ...baseInput, sameLevelCount: 0, confirmedCount: 0 })
      expect(msg.emailSubject).toContain('friends are playing')
    })
  })

  describe('value_reminder', () => {
    it('focuses on club value', () => {
      const msg = generateSequenceMessage('value_reminder', baseInput)
      expect(msg.channel).toBe('email')
      expect(msg.emailBody).toContain('improvements')
      expect(msg.emailBody).toContain('community')
    })
  })

  describe('urgency_resend', () => {
    it('creates urgency with spots left', () => {
      const msg = generateSequenceMessage('urgency_resend', baseInput)
      expect(msg.channel).toBe('email')
      expect(msg.emailSubject).toContain('spots')
      expect(msg.emailBody).toContain('miss out')
    })
  })

  describe('sms_nudge', () => {
    it('returns SMS channel', () => {
      const msg = generateSequenceMessage('sms_nudge', baseInput)
      expect(msg.channel).toBe('sms')
      expect(msg.smsBody).toContain('Alex')
      expect(msg.smsBody).toContain('Thursday Open Play')
      expect(msg.smsBody.length).toBeLessThan(320) // SMS length limit
    })
  })

  describe('final_offer', () => {
    it('has gentle/last-chance tone', () => {
      const msg = generateSequenceMessage('final_offer', baseInput)
      expect(msg.channel).toBe('email')
      expect(msg.emailBody).toContain('last nudge')
      expect(msg.emailBody).toContain('no worries')
    })
  })

  describe('final_email', () => {
    it('offers help getting back', () => {
      const msg = generateSequenceMessage('final_email', baseInput)
      expect(msg.channel).toBe('email')
      expect(msg.emailBody).toContain('spot is always open')
    })
  })

  describe('community', () => {
    it('emphasizes social connections', () => {
      const msg = generateSequenceMessage('community', baseInput)
      expect(msg.channel).toBe('email')
      expect(msg.emailSubject).toContain('friends miss you')
      expect(msg.emailBody).toContain('14 days')
      expect(msg.emailBody).toContain('playing partners')
    })
  })

  describe('winback_offer', () => {
    it('is the most emotional/personal', () => {
      const msg = generateSequenceMessage('winback_offer', baseInput)
      expect(msg.channel).toBe('email')
      expect(msg.emailSubject).toContain('want you back')
      expect(msg.emailBody).toContain('miss having you')
    })
  })

  describe('edge cases', () => {
    it('handles missing session title', () => {
      const msg = generateSequenceMessage('sms_nudge', {
        ...baseInput,
        suggestedSessionTitle: undefined,
      })
      expect(msg.smsBody).toContain('our next session')
    })

    it('handles missing name', () => {
      const msg = generateSequenceMessage('resend_new_subject', {
        ...baseInput,
        memberName: '',
      })
      expect(msg.emailSubject).toContain('there')
    })

    it('handles no social proof data', () => {
      const msg = generateSequenceMessage('social_proof', {
        ...baseInput,
        confirmedCount: 0,
        sameLevelCount: 0,
      })
      expect(msg.emailBody).not.toContain('undefined')
    })

    it('handles unknown messageType with fallback', () => {
      const msg = generateSequenceMessage(undefined as any, baseInput)
      expect(msg.channel).toBe('email')
      expect(msg.emailBody).toContain('reminder')
    })
  })
})
