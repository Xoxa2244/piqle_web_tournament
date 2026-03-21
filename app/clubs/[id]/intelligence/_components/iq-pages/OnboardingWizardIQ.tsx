'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  MapPin, Calendar, DollarSign, Target, ChevronRight, ChevronLeft,
  Check, Upload, Sparkles, Building2, Dumbbell,
} from 'lucide-react'
import { useTheme } from '../IQThemeProvider'
import { AILoadingAnimation } from './AILoadingAnimation'
import { IQFileDropZone } from './IQFileDropZone'
import { trpc } from '@/lib/trpc'
import { loadGoogleMaps } from '@/lib/googleMapsLoader'

type Props = {
  clubId: string
  onComplete: () => void
  isNewClub?: boolean
  onCreateClub?: (data: { name: string; kind: 'VENUE' | 'COMMUNITY'; address?: string; city?: string; state?: string; country?: string }) => Promise<string>
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const SPORTS = ['pickleball', 'padel', 'tennis', 'squash', 'badminton']
const GOALS = [
  { id: 'fill_sessions', label: 'Fill empty court time', icon: '🎯' },
  { id: 'grow_membership', label: 'Bring in new players', icon: '📈' },
  { id: 'improve_retention', label: 'Keep players coming back', icon: '🔄' },
  { id: 'increase_revenue', label: 'Grow revenue', icon: '💰' },
  { id: 'reduce_no_shows', label: 'Cut down on no-shows', icon: '✅' },
]

// Map Google timezone IDs from lat/lng (simple lookup by country)
const COUNTRY_TZ: Record<string, string> = {
  'United States': 'America/New_York',
  'Canada': 'America/Toronto',
  'United Kingdom': 'Europe/London',
  'Germany': 'Europe/Berlin',
  'France': 'Europe/Berlin',
  'Spain': 'Europe/Berlin',
  'Russia': 'Europe/Moscow',
  'Japan': 'Asia/Tokyo',
  'China': 'Asia/Shanghai',
  'India': 'Asia/Kolkata',
  'Australia': 'Australia/Sydney',
  'New Zealand': 'Pacific/Auckland',
  'United Arab Emirates': 'Asia/Dubai',
}

// Refine US timezone by state
const US_STATE_TZ: Record<string, string> = {
  'HI': 'Pacific/Honolulu', 'AK': 'America/Anchorage',
  'WA': 'America/Los_Angeles', 'OR': 'America/Los_Angeles', 'CA': 'America/Los_Angeles', 'NV': 'America/Los_Angeles',
  'ID': 'America/Boise', 'MT': 'America/Denver', 'WY': 'America/Denver', 'UT': 'America/Denver', 'CO': 'America/Denver', 'AZ': 'America/Phoenix', 'NM': 'America/Denver',
  'ND': 'America/Chicago', 'SD': 'America/Chicago', 'NE': 'America/Chicago', 'KS': 'America/Chicago', 'MN': 'America/Chicago', 'IA': 'America/Chicago', 'MO': 'America/Chicago', 'WI': 'America/Chicago', 'IL': 'America/Chicago', 'TX': 'America/Chicago', 'OK': 'America/Chicago', 'AR': 'America/Chicago', 'LA': 'America/Chicago', 'MS': 'America/Chicago', 'AL': 'America/Chicago', 'TN': 'America/Chicago',
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl p-6 ${className}`} style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', backdropFilter: 'var(--glass-blur)', boxShadow: 'var(--card-shadow)' }}>
      {children}
    </div>
  )
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  const { isDark } = useTheme()
  return (
    <button onClick={onClick} className="px-4 py-2 rounded-xl text-sm transition-all" style={{
      background: selected ? 'var(--pill-active)' : 'var(--subtle)',
      color: selected ? (isDark ? '#C4B5FD' : '#7C3AED') : 'var(--t3)',
      fontWeight: selected ? 600 : 500,
      border: selected ? '1px solid rgba(139,92,246,0.3)' : '1px solid transparent',
    }}>
      {children}
    </button>
  )
}

function InputField({ label, value, onChange, placeholder, type = 'text', inputMode, ref: inputRef }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; inputMode?: 'numeric' | 'text'; ref?: React.Ref<HTMLInputElement>
}) {
  return (
    <div>
      <label className="text-sm mb-2 block" style={{ fontWeight: 600, color: 'var(--t2)' }}>{label}</label>
      <input
        ref={inputRef}
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={e => onChange(type === 'text' && inputMode === 'numeric' ? e.target.value.replace(/[^0-9.]/g, '') : e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all focus:ring-2 focus:ring-violet-500/30"
        style={{ background: 'var(--subtle)', color: 'var(--t1)', border: '1px solid var(--card-border)' }}
      />
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
  const [importDone, setImportDone] = useState(false)
  const hasCsvRef = useRef(false)

  // Step 1: Club Info
  const [clubName, setClubName] = useState('')
  const [clubKind, setClubKind] = useState<'VENUE' | 'COMMUNITY'>('VENUE')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [country, setCountry] = useState('')
  const [timezone, setTimezone] = useState('')
  const [addressSelected, setAddressSelected] = useState(false)

  // Step 2: Sports & Courts
  const [sports, setSports] = useState<string[]>(['pickleball'])
  const [courtsStr, setCourtsStr] = useState('4')
  const courts = Number(courtsStr) || 1
  const [indoor, setIndoor] = useState(true)
  const [outdoor, setOutdoor] = useState(false)

  // Step 3: Schedule
  const [days, setDays] = useState<string[]>(DAYS)
  const [openTime, setOpenTime] = useState('06:00')
  const [closeTime, setCloseTime] = useState('22:00')

  // Step 4: Pricing & CSV
  const [pricingModel, setPricingModel] = useState('per_session')
  const [priceStr, setPriceStr] = useState('15')
  const price = Number(priceStr) || 0
  const [channel, setChannel] = useState('email')
  const [tone, setTone] = useState('friendly')
  const [csvFile, setCsvFile] = useState<File | null>(null)

  // Step 5: Goals
  const [goals, setGoals] = useState<string[]>(['fill_sessions', 'improve_retention'])

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
        const newCity = find('locality')?.long_name ?? find('postal_town')?.long_name ?? find('sublocality')?.long_name ?? ''
        const newState = find('administrative_area_level_1')?.short_name ?? ''
        const newCountry = find('country')?.long_name ?? ''

        setAddress(place.formatted_address)
        setCity(newCity)
        setState(newState)
        setCountry(newCountry)
        setAddressSelected(true)

        // Auto-detect timezone
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

  const toggleSport = (s: string) => setSports(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  const toggleDay = (d: string) => setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])
  const toggleGoal = (g: string) => setGoals(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])

  const handleComplete = async () => {
    hasCsvRef.current = !!csvFile
    setProcessing(true)

    // 1. Create or update club
    let clubId = resolvedClubId
    const clubName_ = (clubName || '').trim().length >= 2 ? clubName.trim() : 'My Club'

    if (isNewClub && onCreateClub) {
      // New club flow — create first
      try {
        clubId = await onCreateClub({
          name: clubName_,
          kind: clubKind,
          address: address || undefined,
          city: city || undefined,
          state: state || undefined,
          country: country || 'United States',
        })
        setResolvedClubId(clubId)
        console.log('[Onboarding] Club created:', clubId)
      } catch (err: any) {
        console.error('[Onboarding] Club creation failed:', err?.message || err)
        return // can't continue without clubId
      }
    } else if (clubId && clubId !== 'pending') {
      // Existing club — update info
      try {
        await updateClub.mutateAsync({
          id: clubId,
          name: clubName_,
          kind: clubKind,
          joinPolicy: 'OPEN',
          address: address || undefined,
          city: city || undefined,
          state: state || undefined,
          country: country || 'United States',
        })
        console.log('[Onboarding] Club updated')
      } catch (err: any) {
        console.error('[Onboarding] Club update failed:', err?.message || err)
      }
    }

    // 2. Save intelligence settings
    try {
      await saveMutation.mutateAsync({
        clubId,
        settings: {
          timezone: timezone || 'America/New_York',
          sportTypes: sports,
          courtCount: courts,
          hasIndoorCourts: indoor,
          hasOutdoorCourts: outdoor,
          operatingDays: days as any,
          operatingHours: { open: openTime, close: closeTime },
          peakHours: { start: '17:00', end: '20:00' },
          typicalSessionDurationMinutes: 90,
          pricingModel: pricingModel as any,
          avgSessionPriceCents: pricingModel === 'free' ? null : Math.round(price * 100),
          communicationPreferences: { preferredChannel: channel as any, tone: tone as any, maxMessagesPerWeek: 4 },
          goals: goals as any,
          onboardingCompletedAt: new Date().toISOString(),
          onboardingVersion: 1,
        },
      })
      console.log('[Onboarding] Intelligence settings saved')
    } catch (err) {
      console.error('[Onboarding] Settings save failed, trying minimal:', err)
      try {
        await saveMutation.mutateAsync({ clubId, settings: { onboardingCompletedAt: new Date().toISOString() } })
      } catch (err2) {
        console.error('[Onboarding] Minimal save failed:', err2)
      }
    }

    // 3. Upload CSV if provided
    if (csvFile) {
      try {
        setImportStatus('Parsing CSV file...')
        setImportProgress(5)
        const text = await csvFile.text()
        const parseRes = await fetch('/api/ai/parse-csv', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ csvContent: text, fileName: csvFile.name }),
        })
        if (parseRes.ok) {
          const { sessions, totalParsed } = await parseRes.json()
          setImportStatus(`Parsed ${totalParsed || sessions?.length || 0} sessions`)
          setImportProgress(20)

          if (sessions?.length) {
            setImportStatus('Importing sessions to database...')
            const importRes = await fetch('/api/ai/import-sessions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ clubId, sessions, fileName: csvFile.name }),
            })

            // Read SSE progress stream
            if (importRes.ok && importRes.body) {
              const reader = importRes.body.getReader()
              const decoder = new TextDecoder()
              let buffer = ''
              while (true) {
                const { done, value } = await reader.read()
                if (done) break
                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split('\n')
                buffer = lines.pop() || ''
                for (const line of lines) {
                  const trimmed = line.trim()
                  if (!trimmed) continue
                  try {
                    const evt = JSON.parse(trimmed)
                    if (evt.phase === 'session' && evt.total) {
                      const pct = 20 + Math.round((evt.current / evt.total) * 30)
                      setImportProgress(pct)
                      setImportStatus(evt.message || `Importing sessions... (${evt.current}/${evt.total})`)
                    } else if (evt.phase === 'campaign') {
                      setImportProgress(55)
                      setImportStatus(evt.message || 'Calculating health scores...')
                    } else if (evt.phase === 'embedding' && evt.total) {
                      const pct = 60 + Math.round((evt.current / evt.total) * 35)
                      setImportProgress(pct)
                      setImportStatus(evt.message || `Generating AI embeddings... (${evt.current}/${evt.total})`)
                    } else if (evt.message) {
                      setImportStatus(evt.message)
                    }
                  } catch { /* not JSON */ }
                }
              }
            }
            setImportProgress(98)
            setImportStatus('Finalizing...')
          }
        } else {
          setImportStatus('CSV parsing failed')
        }
      } catch (err) {
        console.error('[Onboarding] CSV import failed:', err)
        setImportStatus('Import failed')
      }
    }

    // Done — set progress to 100 and auto-redirect after delay
    setImportProgress(100)
    setImportStatus('System ready')
    setImportDone(true)

    // Wait for animation to show "Ready!" then redirect
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
        <p className="text-sm" style={{ color: 'var(--t3)' }}>Set up your club in under 2 minutes</p>
      </div>

      <InputField label="Club name" value={clubName} onChange={setClubName} placeholder="Sunset Pickleball Club" />

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

      <div>
        <label className="text-sm mb-3 block" style={{ fontWeight: 600, color: 'var(--t2)' }}>Club type</label>
        <div className="flex gap-3">
          <Chip selected={clubKind === 'VENUE'} onClick={() => setClubKind('VENUE')}>🏟 Venue</Chip>
          <Chip selected={clubKind === 'COMMUNITY'} onClick={() => setClubKind('COMMUNITY')}>👥 Community</Chip>
        </div>
      </div>
    </div>,

    // Step 1: Sports & Courts
    <div key="1" className="space-y-6">
      <h3 className="text-lg" style={{ fontWeight: 700, color: 'var(--heading)' }}>
        <Dumbbell className="w-5 h-5 inline mr-2" />Sports & Courts
      </h3>

      <div>
        <label className="text-sm mb-3 block" style={{ fontWeight: 600, color: 'var(--t2)' }}>What sports do you offer?</label>
        <div className="flex flex-wrap gap-2">
          {SPORTS.map(s => <Chip key={s} selected={sports.includes(s)} onClick={() => toggleSport(s)}>{s.charAt(0).toUpperCase() + s.slice(1)}</Chip>)}
        </div>
      </div>

      <InputField label="Number of courts" value={courtsStr} onChange={v => setCourtsStr(v.replace(/[^0-9]/g, ''))} inputMode="numeric" />

      <div>
        <label className="text-sm mb-3 block" style={{ fontWeight: 600, color: 'var(--t2)' }}>Court type</label>
        <div className="flex gap-3">
          <Chip selected={indoor} onClick={() => setIndoor(!indoor)}>🏢 Indoor</Chip>
          <Chip selected={outdoor} onClick={() => setOutdoor(!outdoor)}>🌤 Outdoor</Chip>
        </div>
      </div>
    </div>,

    // Step 2: Schedule
    <div key="2" className="space-y-6">
      <h3 className="text-lg" style={{ fontWeight: 700, color: 'var(--heading)' }}>
        <Calendar className="w-5 h-5 inline mr-2" />Operating Schedule
      </h3>

      <div>
        <label className="text-sm mb-3 block" style={{ fontWeight: 600, color: 'var(--t2)' }}>Operating days</label>
        <div className="flex flex-wrap gap-2">
          {DAYS.map(d => <Chip key={d} selected={days.includes(d)} onClick={() => toggleDay(d)}>{d.slice(0, 3)}</Chip>)}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm mb-2 block" style={{ fontWeight: 600, color: 'var(--t2)' }}>Open</label>
          <input type="time" value={openTime} onChange={e => setOpenTime(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
            style={{ background: 'var(--subtle)', color: 'var(--t1)', border: '1px solid var(--card-border)', colorScheme: isDark ? 'dark' : 'light' }} />
        </div>
        <div>
          <label className="text-sm mb-2 block" style={{ fontWeight: 600, color: 'var(--t2)' }}>Close</label>
          <input type="time" value={closeTime} onChange={e => setCloseTime(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
            style={{ background: 'var(--subtle)', color: 'var(--t1)', border: '1px solid var(--card-border)', colorScheme: isDark ? 'dark' : 'light' }} />
        </div>
      </div>
    </div>,

    // Step 3: Pricing + Communication + CSV
    <div key="3" className="space-y-6">
      <h3 className="text-lg" style={{ fontWeight: 700, color: 'var(--heading)' }}>
        <DollarSign className="w-5 h-5 inline mr-2" />Pricing & Data
      </h3>

      <div>
        <label className="text-sm mb-3 block" style={{ fontWeight: 600, color: 'var(--t2)' }}>Pricing model</label>
        <div className="flex flex-wrap gap-2">
          {[['per_session', '💳 Per Session'], ['membership', '🎫 Membership'], ['free', '🆓 Free'], ['hybrid', '🔀 Hybrid']].map(([id, label]) => (
            <Chip key={id} selected={pricingModel === id} onClick={() => setPricingModel(id)}>{label}</Chip>
          ))}
        </div>
      </div>

      {pricingModel !== 'free' && (
        <InputField label="Average price per player ($)" value={priceStr} onChange={v => setPriceStr(v.replace(/[^0-9.]/g, ''))} inputMode="numeric" />
      )}

      <div>
        <label className="text-sm mb-3 block" style={{ fontWeight: 600, color: 'var(--t2)' }}>Communication channel</label>
        <div className="flex flex-wrap gap-2">
          {[['email', '📧 Email'], ['sms', '💬 SMS'], ['both', '📧💬 Both']].map(([id, label]) => (
            <Chip key={id} selected={channel === id} onClick={() => setChannel(id)}>{label}</Chip>
          ))}
        </div>
      </div>

      <div>
        <label className="text-sm mb-3 block" style={{ fontWeight: 600, color: 'var(--t2)' }}>
          <Upload className="w-4 h-4 inline mr-1" />
          Import session history (optional)
        </label>
        <IQFileDropZone onFile={(file) => setCsvFile(file)} loadedFileName={csvFile?.name} />
      </div>
    </div>,

    // Step 4: Goals
    <div key="4" className="space-y-6">
      <h3 className="text-lg" style={{ fontWeight: 700, color: 'var(--heading)' }}>
        <Target className="w-5 h-5 inline mr-2" />What are your goals?
      </h3>
      <p className="text-sm" style={{ color: 'var(--t3)' }}>Select what matters most — AI will prioritize these.</p>

      <div className="space-y-2">
        {GOALS.map(g => (
          <button key={g.id} onClick={() => toggleGoal(g.id)}
            className="w-full flex items-center gap-3 p-4 rounded-xl text-left transition-all"
            style={{
              background: goals.includes(g.id) ? 'var(--pill-active)' : 'var(--subtle)',
              border: goals.includes(g.id) ? '1px solid rgba(139,92,246,0.3)' : '1px solid transparent',
            }}>
            <span className="text-xl">{g.icon}</span>
            <span className="text-sm" style={{ fontWeight: goals.includes(g.id) ? 600 : 500, color: goals.includes(g.id) ? 'var(--heading)' : 'var(--t2)' }}>{g.label}</span>
            {goals.includes(g.id) && <Check className="w-4 h-4 ml-auto" style={{ color: '#8B5CF6' }} />}
          </button>
        ))}
      </div>
    </div>,
  ]

  if (processing) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8" style={{ background: 'var(--page-bg, #0B0D17)' }}>
        <AILoadingAnimation
          progress={hasCsvRef.current ? importProgress : undefined}
          statusMessage={hasCsvRef.current ? importStatus : undefined}
        />
      </div>
    )
  }

  const isLast = step === steps.length - 1
  const canProceed = step === 0 ? clubName.trim().length >= 2 : true

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
