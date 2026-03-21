'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { OnboardingWizardIQ } from '@/app/clubs/[id]/intelligence/_components/iq-pages/OnboardingWizardIQ'
import { IQThemeProvider } from '@/app/clubs/[id]/intelligence/_components/IQThemeProvider'

export default function NewClubWizardPage() {
  const router = useRouter()
  const [clubId, setClubId] = useState<string | null>(null)
  const createClub = trpc.club.create.useMutation()

  // Wizard calls this before saving settings
  const handleCreateAndComplete = async (wizardData: {
    name: string
    kind: 'VENUE' | 'COMMUNITY'
    address?: string
    city?: string
    state?: string
    country?: string
  }) => {
    if (clubId) return clubId // already created

    const club = await createClub.mutateAsync({
      name: wizardData.name || 'My Club',
      kind: wizardData.kind,
      joinPolicy: 'OPEN',
      address: wizardData.address,
      city: wizardData.city,
      state: wizardData.state,
      country: wizardData.country,
    })
    setClubId(club.id)
    return club.id
  }

  return (
    <IQThemeProvider>
      <OnboardingWizardIQ
        clubId={clubId || 'pending'}
        isNewClub
        onCreateClub={handleCreateAndComplete}
        onComplete={() => {
          if (clubId) {
            router.push(`/clubs/${clubId}/intelligence`)
          }
        }}
      />
    </IQThemeProvider>
  )
}
