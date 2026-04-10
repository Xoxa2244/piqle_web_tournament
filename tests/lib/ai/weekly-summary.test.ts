/**
 * SET 9: Еженедельный дайджест
 *
 * Сбор данных за неделю, генерация AI-саммари,
 * отправка email-отчета администраторам клуба.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getWeekBounds } from '@/lib/ai/weekly-summary'

// ── Date Helpers ──

describe('Еженедельный дайджест > Расчет границ недели', () => {
  it('возвращает предыдущую полную неделю (Пн–Вс)', () => {
    // Friday March 14, 2026
    const now = new Date('2026-03-14T12:00:00Z')
    const { weekStart, weekEnd } = getWeekBounds(now)

    // Previous week: Mon Mar 2 - Sun Mar 8
    expect(weekStart.getDay()).toBe(1) // Monday
    expect(weekEnd.getDay()).toBe(0) // Sunday
    expect(weekStart.getDate()).toBe(2)
    expect(weekEnd.getDate()).toBe(8)
  })

  it('понедельник → возвращает прошлую неделю (не текущую)', () => {
    const monday = new Date('2026-03-09T10:00:00Z')
    const { weekStart, weekEnd } = getWeekBounds(monday)

    // Should be Mon Mar 2 - Sun Mar 8 (previous complete week)
    expect(weekStart.getDate()).toBe(2)
    expect(weekEnd.getDate()).toBe(8)
  })

  it('воскресенье → корректный расчет предыдущей недели', () => {
    const sunday = new Date('2026-03-08T18:00:00Z')
    const { weekStart, weekEnd } = getWeekBounds(sunday)

    // This Sunday is March 8 — current week started Mon Mar 2
    // Previous week: Mon Feb 23 - Sun Mar 1
    expect(weekStart.getDate()).toBe(23)
    expect(weekStart.getMonth()).toBe(1) // February
    expect(weekEnd.getDate()).toBe(1)
    expect(weekEnd.getMonth()).toBe(2) // March
  })

  it('weekEnd включает весь день (23:59:59.999)', () => {
    const { weekEnd } = getWeekBounds(new Date('2026-03-14T12:00:00Z'))
    expect(weekEnd.getHours()).toBe(23)
    expect(weekEnd.getMinutes()).toBe(59)
    expect(weekEnd.getSeconds()).toBe(59)
    expect(weekEnd.getMilliseconds()).toBe(999)
  })

  it('weekStart начинается с 00:00:00.000', () => {
    const { weekStart } = getWeekBounds(new Date('2026-03-14T12:00:00Z'))
    expect(weekStart.getHours()).toBe(0)
    expect(weekStart.getMinutes()).toBe(0)
    expect(weekStart.getSeconds()).toBe(0)
  })
})

// ── LLM response parsing ──

describe('Еженедельный дайджест > Генерация саммари через LLM', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('корректный JSON → executiveSummary, wins, risks, keyNumbers', async () => {
    const mockResponse = {
      text: JSON.stringify({
        executiveSummary: 'Great week.',
        wins: ['Win 1', 'Win 2'],
        risks: ['Risk 1'],
        actionsTaken: ['Action 1'],
        keyNumbers: [
          { label: 'Health', thisWeek: 75, lastWeek: 70, changePercent: 7.1, direction: 'up' },
        ],
      }),
      model: 'gpt-4o-mini',
    }

    vi.doMock('@/lib/ai/llm/provider', () => ({
      generateWithFallback: vi.fn().mockResolvedValue(mockResponse),
    }))
    vi.doMock('@/lib/ai/variant-optimizer', () => ({
      getVariantAnalytics: vi.fn().mockResolvedValue({ variants: [] }),
    }))

    const { generateWeeklySummaryContent } = await import('@/lib/ai/weekly-summary')

    const input = {
      clubName: 'Test Club',
      weekLabel: 'Mar 2 – Mar 8, 2026',
      weekStart: new Date('2026-03-02'),
      weekEnd: new Date('2026-03-08'),
      health: { total: 50, healthy: 30, watch: 12, atRisk: 6, critical: 2, avgScore: 72 },
      prevHealth: { total: 48, healthy: 28, watch: 12, atRisk: 6, critical: 2, avgScore: 68 },
      campaigns: { totalSent: 14, totalOpened: 8, totalClicked: 3, totalBounced: 1, byType: [{ type: 'CHECK_IN', count: 14 }] },
      prevCampaigns: { totalSent: 10, totalOpened: 5, totalClicked: 2 },
      bestVariant: { id: 'checkin_pattern', score: 0.85 },
      worstVariant: { id: 'checkin_frequency', score: 0.45 },
      sequences: { active: 3, completed: 1, exited: 0 },
    }

    const result = await generateWeeklySummaryContent(input)
    expect(result.content.executiveSummary).toBe('Great week.')
    expect(result.content.wins).toHaveLength(2)
    expect(result.content.risks).toHaveLength(1)
    expect(result.content.keyNumbers).toHaveLength(1)
    expect(result.model).toBe('gpt-4o-mini')
  })

  it('markdown fence (```json...```) → корректный парсинг', async () => {
    const jsonContent = JSON.stringify({
      executiveSummary: 'Fenced response.',
      wins: ['Win'],
      risks: [],
      actionsTaken: [],
      keyNumbers: [],
    })
    const mockResponse = {
      text: '```json\n' + jsonContent + '\n```',
      model: 'gpt-4o-mini',
    }

    vi.doMock('@/lib/ai/llm/provider', () => ({
      generateWithFallback: vi.fn().mockResolvedValue(mockResponse),
    }))
    vi.doMock('@/lib/ai/variant-optimizer', () => ({
      getVariantAnalytics: vi.fn().mockResolvedValue({ variants: [] }),
    }))

    const { generateWeeklySummaryContent } = await import('@/lib/ai/weekly-summary')

    const input = {
      clubName: 'Test Club',
      weekLabel: 'Mar 2 – Mar 8, 2026',
      weekStart: new Date('2026-03-02'),
      weekEnd: new Date('2026-03-08'),
      health: { total: 10, healthy: 8, watch: 1, atRisk: 1, critical: 0, avgScore: 80 },
      prevHealth: null,
      campaigns: { totalSent: 0, totalOpened: 0, totalClicked: 0, totalBounced: 0, byType: [] },
      prevCampaigns: null,
      bestVariant: null,
      worstVariant: null,
      sequences: { active: 0, completed: 0, exited: 0 },
    }

    const result = await generateWeeklySummaryContent(input)
    expect(result.content.executiveSummary).toBe('Fenced response.')
  })

  it('ошибка LLM → fallback саммари ("20 members tracked")', async () => {
    vi.doMock('@/lib/ai/llm/provider', () => ({
      generateWithFallback: vi.fn().mockRejectedValue(new Error('API error')),
    }))
    vi.doMock('@/lib/ai/variant-optimizer', () => ({
      getVariantAnalytics: vi.fn().mockResolvedValue({ variants: [] }),
    }))

    const { generateWeeklySummaryContent } = await import('@/lib/ai/weekly-summary')

    const input = {
      clubName: 'Test Club',
      weekLabel: 'Mar 2 – Mar 8, 2026',
      weekStart: new Date('2026-03-02'),
      weekEnd: new Date('2026-03-08'),
      health: { total: 20, healthy: 15, watch: 3, atRisk: 1, critical: 1, avgScore: 65 },
      prevHealth: { total: 20, healthy: 14, watch: 4, atRisk: 1, critical: 1, avgScore: 60 },
      campaigns: { totalSent: 8, totalOpened: 4, totalClicked: 2, totalBounced: 0, byType: [] },
      prevCampaigns: null,
      bestVariant: null,
      worstVariant: null,
      sequences: { active: 2, completed: 0, exited: 0 },
    }

    const result = await generateWeeklySummaryContent(input)
    expect(result.model).toBe('fallback')
    expect(result.content.executiveSummary).toContain('20 members tracked')
    expect(result.content.keyNumbers.length).toBeGreaterThan(0)
    // Should have wins — health improved
    expect(result.content.wins.some(w => w.includes('improved'))).toBe(true)
    // Should have risks — critical members
    expect(result.content.risks.some(r => r.includes('critical'))).toBe(true)
  })
})

// ── Data Collection ──

describe('Еженедельный дайджест > Сбор данных за неделю', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('данные из всех источников: clubName, health, campaigns, sequences', async () => {
    vi.doMock('@/lib/ai/variant-optimizer', () => ({
      getVariantAnalytics: vi.fn().mockResolvedValue({ variants: [] }),
    }))
    vi.doMock('@/lib/ai/llm/provider', () => ({
      generateWithFallback: vi.fn(),
    }))

    const { collectWeeklySummaryData } = await import('@/lib/ai/weekly-summary')

    const mockPrisma = {
      club: {
        findUnique: vi.fn().mockResolvedValue({ name: 'Test Club' }),
      },
      memberHealthSnapshot: {
        findMany: vi.fn().mockResolvedValue([
          { userId: 'u1', healthScore: 80, riskLevel: 'healthy', date: new Date() },
          { userId: 'u2', healthScore: 50, riskLevel: 'at_risk', date: new Date() },
        ]),
      },
      aIRecommendationLog: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }

    const result = await collectWeeklySummaryData(mockPrisma, 'club-1')

    expect(result.clubName).toBe('Test Club')
    expect(result.health.total).toBe(2)
    expect(result.health.healthy).toBe(1)
    expect(result.health.atRisk).toBe(1)
    expect(result.health.avgScore).toBe(65) // (80+50)/2
    expect(result.weekLabel).toMatch(/\w+ \d+ – \w+ \d+, \d{4}/)
  })

  it('пустые данные → "Unknown Club", health.total=0, нули', async () => {
    vi.doMock('@/lib/ai/variant-optimizer', () => ({
      getVariantAnalytics: vi.fn().mockResolvedValue({ variants: [] }),
    }))
    vi.doMock('@/lib/ai/llm/provider', () => ({
      generateWithFallback: vi.fn(),
    }))

    const { collectWeeklySummaryData } = await import('@/lib/ai/weekly-summary')

    const mockPrisma = {
      club: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      memberHealthSnapshot: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      aIRecommendationLog: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }

    const result = await collectWeeklySummaryData(mockPrisma, 'club-1')

    expect(result.clubName).toBe('Unknown Club')
    expect(result.health.total).toBe(0)
    expect(result.health.avgScore).toBe(0)
    expect(result.prevHealth).toBeNull()
    expect(result.campaigns.totalSent).toBe(0)
    expect(result.sequences.active).toBe(0)
  })
})

// ── Email Template ──

describe('Еженедельный дайджест > Email-шаблон', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('HTML содержит summary, wins, risks, actions, "View Dashboard"', async () => {
    vi.doMock('@/lib/sendTransactionEmail', () => ({
      sendHtmlEmail: vi.fn(),
    }))

    const { sendWeeklySummaryEmail } = await import('@/lib/ai/weekly-summary-email')
    const { sendHtmlEmail } = await import('@/lib/sendTransactionEmail')

    const content = {
      executiveSummary: 'Great week.',
      wins: ['Win 1'],
      risks: ['Risk 1'],
      actionsTaken: ['Action 1'],
      keyNumbers: [
        { label: 'Health', thisWeek: 75 as number | string, lastWeek: 70 as number | string, changePercent: 7.1, direction: 'up' as const },
      ],
      generatedAt: new Date().toISOString(),
      weekLabel: 'Mar 2 – Mar 8, 2026',
    }

    await sendWeeklySummaryEmail('admin@test.com', content, 'Test Club', 'club-1')

    expect(sendHtmlEmail).toHaveBeenCalledTimes(1)
    const [to, subject, html] = (sendHtmlEmail as any).mock.calls[0]
    expect(to).toBe('admin@test.com')
    expect(subject).toContain('Weekly AI Summary')
    expect(subject).toContain('Test Club')
    expect(html).toContain('Great week.')
    expect(html).toContain('Win 1')
    expect(html).toContain('Risk 1')
    expect(html).toContain('Action 1')
    expect(html).toContain('View Dashboard')
  })
})
