/**
 * Unit tests for the courtreserve-sync helper utilities.
 *
 * Focused on the pure functions — full sync requires DB mocking which
 * is a much bigger lift. The helpers tested here protect the most
 * fragile boundary: parsing CR API responses where field names vary
 * (PascalCase vs camelCase, nullable, empty strings).
 */

import { describe, it, expect } from 'vitest'
import { pickFirstUrl } from '@/lib/connectors/courtreserve-sync'

describe('pickFirstUrl', () => {
  it('returns the first non-empty URL', () => {
    expect(pickFirstUrl('https://example.com/a', 'https://example.com/b')).toBe(
      'https://example.com/a',
    )
  })

  it('falls through nullish values', () => {
    expect(pickFirstUrl(null, undefined, 'https://example.com/x')).toBe(
      'https://example.com/x',
    )
  })

  it('falls through empty/whitespace strings', () => {
    expect(pickFirstUrl('', '   ', 'https://example.com/y')).toBe(
      'https://example.com/y',
    )
  })

  it('rejects non-URL strings (no http(s) prefix)', () => {
    // CR sometimes serialises bad data ("not_set", "n/a") — guard against
    // those becoming bookingUrls in customer emails.
    expect(pickFirstUrl('not_set', 'n/a', 'something')).toBeNull()
  })

  it('accepts both http and https', () => {
    expect(pickFirstUrl('http://example.com/legacy')).toBe(
      'http://example.com/legacy',
    )
    expect(pickFirstUrl('https://example.com/secure')).toBe(
      'https://example.com/secure',
    )
  })

  it('case-insensitive on the protocol', () => {
    expect(pickFirstUrl('HTTPS://EXAMPLE.COM/X')).toBe('HTTPS://EXAMPLE.COM/X')
  })

  it('returns null when nothing matches', () => {
    expect(pickFirstUrl()).toBeNull()
    expect(pickFirstUrl(null, undefined, '')).toBeNull()
    expect(pickFirstUrl('not_set', 'foo', 'bar')).toBeNull()
  })

  it('preserves intended URL even when surrounded by whitespace', () => {
    expect(pickFirstUrl('  https://example.com/padded  ')).toBe(
      'https://example.com/padded',
    )
  })
})
