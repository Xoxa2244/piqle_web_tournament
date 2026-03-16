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

describe('Сообщения для цепочек', () => {
  describe('Тип: resend_new_subject (повторная отправка)', () => {
    it('email с новым subject, содержит имя и название сессии', () => {
      const msg = generateSequenceMessage('resend_new_subject', baseInput)
      expect(msg.channel).toBe('email')
      expect(msg.emailSubject).toContain('Alex')
      expect(msg.emailSubject).toContain('Padel Club NYC')
      expect(msg.emailBody).toContain('Thursday Open Play')
      expect(msg.smsBody).toContain('Alex')
    })
  })

  describe('Тип: social_proof (подтверждение популярности)', () => {
    it('sameLevelCount > 0 → "at your level" в subject', () => {
      const msg = generateSequenceMessage('social_proof', baseInput)
      expect(msg.channel).toBe('email')
      expect(msg.emailSubject).toContain('at your level')
      expect(msg.emailBody).toContain('popular')
    })

    it('sameLevelCount = 0, confirmedCount > 0 → "already signed up"', () => {
      const msg = generateSequenceMessage('social_proof', { ...baseInput, sameLevelCount: 0 })
      // confirmedCount=5 still present → "5 players already signed up"
      expect(msg.emailSubject).toContain('already signed up')
    })

    it('нет данных о участниках → "friends are playing"', () => {
      const msg = generateSequenceMessage('social_proof', { ...baseInput, sameLevelCount: 0, confirmedCount: 0 })
      expect(msg.emailSubject).toContain('friends are playing')
    })
  })

  describe('Тип: value_reminder (ценность клуба)', () => {
    it('содержит "improvements" и "community"', () => {
      const msg = generateSequenceMessage('value_reminder', baseInput)
      expect(msg.channel).toBe('email')
      expect(msg.emailBody).toContain('improvements')
      expect(msg.emailBody).toContain('community')
    })
  })

  describe('Тип: urgency_resend (срочность)', () => {
    it('содержит "spots" и "miss out"', () => {
      const msg = generateSequenceMessage('urgency_resend', baseInput)
      expect(msg.channel).toBe('email')
      expect(msg.emailSubject).toContain('spots')
      expect(msg.emailBody).toContain('miss out')
    })
  })

  describe('Тип: sms_nudge (SMS-напоминание)', () => {
    it('канал SMS, содержит имя и сессию, длина < 320 символов', () => {
      const msg = generateSequenceMessage('sms_nudge', baseInput)
      expect(msg.channel).toBe('sms')
      expect(msg.smsBody).toContain('Alex')
      expect(msg.smsBody).toContain('Thursday Open Play')
      expect(msg.smsBody.length).toBeLessThan(320) // SMS length limit
    })
  })

  describe('Тип: final_offer (последний шанс)', () => {
    it('мягкий тон: "last nudge" и "no worries"', () => {
      const msg = generateSequenceMessage('final_offer', baseInput)
      expect(msg.channel).toBe('email')
      expect(msg.emailBody).toContain('last nudge')
      expect(msg.emailBody).toContain('no worries')
    })
  })

  describe('Тип: final_email (финальное письмо)', () => {
    it('содержит "spot is always open"', () => {
      const msg = generateSequenceMessage('final_email', baseInput)
      expect(msg.channel).toBe('email')
      expect(msg.emailBody).toContain('spot is always open')
    })
  })

  describe('Тип: community (сообщество)', () => {
    it('"friends miss you" + количество дней отсутствия', () => {
      const msg = generateSequenceMessage('community', baseInput)
      expect(msg.channel).toBe('email')
      expect(msg.emailSubject).toContain('friends miss you')
      expect(msg.emailBody).toContain('14 days')
      expect(msg.emailBody).toContain('playing partners')
    })
  })

  describe('Тип: winback_offer (возвращение)', () => {
    it('самое эмоциональное: "want you back" и "miss having you"', () => {
      const msg = generateSequenceMessage('winback_offer', baseInput)
      expect(msg.channel).toBe('email')
      expect(msg.emailSubject).toContain('want you back')
      expect(msg.emailBody).toContain('miss having you')
    })
  })

  describe('Граничные случаи', () => {
    it('нет названия сессии → fallback "our next session"', () => {
      const msg = generateSequenceMessage('sms_nudge', {
        ...baseInput,
        suggestedSessionTitle: undefined,
      })
      expect(msg.smsBody).toContain('our next session')
    })

    it('пустое имя → fallback "there"', () => {
      const msg = generateSequenceMessage('resend_new_subject', {
        ...baseInput,
        memberName: '',
      })
      expect(msg.emailSubject).toContain('there')
    })

    it('нет social proof → нет undefined в тексте', () => {
      const msg = generateSequenceMessage('social_proof', {
        ...baseInput,
        confirmedCount: 0,
        sameLevelCount: 0,
      })
      expect(msg.emailBody).not.toContain('undefined')
    })

    it('неизвестный тип → fallback-шаблон с "reminder"', () => {
      const msg = generateSequenceMessage(undefined as any, baseInput)
      expect(msg.channel).toBe('email')
      expect(msg.emailBody).toContain('reminder')
    })
  })
})
