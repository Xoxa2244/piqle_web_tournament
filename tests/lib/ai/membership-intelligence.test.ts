import { describe, expect, it } from 'vitest'
import { normalizeMembership, resolveMembershipMappings } from '@/lib/ai/membership-intelligence'

describe('membership intelligence', () => {
  it('returns missing signal when no membership data exists', () => {
    const normalized = normalizeMembership({})

    expect(normalized.normalizedStatus).toBe('unknown')
    expect(normalized.normalizedType).toBe('unknown')
    expect(normalized.signal).toBe('missing')
    expect(normalized.confidence).toBe(0)
  })

  it('normalizes active monthly memberships into a strong signal', () => {
    const normalized = normalizeMembership({
      membershipType: 'Open Play Pass - $49.99/Month',
      membershipStatus: 'Currently Active',
    })

    expect(normalized.normalizedStatus).toBe('active')
    expect(normalized.normalizedType).toBe('monthly')
    expect(normalized.signal).toBe('strong')
    expect(normalized.confidence).toBeGreaterThanOrEqual(80)
  })

  it('treats explicit no-membership status as a strong signal', () => {
    const normalized = normalizeMembership({
      membershipStatus: 'No Membership',
    })

    expect(normalized.normalizedStatus).toBe('none')
    expect(normalized.signal).toBe('strong')
    expect(normalized.confidence).toBeGreaterThanOrEqual(70)
  })

  it('downgrades conflicting membership data to a weak signal', () => {
    const normalized = normalizeMembership({
      membershipType: 'VIP Unlimited',
      membershipStatus: 'No Membership',
    })

    expect(normalized.normalizedType).toBe('unlimited')
    expect(normalized.normalizedStatus).toBe('none')
    expect(normalized.signal).toBe('weak')
  })

  it('applies club-specific membership mappings before fallback heuristics', () => {
    const membershipMappings = resolveMembershipMappings({
      intelligence: {
        membershipMappings: {
          rules: [
            {
              rawLabel: 'Founders Circle',
              source: 'type',
              matchMode: 'contains',
              normalizedType: 'unlimited',
              normalizedStatus: 'active',
            },
          ],
        },
      },
    })

    const normalized = normalizeMembership({
      membershipType: 'Founders Circle - Legacy',
      membershipStatus: 'Currently Active',
      membershipMappings,
    })

    expect(normalized.normalizedType).toBe('unlimited')
    expect(normalized.normalizedStatus).toBe('active')
    expect(normalized.mappedByClubRule).toBe(true)
    expect(normalized.matchedRuleLabel).toBe('Founders Circle')
    expect(normalized.signal).toBe('strong')
  })
})
