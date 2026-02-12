'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { useState, useEffect, useRef, useCallback } from 'react'
import { trpc } from '@/lib/trpc'
import { formatDescription } from '@/lib/formatDescription'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import Image from 'next/image'
import AvatarCropper from '@/components/AvatarCropper'
import { calculateOrganizerNetCents, fromCents, toCents } from '@/lib/payment'
import { formatUsDateShort } from '@/lib/dateFormat'
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

function getTournamentStatus(tournament: { startDate: Date | string; endDate: Date | string }): 'past' | 'upcoming' | 'in_progress' {
  const now = new Date()
  const start = new Date(tournament.startDate)
  const end = new Date(tournament.endDate)
  const endWithGrace = new Date(end)
  endWithGrace.setHours(endWithGrace.getHours() + 12)
  const nextDay = new Date(now)
  nextDay.setDate(nextDay.getDate() + 1)
  nextDay.setHours(0, 0, 0, 0)
  if (endWithGrace < nextDay) return 'past'
  if (start > now) return 'upcoming'
  return 'in_progress'
}
function getTournamentStatusLabel(status: 'past' | 'upcoming' | 'in_progress') {
  switch (status) {
    case 'past': return 'Past'
    case 'upcoming': return 'Upcoming'
    case 'in_progress': return 'In progress'
  }
}
function getTournamentStatusBadgeClass(status: 'past' | 'upcoming' | 'in_progress') {
  switch (status) {
    case 'past': return 'bg-gray-100 text-gray-700'
    case 'upcoming': return 'bg-blue-50 text-blue-700'
    case 'in_progress': return 'bg-green-50 text-green-700'
  }
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
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [templateForm, setTemplateForm] = useState({ name: '', description: '' })

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
    entryFee: '',
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
        startDate: new Date(tournament.startDate).toISOString().split('T')[0],
        endDate: new Date(tournament.endDate).toISOString().split('T')[0],
        registrationStartDate: tournament.registrationStartDate ? new Date(tournament.registrationStartDate).toISOString().split('T')[0] : '',
        registrationEndDate: tournament.registrationEndDate ? new Date(tournament.registrationEndDate).toISOString().split('T')[0] : '',
        entryFee:
          typeof tournament.entryFeeCents === 'number'
            ? fromCents(tournament.entryFeeCents).toFixed(2)
            : '',
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
      alert('Error updating tournament: ' + error.message)
    },
  })

  const saveAsClubTemplate = trpc.clubTemplate.saveFromTournament.useMutation({
    onSuccess: () => {
      setShowSaveTemplate(false)
      setTemplateForm({ name: '', description: '' })
      alert('Saved as club template')
    },
    onError: (error) => {
      alert('Failed to save template: ' + error.message)
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
      alert('Please enter division name')
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
      alert('Public Scoreboard is not available. Please enable it in tournament settings.')
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
      startDate: new Date(tournament.startDate).toISOString().split('T')[0],
      endDate: new Date(tournament.endDate).toISOString().split('T')[0],
      registrationStartDate: tournament.registrationStartDate ? new Date(tournament.registrationStartDate).toISOString().split('T')[0] : '',
      registrationEndDate: tournament.registrationEndDate ? new Date(tournament.registrationEndDate).toISOString().split('T')[0] : '',
      entryFee:
        typeof tournament.entryFeeCents === 'number'
          ? fromCents(tournament.entryFeeCents).toFixed(2)
          : '',
      isPublicBoardEnabled: tournament.isPublicBoardEnabled,
      allowDuprSubmission: tournament.allowDuprSubmission || false,
      image: tournament.image || '',
    })
    setImagePreview(tournament.image || null)
    setShowEditTournament(true)
  }

  const openSaveTemplateModal = () => {
    if (!tournament?.clubId) return
    setTemplateForm({ name: tournament.title || '', description: '' })
    setShowSaveTemplate(true)
  }

  const handleSaveTemplate = async () => {
    if (!tournament?.id) return
    if (!tournament?.clubId) {
      alert('This tournament is not linked to a club.')
      return
    }
    if (!templateForm.name.trim()) {
      alert('Please enter a template name')
      return
    }
    try {
      await saveAsClubTemplate.mutateAsync({
        tournamentId: tournament.id,
        name: templateForm.name.trim(),
        description: templateForm.description.trim() ? templateForm.description.trim() : undefined,
      })
    } catch {
      // Error is surfaced via mutation onError.
    }
  }

  const handleTournamentSubmit = () => {
    if (!tournamentForm.title || !tournamentForm.startDate || !tournamentForm.endDate) {
      alert('Please fill in required fields')
      return
    }
    if (requiresPayoutsSetup) {
      alert('Connect payouts with Stripe before setting a paid entry fee.')
      return
    }

    // Validate dates
    const startDate = new Date(tournamentForm.startDate)
    const endDate = new Date(tournamentForm.endDate)
    
    // End date cannot be earlier than start date
    if (endDate < startDate) {
      alert('End date cannot be earlier than start date')
      return
    }

    // Validate registration dates if provided
    if (tournamentForm.registrationStartDate || tournamentForm.registrationEndDate) {
      if (tournamentForm.registrationStartDate && tournamentForm.registrationEndDate) {
        const regStartDate = new Date(tournamentForm.registrationStartDate)
        const regEndDate = new Date(tournamentForm.registrationEndDate)
        
        // Registration end date cannot be earlier than registration start date
        if (regEndDate < regStartDate) {
          alert('Registration end date cannot be earlier than registration start date')
          return
        }
      }
      
      if (tournamentForm.registrationStartDate) {
        const regStartDate = new Date(tournamentForm.registrationStartDate)
        // Registration start date cannot be later than tournament start date
        if (regStartDate > startDate) {
          alert('Registration start date cannot be later than tournament start date')
          return
        }
      }
      
      if (tournamentForm.registrationEndDate) {
        const regEndDate = new Date(tournamentForm.registrationEndDate)
        // Registration end date cannot be later than tournament start date
        if (regEndDate > startDate) {
          alert('Registration end date cannot be later than tournament start date')
          return
        }
      }
    }

    const parsedEntryFee = Number(tournamentForm.entryFee)
    const entryFeeCents =
      Number.isFinite(parsedEntryFee) && parsedEntryFee > 0
        ? toCents(parsedEntryFee)
        : 0

    updateTournament.mutate({
      id: tournamentId,
      title: tournamentForm.title,
      description: tournamentForm.description || undefined,
      venueName: tournamentForm.venueName || undefined,
      startDate: tournamentForm.startDate,
      endDate: tournamentForm.endDate,
      registrationStartDate: tournamentForm.registrationStartDate || null,
      registrationEndDate: tournamentForm.registrationEndDate || null,
      entryFeeCents,
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
      setTournamentForm(prev => ({ ...prev, image: data.url }))
      
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

  const handleTournamentChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    setTournamentForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }))
  }

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
                    {tournament.clubId ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={openSaveTemplateModal}
                      >
                        <Layers className="h-4 w-4" />
                        Save as template
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Tournament status — выше описания */}
                <div className="flex items-center gap-2">
                  <span className={`inline-block px-2.5 py-1 rounded-md text-xs font-medium ${getTournamentStatusBadgeClass(getTournamentStatus(tournament))}`}>
                    {getTournamentStatusLabel(getTournamentStatus(tournament))}
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
                    {formatUsDateShort(tournament.startDate)}
                    {' – '}
                    {formatUsDateShort(tournament.endDate)}
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
                    const effectiveDivisionId = selectedWinnersDivisionId ?? divisions[0]?.id ?? null
                    const selectedDivision = divisions.find((d) => d.id === effectiveDivisionId)
                    const winnersByDivision = (tournament as { winnersByDivision?: Array<{ divisionId: string; divisionName: string; first: { teamId: string; teamName: string } | null; second: { teamId: string; teamName: string } | null; third: { teamId: string; teamName: string } | null }> })?.winnersByDivision
                    const winnersForDivision = winnersByDivision?.find((w) => w.divisionId === effectiveDivisionId)
                    const hasWinners = winnersForDivision && (winnersForDivision.first || winnersForDivision.second || winnersForDivision.third)

                    return (
                      <div>
                        <p className="text-lg font-semibold text-black flex items-center gap-2 mb-3">
                          <Trophy className="h-5 w-5 text-amber-500" />
                          Winners
                        </p>
                        <div className="mb-3">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Division</label>
                          <select
                            value={effectiveDivisionId ?? ''}
                            onChange={(e) => setSelectedWinnersDivisionId(e.target.value || null)}
                            className="w-full max-w-xs pl-3 py-2 pr-[calc(12px+1rem)] text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none bg-no-repeat bg-[length:1rem] bg-[position:right_12px_center]"
                            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")` }}
                          >
                            {divisions.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        {divisions.length === 0 ? (
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
                    Start Date *
                  </label>
                  <input
                    type="date"
                    name="startDate"
                    value={tournamentForm.startDate}
                    onChange={handleTournamentChange}
                    className="w-full px-4 py-3 text-base border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-white/80 backdrop-blur-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    End Date *
                  </label>
                  <input
                    type="date"
                    name="endDate"
                    value={tournamentForm.endDate}
                    onChange={handleTournamentChange}
                    min={tournamentForm.startDate || undefined}
                    className="w-full px-4 py-3 text-base border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-white/80 backdrop-blur-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Registration Start Date
                  </label>
                  <input
                    type="date"
                    name="registrationStartDate"
                    value={tournamentForm.registrationStartDate}
                    onChange={handleTournamentChange}
                    max={tournamentForm.startDate || undefined}
                    className="w-full px-4 py-3 text-base border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-white/80 backdrop-blur-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Registration End Date
                  </label>
                  <input
                    type="date"
                    name="registrationEndDate"
                    value={tournamentForm.registrationEndDate}
                    onChange={handleTournamentChange}
                    min={tournamentForm.registrationStartDate || undefined}
                    max={tournamentForm.startDate || undefined}
                    className="w-full px-4 py-3 text-base border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-white/80 backdrop-blur-sm"
                  />
                </div>
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

      {/* Save as Club Template Modal */}
      {showSaveTemplate && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[115] p-4 animate-in fade-in duration-300"
          onClick={() => setShowSaveTemplate(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 border border-gray-200 relative overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center p-8 pb-6">
              <div className="w-12 h-12 bg-gray-800 rounded-xl flex items-center justify-center mr-3">
                <Layers className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h2 className="text-2xl font-bold text-gray-900 truncate">Save as template</h2>
                <p className="text-sm text-gray-500 truncate">Visible to all club admins</p>
              </div>
            </div>

            <div className="px-8 pb-6 space-y-5">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Template name *</label>
                <input
                  type="text"
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full px-4 py-3 text-base border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-white/80 backdrop-blur-sm"
                  placeholder="e.g., Weekly RR 3.0–3.5"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Description (optional)</label>
                <textarea
                  value={templateForm.description}
                  onChange={(e) => setTemplateForm((p) => ({ ...p, description: e.target.value }))}
                  rows={3}
                  className="w-full px-4 py-3 text-base border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-white/80 backdrop-blur-sm resize-none"
                  placeholder="What this preset is for, who it’s for, etc."
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 px-8 pb-8">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowSaveTemplate(false)}
                disabled={saveAsClubTemplate.isPending}
                className="px-6 py-3 text-base rounded-xl border-2 border-gray-300 hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 font-semibold"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSaveTemplate}
                disabled={saveAsClubTemplate.isPending || !templateForm.name.trim()}
                className="px-6 py-3 text-base bg-gray-900 hover:bg-gray-800 text-white rounded-xl transition-colors font-semibold"
              >
                {saveAsClubTemplate.isPending ? 'Saving…' : 'Save template'}
              </Button>
            </div>
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
