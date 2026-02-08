'use client'

import { Suspense, useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import AvatarCropper from '@/components/AvatarCropper'
import StructureSetupModal, { TournamentStructureInput } from '@/components/StructureSetupModal'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, Layers, Upload, X } from 'lucide-react'
import { loadGoogleMaps } from '@/lib/googleMapsLoader'
import { calculateOrganizerNetCents, fromCents, toCents } from '@/lib/payment'

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

const CREATE_TOURNAMENT_STEPS = [
  { key: 'basics', title: 'Basics', description: 'Club, template, venue' },
  { key: 'schedule', title: 'Schedule', description: 'Dates and registration' },
  { key: 'format', title: 'Format', description: 'Structure and rules' },
  { key: 'publish', title: 'Publish', description: 'Pricing and visibility' },
] as const

export default function NewTournamentPage() {
  // Next.js requires `useSearchParams()` to be wrapped in a Suspense boundary.
  return (
    <Suspense fallback={<div className="px-6 py-8 text-sm text-muted-foreground">Loading…</div>}>
      <NewTournamentPageInner />
    </Suspense>
  )
}

function NewTournamentPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const prefillAppliedRef = useRef(false)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    clubId: '',
    venueName: '',
    venueAddress: '',
    startDate: '',
    endDate: '',
    registrationStartDate: '',
    registrationEndDate: '',
    entryFee: '',
    isPublicBoardEnabled: true,
    allowDuprSubmission: false,
    format: 'SINGLE_ELIMINATION' as
      | 'SINGLE_ELIMINATION'
      | 'ROUND_ROBIN'
      | 'MLP'
      | 'INDY_LEAGUE'
      | 'LEAGUE_ROUND_ROBIN'
      | 'ONE_DAY_LADDER'
      | 'LADDER_LEAGUE',
    seasonLabel: '',
    timezone: '',
    image: '',
  })
  const [stepIndex, setStepIndex] = useState(0)
  const [showCropper, setShowCropper] = useState(false)
  const [cropperImageSrc, setCropperImageSrc] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [showStructureModal, setShowStructureModal] = useState(false)
  const [structureDraft, setStructureDraft] = useState<TournamentStructureInput | null>(null)
  const [templateDraftOpen, setTemplateDraftOpen] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [templateDraftForm, setTemplateDraftForm] = useState({
    title: '',
    startDate: '',
    endDate: '',
    registrationStartDate: '',
    registrationEndDate: '',
    entryFee: '',
  })
  const [requiredErrors, setRequiredErrors] = useState({
    title: false,
    startDate: false,
    endDate: false,
  })
  const [addressError, setAddressError] = useState<string | null>(null)
  const venueAddressInputRef = useRef<HTMLInputElement>(null)
  const addressAutocompleteRef = useRef<any>(null)
  const addressListenerRef = useRef<any>(null)
  const googleRef = useRef<any>(null)
  const [payoutStatus, setPayoutStatus] = useState<{
    hasAccount: boolean
    payoutsActive: boolean
    isLoading: boolean
  }>({ hasAccount: false, payoutsActive: false, isLoading: true })

  const createTournamentWithStructure = trpc.tournament.createWithStructure.useMutation({
    onSuccess: (tournament) => {
      router.push(`/admin/${tournament.id}`)
    },
    onError: (error) => {
      console.error('Error creating tournament structure:', error)
      alert('Error creating tournament structure: ' + error.message)
    },
  })

  const { data: clubs } = trpc.club.list.useQuery(undefined)
  const selectedClub = useMemo(
    () => (clubs ?? []).find((c) => c.id === formData.clubId) ?? null,
    [clubs, formData.clubId]
  )
  const adminClubs = useMemo(() => (clubs ?? []).filter((c) => (c as any).isAdmin), [clubs])

  const { data: templates, isLoading: templatesLoading, error: templatesError } =
    trpc.clubTemplate.list.useQuery(
      { clubId: formData.clubId },
      { enabled: Boolean(formData.clubId && (selectedClub as any)?.isAdmin) }
    )

  const createDraftFromTemplate = trpc.clubTemplate.createDraftFromTemplate.useMutation()

  useEffect(() => {
    if (prefillAppliedRef.current) return
    const clubIdFromQuery = searchParams.get('clubId')
    if (!clubIdFromQuery) return
    if (!clubs?.length) return

    const selected = clubs.find((c) => c.id === clubIdFromQuery)
    prefillAppliedRef.current = true
    if (!selected) return

    const selectedIsAdmin = Boolean((selected as any).isAdmin)
    setFormData((prev) => {
      if (prev.clubId) return prev
      return {
        ...prev,
        clubId: selectedIsAdmin ? selected.id : '',
        venueName: selected.name,
        venueAddress: selected.address || prev.venueAddress,
      }
    })
  }, [clubs, searchParams])

  const validateBaseForm = () => {
    const nextErrors = {
      title: !formData.title,
      startDate: !formData.startDate,
      endDate: !formData.endDate,
    }

    setRequiredErrors(nextErrors)

    if (nextErrors.title || nextErrors.startDate || nextErrors.endDate) {
      alert('Please fill in required fields')
      return false
    }

    const startDate = new Date(formData.startDate)
    const endDate = new Date(formData.endDate)
    if (endDate < startDate) {
      alert('End date cannot be earlier than start date')
      return false
    }

    if (formData.registrationStartDate || formData.registrationEndDate) {
      if (formData.registrationStartDate && formData.registrationEndDate) {
        const regStartDate = new Date(formData.registrationStartDate)
        const regEndDate = new Date(formData.registrationEndDate)
        if (regEndDate < regStartDate) {
          alert('Registration end date cannot be earlier than registration start date')
          return false
        }
      }

      if (formData.registrationStartDate) {
        const regStartDate = new Date(formData.registrationStartDate)
        if (regStartDate > startDate) {
          alert('Registration start date cannot be later than tournament start date')
          return false
        }
      }

      if (formData.registrationEndDate) {
        const regEndDate = new Date(formData.registrationEndDate)
        if (regEndDate > startDate) {
          alert('Registration end date cannot be later than tournament start date')
          return false
        }
      }
    }

    return true
  }

  const currentStep = CREATE_TOURNAMENT_STEPS[stepIndex] ?? CREATE_TOURNAMENT_STEPS[0]
  const totalSteps = CREATE_TOURNAMENT_STEPS.length

  const validateBasicsStep = () => {
    const titleOk = Boolean(formData.title.trim())
    setRequiredErrors((prev) => ({ ...prev, title: !titleOk }))
    if (!titleOk) {
      alert('Tournament name is required')
      return false
    }
    return true
  }

  const validateScheduleStep = () => {
    const startOk = Boolean(formData.startDate)
    const endOk = Boolean(formData.endDate)
    setRequiredErrors((prev) => ({ ...prev, startDate: !startOk, endDate: !endOk }))
    if (!startOk || !endOk) {
      alert('Start and end dates are required')
      return false
    }

    const startDate = new Date(formData.startDate)
    const endDate = new Date(formData.endDate)
    if (endDate < startDate) {
      alert('End date cannot be earlier than start date')
      return false
    }

    if (formData.registrationStartDate || formData.registrationEndDate) {
      if (formData.registrationStartDate && formData.registrationEndDate) {
        const regStartDate = new Date(formData.registrationStartDate)
        const regEndDate = new Date(formData.registrationEndDate)
        if (regEndDate < regStartDate) {
          alert('Registration end date cannot be earlier than registration start date')
          return false
        }
      }

      if (formData.registrationStartDate) {
        const regStartDate = new Date(formData.registrationStartDate)
        if (regStartDate > startDate) {
          alert('Registration start date cannot be later than tournament start date')
          return false
        }
      }

      if (formData.registrationEndDate) {
        const regEndDate = new Date(formData.registrationEndDate)
        if (regEndDate > startDate) {
          alert('Registration end date cannot be later than tournament start date')
          return false
        }
      }
    }

    return true
  }

  const validateFormatStep = () => {
    if (!structureDraft) {
      alert('Set up structure (divisions / team counts) before continuing.')
      setShowStructureModal(true)
      return false
    }

    const isLadder =
      formData.format === 'ONE_DAY_LADDER' || formData.format === 'LADDER_LEAGUE'

    const divisions =
      structureDraft.mode === 'WITH_DIVISIONS'
        ? structureDraft.divisions
        : [
            {
              name: 'Main',
              poolCount: 0,
              teamCount: structureDraft.teamCount ?? 0,
              playersPerTeam: structureDraft.playersPerTeam,
            },
          ]

    if (isLadder) {
      const hasSingles = divisions.some((d) => d.playersPerTeam === 1)
      if (hasSingles) {
        alert('Ladder formats currently require teams (not 1v1). Choose doubles or squad.')
        return false
      }
    }

    if (formData.format === 'ONE_DAY_LADDER') {
      const odd = divisions.find((d) => (d.teamCount ?? 0) % 2 !== 0)
      if (odd) {
        alert('One-day ladder requires an even number of teams per division.')
        return false
      }
    }

    return true
  }

  const goBack = () => setStepIndex((i) => Math.max(0, i - 1))
  const goNext = () => {
    if (stepIndex === 0) {
      if (!validateBasicsStep()) return
      setStepIndex(1)
      return
    }
    if (stepIndex === 1) {
      if (!validateScheduleStep()) return
      setStepIndex(2)
      return
    }
    if (stepIndex === 2) {
      if (!validateFormatStep()) return
      setStepIndex(3)
      return
    }
    setStepIndex((i) => Math.min(totalSteps - 1, i + 1))
  }

  const setupAddressAutocomplete = useCallback(async () => {
    if (!venueAddressInputRef.current) return

    try {
      const googleApi = await loadGoogleMaps({
        apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '',
        libraries: ['places'],
      })

      googleRef.current = googleApi

      if (addressAutocompleteRef.current) return

      addressAutocompleteRef.current = new googleApi.maps.places.Autocomplete(
        venueAddressInputRef.current,
        {
          fields: ['formatted_address', 'geometry', 'place_id'],
          types: ['geocode'],
        }
      )

      addressListenerRef.current =
        addressAutocompleteRef.current.addListener('place_changed', () => {
          const place = addressAutocompleteRef.current?.getPlace()
          if (!place?.formatted_address) {
            setAddressError('Select a valid address from the list.')
            return
          }

          setAddressError(null)
          setFormData((prev) => ({
            ...prev,
            venueAddress: place.formatted_address,
          }))
        })
    } catch (error) {
      setAddressError(
        error instanceof Error ? error.message : 'Failed to load Google Places.'
      )
    }
  }, [])

  useEffect(() => {
    setupAddressAutocomplete()
    return () => {
      addressListenerRef.current?.remove?.()
    }
  }, [setupAddressAutocomplete])

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
      alert(error.message || 'Failed to start Stripe onboarding')
    }
  }

  const handleVenueAddressBlur = async () => {
    if (!formData.venueAddress.trim()) return

    try {
      const googleApi =
        googleRef.current ??
        (await loadGoogleMaps({
          apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '',
          libraries: ['places'],
        }))

      googleRef.current = googleApi
      const geocoder = new googleApi.maps.Geocoder()
      geocoder.geocode(
        { address: formData.venueAddress },
        (results: any, status: any) => {
          if (status !== 'OK' || !results?.length) {
            setAddressError('Select a valid address from the list.')
            return
          }

          const result = results[0]
          if (!result?.formatted_address) {
            setAddressError('Select a valid address from the list.')
            return
          }

          setAddressError(null)
          setFormData((prev) => ({
            ...prev,
            venueAddress: result.formatted_address,
          }))
        }
      )
    } catch (error) {
      setAddressError(
        error instanceof Error ? error.message : 'Failed to load Google Places.'
      )
    }
  }

  const parsedEntryFee = Number(formData.entryFee)
  const entryFeeCents =
    Number.isFinite(parsedEntryFee) && parsedEntryFee > 0
      ? toCents(parsedEntryFee)
      : 0
  const organizerBreakdown = calculateOrganizerNetCents(entryFeeCents)
  const requiresPayoutsSetup =
    entryFeeCents > 0 && (!payoutStatus.payoutsActive || payoutStatus.isLoading)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateBaseForm()) {
      // Jump user to the step with the missing required fields.
      if (!formData.title.trim()) setStepIndex(0)
      else setStepIndex(1)
      return
    }
    if (!validateFormatStep()) {
      setStepIndex(2)
      return
    }
    if (requiresPayoutsSetup) {
      alert('Connect payouts with Stripe before creating a paid tournament.')
      return
    }

    const payload = {
      title: formData.title,
      description: formData.description || undefined,
      venueName: formData.venueName || undefined,
      venueAddress: formData.venueAddress || undefined,
      clubId: formData.clubId || undefined,
      startDate: formData.startDate,
      endDate: formData.endDate,
      registrationStartDate: formData.registrationStartDate || undefined,
      registrationEndDate: formData.registrationEndDate || undefined,
      entryFeeCents: entryFeeCents || 0,
      currency: 'usd' as const,
      isPublicBoardEnabled: formData.isPublicBoardEnabled,
      allowDuprSubmission: formData.allowDuprSubmission,
      image: formData.image || undefined,
      format: formData.format,
      seasonLabel:
        formData.format === 'INDY_LEAGUE' || formData.format === 'LADDER_LEAGUE'
          ? (formData.seasonLabel || undefined)
          : undefined,
      timezone:
        formData.format === 'INDY_LEAGUE' || formData.format === 'LADDER_LEAGUE'
          ? (formData.timezone || undefined)
          : undefined,
    }

    createTournamentWithStructure.mutate({
      ...payload,
      structure: structureDraft!,
    })
  }

  const handleStructureSave = (structure: TournamentStructureInput) => {
    setStructureDraft(structure)
    setShowStructureModal(false)
  }

  const selectedTemplate = useMemo(
    () => (templates ?? []).find((t: any) => t.id === selectedTemplateId) ?? null,
    [templates, selectedTemplateId]
  )

  const openTemplateDraftModal = () => {
    if (!selectedTemplateId) {
      alert('Choose a template first')
      return
    }
    const today = new Date().toISOString().slice(0, 10)
    const start = formData.startDate || today
    const end = formData.endDate || start
    setTemplateDraftForm({
      title: '',
      startDate: start,
      endDate: end,
      registrationStartDate: '',
      registrationEndDate: '',
      entryFee: formData.entryFee || '',
    })
    setTemplateDraftOpen(true)
  }

  const validateTemplateDraft = () => {
    if (!templateDraftForm.startDate || !templateDraftForm.endDate) {
      alert('Start and end dates are required')
      return false
    }
    const startDate = new Date(templateDraftForm.startDate)
    const endDate = new Date(templateDraftForm.endDate)
    if (endDate < startDate) {
      alert('End date cannot be earlier than start date')
      return false
    }

    if (templateDraftForm.registrationStartDate || templateDraftForm.registrationEndDate) {
      if (templateDraftForm.registrationStartDate && templateDraftForm.registrationEndDate) {
        const regStartDate = new Date(templateDraftForm.registrationStartDate)
        const regEndDate = new Date(templateDraftForm.registrationEndDate)
        if (regEndDate < regStartDate) {
          alert('Registration end date cannot be earlier than registration start date')
          return false
        }
      }

      if (templateDraftForm.registrationStartDate) {
        const regStartDate = new Date(templateDraftForm.registrationStartDate)
        if (regStartDate > startDate) {
          alert('Registration start date cannot be later than tournament start date')
          return false
        }
      }

      if (templateDraftForm.registrationEndDate) {
        const regEndDate = new Date(templateDraftForm.registrationEndDate)
        if (regEndDate > startDate) {
          alert('Registration end date cannot be later than tournament start date')
          return false
        }
      }
    }

    return true
  }

  const handleCreateFromTemplate = async () => {
    if (!selectedTemplateId) return
    if (!validateTemplateDraft()) return

    const parsedFee = Number(templateDraftForm.entryFee)
    const entryFeeCents =
      Number.isFinite(parsedFee) && parsedFee > 0 ? toCents(parsedFee) : undefined

    const templateRequiresPayouts =
      (entryFeeCents ?? 0) > 0 && (!payoutStatus.payoutsActive || payoutStatus.isLoading)

    if (templateRequiresPayouts) {
      alert('Connect payouts with Stripe before creating a paid tournament.')
      return
    }

    try {
      const res = await createDraftFromTemplate.mutateAsync({
        templateId: selectedTemplateId,
        title: templateDraftForm.title.trim() ? templateDraftForm.title.trim() : undefined,
        startDate: templateDraftForm.startDate,
        endDate: templateDraftForm.endDate,
        registrationStartDate: templateDraftForm.registrationStartDate || undefined,
        registrationEndDate: templateDraftForm.registrationEndDate || undefined,
        entryFeeCents,
      })
      setTemplateDraftOpen(false)
      router.push(`/admin/${res.tournamentId}`)
    } catch (err: any) {
      alert(err?.message || 'Failed to create from template')
    }
  }

  const handleClubSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value
    setSelectedTemplateId('')
    setFormData((prev) => {
      const next = { ...prev, clubId: selectedId }
      if (!selectedId) return next
      const selected = clubs?.find((c) => c.id === selectedId)
      if (!selected) return next
      return {
        ...next,
        venueName: selected.name,
        venueAddress: selected.address || prev.venueAddress,
      }
    })
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }))
    if (name === 'format') {
      setStructureDraft(null)
    }
    if (name === 'title' || name === 'startDate' || name === 'endDate') {
      setRequiredErrors(prev => ({
        ...prev,
        [name]: !value,
      }))
    }
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
      <div className="mb-8 space-y-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Create Tournament</h1>
          <p className="text-gray-600 mt-2">
            Step {stepIndex + 1} of {totalSteps}: <span className="font-medium text-gray-900">{currentStep.title}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {CREATE_TOURNAMENT_STEPS.map((s, idx) => {
            const isActive = idx === stepIndex
            const isDone = idx < stepIndex
            return (
              <div
                key={s.key}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
                  isActive
                    ? 'border-blue-200 bg-blue-50 text-blue-900'
                    : isDone
                      ? 'border-gray-200 bg-white text-gray-700'
                      : 'border-gray-200 bg-gray-50 text-gray-500'
                }`}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                    isActive ? 'bg-blue-600 text-white' : isDone ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-700'
                  }`}
                >
                  {idx + 1}
                </span>
                <span className="font-medium">{s.title}</span>
              </div>
            )
          })}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{currentStep.title}</CardTitle>
          <CardDescription>{currentStep.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {stepIndex === 0 ? (
              <>
                <div>
                  <label htmlFor="clubId" className="block text-sm font-medium text-gray-700 mb-2">
                    Host Club (optional)
                  </label>
                  <select
                    id="clubId"
                    name="clubId"
                    value={formData.clubId}
                    onChange={handleClubSelect}
                    className="w-full pl-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-[2.5rem] bg-white"
                  >
                    <option value="">No club (custom venue)</option>
                    {(adminClubs ?? []).map((club: any) => (
                      <option key={club.id} value={club.id}>
                        {club.name}
                        {club.city || club.state
                          ? ` — ${club.city ?? ''}${club.city && club.state ? ', ' : ''}${club.state ?? ''}`
                          : ''}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    Only clubs where you are an admin are shown.
                  </p>
                </div>

                {formData.clubId && (selectedClub as any)?.isAdmin ? (
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                      <Layers className="h-4 w-4" />
                      Start from a template (optional)
                    </div>
                    {templatesLoading ? (
                      <div className="text-sm text-gray-500">Loading templates…</div>
                    ) : templatesError ? (
                      <div className="text-sm text-red-700">
                        {templatesError.message || 'Failed to load templates.'}
                      </div>
                    ) : (templates?.length ?? 0) === 0 ? (
                      <div className="text-sm text-gray-600">
                        No templates yet. Create a club tournament and click <span className="font-medium">Save as template</span>.
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row gap-2">
                        <select
                          value={selectedTemplateId}
                          onChange={(e) => setSelectedTemplateId(e.target.value)}
                          className="flex-1 pl-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-[2.5rem] bg-white"
                        >
                          <option value="">Choose template…</option>
                          {(templates ?? []).map((t: any) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                              {t.format ? ` — ${String(t.format).replace(/_/g, ' ')}` : ''}
                            </option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          onClick={openTemplateDraftModal}
                          disabled={!selectedTemplateId || createDraftFromTemplate.isPending}
                        >
                          Create draft
                        </Button>
                      </div>
                    )}
                    {selectedTemplate ? (
                      <div className="text-xs text-gray-600">
                        Selected: <span className="font-medium">{selectedTemplate.name}</span>
                      </div>
                    ) : null}
                    <div className="text-xs text-gray-500">
                      Creates a draft tournament (not public) and takes you to the admin page.
                    </div>
                  </div>
                ) : null}

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
                    className={`w-full pl-3 py-2 border rounded-md focus:outline-none focus:ring-2 pr-[2.5rem] ${
                      requiredErrors.title ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'
                    }`}
                    placeholder="e.g., Pickleball Championship 2024"
                  />
                  {requiredErrors.title ? (
                    <p className="mt-1 text-sm text-red-600">Tournament name is required.</p>
                  ) : null}
                </div>

                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                    Description (optional)
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    rows={3}
                    className="w-full pl-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-[2.5rem]"
                    placeholder="Tournament description, rules, features..."
                  />
                </div>

                <div>
                  <label htmlFor="venueName" className="block text-sm font-medium text-gray-700 mb-2">
                    Venue Name (optional)
                  </label>
                  <input
                    type="text"
                    id="venueName"
                    name="venueName"
                    value={formData.venueName}
                    onChange={handleChange}
                    className="w-full pl-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-[2.5rem]"
                    placeholder="e.g., Chicago Pickleball Center"
                  />
                </div>

                <div>
                  <label htmlFor="venueAddress" className="block text-sm font-medium text-gray-700 mb-2">
                    Venue Address (optional)
                  </label>
                  <input
                    type="text"
                    id="venueAddress"
                    name="venueAddress"
                    ref={venueAddressInputRef}
                    value={formData.venueAddress}
                    onChange={handleChange}
                    onBlur={handleVenueAddressBlur}
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full pl-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-[2.5rem]"
                    placeholder="Start typing the address..."
                  />
                  {addressError ? (
                    <p className="mt-1 text-sm text-red-600">{addressError}</p>
                  ) : null}
                </div>
              </>
            ) : null}

            {stepIndex === 1 ? (
              <>
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
                      className={`w-full pl-3 py-2 border rounded-md focus:outline-none focus:ring-2 pr-[2.5rem] ${
                        requiredErrors.startDate ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'
                      }`}
                    />
                    {requiredErrors.startDate ? (
                      <p className="mt-1 text-sm text-red-600">Start date is required.</p>
                    ) : null}
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
                      min={formData.startDate || undefined}
                      className={`w-full pl-3 py-2 border rounded-md focus:outline-none focus:ring-2 pr-[2.5rem] ${
                        requiredErrors.endDate ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'
                      }`}
                    />
                    {requiredErrors.endDate ? (
                      <p className="mt-1 text-sm text-red-600">End date is required.</p>
                    ) : null}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="registrationStartDate" className="block text-sm font-medium text-gray-700 mb-2">
                      Registration Start Date (optional)
                    </label>
                    <input
                      type="date"
                      id="registrationStartDate"
                      name="registrationStartDate"
                      value={formData.registrationStartDate}
                      onChange={handleChange}
                      max={formData.startDate || undefined}
                      className="w-full pl-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-[2.5rem]"
                    />
                  </div>

                  <div>
                    <label htmlFor="registrationEndDate" className="block text-sm font-medium text-gray-700 mb-2">
                      Registration End Date (optional)
                    </label>
                    <input
                      type="date"
                      id="registrationEndDate"
                      name="registrationEndDate"
                      value={formData.registrationEndDate}
                      onChange={handleChange}
                      min={formData.registrationStartDate || undefined}
                      max={formData.startDate || undefined}
                      className="w-full pl-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-[2.5rem]"
                    />
                  </div>
                </div>
              </>
            ) : null}

            {stepIndex === 2 ? (
              <>
                <div>
                  <label htmlFor="format" className="block text-sm font-medium text-gray-700 mb-2">
                    Tournament Format *
                  </label>
                  <select
                    id="format"
                    name="format"
                    value={formData.format}
                    onChange={handleChange}
                    className="w-full pl-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-[2.5rem]"
                  >
                    <option value="SINGLE_ELIMINATION">Round Robin + Single elimination</option>
                    <option value="ROUND_ROBIN">Round Robin</option>
                    <option value="LEAGUE_ROUND_ROBIN">League Round Robin</option>
                    <option value="ONE_DAY_LADDER">One-day Ladder</option>
                    <option value="LADDER_LEAGUE">Ladder League</option>
                    <option value="MLP">MiLP Tournament</option>
                    <option value="INDY_LEAGUE">Indy League</option>
                  </select>
                  <p className="mt-1 text-sm text-gray-500">
                    {formData.format === 'MLP'
                      ? 'MLP: 4-player teams (2F + 2M), 4 games per match, tiebreaker on 2:2'
                      : formData.format === 'INDY_LEAGUE'
                        ? 'Indy League: Multi-day league format with match days and 12-game matchups'
                        : formData.format === 'ONE_DAY_LADDER'
                          ? 'One-day Ladder: play on courts; winners move up, losers move down (fixed pairs/teams)'
                          : formData.format === 'LADDER_LEAGUE'
                            ? 'Ladder League: weekly pods, round robin each week, promote/demote between pods'
                            : formData.format === 'ROUND_ROBIN'
                              ? 'Round Robin: Standard single elimination bracket with play-in matches'
                              : formData.format === 'LEAGUE_ROUND_ROBIN'
                                ? 'League RR: round robin with match days; stats per day and all days'
                                : 'Standard single elimination bracket with play-in matches'}
                  </p>
                </div>

                {(formData.format === 'INDY_LEAGUE' || formData.format === 'LADDER_LEAGUE') ? (
                  <>
                    <div>
                      <label htmlFor="seasonLabel" className="block text-sm font-medium text-gray-700 mb-2">
                        Season Label (optional)
                      </label>
                      <input
                        type="text"
                        id="seasonLabel"
                        name="seasonLabel"
                        value={formData.seasonLabel}
                        onChange={handleChange}
                        className="w-full pl-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-[2.5rem]"
                        placeholder="e.g., Spring 2024"
                      />
                    </div>

                    <div>
                      <label htmlFor="timezone" className="block text-sm font-medium text-gray-700 mb-2">
                        Timezone (optional)
                      </label>
                      <input
                        type="text"
                        id="timezone"
                        name="timezone"
                        value={formData.timezone}
                        onChange={handleChange}
                        className="w-full pl-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-[2.5rem]"
                        placeholder="e.g., America/New_York"
                      />
                      <p className="mt-1 text-sm text-gray-500">IANA timezone identifier</p>
                    </div>
                  </>
                ) : null}

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

                <div className="rounded-md border border-gray-200 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                      <Layers className="h-4 w-4" />
                      Structure <span className="text-red-600">*</span>
                    </div>
                    <Button type="button" variant="outline" onClick={() => setShowStructureModal(true)}>
                      {structureDraft ? 'Edit structure' : 'Set up structure'}
                    </Button>
                  </div>
                  {structureDraft ? (
                    <div className="text-sm text-green-700">
                      Saved{' '}
                      {structureDraft.mode === 'WITH_DIVISIONS'
                        ? `(${structureDraft.divisions.length} division${structureDraft.divisions.length === 1 ? '' : 's'})`
                        : '(no divisions)'}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-600">
                      Required. Define divisions and team counts so players can join.
                    </div>
                  )}
                  {formData.format === 'ONE_DAY_LADDER' ? (
                    <div className="text-xs text-gray-500">
                      One-day ladder requires an even number of teams and currently supports team formats (doubles/squad).
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}

            {stepIndex === 3 ? (
              <>
                <div>
                  <label htmlFor="entryFee" className="block text-sm font-medium text-gray-700 mb-2">
                    Entry Fee ($)
                  </label>
                  <div className="mb-3 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                    {payoutStatus.isLoading ? (
                      <div>Checking payout status…</div>
                    ) : payoutStatus.payoutsActive ? (
                      <div>Payouts: Active via Stripe</div>
                    ) : (
                      <div className="space-y-2">
                        <div>To receive payouts for paid tournaments, please connect your bank details via Stripe.</div>
                        <Button type="button" variant="outline" onClick={handleConnectStripe}>
                          Connect payouts with Stripe
                        </Button>
                      </div>
                    )}
                  </div>
                  <input
                    type="number"
                    id="entryFee"
                    name="entryFee"
                    value={formData.entryFee}
                    onChange={handleChange}
                    min="0"
                    step="0.01"
                    className="w-full pl-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-[2.5rem]"
                    placeholder="0.00"
                  />
                  {entryFeeCents > 0 ? (
                    <div className="mt-3 rounded-md border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
                      <div>Entry fee per player: ${fromCents(entryFeeCents).toFixed(2)}</div>
                      <div>
                        Piqle fee (10%, max $5): ${fromCents(organizerBreakdown.platformFeeCents).toFixed(2)}
                      </div>
                      <div>Estimated Stripe fee: ${fromCents(organizerBreakdown.stripeFeeCents).toFixed(2)}</div>
                      <div className="font-medium">
                        Organizer receives: ${fromCents(organizerBreakdown.organizerAmountCents).toFixed(2)}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Tournament Image (optional)</label>
                  {imagePreview ? (
                    <div className="relative inline-block">
                      <div className="relative w-48 h-48 rounded-lg overflow-hidden border border-gray-300">
                        <Image src={imagePreview} alt="Tournament preview" fill className="object-cover" />
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
                      {isUploadingImage ? <span className="text-sm text-gray-500">Uploading...</span> : null}
                    </div>
                  )}
                  <p className="mt-1 text-sm text-gray-500">
                    Upload a square image for your tournament (max 5MB). Image will be cropped to square.
                  </p>
                </div>

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
                    Publish tournament{' '}
                    <span className="text-gray-500 font-normal">(uncheck to keep it as a draft)</span>
                  </label>
                </div>

                {!structureDraft ? (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    Structure is required before you can create a tournament. Go back and set it up.
                  </div>
                ) : null}
              </>
            ) : null}

            <div className="pt-4 border-t border-gray-200 flex items-center justify-between gap-3">
              <Button type="button" variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
              <div className="flex items-center gap-2">
                {stepIndex > 0 ? (
                  <Button type="button" variant="outline" className="gap-2" onClick={goBack}>
                    <ChevronLeft className="h-4 w-4" />
                    Back
                  </Button>
                ) : null}
                {stepIndex < totalSteps - 1 ? (
                  <Button type="button" className="gap-2" onClick={goNext}>
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={
                      createTournamentWithStructure.isPending ||
                      requiresPayoutsSetup ||
                      !structureDraft
                    }
                  >
                    {createTournamentWithStructure.isPending ? 'Creating…' : 'Create Tournament'}
                  </Button>
                )}
              </div>
            </div>

            {stepIndex === 3 && requiresPayoutsSetup ? (
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <div className="mb-2">Paid tournaments require payouts to be connected via Stripe.</div>
                <Button type="button" variant="outline" onClick={handleConnectStripe}>
                  Connect payouts with Stripe
                </Button>
              </div>
            ) : null}
          </form>
        </CardContent>
      </Card>

      {/* Create Draft From Template Modal */}
      {templateDraftOpen ? (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[110] p-4 animate-in fade-in duration-300"
          onClick={() => setTemplateDraftOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 border border-gray-200 relative overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div className="min-w-0">
                <div className="text-lg font-semibold text-gray-900 truncate">Create draft</div>
                <div className="text-xs text-gray-500 truncate">
                  From template: {selectedTemplate?.name || '—'}
                </div>
              </div>
              <Button type="button" variant="ghost" onClick={() => setTemplateDraftOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Title override (optional)
                </label>
                <input
                  type="text"
                  value={templateDraftForm.title}
                  onChange={(e) => setTemplateDraftForm((p) => ({ ...p, title: e.target.value }))}
                  className="w-full pl-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-[2.5rem]"
                  placeholder="Leave empty to use template title"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Start Date *</label>
                  <input
                    type="date"
                    value={templateDraftForm.startDate}
                    onChange={(e) => setTemplateDraftForm((p) => ({ ...p, startDate: e.target.value }))}
                    className="w-full pl-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-[2.5rem]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">End Date *</label>
                  <input
                    type="date"
                    value={templateDraftForm.endDate}
                    onChange={(e) => setTemplateDraftForm((p) => ({ ...p, endDate: e.target.value }))}
                    min={templateDraftForm.startDate || undefined}
                    className="w-full pl-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-[2.5rem]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Registration Start (optional)</label>
                  <input
                    type="date"
                    value={templateDraftForm.registrationStartDate}
                    onChange={(e) => setTemplateDraftForm((p) => ({ ...p, registrationStartDate: e.target.value }))}
                    max={templateDraftForm.startDate || undefined}
                    className="w-full pl-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-[2.5rem]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Registration End (optional)</label>
                  <input
                    type="date"
                    value={templateDraftForm.registrationEndDate}
                    onChange={(e) => setTemplateDraftForm((p) => ({ ...p, registrationEndDate: e.target.value }))}
                    min={templateDraftForm.registrationStartDate || undefined}
                    max={templateDraftForm.startDate || undefined}
                    className="w-full pl-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-[2.5rem]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Entry Fee (optional)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={templateDraftForm.entryFee}
                  onChange={(e) => setTemplateDraftForm((p) => ({ ...p, entryFee: e.target.value }))}
                  className="w-full pl-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-[2.5rem]"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="p-6 pt-0 flex items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setTemplateDraftOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleCreateFromTemplate}
                disabled={createDraftFromTemplate.isPending}
              >
                {createDraftFromTemplate.isPending ? 'Creating…' : 'Create draft'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

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

      <StructureSetupModal
        isOpen={showStructureModal}
        isSaving={createTournamentWithStructure.isPending}
        onClose={() => setShowStructureModal(false)}
        onSave={handleStructureSave}
        initialStructure={structureDraft}
      />
    </div>
  )
}
