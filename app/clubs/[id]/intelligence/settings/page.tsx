'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Settings, Globe, Dumbbell, MapPin, Calendar, Clock, DollarSign,
  Target, Mail, MessageSquare, Volume2, Zap, ArrowRight, Check,
  Loader2, AlertTriangle, Shield, Eye, EyeOff,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/use-toast'
import { generateOutreachMessages, type OutreachType } from '@/lib/ai/outreach-messages'
import {
  useIntelligenceSettings,
  useSaveIntelligenceSettings,
  useAutomationSettings,
  useSaveAutomationSettings,
  useIsDemo,
} from '../_hooks/use-intelligence'
import {
  DEFAULT_INTELLIGENCE_SETTINGS,
  DEFAULT_AUTOMATION_TRIGGERS,
  DAYS_OF_WEEK,
  PRICING_MODELS,
  COMMUNICATION_CHANNELS,
  COMMUNICATION_TONES,
  CLUB_GOALS,
  type IntelligenceSettingsInput,
  type AutomationTriggersInput,
} from '@/lib/ai/onboarding-schema'

// ── Constants ──

const SPORT_OPTIONS = [
  { id: 'pickleball', label: 'Pickleball' },
  { id: 'tennis', label: 'Tennis' },
  { id: 'padel', label: 'Padel' },
  { id: 'squash', label: 'Squash' },
  { id: 'badminton', label: 'Badminton' },
]

const COMMON_TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Phoenix', 'America/Anchorage', 'Pacific/Honolulu',
  'America/Toronto', 'America/Vancouver', 'America/Edmonton',
  'America/Mexico_City', 'America/Bogota', 'America/Sao_Paulo', 'America/Buenos_Aires',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Rome',
  'Europe/Amsterdam', 'Europe/Brussels', 'Europe/Zurich', 'Europe/Vienna',
  'Europe/Stockholm', 'Europe/Oslo', 'Europe/Copenhagen', 'Europe/Helsinki',
  'Europe/Warsaw', 'Europe/Prague', 'Europe/Lisbon', 'Europe/Athens',
  'Europe/Istanbul', 'Europe/Moscow',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Bangkok', 'Asia/Singapore',
  'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul', 'Asia/Hong_Kong',
  'Australia/Sydney', 'Australia/Melbourne', 'Australia/Perth',
  'Pacific/Auckland', 'Africa/Johannesburg', 'Africa/Cairo',
]

const GOAL_LABELS: Record<string, string> = {
  fill_sessions: 'Fill Sessions',
  grow_membership: 'Grow Membership',
  improve_retention: 'Improve Retention',
  increase_revenue: 'Increase Revenue',
  reduce_no_shows: 'Reduce No-Shows',
}

const PRICING_LABELS: Record<string, string> = {
  per_session: 'Per Session',
  membership: 'Membership',
  free: 'Free',
  hybrid: 'Hybrid',
}

const CHANNEL_LABELS: Record<string, string> = {
  email: 'Email',
  sms: 'SMS',
  both: 'Email + SMS',
}

const TONE_LABELS: Record<string, string> = {
  friendly: 'Friendly',
  professional: 'Professional',
  casual: 'Casual',
}

const TRIGGER_CONFIG = [
  {
    key: 'healthyToWatch' as const,
    label: 'Healthy \u2192 Watch',
    description: 'Send a gentle check-in when a member starts visiting less frequently',
    messageType: 'CHECK_IN',
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
  },
  {
    key: 'watchToAtRisk' as const,
    label: 'Watch \u2192 At Risk',
    description: 'Send a retention boost when engagement drops significantly',
    messageType: 'RETENTION_BOOST',
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
  },
  {
    key: 'atRiskToCritical' as const,
    label: 'At Risk \u2192 Critical',
    description: 'Send an urgent retention message before the member churns',
    messageType: 'RETENTION_BOOST',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
  },
  {
    key: 'churned' as const,
    label: 'Churned (21+ days)',
    description: 'Flag member for reactivation campaign when inactive 21+ days',
    messageType: 'REACTIVATION',
    color: 'text-red-700',
    bgColor: 'bg-red-50',
  },
]

