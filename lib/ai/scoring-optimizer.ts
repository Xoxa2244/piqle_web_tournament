/**
 * Scoring Optimizer — Auto-adjusts scoring weights based on conversion data
 *
 * How it works:
 * 1. Query AIRecommendationLog for converted vs non-converted recommendations
 * 2. For each score component, calculate correlation with conversion
 * 3. Components with higher correlation → increase weight
 * 4. Components with low/negative correlation → decrease weight
 * 5. Store optimized weights per club in automationSettings
 *
 * Also provides conversion alerts when campaign performance drops.
 */

// ── Default Weights (slot filler) ──
export const DEFAULT_WEIGHTS = {
  scheduleFit: 0.30,
  skillFit: 0.25,
  formatFit: 0.15,
  recency: 0.15,
  frequencyGap: 0.10,
  responsiveness: 0.05,
}

export type WeightKey = keyof typeof DEFAULT_WEIGHTS

interface ConversionDataPoint {
  converted: boolean
  components: Record<string, number> // component name → score 0-100
}

interface OptimizedWeights {
  weights: Record<string, number>
  adjustments: Array<{ component: string; oldWeight: number; newWeight: number; reason: string }>
  sampleSize: number
  conversionRate: number
}

/**
 * Calculate optimized weights based on historical conversion data.
 * Uses correlation between component scores and conversion outcomes.
 */
export function optimizeWeights(
  data: ConversionDataPoint[],
  currentWeights: Record<string, number> = DEFAULT_WEIGHTS,
): OptimizedWeights {
  if (data.length < 20) {
    return {
      weights: { ...currentWeights },
      adjustments: [],
      sampleSize: data.length,
      conversionRate: data.filter(d => d.converted).length / Math.max(data.length, 1),
    }
  }

  const componentNames = Object.keys(currentWeights)
  const correlations: Record<string, number> = {}

  // Calculate point-biserial correlation for each component
  for (const comp of componentNames) {
    const converted = data.filter(d => d.converted).map(d => d.components[comp] ?? 50)
    const notConverted = data.filter(d => !d.converted).map(d => d.components[comp] ?? 50)

    if (converted.length === 0 || notConverted.length === 0) {
      correlations[comp] = 0
      continue
    }

    const avgConverted = converted.reduce((s, v) => s + v, 0) / converted.length
    const avgNotConverted = notConverted.reduce((s, v) => s + v, 0) / notConverted.length

    // Positive correlation = higher scores correlate with conversion
    correlations[comp] = (avgConverted - avgNotConverted) / 100
  }

  // Adjust weights: boost components with positive correlation, reduce negative
  const adjustments: OptimizedWeights['adjustments'] = []
  const newWeights = { ...currentWeights }

  for (const comp of componentNames) {
    const corr = correlations[comp] ?? 0
    const oldWeight = currentWeights[comp] ?? 0

    // Adjustment factor: max ±30% change per optimization cycle
    const adjustmentFactor = Math.max(-0.3, Math.min(0.3, corr))
    const adjustment = oldWeight * adjustmentFactor
    const newWeight = Math.max(0.02, oldWeight + adjustment) // floor at 2%

    if (Math.abs(adjustment) > 0.005) {
      adjustments.push({
        component: comp,
        oldWeight: Math.round(oldWeight * 100),
        newWeight: Math.round(newWeight * 100),
        reason: corr > 0
          ? `Higher ${comp} scores correlate with bookings (+${Math.round(corr * 100)}%)`
          : `${comp} scores don't predict bookings (${Math.round(corr * 100)}%)`,
      })
    }

    newWeights[comp] = newWeight
  }

  // Normalize to sum to 1.0
  const totalWeight = Object.values(newWeights).reduce((s, v) => s + v, 0)
  for (const comp of componentNames) {
    newWeights[comp] = newWeights[comp] / totalWeight
  }

  return {
    weights: newWeights,
    adjustments,
    sampleSize: data.length,
    conversionRate: data.filter(d => d.converted).length / data.length,
  }
}

