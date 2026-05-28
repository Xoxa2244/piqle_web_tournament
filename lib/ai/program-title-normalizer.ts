/**
 * Program title normalizer — Programming Health redesign Phase 1 (§7.1).
 *
 * Court Reserve session titles carry a lot of per-instance noise that
 * breaks grouping. The same program shows up as many "different" titles
 * only because of court numbers, club-name suffixes, and session
 * counters:
 *
 *   "Singles — Court #2 (IPC East)"
 *   "Singles — Court #3 (IPC East)"
 *   "Singles — Court #9 (IPC East)"
 *
 * …are ONE program ("Singles") drawn across courts. Without normalization
 * the Programming Health drill-down shows 8 rows instead of 1.
 *
 * This module collapses that noise while PRESERVING semantics that
 * distinguish real programs:
 *   - skill ratings  ("(3.5 - 3.99)") stay — they separate Competitive
 *     from Casual Open Play
 *   - program names / coach names stay — "Private Lesson for 1",
 *     "Doubles — Emilia Quinn"
 *
 * What it strips:
 *   - "Court #N" / "— Court #N" (court assignment — pure noise)
 *   - "(Club Name)" suffix when clubName is supplied
 *   - "(Session N)" league session counter
 *   - em-dash → hyphen (consistency)
 *   - collapse multiple spaces, trim trailing separators
 *
 * The output is a clean, human-readable title used both as the display
 * label and the grouping key (lowercased) for sub-grouping inside a
 * program family.
 */

/** Escape regex special chars for safe dynamic patterns (club name). */
function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Normalize a CR session title for grouping + display.
 *
 * @param title    raw session title from play_sessions.title
 * @param clubName optional — strips a trailing "(Club Name)" suffix.
 *                 Pass the club's name so "Singles (IPC East)" → "Singles".
 * @returns cleaned title; empty string in → empty string out.
 */
export function normalizeProgramTitle(
  title: string | null | undefined,
  clubName?: string | null,
): string {
  let t = (title ?? '').trim()
  if (t.length === 0) return ''

  // em-dash / en-dash → hyphen so separators are consistent
  t = t.replace(/[—–]/g, '-')

  // Strip the club-name suffix in parens, e.g. "(IPC East)". Only when
  // we know the club name — generic paren-stripping would eat skill
  // ratings like "(3.5 - 3.99)".
  if (clubName && clubName.trim().length > 0) {
    t = t.replace(new RegExp(`\\(\\s*${escapeRegex(clubName.trim())}\\s*\\)`, 'gi'), ' ')
  }

  // Strip court assignment: "Court #9", "Court 9", "- Court #9", and the
  // ", Court #2, Court #3" tail of multi-court bookings. Leading separator
  // class includes a comma so those lists don't leave ", ," ghosts behind.
  t = t.replace(/[-,\s]*\bcourt\s*#?\s*\d+/gi, ' ')

  // Strip a trailing bare "Court" with no number — CR emits "Doubles — Court"
  // (no court assigned). Require a leading dash so we never eat "Court" from
  // a real program name like "King of the Court".
  t = t.replace(/\s*-[\s-]*court\b\s*$/gi, ' ')

  // Strip league session counter: "(Session 3)"
  t = t.replace(/\(\s*session\s*\d+\s*\)/gi, ' ')

  // Collapse repeated whitespace
  t = t.replace(/\s{2,}/g, ' ')

  // Trim trailing/leading separators, commas and spaces (e.g. dangling " - "
  // or a leftover comma from a stripped court list).
  t = t.replace(/^[\s\-,]+|[\s\-,]+$/g, '').trim()

  return t
}

/**
 * Grouping key — normalized title lowercased. Two titles that normalize
 * to the same key belong to the same program for sub-grouping inside a
 * family. Keep display via normalizeProgramTitle; use this only for
 * map keys / comparison.
 */
export function programGroupKey(
  title: string | null | undefined,
  clubName?: string | null,
): string {
  return normalizeProgramTitle(title, clubName).toLowerCase()
}
