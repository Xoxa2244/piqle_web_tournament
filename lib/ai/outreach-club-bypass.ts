type ClubIdentityInput = {
  clubName?: string | null
  clubSlug?: string | null
}

function normalizeClubIdentity(value: string | null | undefined) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function isTestIq2Club(input: ClubIdentityInput) {
  const normalizedName = normalizeClubIdentity(input.clubName)
  const normalizedSlug = normalizeClubIdentity(input.clubSlug)
  return normalizedName === 'test iq2' || normalizedSlug === 'test iq2'
}

export function isOutreachBypassClub(input: ClubIdentityInput) {
  return isTestIq2Club(input)
}

export function getOutreachBypassReason(input: ClubIdentityInput) {
  if (isTestIq2Club(input)) {
    return 'Test IQ2 club bypass keeps outreach live-enabled for QA sends.'
  }

  return null
}
