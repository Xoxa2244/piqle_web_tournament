import { describe, it, expect } from 'vitest'
import { detectLeagueFamily, groupLeagueTitlesByFamily } from '@/lib/ai/league-family-detector'

describe('detectLeagueFamily', () => {
  describe('non-league titles return nulls', () => {
    it.each([
      'Open Play - Beginner (2.0 - 2.49)',
      'Drills and Skills Class',
      'Pickleball 101',
      'Saturday Round Robin',
    ])('null for %s', (title) => {
      expect(detectLeagueFamily(title).family).toBeNull()
    })

    it('null for empty input', () => {
      expect(detectLeagueFamily('').family).toBeNull()
      expect(detectLeagueFamily(null).family).toBeNull()
      expect(detectLeagueFamily(undefined).family).toBeNull()
    })
  })

  describe('IPC East real titles', () => {
    const cases: Array<[string, string, string | null, string | null]> = [
      // [title, expectedFamily, expectedSponsor, expectedSeasonTag]
      ['Casual League (Session 2)', 'Casual League', null, 'Session 2'],
      ['Casual League (Session 3)', 'Casual League', null, 'Session 3'],
      ['Casual League Jan/Feb 2026 (S1)', 'Casual League', null, 'S1'],
      ['Intermediate League (Session 2)', 'Intermediate League', null, 'Session 2'],
      ['Intermediate/Competitive League (Session 3)', 'Intermediate/Competitive League', null, 'Session 3'],
      ['DUPR League (Session 2)', 'DUPR League', null, 'Session 2'],
      ['DUPR League Jan/Feb 2026 (S1)', 'DUPR League', null, 'S1'],
      ['Mixed League (Session 2)', 'Mixed League', null, 'Session 2'],
      ['Mixed League Jan/Feb 2026 (S1)', 'Mixed League', null, 'S1'],
      ['Lilly League (Winter Session 2026)', 'Lilly League', null, 'Winter Session 2026'],
      ['Senior League provided by Indiana Physical Therapy', 'Senior League', 'Indiana Physical Therapy', null],
      ['Indiana Pickleball League Spring 2026', 'Indiana Pickleball League', null, null],
      ["Women's League Summer Session", "Women's League", null, null],
      ["Men's League Summer Session", "Men's League", null, null],
      ['Co-Ed League (Intermediate/Competitive) Summer Session', 'Co-Ed League', null, 'Intermediate/Competitive'],
    ]

    it.each(cases)('parses %s', (title, family, sponsor, season) => {
      const det = detectLeagueFamily(title)
      expect(det.family).toBe(family)
      expect(det.sponsor).toBe(sponsor)
      expect(det.rawSeasonTag).toBe(season)
    })
  })

  describe('sponsor extraction', () => {
    it('extracts "presented by Volair"', () => {
      const det = detectLeagueFamily('Learner League presented by Volair (Feb Session 2)')
      expect(det.family).toBe('Learner League')
      expect(det.sponsor).toBe('Volair')
      expect(det.rawSeasonTag).toBe('Feb Session 2')
    })

    it('extracts "provided by"', () => {
      const det = detectLeagueFamily('Senior League provided by Indiana Physical Therapy')
      expect(det.sponsor).toBe('Indiana Physical Therapy')
    })

    it('handles multiple words in sponsor name', () => {
      const det = detectLeagueFamily('Casual League presented by Acme Sports & Co')
      expect(det.sponsor).toBe('Acme Sports & Co')
      expect(det.family).toBe('Casual League')
    })

    it('strips trailing parenthetical from sponsor extraction', () => {
      const det = detectLeagueFamily('Demo League presented by Sponsor (Spring 2026)')
      expect(det.sponsor).toBe('Sponsor')
      expect(det.rawSeasonTag).toBe('Spring 2026')
      expect(det.family).toBe('Demo League')
    })
  })

  describe('season-marker stripping', () => {
    it.each([
      'Demo League (Jan)',
      'Demo League (Feb)',
      'Demo League (March)',
      'Demo League (April)',
      'Demo League (Spring)',
      'Demo League (Winter 2026)',
      'Demo League (Summer Session)',
      'Demo League (Session 1)',
      'Demo League (S1)',
    ])('strips parenthetical season from %s', (title) => {
      expect(detectLeagueFamily(title).family).toBe('Demo League')
    })

    it.each([
      'Demo League Jan/Feb 2026',
      'Demo League Spring 2026',
      'Demo League Summer Session',
      'Demo League January 2026',
      'Demo League March',
    ])('strips bare season tokens from %s', (title) => {
      expect(detectLeagueFamily(title).family).toBe('Demo League')
    })
  })
})

describe('groupLeagueTitlesByFamily', () => {
  it('groups multiple seasons of the same family', () => {
    const grouped = groupLeagueTitlesByFamily([
      { title: 'Casual League (Session 2)' },
      { title: 'Casual League (Session 3)' },
      { title: 'Casual League Jan/Feb 2026 (S1)' },
      { title: 'DUPR League (Session 2)' },
    ])
    expect(Object.keys(grouped).sort()).toEqual(['Casual League', 'DUPR League'])
    expect(grouped['Casual League'].titles).toHaveLength(3)
    expect(grouped['DUPR League'].titles).toHaveLength(1)
  })

  it('attaches sponsors to the family bucket', () => {
    const grouped = groupLeagueTitlesByFamily([
      { title: 'Learner League presented by Volair (Jan)' },
      { title: 'Learner League presented by Volair (Feb)' },
      { title: 'Learner League presented by adidas (March)' },
    ])
    const bucket = grouped['Learner League']
    expect(bucket).toBeDefined()
    expect(bucket.titles).toHaveLength(3)
    expect(Array.from(bucket.sponsors).sort()).toEqual(['Volair', 'adidas'])
  })

  it('skips non-league rows', () => {
    const grouped = groupLeagueTitlesByFamily([
      { title: 'Open Play - Beginner (2.0 - 2.49)' },
      { title: 'Casual League (Session 2)' },
    ])
    expect(Object.keys(grouped)).toEqual(['Casual League'])
  })
})
