'use client'

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import AvatarCropper from '@/components/AvatarCropper'
import Image from 'next/image'
import { Upload, X } from 'lucide-react'

// Force dynamic rendering to prevent static generation issues
export const dynamic = 'force-dynamic'

// Helper function to resize image on client side
function resizeImage(file: File, maxSize: number = 1920): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = document.createElement('img')
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let width = img.width
        let height = img.height

        // Calculate new dimensions if image is too large
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = (height / width) * maxSize
            width = maxSize
          } else {
            width = (width / height) * maxSize
            height = maxSize
          }
        }

        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Failed to get canvas context'))
          return
        }

        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob)
            } else {
              reject(new Error('Failed to create blob'))
            }
          },
          'image/jpeg',
          0.85 // Quality
        )
      }
      img.onerror = () => reject(new Error('Failed to load image'))
      if (e.target?.result) {
        img.src = e.target.result as string
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

export default function NewTournamentPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    venueName: '',
    startDate: '',
    endDate: '',
    registrationStartDate: '',
    registrationEndDate: '',
    entryFee: '',
    isPublicBoardEnabled: false,
    allowDuprSubmission: false,
    format: 'SINGLE_ELIMINATION' as 'SINGLE_ELIMINATION' | 'ROUND_ROBIN' | 'MLP' | 'INDY_LEAGUE',
    seasonLabel: '',
    timezone: '',
    image: '',
  })
  const [showCropper, setShowCropper] = useState(false)
  const [cropperImageSrc, setCropperImageSrc] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isUploadingImage, setIsUploadingImage] = useState(false)

  const createTournament = trpc.tournament.create.useMutation({
    onSuccess: (tournament) => {
      router.push(`/admin/${tournament.id}`)
    },
    onError: (error) => {
      console.error('Error creating tournament:', error)
      alert('Error creating tournament: ' + error.message)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.title || !formData.startDate || !formData.endDate) {
      alert('Please fill in required fields')
      return
    }

    // Validate dates
    const startDate = new Date(formData.startDate)
    const endDate = new Date(formData.endDate)
    
    // End date cannot be earlier than start date
    if (endDate < startDate) {
      alert('End date cannot be earlier than start date')
      return
    }

    // Validate registration dates if provided
    if (formData.registrationStartDate || formData.registrationEndDate) {
      if (formData.registrationStartDate && formData.registrationEndDate) {
        const regStartDate = new Date(formData.registrationStartDate)
        const regEndDate = new Date(formData.registrationEndDate)
        
        // Registration end date cannot be earlier than registration start date
        if (regEndDate < regStartDate) {
          alert('Registration end date cannot be earlier than registration start date')
          return
        }
      }
      
      if (formData.registrationStartDate) {
        const regStartDate = new Date(formData.registrationStartDate)
        // Registration start date cannot be later than tournament start date
        if (regStartDate > startDate) {
          alert('Registration start date cannot be later than tournament start date')
          return
        }
      }
      
      if (formData.registrationEndDate) {
        const regEndDate = new Date(formData.registrationEndDate)
        // Registration end date cannot be later than tournament start date
        if (regEndDate > startDate) {
          alert('Registration end date cannot be later than tournament start date')
          return
        }
      }
    }

    createTournament.mutate({
      title: formData.title,
      description: formData.description || undefined,
      venueName: formData.venueName || undefined,
      startDate: formData.startDate,
      endDate: formData.endDate,
      registrationStartDate: formData.registrationStartDate || undefined,
      registrationEndDate: formData.registrationEndDate || undefined,
      entryFee: formData.entryFee ? parseFloat(formData.entryFee) : undefined,
      isPublicBoardEnabled: formData.isPublicBoardEnabled,
      allowDuprSubmission: formData.allowDuprSubmission,
      image: formData.image || undefined,
      format: formData.format,
      seasonLabel: formData.format === 'INDY_LEAGUE' ? (formData.seasonLabel || undefined) : undefined,
      timezone: formData.format === 'INDY_LEAGUE' ? (formData.timezone || undefined) : undefined,
    })
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }))
  }

  const handleCancel = useCallback(() => {
    router.back()
  }, [router])

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file')
      return
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB')
      return
    }

    // Resize image before showing cropper
    try {
      const resizedBlob = await resizeImage(file, 1920)
      const resizedUrl = URL.createObjectURL(resizedBlob)
      setCropperImageSrc(resizedUrl)
      setShowCropper(true)
    } catch (error) {
      console.error('Error resizing image:', error)
      alert('Failed to process image. Please try again.')
    }
  }

  const handleCropComplete = async (croppedImageUrl: string) => {
    setShowCropper(false)
    setIsUploadingImage(true)

    try {
      // Convert blob URL to File
      const response = await fetch(croppedImageUrl)
      const blob = await response.blob()
      
      // Resize cropped image to max 1920px before upload
      const resizedBlob = await resizeImage(
        new File([blob], 'tournament-image.jpg', { type: 'image/jpeg' }),
        1920
      )
      const file = new File([resizedBlob], 'tournament-image.jpg', { type: 'image/jpeg' })

      // Upload cropped and resized file
      const formData = new FormData()
      formData.append('file', file)

      const uploadResponse = await fetch('/api/upload-tournament-image', {
        method: 'POST',
        body: formData,
      })

      if (!uploadResponse.ok) {
        const error = await uploadResponse.json()
        throw new Error(error.error || 'Failed to upload image')
      }

      const data = await uploadResponse.json()
      setImagePreview(data.url)
      setFormData(prev => ({ ...prev, image: data.url }))
      
      // Clean up blob URLs
      URL.revokeObjectURL(croppedImageUrl)
      if (cropperImageSrc) {
        URL.revokeObjectURL(cropperImageSrc)
      }
    } catch (error) {
      console.error('Upload error:', error)
      alert('Failed to upload image. Please try again.')
      setImagePreview(null)
    } finally {
      setIsUploadingImage(false)
      setCropperImageSrc(null)
    }
  }

  const handleCropperClose = () => {
    setShowCropper(false)
    if (cropperImageSrc) {
      URL.revokeObjectURL(cropperImageSrc)
    }
    setCropperImageSrc(null)
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleRemoveImage = () => {
    setImagePreview(null)
    setFormData(prev => ({ ...prev, image: '' }))
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Create Tournament</h1>
        <p className="text-gray-600 mt-2">Fill in tournament information</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tournament Information</CardTitle>
          <CardDescription>
            Basic information about the pickleball tournament
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
                Tournament Name *
              </label>
              <input
                type="text"
                id="title"
                name="title"
                value={formData.title}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Pickleball Championship 2024"
              />
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Tournament description, rules, features..."
              />
            </div>

            {/* Tournament Image */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tournament Image
              </label>
              {imagePreview ? (
                <div className="relative inline-block">
                  <div className="relative w-48 h-48 rounded-lg overflow-hidden border border-gray-300">
                    <Image
                      src={imagePreview}
                      alt="Tournament preview"
                      fill
                      className="object-cover"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center space-x-4">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                    id="tournament-image"
                  />
                  <label
                    htmlFor="tournament-image"
                    className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-md cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <Upload className="h-4 w-4" />
                    <span>Upload Image</span>
                  </label>
                  {isUploadingImage && (
                    <span className="text-sm text-gray-500">Uploading...</span>
                  )}
                </div>
              )}
              <p className="mt-1 text-sm text-gray-500">
                Upload a square image for your tournament (max 5MB). Image will be cropped to square.
              </p>
            </div>

            <div>
              <label htmlFor="venueName" className="block text-sm font-medium text-gray-700 mb-2">
                Venue
              </label>
              <input
                type="text"
                id="venueName"
                name="venueName"
                value={formData.venueName}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Sports complex name"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-2">
                  Start Date *
                </label>
                <input
                  type="date"
                  id="startDate"
                  name="startDate"
                  value={formData.startDate}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-2">
                  End Date *
                </label>
                <input
                  type="date"
                  id="endDate"
                  name="endDate"
                  value={formData.endDate}
                  onChange={handleChange}
                  required
                  min={formData.startDate || undefined}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="registrationStartDate" className="block text-sm font-medium text-gray-700 mb-2">
                  Registration Start Date
                </label>
                <input
                  type="date"
                  id="registrationStartDate"
                  name="registrationStartDate"
                  value={formData.registrationStartDate}
                  onChange={handleChange}
                  max={formData.startDate || undefined}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label htmlFor="registrationEndDate" className="block text-sm font-medium text-gray-700 mb-2">
                  Registration End Date
                </label>
                <input
                  type="date"
                  id="registrationEndDate"
                  name="registrationEndDate"
                  value={formData.registrationEndDate}
                  onChange={handleChange}
                  min={formData.registrationStartDate || undefined}
                  max={formData.startDate || undefined}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label htmlFor="entryFee" className="block text-sm font-medium text-gray-700 mb-2">
                Entry Fee ($)
              </label>
              <input
                type="number"
                id="entryFee"
                name="entryFee"
                value={formData.entryFee}
                onChange={handleChange}
                min="0"
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.00"
              />
            </div>

            <div>
              <label htmlFor="format" className="block text-sm font-medium text-gray-700 mb-2">
                Tournament Format *
              </label>
              <select
                id="format"
                name="format"
                value={formData.format}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="SINGLE_ELIMINATION">Single Elimination</option>
                <option value="ROUND_ROBIN">Round Robin</option>
                <option value="MLP">MiLP Tournament</option>
                <option value="INDY_LEAGUE">Indy League</option>
              </select>
              <p className="mt-1 text-sm text-gray-500">
                {formData.format === 'MLP' 
                  ? 'MLP format: 4-player teams (2F + 2M), 4 games per match, tiebreaker on 2:2'
                  : formData.format === 'INDY_LEAGUE'
                  ? 'Indy League: Multi-day league format with match days and 12-game matchups'
                  : formData.format === 'ROUND_ROBIN'
                  ? 'Round Robin: Standard single elimination bracket with play-in matches'
                  : 'Standard single elimination bracket with play-in matches'}
              </p>
            </div>

            {formData.format === 'INDY_LEAGUE' && (
              <>
                <div>
                  <label htmlFor="seasonLabel" className="block text-sm font-medium text-gray-700 mb-2">
                    Season Label
                  </label>
                  <input
                    type="text"
                    id="seasonLabel"
                    name="seasonLabel"
                    value={formData.seasonLabel}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Spring 2024"
                  />
                </div>

                <div>
                  <label htmlFor="timezone" className="block text-sm font-medium text-gray-700 mb-2">
                    Timezone
                  </label>
                  <input
                    type="text"
                    id="timezone"
                    name="timezone"
                    value={formData.timezone}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., America/New_York"
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    IANA timezone identifier (optional)
                  </p>
                </div>
              </>
            )}

            <div className="flex items-center">
              <input
                type="checkbox"
                id="isPublicBoardEnabled"
                name="isPublicBoardEnabled"
                checked={formData.isPublicBoardEnabled}
                onChange={handleChange}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="isPublicBoardEnabled" className="ml-2 block text-sm text-gray-700">
                Enable public results board
              </label>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="allowDuprSubmission"
                name="allowDuprSubmission"
                checked={formData.allowDuprSubmission}
                onChange={handleChange}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="allowDuprSubmission" className="ml-2 block text-sm text-gray-700">
                Allow sending results to DUPR
              </label>
            </div>

            <div className="flex justify-end space-x-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createTournament.isPending}
              >
                {createTournament.isPending ? 'Creating...' : 'Create Tournament'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Image Cropper Modal */}
      {cropperImageSrc && (
        <AvatarCropper
          imageSrc={cropperImageSrc}
          isOpen={showCropper}
          onClose={handleCropperClose}
          onCrop={handleCropComplete}
          aspectRatio={1}
          title="Crop Tournament Image"
        />
      )}
    </div>
  )
}
