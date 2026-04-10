'use client'

import { useParams } from 'next/navigation'
import { BillingIQ } from '../_components/iq-pages/BillingIQ'
import { trpc } from '@/lib/trpc'

function BillingIQWrapper({ clubId }: { clubId: string }) {
  const { data: subscription, isLoading } = trpc.intelligence.getSubscription.useQuery(
    { clubId },
    { staleTime: 30_000 }
  )

  return (
    <BillingIQ
      subscription={subscription as any}
      isLoading={isLoading}
      clubId={clubId}
    />
  )
}

export default function BillingPage() {
  const params = useParams()
  const clubId = params.id as string

  return <BillingIQWrapper clubId={clubId} />
}
