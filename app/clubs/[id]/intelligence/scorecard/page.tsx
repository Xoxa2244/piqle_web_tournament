'use client'

import { useParams } from 'next/navigation'
// Programming Health redesign Phase 1 (§1d): the /scorecard route now renders
// the family-based view. The old tier scorecard (WeeklyScorecardIQ) stays in
// the tree for reference/rollback until §1h removes it. URL unchanged.
import { ProgrammingHealthIQ } from '../_components/iq-pages/ProgrammingHealthIQ'

export default function WeeklyScorecardPage() {
  const params = useParams()
  const clubId = (params?.id as string) || ''
  if (!clubId) return null
  return <ProgrammingHealthIQ clubId={clubId} />
}