const TRIGGER_OUTREACH_TYPE: Record<string, OutreachType> = {
  healthyToWatch: 'CHECK_IN',
  watchToAtRisk: 'RETENTION_BOOST',
  atRiskToCritical: 'RETENTION_BOOST',
  churned: 'RETENTION_BOOST',
}

function MessagePreview({ triggerKey }: { triggerKey: string }) {
  const type = TRIGGER_OUTREACH_TYPE[triggerKey] || 'CHECK_IN'
  const messages = generateOutreachMessages(type, {
    memberName: 'Alex Johnson',
    clubName: 'Sunset Pickleball Club',
    healthScore: triggerKey === 'healthyToWatch' ? 62 : 28,
    riskLevel: triggerKey === 'healthyToWatch' ? 'watch' : 'at_risk',
    lowComponents: [{ key: 'recency', label: 'Last played 12 days ago', score: 30 }],
    daysSinceLastActivity: triggerKey === 'churned' ? 25 : 12,
    suggestedSessionTitle: 'Thursday Open Play',
    suggestedSessionDate: 'Thursday, Mar 19',
    suggestedSessionTime: '6:00–8:00 PM',
    totalBookings: 15,
    confirmedCount: 4,
    sameLevelCount: 2,
    tone: 'friendly',
  })
  const recommended = messages.find(v => v.recommended) || messages[0]
  if (!recommended) return null

  return (
    <div className="mt-2 ml-5 p-3 rounded-md bg-muted/40 border border-border/50 text-xs space-y-1.5">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Example email</p>
      <p className="font-semibold text-sm">{recommended.emailSubject}</p>
      <p className="whitespace-pre-line text-muted-foreground leading-relaxed">{recommended.emailBody}</p>
    </div>
  )
}

// ── Chip Component ──

function Chip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 rounded-full text-sm font-medium border transition-all',
        selected
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-background text-muted-foreground border-border hover:border-primary/50'
      )}
    >
      {label}
    </button>
  )
}

// ── Radio Group ──

function RadioOption({ label, value, selected, onSelect }: { label: string; value: string; selected: boolean; onSelect: (v: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all',
        selected
          ? 'bg-primary/5 border-primary text-foreground'
          : 'bg-background border-border text-muted-foreground hover:border-primary/50'
      )}
    >
      <div className={cn(
        'w-4 h-4 rounded-full border-2 flex items-center justify-center',
        selected ? 'border-primary' : 'border-muted-foreground/40'
      )}>
        {selected && <div className="w-2 h-2 rounded-full bg-primary" />}
      </div>
      {label}
    </button>
  )
}

// ══════════ MAIN PAGE ══════════

