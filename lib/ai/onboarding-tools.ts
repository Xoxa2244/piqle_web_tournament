/**
 * Onboarding Tools — AI SDK tools for the IQSport conversational onboarding.
 *
 * Each tool saves one category of club settings incrementally into
 * `club.automationSettings.intelligence`. Data is validated with the
 * existing step schemas from onboarding-schema.ts.
 */

import { z } from 'zod'
import { tool, type ToolSet } from 'ai'
import { prisma } from '@/lib/prisma'
import {
  step1Schema, step2Schema, step3Schema, step4Schema, step5Schema,
  intelligenceSettingsSchema, DEFAULT_INTELLIGENCE_SETTINGS,
  DAYS_OF_WEEK, PRICING_MODELS, COMMUNICATION_CHANNELS, COMMUNICATION_TONES, CLUB_GOALS,
} from '@/lib/ai/onboarding-schema'

// Same cast as chat-tools.ts — AI SDK tool() overloads are strict
const t = tool as (...args: any[]) => any

// ── Helper: read & merge intelligence settings ──

async function readIntelligenceSettings(clubId: string) {
  const club: any = await prisma.club.findUniqueOrThrow({ where: { id: clubId } })
  const existing = club.automationSettings || {}
  return {
    intelligence: existing.intelligence || {},
    automationSettings: existing,
  }
}

async function mergeIntelligenceSettings(clubId: string, partial: Record<string, any>) {
  const { intelligence, automationSettings } = await readIntelligenceSettings(clubId)
  const merged = { ...intelligence, ...partial }
  await (prisma.club as any).update({
    where: { id: clubId },
    data: {
      automationSettings: {
        ...automationSettings,
        intelligence: merged,
      },
    },
  })
  return merged
}

// ── Tool definitions ──

