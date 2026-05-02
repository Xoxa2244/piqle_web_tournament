/**
 * Unit tests for the courtreserve-sync helper utilities.
 *
 * Focused on the pure functions — full sync requires DB mocking which
 * is a much bigger lift. The helpers tested here protect the most
 * fragile boundary: parsing CR API responses where field names vary
 * (PascalCase vs camelCase, nullable, empty strings).
 */

import { describe, it, expect } from 'vitest'
import {
  pickFirstUrl,
  getEventSeriesAnchor,
  buildSeriesUrlIndex,
  resolveEventUrls,
} from '@/lib/connectors/courtreserve-sync'

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

describe('getEventSeriesAnchor', () => {
  it('prefers EventId (PascalCase)', () => {
    expect(getEventSeriesAnchor({ EventId: 1965811, EventDateId: 50495030 })).toBe('1965811')
  })

  it('falls back through camelCase + EventScheduleId', () => {
    expect(getEventSeriesAnchor({ eventId: 'evt_1' })).toBe('evt_1')
    expect(getEventSeriesAnchor({ EventScheduleId: 42 })).toBe('42')
    expect(getEventSeriesAnchor({ eventScheduleId: '99' })).toBe('99')
  })

  it('returns null when no anchor field is present', () => {
    expect(getEventSeriesAnchor({})).toBeNull()
    expect(getEventSeriesAnchor({ EventDateId: 50495030 })).toBeNull()
  })

  it('returns null on null/undefined/empty values', () => {
    expect(getEventSeriesAnchor({ EventId: null })).toBeNull()
    expect(getEventSeriesAnchor({ EventId: undefined })).toBeNull()
    expect(getEventSeriesAnchor({ EventId: '   ' })).toBeNull()
  })

  it('coerces numeric IDs to strings (Map keys must be strings)', () => {
    expect(getEventSeriesAnchor({ EventId: 0 })).toBe('0') // 0 is a valid id even though falsy
  })
})

describe('buildSeriesUrlIndex', () => {
  const clubId = 'club-1'

  it('indexes URL-bearing rows by EventId anchor', () => {
    const events = [
      { EventId: 1965811, PublicEventUrl: 'https://cr.example/series/1', SsoUrl: 'https://cr.example/sso/1' },
    ]
    const idx = buildSeriesUrlIndex(events, clubId)
    expect(idx.byAnchor.get('1965811')).toEqual({
      publicEventUrl: 'https://cr.example/series/1',
      memberSsoUrl: 'https://cr.example/sso/1',
    })
  })

  it('also indexes by clubId::title for fallback', () => {
    const events = [
      { EventId: 1965811, EventName: 'Open Play Advanced (4.0+) Verified', PublicEventUrl: 'https://cr.example/p' },
    ]
    const idx = buildSeriesUrlIndex(events, clubId)
    expect(idx.byTitleKey.get('club-1::Open Play Advanced (4.0+) Verified')).toEqual({
      publicEventUrl: 'https://cr.example/p',
      memberSsoUrl: null,
    })
  })

  it('skips rows without any URL', () => {
    const events = [{ EventId: 99, EventName: 'Empty Event' }]
    const idx = buildSeriesUrlIndex(events, clubId)
    expect(idx.byAnchor.size).toBe(0)
    expect(idx.byTitleKey.size).toBe(0)
  })

  it('merges URLs across multiple rows for the same anchor (PublicEventUrl from one, SsoUrl from another)', () => {
    const events = [
      { EventId: 1, PublicEventUrl: 'https://cr.example/p' },
      { EventId: 1, SsoUrl: 'https://cr.example/sso' },
    ]
    const idx = buildSeriesUrlIndex(events, clubId)
    expect(idx.byAnchor.get('1')).toEqual({
      publicEventUrl: 'https://cr.example/p',
      memberSsoUrl: 'https://cr.example/sso',
    })
  })

  it('keeps first non-null URL when multiple rows have same anchor with different URLs', () => {
    const events = [
      { EventId: 1, PublicEventUrl: 'https://cr.example/first' },
      { EventId: 1, PublicEventUrl: 'https://cr.example/second' },
    ]
    const idx = buildSeriesUrlIndex(events, clubId)
    expect(idx.byAnchor.get('1')?.publicEventUrl).toBe('https://cr.example/first')
  })

  it('namespaces title keys by clubId (no cross-club leakage)', () => {
    const events = [
      { EventId: 1, EventName: 'Open Play', PublicEventUrl: 'https://cr.example/club-a' },
    ]
    const idx = buildSeriesUrlIndex(events, 'club-a')
    expect(idx.byTitleKey.get('club-a::Open Play')).toBeDefined()
    expect(idx.byTitleKey.get('club-b::Open Play')).toBeUndefined()
  })

  it('handles empty/missing rawEvents gracefully', () => {
    const idx = buildSeriesUrlIndex([] as any[], clubId)
    expect(idx.byAnchor.size).toBe(0)
    expect(idx.byTitleKey.size).toBe(0)
  })
})

