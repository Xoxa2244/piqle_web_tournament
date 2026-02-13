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
import { formatUsDateShort } from '@/lib/dateFormat'
import { generateRecurringStartDates, parseYmdToUtc } from '@/lib/recurrence'
import { ENABLE_RECURRING_DRAFTS } from '@/lib/features'
import { guessTimeZoneFromLocation, toUtcIsoFromLocalInput } from '@/lib/timezone'

// Force dynamic rendering to prevent static generation issues
export const dynamic = 'force-dynamic'

type TournamentFormat =
  | 'SINGLE_ELIMINATION'
  | 'ROUND_ROBIN'
  | 'MLP'
  | 'INDY_LEAGUE'
  | 'LEAGUE_ROUND_ROBIN'
  | 'ONE_DAY_LADDER'
  | 'LADDER_LEAGUE'

const emptyDivisionConstraints = () => ({
  individualDupr: { enabled: false as const, min: undefined as number | undefined, max: undefined as number | undefined },
  teamDupr: { enabled: false as const, min: undefined as number | undefined, max: undefined as number | undefined },
  age: { enabled: false as const, min: undefined as number | undefined, max: undefined as number | undefined },
  gender: { enabled: false as const, value: 'ANY' as const },
  enforcement: 'INFO' as const,
})

const buildRecommendedStructure = (format: TournamentFormat): TournamentStructureInput => {
  const make = (division: { name: string; playersPerTeam: 1 | 2 | 4; teamCount: number; poolCount: number }): TournamentStructureInput => ({
    mode: 'WITH_DIVISIONS',
    divisions: [
      {
        name: division.name,
        playersPerTeam: division.playersPerTeam,
        teamCount: division.teamCount,
        poolCount: division.poolCount,
        constraints: emptyDivisionConstraints(),
      },
    ],
  })

  switch (format) {
    case 'MLP':
      return make({ name: 'MiLP Open', playersPerTeam: 4, teamCount: 8, poolCount: 2 })
    case 'INDY_LEAGUE':
      return make({ name: 'Indy League', playersPerTeam: 4, teamCount: 8, poolCount: 2 })
    case 'ONE_DAY_LADDER':
      return make({ name: 'Open Doubles', playersPerTeam: 2, teamCount: 24, poolCount: 1 })
    case 'LADDER_LEAGUE':
      return make({ name: 'Open Doubles', playersPerTeam: 2, teamCount: 24, poolCount: 1 })
    case 'LEAGUE_ROUND_ROBIN':
      return make({ name: 'Open Doubles', playersPerTeam: 2, teamCount: 16, poolCount: 4 })
    case 'ROUND_ROBIN':
      return make({ name: 'Open Doubles', playersPerTeam: 2, teamCount: 24, poolCount: 4 })
    case 'SINGLE_ELIMINATION':
    default:
      return make({ name: 'Open Doubles', playersPerTeam: 2, teamCount: 24, poolCount: 4 })
  }
}

const getBrowserTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  } catch {
    return ''
  }
}

const resolveTimeZoneFromLatLng = async (lat: number, lng: number, googleApi?: any) => {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ''
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  const mapsApi = googleApi?.maps || (window as any)?.google?.maps
  if (mapsApi?.TimeZoneService && mapsApi?.LatLng) {
    try {
      const service = new mapsApi.TimeZoneService()
      const timezoneId = await new Promise<string | null>((resolve) => {
        service.getTimeZoneForLocation(
          { location: new mapsApi.LatLng(lat, lng), timestamp: new Date() },
          (result: any, status: any) => {
            if (status === 'OK' && result?.timeZoneId) {
              resolve(String(result.timeZoneId))
              return
            }
            resolve(null)
          }
        )
      })
      if (timezoneId) return timezoneId
    } catch {
      // fall through to HTTP fallback
    }
  }

  if (!apiKey) return null
  try {
    const timestamp = Math.floor(Date.now() / 1000)
    const url = new URL('https://maps.googleapis.com/maps/api/timezone/json')
    url.searchParams.set('location', `${lat},${lng}`)
    url.searchParams.set('timestamp', String(timestamp))
    url.searchParams.set('key', apiKey)
    const response = await fetch(url.toString())
    if (!response.ok) return null
    const data = await response.json()
    if (data?.status === 'OK' && typeof data?.timeZoneId === 'string') {
      return data.timeZoneId as string
    }
    return null
  } catch {
    return null
  }
}

const getRegistrationMaxDateTime = (startDate: string) => {
  const day = String(startDate || '').split('T')[0]
  return day ? `${day}T23:59` : undefined
}
const REGISTRATION_TIME_STEP_MINUTES = 15

const pad2 = (num: number) => String(num).padStart(2, '0')

