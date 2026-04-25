const OUTREACH_BYPASS_CLUB_IDS = new Set([
  'bbdfc056-40c9-449f-8297-0fa48383cebb',
])

export function isOutreachBypassClubId(clubId: string | null | undefined) {
  return typeof clubId === 'string' && OUTREACH_BYPASS_CLUB_IDS.has(clubId)
}

export function getOutreachBypassReason(clubId: string | null | undefined) {
  if (isOutreachBypassClubId(clubId)) {
    return 'QA outreach bypass is enabled for this club.'
  }

  return null
}
