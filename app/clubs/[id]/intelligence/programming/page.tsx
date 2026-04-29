'use client'
import { useParams } from 'next/navigation'
import { ProgrammingIQ } from '../_components/iq-pages/ProgrammingIQ'
import { useBrand } from '@/components/BrandProvider'

export default function ProgrammingPage() {
  const { id: clubId } = useParams<{ id: string }>()
  const brand = useBrand()

  // Programming IQ is IQSport-only — the legacy tournament brand doesn't
  // surface AI Intelligence tabs at all. Keeps the route behaviour
  // consistent with the rest of /intelligence/*.
  if (brand.key !== 'iqsport') return null

  return <ProgrammingIQ clubId={clubId} />
}
