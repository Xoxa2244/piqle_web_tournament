'use client'

import { useParams } from 'next/navigation'
import { LeaguesIQ } from '../_components/iq-pages/LeaguesIQ'

export default function LeaguesPage() {
  const params = useParams()
  const clubId = (params?.id as string) || ''
  if (!clubId) return null
  return <LeaguesIQ clubId={clubId} />
}
