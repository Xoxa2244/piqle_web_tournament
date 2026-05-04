/**
 * Campaign Playbooks — pre-filled templates for common scenarios.
 *
 * Solves the "blank-canvas paralysis" club managers feel when they
 * click + New Campaign: instead of choosing format / goal / writing
 * subject lines from scratch, they pick a playbook card and the
 * Wizard opens fully populated. They edit only what's club-specific
 * (audience, perhaps tweak copy) and click Launch.
 *
 * Each playbook is a partial WizardState — Wizard merges it onto
 * EMPTY_WIZARD_STATE on open. Audience is intentionally NOT pre-set:
 * we can suggest the right cohort in the description, but the admin
 * still picks (different clubs structure their cohorts differently).
 *
 * To add a new playbook: append to PLAYBOOKS, give it a unique id,
 * write the message(s), pick the right format + goal. The grid on
 * CampaignsIQ renders them in array order.
 */

import type { CampaignGoal, MessageDraft, ScheduleSettings, SequenceStep } from './types'

export interface Playbook {
  id: string
  /** Card title shown in the grid. */
  title: string
  /** One-line description on the card. Tells the admin who/what/when. */
  description: string
  /** Lucide icon name — narrows to the icons used by the grid component. */
  icon: 'gift' | 'mail' | 'refresh' | 'calendar' | 'trending-up' | 'sparkles'
  /** Visual hint about which cohort fits best — admin still picks one. */
  audienceHint: string
  goal: CampaignGoal
  /** Pre-fill applied to schedule.format / mode / channels / exitOnBooking
   *  / recurringFrequency etc. Wizard merges with EMPTY_WIZARD_STATE
   *  defaults so omitted fields fall back to sane defaults. */
  schedule: Partial<ScheduleSettings>
  /** Pre-fill applied to message.subject / body / steps / cta.
   *  For sequence playbooks, populate `steps` (subject/body unused).
   *  For one_time/recurring, populate `subject` + `body`. */
  message: Partial<MessageDraft>
}

const STEP = (
  stepIndex: number,
  delayDays: number,
  subject: string,
  body: string,
  ctaLabel?: string,
  ctaUrl?: string,
): SequenceStep => ({
  stepIndex,
  delayDays,
  subject,
  body,
  ...(ctaLabel ? { ctaLabel } : {}),
  ...(ctaUrl ? { ctaUrl } : {}),
})

