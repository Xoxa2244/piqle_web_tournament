import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock modules before importing
vi.mock('@/lib/ai/slot-filler', () => ({
  generateSlotFillerRecommendations: vi.fn(() => []),
}))
vi.mock('@/lib/ai/anti-spam', () => ({
  checkAntiSpam: vi.fn(() => ({ allowed: true })),
}))
vi.mock('@/lib/ai/partners', () => ({
  getFrequentPartnerIds: vi.fn(() => []),
}))
vi.mock('@/lib/email', () => ({
  sendSlotFillerInviteEmail: vi.fn(),
}))
vi.mock('@/lib/ai/inferred-preferences', () => ({
  inferPreferencesFromBookings: vi.fn(() => null),
}))

import { runSlotFillerAutomation } from '@/lib/ai/slot-filler-automation'
import { generateSlotFillerRecommendations } from '@/lib/ai/slot-filler'
import { checkAntiSpam } from '@/lib/ai/anti-spam'
import { getFrequentPartnerIds } from '@/lib/ai/partners'
import { sendSlotFillerInviteEmail } from '@/lib/email'

// ── Mock Prisma ──

function createMockPrisma(overrides: any = {}) {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(10, 0, 0, 0)

  return {
    club: {
      findMany: vi.fn().mockResolvedValue(overrides.clubs ?? [{
        id: 'club-1',
        name: 'Test Club',
        automationSettings: { intelligence: { agentLive: false } },
      }]),
    },
    playSession: {
      findMany: vi.fn().mockResolvedValue(overrides.sessions ?? [{
        id: 'session-1',
        title: 'Open Play Advanced',
        format: 'OPEN_PLAY',
        skillLevel: 'ADVANCED',
        date: tomorrow,
        startTime: '18:00',
        endTime: '20:00',
        maxPlayers: 8,
        clubId: 'club-1',
        clubCourt: { name: 'Court 1' },
        bookings: overrides.bookings ?? [
          { userId: 'booked-1', user: { id: 'booked-1', name: 'John Doe', email: 'john@test.com' } },
          { userId: 'booked-2', user: { id: 'booked-2', name: 'Jane Smith', email: 'jane@test.com' } },
        ],
      }]),
    },
    clubFollower: {
      findMany: vi.fn().mockResolvedValue(overrides.followers ?? [
        { userId: 'member-1', user: { id: 'member-1', name: 'Bob Wilson', email: 'bob@test.com', duprRatingDoubles: 3.5, gender: 'M', city: 'Indy', skillLevel: '3.5-3.99' } },
        { userId: 'member-2', user: { id: 'member-2', name: 'Alice Brown', email: 'alice@test.com', duprRatingDoubles: 4.0, gender: 'F', city: 'Indy', skillLevel: '4.0+' } },
      ]),
    },
    userPlayPreference: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    playSessionBooking: {
      findMany: vi.fn().mockResolvedValue(overrides.memberBookings ?? [
        { userId: 'member-1', status: 'CONFIRMED', bookedAt: new Date(), playSession: { date: new Date(), format: 'OPEN_PLAY', startTime: '18:00' } },
        { userId: 'member-2', status: 'CONFIRMED', bookedAt: new Date(), playSession: { date: new Date(), format: 'OPEN_PLAY', startTime: '18:00' } },
      ]),
    },
    aIRecommendationLog: {
      create: vi.fn().mockResolvedValue({ id: 'log-1' }),
    },
  }
}

