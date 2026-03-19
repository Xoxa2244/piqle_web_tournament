'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  Globe, MapPin, Calendar, DollarSign, Target, ChevronRight, ChevronLeft,
  Check, Upload, Sparkles,
} from 'lucide-react'
import { useTheme } from '../IQThemeProvider'
import { AILoadingAnimation } from './AILoadingAnimation'
import { IQFileDropZone } from './IQFileDropZone'
import { trpc } from '@/lib/trpc'

type Props = {
  clubId: string
  onComplete: () => void
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

export function OnboardingWizardIQ({ clubId, onComplete }: Props) {
  const { isDark } = useTheme()
  const [step, setStep] = useState(0)
  const [processing, setProcessing] = useState(false)

  // Form state
  const [timezone, setTimezone] = useState('America/New_York')
  const [sports, setSports] = useState<string[]>(['pickleball'])
  const [courtsStr, setCourtsStr] = useState('4')
  const courts = Number(courtsStr) || 1
  const [indoor, setIndoor] = useState(true)
  const [outdoor, setOutdoor] = useState(false)
  const [days, setDays] = useState<string[]>(DAYS)
  const [openTime, setOpenTime] = useState('06:00')
  const [closeTime, setCloseTime] = useState('22:00')
  const [sessionDuration, setSessionDuration] = useState(90)
  const [pricingModel, setPricingModel] = useState('per_session')
  const [priceStr, setPriceStr] = useState('15')
  const price = Number(priceStr) || 0
  const [channel, setChannel] = useState('email')
  const [tone, setTone] = useState('friendly')
  const [goals, setGoals] = useState<string[]>(['fill_sessions', 'improve_retention'])
  const [csvFile, setCsvFile] = useState<File | null>(null)

  const saveMutation = trpc.intelligence.saveIntelligenceSettings.useMutation()

  const toggleSport = (s: string) => setSports(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  const toggleDay = (d: string) => setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])
  const toggleGoal = (g: string) => setGoals(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])

  const handleComplete = async () => {
    setProcessing(true)

    // Save settings — try full save first, fallback to minimal save
    try {
      await saveMutation.mutateAsync({
        clubId,
        settings: {
          timezone,
          sportTypes: sports,
          courtCount: courts,
          hasIndoorCourts: indoor,
          hasOutdoorCourts: outdoor,
          operatingDays: days as any,
          operatingHours: { open: openTime, close: closeTime },
          peakHours: { start: '17:00', end: '20:00' },
          typicalSessionDurationMinutes: sessionDuration,
          pricingModel: pricingModel as any,
          avgSessionPriceCents: pricingModel === 'free' ? null : Math.round(price * 100),
          communicationPreferences: { preferredChannel: channel as any, tone: tone as any, maxMessagesPerWeek: 4 },
          goals: goals as any,
          onboardingCompletedAt: new Date().toISOString(),
          onboardingVersion: 1,
        },
      })
      console.log('[Onboarding] Settings saved successfully')
    } catch (err) {
      console.error('[Onboarding] Full save failed, trying minimal:', err)
      // Fallback: at least mark onboarding as complete
      try {
        await saveMutation.mutateAsync({
          clubId,
          settings: {
            onboardingCompletedAt: new Date().toISOString(),
          },
        })
        console.log('[Onboarding] Minimal save (onboardingCompletedAt) succeeded')
      } catch (err2) {
        console.error('[Onboarding] Even minimal save failed:', err2)
      }
    }

    // Upload CSV if provided
    if (csvFile) {
      try {
        const text = await csvFile.text()
        const parseRes = await fetch('/api/ai/parse-csv', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ csvContent: text, fileName: csvFile.name }),
        })
        if (parseRes.ok) {
          const { sessions } = await parseRes.json()
          if (sessions?.length) {
            await fetch('/api/ai/import-sessions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ clubId, sessions, fileName: csvFile.name }),
            })
          }
        }
      } catch (err) {
        console.error('[Onboarding] CSV import failed:', err)
      }
    }
  }

  const steps = [
    // Step 0: Welcome + Sports
    <div key="0" className="space-y-6">
      <div className="text-center mb-8">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200 }}
          className="w-20 h-20 rounded-2xl mx-auto mb-4 flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)', boxShadow: '0 8px 30px rgba(139,92,246,0.3)' }}>
          <Sparkles className="w-10 h-10 text-white" />
        </motion.div>
        <h2 className="text-2xl mb-2" style={{ fontWeight: 800, color: 'var(--heading)' }}>Welcome to IQSport</h2>
        <p className="text-sm" style={{ color: 'var(--t3)' }}>Set up your club in under 2 minutes</p>
      </div>

      <div>
        <label className="text-sm mb-2 block" style={{ fontWeight: 600, color: 'var(--t2)' }}>Where is your club located?</label>
        <select value={timezone} onChange={e => setTimezone(e.target.value)}
          className="w-full px-4 py-2.5 rounded-xl text-sm" style={{ background: 'var(--subtle)', color: 'var(--t1)', border: '1px solid var(--card-border)' }}>
          {[
            { tz: 'America/New_York', label: 'Eastern US (New York, Miami, Atlanta)' },
            { tz: 'America/Chicago', label: 'Central US (Chicago, Dallas, Houston)' },
            { tz: 'America/Denver', label: 'Mountain US (Denver, Phoenix, Salt Lake)' },
            { tz: 'America/Los_Angeles', label: 'Pacific US (Los Angeles, Seattle, San Francisco)' },
            { tz: 'America/Anchorage', label: 'Alaska' },
            { tz: 'Pacific/Honolulu', label: 'Hawaii' },
            { tz: 'America/Toronto', label: 'Eastern Canada (Toronto, Montreal)' },
            { tz: 'America/Vancouver', label: 'Pacific Canada (Vancouver)' },
            { tz: 'Europe/London', label: 'UK (London, Manchester)' },
            { tz: 'Europe/Berlin', label: 'Central Europe (Berlin, Paris, Madrid)' },
            { tz: 'Europe/Moscow', label: 'Moscow, Russia' },
            { tz: 'Asia/Dubai', label: 'Gulf (Dubai, Abu Dhabi)' },
            { tz: 'Asia/Tokyo', label: 'Japan (Tokyo)' },
            { tz: 'Asia/Shanghai', label: 'China (Shanghai, Beijing)' },
            { tz: 'Asia/Kolkata', label: 'India (Mumbai, Delhi)' },
            { tz: 'Australia/Sydney', label: 'Australia (Sydney, Melbourne)' },
            { tz: 'Pacific/Auckland', label: 'New Zealand (Auckland)' },
          ].map(({ tz, label }) => (
            <option key={tz} value={tz}>{label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-sm mb-3 block" style={{ fontWeight: 600, color: 'var(--t2)' }}>What sports do you offer?</label>
        <div className="flex flex-wrap gap-2">
          {SPORTS.map(s => <Chip key={s} selected={sports.includes(s)} onClick={() => toggleSport(s)}>{s.charAt(0).toUpperCase() + s.slice(1)}</Chip>)}
        </div>
      </div>
    </div>,

    // Step 1: Courts
    <div key="1" className="space-y-6">
      <h3 className="text-lg" style={{ fontWeight: 700, color: 'var(--heading)' }}>Court Setup</h3>

      <div>
        <label className="text-sm mb-2 block" style={{ fontWeight: 600, color: 'var(--t2)' }}>Number of courts</label>
        <input type="text" inputMode="numeric" value={courtsStr} onChange={e => setCourtsStr(e.target.value.replace(/[^0-9]/g, ''))}
          className="w-full px-4 py-2.5 rounded-xl text-sm" style={{ background: 'var(--subtle)', color: 'var(--t1)', border: '1px solid var(--card-border)' }} />
      </div>

      <div className="flex gap-4">
        <Chip selected={indoor} onClick={() => setIndoor(!indoor)}>🏢 Indoor</Chip>
        <Chip selected={outdoor} onClick={() => setOutdoor(!outdoor)}>🌤 Outdoor</Chip>
      </div>
    </div>,

    // Step 2: Schedule
    <div key="2" className="space-y-6">
      <h3 className="text-lg" style={{ fontWeight: 700, color: 'var(--heading)' }}>Operating Schedule</h3>

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
            className="w-full px-4 py-2.5 rounded-xl text-sm" style={{ background: 'var(--subtle)', color: 'var(--t1)', border: '1px solid var(--card-border)' }} />
        </div>
        <div>
          <label className="text-sm mb-2 block" style={{ fontWeight: 600, color: 'var(--t2)' }}>Close</label>
          <input type="time" value={closeTime} onChange={e => setCloseTime(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl text-sm" style={{ background: 'var(--subtle)', color: 'var(--t1)', border: '1px solid var(--card-border)' }} />
        </div>
      </div>
    </div>,

    // Step 3: Pricing + Data Upload
    <div key="3" className="space-y-6">
      <h3 className="text-lg" style={{ fontWeight: 700, color: 'var(--heading)' }}>Pricing & Data</h3>

      <div className="flex flex-wrap gap-2">
        {[['per_session', '💳 Per Session'], ['membership', '🎫 Membership'], ['free', '🆓 Free'], ['hybrid', '🔀 Hybrid']].map(([id, label]) => (
          <Chip key={id} selected={pricingModel === id} onClick={() => setPricingModel(id)}>{label}</Chip>
        ))}
      </div>

      {pricingModel !== 'free' && (
        <div>
          <label className="text-sm mb-2 block" style={{ fontWeight: 600, color: 'var(--t2)' }}>Average price per player ($)</label>
          <input type="text" inputMode="numeric" value={priceStr} onChange={e => setPriceStr(e.target.value.replace(/[^0-9.]/g, ''))}
            className="w-full px-4 py-2.5 rounded-xl text-sm" style={{ background: 'var(--subtle)', color: 'var(--t1)', border: '1px solid var(--card-border)' }} />
        </div>
      )}

      <div>
        <label className="text-sm mb-3 block" style={{ fontWeight: 600, color: 'var(--t2)' }}>
          <Upload className="w-4 h-4 inline mr-1" />
          Import your session history (optional)
        </label>
        <IQFileDropZone
          onFile={(file) => setCsvFile(file)}
          loadedFileName={csvFile?.name}
        />
      </div>
    </div>,

    // Step 4: Goals
    <div key="4" className="space-y-6">
      <h3 className="text-lg" style={{ fontWeight: 700, color: 'var(--heading)' }}>What are your goals?</h3>
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
        <AILoadingAnimation onComplete={onComplete} />
      </div>
    )
  }

  const isLast = step === steps.length - 1

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

            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              onClick={() => isLast ? handleComplete() : setStep(step + 1)}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm text-white"
              style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)', fontWeight: 600, boxShadow: '0 4px 15px rgba(139,92,246,0.3)' }}>
              {isLast ? <><Sparkles className="w-4 h-4" /> Launch AI</> : <>Next <ChevronRight className="w-4 h-4" /></>}
            </motion.button>
          </div>
        </Card>
      </div>
    </div>
  )
}