export function createOnboardingTools(clubId: string): ToolSet {
  return {
    saveTimezoneAndSports: t({
      description:
        'Save the club timezone and sport types. Call this as soon as the user mentions their timezone or sports they offer (pickleball, tennis, padel, squash, badminton).',
      parameters: z.object({
        timezone: z.string().describe('IANA timezone, e.g. "America/New_York"'),
        sportTypes: z.array(z.string()).describe('Sport types: pickleball, tennis, padel, squash, badminton'),
      }),
      execute: async ({ timezone, sportTypes }: z.infer<typeof step1Schema>) => {
        try {
          step1Schema.parse({ timezone, sportTypes })
          await mergeIntelligenceSettings(clubId, { timezone, sportTypes })
          return { saved: true, fields: { timezone, sportTypes } }
        } catch (err: any) {
          return { saved: false, error: err.message }
        }
      },
    }),

    saveCourtInfo: t({
      description:
        'Save court count and indoor/outdoor info. Call when the user tells you about their courts.',
      parameters: z.object({
        courtCount: z.number().int().min(1).max(50).describe('Number of courts'),
        hasIndoorCourts: z.boolean().describe('Whether the club has indoor courts'),
        hasOutdoorCourts: z.boolean().describe('Whether the club has outdoor courts'),
      }),
      execute: async ({ courtCount, hasIndoorCourts, hasOutdoorCourts }: z.infer<typeof step2Schema>) => {
        try {
          step2Schema.parse({ courtCount, hasIndoorCourts, hasOutdoorCourts })
          await mergeIntelligenceSettings(clubId, { courtCount, hasIndoorCourts, hasOutdoorCourts })
          return { saved: true, fields: { courtCount, hasIndoorCourts, hasOutdoorCourts } }
        } catch (err: any) {
          return { saved: false, error: err.message }
        }
      },
    }),

    saveSchedule: t({
      description:
        'Save operating schedule: days, hours, peak hours, and typical session duration. Call when the user provides schedule info or after CSV analysis.',
      parameters: z.object({
        operatingDays: z.array(z.enum(DAYS_OF_WEEK)).describe('Days the club operates'),
        operatingHours: z.object({
          open: z.string().describe('Opening time in HH:MM format'),
          close: z.string().describe('Closing time in HH:MM format'),
        }),
        peakHours: z.object({
          start: z.string().describe('Peak start time in HH:MM format'),
          end: z.string().describe('Peak end time in HH:MM format'),
        }),
        typicalSessionDurationMinutes: z.number().int().min(15).max(240).describe('Typical session duration in minutes'),
      }),
      execute: async (data: z.infer<typeof step3Schema>) => {
        try {
          step3Schema.parse(data)
          await mergeIntelligenceSettings(clubId, data)
          return { saved: true, fields: data }
        } catch (err: any) {
          return { saved: false, error: err.message }
        }
      },
    }),

    savePricingAndComms: t({
      description:
        'Save pricing model, average price, and communication preferences. Call when the user discusses pricing or how they want to communicate with members.',
      parameters: z.object({
        pricingModel: z.enum(PRICING_MODELS).describe('Pricing model: per_session, membership, free, or hybrid'),
        avgSessionPriceCents: z.number().int().min(0).nullable().describe('Average session price in cents (e.g. 1500 = $15). Null if free.'),
        communicationPreferences: z.object({
          preferredChannel: z.enum(COMMUNICATION_CHANNELS).describe('Preferred channel: email, sms, or both'),
          maxMessagesPerWeek: z.number().int().min(1).max(7).describe('Max messages per week (1-7)'),
          tone: z.enum(COMMUNICATION_TONES).describe('Tone: friendly, professional, or casual'),
        }),
      }),
      execute: async (data: z.infer<typeof step4Schema>) => {
        try {
          step4Schema.parse(data)
          await mergeIntelligenceSettings(clubId, data)
          return { saved: true, fields: data }
        } catch (err: any) {
          return { saved: false, error: err.message }
        }
      },
    }),

    saveGoals: t({
      description:
        'Save the club\'s goals. Call when the user tells you what they want to achieve.',
      parameters: z.object({
        goals: z.array(z.enum(CLUB_GOALS)).describe('Goals: fill_sessions, grow_membership, improve_retention, increase_revenue, reduce_no_shows'),
      }),
      execute: async ({ goals }: z.infer<typeof step5Schema>) => {
        try {
          step5Schema.parse({ goals })
          await mergeIntelligenceSettings(clubId, { goals })
          return { saved: true, fields: { goals } }
        } catch (err: any) {
          return { saved: false, error: err.message }
        }
      },
    }),

    saveAddress: t({
      description:
        'Save the club address/location. Call when the user mentions their city, state, or country.',
      parameters: z.object({
        city: z.string().optional().describe('City name'),
        state: z.string().optional().describe('State or province'),
        country: z.string().optional().describe('Country'),
      }),
      execute: async ({ city, state, country }: { city?: string; state?: string; country?: string }) => {
        try {
          const updateData: Record<string, string> = {}
          if (city) updateData.city = city
          if (state) updateData.state = state
          if (country) updateData.country = country

          if (Object.keys(updateData).length > 0) {
            await (prisma.club as any).update({
              where: { id: clubId },
              data: updateData,
            })
          }
          return { saved: true, fields: updateData }
        } catch (err: any) {
          return { saved: false, error: err.message }
        }
      },
    }),

    requestFileUpload: t({
      description:
        'Ask the user to upload a CSV or XLSX file with their court schedule. Call this when discussing schedule data or when the user wants to import their schedule. The client will show a file upload UI.',
      parameters: z.object({}),
      execute: async () => {
        return { action: 'show_file_upload' }
      },
    }),

    getOnboardingProgress: t({
      description:
        'Check which onboarding fields have been saved and which are still missing. Call this at the start of a resumed conversation to know where to continue.',
      parameters: z.object({}),
      execute: async () => {
        try {
          const { intelligence } = await readIntelligenceSettings(clubId)
          const club: any = await prisma.club.findUnique({
            where: { id: clubId },
            select: { city: true, state: true, country: true },
          })

          const fields = {
            timezoneAndSports: !!(intelligence.timezone && intelligence.sportTypes?.length),
            courts: !!(intelligence.courtCount && intelligence.courtCount > 0),
            schedule: !!(intelligence.operatingDays?.length && intelligence.operatingHours),
            pricingAndComms: !!(intelligence.pricingModel && intelligence.communicationPreferences),
            goals: !!(intelligence.goals?.length),
            address: !!(club?.city || club?.state || club?.country),
          }

          const completed = Object.values(fields).filter(Boolean).length
          const total = Object.keys(fields).length

          return {
            progress: fields,
            completed,
            total,
            isComplete: completed === total,
            currentSettings: intelligence,
          }
        } catch (err: any) {
          return { error: err.message }
        }
      },
    }),

    completeOnboarding: t({
      description:
        'Mark onboarding as complete. Call this ONLY after all required fields have been saved. If fields are missing, return what\'s missing instead of completing.',
      parameters: z.object({}),
      execute: async () => {
        try {
          const { intelligence } = await readIntelligenceSettings(clubId)

          // Check required fields
          const missing: string[] = []
          if (!intelligence.timezone) missing.push('timezone')
          if (!intelligence.sportTypes?.length) missing.push('sportTypes')
          if (!intelligence.courtCount) missing.push('courtCount')
          if (!intelligence.operatingDays?.length) missing.push('operatingDays')
          if (!intelligence.operatingHours) missing.push('operatingHours')
          if (!intelligence.pricingModel) missing.push('pricingModel')
          if (!intelligence.goals?.length) missing.push('goals')

          if (missing.length > 0) {
            return {
              completed: false,
              missingFields: missing,
              message: `Cannot complete onboarding yet. Missing: ${missing.join(', ')}`,
            }
          }

          // Fill defaults for optional fields and complete
          const finalSettings = {
            ...DEFAULT_INTELLIGENCE_SETTINGS,
            ...intelligence,
            onboardingCompletedAt: new Date().toISOString(),
            onboardingVersion: 1,
          }

          await mergeIntelligenceSettings(clubId, finalSettings)

          return {
            completed: true,
            message: 'Onboarding completed successfully! The club is now set up.',
          }
        } catch (err: any) {
          return { completed: false, error: err.message }
        }
      },
    }),
  }
}
