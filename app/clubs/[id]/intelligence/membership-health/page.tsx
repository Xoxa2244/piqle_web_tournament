'use client'

import { useParams } from 'next/navigation'
import { MembershipHealthIQ } from '../_components/iq-pages/MembershipHealthIQ'

export default function MembershipHealthPage() {
  const params = useParams()
  const clubId = params.id as string

  return <MembershipHealthIQ clubId={clubId} />
}
