/**
 * Confidence Scoring — оценка уверенности для автоматизации
 *
 * Тестирует calculateConfidence из campaign-engine.ts:
 * - переходы между уровнями риска
 * - влияние ценности участника (количество бронирований)
 * - низкий health score и длительная неактивность
 * - порог autoApproved
 */

import { describe, it, expect } from 'vitest'
import { calculateConfidence } from '@/lib/ai/campaign-engine'

describe('Confidence Scoring > calculateConfidence', () => {
  it('healthy→watch + CHECK_IN → высокая уверенность (>=80)', () => {
    const result = calculateConfidence(
      { from: 'healthy', to: 'watch' },
      { healthScore: 60, totalBookings: 15, daysSinceLastBooking: 10 },
      'CHECK_IN',
    )
    // baseline 50 + 30 (healthy→watch) + 15 (CHECK_IN) = 95
    expect(result.score).toBeGreaterThanOrEqual(80)
    expect(result.autoApproved).toBe(true)
  })

  it('watch→at_risk + RETENTION_BOOST → средняя уверенность (50-70)', () => {
    const result = calculateConfidence(
      { from: 'watch', to: 'at_risk' },
      { healthScore: 40, totalBookings: 15, daysSinceLastBooking: 14 },
      'RETENTION_BOOST',
    )
    // baseline 50 + 10 (watch→at_risk) + 5 (RETENTION_BOOST) = 65
    expect(result.score).toBeGreaterThanOrEqual(50)
    expect(result.score).toBeLessThanOrEqual(70)
  })

  it('переход к critical → низкая уверенность (<50, нужно одобрение)', () => {
    const result = calculateConfidence(
      { from: 'at_risk', to: 'critical' },
      { healthScore: 15, totalBookings: 60, daysSinceLastBooking: 45 },
      'RETENTION_BOOST',
    )
    // baseline 50 - 10 (critical) + 5 (RETENTION_BOOST) - 15 (high-value) + 5 (health<20) + 5 (30+ days) = 40
    expect(result.score).toBeLessThan(50)
    expect(result.autoApproved).toBe(false)
  })

  it('ценный участник (50+ бронирований) → снижает уверенность', () => {
    const highValue = calculateConfidence(
      { from: 'healthy', to: 'watch' },
      { healthScore: 60, totalBookings: 55, daysSinceLastBooking: 10 },
      'CHECK_IN',
    )
    const normalValue = calculateConfidence(
      { from: 'healthy', to: 'watch' },
      { healthScore: 60, totalBookings: 15, daysSinceLastBooking: 10 },
      'CHECK_IN',
    )
    expect(highValue.score).toBeLessThan(normalValue.score)
  })

  it('новый участник (<5 бронирований) → повышает уверенность', () => {
    const newMember = calculateConfidence(
      { from: 'healthy', to: 'watch' },
      { healthScore: 60, totalBookings: 3, daysSinceLastBooking: 10 },
      'CHECK_IN',
    )
    const regularMember = calculateConfidence(
      { from: 'healthy', to: 'watch' },
      { healthScore: 60, totalBookings: 15, daysSinceLastBooking: 10 },
      'CHECK_IN',
    )
    expect(newMember.score).toBeGreaterThan(regularMember.score)
  })

  it('очень низкий health score (<20) → небольшое повышение', () => {
    const lowHealth = calculateConfidence(
      { from: 'watch', to: 'at_risk' },
      { healthScore: 15, totalBookings: 15, daysSinceLastBooking: 10 },
      'CHECK_IN',
    )
    const normalHealth = calculateConfidence(
      { from: 'watch', to: 'at_risk' },
      { healthScore: 50, totalBookings: 15, daysSinceLastBooking: 10 },
      'CHECK_IN',
    )
    expect(lowHealth.score).toBeGreaterThan(normalHealth.score)
  })

  it('длительная неактивность (30+ дней) → небольшое повышение', () => {
    const longInactive = calculateConfidence(
      { from: 'watch', to: 'at_risk' },
      { healthScore: 40, totalBookings: 15, daysSinceLastBooking: 35 },
      'CHECK_IN',
    )
    const recentActive = calculateConfidence(
      { from: 'watch', to: 'at_risk' },
      { healthScore: 40, totalBookings: 15, daysSinceLastBooking: 5 },
      'CHECK_IN',
    )
    expect(longInactive.score).toBeGreaterThan(recentActive.score)
  })

  it('порог 70: score >=70 autoApproved, <70 нет', () => {
    // healthy→watch + CHECK_IN + new member → 50+30+15+10 = 105 clamped to 100 → autoApproved
    const high = calculateConfidence(
      { from: 'healthy', to: 'watch' },
      { healthScore: 60, totalBookings: 3, daysSinceLastBooking: 10 },
      'CHECK_IN',
      70,
    )
    expect(high.autoApproved).toBe(true)

    // watch→at_risk + RETENTION_BOOST → 50+10+5 = 65 → not autoApproved at threshold 70
    const low = calculateConfidence(
      { from: 'watch', to: 'at_risk' },
      { healthScore: 40, totalBookings: 15, daysSinceLastBooking: 10 },
      'RETENTION_BOOST',
      70,
    )
    expect(low.autoApproved).toBe(false)
  })
})
