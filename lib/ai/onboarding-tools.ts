/**
 * Onboarding Tools — AI SDK tools using explicit jsonSchema (no Zod conversion).
 * This bypasses the Zod v3/v4 schema serialization issue on Vercel.
 */

import { tool, jsonSchema, type ToolSet } from 'ai'
import { prisma } from '@/lib/prisma'
import {
  step1Schema, step2Schema, step3Schema, step4Schema, step5Schema,
} from '@/lib/ai/onboarding-schema'

// AI SDK tool() overloads are strict with jsonSchema — cast to bypass TS
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

export type OnboardingToolsContext = {
  getClubId: () => string | null
}

export function createOnboardingTools(clubId: string | null, userId: string): { tools: ToolSet; ctx: OnboardingToolsContext } {
  const ctx = { clubId }

  function requireClubId(): string {
    if (!ctx.clubId) throw new Error('Club has not been created yet. Call createClub first.')
    return ctx.clubId
  }

  const tools: ToolSet = {
    createClub: t({
      description: 'Create a new club. Call this FIRST when the user tells you their club name.',
      parameters: jsonSchema({
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Club name' },
          city: { type: 'string', description: 'City name' },
          state: { type: 'string', description: 'State or province' },
          country: { type: 'string', description: 'Country' },
        },
        required: ['name'],
      }),
      execute: async ({ name, city, state, country }: { name: string; city?: string; state?: string; country?: string }) => {
        try {
          if (ctx.clubId) {
            const updateData: Record<string, string> = { name }
            if (city) updateData.city = city
            if (state) updateData.state = state
            if (country) updateData.country = country
            await (prisma.club as any).update({ where: { id: ctx.clubId }, data: updateData })
            return { created: true, clubId: ctx.clubId, name, updated: true }
          }

          const club = await prisma.club.create({
            data: {
              name: name.trim(),
              kind: 'VENUE',
              description: null,
              city: city?.trim() || null,
              state: state?.trim() || null,
              country: country?.trim() || null,
              isVerified: false,
              admins: { create: { userId, role: 'ADMIN' } },
            },
            select: { id: true },
          })

          ctx.clubId = club.id
          return { created: true, clubId: club.id, name }
        } catch (err: any) {
          return { created: false, error: err.message }
        }
      },
    }),

    saveTimezoneAndSports: t({
      description: 'Save the club timezone and sport types.',
      parameters: jsonSchema({
        type: 'object',
        properties: {
          timezone: { type: 'string', description: 'IANA timezone, e.g. "America/New_York"' },
          sportTypes: { type: 'array', items: { type: 'string' }, description: 'Sport types: pickleball, tennis, padel, squash, badminton' },
        },
        required: ['timezone', 'sportTypes'],
      }),
      execute: async ({ timezone, sportTypes }: { timezone: string; sportTypes: string[] }) => {
        try {
          step1Schema.parse({ timezone, sportTypes })
          await mergeIntelligenceSettings(requireClubId(), { timezone, sportTypes })
          return { saved: true, fields: { timezone, sportTypes } }
        } catch (err: any) {
          return { saved: false, error: err.message }
        }
      },
    }),

    saveCourtInfo: t({
      description: 'Save court count and indoor/outdoor info.',
      parameters: jsonSchema({
        type: 'object',
        properties: {
          courtCount: { type: 'number', description: 'Number of courts' },
          hasIndoorCourts: { type: 'boolean', description: 'Has indoor courts' },
          hasOutdoorCourts: { type: 'boolean', description: 'Has outdoor courts' },
        },
        required: ['courtCount', 'hasIndoorCourts', 'hasOutdoorCourts'],
      }),
      execute: async ({ courtCount, hasIndoorCourts, hasOutdoorCourts }: { courtCount: number; hasIndoorCourts: boolean; hasOutdoorCourts: boolean }) => {
        try {
          step2Schema.parse({ courtCount, hasIndoorCourts, hasOutdoorCourts })
          await mergeIntelligenceSettings(requireClubId(), { courtCount, hasIndoorCourts, hasOutdoorCourts })
          return { saved: true, fields: { courtCount, hasIndoorCourts, hasOutdoorCourts } }
        } catch (err: any) {
          return { saved: false, error: err.message }
        }
      },
    }),

    saveSchedule: t({
      description: 'Save operating schedule: days, hours, peak hours, and session duration.',
      parameters: jsonSchema({
        type: 'object',
        properties: {
          operatingDays: { type: 'array', items: { type: 'string' }, description: 'Days: Monday, Tuesday, etc.' },
          operatingHours: {
            type: 'object',
            properties: {
              open: { type: 'string', description: 'Opening time HH:MM' },
              close: { type: 'string', description: 'Closing time HH:MM' },
            },
            required: ['open', 'close'],
          },
          peakHours: {
            type: 'object',
            properties: {
              start: { type: 'string', description: 'Peak start HH:MM' },
              end: { type: 'string', description: 'Peak end HH:MM' },
            },
            required: ['start', 'end'],
          },
          typicalSessionDurationMinutes: { type: 'number', description: 'Typical session duration in minutes' },
        },
        required: ['operatingDays', 'operatingHours', 'peakHours', 'typicalSessionDurationMinutes'],
      }),
      execute: async (data: any) => {
        try {
          step3Schema.parse(data)
          await mergeIntelligenceSettings(requireClubId(), data)
          return { saved: true, fields: data }
        } catch (err: any) {
          return { saved: false, error: err.message }
        }
      },
    }),

    savePricingAndComms: t({
      description: 'Save pricing model, average price, and communication preferences.',
      parameters: jsonSchema({
        type: 'object',
        properties: {
          pricingModel: { type: 'string', enum: ['per_session', 'membership', 'free', 'hybrid'], description: 'Pricing model' },
          avgSessionPriceCents: { type: ['number', 'null'], description: 'Average session price in cents (1500 = $15). Null if free.' },
          communicationPreferences: {
            type: 'object',
            properties: {
              preferredChannel: { type: 'string', enum: ['email', 'sms', 'both'], description: 'Preferred channel' },
              maxMessagesPerWeek: { type: 'number', description: 'Max messages per week (1-7)' },
              tone: { type: 'string', enum: ['friendly', 'professional', 'casual'], description: 'Tone' },
            },
            required: ['preferredChannel', 'maxMessagesPerWeek', 'tone'],
          },
        },
        required: ['pricingModel', 'communicationPreferences'],
      }),
      execute: async (data: any) => {
        try {
          step4Schema.parse(data)
          await mergeIntelligenceSettings(requireClubId(), data)
          return { saved: true, fields: data }
        } catch (err: any) {
          return { saved: false, error: err.message }
        }
      },
    }),

    saveGoals: t({
      description: "Save the club's goals.",
      parameters: jsonSchema({
        type: 'object',
        properties: {
          goals: { type: 'array', items: { type: 'string', enum: ['fill_sessions', 'grow_membership', 'improve_retention', 'increase_revenue', 'reduce_no_shows'] }, description: 'Club goals' },
        },
        required: ['goals'],
      }),
      execute: async ({ goals }: { goals: string[] }) => {
        try {
          step5Schema.parse({ goals })
          await mergeIntelligenceSettings(requireClubId(), { goals })
          return { saved: true, fields: { goals } }
        } catch (err: any) {
          return { saved: false, error: err.message }
        }
      },
    }),

    saveAddress: t({
      description: 'Save the club address/location.',
      parameters: jsonSchema({
        type: 'object',
        properties: {
          city: { type: 'string', description: 'City name' },
          state: { type: 'string', description: 'State or province' },
          country: { type: 'string', description: 'Country' },
        },
      }),
      execute: async ({ city, state, country }: { city?: string; state?: string; country?: string }) => {
        try {
          const updateData: Record<string, string> = {}
          if (city) updateData.city = city
          if (state) updateData.state = state
          if (country) updateData.country = country

          if (Object.keys(updateData).length > 0) {
            await (prisma.club as any).update({ where: { id: requireClubId() }, data: updateData })
          }
          return { saved: true, fields: updateData }
        } catch (err: any) {
          return { saved: false, error: err.message }
        }
      },
    }),

    requestFileUpload: t({
      description: 'Ask the user to upload a CSV/XLSX file with their court schedule.',
      parameters: jsonSchema({ type: 'object', properties: {} }),
      execute: async () => {
        return { action: 'show_file_upload' }
      },
    }),

    getOnboardingProgress: t({
      description: 'Check which onboarding fields have been saved and which are still missing.',
      parameters: jsonSchema({ type: 'object', properties: {} }),
      execute: async () => {
        try {
          if (!ctx.clubId) {
            return { error: 'No club created yet. Ask for the club name first.' }
          }
          const { intelligence } = await readIntelligenceSettings(ctx.clubId)
          const club: any = await prisma.club.findUnique({
            where: { id: ctx.clubId },
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

          const completedCount = Object.values(fields).filter(Boolean).length
          const totalFields = Object.keys(fields).length

          return {
            fields,
            completedCount,
            totalFields,
            percentComplete: Math.round((completedCount / totalFields) * 100),
            allComplete: completedCount === totalFields,
          }
        } catch (err: any) {
          return { error: err.message }
        }
      },
    }),

    completeOnboarding: t({
      description: 'Mark onboarding as complete. Call ONLY when all required fields are saved and the user confirms they are done.',
      parameters: jsonSchema({ type: 'object', properties: {} }),
      execute: async () => {
        try {
          await mergeIntelligenceSettings(requireClubId(), {
            onboardingCompletedAt: new Date().toISOString(),
          })
          return { completed: true, redirectTo: `/clubs/${ctx.clubId}/intelligence` }
        } catch (err: any) {
          return { completed: false, error: err.message }
        }
      },
    }),
  }

  return {
    tools,
    ctx: { getClubId: () => ctx.clubId },
  }
}
