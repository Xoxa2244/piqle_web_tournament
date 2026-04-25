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
import { User as UserIcon, Save, ArrowLeft, Upload, Camera, Link as LinkIcon, RefreshCw, Unlink, Users, Trophy, Medal } from 'lucide-react'
import Link from 'next/link'
import AvatarCropper from '@/components/AvatarCropper'
import CityAutocomplete from '@/components/CityAutocomplete'
import DUPRLoginModal from '@/components/DUPRLoginModal'
import ConfirmModal from '@/components/ConfirmModal'
import { formatDuprRating } from '@/lib/utils'
import { toast } from '@/components/ui/use-toast'

function normalizeAdminReminderChannel(value: string | null | undefined): 'in_app' | 'email' | 'sms' | 'both' {
  return value === 'email' || value === 'sms' || value === 'both' ? value : 'in_app'
}

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
  const [showUnlinkDUPRConfirm, setShowUnlinkDUPRConfirm] = useState(false)
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
    phone: '',
    smsOptIn: false,
    adminReminderEmail: '',
    adminReminderPhone: '',
    adminReminderChannel: 'in_app' as 'in_app' | 'email' | 'sms' | 'both',
  })

  // Initialize form data when profile loads
  useEffect(() => {
    if (profile && !isEditing) {
      setFormData({
        name: profile.name || '',
        gender: profile.gender || '',
        city: profile.city || '',
        duprLink: profile.duprLink || '',
        phone: profile.phone || '',
        smsOptIn: profile.smsOptIn || false,
        adminReminderEmail: profile.adminReminderEmail || '',
        adminReminderPhone: profile.adminReminderPhone || '',
        adminReminderChannel: normalizeAdminReminderChannel(profile.adminReminderChannel),
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
      const returnUrl = typeof window !== 'undefined' ? window.location.href : undefined
      const response = await fetch('/api/stripe/create-account-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnUrl, refreshUrl: returnUrl }),
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

  const handleUnlinkDUPRClick = () => setShowUnlinkDUPRConfirm(true)

  const handleUnlinkDUPRConfirm = async () => {
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
      setShowUnlinkDUPRConfirm(false)
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
        phone: profile.phone || '',
        smsOptIn: profile.smsOptIn || false,
        adminReminderEmail: profile.adminReminderEmail || '',
        adminReminderPhone: profile.adminReminderPhone || '',
        adminReminderChannel: normalizeAdminReminderChannel(profile.adminReminderChannel),
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
      phone: formData.phone,
      smsOptIn: formData.smsOptIn,
      adminReminderEmail: formData.adminReminderEmail,
      adminReminderPhone: formData.adminReminderPhone,
      adminReminderChannel: formData.adminReminderChannel,
    })
  }

  const handleCancel = () => {
    if (profile) {
      setFormData({
        name: profile.name || '',
        gender: profile.gender || '',
        city: profile.city || '',
        duprLink: profile.duprLink || '',
        phone: profile.phone || '',
        smsOptIn: profile.smsOptIn || false,
        adminReminderEmail: profile.adminReminderEmail || '',
        adminReminderPhone: profile.adminReminderPhone || '',
        adminReminderChannel: normalizeAdminReminderChannel(profile.adminReminderChannel),
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

  const singles = formatDuprRating(profile.duprRatingSingles)
  const doubles = formatDuprRating(profile.duprRatingDoubles)
  const clubsCount = (profile as any).clubsJoinedCount ?? 0
  const playedCount = (profile as any).tournamentsPlayedCount ?? 0
  const createdCount = (profile as any).tournamentsCreatedCount ?? 0
  const adminReminderChannelLabels: Record<'in_app' | 'email' | 'sms' | 'both', string> = {
    in_app: 'In-app only',
    email: 'Email',
    sms: 'SMS',
    both: 'Email + SMS',
  }

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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
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

            {/* Account Email */}
            <div>
              <Label>Account Email</Label>
              <div className="mt-1 text-lg text-gray-900">
                {profile.email || 'Not specified'}
              </div>
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
                        onClick={handleUnlinkDUPRClick}
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

            {/* SMS Notifications */}
            <div className="border-t pt-4 mt-4">
              <Label>SMS Notifications</Label>
              {isEditing ? (
                <div className="mt-2 space-y-3">
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+1 (555) 123-4567"
                  />
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.smsOptIn}
                      onChange={(e) => setFormData({ ...formData, smsOptIn: e.target.checked })}
                      disabled={!formData.phone}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300"
                    />
                    <span className="text-xs text-muted-foreground leading-relaxed">
                      I agree to receive recurring automated SMS notifications from IQSport about my club
                      activity including booking reminders, session invites, and event updates.
                      Message frequency: 2-8 msgs/month. Msg &amp; data rates may apply.
                      Reply STOP to opt out anytime.{' '}
                      <a href="/sms-terms" target="_blank" className="text-blue-600 underline">SMS Terms</a>
                      {' · '}
                      <a href="/privacy" target="_blank" className="text-blue-600 underline">Privacy Policy</a>
                    </span>
                  </label>
                </div>
              ) : (
                <div className="mt-1 text-sm text-gray-600">
                  {profile?.phone ? (
                    <span>
                      {profile.phone} — {profile.smsOptIn ? '✓ Opted in' : 'Not opted in'}
                    </span>
                  ) : (
                    <span className="text-gray-400">No phone number. Edit profile to add.</span>
                  )}
                </div>
              )}
            </div>

            {/* Agent Reminder Contacts */}
            <div className="border-t pt-4 mt-4 space-y-3">
              <div>
                <Label>Agent Reminder Contacts</Label>
                <p className="mt-1 text-xs text-gray-500">
                  These contacts are used for admin reminders from the AI Agent when you choose email or SMS delivery.
                </p>
              </div>

              {isEditing ? (
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="adminReminderChannel">Reminder delivery</Label>
                    <select
                      id="adminReminderChannel"
                      value={formData.adminReminderChannel}
                      onChange={(e) => setFormData({
                        ...formData,
                        adminReminderChannel: e.target.value as 'in_app' | 'email' | 'sms' | 'both',
                      })}
                      className="mt-1 flex h-10 w-full rounded-md border border-input bg-background pl-3 py-2 text-sm pr-[2.5rem]"
                    >
                      <option value="in_app">In-app only</option>
                      <option value="email">Email me</option>
                      <option value="sms">Text me</option>
                      <option value="both">Email + SMS</option>
                    </select>
                  </div>

                  <div>
                    <Label htmlFor="adminReminderEmail">Reminder email</Label>
                    <Input
                      id="adminReminderEmail"
                      type="email"
                      value={formData.adminReminderEmail}
                      onChange={(e) => setFormData({ ...formData, adminReminderEmail: e.target.value })}
                      className="mt-1"
                      placeholder={profile.email || 'name@example.com'}
                    />
                  </div>

                  <div>
                    <Label htmlFor="adminReminderPhone">Reminder phone</Label>
                    <Input
                      id="adminReminderPhone"
                      type="tel"
                      value={formData.adminReminderPhone}
                      onChange={(e) => setFormData({ ...formData, adminReminderPhone: e.target.value })}
                      className="mt-1"
                      placeholder="+1 (555) 123-4567"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-1 text-sm text-gray-600">
                  <div>
                    Delivery: {adminReminderChannelLabels[(profile.adminReminderChannel || 'in_app') as 'in_app' | 'email' | 'sms' | 'both']}
                  </div>
                  <div>
                    Email: {profile.adminReminderEmail || <span className="text-gray-400">Not set</span>}
                  </div>
                  <div>
                    Phone: {profile.adminReminderPhone || <span className="text-gray-400">Not set</span>}
                  </div>
                </div>
              )}
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
          </div>

          {/* Правая колонка: рейтинги и статистика как на карточках /players */}
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
        <ConfirmModal
          open={showUnlinkDUPRConfirm}
          onClose={() => setShowUnlinkDUPRConfirm(false)}
          onConfirm={handleUnlinkDUPRConfirm}
          isPending={isUnlinkingDUPR}
          destructive
          title="Unlink DUPR account?"
          description="Are you sure you want to unlink your DUPR account? You will need to reconnect it to use DUPR features."
          confirmText={isUnlinkingDUPR ? 'Unlinking…' : 'Unlink'}
        />
      </div>
    </div>
  )
}
