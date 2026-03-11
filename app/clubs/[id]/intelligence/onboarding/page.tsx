'use client'

import { useState, useCallback, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import {
  Globe, MapPin, Calendar, DollarSign, Target,
  ChevronRight, ChevronLeft, Check, Loader2, Upload, FileSpreadsheet,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { trpc } from '@/lib/trpc'
import { analyzeSchedule, type CsvSessionRow } from '@/lib/ai/csv-schedule-analyzer'
import {
  DAYS_OF_WEEK, PRICING_MODELS, COMMUNICATION_TONES,
  COMMUNICATION_CHANNELS, CLUB_GOALS, DEFAULT_INTELLIGENCE_SETTINGS,
  type IntelligenceSettingsInput,
} from '@/lib/ai/onboarding-schema'
import type { DayOfWeek } from '@/types/intelligence'

// ── Step definitions ──

const STEPS = [
  { label: 'Welcome', icon: Globe, description: 'Timezone & Sport' },
  { label: 'Courts', icon: MapPin, description: 'Court setup' },
  { label: 'Schedule', icon: Calendar, description: 'Operating hours' },
  { label: 'Pricing', icon: DollarSign, description: 'Pricing & Comms' },
  { label: 'Goals', icon: Target, description: 'Review & Complete' },
]

const GOAL_LABELS: Record<string, string> = {
  fill_sessions: 'Fill empty sessions',
  grow_membership: 'Grow membership',
  improve_retention: 'Improve retention',
  increase_revenue: 'Increase revenue',
  reduce_no_shows: 'Reduce no-shows',
}

const PRICING_LABELS: Record<string, string> = {
  per_session: 'Per Session',
  membership: 'Membership',
  free: 'Free',
  hybrid: 'Hybrid',
}

const TONE_LABELS: Record<string, string> = {
  friendly: 'Friendly',
  professional: 'Professional',
  casual: 'Casual',
}

const CHANNEL_LABELS: Record<string, string> = {
  email: 'Email',
  sms: 'SMS',
  both: 'Both',
}

export default function OnboardingPage() {
  const params = useParams()
  const router = useRouter()
  const clubId = params.id as string

  const [step, setStep] = useState(0)
  const [settings, setSettings] = useState<IntelligenceSettingsInput>({
    ...DEFAULT_INTELLIGENCE_SETTINGS,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  })

  // Load existing settings
  const { data: existing } = trpc.intelligence.getIntelligenceSettings.useQuery(
    { clubId },
    { enabled: !!clubId }
  )
  useEffect(() => {
    if (existing?.settings) {
      setSettings(prev => ({ ...prev, ...existing.settings }))
    }
  }, [existing])

  const saveMutation = trpc.intelligence.saveIntelligenceSettings.useMutation({
    onSuccess: () => {
      router.push(`/clubs/${clubId}/intelligence`)
    },
  })

  const update = useCallback((patch: Partial<IntelligenceSettingsInput>) => {
    setSettings(prev => ({ ...prev, ...patch }))
  }, [])

  const updateComms = useCallback((patch: Partial<IntelligenceSettingsInput['communicationPreferences']>) => {
    setSettings(prev => ({
      ...prev,
      communicationPreferences: { ...prev.communicationPreferences, ...patch },
    }))
  }, [])

  const handleComplete = () => {
    const final = {
      ...settings,
      onboardingCompletedAt: new Date().toISOString(),
      onboardingVersion: 1,
    }
    saveMutation.mutate({ clubId, settings: final })
  }

  const canGoNext = () => {
    switch (step) {
      case 0: return settings.timezone.length > 0 && settings.sportTypes.length > 0
      case 1: return settings.courtCount >= 1
      case 2: return settings.operatingDays.length > 0
      case 3: return true
      case 4: return settings.goals.length > 0
      default: return true
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Progress */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            return (
              <button
                key={i}
                onClick={() => i <= step && setStep(i)}
                className={cn(
                  'flex flex-col items-center gap-1 text-xs transition-colors',
                  i <= step ? 'text-primary' : 'text-muted-foreground',
                  i < step && 'cursor-pointer',
                )}
              >
                <div className={cn(
                  'h-9 w-9 rounded-full flex items-center justify-center transition-colors',
                  i < step ? 'bg-primary text-primary-foreground' :
                  i === step ? 'bg-primary/10 text-primary border-2 border-primary' :
                  'bg-muted text-muted-foreground'
                )}>
                  {i < step ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                <span className="hidden sm:block">{s.label}</span>
              </button>
            )
          })}
        </div>
        <Progress value={((step + 1) / STEPS.length) * 100} className="h-1.5" />
      </div>

      {/* Step content */}
      <Card>
        <CardContent className="pt-6 space-y-6">
          {step === 0 && (
            <Step1Welcome settings={settings} update={update} />
          )}
          {step === 1 && (
            <Step2Courts settings={settings} update={update} />
          )}
          {step === 2 && (
            <Step3Schedule settings={settings} update={update} />
          )}
          {step === 3 && (
            <Step4Pricing settings={settings} update={update} updateComms={updateComms} />
          )}
          {step === 4 && (
            <Step5Goals settings={settings} update={update} />
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between mt-6">
        <Button
          variant="outline"
          onClick={() => setStep(s => s - 1)}
          disabled={step === 0}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>

        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep(s => s + 1)} disabled={!canGoNext()}>
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button onClick={handleComplete} disabled={!canGoNext() || saveMutation.isPending}>
            {saveMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Saving...</>
            ) : (
              <><Check className="h-4 w-4 mr-1" /> Complete Setup</>
            )}
          </Button>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════
// Step components
// ══════════════════════════════════════

type StepProps = {
  settings: IntelligenceSettingsInput
  update: (patch: Partial<IntelligenceSettingsInput>) => void
  updateComms?: (patch: Partial<IntelligenceSettingsInput['communicationPreferences']>) => void
}

function Step1Welcome({ settings, update }: StepProps) {
  const timezones: string[] = (Intl as any).supportedValuesOf?.('timeZone') || [
    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'America/Phoenix', 'Europe/London', 'Europe/Paris', 'Asia/Tokyo',
  ]

  const sports = ['Pickleball', 'Tennis', 'Padel', 'Squash', 'Badminton']

  return (
    <>
      <div>
        <h2 className="text-xl font-semibold">Welcome to Intelligence Setup</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Help the AI understand your club for better recommendations.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <Label>Timezone</Label>
          <select
            className="w-full mt-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={settings.timezone}
            onChange={e => update({ timezone: e.target.value })}
          >
            {timezones.map(tz => (
              <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>

        <div>
          <Label>Sport Types</Label>
          <div className="flex flex-wrap gap-2 mt-1.5">
            {sports.map(sport => {
              const val = sport.toLowerCase()
              const selected = settings.sportTypes.includes(val)
              return (
                <button
                  key={val}
                  onClick={() => update({
                    sportTypes: selected
                      ? settings.sportTypes.filter(s => s !== val)
                      : [...settings.sportTypes, val],
                  })}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-sm border transition-colors',
                    selected ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted',
                  )}
                >
                  {sport}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}

function Step2Courts({ settings, update }: StepProps) {
  return (
    <>
      <div>
        <h2 className="text-xl font-semibold">Court Setup</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Tell us about your courts.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <Label>Number of Courts</Label>
          <Input
            type="number"
            min={1}
            max={50}
            value={settings.courtCount}
            onChange={e => update({ courtCount: parseInt(e.target.value) || 1 })}
            className="w-32 mt-1.5"
          />
        </div>

        <div className="flex gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={settings.hasIndoorCourts}
              onCheckedChange={checked => update({ hasIndoorCourts: !!checked })}
            />
            <span className="text-sm">Indoor courts</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={settings.hasOutdoorCourts}
              onCheckedChange={checked => update({ hasOutdoorCourts: !!checked })}
            />
            <span className="text-sm">Outdoor courts</span>
          </label>
        </div>
      </div>
    </>
  )
}

function Step3Schedule({ settings, update }: StepProps) {
  const [csvAnalysis, setCsvAnalysis] = useState<{
    operatingDays: DayOfWeek[]
    operatingHours: { open: string; close: string }
    peakHours: { start: string; end: string }
    typicalSessionDurationMinutes: number
    sessionCount: number
  } | null>(null)

  const handleCsvFile = useCallback(async (file: File) => {
    const text = await file.text()
    const lines = text.split('\n').filter(l => l.trim())
    if (lines.length < 2) return

    // Simple CSV parse: extract date, startTime, endTime, format columns
    const headers = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/"/g, ''))
    const dateIdx = headers.findIndex(h => h.includes('date'))
    const startIdx = headers.findIndex(h => h.includes('start'))
    const endIdx = headers.findIndex(h => h.includes('end'))
    const formatIdx = headers.findIndex(h => h.includes('format') || h.includes('type'))

    if (dateIdx === -1 || startIdx === -1) return

    const rows: CsvSessionRow[] = []
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim().replace(/"/g, ''))
      if (cols[dateIdx] && cols[startIdx]) {
        rows.push({
          date: cols[dateIdx],
          startTime: cols[startIdx],
          endTime: cols[endIdx] || cols[startIdx],
          format: cols[formatIdx] || 'OPEN_PLAY',
        })
      }
    }

    const analysis = analyzeSchedule(rows)
    if (analysis) {
      setCsvAnalysis(analysis)
      update({
        operatingDays: analysis.operatingDays,
        operatingHours: analysis.operatingHours,
        peakHours: analysis.peakHours,
        typicalSessionDurationMinutes: analysis.typicalSessionDurationMinutes,
      })
    }
  }, [update])

  return (
    <>
      <div>
        <h2 className="text-xl font-semibold">Schedule & Operating Hours</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Upload a CSV to auto-detect, or set manually.
        </p>
      </div>

      {/* CSV Upload */}
      <div
        className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors cursor-pointer"
        onClick={() => {
          const input = document.createElement('input')
          input.type = 'file'
          input.accept = '.csv,.xlsx'
          input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0]
            if (file) handleCsvFile(file)
          }
          input.click()
        }}
      >
        <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm font-medium">Upload schedule CSV</p>
        <p className="text-xs text-muted-foreground mt-1">
          From CourtReserve, PlayByPoint, or similar
        </p>
      </div>

      {csvAnalysis && (
        <div className="rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 p-3 text-sm">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-medium mb-1">
            <FileSpreadsheet className="h-4 w-4" />
            Analyzed {csvAnalysis.sessionCount} sessions
          </div>
          <p className="text-green-600 dark:text-green-500 text-xs">
            Auto-filled operating hours, peak times, and session duration below.
          </p>
        </div>
      )}

      {/* Operating days */}
      <div>
        <Label>Operating Days</Label>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {DAYS_OF_WEEK.map(day => {
            const selected = settings.operatingDays.includes(day)
            return (
              <button
                key={day}
                onClick={() => update({
                  operatingDays: selected
                    ? settings.operatingDays.filter(d => d !== day)
                    : [...settings.operatingDays, day] as typeof settings.operatingDays,
                })}
                className={cn(
                  'px-3 py-1.5 rounded-md text-sm border transition-colors',
                  selected ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted',
                )}
              >
                {day.slice(0, 3)}
              </button>
            )
          })}
        </div>
      </div>

      {/* Operating hours */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Opens At</Label>
          <Input
            type="time"
            value={settings.operatingHours.open}
            onChange={e => update({ operatingHours: { ...settings.operatingHours, open: e.target.value } })}
            className="mt-1.5"
          />
        </div>
        <div>
          <Label>Closes At</Label>
          <Input
            type="time"
            value={settings.operatingHours.close}
            onChange={e => update({ operatingHours: { ...settings.operatingHours, close: e.target.value } })}
            className="mt-1.5"
          />
        </div>
      </div>

      {/* Peak hours */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Peak Start</Label>
          <Input
            type="time"
            value={settings.peakHours.start}
            onChange={e => update({ peakHours: { ...settings.peakHours, start: e.target.value } })}
            className="mt-1.5"
          />
        </div>
        <div>
          <Label>Peak End</Label>
          <Input
            type="time"
            value={settings.peakHours.end}
            onChange={e => update({ peakHours: { ...settings.peakHours, end: e.target.value } })}
            className="mt-1.5"
          />
        </div>
      </div>

      {/* Session duration */}
      <div>
        <Label>Typical Session Duration (minutes)</Label>
        <Input
          type="number"
          min={15}
          max={240}
          step={15}
          value={settings.typicalSessionDurationMinutes}
          onChange={e => update({ typicalSessionDurationMinutes: parseInt(e.target.value) || 90 })}
          className="w-32 mt-1.5"
        />
      </div>
    </>
  )
}

function Step4Pricing({ settings, update, updateComms }: StepProps) {
  return (
    <>
      <div>
        <h2 className="text-xl font-semibold">Pricing & Communication</h2>
        <p className="text-sm text-muted-foreground mt-1">
          How you charge and how the AI should communicate.
        </p>
      </div>

      {/* Pricing model */}
      <div>
        <Label>Pricing Model</Label>
        <div className="flex flex-wrap gap-2 mt-1.5">
          {PRICING_MODELS.map(model => (
            <button
              key={model}
              onClick={() => update({ pricingModel: model })}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm border transition-colors',
                settings.pricingModel === model
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border hover:bg-muted',
              )}
            >
              {PRICING_LABELS[model]}
            </button>
          ))}
        </div>
      </div>

      {settings.pricingModel !== 'free' && (
        <div>
          <Label>Average Session Price ($)</Label>
          <Input
            type="number"
            min={0}
            step={0.5}
            value={settings.avgSessionPriceCents ? settings.avgSessionPriceCents / 100 : ''}
            onChange={e => update({ avgSessionPriceCents: Math.round(parseFloat(e.target.value || '0') * 100) })}
            className="w-32 mt-1.5"
            placeholder="15.00"
          />
        </div>
      )}

      <div className="border-t pt-4">
        <h3 className="text-sm font-semibold mb-3">Communication Preferences</h3>

        {/* Channel */}
        <div className="mb-3">
          <Label>Preferred Channel</Label>
          <div className="flex gap-2 mt-1.5">
            {COMMUNICATION_CHANNELS.map(ch => (
              <button
                key={ch}
                onClick={() => updateComms?.({ preferredChannel: ch })}
                className={cn(
                  'px-3 py-1.5 rounded-md text-sm border transition-colors',
                  settings.communicationPreferences.preferredChannel === ch
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border hover:bg-muted',
                )}
              >
                {CHANNEL_LABELS[ch]}
              </button>
            ))}
          </div>
        </div>

        {/* Tone */}
        <div className="mb-3">
          <Label>Tone</Label>
          <div className="flex gap-2 mt-1.5">
            {COMMUNICATION_TONES.map(tone => (
              <button
                key={tone}
                onClick={() => updateComms?.({ tone })}
                className={cn(
                  'px-3 py-1.5 rounded-md text-sm border transition-colors',
                  settings.communicationPreferences.tone === tone
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border hover:bg-muted',
                )}
              >
                {TONE_LABELS[tone]}
              </button>
            ))}
          </div>
        </div>

        {/* Max messages */}
        <div>
          <Label>Max Messages per Week: {settings.communicationPreferences.maxMessagesPerWeek}</Label>
          <input
            type="range"
            min={1}
            max={7}
            value={settings.communicationPreferences.maxMessagesPerWeek}
            onChange={e => updateComms?.({ maxMessagesPerWeek: parseInt(e.target.value) })}
            className="w-full mt-1.5 accent-primary"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>1</span>
            <span>7</span>
          </div>
        </div>
      </div>
    </>
  )
}

function Step5Goals({ settings, update }: StepProps) {
  return (
    <>
      <div>
        <h2 className="text-xl font-semibold">Goals & Review</h2>
        <p className="text-sm text-muted-foreground mt-1">
          What are your main goals? This helps the AI prioritize recommendations.
        </p>
      </div>

      <div>
        <Label>Club Goals</Label>
        <div className="space-y-2 mt-1.5">
          {CLUB_GOALS.map(goal => {
            const selected = settings.goals.includes(goal)
            return (
              <label key={goal} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors">
                <Checkbox
                  checked={selected}
                  onCheckedChange={checked => update({
                    goals: checked
                      ? [...settings.goals, goal] as typeof settings.goals
                      : settings.goals.filter(g => g !== goal),
                  })}
                />
                <span className="text-sm">{GOAL_LABELS[goal]}</span>
              </label>
            )
          })}
        </div>
      </div>

      {/* Review summary */}
      <div className="rounded-lg bg-muted/50 p-4 space-y-2 text-sm">
        <h3 className="font-semibold mb-2">Setup Summary</h3>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <span className="text-muted-foreground">Timezone</span>
          <span>{settings.timezone.replace(/_/g, ' ')}</span>
          <span className="text-muted-foreground">Sports</span>
          <span className="capitalize">{settings.sportTypes.join(', ')}</span>
          <span className="text-muted-foreground">Courts</span>
          <span>{settings.courtCount} ({[settings.hasIndoorCourts && 'indoor', settings.hasOutdoorCourts && 'outdoor'].filter(Boolean).join(', ')})</span>
          <span className="text-muted-foreground">Hours</span>
          <span>{settings.operatingHours.open} – {settings.operatingHours.close}</span>
          <span className="text-muted-foreground">Peak</span>
          <span>{settings.peakHours.start} – {settings.peakHours.end}</span>
          <span className="text-muted-foreground">Pricing</span>
          <span>{PRICING_LABELS[settings.pricingModel]}{settings.avgSessionPriceCents ? ` ($${(settings.avgSessionPriceCents / 100).toFixed(2)})` : ''}</span>
          <span className="text-muted-foreground">Channel</span>
          <span>{CHANNEL_LABELS[settings.communicationPreferences.preferredChannel]}</span>
          <span className="text-muted-foreground">Tone</span>
          <span className="capitalize">{settings.communicationPreferences.tone}</span>
        </div>
      </div>
    </>
  )
}
