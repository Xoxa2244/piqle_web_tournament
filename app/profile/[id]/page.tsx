'use client'

import { trpc } from '@/lib/trpc'
import { useParams } from 'next/navigation'
import { Card } from '@/components/ui/card'
import Image from 'next/image'
import { User as UserIcon, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

export default function UserProfilePage() {
  const params = useParams()
  const userId = params?.id as string
  const { data: profile, isLoading } = trpc.user.getProfileById.useQuery({ id: userId })
  const [avatarError, setAvatarError] = useState(false)

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

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        {/* Back Button */}
        <Link
          href="/admin"
          className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-4 transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          <span>Back</span>
        </Link>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
          </div>

          <div className="space-y-6">
            {/* Avatar */}
            <div className="flex items-center space-x-4">
              <div className="relative">
                {hasValidAvatar && !avatarError ? (
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
    </div>
  )
}

