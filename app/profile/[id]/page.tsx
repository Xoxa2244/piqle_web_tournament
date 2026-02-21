'use client'

import { trpc } from '@/lib/trpc'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Card } from '@/components/ui/card'
import Image from 'next/image'
import { User as UserIcon, ArrowLeft, Users, Trophy, Medal } from 'lucide-react'
import { useState, useEffect } from 'react'
import { formatDuprRating } from '@/lib/utils'

export default function UserProfilePage() {
  const params = useParams()
  const router = useRouter()
  const { data: session } = useSession()
  const userId = params?.id as string
  const { data: profile, isLoading } = trpc.user.getProfileById.useQuery({ id: userId })
  const [avatarError, setAvatarError] = useState(false)

  // Свой профиль всегда открывать по /profile
  useEffect(() => {
    if (session?.user?.id && userId && String(session.user.id) === String(userId)) {
      router.replace('/profile')
    }
  }, [session?.user?.id, userId, router])

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-lg">Loading profile...</div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-lg">Profile not found</div>
      </div>
    )
  }

  const genderLabels: Record<string, string> = {
    M: 'Male',
    F: 'Female',
    X: 'Other',
  }

  const hasValidAvatar = profile.image && profile.image.trim() !== '' && 
    (profile.image.startsWith('http') || profile.image.startsWith('data:'))

  const singles = formatDuprRating(profile.duprRatingSingles)
  const doubles = formatDuprRating(profile.duprRatingDoubles)
  const clubsCount = profile.clubsJoinedCount ?? 0
  const playedCount = profile.tournamentsPlayedCount ?? 0
  const createdCount = profile.tournamentsCreatedCount ?? 0

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-5xl mx-auto px-4">
        {/* Back Button */}
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-4 transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          <span>Back</span>
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
          </div>

          <div className="space-y-6">
            {/* Avatar */}
            <div className="flex items-center space-x-4">
              <div className="relative">
                {hasValidAvatar && !avatarError && profile.image ? (
                  <div className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-gray-300">
                    <Image
                      src={profile.image}
                      alt={profile.name || 'User'}
                      width={100}
                      height={100}
                      className="rounded-full object-cover"
                      onError={() => {
                        setAvatarError(true)
                      }}
                    />
                  </div>
                ) : (
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center border-2 border-gray-300">
                    <UserIcon className="h-14 w-14 text-gray-500" />
                  </div>
                )}
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="text-sm font-medium text-gray-700">Name</label>
              <div className="mt-1 text-lg text-gray-900">
                {profile.name || 'Not specified'}
              </div>
            </div>

            {/* Gender */}
            <div>
              <label className="text-sm font-medium text-gray-700">Gender</label>
              <div className="mt-1 text-lg text-gray-900">
                {profile.gender ? genderLabels[profile.gender] : 'Not specified'}
              </div>
            </div>

            {/* City */}
            <div>
              <label className="text-sm font-medium text-gray-700">City</label>
              <div className="mt-1 text-lg text-gray-900">
                {profile.city || 'Not specified'}
              </div>
            </div>
          </div>
        </Card>
          </div>

          {/* Правая колонка: статистика как на карточках /players */}
          <div className="space-y-4">
            <Card className="p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Stats</h2>
              <div className="grid grid-cols-2 gap-2 text-xs mb-4">
                <div className="rounded-md border bg-gray-50 p-2">
                  <div className="text-muted-foreground">Singles</div>
                  <div className="text-sm font-medium text-gray-900">{singles ?? '—'}</div>
                </div>
                <div className="rounded-md border bg-gray-50 p-2">
                  <div className="text-muted-foreground">Doubles</div>
                  <div className="text-sm font-medium text-gray-900">{doubles ?? '—'}</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-md border p-2 text-center">
                  <div className="flex items-center justify-center text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                  </div>
                  <div className="font-medium text-gray-900">{clubsCount}</div>
                  <div className="text-muted-foreground">clubs</div>
                </div>
                <div className="rounded-md border p-2 text-center">
                  <div className="flex items-center justify-center text-muted-foreground">
                    <Trophy className="h-3.5 w-3.5" />
                  </div>
                  <div className="font-medium text-gray-900">{playedCount}</div>
                  <div className="text-muted-foreground">played</div>
                </div>
                <div className="rounded-md border p-2 text-center">
                  <div className="flex items-center justify-center text-muted-foreground">
                    <Medal className="h-3.5 w-3.5" />
                  </div>
                  <div className="font-medium text-gray-900">{createdCount}</div>
                  <div className="text-muted-foreground">created</div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

