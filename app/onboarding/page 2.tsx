'use client'

import { Suspense, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useBrand } from '@/components/BrandProvider'
import { trpc } from '@/lib/trpc'
import { IQThemeProvider } from '../clubs/[id]/intelligence/_components/IQThemeProvider'
import '../clubs/[id]/intelligence/iqsport-theme.css'

import dynamic from 'next/dynamic'
const OnboardingChatIQ = dynamic(
  () => import('../clubs/[id]/intelligence/_components/iq-pages/OnboardingChatIQ').then(m => ({ default: m.OnboardingChatIQ })),
  { ssr: false }
)

function OnboardingContent() {
  const { status } = useSession()
  const router = useRouter()
  const brand = useBrand()
  const searchParams = useSearchParams()
  const isDemo = searchParams.get('demo') === 'true'

  // Redirect non-IQSport users to home
  useEffect(() => {
    if (brand.key !== 'iqsport') {
      router.replace('/')
    }
  }, [brand.key, router])

  // Redirect unauthenticated users to sign in
  useEffect(() => {
    if (status === 'unauthenticated' && !isDemo) {
      router.replace(`/auth/signin?callbackUrl=${encodeURIComponent('/onboarding')}`)
    }
  }, [status, router, isDemo])

  // Check if user already has clubs
  const { data: clubs, isLoading: clubsLoading } = trpc.club.listMyChatClubs.useQuery(undefined, {
    enabled: status === 'authenticated',
  })

  // If user has clubs, redirect to their first club's intelligence page
  useEffect(() => {
    if (!clubsLoading && clubs && clubs.length > 0) {
      const firstClub = clubs[0]
      router.replace(`/clubs/${firstClub.id}/intelligence`)
    }
  }, [clubs, clubsLoading, router])

  // Loading states
  if (status === 'loading' || (status === 'authenticated' && clubsLoading)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    )
  }

  // Demo mode — show onboarding without auth
  if (isDemo) {
    return (
      <IQThemeProvider>
        <div className="iq-intelligence min-h-screen" style={{ background: 'var(--page-bg)' }}>
          <div className="max-w-5xl mx-auto px-6 py-12">
            <OnboardingChatIQ onComplete={() => router.push('/clubs')} />
          </div>
        </div>
      </IQThemeProvider>
    )
  }

  // Authenticated, no clubs → show onboarding chat
  if (status === 'authenticated' && clubs && clubs.length === 0) {
    return (
      <IQThemeProvider>
        <div className="iq-intelligence min-h-screen" style={{ background: 'var(--page-bg)' }}>
          <div className="max-w-5xl mx-auto px-6 py-12">
            <OnboardingChatIQ
              onComplete={(clubId) => {
                if (clubId) {
                  router.push(`/clubs/${clubId}/intelligence`)
                } else {
                  router.push('/clubs')
                }
              }}
            />
          </div>
        </div>
      </IQThemeProvider>
    )
  }

  return null
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    }>
      <OnboardingContent />
    </Suspense>
  )
}
