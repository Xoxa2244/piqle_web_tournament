import { describe, expect, it } from 'vitest'
import { isStripeConnectPayoutsActive } from '@/lib/stripeConnect'

const account = (overrides: Record<string, unknown> = {}) =>
  ({
    details_submitted: true,
    charges_enabled: true,
    payouts_enabled: true,
    capabilities: {
      transfers: 'active',
    },
    ...overrides,
  }) as any

describe('stripeConnect', () => {
  it('requires active transfers before using a Connect destination', () => {
    expect(isStripeConnectPayoutsActive(account())).toBe(true)
    expect(
      isStripeConnectPayoutsActive(
        account({
          capabilities: {
            transfers: 'inactive',
          },
        })
      )
    ).toBe(false)
  })

  it('does not treat incomplete or deleted accounts as payout active', () => {
    expect(isStripeConnectPayoutsActive(account({ payouts_enabled: false }))).toBe(false)
    expect(isStripeConnectPayoutsActive({ id: 'acct_deleted', deleted: true } as any)).toBe(false)
  })
})
