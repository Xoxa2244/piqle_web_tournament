'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { OnboardingWizardIQ } from '@/app/clubs/[id]/intelligence/_components/iq-pages/OnboardingWizardIQ'
import { IQThemeProvider } from '@/app/clubs/[id]/intelligence/_components/IQThemeProvider'
import '@/app/clubs/[id]/intelligence/iqsport-theme.css'

export default function NewClubWizardPage() {
  const router = useRouter()
  const [clubId, setClubId] = useState<string | null>(null)
  const clubIdRef = useRef<string | null>(null)
  const createClub = trpc.club.create.useMutation()

  const handleCreateAndComplete = useCallback(async (wizardData: {
    name: string
    kind: 'VENUE' | 'COMMUNITY'
    address?: string
    city?: string
    state?: string
    country?: string
  }) => {
    if (clubIdRef.current) return clubIdRef.current

    const club = await createClub.mutateAsync({
      name: wizardData.name || 'My Club',
      kind: wizardData.kind,
      joinPolicy: 'APPROVAL',
      address: wizardData.address,
      city: wizardData.city,
      state: wizardData.state,
      country: wizardData.country,
    })
    clubIdRef.current = club.id
    setClubId(club.id)
    return club.id
  }, [createClub])

  const handleComplete = useCallback(() => {
    const id = clubIdRef.current
    if (id) {
      // Full page reload to ensure fresh tRPC cache
      window.location.href = `/clubs/${id}/intelligence`
    } else {
      window.location.href = '/clubs'
    }
  }, [])

  return (
    <IQThemeProvider>
      <OnboardingWizardIQ
        clubId={clubId || 'pending'}
        isNewClub
        onCreateClub={handleCreateAndComplete}
        onComplete={handleComplete}
      />
    </IQThemeProvider>
  )
}
