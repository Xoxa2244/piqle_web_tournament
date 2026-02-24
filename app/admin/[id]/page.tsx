'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { useState, useEffect, useRef, useCallback } from 'react'
import { trpc } from '@/lib/trpc'
import { formatDescription } from '@/lib/formatDescription'
import {
  getTournamentStatus,
  getTournamentStatusBadgeClass,
  getTournamentStatusLabel,
} from '@/lib/tournamentStatus'
import { getTournamentTypeLabel } from '@/lib/tournamentType'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import Image from 'next/image'
import AvatarCropper from '@/components/AvatarCropper'
import { calculateOrganizerNetCents, fromCents, toCents } from '@/lib/payment'
import { formatUsDateTimeShort } from '@/lib/dateFormat'
import { toDateTimeInputInTimeZone, toUtcIsoFromLocalInput } from '@/lib/timezone'
import { ENABLE_DEFERRED_PAYMENTS } from '@/lib/features'
import { 
  Users, 
  Calendar, 
  Settings,
  FileText,
  ArrowLeft,
  Upload,
  Edit,
  Shield,
  X,
  MapPin,
  DollarSign,
  Layers,
  Swords,
  User,
  UserCheck,
  UserX,
  Trophy,
  Clock,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import { toast } from '@/components/ui/use-toast'
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

const getRegistrationMaxDateTime = (startDate: string) => {
  const day = String(startDate || '').split('T')[0]
  return day ? `${day}T23:59` : undefined
}
const TOURNAMENT_TIME_STEP_MINUTES = 15

const pad2 = (num: number) => String(num).padStart(2, '0')
const QUARTER_HOUR_TIME_OPTIONS = Array.from({ length: 24 * 4 }, (_, idx) => {
  const hours24 = Math.floor(idx / 4)
  const minutes = (idx % 4) * TOURNAMENT_TIME_STEP_MINUTES
  const period = hours24 >= 12 ? 'PM' : 'AM'
  const hours12 = hours24 % 12 || 12
  return {
    value: `${pad2(hours24)}:${pad2(minutes)}`,
    label: `${pad2(hours12)}:${pad2(minutes)} ${period}`,
  }
})

const getDatePartFromDateTimeLocal = (value?: string | null) => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const [datePart] = raw.split('T')
  if (!datePart || !/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return ''
  return datePart
}

const getTimePartFromDateTimeLocal = (value?: string | null) => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const timeRaw = raw.split('T')[1] || ''
  const hhmm = timeRaw.slice(0, 5)
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return ''
  return hhmm
}

const normalizeQuarterHourTime = (value?: string | null) => {
  const raw = String(value || '').trim().slice(0, 5)
  if (!/^\d{2}:\d{2}$/.test(raw)) return ''
  const [hhRaw, mmRaw] = raw.split(':')
  const hh = Number(hhRaw)
  const mm = Number(mmRaw)
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return ''
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return ''

  const total = hh * 60 + mm
  const snapped = Math.round(total / TOURNAMENT_TIME_STEP_MINUTES) * TOURNAMENT_TIME_STEP_MINUTES
  const clamped = Math.max(0, Math.min(23 * 60 + 45, snapped))
  return `${pad2(Math.floor(clamped / 60))}:${pad2(clamped % 60)}`
}

const getTodayYmdLocal = () => {
  const now = new Date()
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}

const normalizeTournamentDateTime = (value: string) => {
  const datePart = getDatePartFromDateTimeLocal(value)
  if (!datePart) return String(value || '').trim()
  const timePart = normalizeQuarterHourTime(getTimePartFromDateTimeLocal(value) || '00:00') || '00:00'
  return `${datePart}T${timePart}`
}

type QuarterHourDateTimeInputProps = {
  id?: string
  name?: string
  value: string
  onChange: (value: string) => void
  min?: string
  max?: string
  disabled?: boolean
  className?: string
}

