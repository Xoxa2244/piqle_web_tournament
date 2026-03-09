/**
 * Reactivation message variants generator
 * Creates 3 message templates with different tones for admin to choose from
 */

export type MessageTone = 'friendly' | 'professional' | 'urgent'

export interface MessageVariant {
  id: MessageTone
  label: string
  recommended: boolean
  emailBody: string
  smsBody: string
}

interface MessageInput {
  memberName: string
  clubName: string
  daysSinceLastActivity: number
  sessionCount: number
}

export function generateReactivationMessages(input: MessageInput): MessageVariant[] {
  const { memberName, clubName, daysSinceLastActivity, sessionCount } = input
  const firstName = memberName.split(' ')[0] || memberName

  return [
    {
      id: 'friendly',
      label: 'Friendly',
      recommended: true,
      emailBody: `Hey ${firstName}! We miss seeing you at ${clubName}. It's been ${daysSinceLastActivity} days since your last session — and we've been saving some great games for you! We have ${sessionCount} upcoming session${sessionCount !== 1 ? 's' : ''} that match your level. Come back and play with us!`,
      smsBody: `Hey ${firstName}! Miss you at ${clubName}! ${sessionCount} session${sessionCount !== 1 ? 's' : ''} coming up at your level. Come play!`,
    },
    {
      id: 'professional',
      label: 'Professional',
      recommended: false,
      emailBody: `Hi ${firstName}, this is a courtesy message from ${clubName}. You haven't attended a session in ${daysSinceLastActivity} days. We currently have ${sessionCount} available session${sessionCount !== 1 ? 's' : ''} that match your skill level. We'd love to welcome you back — browse and book at your convenience.`,
      smsBody: `Hi ${firstName}, ${clubName} has ${sessionCount} session${sessionCount !== 1 ? 's' : ''} available at your level. Book anytime.`,
    },
    {
      id: 'urgent',
      label: 'Urgent',
      recommended: false,
      emailBody: `${firstName}, spots are filling up fast at ${clubName}! It's been ${daysSinceLastActivity} days since your last game. We have ${sessionCount} session${sessionCount !== 1 ? 's' : ''} this week with limited availability — don't miss out on the action. Grab your spot before they're gone!`,
      smsBody: `${firstName}, spots filling fast! ${sessionCount} session${sessionCount !== 1 ? 's' : ''} this week at ${clubName}. Don't miss out!`,
    },
  ]
}
