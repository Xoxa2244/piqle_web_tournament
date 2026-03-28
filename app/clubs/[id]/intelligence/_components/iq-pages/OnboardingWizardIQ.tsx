'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  MapPin, ChevronRight, ChevronLeft,
  Sparkles, Upload, FileSpreadsheet, CheckCircle2, Database, HelpCircle,
} from 'lucide-react'
import { useTheme } from '../IQThemeProvider'
import { AILoadingAnimation } from './AILoadingAnimation'
import { trpc } from '@/lib/trpc'
import { loadGoogleMaps } from '@/lib/googleMapsLoader'

type Props = {
  clubId: string
  onComplete: () => void
  isNewClub?: boolean
  onCreateClub?: (data: { name: string; kind: 'VENUE' | 'COMMUNITY'; address?: string; city?: string; state?: string; country?: string }) => Promise<string>
}

// Map Google timezone IDs from lat/lng (simple lookup by country)
const COUNTRY_TZ: Record<string, string> = {
  'United States': 'America/New_York',
  'Canada': 'America/Toronto',
  'United Kingdom': 'Europe/London',
  'Germany': 'Europe/Berlin',
  'Australia': 'Australia/Sydney',
}

// Refine US timezone by state
const US_STATE_TZ: Record<string, string> = {
  'HI': 'Pacific/Honolulu', 'AK': 'America/Anchorage',
  'WA': 'America/Los_Angeles', 'OR': 'America/Los_Angeles', 'CA': 'America/Los_Angeles', 'NV': 'America/Los_Angeles',
  'ID': 'America/Boise', 'MT': 'America/Denver', 'WY': 'America/Denver', 'UT': 'America/Denver', 'CO': 'America/Denver', 'AZ': 'America/Phoenix', 'NM': 'America/Denver',
  'ND': 'America/Chicago', 'SD': 'America/Chicago', 'NE': 'America/Chicago', 'KS': 'America/Chicago', 'MN': 'America/Chicago', 'IA': 'America/Chicago', 'MO': 'America/Chicago', 'WI': 'America/Chicago', 'IL': 'America/Chicago', 'TX': 'America/Chicago', 'OK': 'America/Chicago', 'AR': 'America/Chicago', 'LA': 'America/Chicago', 'MS': 'America/Chicago', 'AL': 'America/Chicago', 'TN': 'America/Chicago',
}

