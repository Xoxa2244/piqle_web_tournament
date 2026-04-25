'use client'

import { useParams } from 'next/navigation'
import { EmailDomainIQ } from '../_components/iq-pages/EmailDomainIQ'

export default function EmailDomainPage() {
  const params = useParams()
  const clubId = params.id as string

  return <EmailDomainIQ clubId={clubId} />
}
