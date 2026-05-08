'use client'

import { useParams } from 'next/navigation'
import { WeeklyScorecardIQ } from '../_components/iq-pages/WeeklyScorecardIQ'

export default function WeeklyScorecardPage() {
  const params = useParams()
  const clubId = (params?.id as string) || ''
  if (!clubId) return null
  return <WeeklyScorecardIQ clubId={clubId} />
}