const SOFTWARE_OPTIONS = [
  { id: 'courtreserve', label: 'CourtReserve', icon: '🎾', files: ['Members Report', 'Reservation Report', 'Event Registrants Report'] },
  { id: 'other', label: 'Other / Custom', icon: '📄', files: [] },
  { id: 'none', label: 'No software yet', icon: '🆕', files: [] },
]

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl p-6 ${className}`} style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', backdropFilter: 'var(--glass-blur)', boxShadow: 'var(--card-shadow)' }}>
      {children}
    </div>
  )
}

function FileUploadSlot({ label, description, file, onFile }: {
  label: string; description: string; file: File | null; onFile: (f: File) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const { isDark } = useTheme()

  if (file) {
    return (
      <div className="rounded-xl p-4 flex items-center gap-3" style={{
        background: isDark ? 'rgba(16, 185, 129, 0.08)' : 'rgba(16, 185, 129, 0.06)',
        border: '1px solid rgba(16, 185, 129, 0.2)',
      }}>
        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate" style={{ color: 'var(--heading)' }}>{file.name}</p>
          <p className="text-xs" style={{ color: 'var(--t4)' }}>{(file.size / 1024).toFixed(0)} KB</p>
        </div>
      </div>
    )
  }

  const [dragOver, setDragOver] = useState(false)

  return (
    <div
      className="rounded-xl p-4 cursor-pointer transition-all"
      style={{
        background: dragOver ? (isDark ? 'rgba(139,92,246,0.12)' : 'rgba(139,92,246,0.08)') : 'var(--subtle)',
        border: dragOver ? '2px solid rgba(139,92,246,0.5)' : '1px dashed var(--card-border)',
      }}
      onClick={() => ref.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: isDark ? 'rgba(139,92,246,0.1)' : 'rgba(139,92,246,0.06)' }}>
          <FileSpreadsheet className="w-5 h-5" style={{ color: '#A78BFA' }} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium" style={{ color: 'var(--heading)' }}>{label}</p>
          <p className="text-xs" style={{ color: 'var(--t4)' }}>{description}</p>
        </div>
        <Upload className="w-4 h-4 shrink-0 ml-auto" style={{ color: dragOver ? '#A78BFA' : 'var(--t4)' }} />
      </div>
      <input ref={ref} type="file" accept=".csv,.tsv,.xlsx,.xls" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
    </div>
  )
}

export function OnboardingWizardIQ({ clubId: initialClubId, onComplete, isNewClub, onCreateClub }: Props) {
  const [resolvedClubId, setResolvedClubId] = useState(initialClubId)
  const { isDark } = useTheme()
  const [step, setStep] = useState(0)
  const [processing, setProcessing] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [importStatus, setImportStatus] = useState('')
  const hasFilesRef = useRef(false)

  // Step 0: Club Info
  const [clubName, setClubName] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [country, setCountry] = useState('')
  const [timezone, setTimezone] = useState('')
  const [addressSelected, setAddressSelected] = useState(false)

  // Step 1: Software + Files
  const [software, setSoftware] = useState<string | null>(null)
  const [membersFile, setMembersFile] = useState<File | null>(null)
  const [reservationsFile, setReservationsFile] = useState<File | null>(null)
  const [eventsFile, setEventsFile] = useState<File | null>(null)
  const [genericFile, setGenericFile] = useState<File | null>(null)

  // Google Maps autocomplete
  const addressInputRef = useRef<HTMLInputElement | null>(null)
  const autocompleteRef = useRef<any>(null)
  const listenerRef = useRef<any>(null)

  const setupAutocomplete = useCallback(async () => {
    if (!addressInputRef.current) return
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ''
    if (!apiKey) return
    try {
      const googleApi = await loadGoogleMaps({ apiKey, libraries: ['places'] })
      if (!autocompleteRef.current) {
        autocompleteRef.current = new googleApi.maps.places.Autocomplete(addressInputRef.current, {
          fields: ['formatted_address', 'geometry', 'place_id', 'address_components'],
          types: ['address'],
        })
      }
      listenerRef.current?.remove?.()
      listenerRef.current = autocompleteRef.current.addListener('place_changed', () => {
        const place = autocompleteRef.current?.getPlace()
        if (!place?.formatted_address) return
        const components = place.address_components ?? []
        const find = (type: string) => components.find((c: any) => c.types?.includes(type))
        const newCity = find('locality')?.long_name ?? find('postal_town')?.long_name ?? ''
        const newState = find('administrative_area_level_1')?.short_name ?? ''
        const newCountry = find('country')?.long_name ?? ''

        setAddress(place.formatted_address)
        setCity(newCity)
        setState(newState)
        setCountry(newCountry)
        setAddressSelected(true)

        let tz = COUNTRY_TZ[newCountry] || 'America/New_York'
        if (newCountry === 'United States' && newState) {
          tz = US_STATE_TZ[newState] || tz
        }
        setTimezone(tz)
      })
    } catch (err) {
      console.warn('[Onboarding] Google Maps failed:', err)
    }
  }, [])

  useEffect(() => {
    if (step === 0) {
      const id = requestAnimationFrame(() => setupAutocomplete())
      return () => {
        cancelAnimationFrame(id)
        listenerRef.current?.remove?.()
      }
    }
  }, [step, setupAutocomplete])

  // Mutations
  const updateClub = trpc.club.update.useMutation()
  const saveMutation = trpc.intelligence.saveIntelligenceSettings.useMutation()

  const handleComplete = async () => {
    const hasAnyFile = !!(membersFile || reservationsFile || eventsFile || genericFile)
    hasFilesRef.current = hasAnyFile
    setProcessing(true)

    // 1. Create or update club
    let clubId = resolvedClubId
    const clubName_ = (clubName || '').trim().length >= 2 ? clubName.trim() : 'My Club'

    if (isNewClub && onCreateClub) {
      try {
        clubId = await onCreateClub({
          name: clubName_,
          kind: 'VENUE',
          address: address || undefined,
          city: city || undefined,
          state: state || undefined,
          country: country || 'United States',
        })
        setResolvedClubId(clubId)
      } catch (err: any) {
        console.error('[Onboarding] Club creation failed:', err?.message || err)
        return
      }
    } else if (clubId && clubId !== 'pending') {
      try {
        await updateClub.mutateAsync({
          id: clubId,
          name: clubName_,
          kind: 'VENUE',
          joinPolicy: 'OPEN',
          address: address || undefined,
          city: city || undefined,
          state: state || undefined,
          country: country || 'United States',
        })
      } catch (err: any) {
        console.error('[Onboarding] Club update failed:', err?.message || err)
      }
    }

    // 2. Save intelligence settings with defaults
    try {
      await saveMutation.mutateAsync({
        clubId,
        settings: {
          timezone: timezone || 'America/New_York',
          sportTypes: ['pickleball'],
          courtCount: 8,
          hasIndoorCourts: true,
          hasOutdoorCourts: true,
          operatingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as any,
          operatingHours: { open: '06:00', close: '22:00' },
          peakHours: { start: '17:00', end: '20:00' },
          typicalSessionDurationMinutes: 90,
          pricingModel: 'per_session' as any,
          avgSessionPriceCents: 1500,
          communicationPreferences: { preferredChannel: 'email' as any, tone: 'friendly' as any, maxMessagesPerWeek: 4 },
          goals: ['fill_sessions', 'improve_retention', 'increase_revenue'] as any,
          onboardingCompletedAt: new Date().toISOString(),
          onboardingVersion: 2,
          connectedSoftware: software || undefined,
        },
      })
    } catch (err) {
      console.error('[Onboarding] Settings save failed:', err)
      try {
        await saveMutation.mutateAsync({ clubId, settings: { onboardingCompletedAt: new Date().toISOString() } })
      } catch (err2) {
        console.error('[Onboarding] Minimal save failed:', err2)
      }
    }

    // 3. Import files if provided
    if (hasAnyFile) {
      try {
        const filesToImport = software === 'courtreserve'
          ? [
            membersFile && { type: 'members', file: membersFile },
            reservationsFile && { type: 'reservations', file: reservationsFile },
            eventsFile && { type: 'events', file: eventsFile },
          ].filter(Boolean) as { type: string; file: File }[]
          : genericFile ? [{ type: 'generic', file: genericFile }] : []

        setImportStatus(`Importing ${filesToImport.length} file${filesToImport.length > 1 ? 's' : ''}...`)
        setImportProgress(10)

        for (let i = 0; i < filesToImport.length; i++) {
          const { type, file } = filesToImport[i]
          setImportStatus(`Processing ${file.name}...`)
          setImportProgress(10 + Math.round((i / filesToImport.length) * 70))

          // Convert to base64
          const arrayBuffer = await file.arrayBuffer()
          const bytes = new Uint8Array(arrayBuffer)
          let binary = ''
          for (let j = 0; j < bytes.length; j++) binary += String.fromCharCode(bytes[j])
          const base64 = btoa(binary)

          try {
            const res = await fetch('/api/connectors/courtreserve/import-excel', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ clubId, fileType: type, data: base64, fileName: file.name }),
            })
            if (res.ok) {
              const result = await res.json()
              setImportStatus(`${file.name}: ${result.message || 'Done'}`)
            } else {
              const err = await res.text()
              console.error(`[Import] ${file.name} failed:`, err)
              setImportStatus(`${file.name}: Import failed`)
            }
          } catch (err) {
            console.error(`[Import] ${file.name} error:`, err)
          }
        }

        setImportProgress(95)
        setImportStatus('Finalizing...')
      } catch (err) {
        console.error('[Onboarding] Import failed:', err)
        setImportStatus('Import failed')
      }
    }

    // Done
    setImportProgress(100)
    setImportStatus('System ready')
    await new Promise(r => setTimeout(r, 2000))
    onComplete()
  }

  const steps = [
    // Step 0: Club Info + Address
    <div key="0" className="space-y-6">
      <div className="text-center mb-6">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200 }}
          className="w-20 h-20 rounded-2xl mx-auto mb-4 flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)', boxShadow: '0 8px 30px rgba(139,92,246,0.3)' }}>
          <Sparkles className="w-10 h-10 text-white" />
        </motion.div>
        <h2 className="text-2xl mb-2" style={{ fontWeight: 800, color: 'var(--heading)' }}>Welcome to IQSport</h2>
        <p className="text-sm" style={{ color: 'var(--t3)' }}>Set up your club in under a minute</p>
      </div>

      <div>
        <label className="text-sm mb-2 block" style={{ fontWeight: 600, color: 'var(--t2)' }}>Club name</label>
        <input
          type="text"
          value={clubName}
          onChange={e => setClubName(e.target.value)}
          placeholder="Sunset Pickleball Club"
          className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all focus:ring-2 focus:ring-violet-500/30"
          style={{ background: 'var(--subtle)', color: 'var(--t1)', border: '1px solid var(--card-border)' }}
        />
      </div>

      <div>
        <label className="text-sm mb-2 block" style={{ fontWeight: 600, color: 'var(--t2)' }}>
          <MapPin className="w-3.5 h-3.5 inline mr-1" /> Address
        </label>
        <input
          ref={addressInputRef}
          type="text"
          value={address}
          onChange={e => { setAddress(e.target.value); setAddressSelected(false) }}
          placeholder="Start typing your address..."
          className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all focus:ring-2 focus:ring-violet-500/30"
          style={{ background: 'var(--subtle)', color: 'var(--t1)', border: '1px solid var(--card-border)' }}
        />
        {addressSelected && city && (
          <p className="text-xs mt-1.5" style={{ color: '#10B981' }}>
            ✓ {city}{state ? `, ${state}` : ''}{country ? ` — ${country}` : ''}
          </p>
        )}
      </div>
    </div>,

    // Step 1: Software + File Upload
    <div key="1" className="space-y-6">
      <div>
        <h3 className="text-lg mb-1" style={{ fontWeight: 700, color: 'var(--heading)' }}>
          <Database className="w-5 h-5 inline mr-2" />Import your data
        </h3>
        <p className="text-sm" style={{ color: 'var(--t3)' }}>What software does your club use?</p>
      </div>

      {/* Software selector */}
      <div className="space-y-2">
        {SOFTWARE_OPTIONS.map(opt => (
          <button key={opt.id} onClick={() => setSoftware(opt.id)}
            className="w-full flex items-center gap-3 p-4 rounded-xl text-left transition-all"
            style={{
              background: software === opt.id ? 'var(--pill-active)' : 'var(--subtle)',
              border: software === opt.id ? '1px solid rgba(139,92,246,0.3)' : '1px solid transparent',
            }}>
            <span className="text-xl">{opt.icon}</span>
            <span className="text-sm" style={{ fontWeight: software === opt.id ? 600 : 500, color: software === opt.id ? 'var(--heading)' : 'var(--t2)' }}>{opt.label}</span>
            {software === opt.id && <CheckCircle2 className="w-4 h-4 ml-auto" style={{ color: '#8B5CF6' }} />}
          </button>
        ))}
      </div>

      {/* CourtReserve: 3 specific file slots */}
      {software === 'courtreserve' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          <div className="rounded-xl p-4" style={{ background: isDark ? 'rgba(139,92,246,0.06)' : 'rgba(139,92,246,0.04)', border: '1px solid rgba(139,92,246,0.1)' }}>
            <p className="text-xs" style={{ color: 'var(--t3)' }}>
              <HelpCircle className="w-3.5 h-3.5 inline mr-1" />
              In CourtReserve, go to <strong>Reports</strong> and export each file. You can upload 1, 2, or all 3 — import more later from Integrations.
            </p>
          </div>
          <FileUploadSlot label="Members Report" description="Reports → Members → Export" file={membersFile} onFile={setMembersFile} />
          <FileUploadSlot label="Reservation Report" description="Reports → Reservations → Export" file={reservationsFile} onFile={setReservationsFile} />
          <FileUploadSlot label="Event Registrants Report" description="Reports → Events → Registrants → Export" file={eventsFile} onFile={setEventsFile} />
        </motion.div>
      )}

      {/* Other: generic upload */}
      {software === 'other' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <FileUploadSlot label="Upload your data file" description="CSV, XLSX — we'll auto-detect the format" file={genericFile} onFile={setGenericFile} />
        </motion.div>
      )}

      {/* No software: skip message */}
      {software === 'none' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-xl p-4 text-center" style={{ background: 'var(--subtle)' }}>
          <p className="text-sm" style={{ color: 'var(--t3)' }}>
            No problem! You can add data later from Settings → Integrations, or use the platform manually.
          </p>
        </motion.div>
      )}
    </div>,
  ]

  if (processing) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8" style={{ background: 'var(--page-bg, #0B0D17)' }}>
        <AILoadingAnimation
          progress={hasFilesRef.current ? importProgress : undefined}
          statusMessage={hasFilesRef.current ? importStatus : undefined}
        />
      </div>
    )
  }

  const isLast = step === steps.length - 1
  const canProceed = step === 0 ? clubName.trim().length >= 2 : !!software

  return (
    <div className="min-h-screen flex items-center justify-center p-8" style={{ background: 'var(--page-bg, #0B0D17)' }}>
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {steps.map((_, i) => (
            <div key={i} className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--subtle)' }}>
              <motion.div className="h-full rounded-full" style={{ background: 'linear-gradient(90deg, #8B5CF6, #06B6D4)' }}
                initial={{ width: 0 }} animate={{ width: i <= step ? '100%' : '0%' }} transition={{ duration: 0.3 }} />
            </div>
          ))}
        </div>

        {/* Content */}
        <Card>
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
              {steps[step]}
            </motion.div>
          </AnimatePresence>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-6" style={{ borderTop: '1px solid var(--divider)' }}>
            {step > 0 ? (
              <button onClick={() => setStep(step - 1)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm"
                style={{ color: 'var(--t3)', fontWeight: 500 }}>
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
            ) : <div />}

            <motion.button
              whileHover={canProceed ? { scale: 1.05 } : {}}
              whileTap={canProceed ? { scale: 0.95 } : {}}
              onClick={() => canProceed && (isLast ? handleComplete() : setStep(step + 1))}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm text-white transition-all"
              style={{
                background: canProceed ? 'linear-gradient(135deg, #8B5CF6, #06B6D4)' : 'rgba(139,92,246,0.3)',
                fontWeight: 600,
                boxShadow: canProceed ? '0 4px 15px rgba(139,92,246,0.3)' : 'none',
                cursor: canProceed ? 'pointer' : 'not-allowed',
              }}>
              {isLast ? <><Sparkles className="w-4 h-4" /> Launch AI</> : <>Next <ChevronRight className="w-4 h-4" /></>}
            </motion.button>
          </div>
        </Card>
      </div>
    </div>
  )
}
