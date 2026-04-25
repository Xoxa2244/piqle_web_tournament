/**
 * Unit tests for `lib/phone-normalize.ts`.
 *
 * The mission of this module is "all phones in the DB end up E.164, or
 * end up null — no half-cleaned formats". These tests pin the contract
 * across the formats we've seen come out of CourtReserve API +
 * CourtReserve Excel exports + onboarding wizard typed input.
 *
 * Real-world samples drawn from CourtReserve sample dumps and Twilio's
 * own test suite. We assert E.164 output for valid inputs and `null`
 * for everything we want callers to skip.
 */

import { describe, it, expect } from 'vitest'
import {
  normalizePhone,
  normalizePhoneOrRaw,
  phonesMatch,
} from '@/lib/phone-normalize'

describe('normalizePhone', () => {
  // ── Valid US numbers (default country) ────────────────────────────

  it('accepts 10-digit US number with parens + spaces', () => {
    expect(normalizePhone('(415) 555-0123')).toBe('+14155550123')
  })

  it('accepts 10-digit US number with dashes', () => {
    expect(normalizePhone('415-555-0123')).toBe('+14155550123')
  })

  it('accepts 10-digit US number with dots', () => {
    expect(normalizePhone('415.555.0123')).toBe('+14155550123')
  })

  it('accepts 10-digit US number with no separators', () => {
    expect(normalizePhone('4155550123')).toBe('+14155550123')
  })

  it('accepts US number with leading +1', () => {
    expect(normalizePhone('+1 415-555-0123')).toBe('+14155550123')
  })

  it('accepts US number with leading 1 (no plus)', () => {
    expect(normalizePhone('1-415-555-0123')).toBe('+14155550123')
  })

  it('strips trailing whitespace', () => {
    expect(normalizePhone('  4155550123  ')).toBe('+14155550123')
  })

  // ── International ─────────────────────────────────────────────────

  it('accepts UK number with explicit +44', () => {
    expect(normalizePhone('+44 20 7946 0958')).toBe('+442079460958')
  })

  it('respects defaultCountry override for UK local format', () => {
    // UK mobile in local format — needs explicit country to parse.
    expect(normalizePhone('07911 123456', 'GB')).toBe('+447911123456')
  })

  it('accepts Canadian number under default US country (NANP shared)', () => {
    expect(normalizePhone('(416) 555-0123')).toBe('+14165550123')
  })

  // ── Invalid inputs ────────────────────────────────────────────────

  it('returns null for empty string', () => {
    expect(normalizePhone('')).toBeNull()
  })

  it('returns null for whitespace only', () => {
    expect(normalizePhone('   ')).toBeNull()
  })

  it('returns null for null/undefined', () => {
    expect(normalizePhone(null)).toBeNull()
    expect(normalizePhone(undefined)).toBeNull()
  })

  it('returns null for non-numeric gibberish', () => {
    expect(normalizePhone('abc')).toBeNull()
    expect(normalizePhone('not a phone')).toBeNull()
  })

  it('returns null for too short (5 digits)', () => {
    expect(normalizePhone('12345')).toBeNull()
  })

  it('returns null for invalid country code', () => {
    expect(normalizePhone('+999 12345678')).toBeNull()
  })

  it('returns null for impossible US area code (000)', () => {
    // libphonenumber-js validates against real numbering plans.
    expect(normalizePhone('(000) 555-0123')).toBeNull()
  })

  // ── Real-world ugliness ───────────────────────────────────────────

  it('handles excel cell that is purely numeric (cells often come back as numbers)', () => {
    // Excel sometimes loses the leading 0 / + and gives us a number
    // cast to string. Valid 10-digit US still parses.
    expect(normalizePhone('4155550123')).toBe('+14155550123')
  })

  it('drops embedded extension like x1234 (we only store the main number)', () => {
    // We don't preserve extensions today — phone column is plain text,
    // SMS providers ignore extensions. Validate the main number wins.
    const out = normalizePhone('+1 415-555-0123 x1234')
    expect(out).toBe('+14155550123')
  })

  it('drops "ext" syntax', () => {
    const out = normalizePhone('415-555-0123 ext 567')
    expect(out).toBe('+14155550123')
  })
})

describe('normalizePhoneOrRaw', () => {
  it('returns normalised when valid', () => {
    expect(normalizePhoneOrRaw('(415) 555-0123')).toBe('+14155550123')
  })

  it('returns original raw string when invalid (debug helper)', () => {
    expect(normalizePhoneOrRaw('abc')).toBe('abc')
  })

  it('returns null when input is null', () => {
    expect(normalizePhoneOrRaw(null)).toBeNull()
  })
})

describe('phonesMatch', () => {
  it('matches the same number across formats', () => {
    expect(phonesMatch('(415) 555-0123', '+1 415-555-0123')).toBe(true)
    expect(phonesMatch('4155550123', '415.555.0123')).toBe(true)
  })

  it('does not match different numbers', () => {
    expect(phonesMatch('(415) 555-0123', '(415) 555-0124')).toBe(false)
  })

  it('returns false when either side is null', () => {
    expect(phonesMatch(null, '+14155550123')).toBe(false)
    expect(phonesMatch('+14155550123', null)).toBe(false)
    expect(phonesMatch(null, null)).toBe(false)
  })

  it('returns false when either side is unparseable', () => {
    expect(phonesMatch('abc', '+14155550123')).toBe(false)
  })
})