describe('Slot Filler Automation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('runSlotFillerAutomation — tomorrow mode', () => {
    it('finds clubs and processes sessions', async () => {
      const prisma = createMockPrisma()
      const result = await runSlotFillerAutomation(prisma as any, { mode: 'tomorrow', dryRun: true })

      expect(result.dryRun).toBe(true)
      expect(result.clubs).toHaveLength(1)
      expect(result.clubs[0].clubName).toBe('Test Club')
      expect(prisma.playSession.findMany).toHaveBeenCalled()
    })

    // Regression: earlier version used `session.maxPlayers || 8`, which
    // silently treated 0 as falsy and defaulted to 8, invite-bombing
    // closed sessions. Now we skip with a warning.
    it('skips sessions with maxPlayers=0 (closed) instead of defaulting to 8', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const prisma = createMockPrisma({
        sessions: [{
          id: 'closed-session',
          title: 'Closed Session',
          format: 'OPEN_PLAY',
          skillLevel: 'ALL_LEVELS',
          date: new Date(Date.now() + 86400000),
          startTime: '18:00',
          endTime: '20:00',
          maxPlayers: 0,
          clubId: 'club-1',
          clubCourt: null,
          bookings: [],
        }],
      })

      const result = await runSlotFillerAutomation(prisma as any, { mode: 'tomorrow', dryRun: true })
      expect(result.clubs[0].sessionsProcessed).toBe(0)
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('invalid maxPlayers'),
      )
      warnSpy.mockRestore()
    })

    it('skips sessions with null maxPlayers instead of defaulting to 8', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const prisma = createMockPrisma({
        sessions: [{
          id: 'weird-session',
          title: 'Weird Session',
          format: 'OPEN_PLAY',
          skillLevel: 'ALL_LEVELS',
          date: new Date(Date.now() + 86400000),
          startTime: '18:00',
          endTime: '20:00',
          maxPlayers: null as any, // DB hand-edit or legacy row
          clubId: 'club-1',
          clubCourt: null,
          bookings: [],
        }],
      })

      const result = await runSlotFillerAutomation(prisma as any, { mode: 'tomorrow', dryRun: true })
      expect(result.clubs[0].sessionsProcessed).toBe(0)
      warnSpy.mockRestore()
    })

    it('skips full sessions (spotsLeft <= 0)', async () => {
      const prisma = createMockPrisma({
        sessions: [{
          id: 'full-session',
          title: 'Full Session',
          format: 'OPEN_PLAY',
          skillLevel: 'ALL_LEVELS',
          date: new Date(Date.now() + 86400000),
          startTime: '18:00',
          endTime: '20:00',
          maxPlayers: 2, // Only 2 spots
          clubId: 'club-1',
          clubCourt: null,
          bookings: [
            { userId: 'u1', user: { id: 'u1', name: 'A', email: 'a@t.com' } },
            { userId: 'u2', user: { id: 'u2', name: 'B', email: 'b@t.com' } },
          ], // 2 booked = full
        }],
      })

      const result = await runSlotFillerAutomation(prisma as any, { mode: 'tomorrow', dryRun: true })
      expect(result.clubs[0].sessionsProcessed).toBe(0)
    })

    it('scores candidates and respects minScore', async () => {
      const prisma = createMockPrisma()
      vi.mocked(generateSlotFillerRecommendations).mockReturnValue([
        { member: { id: 'member-1', name: 'Bob', email: 'bob@test.com' } as any, score: 80, estimatedLikelihood: 'high' as const, preference: null, reasoning: {} as any },
        { member: { id: 'member-2', name: 'Alice', email: 'alice@test.com' } as any, score: 30, estimatedLikelihood: 'low' as const, preference: null, reasoning: {} as any },
      ])

      const result = await runSlotFillerAutomation(prisma as any, { mode: 'tomorrow', dryRun: true, minScore: 50 })
      // Only Bob (score 80) should be invited, Alice (30) filtered out
      expect(result.clubs[0].candidatesFound).toBe(1)
    })

    it('checks anti-spam for each candidate', async () => {
      const prisma = createMockPrisma()
      vi.mocked(generateSlotFillerRecommendations).mockReturnValue([
        { member: { id: 'member-1', name: 'Bob', email: 'bob@test.com' } as any, score: 80, estimatedLikelihood: 'high' as const, preference: null, reasoning: {} as any },
      ])

      await runSlotFillerAutomation(prisma as any, { mode: 'tomorrow', dryRun: true })
      expect(checkAntiSpam).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'member-1',
        clubId: 'club-1',
        type: 'SLOT_FILLER',
        sessionId: 'session-1',
      }))
    })

    it('skips candidates blocked by anti-spam', async () => {
      const prisma = createMockPrisma()
      vi.mocked(generateSlotFillerRecommendations).mockReturnValue([
        { member: { id: 'member-1', name: 'Bob', email: 'bob@test.com' } as any, score: 80, estimatedLikelihood: 'high' as const, preference: null, reasoning: {} as any },
      ])
      vi.mocked(checkAntiSpam).mockResolvedValue({ allowed: false, reason: 'frequency_24h' })

      const result = await runSlotFillerAutomation(prisma as any, { mode: 'tomorrow', dryRun: true })
      expect(result.clubs[0].messagesSkipped).toBe(1)
      expect(result.clubs[0].messagesSent).toBe(0)
    })

    it('does NOT send emails in dryRun mode', async () => {
      const prisma = createMockPrisma()
      vi.mocked(generateSlotFillerRecommendations).mockReturnValue([
        { member: { id: 'member-1', name: 'Bob', email: 'bob@test.com' } as any, score: 80, estimatedLikelihood: 'high' as const, preference: null, reasoning: {} as any },
      ])

      await runSlotFillerAutomation(prisma as any, { mode: 'tomorrow', dryRun: true })
      expect(sendSlotFillerInviteEmail).not.toHaveBeenCalled()
    })

    it('logs to AIRecommendationLog when candidates found', async () => {
      const prisma = createMockPrisma()
      vi.mocked(generateSlotFillerRecommendations).mockReturnValue([
        { member: { id: 'member-1', name: 'Bob', email: 'bob@test.com' } as any, score: 80, estimatedLikelihood: 'high' as const, preference: null, reasoning: {} as any },
      ])
      vi.mocked(checkAntiSpam).mockResolvedValue({ allowed: true })

      const result = await runSlotFillerAutomation(prisma as any, { mode: 'tomorrow', dryRun: true })
      expect(prisma.aIRecommendationLog.create).toHaveBeenCalled()
      const firstCall = vi.mocked(prisma.aIRecommendationLog.create).mock.calls[0]?.[0]
      expect(firstCall?.data?.reasoning?.triggerRuntime?.source).toBe('slot_filler_automation')
      expect(firstCall?.data?.reasoning?.triggerRuntime?.outcome).toBe('pending')

      expect(result.clubs).toHaveLength(1)
    })
  })

  describe('runSlotFillerAutomation — lastminute mode', () => {
    it('queries sessions in 2-6h time window', async () => {
      const prisma = createMockPrisma({ sessions: [] })
      const result = await runSlotFillerAutomation(prisma as any, { mode: 'lastminute', dryRun: true })
      // Should query for sessions but find none
      expect(prisma.playSession.findMany).toHaveBeenCalled()
      expect(result.clubs[0].sessionsProcessed).toBe(0)
    })
  })

  describe('agentLive gate', () => {
    it('forces dryRun when agentLive is false — no emails sent', async () => {
      const prisma = createMockPrisma({
        clubs: [{ id: 'club-1', name: 'Test', automationSettings: { intelligence: { agentLive: false } } }],
      })
      vi.mocked(generateSlotFillerRecommendations).mockReturnValue([
        { member: { id: 'member-1', name: 'Bob', email: 'b@t.com' } as any, score: 80, estimatedLikelihood: 'high' as const, preference: null, reasoning: {} as any },
      ])

      await runSlotFillerAutomation(prisma as any, { mode: 'tomorrow', dryRun: false })
      // agentLive=false → effective dryRun=true → no emails
      expect(sendSlotFillerInviteEmail).not.toHaveBeenCalled()
    })
  })

  describe('Partner-aware social proof', () => {
    it('getFrequentPartnerIds is available as mock', () => {
      // Verify the mock is set up correctly
      expect(getFrequentPartnerIds).toBeDefined()
      expect(vi.mocked(getFrequentPartnerIds)).toBeDefined()
    })

    it('partner mock returns empty by default (no partners)', async () => {
      const result = await getFrequentPartnerIds({} as any, 'user-1', 'club-1')
      expect(result).toEqual([])
    })
  })

  describe('No clubs / no sessions', () => {
    it('handles zero clubs gracefully', async () => {
      const prisma = createMockPrisma({ clubs: [] })
      const result = await runSlotFillerAutomation(prisma as any, { mode: 'tomorrow', dryRun: true })
      expect(result.clubs).toHaveLength(0)
      expect(result.totalSent).toBe(0)
    })

    it('handles zero sessions gracefully', async () => {
      const prisma = createMockPrisma({ sessions: [] })
      const result = await runSlotFillerAutomation(prisma as any, { mode: 'tomorrow', dryRun: true })
      expect(result.clubs[0].sessionsProcessed).toBe(0)
    })
  })
})