describe('resolveEventUrls', () => {
  const clubId = 'club-1'

  it('uses event own URL when present (no fallback needed)', () => {
    const idx = buildSeriesUrlIndex([], clubId)
    const result = resolveEventUrls(
      { PublicEventUrl: 'https://cr.example/own', SsoUrl: 'https://cr.example/sso' },
      clubId,
      idx,
    )
    expect(result).toEqual({
      publicEventUrl: 'https://cr.example/own',
      memberSsoUrl: 'https://cr.example/sso',
    })
  })

  it('falls back to series-anchor URL when own URL missing (the slot-filler hot path)', () => {
    // Realistic CR shape: instance row has EventDateId + EventId back-pointer + registrations,
    // but PublicEventUrl is empty (CR only puts URL on the series row).
    const seriesRow = {
      EventId: 1965811,
      EventName: 'Open Play Advanced (4.0+) Verified',
      PublicEventUrl: 'https://app.courtreserve.com/online/publicbookings/13730?eventId=19',
      SsoUrl: 'https://app.courtreserve.com/online/sso/19',
    }
    const instanceRow = {
      EventDateId: 50495030,
      EventId: 1965811, // ← back-pointer to series; this is what the index uses
      EventName: 'Open Play Advanced (4.0+) Verified',
      RegisteredCount: 6,
    }
    const idx = buildSeriesUrlIndex([seriesRow], clubId)
    const result = resolveEventUrls(instanceRow, clubId, idx)
    expect(result.publicEventUrl).toBe('https://app.courtreserve.com/online/publicbookings/13730?eventId=19')
    expect(result.memberSsoUrl).toBe('https://app.courtreserve.com/online/sso/19')
  })

  it('falls back to clubId+title match when no series anchor on instance', () => {
    // Defensive: if CR drops EventId from the instance row, title still works
    // because series and instance always share the human-facing event name.
    const seriesRow = {
      EventId: 1965811,
      EventName: 'Cosmic Pickleball',
      PublicEventUrl: 'https://cr.example/cosmic',
    }
    const instanceRow = {
      EventDateId: 50495030,
      // no EventId at all
      EventName: 'Cosmic Pickleball',
      RegisteredCount: 12,
    }
    const idx = buildSeriesUrlIndex([seriesRow], clubId)
    const result = resolveEventUrls(instanceRow, clubId, idx)
    expect(result.publicEventUrl).toBe('https://cr.example/cosmic')
  })

  it('returns nulls when nothing matches', () => {
    const idx = buildSeriesUrlIndex([], clubId)
    const result = resolveEventUrls(
      { EventDateId: 50495030, EventName: 'Mystery Event' },
      clubId,
      idx,
    )
    expect(result).toEqual({ publicEventUrl: null, memberSsoUrl: null })
  })

  it('does not cross-club: instance in club-b cannot inherit from series in club-a', () => {
    const seriesRow = {
      EventId: 1965811,
      EventName: 'Open Play',
      PublicEventUrl: 'https://cr.example/club-a-only',
    }
    // Same title, but indexed to club-a. Instance in club-b should not match by title.
    const idx = buildSeriesUrlIndex([seriesRow], 'club-a')
    const instanceInClubB = { EventDateId: 99, EventName: 'Open Play' }
    const result = resolveEventUrls(instanceInClubB, 'club-b', idx)
    expect(result.publicEventUrl).toBeNull()
  })

  it('partial fallback: anchor gives PublicEventUrl, instance has its own SsoUrl', () => {
    const seriesRow = {
      EventId: 1,
      EventName: 'Mixed',
      PublicEventUrl: 'https://cr.example/series-public',
      // no SSO on series
    }
    const instanceRow = {
      EventDateId: 999,
      EventId: 1,
      EventName: 'Mixed',
      SsoUrl: 'https://cr.example/instance-sso',
    }
    const idx = buildSeriesUrlIndex([seriesRow, instanceRow], clubId)
    const result = resolveEventUrls(instanceRow, clubId, idx)
    expect(result.publicEventUrl).toBe('https://cr.example/series-public')
    expect(result.memberSsoUrl).toBe('https://cr.example/instance-sso')
  })
})
