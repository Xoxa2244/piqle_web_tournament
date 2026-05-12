/**
 * Intro Program (Pickleball 101) detector.
 *
 * Sprint 1 P1.3 — supports the "intro → membership" conversion funnel
 * widget. Identifies sessions whose primary purpose is to bring net-new
 * players into the ecosystem (Tier 1.3 in IPC's Programming OS).
 *
 * Why a regex on title is enough: CourtReserve doesn't expose a
 * dedicated "intro program" flag in its session schema, so we infer
 * from the operator-authored session title. Audit on IPC data
 * (3 clubs, 50k+ sessions) shows clean separation between explicit
 * intro programs and regular beginner play.
 *
 * Match (counts as intro):
 *   - Pickleball 101 / PB 101 — branded onboarding course
 *   - Intro to Pickleball / Intro to Open Play — explicit kickoff
 *   - Free Beginner Class — sponsor-driven first-touch
 *   - Try Pickleball / Try, Compare, Learn — paddle-workshop style
 *   - New to Pickleball / First-time
 *
 * Skip (NOT intro — already-registered members):
 *   - Open Play Beginner (2.0–2.49) — recurring play for self-assessed
 *     beginners who already booked
 *   - Drills and Skills Class (2.0+ Beginner) — clinic for regulars
 *   - Learner League — multi-week league for onboarded beginners
 *     (Tier 2 league, not Tier 1.3 intro)
 *
 * Operators can override this auto-classification via per-club rules
 * in Settings → Programming → Intro patterns (TBD; current MVP relies
 * on the regex below).
 */

const POSITIVE_PATTERNS: RegExp[] = [
  /\bpickleball\s*101\b/i,
  /\bpb\s*101\b/i,
  /\bintro\s+to\s+(pickleball|open\s+play)\b/i,
  /\bfree\s+beginner\s+class\b/i,
  /\btry\s+pickleball\b/i,
  /\btry,?\s+compare,?\s+learn\b/i,
  /\bnew\s+to\s+pickleball\b/i,
  /\bfirst[-\s]time\b/i,
  /\b(newcomer|newbie|rookie)\b/i,
  /\bpaddle\s+workshop\b/i,
]

/**
 * Return true if a session title looks like a Pickleball 101 / intro
 * program — i.e. its primary audience is people who haven't started
 * playing at the club yet.
 */
export function isIntroSession(title: string | null | undefined): boolean {
  if (!title) return false
  const trimmed = title.trim()
  if (!trimmed) return false
  return POSITIVE_PATTERNS.some((p) => p.test(trimmed))
}

/**
 * Best-effort family label so a dashboard or scorecard can group
 * "Free Beginner Class Presented by Volair" + "Free Beginner Class
 * presented by Volair" + "Free Beginner Class Presented By Volair Pickleball"
 * under one bucket. Strips sponsor suffixes, month/session markers, and
 * normalises casing.
 *
 * Returns null for non-intro sessions.
 */
export function extractIntroProgramFamily(title: string | null | undefined): string | null {
  if (!isIntroSession(title)) return null
  let cleaned = (title ?? '')
    .replace(/\s*\(.*?\)\s*/g, ' ') // strip "(Session 2)", "(Feb)", etc.
    .replace(/\s*-\s*free\b/gi, '')
    .replace(/\bfree\s+/gi, '')
    .replace(/\bpresented\s+by\s+[\w\s.&]+/gi, '')
    .replace(/\bw\/\s*[\w\s.]+/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

  // Canonical bucket names for the most common patterns. The order
  // matters — match the more specific one first.
  const lower = cleaned.toLowerCase()
  if (/pickleball\s*101|pb\s*101/.test(lower)) return 'Pickleball 101'
  if (/intro\s+to\s+pickleball/.test(lower)) return 'Intro to Pickleball'
  if (/intro\s+to\s+open\s+play/.test(lower)) return 'Intro to Open Play'
  if (/beginner\s+class/.test(lower)) return 'Free Beginner Class'
  if (/paddle\s+workshop/.test(lower)) return 'Paddle Workshop'
  if (/try\s+pickleball/.test(lower)) return 'Try Pickleball'

  // Fallback: title with cosmetic clean-up
  return cleaned || null
}

/**
 * SQL fragment that mirrors POSITIVE_PATTERNS for use inside Postgres
 * queries (used by the conversion-funnel tRPC procedure to keep the
 * regex single-source-of-truth between TS and SQL).
 *
 * Postgres regex syntax differs slightly from JS (no `\b`, use word
 * boundaries via `(^|[^a-z])` / `([^a-z]|$)` if strict matching needed —
 * for our case `~*` (case-insensitive) plus simple disjunction is
 * good enough). Test fixtures in tests/lib/ai cover both functions.
 */
export const INTRO_SESSION_SQL_REGEX = [
  'pickleball\\s*101',
  'pb\\s*101',
  'intro\\s+to\\s+(pickleball|open\\s+play)',
  'free\\s+beginner\\s+class',
  'try\\s+pickleball',
  'try,?\\s+compare,?\\s+learn',
  'new\\s+to\\s+pickleball',
  'first[-\\s]time',
  'newcomer|newbie|rookie',
  'paddle\\s+workshop',
].join('|')
