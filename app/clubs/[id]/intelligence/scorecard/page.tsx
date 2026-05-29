'use client'

import { useParams } from 'next/navigation'
// Programming Health redesign Phase 1: /scorecard renders the family-based
// view (§1d). The old T1–T7 tier scorecard UI was removed in §1h; the tier
// classifier + getWeeklyScorecard backend stay dormant (doc §10 decision #4).
// URL kept as /scorecard for backwards compatibility.
import { ProgrammingHealthIQ } from '../_components/iq-pages/ProgrammingHealthIQ'

export default function WeeklyScorecardPage() {
  const params = useParams()
  const clubId = (params?.id as string) || ''
  if (!clubId) return null
  return <ProgrammingHealthIQ clubId={clubId} />
}
