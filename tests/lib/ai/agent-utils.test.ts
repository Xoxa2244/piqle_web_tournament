/**
 * AI Agent Utilities — утилиты агента
 *
 * Тестирует getClubNotificationEmails, isAgentLive, hasApiConnector
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getClubNotificationEmails,
  isAgentLive,
  hasApiConnector,
} from '@/lib/ai/agent-utils'

// ── Mock Prisma ──

function createMockPrisma() {
  return {
    club: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    clubAdmin: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    clubConnector: {
      count: vi.fn().mockResolvedValue(0),
    },
  }
}

let mockPrisma: ReturnType<typeof createMockPrisma>

beforeEach(() => {
  mockPrisma = createMockPrisma()
})

const CLUB_ID = 'club-123'

// ── getClubNotificationEmails ──

describe('Agent Utils > getClubNotificationEmails', () => {
  it('возвращает override email из automationSettings если задан', async () => {
    mockPrisma.club.findUnique.mockResolvedValue({
      automationSettings: {
        intelligence: { notificationEmail: 'override@club.com' },
      },
    })

    const emails = await getClubNotificationEmails(mockPrisma, CLUB_ID)
    expect(emails).toEqual(['override@club.com'])
    // Не должен обращаться к ClubAdmin когда есть override
    expect(mockPrisma.clubAdmin.findMany).not.toHaveBeenCalled()
  })

  it('возвращает email адреса ClubAdmin когда override не задан', async () => {
    mockPrisma.club.findUnique.mockResolvedValue({ automationSettings: null })
    mockPrisma.clubAdmin.findMany.mockResolvedValue([
      { user: { email: 'admin1@club.com' } },
      { user: { email: 'admin2@club.com' } },
    ])

    const emails = await getClubNotificationEmails(mockPrisma, CLUB_ID)
    expect(emails).toEqual(['admin1@club.com', 'admin2@club.com'])
  })

  it('фильтрует placeholder email адреса', async () => {
    mockPrisma.club.findUnique.mockResolvedValue({ automationSettings: null })
    mockPrisma.clubAdmin.findMany.mockResolvedValue([
      { user: { email: 'admin@club.com' } },
      { user: { email: 'placeholder@example.com' } },
      { user: { email: null } },
    ])

    const emails = await getClubNotificationEmails(mockPrisma, CLUB_ID)
    expect(emails).toEqual(['admin@club.com'])
    expect(emails).not.toContain('placeholder@example.com')
  })
})

// ── isAgentLive ──

describe('Agent Utils > isAgentLive', () => {
  it('возвращает false по умолчанию (нет настроек)', async () => {
    mockPrisma.club.findUnique.mockResolvedValue(null)
    const live = await isAgentLive(mockPrisma, CLUB_ID)
    expect(live).toBe(false)
  })

  it('возвращает true когда agentLive = true', async () => {
    mockPrisma.club.findUnique.mockResolvedValue({
      automationSettings: {
        intelligence: { agentLive: true },
      },
    })
    const live = await isAgentLive(mockPrisma, CLUB_ID)
    expect(live).toBe(true)
  })
})

// ── hasApiConnector ──

describe('Agent Utils > hasApiConnector', () => {
  it('возвращает false когда нет коннекторов', async () => {
    mockPrisma.clubConnector.count.mockResolvedValue(0)
    const has = await hasApiConnector(mockPrisma, CLUB_ID)
    expect(has).toBe(false)
  })

  it('возвращает true когда courtreserve коннектор существует', async () => {
    mockPrisma.clubConnector.count.mockResolvedValue(1)
    const has = await hasApiConnector(mockPrisma, CLUB_ID)
    expect(has).toBe(true)
  })
})