// ── Campaign Performance Alerts ──

export interface CampaignAlert {
  type: 'low_conversion' | 'high_bounce' | 'declining_trend' | 'persona_underperform'
  severity: 'warning' | 'critical'
  message: string
  metric: string
  value: number
  threshold: number
}

interface AlertInput {
  totalSent: number
  totalConverted: number
  totalBounced: number
  totalUnsubscribed: number
  previousPeriodConversionRate?: number
  byPersona?: Array<{ persona: string; sent: number; converted: number }>
}

export function checkCampaignAlerts(input: AlertInput): CampaignAlert[] {
  const alerts: CampaignAlert[] = []
  const { totalSent, totalConverted, totalBounced, totalUnsubscribed } = input

  if (totalSent < 10) return alerts // Not enough data

  const conversionRate = totalConverted / totalSent
  const bounceRate = totalBounced / totalSent
  const unsubscribeRate = totalUnsubscribed / totalSent

  // Low conversion alert
  if (conversionRate < 0.02 && totalSent >= 50) {
    alerts.push({
      type: 'low_conversion',
      severity: 'critical',
      message: `Conversion rate is ${(conversionRate * 100).toFixed(1)}% — below 2% threshold. Consider reviewing targeting or message content.`,
      metric: 'conversionRate',
      value: conversionRate,
      threshold: 0.02,
    })
  } else if (conversionRate < 0.05 && totalSent >= 30) {
    alerts.push({
      type: 'low_conversion',
      severity: 'warning',
      message: `Conversion rate is ${(conversionRate * 100).toFixed(1)}% — below 5% target.`,
      metric: 'conversionRate',
      value: conversionRate,
      threshold: 0.05,
    })
  }

  // High bounce alert
  if (bounceRate > 0.1) {
    alerts.push({
      type: 'high_bounce',
      severity: bounceRate > 0.2 ? 'critical' : 'warning',
      message: `Bounce rate is ${(bounceRate * 100).toFixed(1)}% — check email/phone data quality.`,
      metric: 'bounceRate',
      value: bounceRate,
      threshold: 0.1,
    })
  }

  // Declining trend
  if (input.previousPeriodConversionRate !== undefined && input.previousPeriodConversionRate > 0) {
    const decline = (input.previousPeriodConversionRate - conversionRate) / input.previousPeriodConversionRate
    if (decline > 0.3) {
      alerts.push({
        type: 'declining_trend',
        severity: decline > 0.5 ? 'critical' : 'warning',
        message: `Conversion rate dropped ${Math.round(decline * 100)}% vs previous period (${(input.previousPeriodConversionRate * 100).toFixed(1)}% → ${(conversionRate * 100).toFixed(1)}%).`,
        metric: 'conversionRateChange',
        value: decline,
        threshold: 0.3,
      })
    }
  }

  // High unsubscribe rate
  if (unsubscribeRate > 0.05) {
    alerts.push({
      type: 'high_bounce',
      severity: 'critical',
      message: `Unsubscribe rate is ${(unsubscribeRate * 100).toFixed(1)}% — reduce message frequency or improve targeting.`,
      metric: 'unsubscribeRate',
      value: unsubscribeRate,
      threshold: 0.05,
    })
  }

  // Persona underperformance
  if (input.byPersona) {
    for (const p of input.byPersona) {
      if (p.sent >= 10) {
        const personaRate = p.converted / p.sent
        if (personaRate < 0.01) {
          alerts.push({
            type: 'persona_underperform',
            severity: 'warning',
            message: `${p.persona} segment has ${(personaRate * 100).toFixed(1)}% conversion (${p.converted}/${p.sent}). Consider different messaging for this persona.`,
            metric: `conversionRate_${p.persona}`,
            value: personaRate,
            threshold: 0.01,
          })
        }
      }
    }
  }

  return alerts
}
