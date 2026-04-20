/**
 * Unit tests for the white-label sending-domain helpers.
 *
 * Pure-function layer (validation, DNS record building, club From:
 * resolution) — the Mandrill API calls are tested indirectly via the
 * tRPC layer. We're guarding the inputs/outputs that end up in front
 * of a club admin: bad input must fail loudly, good input must produce
 * exactly the DNS-spec strings the admin will paste into their provider.
 */

import { describe, it, expect } from 'vitest'
import {
  validateSendingDomain,
  isLikelyRootDomain,
  buildAdminDnsRecords,
  buildClubFromAddress,
} from '@/lib/email-sending-domain'

describe('validateSendingDomain', () => {
  it('accepts a clean subdomain', () => {
    expect(validateSendingDomain('mail.pickleballclub.com')).toEqual({
      ok: true,
      normalized: 'mail.pickleballclub.com',
    })
  })

  it('accepts a root domain (valid but subtly discouraged elsewhere)', () => {
    expect(validateSendingDomain('pickleballclub.com').ok).toBe(true)
  })

  it('trims, lowercases, strips scheme + path', () => {
    expect(validateSendingDomain('  HTTPS://Mail.Foo.com/whatever  ')).toEqual({
      ok: true,
      normalized: 'mail.foo.com',
    })
  })

  it('rejects empty input', () => {
    expect(validateSendingDomain('').ok).toBe(false)
    expect(validateSendingDomain('   ').ok).toBe(false)
  })

  it('rejects IP addresses', () => {
    const result = validateSendingDomain('192.168.1.1')
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('IP')
  })

  it('rejects TLD-only input ("com")', () => {
    expect(validateSendingDomain('com').ok).toBe(false)
  })

  it('rejects obviously malformed strings', () => {
    expect(validateSendingDomain('not a domain').ok).toBe(false)
    expect(validateSendingDomain('foo..bar.com').ok).toBe(false)
    expect(validateSendingDomain('-foo.com').ok).toBe(false)
  })
})

describe('isLikelyRootDomain', () => {
  it('flags root domain', () => {
    expect(isLikelyRootDomain('pickleballclub.com')).toBe(true)
  })
  it('does NOT flag subdomain', () => {
    expect(isLikelyRootDomain('mail.pickleballclub.com')).toBe(false)
    expect(isLikelyRootDomain('a.b.c.com')).toBe(false)
  })
})

describe('buildAdminDnsRecords', () => {
  it('emits SPF, DKIM, Return-Path with correct hosts', () => {
    const records = buildAdminDnsRecords('mail.pickleballclub.com')
    expect(records).toHaveLength(3)
    const byKind = Object.fromEntries(records.map((r) => [r.kind, r]))

    expect(byKind.SPF.type).toBe('TXT')
    expect(byKind.SPF.host).toBe('mail.pickleballclub.com')
    expect(byKind.SPF.value).toContain('include:spf.mandrillapp.com')

    expect(byKind.DKIM.type).toBe('TXT')
    expect(byKind.DKIM.host).toBe('mandrill._domainkey.mail.pickleballclub.com')
    expect(byKind.DKIM.value).toContain('v=DKIM1')

    expect(byKind.RETURN_PATH.type).toBe('CNAME')
    expect(byKind.RETURN_PATH.host).toBe('mail.pickleballclub.com')
    expect(byKind.RETURN_PATH.value).toBe('mandrillapp.com')
  })

  it('honors MANDRILL_DKIM_PUBLIC_KEY env override', () => {
    const original = process.env.MANDRILL_DKIM_PUBLIC_KEY
    process.env.MANDRILL_DKIM_PUBLIC_KEY = 'v=DKIM1; custom=key'
    try {
      const [_, dkim] = buildAdminDnsRecords('x.foo.com')
      expect(dkim.value).toBe('v=DKIM1; custom=key')
    } finally {
      if (original === undefined) delete process.env.MANDRILL_DKIM_PUBLIC_KEY
      else process.env.MANDRILL_DKIM_PUBLIC_KEY = original
    }
  })
})

describe('buildClubFromAddress', () => {
  const baseClub = {
    name: 'Austin Pickleball Club',
    sendingDomain: 'mail.austinpickleball.com',
    sendingDomainEnabled: true,
    sendingDomainVerifiedAt: new Date('2026-04-15'),
    sendingDomainFromName: null,
    sendingDomainLocalPart: 'campaigns',
  }

  it('returns the custom From when verified + enabled', () => {
    expect(buildClubFromAddress(baseClub)).toEqual({
      fromEmail: 'campaigns@mail.austinpickleball.com',
      fromName: 'Austin Pickleball Club',
    })
  })

  it('prefers sendingDomainFromName over club name when present', () => {
    const result = buildClubFromAddress({
      ...baseClub,
      sendingDomainFromName: 'The Austin PBC Team',
    })
    expect(result?.fromName).toBe('The Austin PBC Team')
  })

  it('honors custom localPart', () => {
    const result = buildClubFromAddress({
      ...baseClub,
      sendingDomainLocalPart: 'hello',
    })
    expect(result?.fromEmail).toBe('hello@mail.austinpickleball.com')
  })

  it('defaults localPart to "campaigns" when empty/whitespace', () => {
    const result = buildClubFromAddress({
      ...baseClub,
      sendingDomainLocalPart: '   ',
    })
    expect(result?.fromEmail).toBe('campaigns@mail.austinpickleball.com')
  })

  it('returns null when domain is not set', () => {
    expect(buildClubFromAddress({ ...baseClub, sendingDomain: null })).toBeNull()
  })

  it('returns null when not enabled (prevents premature send-from)', () => {
    expect(buildClubFromAddress({ ...baseClub, sendingDomainEnabled: false })).toBeNull()
  })

  it('returns null when not verified (gate against unverified sends)', () => {
    expect(buildClubFromAddress({ ...baseClub, sendingDomainVerifiedAt: null })).toBeNull()
  })
})
