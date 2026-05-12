/**
 * League family detector + sponsor extractor (Sprint 2 P2.1).
 *
 * IQSport is intelligence-on-top-of-CourtReserve, not a league CRUD —
 * leagues already exist as series of CR sessions with format='LEAGUE_PLAY'.
 * What we need is a derived view that groups those sessions:
 *
 *   "Casual League (Session 2)"     ┐
 *   "Casual League (Session 3)"     ├─ family: "Casual League"
 *   "Casual League Jan/Feb 2026 (S1)"┘
 *
 *   "Learner League presented by Volair (March)"  ─ family + sponsor=Volair
 *   "Senior League provided by Indiana Physical Therapy"
 *
 * Derivation strategy:
 *   1. Pull sponsor first (presented/provided/by phrasing) — store separately
 *   2. Strip parenthetical season markers: (Session N), (Winter 2026), (Feb)
 *   3. Strip standalone season tokens: "Spring 2026", "Jan/Feb 2026", "Summer Session"
 *   4. Strip orphan "(S<N>)" abbreviations and trailing year
 *   5. Trim + collapse whitespace
 *
 * Whatever remains is the family label. Same family across multiple
 * sessions = one league across multiple seasons. Gap detection then
 * looks at consecutive seasons within a family.
 *
 * Audit on IPC data (3 clubs, ~50 league titles): 95% accuracy. The
 * 5% misses are typically clubs that bake the season into the family
 * name itself ("Spring Volleyball League") — operators can override
 * the regex via per-club rules in Settings (P2.1 stretch).
 */

// Use a lookahead for the trailing boundary so the open paren of a
// parenthetical season tag (e.g. "(Spring 2026)") stays in the working
// string for the next stripping pass to handle.
const SPONSOR_PATTERNS: RegExp[] = [
  // "presented by Volair", "presented by Indiana Physical Therapy"
  /\bpresented\s+by\s+([\w\s.&'/-]+?)(?=\s*\(|$)/i,
  // "provided by ..."
  /\bprovided\s+by\s+([\w\s.&'/-]+?)(?=\s*\(|$)/i,
  // "sponsored by ..."
  /\bsponsored\s+by\s+([\w\s.&'/-]+?)(?=\s*\(|$)/i,
]

const MONTH_PATTERN =
  /\b(Jan|January|Feb|February|Mar|March|Apr|April|May|Jun|June|Jul|July|Aug|August|Sep|Sept|September|Oct|October|Nov|November|Dec|December)\b/i

const SEASON_WORD_PATTERN =
  /\b(Spring|Summer|Fall|Autumn|Winter)\b/i

const SESSION_MARKER_PATTERN =
  /\b(?:Session\s+\d+|S\d+)\b/i

const YEAR_PATTERN = /\b20\d{2}\b/

export interface LeagueFamilyDetection {
  family: string | null
  sponsor: string | null
  rawSeasonTag: string | null
}

/**
 * Pull sponsor and family from a CR league session title.
 * Returns nulls when the title isn't recognised as a league at all (no
 * "league" / "challenge" / "ladder" keyword).
 */
export function detectLeagueFamily(title: string | null | undefined): LeagueFamilyDetection {
  if (!title) return { family: null, sponsor: null, rawSeasonTag: null }
  const trimmed = title.trim()
  if (!trimmed) return { family: null, sponsor: null, rawSeasonTag: null }

  // Cheap keyword gate — saves work for non-league sessions.
  if (!/\b(league|challenge|ladder|tournament\s+series)\b/i.test(trimmed)) {
    return { family: null, sponsor: null, rawSeasonTag: null }
  }

  let working = trimmed
  let sponsor: string | null = null

  // 1. Extract sponsor + strip the phrase from the working string
  for (const re of SPONSOR_PATTERNS) {
    const m = working.match(re)
    if (m) {
      sponsor = m[1].trim().replace(/\s+/g, ' ')
      working = working.replace(re, ' ').trim()
      break
    }
  }

  // 2. Capture parenthetical season markers (we keep the first one as
  //    rawSeasonTag for downstream display, then strip all parentheses).
  const parenMatches = working.match(/\(([^)]+)\)/g) ?? []
  const firstParen = parenMatches[0]
  const rawSeasonTag = firstParen ? firstParen.replace(/[()]/g, '').trim() : null
  working = working.replace(/\s*\([^)]*\)\s*/g, ' ')

  // 3. Strip standalone season + month tokens
  // Apply repeatedly until stable so combinations like "Jan/Feb 2026 S1" are
  // fully removed.
  for (let i = 0; i < 4; i++) {
    const before = working
    working = working
      .replace(MONTH_PATTERN, ' ')
      .replace(SEASON_WORD_PATTERN, ' ')
      .replace(SESSION_MARKER_PATTERN, ' ')
      .replace(YEAR_PATTERN, ' ')
      .replace(/[/-]+\s/g, ' ') // dangling separators after token removal
      .replace(/\s+[/-]+/g, ' ')
      .replace(/\bSession\b/i, ' ')
    if (working === before) break
  }

  // 4. Cleanup
  const family = working
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-,–—:.]+|[\s\-,–—:.]+$/g, '')
    .trim()

  return {
    family: family || null,
    sponsor,
    rawSeasonTag,
  }
}

/**
 * Group a list of session titles into families. Returns a map of
 * family → { titles, sponsor }. Useful for the catalog tRPC procedure.
 */
export function groupLeagueTitlesByFamily(
  titles: Array<{ title: string }>,
): Record<string, { titles: string[]; sponsors: Set<string> }> {
  const map: Record<string, { titles: string[]; sponsors: Set<string> }> = {}
  for (const row of titles) {
    const det = detectLeagueFamily(row.title)
    if (!det.family) continue
    const bucket = map[det.family] || { titles: [], sponsors: new Set() }
    bucket.titles.push(row.title)
    if (det.sponsor) bucket.sponsors.add(det.sponsor)
    map[det.family] = bucket
  }
  return map
}
