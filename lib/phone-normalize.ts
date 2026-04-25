/**
 * Phone normalisation — single source of truth.
 *
 * We pull phone numbers from three sources today:
 *   - CourtReserve API (`PhoneNumber` field, no canonical format)
 *   - CourtReserve Excel import (free-text "Phone" / "Cell" / "Mobile" cells)
 *   - Onboarding wizard / Settings forms (admin-typed)
 *
 * Each one ships strings like:
 *   "(555) 555-0123" / "555-555-0123" / "5555550123" / "+1 555 555 0123"
 *   "+44 20 1234 5678" / "07911 123456" (UK local) / "abc" / ""
 *
 * Twilio expects E.164 (`+15555550123`). Mixed formats also produce
 * duplicate-user bugs (same person gets two `User` rows because email
 * was missing and phone strings differ by punctuation).
 *
 * `normalizePhone()` returns:
 *   - The E.164 string if the input parses to a valid number.
 *   - `null` if input is empty / unparseable / invalid for the inferred
 *     country. Callers should treat null as "no phone" — never pass
 *     null to Twilio.
 *
 * The default country is US because all current IQSport clubs are in
 * North America. Callers with non-US clubs should pass `defaultCountry`
 * explicitly.
 */

import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js'

export type NormalisedPhone = string  // always E.164, e.g. "+15555550123"

/**
 * Best-effort normalise to E.164. Returns null when the input can't be
 * confidently turned into a valid phone — empty string, gibberish, too
 * short, etc.
 *
 * Why null instead of throwing: callers (sync upsert, Twilio call) want
 * a "skip" signal, not a thrown error that aborts a 1000-row batch.
 */
export function normalizePhone(
  raw: string | null | undefined,
  defaultCountry: CountryCode = 'US',
): NormalisedPhone | null {
  if (raw == null) return null
  const trimmed = String(raw).trim()
  if (!trimmed) return null

  // libphonenumber-js handles formats with `+` country codes, parens,
  // dashes, dots, and spaces. It returns `undefined` (not throw) on
  // unparseable input — that's why we need the wrapper.
  let parsed
  try {
    parsed = parsePhoneNumberFromString(trimmed, defaultCountry)
  } catch {
    return null
  }
  if (!parsed) return null
  if (!parsed.isValid()) return null
  return parsed.number as NormalisedPhone
}

/**
 * Convenience: normalise + return original on null. Useful in places
 * where we want to keep the raw string visible for debugging while
 * still preferring the canonical version when available.
 *
 * NOT recommended for storage paths — store normalised or null only.
 */
export function normalizePhoneOrRaw(
  raw: string | null | undefined,
  defaultCountry: CountryCode = 'US',
): string | null {
  if (raw == null) return null
  return normalizePhone(raw, defaultCountry) ?? raw
}

/**
 * Check whether two phone strings refer to the same number, ignoring
 * formatting. Used for de-duplication during member upserts when email
 * is absent on one side.
 */
export function phonesMatch(
  a: string | null | undefined,
  b: string | null | undefined,
  defaultCountry: CountryCode = 'US',
): boolean {
  const na = normalizePhone(a, defaultCountry)
  const nb = normalizePhone(b, defaultCountry)
  if (!na || !nb) return false
  return na === nb
}
