'use client'

import { useParams } from 'next/navigation'
import { LaunchRunbookIQ } from '../_components/iq-pages/LaunchRunbookIQ'

export default function LaunchPage() {
  const params = useParams()
  const clubId = params.id as string

  return <LaunchRunbookIQ clubId={clubId} />
}
