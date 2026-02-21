'use client'

import { trpc } from '@/lib/trpc'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import Image from 'next/image'
import { User as UserIcon, Save, ArrowLeft, Upload, Camera, Link as LinkIcon, RefreshCw, Unlink } from 'lucide-react'
import Link from 'next/link'
import AvatarCropper from '@/components/AvatarCropper'
import CityAutocomplete from '@/components/CityAutocomplete'
import DUPRLoginModal from '@/components/DUPRLoginModal'
import { formatDuprRating } from '@/lib/utils'
import { toast } from '@/components/ui/use-toast'

export default function ProfilePage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { data: profile, isLoading, refetch } = trpc.user.getProfile.useQuery()
  const { update: updateSession } = useSession()
  const updateProfile = trpc.user.updateProfile.useMutation({
    onSuccess: async () => {
      refetch()
      setIsEditing(false)
      setIsUploadingAvatar(false)
      await updateSession()
    },
  })

  const [isEditing, setIsEditing] = useState(false)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarError, setAvatarError] = useState(false)
  const [showCropper, setShowCropper] = useState(false)
  const [cropperImageSrc, setCropperImageSrc] = useState<string | null>(null)
  const [showDUPRModal, setShowDUPRModal] = useState(false)
  const [isLinkingDUPR, setIsLinkingDUPR] = useState(false)
  const [isRefreshingRatings, setIsRefreshingRatings] = useState(false)
  const [isUnlinkingDUPR, setIsUnlinkingDUPR] = useState(false)
  const [payoutStatus, setPayoutStatus] = useState<{
    hasAccount: boolean
    payoutsActive: boolean
    isLoading: boolean
  }>({ hasAccount: false, payoutsActive: false, isLoading: true })
  const [formData, setFormData] = useState({
    name: '',
    gender: '' as 'M' | 'F' | 'X' | '',
    city: '',
    duprLink: '',
  })

  // Initialize form data when profile loads
  useEffect(() => {
    if (profile && !isEditing) {
      setFormData({
        name: profile.name || '',
        gender: profile.gender || '',
        city: profile.city || '',
        duprLink: profile.duprLink || '',
      })
      setAvatarPreview(null)
      setAvatarError(false)
    }
  }, [profile, isEditing])

  useEffect(() => {
    let isMounted = true
    const loadStatus = async () => {
      try {
        const response = await fetch('/api/stripe/connect-status')
        const payload = await response.json()
        if (!isMounted) return
        if (!response.ok) {
          throw new Error(payload?.error || 'Failed to load payout status')
        }
        setPayoutStatus({
          hasAccount: payload.hasAccount,
          payoutsActive: payload.payoutsActive,
          isLoading: false,
        })
      } catch {
        if (isMounted) {
          setPayoutStatus((prev) => ({ ...prev, isLoading: false }))
        }
      }
    }
    loadStatus()
    return () => {
      isMounted = false
    }
  }, [])

  const handleConnectStripe = async () => {
    try {
      const response = await fetch('/api/stripe/create-account-link', {
        method: 'POST',
      })
      const payload = await response.json()
      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error || 'Failed to start Stripe onboarding')
      }
      window.location.href = payload.url
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to start Stripe onboarding', variant: 'destructive' })
    }
  }

  const handleDUPRSuccess = async (data: {
    duprId: string
    numericId?: number
    userToken: string
    refreshToken: string
    stats?: {
      rating?: number
      singlesRating?: number
      doublesRating?: number
      name?: string
    }
  }) => {
    setIsLinkingDUPR(true)
    try {
      const response = await fetch('/api/dupr/link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          duprId: data.duprId,
          numericId: data.numericId,
          accessToken: data.userToken,
          refreshToken: data.refreshToken,
          stats: data.stats,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to link DUPR account')
      }

      // Refresh profile data
      await refetch()
      setShowDUPRModal(false)
    } catch (error) {
      console.error('Error linking DUPR:', error)
      toast({ description: 'Failed to link DUPR account. Please try again.', variant: 'destructive' })
    } finally {
      setIsLinkingDUPR(false)
    }
  }

  const handleRefreshRatings = async () => {
    setIsRefreshingRatings(true)
    try {
      const response = await fetch('/api/dupr/refresh-ratings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to refresh ratings')
      }

      // Refresh profile data
      await refetch()
    } catch (error: any) {
      console.error('Error refreshing ratings:', error)
      toast({ title: 'Error', description: error.message || 'Failed to refresh DUPR ratings. Please try again.', variant: 'destructive' })
    } finally {
      setIsRefreshingRatings(false)
    }
  }

  const handleUnlinkDUPR = async () => {
    if (!confirm('Are you sure you want to unlink your DUPR account? You will need to reconnect it to use DUPR features.')) {
      return
    }

    setIsUnlinkingDUPR(true)
    try {
      const response = await fetch('/api/dupr/unlink', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to unlink DUPR account')
      }

      // Refresh profile data
      await refetch()
    } catch (error: any) {
      console.error('Error unlinking DUPR:', error)
      toast({ title: 'Error', description: error.message || 'Failed to unlink DUPR account. Please try again.', variant: 'destructive' })
    } finally {
      setIsUnlinkingDUPR(false)
    }
  }

  const handleEdit = () => {
    if (profile) {
      setFormData({
        name: profile.name || '',
        gender: profile.gender || '',
        city: profile.city || '',
        duprLink: profile.duprLink || '',
      })
      setIsEditing(true)
    }
  }

  const handleSave = () => {
    updateProfile.mutate({
      name: formData.name || undefined,
      gender: formData.gender || undefined,
      city: formData.city || undefined,
      duprLink: formData.duprLink || undefined,
      image: avatarPreview || undefined,
    })
  }

  const handleCancel = () => {
    if (profile) {
      setFormData({
        name: profile.name || '',
        gender: profile.gender || '',
        city: profile.city || '',
        duprLink: profile.duprLink || '',
      })
      setAvatarPreview(null)
    }
    setIsEditing(false)
  }

  const handleAvatarClick = () => {
    if (isEditing && fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({ description: 'Please select an image file', variant: 'destructive' })
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({ description: 'File size must be less than 5MB', variant: 'destructive' })
      return
    }

    // Show cropper with the selected image
    const reader = new FileReader()
    reader.onload = (e) => {
      setCropperImageSrc(e.target?.result as string)
      setShowCropper(true)
    }
    reader.readAsDataURL(file)
  }

  const handleCropComplete = async (croppedImageUrl: string) => {
    setShowCropper(false)
    setIsUploadingAvatar(true)

    try {
      // Convert blob URL to File
      const response = await fetch(croppedImageUrl)
      const blob = await response.blob()
      const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' })

      // Upload cropped file
      const formData = new FormData()
      formData.append('file', file)

      const uploadResponse = await fetch('/api/upload-avatar', {
        method: 'POST',
        body: formData,
      })

      if (!uploadResponse.ok) {
        const error = await uploadResponse.json()
        throw new Error(error.error || 'Failed to upload avatar')
      }

      const data = await uploadResponse.json()
      setAvatarPreview(data.url)
      
      // Clean up blob URL
      URL.revokeObjectURL(croppedImageUrl)
    } catch (error) {
      console.error('Upload error:', error)
      toast({ description: 'Failed to upload avatar. Please try again.', variant: 'destructive' })
      setAvatarPreview(null)
    } finally {
      setIsUploadingAvatar(false)
      setCropperImageSrc(null)
    }
  }

  const handleCropperClose = () => {
    setShowCropper(false)
    setCropperImageSrc(null)
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

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

  const currentAvatar = avatarPreview || profile.image
  const hasValidAvatar = currentAvatar && currentAvatar.trim() !== '' && 
    (currentAvatar.startsWith('http') || currentAvatar.startsWith('data:'))

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        {/* Back Button */}
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-4 transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          <span>Back</span>
        </button>

        <div className="mb-4 flex items-center gap-2">
          <Link
            href="/profile"
            className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-900 shadow-sm"
          >
            Profile
          </Link>
          {payoutStatus.payoutsActive && (
            <Link
              href="/profile/organizer"
              className="rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              Financial dashboard
            </Link>
          )}
        </div>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
            {!isEditing && (
              <Button onClick={handleEdit} variant="outline">
                Edit
              </Button>
            )}
          </div>

          <div className="space-y-6">
            {/* Avatar */}
            <div className="flex items-center space-x-4">
              <div className="relative">
                {hasValidAvatar && !avatarError ? (
                  <div className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-gray-300">
                <Image
                      src={currentAvatar}
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
                {isEditing && (
                  <>
                    <button
                      type="button"
                      onClick={handleAvatarClick}
                      disabled={isUploadingAvatar}
                      className="absolute bottom-0 right-0 bg-blue-600 text-white rounded-full p-2 hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                    >
                      {isUploadingAvatar ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Camera className="h-4 w-4" />
                      )}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarChange}
                      className="hidden"
                    />
                  </>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">Avatar</p>
                <p className="text-xs text-gray-500 mt-1">
                  {isEditing ? 'Click the camera icon to upload a new avatar' : 'Click Edit to change your avatar'}
                </p>
              </div>
            </div>

            {/* Name */}
            <div>
              <Label htmlFor="name">Name</Label>
              {isEditing ? (
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="mt-1"
                  placeholder="Enter your name"
                />
              ) : (
                <div className="mt-1 text-lg text-gray-900">
                  {profile.name || 'Not specified'}
                </div>
              )}
            </div>

            {/* Gender */}
            <div>
              <Label htmlFor="gender">Gender</Label>
              {isEditing ? (
                <select
                  id="gender"
                  value={formData.gender}
                  onChange={(e) => setFormData({ ...formData, gender: e.target.value as 'M' | 'F' | 'X' | '' })}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background pl-3 py-2 text-sm pr-[2.5rem]"
                >
                  <option value="">Not specified</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                  <option value="X">Other</option>
                </select>
              ) : (
                <div className="mt-1 text-lg text-gray-900">
                  {profile.gender ? genderLabels[profile.gender] : 'Not specified'}
                </div>
              )}
            </div>

            {/* City */}
            <div>
              <Label htmlFor="city">City</Label>
              {isEditing ? (
                <CityAutocomplete
                  id="city"
                  value={formData.city}
                  onChange={(value) => setFormData({ ...formData, city: value })}
                  className="mt-1"
                  placeholder="Enter your city"
                />
              ) : (
                <div className="mt-1 text-lg text-gray-900">
                  {profile.city || 'Not specified'}
                </div>
              )}
            </div>

            {/* DUPR Link */}
            <div>
              <Label htmlFor="duprLink">DUPR Link</Label>
              {isEditing ? (
                <Input
                  id="duprLink"
                  type="url"
                  value={formData.duprLink}
                  onChange={(e) => setFormData({ ...formData, duprLink: e.target.value })}
                  className="mt-1 opacity-50"
                  placeholder="https://..."
                  disabled
                />
              ) : (
                <div className="mt-1">
                  {profile.duprLinked && profile.duprId ? (
                    <div className="flex items-center justify-between">
                      <div className="text-lg text-gray-900">
                        Linked: <span className="font-medium">{profile.duprId}</span>
                      </div>
                      <Button
                        onClick={handleUnlinkDUPR}
                        disabled={isUnlinkingDUPR}
                        variant="outline"
                        size="sm"
                        className="flex items-center space-x-2"
                      >
                        <Unlink className="h-4 w-4" />
                        <span>{isUnlinkingDUPR ? 'Unlinking...' : 'Unlink'}</span>
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-3">
                      <span className="text-lg text-gray-400">Not linked</span>
                      <Button
                        onClick={() => setShowDUPRModal(true)}
                        disabled={isLinkingDUPR}
                        size="sm"
                        className="flex items-center space-x-2"
                      >
                        <LinkIcon className="h-4 w-4" />
                        <span>Connect DUPR</span>
                      </Button>
                    </div>
                  )}
                </div>
              )}
              {isEditing && (
                <p className="mt-1 text-xs text-gray-400">This feature is temporarily unavailable</p>
              )}
            </div>

            {/* DUPR Ratings Section */}
            {profile.duprLinked && (
              <div className="space-y-4">
                {/* DUPR Singles Rating */}
                {profile.duprRatingSingles !== null && (
                  <div>
                    <Label>DUPR Singles Rating</Label>
                    <div className="mt-1 text-lg text-gray-900">
                      {formatDuprRating(profile.duprRatingSingles)}
                    </div>
                  </div>
                )}

                {/* DUPR Doubles Rating */}
                {profile.duprRatingDoubles !== null && (
                  <div>
                    <Label>DUPR Doubles Rating</Label>
                    <div className="mt-1 text-lg text-gray-900">
                      {formatDuprRating(profile.duprRatingDoubles)}
                    </div>
                  </div>
                )}

                {/* Refresh Ratings Button */}
                <div>
                  <Button
                    onClick={handleRefreshRatings}
                    disabled={isRefreshingRatings}
                    variant="outline"
                    size="sm"
                    className="flex items-center space-x-2"
                  >
                    <RefreshCw className={`h-4 w-4 ${isRefreshingRatings ? 'animate-spin' : ''}`} />
                    <span>{isRefreshingRatings ? 'Updating...' : 'Update Ratings'}</span>
                  </Button>
                </div>
              </div>
            )}

            {/* Stripe Payouts Section */}
            <div className="space-y-2">
              <Label>Payouts with Stripe</Label>
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                {payoutStatus.isLoading ? (
                  <div>Checking payout status…</div>
                ) : payoutStatus.payoutsActive ? (
                  <div>Payouts: Active</div>
                ) : (
                  <div className="space-y-2">
                    <div>
                      To accept paid registrations, connect your bank details via Stripe.
                    </div>
                    <Button
                      onClick={handleConnectStripe}
                      variant="outline"
                      size="sm"
                      className="flex items-center space-x-2"
                    >
                      <LinkIcon className="h-4 w-4" />
                      <span>Connect Stripe</span>
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            {isEditing && (
              <div className="flex space-x-3 pt-4">
                <Button
                  onClick={handleSave}
                  disabled={updateProfile.isPending || isUploadingAvatar}
                  className="flex items-center space-x-2"
                >
                  <Save className="h-4 w-4" />
                  <span>Save</span>
                </Button>
                <Button
                  onClick={handleCancel}
                  variant="outline"
                  disabled={updateProfile.isPending || isUploadingAvatar}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </Card>

        {/* Avatar Cropper Modal */}
        {cropperImageSrc && (
          <AvatarCropper
            imageSrc={cropperImageSrc}
            isOpen={showCropper}
            onClose={handleCropperClose}
            onCrop={handleCropComplete}
            aspectRatio={1}
          />
        )}

        {/* DUPR Login Modal */}
        <DUPRLoginModal
          isOpen={showDUPRModal}
          onClose={() => setShowDUPRModal(false)}
          onSuccess={handleDUPRSuccess}
        />
      </div>
    </div>
  )
}
