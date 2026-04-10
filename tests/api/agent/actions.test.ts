/**
 * Agent Actions — approve / skip / snooze
 *
 * Тестирует логику одобрения, пропуска и отложения
 * через route handlers Next.js с mock prisma и email.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'crypto'

// ── Hoisted mocks ──

const { mockFindUnique, mockUpdate, mockSendOutreachEmail } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockUpdate: vi.fn(),
  mockSendOutreachEmail: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    aIRecommendationLog: {
      findUnique: mockFindUnique,
      update: mockUpdate,
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
})

function generateToken(actionId: string, clubId: string): string {
  return createHmac('sha256', CRON_SECRET)
    .update(`${actionId}:${clubId}`)
    .digest('hex')
    .slice(0, 32)
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
    reasoning: { transition: 'healthy to watch' },
    user: { id: 'user-1', email: 'member@club.com', name: 'John Doe' },
    club: { id: CLUB_ID, name: 'Test Club' },
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
