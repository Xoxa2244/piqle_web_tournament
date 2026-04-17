/**
 * Agent Actions — approve / skip / snooze
 *
 * Тестирует логику одобрения, пропуска и отложения
 * через route handlers Next.js с mock prisma и email.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'crypto'

// ── Hoisted mocks ──

const {
  mockFindUnique,
  mockUpdate,
  mockSendOutreachEmail,
  mockAgentDecisionRecordCreate,
} = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockUpdate: vi.fn(),
  mockSendOutreachEmail: vi.fn().mockResolvedValue({ success: true }),
  mockAgentDecisionRecordCreate: vi.fn().mockResolvedValue({ id: 'decision-1' }),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    aIRecommendationLog: {
      findUnique: mockFindUnique,
      update: mockUpdate,
    },
    agentDecisionRecord: {
      create: mockAgentDecisionRecordCreate,
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}))

vi.mock('@/lib/email', () => ({
  sendOutreachEmail: (...args: any[]) => mockSendOutreachEmail(...args),
}))

// Suppress stripe-usage import
vi.mock('@/lib/stripe-usage', () => ({
  reportUsage: vi.fn(),
}))

import { GET as approveGET } from '@/app/api/agent/approve/route'
import { GET as skipGET } from '@/app/api/agent/skip/route'
import { GET as snoozeGET } from '@/app/api/agent/snooze/route'

// ── Constants ──

const CRON_SECRET = 'test-secret-key-for-tests'
const ACTION_ID = 'action-abc-123'
const CLUB_ID = 'club-xyz-456'

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = CRON_SECRET
  // Allowlist test club for rollout (required by evaluateAgentOutreachRollout)
  process.env.AGENT_OUTREACH_ROLLOUT_CLUB_IDS = CLUB_ID
  // Re-set default success mock (vi.clearAllMocks resets implementation)
  mockSendOutreachEmail.mockResolvedValue({ success: true })
  mockAgentDecisionRecordCreate.mockResolvedValue({ id: 'decision-1' })
})

function generateToken(actionId: string, clubId: string): string {
  // Full SHA256 hash (64 hex chars) — matches production code after security hardening
  return createHmac('sha256', CRON_SECRET)
    .update(`${actionId}:${clubId}`)
    .digest('hex')
}

function makeUrl(path: string, actionId: string, token: string): string {
  return `http://localhost${path}?id=${actionId}&token=${token}`
}

function makePendingAction(overrides?: any) {
  return {
    id: ACTION_ID,
    clubId: CLUB_ID,
    status: 'pending',
    createdAt: new Date(),
    userId: 'user-1',
    type: 'SLOT_FILLER',
    reasoning: { transition: 'healthy to watch' },
    user: { id: 'user-1', email: 'member@club.com', name: 'John Doe' },
    club: {
      id: CLUB_ID,
      name: 'Test Club',
      // agentLive=true + rollout allowlist covers both control plane and rollout gates
      automationSettings: {
        intelligence: {
          agentLive: true,
          controlPlane: {
            killSwitch: false,
            outreachSend: 'live',
            // Per-action rollout flags (nested inside controlPlane)
            outreachRollout: {
              actions: {
                fill_session: { enabled: true },
                create_campaign: { enabled: true },
                reactivate_members: { enabled: true },
                trial_follow_up: { enabled: true },
                renewal_reactivation: { enabled: true },
              },
            },
          },
        },
      },
    },
    ...overrides,
  }
}

// ── Approve ──

describe('Agent Actions > Approve', () => {
  it('валидный токен + pending → отправляет email, обновляет статус на sent', async () => {
    const token = generateToken(ACTION_ID, CLUB_ID)
    mockFindUnique.mockResolvedValue(makePendingAction())
    mockUpdate.mockResolvedValue({})

    const req = new Request(makeUrl('/api/agent/approve', ACTION_ID, token))
    const res = await approveGET(req)

    expect(res.status).toBe(200)
    expect(mockSendOutreachEmail).toHaveBeenCalledTimes(1)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ACTION_ID },
        data: expect.objectContaining({ status: 'sent' }),
      }),
    )
  })

  it('невалидный токен → возвращает ошибку', async () => {
    mockFindUnique.mockResolvedValue(makePendingAction())

    const req = new Request(makeUrl('/api/agent/approve', ACTION_ID, 'wrong-token'))
    const res = await approveGET(req)

    const html = await res.text()
    expect(html).toContain('Invalid token')
    expect(mockSendOutreachEmail).not.toHaveBeenCalled()
  })

  it('уже обработанное действие → информационное сообщение', async () => {
    const token = generateToken(ACTION_ID, CLUB_ID)
    mockFindUnique.mockResolvedValue(makePendingAction({ status: 'sent' }))

    const req = new Request(makeUrl('/api/agent/approve', ACTION_ID, token))
    const res = await approveGET(req)

    const html = await res.text()
    expect(html).toContain('already sent')
    expect(mockSendOutreachEmail).not.toHaveBeenCalled()
  })

  it('просроченное действие (>48ч) → сообщение об истечении', async () => {
    const token = generateToken(ACTION_ID, CLUB_ID)
    const oldDate = new Date(Date.now() - 49 * 60 * 60 * 1000) // 49 hours ago
    mockFindUnique.mockResolvedValue(makePendingAction({ createdAt: oldDate }))

    const req = new Request(makeUrl('/api/agent/approve', ACTION_ID, token))
    const res = await approveGET(req)

    const html = await res.text()
    expect(html).toContain('expired')
    expect(mockSendOutreachEmail).not.toHaveBeenCalled()
  })
})

// ── Skip ──

describe('Agent Actions > Skip', () => {
  it('валидный skip → обновляет статус на skipped', async () => {
    const token = generateToken(ACTION_ID, CLUB_ID)
    mockFindUnique.mockResolvedValue({
      id: ACTION_ID,
      clubId: CLUB_ID,
      status: 'pending',
      userId: 'user-1',
    })
    mockUpdate.mockResolvedValue({})

    const req = new Request(makeUrl('/api/agent/skip', ACTION_ID, token))
    const res = await skipGET(req)

    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ACTION_ID },
        data: expect.objectContaining({ status: 'skipped' }),
      }),
    )
  })
})

// ── Snooze ──

describe('Agent Actions > Snooze', () => {
  it('валидный snooze → сбрасывает createdAt, увеличивает snoozeCount', async () => {
    const token = generateToken(ACTION_ID, CLUB_ID)
    mockFindUnique.mockResolvedValue({
      id: ACTION_ID,
      clubId: CLUB_ID,
      status: 'pending',
      reasoning: { someField: 'value', snoozeCount: 0 },
    })
    mockUpdate.mockResolvedValue({})

    const req = new Request(makeUrl('/api/agent/snooze', ACTION_ID, token))
    const res = await snoozeGET(req)

    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Snoozed')
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ACTION_ID },
        data: expect.objectContaining({
          reasoning: expect.objectContaining({ snoozeCount: 1 }),
        }),
      }),
    )
  })
})
