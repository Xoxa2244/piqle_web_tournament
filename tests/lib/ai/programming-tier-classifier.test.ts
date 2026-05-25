import { describe, expect, it } from 'vitest'

import {
  classifyProgrammingTier,
  PROGRAMMING_TIER_META,
  getTierMeta,
} from '@/lib/ai/programming-tier-classifier'

/**
 * Tests for the programming-tier classifier.
 *
 * Strategy: anchor every assertion to real session titles pulled from
 * production CR data (IPC East, week of 2026-05-18). Failing cases here
 * surface concrete gaps in the regex set — see how Private Lessons land
 * in T1_CORE before this commit's regex expansion.
 *
 * Acceptance per roadmap P1.4: ≥85% of real IPC East sessions classify
 * into the operator-expected tier. We encode the expected tier per
 * canonical title and let the test suite be the sample audit.
 */

describe('classifyProgrammingTier — IPC East canonical titles', () => {
  // ─── T1_CORE: Open Play (the workhorse) ─────────────────────────────
  describe('T1_CORE — Open Play', () => {
    it('classifies verified Open Play (Competitive) as T1', () => {
      expect(
        classifyProgrammingTier({
          title: 'Verified Open Play - Competitive (3.5 - 3.99)',
          format: 'OPEN_PLAY',
        }),
      ).toBe('T1_CORE')
    })

    it('classifies verified Open Play (Casual) as T1', () => {
      expect(
        classifyProgrammingTier({
          title: 'Verified Open Play - Casual (2.5 - 2.99)',
          format: 'OPEN_PLAY',
        }),
      ).toBe('T1_CORE')
    })

    it('classifies verified Open Play (Intermediate) as T1', () => {
      expect(
        classifyProgrammingTier({
          title: 'Verified Open Play - Intermediate (3.0 - 3.49)',
          format: 'OPEN_PLAY',
        }),
      ).toBe('T1_CORE')
    })

    it('classifies verified Open Play (Advanced) as T1', () => {
      expect(
        classifyProgrammingTier({
          title: 'Verified Open Play - Advanced (4.0)',
          format: 'OPEN_PLAY',
        }),
      ).toBe('T1_CORE')
    })

    it('classifies beginner Open Play (sub-bucket: P101) as T1', () => {
      // P101 sub-bucket inside T1 is handled by isIntroSession() in
      // intelligence.ts using the format/title — tier itself is still T1.
      expect(
        classifyProgrammingTier({
          title: 'Open Play - Beginner (2.0 - 2.49)',
          format: 'OPEN_PLAY',
        }),
      ).toBe('T1_CORE')
    })

    it('classifies generic Doubles court reservation as T1', () => {
      expect(
        classifyProgrammingTier({
          title: 'Doubles - Court #6 (IPC East)',
          format: 'OPEN_PLAY',
        }),
      ).toBe('T1_CORE')
    })

    it('classifies generic Singles court reservation as T1', () => {
      expect(
        classifyProgrammingTier({
          title: 'Singles - Court #4 (IPC East)',
          format: 'OPEN_PLAY',
        }),
      ).toBe('T1_CORE')
    })
  })

  // ─── T1_CORE: Classes & Drills (still T1, sub-bucket via format) ────
  describe('T1_CORE — Classes & Drills', () => {
    it('classifies "Drills and Skills Class" (beginner/casual) as T1', () => {
      // It's a basic skills class — T1 Classes & Clinics sub-bucket,
      // not T6 Premium. The format=DRILL/CLINIC routes it to the
      // correct T1 sub-bucket in intelligence.ts.
      expect(
        classifyProgrammingTier({
          title: 'Drills and Skills Class (2.0-2.99 Beginner / Casual)',
          format: 'DRILL',
        }),
      ).toBe('T1_CORE')
    })
  })

  // ─── T2_LEAGUE ──────────────────────────────────────────────────────
  describe('T2_LEAGUE', () => {
    it('classifies any session with format=LEAGUE_PLAY as T2', () => {
      expect(
        classifyProgrammingTier({
          title: 'Spring Doubles League — Tuesday Night',
          format: 'LEAGUE_PLAY',
        }),
      ).toBe('T2_LEAGUE')
    })

    it('classifies title containing "league" as T2 even when format=OPEN_PLAY', () => {
      // Happens when CR's reservationType is generic but the title
      // makes the league context explicit.
      expect(
        classifyProgrammingTier({
          title: 'Summer League Playoffs',
          format: 'OPEN_PLAY',
        }),
      ).toBe('T2_LEAGUE')
    })

    it('classifies "IPL Team Practice" as T2 (league-affiliated practice)', () => {
      // Real IPC East data: IPL = Indianapolis Pickleball League. Team
      // practices for league players belong with the league, not the
      // open play bucket. Currently fails because regex requires the
      // literal word "league".
      expect(
        classifyProgrammingTier({
          title: 'IPL Team Practice',
          format: 'OPEN_PLAY',
        }),
      ).toBe('T2_LEAGUE')
    })
  })

  // ─── T3_SIGNATURE ───────────────────────────────────────────────────
  describe('T3_SIGNATURE — recurring weekly hooks', () => {
    it('classifies "Round Robin Tuesday" as T3', () => {
      expect(classifyProgrammingTier({ title: 'Round Robin Tuesday', format: 'OPEN_PLAY' })).toBe(
        'T3_SIGNATURE',
      )
    })

    it('classifies "Moneyball Doubles Friday" as T3', () => {
      expect(
        classifyProgrammingTier({ title: 'Moneyball Doubles Friday', format: 'OPEN_PLAY' }),
      ).toBe('T3_SIGNATURE')
    })

    it('classifies "King of the Court" as T3', () => {
      expect(
        classifyProgrammingTier({ title: 'King of the Court — Saturday', format: 'OPEN_PLAY' }),
      ).toBe('T3_SIGNATURE')
    })

    it('classifies "DUPR Event" as T3', () => {
      expect(classifyProgrammingTier({ title: 'DUPR Event - 3.5+', format: 'OPEN_PLAY' })).toBe(
        'T3_SIGNATURE',
      )
    })

    it('classifies "Mix & Match Doubles" as T3', () => {
      expect(
        classifyProgrammingTier({ title: 'Mix & Match Doubles Night', format: 'OPEN_PLAY' }),
      ).toBe('T3_SIGNATURE')
    })
  })

  // ─── T4_SOCIAL ──────────────────────────────────────────────────────
  describe('T4_SOCIAL — themed / charity / community', () => {
    it('classifies "Cosmic Pickleball Night" as T4', () => {
      expect(
        classifyProgrammingTier({ title: 'Cosmic Pickleball Night', format: 'SOCIAL' }),
      ).toBe('T4_SOCIAL')
    })

    it('classifies "Trivia Night" as T4', () => {
      expect(classifyProgrammingTier({ title: 'Pickleball Trivia Night', format: 'SOCIAL' })).toBe(
        'T4_SOCIAL',
      )
    })

    it('classifies Halloween theme night as T4', () => {
      expect(
        classifyProgrammingTier({ title: 'Halloween Pickleball Party', format: 'SOCIAL' }),
      ).toBe('T4_SOCIAL')
    })

    it('classifies a charity event as T4', () => {
      expect(
        classifyProgrammingTier({ title: 'Charity Round Robin — Cancer Society', format: 'SOCIAL' }),
      ).toBe('T4_SOCIAL')
    })
  })

  // ─── T5_TOURNAMENT ──────────────────────────────────────────────────
  describe('T5_TOURNAMENT', () => {
    it('classifies an explicit tournament as T5', () => {
      expect(
        classifyProgrammingTier({ title: 'Spring Tournament 2026', format: 'OPEN_PLAY' }),
      ).toBe('T5_TOURNAMENT')
    })

    it('classifies "Winter Slam" branded event as T5', () => {
      expect(classifyProgrammingTier({ title: 'Winter Slam Doubles', format: 'OPEN_PLAY' })).toBe(
        'T5_TOURNAMENT',
      )
    })

    it('classifies "Rally for Riley" branded event as T5', () => {
      expect(
        classifyProgrammingTier({ title: 'Rally for Riley Championship', format: 'OPEN_PLAY' }),
      ).toBe('T5_TOURNAMENT')
    })

    it('classifies a regional championship as T5', () => {
      expect(
        classifyProgrammingTier({ title: 'Midwest Championship 4.0+', format: 'OPEN_PLAY' }),
      ).toBe('T5_TOURNAMENT')
    })
  })

  // ─── T6_PREMIUM ─────────────────────────────────────────────────────
  describe('T6_PREMIUM — private / specialty / intensive', () => {
    it('classifies "Private Lesson for 1" as T6 (real IPC East title)', () => {
      // Real IPC East data — 6 instances in the May 18-24 week.
      // Currently misclassified as T1, which made peakUtilization
      // shoot to 219% (max_players=1, registrants>=2).
      expect(
        classifyProgrammingTier({
          title: 'Private Lesson for 1 - Court #9 (IPC East)',
          format: 'OPEN_PLAY',
        }),
      ).toBe('T6_PREMIUM')
    })

    it('classifies "Private Lesson Direct Pay" as T6 (real IPC East title)', () => {
      expect(
        classifyProgrammingTier({
          title: 'Private Lesson Direct Pay - Court #6 (IPC East)',
          format: 'OPEN_PLAY',
        }),
      ).toBe('T6_PREMIUM')
    })

    it('classifies "Private Lesson for 3+" as T6 (real IPC East title)', () => {
      expect(
        classifyProgrammingTier({
          title: 'Private Lesson for 3+ - Court #8 (IPC East)',
          format: 'OPEN_PLAY',
        }),
      ).toBe('T6_PREMIUM')
    })

    it('classifies "1-on-1 Coaching" as T6', () => {
      expect(
        classifyProgrammingTier({ title: '1-on-1 Coaching - Court #2', format: 'OPEN_PLAY' }),
      ).toBe('T6_PREMIUM')
    })

    it('classifies "1 on 1 Session" as T6', () => {
      expect(
        classifyProgrammingTier({ title: '1 on 1 Session with Pro', format: 'OPEN_PLAY' }),
      ).toBe('T6_PREMIUM')
    })

    it('classifies "Intensive Training" as T6 (real IPC East title)', () => {
      // VamosPickle Intensive Training (All Levels) — 2 sessions/week.
      // Premium content brand, intensive format.
      expect(
        classifyProgrammingTier({
          title: 'VamosPickle Intensive Training (All Levels)',
          format: 'OPEN_PLAY',
        }),
      ).toBe('T6_PREMIUM')
    })

    it('classifies "Pickleball IQ & Strategy" as T6 (real IPC East title)', () => {
      // Advanced strategy clinic (3.5+ requirement). Premium content
      // pitched at experienced players, not the T1 Classes default.
      expect(
        classifyProgrammingTier({
          title: 'Pickleball IQ & Strategy (3.5+)',
          format: 'OPEN_PLAY',
        }),
      ).toBe('T6_PREMIUM')
    })

    it('classifies "Visiting Pro Clinic" as T6', () => {
      expect(
        classifyProgrammingTier({ title: 'Visiting Pro Clinic with John Doe', format: 'CLINIC' }),
      ).toBe('T6_PREMIUM')
    })

    it('classifies "Masterclass" as T6', () => {
      expect(
        classifyProgrammingTier({ title: 'Doubles Masterclass — Advanced', format: 'CLINIC' }),
      ).toBe('T6_PREMIUM')
    })

    it('classifies "Advanced Clinic" as T6', () => {
      expect(
        classifyProgrammingTier({ title: 'Advanced Clinic — Strategy & Tactics', format: 'CLINIC' }),
      ).toBe('T6_PREMIUM')
    })
  })

  // ─── T7_YOUTH ───────────────────────────────────────────────────────
  describe('T7_YOUTH — kids / junior / academy', () => {
    it('classifies "Junior Academy" as T7', () => {
      expect(classifyProgrammingTier({ title: 'Junior Academy Mondays', format: 'CLINIC' })).toBe(
        'T7_YOUTH',
      )
    })

    it('classifies "Kids Clinic" as T7', () => {
      expect(classifyProgrammingTier({ title: 'Kids Clinic — Saturday', format: 'CLINIC' })).toBe(
        'T7_YOUTH',
      )
    })

    it('classifies "Youth Tournament" as T7 (youth beats tournament)', () => {
      // Order matters: T7 is evaluated before T5 so a "Youth Tournament"
      // is correctly tracked as part of the youth pipeline (T7), not as
      // a competitive tournament (T5).
      expect(
        classifyProgrammingTier({ title: 'Youth Tournament Saturday', format: 'OPEN_PLAY' }),
      ).toBe('T7_YOUTH')
    })

    it('classifies "Teen Drills" as T7', () => {
      expect(classifyProgrammingTier({ title: 'Teen Drills — Wednesday', format: 'DRILL' })).toBe(
        'T7_YOUTH',
      )
    })

    it('classifies "Junior League" as T7 (youth beats league)', () => {
      // Same precedence reasoning — junior context comes first.
      expect(
        classifyProgrammingTier({ title: 'Junior League — Spring', format: 'LEAGUE_PLAY' }),
      ).toBe('T7_YOUTH')
    })
  })

  // ─── Edge cases ─────────────────────────────────────────────────────
  describe('Edge cases', () => {
    it('returns T1_CORE for empty title with OPEN_PLAY format', () => {
      expect(classifyProgrammingTier({ title: '', format: 'OPEN_PLAY' })).toBe('T1_CORE')
    })

    it('returns T1_CORE for null title', () => {
      expect(classifyProgrammingTier({ title: null, format: 'OPEN_PLAY' })).toBe('T1_CORE')
    })

    it('handles undefined format gracefully', () => {
      expect(classifyProgrammingTier({ title: 'Round Robin Night' })).toBe('T3_SIGNATURE')
    })

    it('is case-insensitive', () => {
      expect(classifyProgrammingTier({ title: 'PRIVATE LESSON FOR 1', format: 'OPEN_PLAY' })).toBe(
        'T6_PREMIUM',
      )
      expect(classifyProgrammingTier({ title: 'round robin', format: 'OPEN_PLAY' })).toBe(
        'T3_SIGNATURE',
      )
    })

    it('does not match "private" by itself (false-positive guard)', () => {
      // "Private event" without "lesson" shouldn't get T6. T1 is the
      // safe fallback for ambiguous titles.
      expect(classifyProgrammingTier({ title: 'Private Event', format: 'OPEN_PLAY' })).toBe(
        'T1_CORE',
      )
    })
  })
})

describe('PROGRAMMING_TIER_META', () => {
  it('has metadata for all 7 tiers', () => {
    const expected = [
      'T1_CORE',
      'T2_LEAGUE',
      'T3_SIGNATURE',
      'T4_SOCIAL',
      'T5_TOURNAMENT',
      'T6_PREMIUM',
      'T7_YOUTH',
    ] as const
    for (const tier of expected) {
      expect(PROGRAMMING_TIER_META[tier]).toBeDefined()
      expect(PROGRAMMING_TIER_META[tier].label).toBeTruthy()
      expect(PROGRAMMING_TIER_META[tier].shortLabel).toBeTruthy()
    }
  })
})

describe('getTierMeta', () => {
  it('returns the meta for the classified tier in one call', () => {
    const meta = getTierMeta({
      title: 'Private Lesson for 1 - Court #9 (IPC East)',
      format: 'OPEN_PLAY',
    })
    expect(meta.key).toBe('T6_PREMIUM')
    expect(meta.shortLabel).toBe('T6 Premium')
  })
})