export const PLAYBOOKS: Playbook[] = [
  {
    id: 'welcome_newcomer',
    title: 'Welcome new members',
    description: 'Three emails over 14 days that turn fresh signups into regulars. Day 0 explains the club, Day 5 nudges first booking, Day 12 asks "what\'s blocking you" if they still haven\'t played.',
    icon: 'sparkles',
    audienceHint: 'Cohort of members who joined in the last 30 days',
    goal: 'onboard_new',
    schedule: {
      format: 'sequence',
      mode: 'now',
      channels: { email: true, sms: false },
      exitOnBooking: true,
    },
    message: {
      steps: [
        STEP(0, 0,
          'Welcome to the club, {first_name} 👋',
          "Hi {first_name},\n\nGlad you're with us. Here's how the next month should look:\n\n" +
          "1. Book your first 3 sessions — we'll match you with players at your level.\n" +
          "2. Try a clinic — small group, personal coaching, big skill jump.\n" +
          "3. Join a league once you've found your footing — community is the strongest reason to stick around.\n\n" +
          "If anything's unclear, just hit reply.",
          'See open sessions',
        ),
        STEP(1, 5,
          'Sessions popular with players at your level, {first_name}',
          "Hi {first_name},\n\nA quick nudge in case you haven't picked your first session yet. " +
          "These are filling up fast and tend to suit new members:\n\n" +
          "• Open Play — friendly mix of levels, easiest first step.\n" +
          "• Skills Clinic — 60 min coached, you walk out playing better.\n\n" +
          "We'll match you with players at your level so the first session feels welcoming, not intimidating.",
          'Pick a session',
        ),
        STEP(2, 7,
          "Anything we can help with, {first_name}?",
          "Hi {first_name},\n\nWe noticed you haven't booked yet. That's totally fine — but if something specific is in the way, we'd like to know.\n\n" +
          "Drop us a line about what would make it easier:\n" +
          "• Schedule doesn't fit?\n" +
          "• Not sure about your level?\n" +
          "• Looking for a partner / group?\n\n" +
          "Reply to this email and we'll personally help.",
          'Reply with one line',
        ),
      ],
      perRecipientPersonalisation: false,
    },
  },

  {
    id: 'winback_lapsed',
    title: 'Win back lapsed players',
    description: 'Three emails over 14 days for members who used to play regularly but stopped. Soft check-in first, fresh schedule second, escalating offer third — with auto-stop if they book.',
    icon: 'refresh',
    audienceHint: 'Cohort of members inactive 30+ days',
    goal: 'reactivate_dormant',
    schedule: {
      format: 'sequence',
      mode: 'now',
      channels: { email: true, sms: false },
      exitOnBooking: true,
    },
    message: {
      steps: [
        STEP(0, 0,
          'We miss you on the courts, {first_name}',
          "Hey {first_name},\n\nNoticed you haven't played a session in a while. Just wanted to check — is everything ok?\n\n" +
          "If life got in the way, no worries. If something about the club isn't working for you, we'd genuinely like to fix it.\n\n" +
          "Either way, your spot is here when you're ready.",
          'Open this week\'s schedule',
        ),
        STEP(1, 5,
          'Fresh sessions at your level this week, {first_name}',
          "Hi {first_name},\n\nWe pulled a few open sessions that match how you used to play:\n\n" +
          "• Times you typically booked\n" +
          "• Players you'd recognize from earlier sessions\n" +
          "• A couple of new clinic options if you're up for trying something\n\n" +
          "No pressure — just easier to scan than the full calendar.",
          'See your matches',
        ),
        STEP(2, 7,
          'A small thank-you for coming back, {first_name}',
          "Hi {first_name},\n\nLast nudge from us — and this one comes with something on the house.\n\n" +
          "Use the button below to book any session this week and your next visit is on us (gift / discount applied automatically).\n\n" +
          "We'd love to see you again.",
          'Claim my comeback session',
        ),
      ],
      perRecipientPersonalisation: false,
    },
  },

  {
    id: 'renewal_reminder',
    title: 'Renewal reminder',
    description: 'One email two weeks before subscription expires. Simple message, one click to renew. Aim is to avoid the gap between expiry and renewal — once a member lapses, return rate drops sharply.',
    icon: 'refresh',
    audienceHint: 'Cohort: members whose subscription expires in 14 days',
    goal: 'renewal_reminder',
    schedule: {
      format: 'one_time',
      mode: 'now',
      channels: { email: true, sms: false },
      exitOnBooking: true,
    },
    message: {
      subject: 'Your membership renews soon, {first_name}',
      body:
        "Hi {first_name},\n\n" +
        "Quick heads up — your membership comes up for renewal in the next two weeks.\n\n" +
        "You played enough this period that we'd hate to see a gap, so renewing now keeps everything seamless. " +
        "One click below and you're set — no forms, no hassle.",
      ctaLabel: 'Renew membership',
      perRecipientPersonalisation: false,
    },
  },

  {
    id: 'birthday_gift',
    title: 'Birthday gift offer',
    description: 'One email a week before a member\'s birthday with three gift options — guest pass, clinic seat, or branded item. Member picks and admin fulfils via the dashboard queue.',
    icon: 'gift',
    audienceHint: 'Cohort: members with birthday in 7 days',
    goal: 'custom',
    schedule: {
      format: 'one_time',
      mode: 'now',
      channels: { email: true, sms: false },
      exitOnBooking: true,
    },
    message: {
      subject: '🎁 A birthday gift on us, {first_name}',
      body:
        "Hi {first_name},\n\n" +
        "Your birthday is coming up — we'd like to celebrate with you. Pick one of these:\n\n" +
        "🎟  Guest pass for a friend (one free session, any time)\n" +
        "🎓  Free seat in a clinic of your choice\n" +
        "👕  Limited-edition club merch from the front desk\n\n" +
        "Reply to this email with your pick (or hit the button below) and the front desk will have it ready.",
      ctaLabel: 'Pick my gift',
      perRecipientPersonalisation: false,
    },
  },

  {
    id: 'event_invite',
    title: 'Event invitation',
    description: 'One email about an upcoming tournament, clinic, or social. Use this when announcing something specific — fill in the event name, date, and link.',
    icon: 'calendar',
    audienceHint: 'Cohort: any group you want to invite',
    goal: 'promote_event',
    schedule: {
      format: 'one_time',
      mode: 'now',
      channels: { email: true, sms: false },
      exitOnBooking: false,
    },
    message: {
      subject: '{event_name} — open for signups, {first_name}',
      body:
        "Hi {first_name},\n\n" +
        "We're running {event_name} on {event_date}. Spots are limited and based on your session history we think you'd love this one.\n\n" +
        "What to know:\n" +
        "• Format and level details on the signup page\n" +
        "• Spot held when you click below — no payment yet\n" +
        "• Free to cancel up to 48h before\n\n" +
        "Replace {event_name} and {event_date} with the actual event details before launching.",
      ctaLabel: 'Reserve my spot',
      perRecipientPersonalisation: false,
    },
  },
]
