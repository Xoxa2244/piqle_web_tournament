import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock Prisma ──

const { mockFindFirst, mockUpdate } = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockUpdate: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    aIRecommendationLog: {
      findFirst: mockFindFirst,
      update: mockUpdate,
    },
  },
}))

import { POST } from '@/app/api/webhooks/mandrill/route'

beforeEach(() => {
  vi.clearAllMocks()
  mockFindFirst.mockResolvedValue(null)
  mockUpdate.mockResolvedValue({})
})

/** Helper: create a Request with JSON body for Mandrill events */
function makeRequest(events: any[]): Request {
  return new Request('http://localhost/api/webhooks/mandrill', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(events),
  })
}

const LOG_ID = 'log-abc-123'
const EXTERNAL_ID = 'mandrill-msg-id'
const EVENT_TS = 1711900000 // seconds

// ── Event processing ──

describe('Mandrill Webhook > Обработка событий', () => {
  it('open → устанавливает openedAt, статус opened', async () => {
    mockFindFirst.mockResolvedValue({ id: LOG_ID, status: 'sent', openedAt: null, clickedAt: null })

    const res = await POST(makeRequest([
      { event: 'open', msg: { _id: EXTERNAL_ID }, ts: EVENT_TS },
    ]))

    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: LOG_ID },
      data: {
        openedAt: new Date(EVENT_TS * 1000),
        status: 'opened',
      },
    })
  })

  it('click → устанавливает clickedAt, статус clicked', async () => {
    mockFindFirst.mockResolvedValue({ id: LOG_ID, status: 'opened', openedAt: new Date(), clickedAt: null })

    const res = await POST(makeRequest([
      { event: 'click', msg: { _id: EXTERNAL_ID }, ts: EVENT_TS },
    ]))

    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: LOG_ID },
      data: {
        clickedAt: new Date(EVENT_TS * 1000),
        status: 'clicked',
      },
    })
  })

  it('hard_bounce → устанавливает bouncedAt, bounceType hard, статус bounced', async () => {
    mockFindFirst.mockResolvedValue({ id: LOG_ID, status: 'sent', openedAt: null, clickedAt: null })

    await POST(makeRequest([
      { event: 'hard_bounce', msg: { _id: EXTERNAL_ID }, ts: EVENT_TS },
    ]))

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: LOG_ID },
      data: {
        bouncedAt: new Date(EVENT_TS * 1000),
        bounceType: 'hard',
        status: 'bounced',
      },
    })
  })

  it('soft_bounce → bounceType soft', async () => {
    mockFindFirst.mockResolvedValue({ id: LOG_ID, status: 'sent', openedAt: null, clickedAt: null })

    await POST(makeRequest([
      { event: 'soft_bounce', msg: { _id: EXTERNAL_ID }, ts: EVENT_TS },
    ]))

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: LOG_ID },
      data: {
        bouncedAt: new Date(EVENT_TS * 1000),
        bounceType: 'soft',
        status: 'bounced',
      },
    })
  })

  it('reject → bounceType reject', async () => {
    mockFindFirst.mockResolvedValue({ id: LOG_ID, status: 'sent', openedAt: null, clickedAt: null })

    await POST(makeRequest([
      { event: 'reject', msg: { _id: EXTERNAL_ID }, ts: EVENT_TS },
    ]))

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: LOG_ID },
      data: {
        bouncedAt: new Date(EVENT_TS * 1000),
        bounceType: 'reject',
        status: 'bounced',
      },
    })
  })

  it('неизвестное событие → игнорируется', async () => {
    mockFindFirst.mockResolvedValue({ id: LOG_ID, status: 'sent', openedAt: null, clickedAt: null })

    const res = await POST(makeRequest([
      { event: 'deferral', msg: { _id: EXTERNAL_ID }, ts: EVENT_TS },
    ]))

    expect(res.status).toBe(200)
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})

// ── Edge cases ──

describe('Mandrill Webhook > Граничные случаи', () => {
  it('нет совпадающей записи → предупреждение в лог, без ошибки', async () => {
    mockFindFirst.mockResolvedValue(null)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const res = await POST(makeRequest([
      { event: 'open', msg: { _id: 'unknown-id' }, ts: EVENT_TS },
    ]))

    expect(res.status).toBe(200)
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Log not found'),
      // no specific args after
    )
    warnSpy.mockRestore()
  })

  it('идемпотентность: повторный open не перезаписывает первый openedAt', async () => {
    const firstOpenedAt = new Date('2026-03-10T12:00:00Z')
    mockFindFirst.mockResolvedValue({
      id: LOG_ID,
      status: 'opened',
      openedAt: firstOpenedAt,
      clickedAt: null,
    })

    await POST(makeRequest([
      { event: 'open', msg: { _id: EXTERNAL_ID }, ts: EVENT_TS },
    ]))

    // openedAt should remain the original value (log.openedAt ?? eventTime)
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: LOG_ID },
      data: {
        openedAt: firstOpenedAt, // preserved
        status: 'opened', // status stays 'opened' since log.status !== 'sent'
      },
    })
  })

  it('прогрессия статуса: sent → opened (не opened → sent)', async () => {
    // When status is already 'opened', it should NOT go back to 'sent'
    mockFindFirst.mockResolvedValue({
      id: LOG_ID,
      status: 'opened',
      openedAt: new Date(),
      clickedAt: null,
    })

    await POST(makeRequest([
      { event: 'open', msg: { _id: EXTERNAL_ID }, ts: EVENT_TS },
    ]))

    const updateData = mockUpdate.mock.calls[0][0].data
    // status should NOT be changed to something lower
    expect(updateData.status).toBe('opened') // stays 'opened', not reverted
  })
})