const QUARTER_HOUR_TIME_OPTIONS = Array.from({ length: 24 * 4 }, (_, idx) => {
  const hours24 = Math.floor(idx / 4)
  const minutes = (idx % 4) * REGISTRATION_TIME_STEP_MINUTES
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
  const snapped = Math.round(total / REGISTRATION_TIME_STEP_MINUTES) * REGISTRATION_TIME_STEP_MINUTES
  const clamped = Math.max(0, Math.min(23 * 60 + 45, snapped))
  return `${pad2(Math.floor(clamped / 60))}:${pad2(clamped % 60)}`
}

const normalizeRegistrationDateTime = (value: string) => {
  const datePart = getDatePartFromDateTimeLocal(value)
  if (!datePart) return String(value || '').trim()
  const timePart = normalizeQuarterHourTime(getTimePartFromDateTimeLocal(value) || '00:00') || '00:00'
  return `${datePart}T${timePart}`
}
const getTodayYmdLocal = () => {
  const now = new Date()
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}

type QuarterHourDateTimeInputProps = {
  id?: string
  name?: string
  value: string
  onChange: (value: string) => void
  min?: string
  max?: string
  disabled?: boolean
}

function QuarterHourDateTimeInput({
  id,
  name,
  value,
  onChange,
  min,
  max,
  disabled,
}: QuarterHourDateTimeInputProps) {
  const datePart = getDatePartFromDateTimeLocal(value)
  const normalizedTime = normalizeQuarterHourTime(getTimePartFromDateTimeLocal(value))
  const minDate = getDatePartFromDateTimeLocal(min)
  const maxDate = getDatePartFromDateTimeLocal(max)

  useEffect(() => {
    const normalized = normalizeRegistrationDateTime(value)
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
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(250px,1fr)_200px] gap-2">
      <input
        type="date"
        id={id}
        name={name ? `${name}Date` : undefined}
        value={datePart}
        min={minDate || undefined}
        max={maxDate || undefined}
        onChange={(e) => handleDateChange(e.target.value)}
        disabled={disabled}
        className="w-full min-w-0 pl-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
      />
      <select
        name={name ? `${name}Time` : undefined}
        value={datePart ? (normalizedTime || '00:00') : ''}
        onChange={(e) => handleTimeChange(e.target.value)}
        disabled={disabled}
        className="w-full min-w-0 pl-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8 bg-white"
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
    format: 'SINGLE_ELIMINATION' as TournamentFormat,
    seasonLabel: '',
    timezone: getBrowserTimeZone(),
    image: '',
  })
  const [stepIndex, setStepIndex] = useState(0)
  const [showCropper, setShowCropper] = useState(false)
  const [cropperImageSrc, setCropperImageSrc] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [showStructureModal, setShowStructureModal] = useState(false)
  const [structureDraft, setStructureDraft] = useState<TournamentStructureInput | null>(() => (
    buildRecommendedStructure('SINGLE_ELIMINATION')
  ))
  const [templateDraftOpen, setTemplateDraftOpen] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [templateDraftForm, setTemplateDraftForm] = useState({
    title: '',
    startDate: '',
    endDate: '',
    registrationStartDate: '',
    registrationEndDate: '',
    entryFee: '',
    isRecurring: false,
    recurrenceFrequency: 'WEEKLY' as 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY',
    recurrenceCount: 4,
    recurrenceWeekdays: [] as number[],
  })
  const [seriesDraftForm, setSeriesDraftForm] = useState({
    enabled: false,
    frequency: 'WEEKLY' as 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY',
    count: 4,
    weekdays: [] as number[],
  })
  const [saveTemplateForm, setSaveTemplateForm] = useState({
    enabled: false,
    name: '',
    description: '',
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
  const addressTimezoneSyncSeqRef = useRef(0)
  const lastAddressSelectionRef = useRef<{ placeId: string | null; formatted: string | null }>({
    placeId: null,
    formatted: null,
  })
  const [payoutStatus, setPayoutStatus] = useState<{
    hasAccount: boolean
    payoutsActive: boolean
    isLoading: boolean
  }>({ hasAccount: false, payoutsActive: false, isLoading: true })

  useEffect(() => {
    if (ENABLE_RECURRING_DRAFTS) return
    setSeriesDraftForm((prev) => (prev.enabled ? { ...prev, enabled: false } : prev))
    setTemplateDraftForm((prev) => (prev.isRecurring ? { ...prev, isRecurring: false } : prev))
  }, [])

  const createTournamentWithStructure = trpc.tournament.createWithStructure.useMutation({
    onSuccess: async (tournament) => {
      if (saveTemplateForm.enabled && saveTemplateForm.name.trim().length >= 2) {
        const canSave = Boolean(formData.clubId && (selectedClub as any)?.isAdmin)
        if (canSave) {
          try {
            await saveTemplateFromTournament.mutateAsync({
              tournamentId: tournament.id,
              name: saveTemplateForm.name.trim(),
              description: saveTemplateForm.description.trim() ? saveTemplateForm.description.trim() : undefined,
            })
          } catch (err: any) {
            alert(err?.message || 'Failed to save club template')
          }
        }
      }
      router.push(`/admin/${tournament.id}`)
    },
    onError: (error) => {
      console.error('Error creating tournament structure:', error)
      alert('Error creating tournament structure: ' + error.message)
    },
  })

  const createTournamentSeriesWithStructure = trpc.tournament.createSeriesWithStructure.useMutation({
    onSuccess: async (res: any) => {
      const ids = (res as any)?.tournamentIds ?? [res.tournamentId]
      const firstId = Array.isArray(ids) && ids.length ? String(ids[0]) : String(res?.tournamentId)

      if (saveTemplateForm.enabled && saveTemplateForm.name.trim().length >= 2) {
        const canSave = Boolean(formData.clubId && (selectedClub as any)?.isAdmin)
        if (canSave && firstId) {
          try {
            await saveTemplateFromTournament.mutateAsync({
              tournamentId: firstId,
              name: saveTemplateForm.name.trim(),
              description: saveTemplateForm.description.trim() ? saveTemplateForm.description.trim() : undefined,
            })
          } catch (err: any) {
            alert(err?.message || 'Failed to save club template')
          }
        }
      }

      if (Array.isArray(ids) && ids.length > 1) {
        router.push(`/admin?createdDraftIds=${encodeURIComponent(ids.join(','))}`)
      } else {
        router.push(`/admin/${res.tournamentId}`)
      }
    },
    onError: (error) => {
      console.error('Error creating tournament series:', error)
      alert('Error creating tournament series: ' + error.message)
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
  const saveTemplateFromTournament = trpc.clubTemplate.saveFromTournament.useMutation()

  const syncTimezoneFromAddress = useCallback(
    async (
      rawAddress: string,
      options?: { normalizeAddress?: boolean; state?: string | null; country?: string | null }
    ) => {
      const address = rawAddress.trim()
      if (!address) return

      const requestSeq = ++addressTimezoneSyncSeqRef.current
      const fallbackTimezone = guessTimeZoneFromLocation({
        address,
        state: options?.state,
        country: options?.country,
      })
      if (fallbackTimezone) {
        setFormData((prev) => ({
          ...prev,
          timezone: fallbackTimezone,
        }))
      }

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
          { address },
          (results: any, status: any) => {
            if (status !== 'OK' || !results?.length) return
            const result = results[0]
            if (!result?.formatted_address) return

            const lat = result?.geometry?.location?.lat?.()
            const lng = result?.geometry?.location?.lng?.()
            void (async () => {
              const resolvedTimezone =
                Number.isFinite(lat) && Number.isFinite(lng)
                  ? await resolveTimeZoneFromLatLng(lat as number, lng as number, googleApi)
                  : null

              if (requestSeq !== addressTimezoneSyncSeqRef.current) return

              setAddressError(null)
              lastAddressSelectionRef.current = {
                placeId: result.place_id ?? null,
                formatted: result.formatted_address ?? null,
              }
              setFormData((prev) => ({
                ...prev,
                venueAddress: options?.normalizeAddress
                  ? (result.formatted_address ?? prev.venueAddress)
                  : prev.venueAddress,
                timezone: resolvedTimezone || prev.timezone || getBrowserTimeZone(),
              }))
            })()
          }
        )
      } catch {
        // Best-effort only.
      }
    },
    []
  )

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
      const fallbackTimezone = guessTimeZoneFromLocation({
        address: selected.address,
        state: (selected as any).state,
        country: (selected as any).country,
      })
      return {
        ...prev,
        clubId: selectedIsAdmin ? selected.id : '',
        venueName: selected.name,
        venueAddress: selected.address || prev.venueAddress,
        timezone: fallbackTimezone || prev.timezone,
      }
    })
    if (selected.address?.trim()) {
      void syncTimezoneFromAddress(selected.address, {
        normalizeAddress: true,
        state: (selected as any).state,
        country: (selected as any).country,
      })
    }
  }, [clubs, searchParams, syncTimezoneFromAddress])

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
      const registrationCutoff = getRegistrationMaxDateTime(formData.startDate)
      const registrationCutoffDate = registrationCutoff ? new Date(registrationCutoff) : startDate
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
        if (regStartDate > registrationCutoffDate) {
          alert('Registration start date cannot be later than tournament start date')
          return false
        }
      }

      if (formData.registrationEndDate) {
        const regEndDate = new Date(formData.registrationEndDate)
        if (regEndDate > registrationCutoffDate) {
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
      const registrationCutoff = getRegistrationMaxDateTime(formData.startDate)
      const registrationCutoffDate = registrationCutoff ? new Date(registrationCutoff) : startDate
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
        if (regStartDate > registrationCutoffDate) {
          alert('Registration start date cannot be later than tournament start date')
          return false
        }
      }

      if (formData.registrationEndDate) {
        const regEndDate = new Date(formData.registrationEndDate)
        if (regEndDate > registrationCutoffDate) {
          alert('Registration end date cannot be later than tournament start date')
          return false
        }
      }
    }

    if (ENABLE_RECURRING_DRAFTS && seriesDraftForm.enabled) {
      const count = Number(seriesDraftForm.count)
      if (!Number.isFinite(count) || count < 2 || count > 12) {
        alert('Occurrences must be between 2 and 12.')
        return false
      }

      if (
        (seriesDraftForm.frequency === 'WEEKLY' || seriesDraftForm.frequency === 'BIWEEKLY') &&
        (seriesDraftForm.weekdays?.length ?? 0) < 1
      ) {
        alert('Pick at least one weekday for weekly recurrence.')
        return false
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

    if (structureDraft.mode === 'WITH_DIVISIONS') {
      const invalidTeams = divisions.find((d) => !Number.isFinite(d.teamCount) || d.teamCount < 2)
      if (invalidTeams) {
        alert('Teams in each division must be 2 or more.')
        return false
      }
      const invalidPools = divisions.find((d) => !Number.isFinite(d.poolCount) || d.poolCount < 1)
      if (invalidPools) {
        alert('Pools in each division must be 1 or more.')
        return false
      }
    }

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

    if (formData.format === 'LADDER_LEAGUE') {
      const bad = divisions.find((d) => (d.teamCount ?? 0) % 4 !== 0)
      if (bad) {
        alert('Ladder league requires the number of teams to be a multiple of 4 per division.')
        return false
      }
    }

    if (formData.format === 'MLP') {
      const bad = divisions.find((d) => d.playersPerTeam !== 4)
      if (bad) {
        alert('MiLP format requires 4-player teams.')
        return false
      }
    }

    return true
  }

  const goBack = () => setStepIndex((i) => Math.max(0, i - 1))
  const canLeaveStep = (idx: number) => {
    if (idx === 0) return validateBasicsStep()
    if (idx === 1) return validateScheduleStep()
    if (idx === 2) return validateFormatStep()
    return true
  }

  const goToStep = (targetIndex: number) => {
    if (targetIndex < 0 || targetIndex > totalSteps - 1) return
    if (targetIndex === stepIndex) return

    if (targetIndex < stepIndex) {
      setStepIndex(targetIndex)
      return
    }

    for (let idx = stepIndex; idx < targetIndex; idx++) {
      if (!canLeaveStep(idx)) return
    }
    setStepIndex(targetIndex)
  }

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

      if (!googleApi?.maps?.places?.Autocomplete) {
        throw new Error('Google Places is unavailable. Check API key restrictions and Places API.')
      }

      // Recreate autocomplete to ensure it's bound to the currently mounted input.
      addressListenerRef.current?.remove?.()
      addressAutocompleteRef.current = new googleApi.maps.places.Autocomplete(venueAddressInputRef.current, {
        fields: ['formatted_address', 'geometry', 'place_id'],
        types: ['geocode'],
      })

      addressListenerRef.current =
        addressAutocompleteRef.current.addListener('place_changed', () => {
          void (async () => {
            const place = addressAutocompleteRef.current?.getPlace()
            // `formatted_address` can be missing depending on the selection type / API response.
            // Fall back to the input value (which Google updates) and don't show an error since it's optional.
            const rawInput = (venueAddressInputRef.current?.value ?? '').trim()
            const formatted =
              (place?.formatted_address ? place.formatted_address.trim() : '') ||
              rawInput ||
              null

            const lat = place?.geometry?.location?.lat?.()
            const lng = place?.geometry?.location?.lng?.()
            const resolvedTimezone =
              Number.isFinite(lat) && Number.isFinite(lng)
                ? await resolveTimeZoneFromLatLng(lat as number, lng as number, googleApi)
                : null

            setAddressError(null)
            lastAddressSelectionRef.current = {
              placeId: place?.place_id ?? null,
              formatted,
            }
            setFormData((prev) => ({
              ...prev,
              venueAddress: formatted ?? '',
              timezone: resolvedTimezone || prev.timezone || getBrowserTimeZone(),
            }))
          })()
        })
    } catch (error) {
      setAddressError(
        error instanceof Error ? error.message : 'Failed to load Google Places.'
      )
    }
  }, [])

  useEffect(() => {
    if (stepIndex !== 0) return
    void setupAddressAutocomplete()
    return () => {
      addressListenerRef.current?.remove?.()
    }
  }, [setupAddressAutocomplete, stepIndex])

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

  const handleVenueAddressBlur = async (e?: React.FocusEvent<HTMLInputElement>) => {
    const raw = (e?.target?.value ?? formData.venueAddress ?? '').trim()
    if (!raw) return

    // If user picked from Google Autocomplete, don't re-validate via Geocoder.
    const last = lastAddressSelectionRef.current
    if (last.placeId && last.formatted && last.formatted === raw) {
      setAddressError(null)
      return
    }

    void syncTimezoneFromAddress(raw, { normalizeAddress: true })
  }

  const parsedEntryFee = Number(formData.entryFee)
  const entryFeeCents =
    Number.isFinite(parsedEntryFee) && parsedEntryFee > 0
      ? toCents(parsedEntryFee)
      : 0
  const organizerBreakdown = calculateOrganizerNetCents(entryFeeCents)
  const requiresPayoutsSetup =
    entryFeeCents > 0 && (!payoutStatus.payoutsActive || payoutStatus.isLoading)
  const isSeries =
    ENABLE_RECURRING_DRAFTS && seriesDraftForm.enabled && Number(seriesDraftForm.count) > 1
  const isCreating =
    createTournamentWithStructure.isPending ||
    createTournamentSeriesWithStructure.isPending ||
    saveTemplateFromTournament.isPending

  const [createArmed, setCreateArmed] = useState(true)

  useEffect(() => {
    // Prevent an accidental second click from creating the tournament immediately
    // when stepping into the final screen (double click on "Next").
    if (stepIndex !== totalSteps - 1) {
      setCreateArmed(true)
      return
    }

    setCreateArmed(false)
    const timer = window.setTimeout(() => setCreateArmed(true), 400)
    return () => window.clearTimeout(timer)
  }, [stepIndex, totalSteps])

  const createTournament = () => {
    if (!validateBaseForm()) {
      // Jump user to the step with the missing required fields.
      if (!formData.title.trim()) setStepIndex(0)
      else setStepIndex(1)
      return
    }
    if (!validateScheduleStep()) {
      setStepIndex(1)
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

    if (saveTemplateForm.enabled) {
      const canSave = Boolean(formData.clubId && (selectedClub as any)?.isAdmin)
      if (!canSave) {
        alert('Select a club where you are an admin to save a club template.')
        setStepIndex(0)
        return
      }
      if (saveTemplateForm.name.trim().length < 2) {
        alert('Template name is required (min 2 chars).')
        setStepIndex(3)
        return
      }
    }

    const normalizedTimezone = formData.timezone || undefined
    const payload = {
      title: formData.title,
      description: formData.description || undefined,
      venueName: formData.venueName || undefined,
      venueAddress: formData.venueAddress || undefined,
      clubId: formData.clubId || undefined,
      startDate:
        toUtcIsoFromLocalInput(formData.startDate, normalizedTimezone) || formData.startDate,
      endDate:
        toUtcIsoFromLocalInput(formData.endDate, normalizedTimezone) || formData.endDate,
      registrationStartDate: formData.registrationStartDate
        ? toUtcIsoFromLocalInput(formData.registrationStartDate, normalizedTimezone) ||
          formData.registrationStartDate
        : undefined,
      registrationEndDate: formData.registrationEndDate
        ? toUtcIsoFromLocalInput(formData.registrationEndDate, normalizedTimezone) ||
          formData.registrationEndDate
        : undefined,
      entryFeeCents: entryFeeCents || 0,
      currency: 'usd' as const,
      isPublicBoardEnabled: isSeries ? false : formData.isPublicBoardEnabled,
      allowDuprSubmission: formData.allowDuprSubmission,
      image: formData.image || undefined,
      format: formData.format,
      seasonLabel:
        formData.format === 'INDY_LEAGUE' || formData.format === 'LADDER_LEAGUE'
          ? (formData.seasonLabel || undefined)
          : undefined,
      timezone: normalizedTimezone,
    }

    if (isSeries) {
      const weekdays =
        seriesDraftForm.frequency === 'WEEKLY' || seriesDraftForm.frequency === 'BIWEEKLY'
          ? seriesDraftForm.weekdays
          : undefined
      createTournamentSeriesWithStructure.mutate({
        ...payload,
        structure: structureDraft!,
        recurrence: {
          frequency: seriesDraftForm.frequency,
          count: seriesDraftForm.count,
          weekdays,
        },
      })
    } else {
      createTournamentWithStructure.mutate({
        ...payload,
        structure: structureDraft!,
      })
    }
  }

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Allow Enter to behave like "Next" in earlier steps.
    if (stepIndex < totalSteps - 1) {
      goNext()
    }
    // On the final step, creation is explicit via the Create button onClick.
  }

  const handleStructureSave = (structure: TournamentStructureInput) => {
    setStructureDraft(structure)
    setShowStructureModal(false)
  }

  const quickDivision =
    structureDraft?.mode === 'WITH_DIVISIONS' && structureDraft.divisions.length === 1
      ? structureDraft.divisions[0]
      : null

  const updateQuickDivision = (updater: (division: any) => any) => {
    setStructureDraft((prev) => {
      if (!prev || prev.mode !== 'WITH_DIVISIONS' || prev.divisions.length !== 1) return prev
      const nextDivision = updater(prev.divisions[0])
      return { ...prev, divisions: [nextDivision] }
    })
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
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const start = formData.startDate || today
    const end = formData.endDate || start
    const startWeekday = parseYmdToUtc(start)?.getUTCDay() ?? 0
    setTemplateDraftForm({
      title: '',
      startDate: start,
      endDate: end,
      registrationStartDate: '',
      registrationEndDate: '',
      entryFee: formData.entryFee || '',
      isRecurring: false,
      recurrenceFrequency: 'WEEKLY',
      recurrenceCount: 4,
      recurrenceWeekdays: [startWeekday],
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
      const registrationCutoffRaw = getRegistrationMaxDateTime(templateDraftForm.startDate)
      const registrationCutoff = registrationCutoffRaw ? new Date(registrationCutoffRaw) : startDate
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
        if (regStartDate > registrationCutoff) {
          alert('Registration start date cannot be later than tournament start date')
          return false
        }
      }

      if (templateDraftForm.registrationEndDate) {
        const regEndDate = new Date(templateDraftForm.registrationEndDate)
        if (regEndDate > registrationCutoff) {
          alert('Registration end date cannot be later than tournament start date')
          return false
        }
      }
    }

    if (ENABLE_RECURRING_DRAFTS && templateDraftForm.isRecurring) {
      const count = Number(templateDraftForm.recurrenceCount)
      if (!Number.isFinite(count) || count < 1 || count > 12) {
        alert('Occurrences must be between 1 and 12.')
        return false
      }

      if (
        (templateDraftForm.recurrenceFrequency === 'WEEKLY' ||
          templateDraftForm.recurrenceFrequency === 'BIWEEKLY') &&
        (templateDraftForm.recurrenceWeekdays?.length ?? 0) < 1
      ) {
        alert('Pick at least one weekday for weekly recurrence.')
        return false
      }
    }

    return true
  }

  const templateRecurrencePreview = useMemo<
    { items: string[] } | { error: string } | null
  >(() => {
    if (!ENABLE_RECURRING_DRAFTS || !templateDraftForm.isRecurring || templateDraftForm.recurrenceCount <= 1) return null

    const start = parseYmdToUtc(templateDraftForm.startDate)
    const end = parseYmdToUtc(templateDraftForm.endDate)
    if (!start || !end) return null
    const durationMs = end.getTime() - start.getTime()
    if (durationMs < 0) return { error: 'End date must be on or after start date.' }

    const config = {
      frequency: templateDraftForm.recurrenceFrequency,
      count: templateDraftForm.recurrenceCount,
      weekdays:
        templateDraftForm.recurrenceFrequency === 'WEEKLY' ||
        templateDraftForm.recurrenceFrequency === 'BIWEEKLY'
          ? templateDraftForm.recurrenceWeekdays
          : undefined,
    } as const

    const generated = generateRecurringStartDates(start, config)
    if ('error' in generated) return { error: generated.error }

    const items = generated.startDates.map((s) => {
      const e = new Date(s.getTime() + durationMs)
      return durationMs === 0 ? formatUsDateShort(s) : `${formatUsDateShort(s)} – ${formatUsDateShort(e)}`
    })

    return { items }
  }, [
    templateDraftForm.isRecurring,
    templateDraftForm.recurrenceCount,
    templateDraftForm.recurrenceFrequency,
    templateDraftForm.recurrenceWeekdays,
    templateDraftForm.startDate,
    templateDraftForm.endDate,
  ])

  const seriesRecurrencePreview = useMemo<
    { items: string[] } | { error: string } | null
  >(() => {
    if (!ENABLE_RECURRING_DRAFTS || !seriesDraftForm.enabled || seriesDraftForm.count <= 1) return null
    if (!formData.startDate || !formData.endDate) return null

    const start = parseYmdToUtc(formData.startDate)
    const end = parseYmdToUtc(formData.endDate)
    if (!start || !end) return null
    const durationMs = end.getTime() - start.getTime()
    if (durationMs < 0) return { error: 'End date must be on or after start date.' }

    const config = {
      frequency: seriesDraftForm.frequency,
      count: seriesDraftForm.count,
      weekdays:
        seriesDraftForm.frequency === 'WEEKLY' || seriesDraftForm.frequency === 'BIWEEKLY'
          ? seriesDraftForm.weekdays
          : undefined,
    } as const

    const generated = generateRecurringStartDates(start, config)
    if ('error' in generated) return { error: generated.error }

    const items = generated.startDates.map((s) => {
      const e = new Date(s.getTime() + durationMs)
      return durationMs === 0 ? formatUsDateShort(s) : `${formatUsDateShort(s)} – ${formatUsDateShort(e)}`
    })

    return { items }
  }, [
    seriesDraftForm.enabled,
    seriesDraftForm.count,
    seriesDraftForm.frequency,
    seriesDraftForm.weekdays,
    formData.startDate,
    formData.endDate,
  ])

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
      const recurrence =
        ENABLE_RECURRING_DRAFTS && templateDraftForm.isRecurring && templateDraftForm.recurrenceCount > 1
          ? {
              frequency: templateDraftForm.recurrenceFrequency,
              count: templateDraftForm.recurrenceCount,
              weekdays:
                templateDraftForm.recurrenceFrequency === 'WEEKLY' ||
                templateDraftForm.recurrenceFrequency === 'BIWEEKLY'
                  ? templateDraftForm.recurrenceWeekdays
                  : undefined,
            }
          : undefined

      const templateTimezone =
        (selectedTemplate as any)?.config?.tournament?.timezone ||
        formData.timezone ||
        getBrowserTimeZone()

      const res = await createDraftFromTemplate.mutateAsync({
        templateId: selectedTemplateId,
        title: templateDraftForm.title.trim() ? templateDraftForm.title.trim() : undefined,
        startDate:
          toUtcIsoFromLocalInput(templateDraftForm.startDate, templateTimezone) ||
          templateDraftForm.startDate,
        endDate:
          toUtcIsoFromLocalInput(templateDraftForm.endDate, templateTimezone) ||
          templateDraftForm.endDate,
        registrationStartDate: templateDraftForm.registrationStartDate
          ? toUtcIsoFromLocalInput(templateDraftForm.registrationStartDate, templateTimezone) ||
            templateDraftForm.registrationStartDate
          : undefined,
        registrationEndDate: templateDraftForm.registrationEndDate
          ? toUtcIsoFromLocalInput(templateDraftForm.registrationEndDate, templateTimezone) ||
            templateDraftForm.registrationEndDate
          : undefined,
        entryFeeCents,
        recurrence,
      })
      setTemplateDraftOpen(false)
      const ids = (res as any)?.tournamentIds ?? [res.tournamentId]
      if (Array.isArray(ids) && ids.length > 1) {
        router.push(`/admin?createdDraftIds=${encodeURIComponent(ids.join(','))}`)
      } else {
        router.push(`/admin/${res.tournamentId}`)
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to create from template')
    }
  }

  const handleClubSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value
    const selected = clubs?.find((c) => c.id === selectedId)
    setSelectedTemplateId('')
    setFormData((prev) => {
      const next = { ...prev, clubId: selectedId }
      if (!selectedId) return next
      if (!selected) return next
      const fallbackTimezone = guessTimeZoneFromLocation({
        address: selected.address,
        state: (selected as any).state,
        country: (selected as any).country,
      })
      return {
        ...next,
        venueName: selected.name,
        venueAddress: selected.address || prev.venueAddress,
        timezone: fallbackTimezone || next.timezone,
      }
    })

    if (selected?.address?.trim()) {
      void syncTimezoneFromAddress(selected.address, {
        normalizeAddress: true,
        state: (selected as any).state,
        country: (selected as any).country,
      })
      return
    }
    if (!selectedId) {
      const currentAddress = (formData.venueAddress || '').trim()
      if (currentAddress) {
        void syncTimezoneFromAddress(currentAddress, { normalizeAddress: true })
      }
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }))
    if (name === 'format') {
      setStructureDraft(buildRecommendedStructure(value as TournamentFormat))
    }
    if (name === 'title' || name === 'startDate' || name === 'endDate') {
      setRequiredErrors(prev => ({
        ...prev,
        [name]: !value,
      }))
    }
  }

  const handleTournamentDateTimeFieldChange = (
    name: 'startDate' | 'endDate',
    value: string
  ) => {
    const normalized = normalizeRegistrationDateTime(value)
    setFormData((prev) => ({
      ...prev,
      [name]: normalized,
    }))
    setRequiredErrors((prev) => ({
      ...prev,
      [name]: !normalized,
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
              <button
                key={s.key}
                type="button"
                onClick={() => goToStep(idx)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
                  isActive
                    ? 'border-blue-200 bg-blue-50 text-blue-900'
                    : isDone
                      ? 'border-gray-200 bg-white text-gray-700'
                      : 'border-gray-200 bg-gray-50 text-gray-500'
                } transition-colors hover:bg-gray-100`}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                    isActive ? 'bg-blue-600 text-white' : isDone ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-700'
                  }`}
                >
                  {idx + 1}
                </span>
                <span className="font-medium">{s.title}</span>
              </button>
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
          <form onSubmit={handleFormSubmit} className="space-y-6">
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
                      Start Date & Time *
                    </label>
                    <QuarterHourDateTimeInput
                      id="startDate"
                      name="startDate"
                      value={formData.startDate}
                      onChange={(nextValue) => handleTournamentDateTimeFieldChange('startDate', nextValue)}
                    />
                    {requiredErrors.startDate ? (
                      <p className="mt-1 text-sm text-red-600">Start date is required.</p>
                    ) : null}
                  </div>

                  <div>
                    <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-2">
                      End Date & Time *
                    </label>
                    <QuarterHourDateTimeInput
                      id="endDate"
                      name="endDate"
                      value={formData.endDate}
                      onChange={(nextValue) => handleTournamentDateTimeFieldChange('endDate', nextValue)}
                      min={formData.startDate || undefined}
                    />
                    {requiredErrors.endDate ? (
                      <p className="mt-1 text-sm text-red-600">End date is required.</p>
                    ) : null}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="registrationStartDate" className="block text-sm font-medium text-gray-700 mb-2">
                      Registration Start (optional)
                    </label>
                    <QuarterHourDateTimeInput
                      id="registrationStartDate"
                      name="registrationStartDate"
                      value={formData.registrationStartDate}
                      onChange={(nextValue) =>
                        setFormData((prev) => ({ ...prev, registrationStartDate: normalizeRegistrationDateTime(nextValue) }))
                      }
                      max={getRegistrationMaxDateTime(formData.startDate)}
                    />
                    <p className="mt-1 text-xs text-gray-500">Include hours and minutes.</p>
                  </div>

                  <div>
                    <label htmlFor="registrationEndDate" className="block text-sm font-medium text-gray-700 mb-2">
                      Registration End (optional)
                    </label>
                    <QuarterHourDateTimeInput
                      id="registrationEndDate"
                      name="registrationEndDate"
                      value={formData.registrationEndDate}
                      onChange={(nextValue) =>
                        setFormData((prev) => ({ ...prev, registrationEndDate: normalizeRegistrationDateTime(nextValue) }))
                      }
                      min={formData.registrationStartDate || undefined}
                      max={getRegistrationMaxDateTime(formData.startDate)}
                    />
                    <p className="mt-1 text-xs text-gray-500">Include hours and minutes.</p>
                  </div>
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
                    className="w-full pl-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-[2.5rem]"
                    placeholder="e.g., America/New_York"
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    Auto-filled from venue location. You can adjust manually.
                  </p>
                </div>

                {ENABLE_RECURRING_DRAFTS ? (
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-gray-900">Recurring drafts (optional)</div>
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={seriesDraftForm.enabled}
                          onChange={(e) => {
                            const checked = e.target.checked
                            setSeriesDraftForm((p) => {
                              const next = { ...p, enabled: checked }
                              const isWeeklyLike = p.frequency === 'WEEKLY' || p.frequency === 'BIWEEKLY'
                              if (checked && isWeeklyLike && (p.weekdays?.length ?? 0) < 1) {
                                const wd = parseYmdToUtc(formData.startDate)?.getUTCDay() ?? 0
                                next.weekdays = [wd]
                              }
                              return next
                            })
                          }}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        Create series
                      </label>
                    </div>

                    {seriesDraftForm.enabled ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Frequency</label>
                          <select
                            value={seriesDraftForm.frequency}
                            onChange={(e) => {
                              const value = e.target.value as any
                              setSeriesDraftForm((p) => {
                                const next = { ...p, frequency: value }
                                const isWeeklyLike = value === 'WEEKLY' || value === 'BIWEEKLY'
                                if (isWeeklyLike && (p.weekdays?.length ?? 0) < 1) {
                                  const wd = parseYmdToUtc(formData.startDate)?.getUTCDay() ?? 0
                                  next.weekdays = [wd]
                                }
                                return next
                              })
                            }}
                            className="w-full pl-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-[2.5rem] bg-white"
                          >
                            <option value="DAILY">Daily</option>
                            <option value="WEEKLY">Weekly</option>
                            <option value="BIWEEKLY">Every 2 weeks</option>
                            <option value="MONTHLY">Monthly</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Occurrences</label>
                          <input
                            type="number"
                            min={2}
                            max={12}
                            value={seriesDraftForm.count}
                            onChange={(e) => {
                              const n = Number(e.target.value)
                              const next = Number.isFinite(n) ? Math.trunc(n) : 0
                              setSeriesDraftForm((p) => ({ ...p, count: next }))
                            }}
                            onBlur={() => {
                              setSeriesDraftForm((p) => {
                                const safe = Number.isFinite(p.count)
                                  ? Math.max(2, Math.min(12, Math.trunc(p.count)))
                                  : 2
                                return { ...p, count: safe }
                              })
                            }}
                            className="w-full pl-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-[2.5rem]"
                          />
                          <p className="mt-1 text-xs text-gray-500">Max 12. Includes the first draft.</p>
                        </div>

                        {(seriesDraftForm.frequency === 'WEEKLY' ||
                          seriesDraftForm.frequency === 'BIWEEKLY') ? (
                          <div className="sm:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Weekdays</label>
                            <div className="flex flex-wrap gap-2">
                              {[
                                { v: 0, l: 'Sun' },
                                { v: 1, l: 'Mon' },
                                { v: 2, l: 'Tue' },
                                { v: 3, l: 'Wed' },
                                { v: 4, l: 'Thu' },
                                { v: 5, l: 'Fri' },
                                { v: 6, l: 'Sat' },
                              ].map((d) => {
                                const selected = (seriesDraftForm.weekdays ?? []).includes(d.v)
                                return (
                                  <button
                                    key={d.v}
                                    type="button"
                                    onClick={() => {
                                      setSeriesDraftForm((p) => {
                                        const current = p.weekdays ?? []
                                        const has = current.includes(d.v)
                                        const nextDays = has ? current.filter((x) => x !== d.v) : [...current, d.v]
                                        if (nextDays.length < 1) return p
                                        return { ...p, weekdays: nextDays.sort((a, b) => a - b) }
                                      })
                                    }}
                                    className={`px-3 py-2 rounded-lg border text-sm ${
                                      selected
                                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                                    }`}
                                  >
                                    {d.l}
                                  </button>
                                )
                              })}
                            </div>
                            <p className="mt-1 text-xs text-gray-500">Example: select Tue + Fri.</p>
                          </div>
                        ) : null}

                        <div className="sm:col-span-2 text-xs text-gray-600">
                          This creates <span className="font-medium">{seriesDraftForm.count}</span> drafts. We keep them{' '}
                          <span className="font-medium">unpublished</span> so you can review before publishing.
                        </div>

                        {seriesDraftForm.count > 1 ? (
                          <div className="sm:col-span-2 rounded-md border border-gray-200 bg-white p-3">
                            <div className="text-xs font-medium text-gray-900 mb-2">Preview dates</div>
                            {seriesRecurrencePreview && 'error' in seriesRecurrencePreview ? (
                              <div className="text-xs text-red-700">{seriesRecurrencePreview.error}</div>
                            ) : seriesRecurrencePreview && 'items' in seriesRecurrencePreview && seriesRecurrencePreview.items.length ? (
                              <ul className="max-h-40 overflow-y-auto text-xs text-gray-700 space-y-1">
                                {seriesRecurrencePreview.items.map((label, idx) => (
                                  <li key={idx} className="flex gap-2">
                                    <span className="w-5 text-gray-400">{idx + 1}.</span>
                                    <span className="flex-1">{label}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <div className="text-xs text-gray-500">Pick dates to see a preview.</div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-500">
                        Create a single tournament, or turn this on to generate a draft series (weekly league, etc).
                      </div>
                    )}
                  </div>
                ) : null}
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
                    <option value="LEAGUE_ROUND_ROBIN">Round Robin League</option>
                    <option value="ONE_DAY_LADDER">One-day Ladder</option>
                    <option value="LADDER_LEAGUE">Ladder League</option>
                    <option value="MLP">MiLP style</option>
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
                      Advanced
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

                  {quickDivision ? (
                    <div className="rounded-lg border border-gray-200 bg-white p-3">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <div className="text-xs font-medium text-gray-700 mb-2">Players per team</div>
                          <div className="flex gap-2">
                            {([1, 2, 4] as const).map((value) => {
                              const forceSquad = formData.format === 'MLP' || formData.format === 'INDY_LEAGUE'
                              const disableSingles = formData.format === 'ONE_DAY_LADDER' || formData.format === 'LADDER_LEAGUE'
                              const disabled = (forceSquad && value !== 4) || (disableSingles && value === 1)
                              const selected = quickDivision.playersPerTeam === value
                              return (
                                <button
                                  key={value}
                                  type="button"
                                  disabled={disabled}
                                  onClick={() => {
                                    if (disabled) return
                                    updateQuickDivision((d) => ({ ...d, playersPerTeam: value }))
                                  }}
                                  className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                                    selected
                                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                                      : disabled
                                        ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                                  }`}
                                >
                                  {value}
                                </button>
                              )
                            })}
                          </div>
                          {(formData.format === 'MLP' || formData.format === 'INDY_LEAGUE') ? (
                            <div className="mt-2 text-xs text-gray-500">This format requires 4-player teams.</div>
                          ) : null}
                          {(formData.format === 'ONE_DAY_LADDER' || formData.format === 'LADDER_LEAGUE') ? (
                            <div className="mt-2 text-xs text-gray-500">Ladder formats require teams (not 1v1).</div>
                          ) : null}
                          <div className="mt-2 text-xs text-gray-500">1 = Singles, 2 = Doubles, 4 = Squad.</div>
                        </div>

                        <div>
                          <div className="text-xs font-medium text-gray-700 mb-2">Teams</div>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={Number.isFinite(quickDivision.teamCount) ? String(quickDivision.teamCount) : ''}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/[^\d-]/g, '')
                              if (!raw.trim()) {
                                updateQuickDivision((d) => ({ ...d, teamCount: Number.NaN }))
                                return
                              }
                              const n = Number(raw)
                              const safe = Number.isFinite(n) ? Math.trunc(n) : Number.NaN
                              updateQuickDivision((d) => ({ ...d, teamCount: safe }))
                            }}
                            className="w-full pl-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-[2.5rem]"
                          />
                          {formData.format === 'ONE_DAY_LADDER' &&
                          Number.isFinite(quickDivision.teamCount) &&
                          quickDivision.teamCount % 2 !== 0 ? (
                            <div className="mt-2 text-xs text-red-700">One-day ladder requires an even number of teams.</div>
                          ) : null}
                          {formData.format === 'LADDER_LEAGUE' &&
                          Number.isFinite(quickDivision.teamCount) &&
                          quickDivision.teamCount % 4 !== 0 ? (
                            <div className="mt-2 text-xs text-red-700">Ladder league requires teams to be a multiple of 4.</div>
                          ) : null}
                        </div>

                        <div>
                          <div className="text-xs font-medium text-gray-700 mb-2">Pools</div>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={Number.isFinite(quickDivision.poolCount) ? String(quickDivision.poolCount) : ''}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/[^\d-]/g, '')
                              if (!raw.trim()) {
                                updateQuickDivision((d) => ({ ...d, poolCount: Number.NaN }))
                                return
                              }
                              const n = Number(raw)
                              const safe = Number.isFinite(n) ? Math.trunc(n) : Number.NaN
                              updateQuickDivision((d) => ({ ...d, poolCount: safe }))
                            }}
                            className="w-full pl-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-[2.5rem]"
                          />
                          <div className="mt-2 text-xs text-gray-500">
                            Most common: 1–4 pools.
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : structureDraft ? (
                    <div className="text-xs text-gray-500">
                      Quick setup is available for a single-division structure. Use <span className="font-medium">Advanced</span> for multiple divisions or constraints.
                    </div>
                  ) : null}

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

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="isPublicBoardEnabled"
                        name="isPublicBoardEnabled"
                        checked={isSeries ? false : formData.isPublicBoardEnabled}
                        onChange={handleChange}
                        disabled={isSeries}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <label htmlFor="isPublicBoardEnabled" className="ml-2 block text-sm text-gray-700">
                        Enable public results board
                      </label>
                    </div>
                    {isSeries ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setSeriesDraftForm((p) => ({ ...p, enabled: false }))}
                      >
                        Switch to single
                      </Button>
                    ) : null}
                  </div>
                  {isSeries ? (
                    <div className="text-xs text-amber-800">
                      Series mode always creates drafts. Disable series to publish a single tournament.
                    </div>
                  ) : null}
                </div>
                {!isSeries ? (
                  <p className="text-xs text-gray-500">
                    When enabled, the tournament is published on the public board and visible on the main page.
                  </p>
                ) : null}

                {isSeries ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    Recurring series creates <span className="font-medium">drafts only</span>. Publish each one when ready.
                  </div>
                ) : null}

                {formData.clubId && (selectedClub as any)?.isAdmin ? (
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-gray-900">Club template (optional)</div>
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={saveTemplateForm.enabled}
                          onChange={(e) => {
                            const checked = e.target.checked
                            setSaveTemplateForm((p) => {
                              const next = { ...p, enabled: checked }
                              if (checked && !p.name.trim()) {
                                next.name = formData.title.trim()
                              }
                              return next
                            })
                          }}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        Save as template
                      </label>
                    </div>

                    {saveTemplateForm.enabled ? (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Template name *
                          </label>
                          <input
                            type="text"
                            value={saveTemplateForm.name}
                            onChange={(e) => setSaveTemplateForm((p) => ({ ...p, name: e.target.value }))}
                            className="w-full pl-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-[2.5rem]"
                            placeholder="e.g., Weekly Open Doubles"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Template description (optional)
                          </label>
                          <textarea
                            rows={3}
                            value={saveTemplateForm.description}
                            onChange={(e) => setSaveTemplateForm((p) => ({ ...p, description: e.target.value }))}
                            className="w-full pl-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-[2.5rem]"
                            placeholder="Notes for club admins (pricing, courts, etc.)"
                          />
                        </div>
                        <div className="text-xs text-gray-600">
                          Visible to <span className="font-medium">all admins</span> of this club.
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-gray-500">
                        Save this configuration as a preset so club admins can create drafts in 1 click later.
                      </div>
                    )}
                  </div>
                ) : null}

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
                    type="button"
                    onClick={createTournament}
                    disabled={
                      !createArmed ||
                      isCreating ||
                      requiresPayoutsSetup ||
                      !structureDraft
                    }
                  >
                    {isCreating
                      ? 'Creating…'
                      : !createArmed
                        ? 'One sec…'
                        : isSeries
                          ? `Create ${seriesDraftForm.count} drafts`
                          : 'Create Tournament'}
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
                  <QuarterHourDateTimeInput
                    value={templateDraftForm.registrationStartDate}
                    onChange={(nextValue) =>
                      setTemplateDraftForm((prev) => ({
                        ...prev,
                        registrationStartDate: normalizeRegistrationDateTime(nextValue),
                      }))
                    }
                    max={getRegistrationMaxDateTime(templateDraftForm.startDate)}
                  />
                  <p className="mt-1 text-xs text-gray-500">Include hours and minutes.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Registration End (optional)</label>
                  <QuarterHourDateTimeInput
                    value={templateDraftForm.registrationEndDate}
                    onChange={(nextValue) =>
                      setTemplateDraftForm((prev) => ({
                        ...prev,
                        registrationEndDate: normalizeRegistrationDateTime(nextValue),
                      }))
                    }
                    min={templateDraftForm.registrationStartDate || undefined}
                    max={getRegistrationMaxDateTime(templateDraftForm.startDate)}
                  />
                  <p className="mt-1 text-xs text-gray-500">Include hours and minutes.</p>
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

              <div
                className={
                  ENABLE_RECURRING_DRAFTS
                    ? 'rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3'
                    : 'hidden'
                }
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-gray-900">Recurring drafts (optional)</div>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={templateDraftForm.isRecurring}
                      onChange={(e) => {
                        const checked = e.target.checked
                        setTemplateDraftForm((p) => {
                          const next = { ...p, isRecurring: checked }
                          if (checked && (p.recurrenceWeekdays?.length ?? 0) < 1) {
                            const wd = parseYmdToUtc(p.startDate)?.getUTCDay() ?? 0
                            next.recurrenceWeekdays = [wd]
                          }
                          return next
                        })
                      }}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    Create series
                  </label>
                </div>

                {templateDraftForm.isRecurring ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Frequency</label>
                      <select
                        value={templateDraftForm.recurrenceFrequency}
                        onChange={(e) => {
                          const value = e.target.value as any
                          setTemplateDraftForm((p) => {
                            const next = { ...p, recurrenceFrequency: value }
                            const isWeeklyLike = value === 'WEEKLY' || value === 'BIWEEKLY'
                            if (isWeeklyLike && (p.recurrenceWeekdays?.length ?? 0) < 1) {
                              const wd = parseYmdToUtc(p.startDate)?.getUTCDay() ?? 0
                              next.recurrenceWeekdays = [wd]
                            }
                            return next
                          })
                        }}
                        className="w-full pl-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-[2.5rem] bg-white"
                      >
                        <option value="DAILY">Daily</option>
                        <option value="WEEKLY">Weekly</option>
                        <option value="BIWEEKLY">Every 2 weeks</option>
                        <option value="MONTHLY">Monthly</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Occurrences</label>
                      <input
                        type="number"
                        min={1}
                        max={12}
                        value={templateDraftForm.recurrenceCount}
                        onChange={(e) => {
                          const n = Number(e.target.value)
                          const next = Number.isFinite(n) ? Math.trunc(n) : 0
                          setTemplateDraftForm((p) => ({ ...p, recurrenceCount: next }))
                        }}
                        onBlur={() => {
                          setTemplateDraftForm((p) => {
                            const safe = Number.isFinite(p.recurrenceCount)
                              ? Math.max(1, Math.min(12, Math.trunc(p.recurrenceCount)))
                              : 1
                            return { ...p, recurrenceCount: safe }
                          })
                        }}
                        className="w-full pl-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-[2.5rem]"
                      />
                      <p className="mt-1 text-xs text-gray-500">Max 12. Includes the first draft.</p>
                    </div>

                    {(templateDraftForm.recurrenceFrequency === 'WEEKLY' ||
                      templateDraftForm.recurrenceFrequency === 'BIWEEKLY') ? (
                      <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Weekdays</label>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { v: 0, l: 'Sun' },
                            { v: 1, l: 'Mon' },
                            { v: 2, l: 'Tue' },
                            { v: 3, l: 'Wed' },
                            { v: 4, l: 'Thu' },
                            { v: 5, l: 'Fri' },
                            { v: 6, l: 'Sat' },
                          ].map((d) => {
                            const selected = (templateDraftForm.recurrenceWeekdays ?? []).includes(d.v)
                            return (
                              <button
                                key={d.v}
                                type="button"
                                onClick={() => {
                                  setTemplateDraftForm((p) => {
                                    const current = p.recurrenceWeekdays ?? []
                                    const has = current.includes(d.v)
                                    const nextDays = has ? current.filter((x) => x !== d.v) : [...current, d.v]
                                    // Keep at least one day selected for weekly schedules.
                                    if (nextDays.length < 1) return p
                                    return { ...p, recurrenceWeekdays: nextDays.sort((a, b) => a - b) }
                                  })
                                }}
                                className={`px-3 py-2 rounded-lg border text-sm ${
                                  selected
                                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                                }`}
                              >
                                {d.l}
                              </button>
                            )
                          })}
                        </div>
                        <p className="mt-1 text-xs text-gray-500">Example: select Tue + Fri.</p>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="text-xs text-gray-500">
                    Create one draft now. You can always create more later from the same template.
                  </div>
                )}

                {templateDraftForm.isRecurring ? (
                  <div className="text-xs text-gray-600">
                    This will create <span className="font-medium">{templateDraftForm.recurrenceCount}</span>{' '}
                    draft tournaments (not public).
                  </div>
                ) : null}

                {ENABLE_RECURRING_DRAFTS &&
                templateDraftForm.isRecurring &&
                templateDraftForm.recurrenceCount > 1 ? (
                  <div className="rounded-md border border-gray-200 bg-white p-3">
                    <div className="text-xs font-medium text-gray-900 mb-2">Preview dates</div>
                    {templateRecurrencePreview && 'error' in templateRecurrencePreview ? (
                      <div className="text-xs text-red-700">{templateRecurrencePreview.error}</div>
                    ) : templateRecurrencePreview && 'items' in templateRecurrencePreview && templateRecurrencePreview.items.length ? (
                      <ul className="max-h-40 overflow-y-auto text-xs text-gray-700 space-y-1">
                        {templateRecurrencePreview.items.map((label, idx) => (
                          <li key={idx} className="flex gap-2">
                            <span className="w-5 text-gray-400">{idx + 1}.</span>
                            <span className="flex-1">{label}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-xs text-gray-500">Pick dates to see a preview.</div>
                    )}
                  </div>
                ) : null}
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
                {createDraftFromTemplate.isPending
                  ? 'Creating…'
                  : ENABLE_RECURRING_DRAFTS &&
                      templateDraftForm.isRecurring &&
                      templateDraftForm.recurrenceCount > 1
                    ? `Create ${templateDraftForm.recurrenceCount} drafts`
                    : 'Create draft'}
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