function QuarterHourDateTimeInput({
  id,
  name,
  value,
  onChange,
  min,
  max,
  disabled,
  className,
}: QuarterHourDateTimeInputProps) {
  const datePart = getDatePartFromDateTimeLocal(value)
  const normalizedTime = normalizeQuarterHourTime(getTimePartFromDateTimeLocal(value))
  const minDate = getDatePartFromDateTimeLocal(min)
  const maxDate = getDatePartFromDateTimeLocal(max)

  useEffect(() => {
    const normalized = normalizeTournamentDateTime(value)
    if (normalized && normalized !== value) {
      onChange(normalized)
    }
  }, [onChange, value])

  const handleDateChange = (nextDate: string) => {
    if (!nextDate) {
      onChange('')
      return
    }
    const nextTime = normalizedTime || '00:00'
    onChange(`${nextDate}T${nextTime}`)
  }

  const handleTimeChange = (nextTime: string) => {
    const normalized = normalizeQuarterHourTime(nextTime) || '00:00'
    const baseDate = datePart || minDate || getTodayYmdLocal()
    onChange(`${baseDate}T${normalized}`)
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        type="date"
        id={id}
        name={name ? `${name}Date` : undefined}
        value={datePart}
        min={minDate || undefined}
        max={maxDate || undefined}
        onChange={(e) => handleDateChange(e.target.value)}
        disabled={disabled}
        className={className || "w-full min-w-0 pl-4 pr-12 py-3 text-base border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-white/80 backdrop-blur-sm"}
      />
      <select
        name={name ? `${name}Time` : undefined}
        value={datePart ? (normalizedTime || '00:00') : ''}
        onChange={(e) => handleTimeChange(e.target.value)}
        disabled={disabled}
        className={className || "w-full min-w-0 pl-4 pr-10 py-3 text-base border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-white/80 backdrop-blur-sm"}
      >
        <option value="" disabled>
          Select time
        </option>
        {QUARTER_HOUR_TIME_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export default function TournamentDetailPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const tournamentId = params.id as string
  const [showCreateDivision, setShowCreateDivision] = useState(false)
  const [showEditTournament, setShowEditTournament] = useState(false)
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)
  const [selectedWinnersDivisionId, setSelectedWinnersDivisionId] = useState<string | null>(null)
  const [baseUrl, setBaseUrl] = useState<string>('')

  // Set base URL on client side only to avoid hydration mismatch
  useEffect(() => {
    setBaseUrl(window.location.origin)
  }, [])
  const [tournamentForm, setTournamentForm] = useState({
    title: '',
    description: '',
    venueName: '',
    startDate: '',
    endDate: '',
    registrationStartDate: '',
    registrationEndDate: '',
    timezone: '',
    entryFee: '',
    paymentTiming: 'PAY_IN_15_MIN' as 'PAY_IN_15_MIN' | 'PAY_BY_DEADLINE',
    isPublicBoardEnabled: false,
    allowDuprSubmission: false,
    image: '',
  })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showCropper, setShowCropper] = useState(false)
  const [cropperImageSrc, setCropperImageSrc] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [payoutStatus, setPayoutStatus] = useState<{
    hasAccount: boolean
    payoutsActive: boolean
    isLoading: boolean
  }>({ hasAccount: false, payoutsActive: false, isLoading: true })
  const [divisionForm, setDivisionForm] = useState({
    name: '',
    teamKind: 'DOUBLES_2v2' as 'SINGLES_1v1' | 'DOUBLES_2v2' | 'SQUAD_4v4',
    pairingMode: 'FIXED' as 'FIXED' | 'MIX_AND_MATCH',
    poolCount: 1,
    maxTeams: undefined as number | undefined,
    minDupr: undefined as number | undefined,
    maxDupr: undefined as number | undefined,
    minAge: undefined as number | undefined,
    maxAge: undefined as number | undefined,
  })

  const { data: tournament, isLoading, error } = trpc.tournament.get.useQuery({ id: tournamentId })

  // Open edit modal when navigating with ?edit=1 (e.g. from layout navbar)
  useEffect(() => {
    if (!tournament || showEditTournament) return
    if (searchParams.get('edit') === '1') {
      setShowEditTournament(true)
      setTournamentForm({
        title: tournament.title,
        description: tournament.description || '',
        venueName: tournament.venueName || '',
        startDate: toDateTimeInputInTimeZone(tournament.startDate, tournament.timezone),
        endDate: toDateTimeInputInTimeZone(tournament.endDate, tournament.timezone),
        registrationStartDate: toDateTimeInputInTimeZone(
          tournament.registrationStartDate,
          tournament.timezone
        ),
        registrationEndDate: toDateTimeInputInTimeZone(
          tournament.registrationEndDate,
          tournament.timezone
        ),
        timezone: tournament.timezone || '',
        entryFee:
          typeof tournament.entryFeeCents === 'number'
            ? fromCents(tournament.entryFeeCents).toFixed(2)
            : '',
        paymentTiming: (ENABLE_DEFERRED_PAYMENTS
          ? ((tournament as any).paymentTiming ?? 'PAY_IN_15_MIN')
          : 'PAY_IN_15_MIN') as
          | 'PAY_IN_15_MIN'
          | 'PAY_BY_DEADLINE',
        isPublicBoardEnabled: tournament.isPublicBoardEnabled ?? false,
        allowDuprSubmission: tournament.allowDuprSubmission ?? false,
        image: tournament.image || '',
      })
      setImagePreview(tournament.image || null)
      window.history.replaceState(null, '', `/admin/${tournamentId}`)
    }
  }, [tournament, searchParams, tournamentId])

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

  // Check if user has admin access (owner or ADMIN access level)
  const isAdmin = tournament?.userAccessInfo?.isOwner || tournament?.userAccessInfo?.accessLevel === 'ADMIN'
  // Check if user is owner (for owner-only features like CSV import and access control)
  const isOwner = tournament?.userAccessInfo?.isOwner

  const parsedEntryFeeForForm = Number(tournamentForm.entryFee)
  const entryFeeCentsForForm =
    Number.isFinite(parsedEntryFeeForForm) && parsedEntryFeeForForm > 0
      ? toCents(parsedEntryFeeForForm)
      : 0
  const organizerBreakdown = calculateOrganizerNetCents(entryFeeCentsForForm)
  const requiresPayoutsSetup =
    entryFeeCentsForForm > 0 && (!payoutStatus.payoutsActive || payoutStatus.isLoading)
  
  // Get pending access requests (only for owner)
  const { data: accessRequests, refetch: refetchAccessRequests } = trpc.tournamentAccess.listRequests.useQuery(
    { tournamentId },
    { enabled: !!isOwner && !!tournamentId }
  )
  const pendingRequestsCount = accessRequests?.length || 0

  const approveRequestMutation = trpc.tournamentAccess.approveRequest.useMutation({
    onSuccess: () => {
      refetchAccessRequests()
    },
  })
  const rejectRequestMutation = trpc.tournamentAccess.rejectRequest.useMutation({
    onSuccess: () => {
      refetchAccessRequests()
    },
  })

  // Winners come from tournament.get (winnersByDivision) — no separate getWinners query

  const updateTournament = trpc.tournament.update.useMutation({
    onSuccess: () => {
      setShowEditTournament(false)
      setImagePreview(null)
      setCropperImageSrc(null)
      window.location.reload()
    },
    onError: (error) => {
      console.error('Error updating tournament:', error)
      toast({ title: 'Error', description: 'Error updating tournament: ' + error.message, variant: 'destructive' })
    },
  })

  const createDivision = trpc.division.create.useMutation({
    onSuccess: () => {
      setShowCreateDivision(false)
      setDivisionForm({
        name: '',
        teamKind: 'DOUBLES_2v2',
        pairingMode: 'FIXED',
        poolCount: 1,
        maxTeams: undefined,
        minDupr: undefined,
        maxDupr: undefined,
        minAge: undefined,
        maxAge: undefined,
      })
      window.location.reload()
    },
  })

  const handleCreateDivision = () => {
    if (!divisionForm.name.trim()) {
      toast({ description: 'Please enter division name', variant: 'destructive' })
      return
    }
    createDivision.mutate({
      tournamentId,
      name: divisionForm.name,
      teamKind: divisionForm.teamKind,
      pairingMode: divisionForm.pairingMode,
      poolCount: divisionForm.poolCount,
      maxTeams: divisionForm.maxTeams,
      minDupr: divisionForm.minDupr,
      maxDupr: divisionForm.maxDupr,
      minAge: divisionForm.minAge,
      maxAge: divisionForm.maxAge,
    })
  }

  const handlePublicScoreboardClick = () => {
    if (!tournament?.isPublicBoardEnabled) {
      toast({ description: 'Public Scoreboard is not available. Please enable it in tournament settings.', variant: 'destructive' })
      return
    }
    window.location.href = `/scoreboard/${tournamentId}`
  }

  const handleEditTournamentClick = () => {
    if (!tournament) return
    
    setTournamentForm({
      title: tournament.title,
      description: tournament.description || '',
      venueName: tournament.venueName || '',
      startDate: toDateTimeInputInTimeZone(tournament.startDate, tournament.timezone),
      endDate: toDateTimeInputInTimeZone(tournament.endDate, tournament.timezone),
      registrationStartDate: toDateTimeInputInTimeZone(
        tournament.registrationStartDate,
        tournament.timezone
      ),
      registrationEndDate: toDateTimeInputInTimeZone(
        tournament.registrationEndDate,
        tournament.timezone
      ),
      timezone: tournament.timezone || '',
      entryFee:
        typeof tournament.entryFeeCents === 'number'
          ? fromCents(tournament.entryFeeCents).toFixed(2)
          : '',
      paymentTiming: (ENABLE_DEFERRED_PAYMENTS
        ? ((tournament as any).paymentTiming ?? 'PAY_IN_15_MIN')
        : 'PAY_IN_15_MIN') as
        | 'PAY_IN_15_MIN'
        | 'PAY_BY_DEADLINE',
      isPublicBoardEnabled: tournament.isPublicBoardEnabled,
      allowDuprSubmission: tournament.allowDuprSubmission || false,
      image: tournament.image || '',
    })
    setImagePreview(tournament.image || null)
    setShowEditTournament(true)
  }

  const handleTournamentSubmit = () => {
    if (!tournamentForm.title || !tournamentForm.startDate || !tournamentForm.endDate) {
      toast({ description: 'Please fill in required fields', variant: 'destructive' })
      return
    }
    if (requiresPayoutsSetup) {
      toast({ description: 'Connect payouts with Stripe before setting a paid entry fee.', variant: 'destructive' })
      return
    }

    // Validate dates
    const startDate = new Date(tournamentForm.startDate)
    const endDate = new Date(tournamentForm.endDate)
    
    // End date cannot be earlier than start date
    if (endDate < startDate) {
      toast({ description: 'End date cannot be earlier than start date', variant: 'destructive' })
      return
    }

    // Validate registration dates if provided
    if (tournamentForm.registrationStartDate || tournamentForm.registrationEndDate) {
      const registrationCutoffRaw = getRegistrationMaxDateTime(tournamentForm.startDate)
      const registrationCutoff = registrationCutoffRaw ? new Date(registrationCutoffRaw) : startDate
      if (tournamentForm.registrationStartDate && tournamentForm.registrationEndDate) {
        const regStartDate = new Date(tournamentForm.registrationStartDate)
        const regEndDate = new Date(tournamentForm.registrationEndDate)
        
        // Registration end date cannot be earlier than registration start date
        if (regEndDate < regStartDate) {
          toast({ description: 'Registration end date cannot be earlier than registration start date', variant: 'destructive' })
          return
        }
      }
      
      if (tournamentForm.registrationStartDate) {
        const regStartDate = new Date(tournamentForm.registrationStartDate)
        // Registration start date cannot be later than tournament start date
        if (regStartDate > registrationCutoff) {
          toast({ description: 'Registration start date cannot be later than tournament start date', variant: 'destructive' })
          return
        }
      }
      
      if (tournamentForm.registrationEndDate) {
        const regEndDate = new Date(tournamentForm.registrationEndDate)
        // Registration end date cannot be later than tournament start date
        if (regEndDate > registrationCutoff) {
          toast({ description: 'Registration end date cannot be later than tournament start date', variant: 'destructive' })
          return
        }
      }
    }

    const parsedEntryFee = Number(tournamentForm.entryFee)
    const entryFeeCents =
      Number.isFinite(parsedEntryFee) && parsedEntryFee > 0
        ? toCents(parsedEntryFee)
        : 0
    const normalizedTimezone = tournamentForm.timezone || null
    const payloadStartDate =
      toUtcIsoFromLocalInput(tournamentForm.startDate, normalizedTimezone) || tournamentForm.startDate
    const payloadEndDate =
      toUtcIsoFromLocalInput(tournamentForm.endDate, normalizedTimezone) || tournamentForm.endDate
    const payloadRegistrationStartDate = tournamentForm.registrationStartDate
      ? toUtcIsoFromLocalInput(tournamentForm.registrationStartDate, normalizedTimezone) ||
        tournamentForm.registrationStartDate
      : null
    const payloadRegistrationEndDate = tournamentForm.registrationEndDate
      ? toUtcIsoFromLocalInput(tournamentForm.registrationEndDate, normalizedTimezone) ||
        tournamentForm.registrationEndDate
      : null

    updateTournament.mutate({
      id: tournamentId,
      title: tournamentForm.title,
      description: tournamentForm.description || undefined,
      venueName: tournamentForm.venueName || undefined,
      startDate: payloadStartDate,
      endDate: payloadEndDate,
      registrationStartDate: payloadRegistrationStartDate,
      registrationEndDate: payloadRegistrationEndDate,
      timezone: normalizedTimezone,
      entryFeeCents,
      paymentTiming: ENABLE_DEFERRED_PAYMENTS ? tournamentForm.paymentTiming : 'PAY_IN_15_MIN',
      currency: 'usd',
      isPublicBoardEnabled: tournamentForm.isPublicBoardEnabled,
      allowDuprSubmission: tournamentForm.allowDuprSubmission,
      image: tournamentForm.image || null,
    })
  }

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({ description: 'Please select an image file', variant: 'destructive' })
      return
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({ description: 'File size must be less than 5MB', variant: 'destructive' })
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
      toast({ description: 'Failed to process image. Please try again.', variant: 'destructive' })
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
      setTournamentForm(prev => ({ ...prev, image: data.url }))
      
      // Clean up blob URLs
      URL.revokeObjectURL(croppedImageUrl)
      if (cropperImageSrc) {
        URL.revokeObjectURL(cropperImageSrc)
      }
    } catch (error) {
      console.error('Upload error:', error)
      toast({ description: 'Failed to upload image. Please try again.', variant: 'destructive' })
      setImagePreview(null)
    } finally {
      setIsUploadingImage(false)
      setCropperImageSrc(null)
    }
  }

  const handleCropperClose = useCallback(() => {
    setShowCropper(false)
    if (cropperImageSrc) {
      URL.revokeObjectURL(cropperImageSrc)
    }
    setCropperImageSrc(null)
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [cropperImageSrc])

  const handleRemoveImage = () => {
    setImagePreview(null)
    setTournamentForm(prev => ({ ...prev, image: '' }))
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleTournamentChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target
    setTournamentForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }))
  }

  const setTournamentDateTimeField = useCallback(
    (
      name: 'startDate' | 'endDate' | 'registrationStartDate' | 'registrationEndDate',
      value: string
    ) => {
      const normalized = normalizeTournamentDateTime(value)
      setTournamentForm((prev) => ({
        ...prev,
        [name]: normalized,
      }))
    },
    []
  )

  if (isLoading) {
    return (
      <div className="min-h-screen w-full bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-gray-200 border-t-gray-600 mx-auto mb-4"></div>
          <div className="text-lg font-semibold text-gray-800 bg-white px-6 py-3 rounded-2xl shadow-lg border border-gray-200">Loading tournament...</div>
        </div>
      </div>
    )
  }

  if (error || !tournament) {
    return (
      <div className="min-h-screen w-full bg-gray-50 flex items-center justify-center">
        <div className="text-center bg-white rounded-2xl shadow-xl p-8 max-w-md mx-4 border border-gray-200">
          <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Tournament not found</h1>
          <p className="text-gray-600 mb-6">The tournament may have been deleted or you don&apos;t have access</p>
          <Link href="/admin" className="inline-flex items-center px-6 py-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-colors font-semibold">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to tournaments
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen w-full bg-gray-50">
      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Tournament Information - Left Column (60%) */}
          <div className="lg:col-span-2">
            <Card className="h-full border border-gray-200 shadow-lg bg-white relative overflow-hidden group">
              <CardHeader className="pb-4 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-2xl font-bold text-gray-900 flex items-center">
                  <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center mr-3">
                    <Calendar className="w-5 h-5 text-white" />
                  </div>
                  Tournament Information
                </CardTitle>
                {isAdmin ? (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={handleEditTournamentClick}
                    >
                      <Settings className="h-4 w-4" />
                      Edit
                    </Button>
                  </div>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Tournament status — выше описания */}
                <div className="flex items-center gap-2">
                  <span className={`inline-block px-2.5 py-1 rounded-md text-xs font-medium ${getTournamentStatusBadgeClass(getTournamentStatus(tournament))}`}>
                    {getTournamentStatusLabel(getTournamentStatus(tournament))}
                  </span>
                  <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-gray-50 text-gray-700 border border-gray-200">
                    {getTournamentTypeLabel((tournament as { format?: string | null }).format)}
                  </span>
                </div>

                {/* Description */}
                <div className="flex gap-3">
                  <FileText className="h-4 w-4 mt-0.5 flex-shrink-0 text-gray-500" />
                  <div className="min-w-0 flex-1 overflow-hidden">
                    {tournament.description ? (
                      <div>
                        <div
                          className={`text-base text-gray-700 prose prose-sm max-w-none leading-relaxed whitespace-pre-wrap break-words ${!descriptionExpanded ? 'line-clamp-3' : ''}`}
                          style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                          dangerouslySetInnerHTML={{ __html: formatDescription(tournament.description) }}
                        />
                        {(tournament.description.split('\n').length > 3 || tournament.description.length > 150) && (
                          <button
                            type="button"
                            onClick={() => setDescriptionExpanded(!descriptionExpanded)}
                            className="mt-2 text-blue-600 hover:text-blue-800 text-sm font-medium"
                          >
                            {descriptionExpanded ? 'Show less' : 'Show more'}
                          </button>
                        )}
                      </div>
                    ) : (
                      <p className="text-base text-gray-400 italic">No description provided</p>
                    )}
                  </div>
                </div>

                {/* Start & End date — одна строка с иконкой */}
                <div className="flex items-center gap-2 text-base text-gray-700">
                  <Calendar className="h-4 w-4 flex-shrink-0 text-gray-500" />
                  <span>
                    {formatUsDateTimeShort(tournament.startDate, { timeZone: tournament.timezone })}
                    {' – '}
                    {formatUsDateTimeShort(tournament.endDate, { timeZone: tournament.timezone })}
                  </span>
                </div>

                {/* Venue */}
                <div className="flex items-center gap-2 text-base text-gray-700">
                  <MapPin className="h-4 w-4 flex-shrink-0 text-gray-500" />
                  <span>{tournament.venueName || '—'}</span>
                </div>

                {/* Entry fee */}
                <div className="flex items-center gap-2 text-base text-gray-700">
                  <DollarSign className="h-4 w-4 flex-shrink-0 text-gray-500" />
                  <span>
                    {typeof tournament.entryFeeCents === 'number'
                      ? `$${fromCents(tournament.entryFeeCents).toFixed(2)}`
                      : '—'}
                  </span>
                </div>

                {/* Number of divisions */}
                <div className="flex items-center gap-2 text-base text-gray-700">
                  <Layers className="h-4 w-4 flex-shrink-0 text-gray-500" />
                  <span>
                    {(tournament.divisions?.length ?? 0)} division{(tournament.divisions?.length ?? 0) !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Winners — per-division with dropdown switcher (same as Score Input) */}
                <div className="pt-4 border-t border-gray-200">
                  {(() => {
                    const divisions = (tournament?.divisions ?? []) as Array<{ id: string; name: string; teams?: unknown[] }>
                    const divisionOptions = divisions.filter((d) => String(d.id || '').trim() && String(d.name || '').trim())
                    const effectiveDivisionId = selectedWinnersDivisionId ?? divisionOptions[0]?.id ?? null
                    const selectedDivision = divisionOptions.find((d) => d.id === effectiveDivisionId)
                    const winnersByDivision = (tournament as { winnersByDivision?: Array<{ divisionId: string; divisionName: string; first: { teamId: string; teamName: string } | null; second: { teamId: string; teamName: string } | null; third: { teamId: string; teamName: string } | null }> })?.winnersByDivision
                    const winnersForDivision = winnersByDivision?.find((w) => w.divisionId === effectiveDivisionId)
                    const hasWinners = winnersForDivision && (winnersForDivision.first || winnersForDivision.second || winnersForDivision.third)

                    return (
                      <div>
                        <p className="text-lg font-semibold text-black flex items-center gap-2 mb-3">
                          <Trophy className="h-5 w-5 text-amber-500" />
                          Winners
                        </p>
                        {divisionOptions.length > 0 ? (
                          <div className="mb-3">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Division</label>
                            <select
                              value={effectiveDivisionId ?? ''}
                              onChange={(e) => setSelectedWinnersDivisionId(e.target.value || null)}
                              className="w-full max-w-xs pl-3 py-2 pr-[calc(12px+1rem)] text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none bg-no-repeat bg-[length:1rem] bg-[position:right_12px_center]"
                              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")` }}
                            >
                              {divisionOptions.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : null}
                        {divisionOptions.length === 0 ? (
                          <div className="rounded-xl bg-gray-50 border border-gray-200 p-6 text-center">
                            <p className="text-base font-medium text-gray-600">No divisions yet</p>
                            <p className="text-sm text-gray-500 mt-1">Add divisions to see winners</p>
                          </div>
                        ) : !hasWinners ? (
                          <div className="rounded-xl bg-gray-50 border border-gray-200 p-6 text-center">
                            <Trophy className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                            <p className="text-base font-medium text-gray-600">No winners yet</p>
                            <p className="text-sm text-gray-500 mt-1">
                              {selectedDivision?.name
                                ? `Results for ${selectedDivision.name} will appear after the tournament or playoffs are complete`
                                : 'Results will appear after the tournament or playoffs are complete'}
                            </p>
                          </div>
                        ) : (
                          <div className="rounded-xl bg-gray-50 border border-gray-200 p-4">
                            <div className="space-y-2 text-base text-gray-800">
                              {winnersForDivision?.first && (
                                <div className="flex items-center gap-2">
                                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-amber-800 text-sm font-bold">1</span>
                                  <span>{winnersForDivision.first.teamName}</span>
                                </div>
                              )}
                              {winnersForDivision?.second && (
                                <div className="flex items-center gap-2">
                                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-200 text-gray-700 text-sm font-bold">2</span>
                                  <span>{winnersForDivision.second.teamName}</span>
                                </div>
                              )}
                              {winnersForDivision?.third && (
                                <div className="flex items-center gap-2">
                                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-200/80 text-amber-900 text-sm font-bold">3</span>
                                  <span>{winnersForDivision.third.teamName}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Access requests - Right Column (40%) */}
          <div className="lg:col-span-1">
            <Card className="h-full border border-gray-200 shadow-lg bg-white relative overflow-hidden group">
              <CardHeader className="pb-4">
                <CardTitle className="text-2xl font-bold text-gray-900 flex items-center">
                  <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center mr-3">
                    <Clock className="w-5 h-5 text-white" />
                  </div>
                  Access requests
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!isOwner ? (
                  <p className="text-sm text-gray-500">Access management is only available to the tournament owner.</p>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm text-gray-600">Pending requests</span>
                      <Link
                        href={`/admin/${tournamentId}/access`}
                        className="text-sm font-medium text-blue-600 hover:text-blue-700"
                      >
                        Access management →
                      </Link>
                    </div>
                    {!accessRequests || accessRequests.length === 0 ? (
                      <div className="rounded-xl bg-gray-50 border border-gray-200 p-6 text-center">
                        <UserCheck className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                        <p className="text-base font-medium text-gray-600">No pending requests</p>
                        <p className="text-sm text-gray-500 mt-1">Access requests will appear here</p>
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-[320px] overflow-y-auto">
                        {accessRequests.map((request) => (
                          <div
                            key={request.id}
                            className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white p-3"
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              {request.user.image && (
                                <Image
                                  src={request.user.image}
                                  alt={request.user.name || ''}
                                  width={32}
                                  height={32}
                                  className="h-8 w-8 rounded-full object-cover flex-shrink-0"
                                  unoptimized
                                />
                              )}
                              <div className="min-w-0">
                                <p className="font-medium text-gray-900 truncate">{request.user.name || 'No name'}</p>
                                <p className="text-xs text-gray-500 truncate">{request.user.email}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <Button
                                size="sm"
                                className="bg-green-600 hover:bg-green-700 text-white"
                                disabled={approveRequestMutation.isPending}
                                onClick={() => {
                                  approveRequestMutation.mutate({
                                    requestId: request.id,
                                    accessLevel: 'SCORE_ONLY',
                                    divisionIds: null,
                                  })
                                }}
                              >
                                <UserCheck className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-600 hover:text-red-700 border-red-200"
                                disabled={rejectRequestMutation.isPending}
                                onClick={() => {
                                  if (typeof window !== 'undefined' && window.confirm('Reject this access request?')) {
                                    rejectRequestMutation.mutate({ requestId: request.id })
                                  }
                                }}
                              >
                                <UserX className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Create Division Modal */}
      {showCreateDivision && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[110] p-4 animate-in fade-in duration-300"
          onClick={() => setShowCreateDivision(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md mx-4 border border-gray-200 relative overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center mb-6">
              <div className="w-12 h-12 bg-gray-800 rounded-xl flex items-center justify-center mr-3">
                <Settings className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Create Division</h2>
            </div>
            
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Division Name *
                </label>
                <input
                  type="text"
                  value={divisionForm.name}
                  onChange={(e) => setDivisionForm({ ...divisionForm, name: e.target.value })}
                  className="w-full px-4 py-3 text-base border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-white/80 backdrop-blur-sm"
                  placeholder="e.g., Men's 2v2"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Team Type
                </label>
                <select
                  value={divisionForm.teamKind}
                  onChange={(e) => setDivisionForm({ ...divisionForm, teamKind: e.target.value as any })}
                  className="w-full pl-4 py-3 text-base border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-white/80 backdrop-blur-sm pr-[2.5rem]"
                >
                  <option value="SINGLES_1v1">Singles (1v1)</option>
                  <option value="DOUBLES_2v2">Doubles (2v2)</option>
                  <option value="SQUAD_4v4">Squad (4v4)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Pairing Mode
                </label>
                <select
                  value={divisionForm.pairingMode}
                  onChange={(e) => setDivisionForm({ ...divisionForm, pairingMode: e.target.value as any })}
                  className="w-full pl-4 py-3 text-base border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-white/80 backdrop-blur-sm pr-[2.5rem]"
                >
                  <option value="FIXED">Fixed Teams</option>
                  <option value="MIX_AND_MATCH">Mix and Match</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Number of Pools
                </label>
                <input
                  type="number"
                  min="0"
                  value={divisionForm.poolCount}
                  onChange={(e) => setDivisionForm({ ...divisionForm, poolCount: parseInt(e.target.value) || 1 })}
                  className="w-full px-4 py-3 text-base border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-white/80 backdrop-blur-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Max Teams (optional)
                </label>
                <input
                  type="number"
                  min="1"
                  value={divisionForm.maxTeams || ''}
                  onChange={(e) => setDivisionForm({ ...divisionForm, maxTeams: e.target.value ? parseInt(e.target.value) : undefined })}
                  className="w-full px-4 py-3 text-base border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-white/80 backdrop-blur-sm"
                  placeholder="No limit"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-8 relative z-10">
              <Button
                variant="outline"
                onClick={() => setShowCreateDivision(false)}
                disabled={createDivision.isPending}
                className="px-6 py-3 text-base rounded-xl border-2 border-gray-300 hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 font-semibold"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateDivision}
                disabled={createDivision.isPending}
                className="px-6 py-3 text-base bg-gray-900 hover:bg-gray-800 text-white rounded-xl transition-colors font-semibold"
              >
                {createDivision.isPending ? 'Creating...' : 'Create Division'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Tournament Modal */}
      {showEditTournament && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[110] p-4 animate-in fade-in duration-300"
          onClick={() => setShowEditTournament(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 border border-gray-200 relative overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header - fixed */}
            <div className="flex items-center p-8 pb-6 flex-shrink-0">
              <div className="w-12 h-12 bg-gray-800 rounded-xl flex items-center justify-center mr-3">
                <Edit className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Edit Tournament</h2>
            </div>
            
            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-8">
              <div className="space-y-5 pb-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Tournament Name *
                </label>
                <input
                  type="text"
                  name="title"
                  value={tournamentForm.title}
                  onChange={handleTournamentChange}
                  className="w-full px-4 py-3 text-base border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-white/80 backdrop-blur-sm"
                  placeholder="e.g., Pickleball Championship 2024"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  name="description"
                  value={tournamentForm.description}
                  onChange={handleTournamentChange}
                  rows={3}
                  className="w-full px-4 py-3 text-base border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-white/80 backdrop-blur-sm resize-none"
                  placeholder="Tournament description, rules, features..."
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Venue
                </label>
                <input
                  type="text"
                  name="venueName"
                  value={tournamentForm.venueName}
                  onChange={handleTournamentChange}
                  className="w-full px-4 py-3 text-base border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-white/80 backdrop-blur-sm"
                  placeholder="Sports complex name"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Start Date & Time *
                  </label>
                  <QuarterHourDateTimeInput
                    id="editStartDate"
                    name="startDate"
                    value={tournamentForm.startDate}
                    onChange={(nextValue) => setTournamentDateTimeField('startDate', nextValue)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    End Date & Time *
                  </label>
                  <QuarterHourDateTimeInput
                    id="editEndDate"
                    name="endDate"
                    value={tournamentForm.endDate}
                    onChange={(nextValue) => setTournamentDateTimeField('endDate', nextValue)}
                    min={tournamentForm.startDate || undefined}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Registration Start
                  </label>
                  <QuarterHourDateTimeInput
                    id="editRegistrationStartDate"
                    name="registrationStartDate"
                    value={tournamentForm.registrationStartDate}
                    onChange={(nextValue) =>
                      setTournamentDateTimeField('registrationStartDate', nextValue)
                    }
                    max={getRegistrationMaxDateTime(tournamentForm.startDate)}
                  />
                  <p className="mt-1 text-xs text-gray-500">Include hours and minutes.</p>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Registration End
                  </label>
                  <QuarterHourDateTimeInput
                    id="editRegistrationEndDate"
                    name="registrationEndDate"
                    value={tournamentForm.registrationEndDate}
                    onChange={(nextValue) =>
                      setTournamentDateTimeField('registrationEndDate', nextValue)
                    }
                    min={tournamentForm.registrationStartDate || undefined}
                    max={getRegistrationMaxDateTime(tournamentForm.startDate)}
                  />
                  <p className="mt-1 text-xs text-gray-500">Include hours and minutes.</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Timezone
                </label>
                <input
                  type="text"
                  name="timezone"
                  value={tournamentForm.timezone}
                  onChange={handleTournamentChange}
                  placeholder="e.g., America/New_York"
                  className="w-full px-4 py-3 text-base border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-white/80 backdrop-blur-sm"
                />
                <p className="mt-1 text-xs text-gray-500">Times for players are shown in this timezone.</p>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Entry Fee ($)
                </label>
                <div className="mb-3 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                  {payoutStatus.isLoading ? (
                    <div>Checking payout status…</div>
                  ) : payoutStatus.payoutsActive ? (
                    <div>Payouts: Active via Stripe</div>
                  ) : (
                    <div className="space-y-2">
                      <div>
                        To receive payouts for paid tournaments, please connect your bank details via Stripe.
                      </div>
                      <Button type="button" variant="outline" onClick={handleConnectStripe}>
                        Connect payouts with Stripe
                      </Button>
                    </div>
                  )}
                </div>
                <input
                  type="number"
                  name="entryFee"
                  value={tournamentForm.entryFee}
                  onChange={handleTournamentChange}
                  min="0"
                  step="0.01"
                  className="w-full px-4 py-3 text-base border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-white/80 backdrop-blur-sm"
                  placeholder="0.00"
                />
                {entryFeeCentsForForm > 0 && (
                  <div className="mt-3 rounded-md border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
                    <div>Entry fee per player: ${fromCents(entryFeeCentsForForm).toFixed(2)}</div>
                    <div>
                      Piqle fee (10%, max $5): $
                      {fromCents(organizerBreakdown.platformFeeCents).toFixed(2)}
                    </div>
                    <div>
                      Estimated Stripe fee: $
                      {fromCents(organizerBreakdown.stripeFeeCents).toFixed(2)}
                    </div>
                    <div className="font-medium">
                      Organizer receives: $
                      {fromCents(organizerBreakdown.organizerAmountCents).toFixed(2)}
                    </div>
                  </div>
                )}
              </div>

              {ENABLE_DEFERRED_PAYMENTS ? (
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Payment Timing
                  </label>
                  <select
                    name="paymentTiming"
                    value={tournamentForm.paymentTiming}
                    onChange={handleTournamentChange}
                    className="w-full px-4 py-3 text-base border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-white/80 backdrop-blur-sm pr-[2.5rem]"
                  >
                    <option value="PAY_IN_15_MIN">Player pays within 15 minutes after join</option>
                    <option value="PAY_BY_DEADLINE">Player pays by registration deadline</option>
                  </select>
                </div>
              ) : (
                <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                  Payment flow: players join and pay immediately.
                </div>
              )}

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
                    <div className="w-48 h-48 rounded-lg overflow-hidden border border-gray-300 flex-shrink-0 bg-gray-100">
                      <img
                        src="/tournament-placeholder.png"
                        alt="No tournament image"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleImageChange}
                        className="hidden"
                        id="tournament-image-edit"
                      />
                      <label
                        htmlFor="tournament-image-edit"
                        className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-md cursor-pointer hover:bg-gray-50 transition-colors w-fit"
                      >
                        <Upload className="h-4 w-4" />
                        <span>Upload Image</span>
                      </label>
                      {isUploadingImage && (
                        <span className="text-sm text-gray-500">Uploading...</span>
                      )}
                    </div>
                  </div>
                )}
                <p className="mt-1 text-sm text-gray-500">
                  Upload a square image for your tournament (max 5MB). Image will be cropped to square.
                </p>
              </div>

              <div className="flex items-center p-4 bg-gray-50 rounded-xl border border-gray-200">
                <input
                  type="checkbox"
                  name="isPublicBoardEnabled"
                  checked={tournamentForm.isPublicBoardEnabled}
                  onChange={handleTournamentChange}
                  className="h-5 w-5 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded cursor-pointer"
                />
                <label className="ml-3 block text-sm font-semibold text-gray-700 cursor-pointer">
                  Enable public results board
                </label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  name="allowDuprSubmission"
                  checked={tournamentForm.allowDuprSubmission}
                  onChange={handleTournamentChange}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label className="ml-2 block text-sm text-gray-700">
                  Allow sending results to DUPR
                </label>
              </div>
              </div>
            </div>

            {/* Footer with buttons - fixed */}
            <div className="flex justify-end space-x-3 p-8 pt-6 relative z-10 flex-shrink-0 border-t border-gray-200">
              <Button
                variant="outline"
                onClick={() => {
                  setShowEditTournament(false)
                  // Reset image state when canceling
                  if (tournament) {
                    setImagePreview(tournament.image || null)
                    setTournamentForm(prev => ({ ...prev, image: tournament.image || '' }))
                  } else {
                    setImagePreview(null)
                    setTournamentForm(prev => ({ ...prev, image: '' }))
                  }
                  setCropperImageSrc(null)
                  if (fileInputRef.current) {
                    fileInputRef.current.value = ''
                  }
                }}
                disabled={updateTournament.isPending}
                className="px-6 py-3 text-base rounded-xl border-2 border-gray-300 hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 font-semibold"
              >
                Cancel
              </Button>
              <Button
                onClick={handleTournamentSubmit}
                disabled={updateTournament.isPending || requiresPayoutsSetup}
                className="px-6 py-3 text-base bg-gray-900 hover:bg-gray-800 text-white rounded-xl transition-colors font-semibold"
              >
                {updateTournament.isPending ? 'Updating...' : 'Update Tournament'}
              </Button>
            </div>
            {requiresPayoutsSetup && (
              <div className="px-8 pb-8">
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <div className="mb-2">
                    Paid entry fees require payouts to be connected via Stripe.
                  </div>
                  <Button type="button" variant="outline" onClick={handleConnectStripe}>
                    Connect payouts with Stripe
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Avatar Cropper Modal */}
      {showCropper && cropperImageSrc && (
        <AvatarCropper
          imageSrc={cropperImageSrc}
          isOpen={showCropper}
          onCrop={handleCropComplete}
          onClose={handleCropperClose}
        />
      )}
    </div>
  )
}
