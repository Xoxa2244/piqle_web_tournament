'use client'
import { useParams } from 'next/navigation'
import { AnalyticsIQ } from '../_components/iq-pages/AnalyticsIQ'
import { useBrand } from '@/components/BrandProvider'

export default function AnalyticsPage() {
  const { id: clubId } = useParams<{ id: string }>()
  const brand = useBrand()

  if (brand.key !== 'iqsport') return null

  return <AnalyticsIQ clubId={clubId} />
}