export default function SettingsPage() {
  const params = useParams()
  const clubId = params.id as string
  const isDemo = useIsDemo()

  // ── Load data ──
  const { data: intelligenceData, isLoading: loadingIntelligence } = useIntelligenceSettings(clubId)
  const { data: automationData, isLoading: loadingAutomation } = useAutomationSettings(clubId)
  const saveMutation = useSaveIntelligenceSettings()
  const saveAutoMutation = useSaveAutomationSettings()
  const { toast } = useToast()

  // ── Local state ──
  const [settings, setSettings] = useState<IntelligenceSettingsInput>(DEFAULT_INTELLIGENCE_SETTINGS)
  const [automation, setAutomation] = useState<AutomationTriggersInput>(DEFAULT_AUTOMATION_TRIGGERS)
  const [hasChanges, setHasChanges] = useState(false)
  const [saved, setSaved] = useState(false)
  const [previewTrigger, setPreviewTrigger] = useState<string | null>(null)

  // Hydrate from server
  useEffect(() => {
    if (intelligenceData?.settings) {
      setSettings(intelligenceData.settings as IntelligenceSettingsInput)
    }
  }, [intelligenceData])

  useEffect(() => {
    if (automationData?.settings) {
      setAutomation(automationData.settings as AutomationTriggersInput)
    }
  }, [automationData])

  // Track changes
  const updateSettings = (patch: Partial<IntelligenceSettingsInput>) => {
    setSettings(prev => ({ ...prev, ...patch }))
    setHasChanges(true)
    setSaved(false)
  }

  const updateComms = (patch: Partial<IntelligenceSettingsInput['communicationPreferences']>) => {
    setSettings(prev => ({
      ...prev,
      communicationPreferences: { ...prev.communicationPreferences, ...patch },
    }))
    setHasChanges(true)
    setSaved(false)
  }

  const updateAutomation = (patch: Partial<AutomationTriggersInput>) => {
    setAutomation(prev => ({ ...prev, ...patch }))
    setHasChanges(true)
    setSaved(false)
  }

  const updateTrigger = (key: keyof AutomationTriggersInput['triggers'], value: boolean) => {
    setAutomation(prev => ({
      ...prev,
      triggers: { ...prev.triggers, [key]: value },
    }))
    setHasChanges(true)
    setSaved(false)
  }

  // Toggle day
  const toggleDay = (day: string) => {
    const current = settings.operatingDays as string[]
    const next = current.includes(day)
      ? current.filter(d => d !== day)
      : [...current, day]
    if (next.length > 0) updateSettings({ operatingDays: next as any })
  }

  // Toggle sport
  const toggleSport = (sport: string) => {
    const current = settings.sportTypes
    const next = current.includes(sport)
      ? current.filter(s => s !== sport)
      : [...current, sport]
    if (next.length > 0) updateSettings({ sportTypes: next })
  }

  // Toggle goal
  const toggleGoal = (goal: string) => {
    const current = settings.goals as string[]
    const next = current.includes(goal)
      ? current.filter(g => g !== goal)
      : [...current, goal]
    if (next.length > 0) updateSettings({ goals: next as any })
  }

  // Save
  const handleSave = async () => {
    if (isDemo) return

    try {
      await Promise.all([
        saveMutation.mutateAsync({ clubId, settings: settings as any }),
        saveAutoMutation.mutateAsync({ clubId, settings: automation }),
      ])
      setHasChanges(false)
      setSaved(true)
      toast({ title: 'Settings saved', description: 'Your intelligence settings have been updated.' })
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      console.error('Save failed:', err)
      toast({
        title: 'Failed to save',
        description: (err as Error).message || 'Something went wrong. Please try again.',
        variant: 'destructive',
      })
    }
  }

  const isLoading = loadingIntelligence || loadingAutomation
  const isSaving = saveMutation.isPending || saveAutoMutation.isPending

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Settings className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Intelligence Settings</h2>
            <p className="text-sm text-muted-foreground">Configure AI automation and club profile</p>
          </div>
        </div>
      </div>

      {isDemo && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-center gap-2 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Demo mode — changes will not be saved
        </div>
      )}

      {/* ══════ SECTION: AUTOMATION ══════ */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Automation</CardTitle>
          </div>
          <CardDescription>
            The Campaign Engine runs daily, detects declining member health, and sends personalized outreach automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Master toggle */}
          <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-3">
              <div className={cn(
                'h-8 w-8 rounded-lg flex items-center justify-center',
                automation.enabled ? 'bg-green-100' : 'bg-muted'
              )}>
                <Zap className={cn('h-4 w-4', automation.enabled ? 'text-green-600' : 'text-muted-foreground')} />
              </div>
              <div>
                <p className="font-medium text-sm">Enable AI Automation</p>
                <p className="text-xs text-muted-foreground">
                  {automation.enabled
                    ? 'Campaign Engine will send outreach when members decline'
                    : 'All automatic outreach is paused'}
                </p>
              </div>
            </div>
            <Switch
              checked={automation.enabled}
              onCheckedChange={(checked: boolean) => updateAutomation({ enabled: checked })}
            />
          </div>

          {/* Triggers */}
          <div className={cn('space-y-3', !automation.enabled && 'opacity-50 pointer-events-none')}>
            <div className="flex items-center gap-2 mb-1">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-medium">Campaign Triggers</p>
            </div>
            <p className="text-xs text-muted-foreground -mt-2 ml-6">
              Messages are only sent when a member&apos;s health level <strong>worsens</strong>. Stable states never trigger messages.
            </p>

            {TRIGGER_CONFIG.map((trigger) => (
              <div key={trigger.key} className="rounded-lg border">
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    <div className={cn('h-2 w-2 rounded-full', trigger.bgColor, trigger.color.replace('text-', 'bg-'))} />
                    <div>
                      <p className="text-sm font-medium">{trigger.label}</p>
                      <p className="text-xs text-muted-foreground">{trigger.description}</p>
                    </div>
                  </div>
                  <Switch
                    checked={automation.triggers[trigger.key]}
                    onCheckedChange={(checked: boolean) => updateTrigger(trigger.key, checked)}
                  />
                </div>
                <div className="px-3 pb-3">
                  <button
                    type="button"
                    onClick={() => setPreviewTrigger(previewTrigger === trigger.key ? null : trigger.key)}
                    className="text-[11px] text-primary hover:underline flex items-center gap-1 ml-5"
                  >
                    {previewTrigger === trigger.key ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    {previewTrigger === trigger.key ? 'Hide preview' : 'Preview message'}
                  </button>
                  {previewTrigger === trigger.key && <MessagePreview triggerKey={trigger.key} />}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ══════ SECTION: COMMUNICATION ══════ */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Communication</CardTitle>
          </div>
          <CardDescription>How the AI sends messages to your members</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Channel */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Channel</Label>
            <div className="flex gap-2">
              {COMMUNICATION_CHANNELS.map((ch) => (
                <RadioOption
                  key={ch}
                  value={ch}
                  label={CHANNEL_LABELS[ch]}
                  selected={settings.communicationPreferences.preferredChannel === ch}
                  onSelect={(v) => updateComms({ preferredChannel: v as any })}
                />
              ))}
            </div>
          </div>

          {/* Tone */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Tone</Label>
            <div className="flex gap-2">
              {COMMUNICATION_TONES.map((t) => (
                <RadioOption
                  key={t}
                  value={t}
                  label={TONE_LABELS[t]}
                  selected={settings.communicationPreferences.tone === t}
                  onSelect={(v) => updateComms({ tone: v as any })}
                />
              ))}
            </div>
          </div>

          {/* Max messages */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Max Messages Per Week</Label>
              <span className="text-sm font-semibold text-primary">
                {settings.communicationPreferences.maxMessagesPerWeek}
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={7}
              value={settings.communicationPreferences.maxMessagesPerWeek}
              onChange={(e) => updateComms({ maxMessagesPerWeek: Number(e.target.value) })}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>1 / week</span>
              <span>7 / week</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ══════ SECTION: CLUB PROFILE ══════ */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Club Profile</CardTitle>
          </div>
          <CardDescription>Basic information about your club, used for AI context</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Timezone */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5" /> Timezone
            </Label>
            <select
              value={settings.timezone}
              onChange={(e) => updateSettings({ timezone: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>

          {/* Sports */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <Dumbbell className="h-3.5 w-3.5" /> Sports
            </Label>
            <div className="flex flex-wrap gap-2">
              {SPORT_OPTIONS.map((sport) => (
                <Chip
                  key={sport.id}
                  label={sport.label}
                  selected={settings.sportTypes.includes(sport.id)}
                  onClick={() => toggleSport(sport.id)}
                />
              ))}
            </div>
          </div>

          {/* Courts */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Courts</Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={settings.courtCount}
                onChange={(e) => updateSettings({ courtCount: Number(e.target.value) || 1 })}
              />
            </div>
            <div className="flex items-end gap-4 col-span-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.hasIndoorCourts}
                  onChange={(e) => updateSettings({ hasIndoorCourts: e.target.checked })}
                  className="rounded border-input accent-primary"
                />
                <span className="text-sm">Indoor</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.hasOutdoorCourts}
                  onChange={(e) => updateSettings({ hasOutdoorCourts: e.target.checked })}
                  className="rounded border-input accent-primary"
                />
                <span className="text-sm">Outdoor</span>
              </label>
            </div>
          </div>

          {/* Operating Days */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" /> Operating Days
            </Label>
            <div className="flex flex-wrap gap-2">
              {DAYS_OF_WEEK.map((day) => (
                <Chip
                  key={day}
                  label={day.slice(0, 3)}
                  selected={(settings.operatingDays as string[]).includes(day)}
                  onClick={() => toggleDay(day)}
                />
              ))}
            </div>
          </div>

          {/* Operating Hours */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> Open
              </Label>
              <Input
                type="time"
                value={settings.operatingHours.open}
                onChange={(e) => updateSettings({
                  operatingHours: { ...settings.operatingHours, open: e.target.value },
                })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Close</Label>
              <Input
                type="time"
                value={settings.operatingHours.close}
                onChange={(e) => updateSettings({
                  operatingHours: { ...settings.operatingHours, close: e.target.value },
                })}
              />
            </div>
          </div>

          {/* Peak Hours */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Peak Start</Label>
              <Input
                type="time"
                value={settings.peakHours.start}
                onChange={(e) => updateSettings({
                  peakHours: { ...settings.peakHours, start: e.target.value },
                })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Peak End</Label>
              <Input
                type="time"
                value={settings.peakHours.end}
                onChange={(e) => updateSettings({
                  peakHours: { ...settings.peakHours, end: e.target.value },
                })}
              />
            </div>
          </div>

          {/* Session Duration */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Typical Session Duration</Label>
              <span className="text-sm font-semibold text-primary">{settings.typicalSessionDurationMinutes} min</span>
            </div>
            <input
              type="range"
              min={15}
              max={240}
              step={15}
              value={settings.typicalSessionDurationMinutes}
              onChange={(e) => updateSettings({ typicalSessionDurationMinutes: Number(e.target.value) })}
              className="w-full accent-primary"
            />
          </div>

          {/* Pricing */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5" /> Pricing Model
            </Label>
            <div className="flex flex-wrap gap-2">
              {PRICING_MODELS.map((model) => (
                <RadioOption
                  key={model}
                  value={model}
                  label={PRICING_LABELS[model]}
                  selected={settings.pricingModel === model}
                  onSelect={(v) => updateSettings({ pricingModel: v as any })}
                />
              ))}
            </div>
            {settings.pricingModel !== 'free' && (
              <div className="mt-2">
                <Label className="text-xs text-muted-foreground">Average Session Price ($)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={(settings.avgSessionPriceCents || 0) / 100}
                  onChange={(e) => updateSettings({ avgSessionPriceCents: Math.round(Number(e.target.value) * 100) })}
                  className="w-40 mt-1"
                />
              </div>
            )}
          </div>

          {/* Goals */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5" /> Goals
            </Label>
            <div className="flex flex-wrap gap-2">
              {CLUB_GOALS.map((goal) => (
                <Chip
                  key={goal}
                  label={GOAL_LABELS[goal]}
                  selected={(settings.goals as string[]).includes(goal)}
                  onClick={() => toggleGoal(goal)}
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ══════ SAVE BAR ══════ */}
      <div className="sticky bottom-4 flex justify-end">
        <Button
          size="lg"
          onClick={handleSave}
          disabled={!hasChanges || isSaving || isDemo}
          className={cn(
            'shadow-lg transition-all gap-2',
            saved && 'bg-green-600 hover:bg-green-700'
          )}
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : saved ? (
            <>
              <Check className="h-4 w-4" />
              Saved
            </>
          ) : (
            'Save Settings'
          )}
        </Button>
      </div>
    </div>
  )
}
