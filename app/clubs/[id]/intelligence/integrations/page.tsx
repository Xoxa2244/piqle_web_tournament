'use client'

import { useParams } from 'next/navigation'
import { IntegrationsIQ } from '../_components/iq-pages/IntegrationsIQ'

export default function IntegrationsPage() {
  const params = useParams()
  const clubId = params.id as string

  return <IntegrationsIQ clubId={clubId} />
}
