import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { assertSuperadminAccess, resolveSuperadminAccess } from '@/server/utils/superadminAccess'

const ORIGINAL_EMAIL_ALLOWLIST = process.env.SUPERADMIN_EMAIL_ALLOWLIST
const ORIGINAL_USER_ID_ALLOWLIST = process.env.SUPERADMIN_USER_ID_ALLOWLIST

describe('superadminAccess', () => {
  beforeEach(() => {
    delete process.env.SUPERADMIN_EMAIL_ALLOWLIST
    delete process.env.SUPERADMIN_USER_ID_ALLOWLIST
  })

  afterAll(() => {
    process.env.SUPERADMIN_EMAIL_ALLOWLIST = ORIGINAL_EMAIL_ALLOWLIST
    process.env.SUPERADMIN_USER_ID_ALLOWLIST = ORIGINAL_USER_ID_ALLOWLIST
  })

  it('allows an email allowlisted superadmin', () => {
    process.env.SUPERADMIN_EMAIL_ALLOWLIST = 'owner@iqsport.ai'

    const access = resolveSuperadminAccess({
      session: {
        user: {
          id: 'user-1',
          email: 'owner@iqsport.ai',
          name: 'Owner',
        },
      },
    })

    expect(access.allowed).toBe(true)
    expect(access.matchedBy).toBe('email')
    expect(access.reason).toBeNull()
  })

  it('fails closed when no allowlist is configured', () => {
    const access = resolveSuperadminAccess({
      session: {
        user: {
          id: 'user-2',
          email: 'admin@iqsport.ai',
        },
      },
    })

    expect(access.allowed).toBe(false)
    expect(access.envConfigured).toBe(false)
    expect(access.reason).toContain('allowlist')
  })

  it('throws when a signed-in user is not allowlisted', () => {
    process.env.SUPERADMIN_USER_ID_ALLOWLIST = 'user-1'

    expect(() =>
      assertSuperadminAccess({
        session: {
          user: {
            id: 'user-2',
            email: 'other@iqsport.ai',
          },
        },
      }),
    ).toThrow(/allowlisted/i)
  })
})
