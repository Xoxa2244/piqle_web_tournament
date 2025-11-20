'use client'

import { trpc } from '@/lib/trpc'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import Image from 'next/image'
import { User as UserIcon, Save, ArrowLeft, Upload, Camera } from 'lucide-react'
import Link from 'next/link'

export default function ProfilePage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { data: profile, isLoading, refetch } = trpc.user.getProfile.useQuery()
  const updateProfile = trpc.user.updateProfile.useMutation({
    onSuccess: () => {
      refetch()
      setIsEditing(false)
      setIsUploadingAvatar(false)
    },
  })

  const [isEditing, setIsEditing] = useState(false)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
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
    }
  }, [profile, isEditing])

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
      alert('Please select an image file')
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB')
      return
    }

    // Create preview
    const reader = new FileReader()
    reader.onload = (e) => {
      setAvatarPreview(e.target?.result as string)
    }
    reader.readAsDataURL(file)

    // Upload file
    setIsUploadingAvatar(true)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch('/api/upload-avatar', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to upload avatar')
      }

      const data = await response.json()
      setAvatarPreview(data.url)
    } catch (error) {
      console.error('Upload error:', error)
      alert('Failed to upload avatar. Please try again.')
      setAvatarPreview(null)
    } finally {
      setIsUploadingAvatar(false)
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
                {currentAvatar ? (
                  <Image
                    src={currentAvatar}
                    alt={profile.name || 'User'}
                    width={100}
                    height={100}
                    className="rounded-full object-cover"
                  />
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
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
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
                <div className="mt-1 text-lg text-gray-400">
                  {profile.duprLink ? (
                    <span className="opacity-50">{profile.duprLink}</span>
                  ) : (
                    'Not specified'
                  )}
                </div>
              )}
              {isEditing && (
                <p className="mt-1 text-xs text-gray-400">This feature is temporarily unavailable</p>
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
    </div>
  )
}
