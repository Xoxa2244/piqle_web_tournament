/**
 * Onboarding Schema — Zod validation for Club Intelligence settings
 */

import { z } from 'zod'

// ── Shared enums ──

export const DAYS_OF_WEEK = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
] as const

export const PRICING_MODELS = ['per_session', 'membership', 'free', 'hybrid'] as const
export const COMMUNICATION_TONES = ['friendly', 'professional', 'casual'] as const
export const COMMUNICATION_CHANNELS = ['email', 'sms', 'both'] as const
export const CLUB_GOALS = [
  'fill_sessions', 'grow_membership', 'improve_retention',
  'increase_revenue', 'reduce_no_shows',
] as const

// ── Step schemas ──

export const step1Schema = z.object({
  timezone: z.string().min(1, 'Timezone is required'),
  sportTypes: z.array(z.string()).min(1, 'Select at least one sport'),
})

export const step2Schema = z.object({
  courtCount: z.number().int().min(1, 'At least 1 court').max(50),
  hasIndoorCourts: z.boolean(),
  hasOutdoorCourts: z.boolean(),
})

export const step3Schema = z.object({
  operatingDays: z.array(z.enum(DAYS_OF_WEEK)).min(1, 'Select at least one day'),
  operatingHours: z.object({
    open: z.string().regex(/^\d{2}:\d{2}$/, 'Format: HH:MM'),
    close: z.string().regex(/^\d{2}:\d{2}$/, 'Format: HH:MM'),
  }),
  peakHours: z.object({
    start: z.string().regex(/^\d{2}:\d{2}$/, 'Format: HH:MM'),
    end: z.string().regex(/^\d{2}:\d{2}$/, 'Format: HH:MM'),
  }),
  typicalSessionDurationMinutes: z.number().int().min(15).max(240).default(90),
})

export const step4Schema = z.object({
  pricingModel: z.enum(PRICING_MODELS),
  avgSessionPriceCents: z.number().int().min(0).nullable(),
  communicationPreferences: z.object({
    preferredChannel: z.enum(COMMUNICATION_CHANNELS),
    maxMessagesPerWeek: z.number().int().min(1).max(7).default(3),
    tone: z.enum(COMMUNICATION_TONES),
  }),
})

export const step5Schema = z.object({
  goals: z.array(z.enum(CLUB_GOALS)).min(1, 'Select at least one goal'),
})

// ── Full settings schema ──

export const intelligenceSettingsSchema = z.object({
  timezone: z.string().min(1),
  sportTypes: z.array(z.string()).min(1),
  operatingDays: z.array(z.enum(DAYS_OF_WEEK)).min(1),
  operatingHours: z.object({
    open: z.string().regex(/^\d{2}:\d{2}$/),
    close: z.string().regex(/^\d{2}:\d{2}$/),
  }),
  peakHours: z.object({
    start: z.string().regex(/^\d{2}:\d{2}$/),
    end: z.string().regex(/^\d{2}:\d{2}$/),
  }),
  typicalSessionDurationMinutes: z.number().int().min(15).max(240),
  courtCount: z.number().int().min(1).max(50),
  hasIndoorCourts: z.boolean(),
  hasOutdoorCourts: z.boolean(),
  pricingModel: z.enum(PRICING_MODELS),
  avgSessionPriceCents: z.number().int().min(0).nullable(),
  communicationPreferences: z.object({
    preferredChannel: z.enum(COMMUNICATION_CHANNELS),
    maxMessagesPerWeek: z.number().int().min(1).max(7),
    tone: z.enum(COMMUNICATION_TONES),
  }),
  goals: z.array(z.enum(CLUB_GOALS)).min(1),
  onboardingCompletedAt: z.string().nullable(),
  onboardingVersion: z.number().int(),
})

export type IntelligenceSettingsInput = z.infer<typeof intelligenceSettingsSchema>

// ── Automation triggers schema (top-level automationSettings) ──

export const automationTriggersSchema = z.object({
  enabled: z.boolean().default(true),
  triggers: z.object({
    healthyToWatch: z.boolean().default(true),
    watchToAtRisk: z.boolean().default(true),
    atRiskToCritical: z.boolean().default(true),
    churned: z.boolean().default(true),
  }),
})

export type AutomationTriggersInput = z.infer<typeof automationTriggersSchema>

export const DEFAULT_AUTOMATION_TRIGGERS: AutomationTriggersInput = {
  enabled: true,
  triggers: {
    healthyToWatch: true,
    watchToAtRisk: true,
    atRiskToCritical: true,
    churned: true,
  },
}

// ── Default settings ──

export const DEFAULT_INTELLIGENCE_SETTINGS: IntelligenceSettingsInput = {
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  sportTypes: ['pickleball'],
  operatingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  operatingHours: { open: '07:00', close: '21:00' },
  peakHours: { start: '17:00', end: '20:00' },
  typicalSessionDurationMinutes: 90,
  courtCount: 4,
  hasIndoorCourts: false,
  hasOutdoorCourts: true,
  pricingModel: 'per_session',
  avgSessionPriceCents: 1500,
  communicationPreferences: {
    preferredChannel: 'email',
    maxMessagesPerWeek: 3,
    tone: 'friendly',
  },
  goals: ['fill_sessions'],
  onboardingCompletedAt: null,
  onboardingVersion: 1,
}
