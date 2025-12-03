import { describe, expect, it } from 'vitest'
import { calculatePlatformFeeAmount, STRIPE_PLATFORM_FEE_PERCENT } from '@/lib/stripe'

describe('calculatePlatformFeeAmount', () => {
  it('returns 10 percent rounded to nearest cent', () => {
    expect(calculatePlatformFeeAmount(1000)).toBe(100)
    expect(calculatePlatformFeeAmount(3333)).toBe(Math.round(3333 * STRIPE_PLATFORM_FEE_PERCENT))
  })

  it('returns zero for zero amount', () => {
    expect(calculatePlatformFeeAmount(0)).toBe(0)
  })
})

