'use client'

import { useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'motion/react'
import { Users, Plus, Trash2, X, Filter, ChevronRight, Eye, Send, UserCheck, Sparkles, Clock, Mail, MessageSquare, Wand2, Loader2, Download } from 'lucide-react'
import { DuprBadge } from './shared/SmsBadge'
import { trpc } from '@/lib/trpc'
import { mockCohorts, mockCohortDataCoverage } from '../../_data/mock'
import { LOOKALIKE_EXPORT_PRESETS, type LookalikeExportPreset } from '@/lib/ai/lookalike-export'
import { useAdminTodoDecisions, useClearAdminTodoDecisions, useExportLookalikeAudienceCsv, useLookalikeAudienceExport, useLookalikeAudienceExportPreview, useLookalikeExportHistory, useSetAdminTodoDecision, useSmartFirstSession } from '../../_hooks/use-intelligence'

// ── Filter field definitions ──
const NORMALIZED_MEMBERSHIP_TYPE_OPTIONS = [
  { label: 'Guest', value: 'guest' },
  { label: 'Drop-In', value: 'drop_in' },
  { label: 'Trial', value: 'trial' },
  { label: 'Package', value: 'package' },
  { label: 'Monthly', value: 'monthly' },
  { label: 'VIP / Unlimited', value: 'unlimited' },
  { label: 'Discounted', value: 'discounted' },
  { label: 'Insurance', value: 'insurance' },
  { label: 'Staff', value: 'staff' },
]

const NORMALIZED_MEMBERSHIP_STATUS_OPTIONS = [
  { label: 'Active', value: 'active' },
  { label: 'Suspended', value: 'suspended' },
  { label: 'Expired', value: 'expired' },
  { label: 'Cancelled', value: 'cancelled' },
  { label: 'Trial', value: 'trial' },
  { label: 'Guest', value: 'guest' },
  { label: 'No Membership', value: 'none' },
]

const FILTER_FIELDS = [
  { key: 'age', label: 'Age', type: 'number' as const, ops: ['gte', 'lte', 'gt', 'lt', 'eq'] },
  { key: 'gender', label: 'Gender', type: 'select' as const, ops: ['eq'], options: [{ label: 'Male', value: 'M' }, { label: 'Female', value: 'F' }] },
  { key: 'sessionFormat', label: 'Session Type', type: 'select' as const, ops: ['eq'], options: [
    { label: 'Open Play', value: 'OPEN_PLAY' }, { label: 'Clinic', value: 'CLINIC' },
    { label: 'League', value: 'LEAGUE_PLAY' }, { label: 'Drill', value: 'DRILL' }, { label: 'Social', value: 'SOCIAL' },
  ] },
  { key: 'dayOfWeek', label: 'Day of Week', type: 'select' as const, ops: ['eq'], options: [
    { label: 'Monday', value: 'Monday' }, { label: 'Tuesday', value: 'Tuesday' }, { label: 'Wednesday', value: 'Wednesday' },
    { label: 'Thursday', value: 'Thursday' }, { label: 'Friday', value: 'Friday' }, { label: 'Saturday', value: 'Saturday' }, { label: 'Sunday', value: 'Sunday' },
  ] },
  { key: 'frequency', label: 'Sessions/Month', type: 'number' as const, ops: ['gte', 'lte', 'eq'] },
  { key: 'recency', label: 'Days Since Last Visit', type: 'number' as const, ops: ['lte', 'gte'] },
  { key: 'normalizedMembershipType', label: 'Membership Segment', type: 'select' as const, ops: ['eq'], options: NORMALIZED_MEMBERSHIP_TYPE_OPTIONS },
  { key: 'normalizedMembershipStatus', label: 'Membership State', type: 'select' as const, ops: ['eq'], options: NORMALIZED_MEMBERSHIP_STATUS_OPTIONS },
  { key: 'membershipType', label: 'Membership Type', type: 'text' as const, ops: ['contains', 'eq'] },
  { key: 'membershipStatus', label: 'Membership Status', type: 'text' as const, ops: ['contains', 'eq'] },
  { key: 'skillLevel', label: 'Skill Level', type: 'text' as const, ops: ['contains', 'eq'] },
  { key: 'city', label: 'City', type: 'text' as const, ops: ['eq', 'contains'] },
  { key: 'zipCode', label: 'Zip Code', type: 'text' as const, ops: ['eq'] },
]

const OP_LABELS: Record<string, string> = {
  eq: '=', neq: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=', contains: 'contains', in: 'in',
}

function formatCohortFilterValue(field: string, value: string | number | string[]) {
  const fieldDef = FILTER_FIELDS.find((entry) => entry.key === field)
  const options = fieldDef?.options || []
  const labels = new Map(options.map((option) => [option.value, option.label]))

  if (Array.isArray(value)) {
    return value.map((entry) => labels.get(entry) || entry).join(', ')
  }

  if (typeof value === 'string') {
    return labels.get(value) || value
  }

  return String(value)
}

function parseCohortFilters(raw: unknown): CohortFilter[] {
  if (!Array.isArray(raw)) return []
  return raw as CohortFilter[]
}

function buildCohortAdvisorHref(clubId: string, prompt: string) {
  const params = new URLSearchParams()
  params.set('prompt', prompt)
  return `/clubs/${clubId}/intelligence/advisor?${params.toString()}`
}

function isLookalikePresetBlocked(input: {
  preset: LookalikeExportPreset
  contactableCount: number
}) {
  return input.preset !== 'generic_csv' && input.contactableCount === 0
}

const SMART_FIRST_SESSION_STAGE_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  book_first_session: { bg: 'rgba(6,182,212,0.12)', color: '#06B6D4', label: 'First Booking' },
  book_second_session: { bg: 'rgba(139,92,246,0.12)', color: '#8B5CF6', label: 'Second Session' },
  convert_after_first_session: { bg: 'rgba(16,185,129,0.12)', color: '#10B981', label: 'Paid Conversion' },
}

const SUGGESTION_DECISION_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  accepted: { bg: 'rgba(16,185,129,0.14)', color: '#10B981', label: 'Accepted' },
  not_now: { bg: 'rgba(245,158,11,0.14)', color: '#F59E0B', label: 'Not now' },
  declined: { bg: 'rgba(239,68,68,0.14)', color: '#EF4444', label: 'Declined' },
}

type FilterOp = 'eq' | 'ne' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in'

// Must stay in sync with cohortFilterSchema in server/routers/intelligence.ts
// — if you add a new field on the server, mirror it here so TS accepts it at
// the tRPC call site.
type CohortFilterField =
  | 'age' | 'gender' | 'membershipType' | 'membershipStatus' | 'skillLevel'
  | 'zipCode' | 'city' | 'sessionFormat' | 'dayOfWeek' | 'frequency'
  | 'recency' | 'userId' | 'duprRating'
  | 'normalizedMembershipType' | 'normalizedMembershipStatus'

interface CohortFilter {
  field: CohortFilterField
  op: FilterOp
  value: string | number | string[]
}

function sanitizeCohortFilters(filters: CohortFilter[]): CohortFilter[] {
  return filters.flatMap((filter) => {
    const fieldDef = FILTER_FIELDS.find((entry) => entry.key === filter.field)

    if (Array.isArray(filter.value)) {
      const cleaned = filter.value
        .map((value) => value.trim())
        .filter(Boolean)

      if (cleaned.length === 0) return []
      return [{ ...filter, value: cleaned }]
    }

    if (typeof filter.value === 'number') {
      if (!Number.isFinite(filter.value)) return []
      return [filter]
    }

    const raw = String(filter.value ?? '').trim()
    if (!raw) return []

    if (fieldDef?.type === 'number' || ['age', 'frequency', 'recency', 'duprRating'].includes(filter.field)) {
      const numericValue = Number(raw)
      if (!Number.isFinite(numericValue)) return []
      return [{ ...filter, value: numericValue }]
    }

    return [{ ...filter, value: raw }]
  })
}

export default function CohortsIQ() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const isDemo = searchParams.get('demo') === 'true'
  const clubId = params.id as string
  const suggestionDateKey = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const [showCreate, setShowCreate] = useState(false)
  const [selectedCohortId, setSelectedCohortId] = useState<string | null>(null)
  const [campaignCohort, setCampaignCohort] = useState<{ id: string; name: string; filters: any } | null>(null)
  const [activeLookalikeExportKey, setActiveLookalikeExportKey] = useState<string | null>(null)
  const [activeLookalikeSaveKey, setActiveLookalikeSaveKey] = useState<string | null>(null)
  const [selectedLookalikeAudienceKeys, setSelectedLookalikeAudienceKeys] = useState<string[]>([])
  const [lookalikeExportPreset, setLookalikeExportPreset] = useState<LookalikeExportPreset>('generic_csv')

  const { data: cohortsReal, refetch } = trpc.intelligence.listCohorts.useQuery({ clubId }, { enabled: !isDemo })
  const { data: coverageReal, refetch: refetchCoverage } = trpc.intelligence.getCohortDataCoverage.useQuery({ clubId }, { enabled: !isDemo })
  const cohorts = isDemo ? (mockCohorts as any) : cohortsReal
  const coverage = isDemo ? (mockCohortDataCoverage() as any) : coverageReal
  const { data: smartFirstSessionData } = useSmartFirstSession(clubId, 21, 8)
  const { data: lookalikeExportData } = useLookalikeAudienceExport(clubId)
  const { data: lookalikeExportHistory = [], isLoading: lookalikeExportHistoryLoading } = useLookalikeExportHistory(clubId, 8)
  const { data: smartSuggestionDecisions = [] } = useAdminTodoDecisions(clubId, suggestionDateKey)
  const setAdminTodoDecision = useSetAdminTodoDecision()
  const clearAdminTodoDecisions = useClearAdminTodoDecisions()
  const exportLookalikeAudienceCsv = useExportLookalikeAudienceCsv()
  const deleteMutation = trpc.intelligence.deleteCohort.useMutation({ onSuccess: () => refetch() })
  const createCohortMutation = trpc.intelligence.createCohort.useMutation({ onSuccess: () => refetch() })
  const enrichMutation = trpc.intelligence.enrichMemberData.useMutation({
    onSuccess: (data) => {
      refetchCoverage()
      refetch()
      const lines = [
        `Gender: ${data.gender.inferred} members enriched`,
        `  • ${data.gender.fromEvents} from event history (100% accurate)`,
        `  • ${data.gender.fromNames} from name analysis (AI)`,
        `  • ${data.gender.skipped} ambiguous names skipped`,
        ``,
        `Skill Level: ${data.skill.inferred} members enriched from event history`,
      ]
      alert(lines.join('\n'))
    },
  })

  const suggestionDecisionMap = useMemo(() => {
    const initialMap: Record<string, 'accepted' | 'declined' | 'not_now'> = {}
    return smartSuggestionDecisions.reduce((acc: Record<string, 'accepted' | 'declined' | 'not_now'>, record: any) => {
      if (record.bucket !== 'newcomer_cohorts') return acc
      if (record.decision === 'accepted' || record.decision === 'declined' || record.decision === 'not_now') {
        acc[record.itemId] = record.decision
      }
      return acc
    }, initialMap)
  }, [smartSuggestionDecisions])

  const hasSmartSuggestionDecisions = Object.keys(suggestionDecisionMap).length > 0
  const effectiveLookalikeSelection = useMemo(() => {
    const audiences = lookalikeExportData?.audiences || []
    const selectedKeys = selectedLookalikeAudienceKeys.length > 0
      ? selectedLookalikeAudienceKeys
      : audiences.slice(0, 1).map((audience: any) => audience.key)
    const selectedAudiences = audiences.filter((audience: any) => selectedKeys.includes(audience.key))
    const memberIds = Array.from(new Set(selectedAudiences.flatMap((audience: any) => audience.memberIds || [])))
    return {
      selectedKeys,
      selectedAudiences,
      memberIds,
      combinedName: selectedAudiences.length <= 1
        ? selectedAudiences[0]?.name || 'Lookalike Seed'
        : `Custom Seed — ${selectedAudiences.map((audience: any) => audience.name).join(' + ')}`,
    }
  }, [lookalikeExportData, selectedLookalikeAudienceKeys])

  const { data: lookalikePreviewData, isLoading: lookalikePreviewLoading } = useLookalikeAudienceExportPreview(
    clubId,
    effectiveLookalikeSelection.selectedKeys,
    lookalikeExportPreset
  )

  const activeLookalikePreset = LOOKALIKE_EXPORT_PRESETS.find((preset) => preset.key === lookalikeExportPreset) || LOOKALIKE_EXPORT_PRESETS[0]
  const lookalikeExportBlockedByCoverage =
    !!lookalikePreviewData &&
    isLookalikePresetBlocked({
      preset: lookalikeExportPreset,
      contactableCount: lookalikePreviewData.coverage.contactableCount,
    })

  const handleSuggestionDecision = async (options: {
    itemId: string
    title: string
    href: string
    decision: 'accepted' | 'declined' | 'not_now'
    metadata?: Record<string, unknown>
  }) => {
    await setAdminTodoDecision.mutateAsync({
      clubId,
      dateKey: suggestionDateKey,
      itemId: options.itemId,
      decision: options.decision,
      title: options.title,
      bucket: 'newcomer_cohorts',
      href: options.href,
      metadata: options.metadata,
    })
  }

  const handleAcceptSuggestion = async (options: {
    itemId: string
    title: string
    href: string
    action: 'build_cohort' | 'draft_campaign'
  }) => {
    await handleSuggestionDecision({
      itemId: options.itemId,
      title: options.title,
      href: options.href,
      decision: 'accepted',
      metadata: { action: options.action },
    })
    router.push(options.href)
  }

  const handleExportLookalikeAudience = async (audienceKeys: string[], token?: string) => {
    try {
      setActiveLookalikeExportKey(token || audienceKeys.join('|'))
      const result = await exportLookalikeAudienceCsv.mutateAsync({
        clubId,
        audienceKeys: audienceKeys as any,
        preset: lookalikeExportPreset,
      })
      const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = result.fileName
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } finally {
      setActiveLookalikeExportKey(null)
    }
  }

  const handleSaveLookalikeAudience = async (audience: any) => {
    try {
      setActiveLookalikeSaveKey(audience.key)
      await createCohortMutation.mutateAsync({
        clubId,
        name: `Lookalike — ${audience.name}`,
        description: `${audience.description} Seed export audience from the agent lookalike builder.`,
        filters: [{ field: 'userId', op: 'in', value: audience.memberIds }],
      })
    } finally {
      setActiveLookalikeSaveKey(null)
    }
  }

  const toggleLookalikeAudience = (audienceKey: string) => {
    setSelectedLookalikeAudienceKeys((current) => {
      if (current.includes(audienceKey)) {
        return current.filter((key) => key !== audienceKey)
      }
      return [...current, audienceKey]
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl" style={{ fontWeight: 800, color: 'var(--heading)' }}>
            <Users className="w-6 h-6 inline mr-2" />
            Segments
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--t3)' }}>
            Create custom member segments for targeted AI campaigns
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => { setShowCreate(true); setSelectedCohortId(null) }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm text-white"
          style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)', fontWeight: 600 }}
        >
          <Plus className="w-4 h-4" /> Create Segment
        </motion.button>
      </div>

      {/* Create / Edit modal */}
      <AnimatePresence>
        {showCreate && (
          <CohortBuilder
            clubId={clubId}
            onClose={() => setShowCreate(false)}
            onSaved={() => { setShowCreate(false); refetch() }}
          />
        )}
      </AnimatePresence>

      {/* Cohort detail view */}
      <AnimatePresence>
        {selectedCohortId && (
          <CohortDetail
            clubId={clubId}
            cohortId={selectedCohortId}
            onClose={() => setSelectedCohortId(null)}
          />
        )}
      </AnimatePresence>

      {/* Data Coverage Banner */}
      {coverage && !showCreate && !selectedCohortId && (
        <div className="rounded-2xl p-4" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4" style={{ color: '#8B5CF6' }} />
              <span className="text-xs font-semibold" style={{ color: 'var(--heading)' }}>
                Data Coverage — {coverage.totalActive.toLocaleString()} active members
              </span>
            </div>
            {(coverage.fields.gender.percent < 50 || coverage.fields.skillLevel.percent < 50) && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                disabled={enrichMutation.isPending}
                onClick={() => enrichMutation.mutate({ clubId })}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] text-white disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)', fontWeight: 600 }}
              >
                <Wand2 className="w-3.5 h-3.5" />
                {enrichMutation.isPending ? 'Enriching...' : 'Enrich Data with AI'}
              </motion.button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(coverage.fields).map(([key, val]: [string, any]) => {
              const label = FILTER_FIELDS.find(f => f.key === key)?.label || key
              const color = val.percent >= 80 ? '#10B981' : val.percent >= 30 ? '#F59E0B' : '#EF4444'
              return (
                <span key={key} className="text-[11px] px-2.5 py-1 rounded-lg flex items-center gap-1.5"
                  style={{ background: `${color}15`, color, fontWeight: 600 }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                  {label}: {val.percent}%
                </span>
              )
            })}
          </div>
        </div>
      )}

      {lookalikeExportData?.audiences?.length && !showCreate && !selectedCohortId ? (
        <div className="rounded-2xl p-4 space-y-4" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" style={{ color: '#06B6D4' }} />
                <span className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--t4)' }}>
                  Lookalike Audience Export
                </span>
              </div>
              <p className="text-sm mt-2" style={{ color: 'var(--t3)', maxWidth: 760 }}>
                The agent is turning your healthiest paid members into export-ready seed audiences, so you can save them as reusable cohorts or download a CSV for paid acquisition.
              </p>
            </div>
            <span className="text-xs px-3 py-1.5 rounded-full" style={{ background: 'rgba(6,182,212,0.12)', color: '#06B6D4', fontWeight: 700 }}>
              {lookalikeExportData.summary.summary}
            </span>
          </div>

          <div className="rounded-2xl p-4 space-y-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="text-sm" style={{ fontWeight: 700, color: 'var(--heading)' }}>Custom source builder</div>
                <div className="text-xs mt-1.5" style={{ color: 'var(--t3)', lineHeight: 1.6 }}>
                  Choose one or more source audiences, pick the export schema, then save the combined seed or download the channel-ready CSV.
                </div>
              </div>
              <span className="text-[11px] px-2.5 py-1 rounded-lg" style={{ background: 'rgba(148,163,184,0.14)', color: 'var(--t2)', fontWeight: 700 }}>
                {effectiveLookalikeSelection.memberIds.length} unique members
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {lookalikeExportData.audiences.map((audience: any) => {
                const selected = effectiveLookalikeSelection.selectedKeys.includes(audience.key)
                return (
                  <button
                    key={audience.key}
                    type="button"
                    onClick={() => toggleLookalikeAudience(audience.key)}
                    className="px-3 py-2 rounded-xl text-xs font-semibold transition-all"
                    style={{
                      background: selected ? 'rgba(6,182,212,0.12)' : 'rgba(148,163,184,0.12)',
                      color: selected ? '#06B6D4' : 'var(--t2)',
                    }}
                  >
                    {audience.name}
                  </button>
                )
              })}
            </div>

            <div className="flex flex-wrap gap-2">
              {LOOKALIKE_EXPORT_PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => setLookalikeExportPreset(preset.key)}
                  className="px-3 py-2 rounded-xl text-xs font-semibold transition-all text-left"
                  style={{
                    background: lookalikeExportPreset === preset.key ? 'rgba(139,92,246,0.12)' : 'rgba(148,163,184,0.12)',
                    color: lookalikeExportPreset === preset.key ? '#8B5CF6' : 'var(--t2)',
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="text-xs" style={{ color: 'var(--t3)', lineHeight: 1.6 }}>
              <span style={{ fontWeight: 700, color: 'var(--heading)' }}>{activeLookalikePreset.label}:</span> {activeLookalikePreset.description} {activeLookalikePreset.fieldsSummary ? `(${activeLookalikePreset.fieldsSummary})` : ''}
            </div>

            {lookalikePreviewLoading ? (
              <div className="rounded-2xl p-4" style={{ background: 'rgba(148,163,184,0.1)', border: '1px solid rgba(148,163,184,0.18)' }}>
                <div className="text-sm" style={{ fontWeight: 700, color: 'var(--heading)' }}>
                  Building handoff preview...
                </div>
                <div className="text-xs mt-1.5" style={{ color: 'var(--t3)', lineHeight: 1.6 }}>
                  The agent is checking coverage and channel fit for the currently selected seed audience.
                </div>
              </div>
            ) : lookalikePreviewData ? (
              <div className="rounded-2xl p-4 space-y-4" style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.18)' }}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-sm" style={{ fontWeight: 700, color: 'var(--heading)' }}>
                      {lookalikePreviewData.presetLabel} handoff
                    </div>
                    <div className="text-xs mt-1.5" style={{ color: 'var(--t3)', lineHeight: 1.6, maxWidth: 760 }}>
                      {lookalikePreviewData.objective}
                    </div>
                  </div>
                  <span className="text-[11px] px-2.5 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.12)', color: '#06B6D4', fontWeight: 700 }}>
                    {lookalikePreviewData.audienceCount} members in seed
                  </span>
                </div>

                <div className="grid gap-2 md:grid-cols-4">
                  <div className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div className="text-[11px]" style={{ color: 'var(--t4)' }}>Contactable</div>
                    <div className="text-sm mt-1" style={{ fontWeight: 700, color: 'var(--heading)' }}>
                      {lookalikePreviewData.coverage.contactableRate}% ({lookalikePreviewData.coverage.contactableCount})
                    </div>
                  </div>
                  <div className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div className="text-[11px]" style={{ color: 'var(--t4)' }}>Email match</div>
                    <div className="text-sm mt-1" style={{ fontWeight: 700, color: 'var(--heading)' }}>
                      {lookalikePreviewData.coverage.emailCount}
                    </div>
                  </div>
                  <div className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div className="text-[11px]" style={{ color: 'var(--t4)' }}>Phone match</div>
                    <div className="text-sm mt-1" style={{ fontWeight: 700, color: 'var(--heading)' }}>
                      {lookalikePreviewData.coverage.phoneCount}
                    </div>
                  </div>
                  <div className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div className="text-[11px]" style={{ color: 'var(--t4)' }}>Dual match</div>
                    <div className="text-sm mt-1" style={{ fontWeight: 700, color: 'var(--heading)' }}>
                      {lookalikePreviewData.coverage.dualMatchRate}% ({lookalikePreviewData.coverage.dualMatchCount})
                    </div>
                  </div>
                </div>

                {lookalikePreviewData.warnings.length > 0 ? (
                  <div className="space-y-2">
                    {lookalikePreviewData.warnings.map((warning) => (
                      <div
                        key={warning}
                        className="rounded-xl px-3 py-2 text-xs"
                        style={{ background: 'rgba(245,158,11,0.12)', color: '#F59E0B', fontWeight: 600 }}
                      >
                        {warning}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl px-3 py-2 text-xs" style={{ background: 'rgba(16,185,129,0.12)', color: '#10B981', fontWeight: 600 }}>
                    This seed has enough matchable coverage to hand off cleanly into {lookalikePreviewData.presetLabel}.
                  </div>
                )}

                <div className="space-y-2">
                  <div className="text-[11px] uppercase tracking-[0.16em]" style={{ color: 'var(--t4)', fontWeight: 700 }}>
                    Next steps
                  </div>
                  <div className="grid gap-2 md:grid-cols-3">
                    {lookalikePreviewData.nextSteps.map((step, index) => (
                      <div
                        key={step}
                        className="rounded-xl px-3 py-2.5 text-xs"
                        style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--t3)', lineHeight: 1.6 }}
                      >
                        <span style={{ fontWeight: 700, color: 'var(--heading)' }}>{index + 1}.</span> {step}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl p-4" style={{ background: 'rgba(148,163,184,0.1)', border: '1px solid rgba(148,163,184,0.18)' }}>
                <div className="text-sm" style={{ fontWeight: 700, color: 'var(--heading)' }}>
                  No channel handoff preview yet
                </div>
                <div className="text-xs mt-1.5" style={{ color: 'var(--t3)', lineHeight: 1.6 }}>
                  Pick a valid source audience and preset to see match coverage, warnings and channel-specific next steps.
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleSaveLookalikeAudience({
                  key: 'custom-builder',
                  name: effectiveLookalikeSelection.combinedName,
                  description: 'Combined lookalike source audience from the custom builder.',
                  memberIds: effectiveLookalikeSelection.memberIds,
                })}
                disabled={createCohortMutation.isPending || effectiveLookalikeSelection.memberIds.length === 0}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:translate-x-[2px] disabled:opacity-60"
                style={{ background: 'rgba(139,92,246,0.12)', color: '#8B5CF6' }}
              >
                {activeLookalikeSaveKey === 'custom-builder' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Filter className="w-3.5 h-3.5" />}
                Save combined cohort
              </button>
              <button
                type="button"
                onClick={() => handleExportLookalikeAudience(effectiveLookalikeSelection.selectedKeys, 'custom-builder')}
                disabled={exportLookalikeAudienceCsv.isPending || effectiveLookalikeSelection.selectedKeys.length === 0 || lookalikeExportBlockedByCoverage}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:translate-x-[2px] disabled:opacity-60"
                style={{ background: 'rgba(16,185,129,0.12)', color: '#10B981' }}
              >
                {activeLookalikeExportKey === 'custom-builder' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                Export selected CSV
              </button>
              {effectiveLookalikeSelection.selectedKeys.length > 0 ? (
                <Link
                  href={buildCohortAdvisorHref(
                    clubId,
                    `Build a lookalike export playbook from these seed audiences: ${effectiveLookalikeSelection.selectedAudiences.map((audience: any) => audience.name).join(', ')}. Use the ${activeLookalikePreset.label} schema and explain the best acquisition angle for this club.`
                  )}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:translate-x-[2px]"
                  style={{ background: 'rgba(6,182,212,0.12)', color: '#06B6D4' }}
                >
                  <Send className="w-3.5 h-3.5" />
                  Open combined playbook
                </Link>
              ) : (
                <button
                  type="button"
                  disabled
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold disabled:opacity-60"
                  style={{ background: 'rgba(148,163,184,0.12)', color: 'var(--t2)' }}
                >
                  <Send className="w-3.5 h-3.5" />
                  Pick a source first
                </button>
              )}
            </div>

	            {lookalikeExportBlockedByCoverage ? (
	              <div className="text-[11px]" style={{ color: '#F59E0B', fontWeight: 600 }}>
	                This preset is blocked because the selected seed has no usable email or phone coverage yet. Switch to `Generic CSV` or widen the source audience first.
	              </div>
	            ) : null}

              {lookalikeExportHistoryLoading ? (
                <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="text-sm" style={{ fontWeight: 700, color: 'var(--heading)' }}>
                    Loading export history...
                  </div>
                  <div className="text-xs mt-1.5" style={{ color: 'var(--t3)', lineHeight: 1.6 }}>
                    Pulling recent lookalike exports and operator handoff trail for this club.
                  </div>
                </div>
              ) : lookalikeExportHistory.length > 0 ? (
                <div className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="text-sm" style={{ fontWeight: 700, color: 'var(--heading)' }}>
                        Export history
                      </div>
                      <div className="text-xs mt-1.5" style={{ color: 'var(--t3)', lineHeight: 1.6 }}>
                        Recent lookalike exports, with source mix, preset and operator handoff trail.
                      </div>
                    </div>
                    <span className="text-[11px] px-2.5 py-1 rounded-lg" style={{ background: 'rgba(6,182,212,0.12)', color: '#06B6D4', fontWeight: 700 }}>
                      {lookalikeExportHistory.length} recent exports
                    </span>
                  </div>

                  <div className="space-y-2">
                    {lookalikeExportHistory.map((record: any) => {
                      const metadata = (record.metadata || {}) as Record<string, any>
                      const preset = LOOKALIKE_EXPORT_PRESETS.find((entry) => entry.key === metadata.preset)
                      const audienceNames = Array.isArray(metadata.audienceNames) && metadata.audienceNames.length > 0
                        ? metadata.audienceNames
                        : [metadata.audienceName].filter(Boolean)
                      const exportedAt = record.createdAt
                        ? new Date(record.createdAt).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })
                        : 'Just now'

                      return (
                        <div
                          key={record.id}
                          className="rounded-xl px-3 py-3"
                          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
                        >
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="min-w-0">
                              <div className="text-sm" style={{ fontWeight: 700, color: 'var(--heading)' }}>
                                {metadata.audienceName || record.summary}
                              </div>
                              <div className="text-[11px] mt-1" style={{ color: 'var(--t4)', lineHeight: 1.6 }}>
                                {audienceNames.length > 1 ? `Source mix: ${audienceNames.join(' + ')}` : `Source: ${audienceNames[0] || 'Custom seed'}`}
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <span className="text-[10px] px-2 py-1 rounded-full" style={{ background: 'rgba(139,92,246,0.12)', color: '#8B5CF6', fontWeight: 700 }}>
                                {preset?.label || metadata.preset || record.mode}
                              </span>
                              <span className="text-[10px] px-2 py-1 rounded-full" style={{ background: 'rgba(16,185,129,0.12)', color: '#10B981', fontWeight: 700 }}>
                                {metadata.memberCount || 0} members
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-3 flex-wrap mt-3">
                            <div className="text-[11px]" style={{ color: 'var(--t3)' }}>
                              {metadata.fileName || 'CSV export'} • {record.user?.name || record.user?.email || 'Team member'} • {exportedAt}
                            </div>
                            <div className="text-[11px]" style={{ color: 'var(--t4)' }}>
                              {preset?.fieldsSummary || 'Channel-ready handoff'}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="text-sm" style={{ fontWeight: 700, color: 'var(--heading)' }}>
                    No exports yet
                  </div>
                  <div className="text-xs mt-1.5" style={{ color: 'var(--t3)', lineHeight: 1.6 }}>
                    The first lookalike CSV you export will appear here with preset, seed mix and operator trail.
                  </div>
                </div>
              )}
	          </div>

	          <div className="grid gap-3 lg:grid-cols-2">
            {lookalikeExportData.audiences.map((audience: any) => {
              const isExporting = activeLookalikeExportKey === audience.key
              const isSaving = activeLookalikeSaveKey === audience.key
              const audienceExportBlockedByCoverage = isLookalikePresetBlocked({
                preset: lookalikeExportPreset,
                contactableCount: audience.contactableCount || 0,
              })
              return (
                <div key={audience.key} className="rounded-2xl p-4 space-y-4" style={{ background: 'var(--subtle)', border: '1px solid var(--card-border)' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm" style={{ fontWeight: 700, color: 'var(--heading)' }}>{audience.name}</div>
                      <div className="text-xs mt-1.5" style={{ color: 'var(--t3)', lineHeight: 1.6 }}>{audience.description}</div>
                    </div>
                    <span className="px-2 py-1 rounded-full text-[10px]" style={{ background: 'rgba(6,182,212,0.12)', color: '#06B6D4', fontWeight: 700 }}>
                      {audience.memberCount} seed members
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <span className="text-[11px] px-2.5 py-1 rounded-lg" style={{ background: 'rgba(139,92,246,0.12)', color: '#8B5CF6', fontWeight: 700 }}>
                      Avg health {audience.averageHealthScore}
                    </span>
                    <span className="text-[11px] px-2.5 py-1 rounded-lg" style={{ background: 'rgba(16,185,129,0.12)', color: '#10B981', fontWeight: 700 }}>
                      Avg revenue ${Math.round(audience.averageRevenue)}
                    </span>
                    <span className="text-[11px] px-2.5 py-1 rounded-lg" style={{ background: 'rgba(148,163,184,0.14)', color: 'var(--t2)', fontWeight: 700 }}>
                      {audience.traitsSummary}
                    </span>
                  </div>

                  <div className="text-xs" style={{ color: 'var(--t3)', lineHeight: 1.6 }}>
                    {audience.useCase}
                  </div>

                  <div className="space-y-2">
                    {audience.previewMembers.slice(0, 3).map((member: any) => (
                      <div key={member.userId} className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm truncate" style={{ fontWeight: 700, color: 'var(--heading)' }}>{member.name}</div>
                            <div className="text-[11px] mt-1" style={{ color: 'var(--t4)' }}>{member.reason}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-[11px]" style={{ color: '#06B6D4', fontWeight: 700 }}>H {member.healthScore ?? '—'}</div>
                            <div className="text-[11px]" style={{ color: 'var(--t4)' }}>${Math.round(member.totalRevenue || 0)}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleSaveLookalikeAudience(audience)}
                      disabled={createCohortMutation.isPending || isSaving}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:translate-x-[2px] disabled:opacity-60"
                      style={{ background: 'rgba(139,92,246,0.12)', color: '#8B5CF6' }}
                    >
                      {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Filter className="w-3.5 h-3.5" />}
                      {isSaving ? 'Saving cohort...' : 'Save as cohort'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportLookalikeAudience([audience.key], audience.key)}
                      disabled={exportLookalikeAudienceCsv.isPending || isExporting || audienceExportBlockedByCoverage}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:translate-x-[2px] disabled:opacity-60"
                      style={{ background: 'rgba(16,185,129,0.12)', color: '#10B981' }}
                    >
                      {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                      {isExporting ? 'Exporting...' : 'Export CSV'}
                    </button>
                    <Link
                      href={buildCohortAdvisorHref(clubId, audience.advisorPrompt)}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:translate-x-[2px]"
                      style={{ background: 'rgba(6,182,212,0.12)', color: '#06B6D4' }}
                    >
                      <Send className="w-3.5 h-3.5" />
                      Open playbook
                    </Link>
                  </div>

                  {audienceExportBlockedByCoverage ? (
                    <div className="text-[11px]" style={{ color: '#F59E0B', fontWeight: 600, lineHeight: 1.6 }}>
                      This preset is blocked for {audience.name} because this seed has no usable email or phone coverage yet. Switch to `Generic CSV` or widen the audience first.
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {smartFirstSessionData?.suggestedCohorts?.length && !showCreate && !selectedCohortId ? (
        <div className="rounded-2xl p-4 space-y-4" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" style={{ color: '#8B5CF6' }} />
                <span className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--t4)' }}>
                  Agent Suggested Newcomer Cohorts
                </span>
              </div>
              <p className="text-sm mt-2" style={{ color: 'var(--t3)', maxWidth: 760 }}>
                The agent is suggesting reusable newcomer cohorts directly from the smart first session funnel, so you can save the audience first or jump straight into the related campaign draft.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs px-3 py-1.5 rounded-full" style={{ background: 'rgba(139,92,246,0.12)', color: '#8B5CF6', fontWeight: 700 }}>
                {smartFirstSessionData.summary.totalCandidates} newcomer opportunities
              </span>
              {hasSmartSuggestionDecisions ? (
                <button
                  type="button"
                  onClick={() => clearAdminTodoDecisions.mutate({ clubId, dateKey: suggestionDateKey })}
                  disabled={clearAdminTodoDecisions.isPending}
                  className="text-xs px-3 py-1.5 rounded-full transition-all disabled:opacity-60"
                  style={{ background: 'rgba(148,163,184,0.14)', color: 'var(--t2)', fontWeight: 700 }}
                >
                  {clearAdminTodoDecisions.isPending ? 'Resetting...' : 'Reset newcomer suggestions'}
                </button>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            {smartFirstSessionData.suggestedCohorts.map((cohort: any) => {
              const tone = SMART_FIRST_SESSION_STAGE_STYLES[cohort.stage] || SMART_FIRST_SESSION_STAGE_STYLES.book_first_session
              const decision = suggestionDecisionMap[cohort.key]
              const decisionStyle = decision ? SUGGESTION_DECISION_STYLES[decision] : null
              const isAccepted = decision === 'accepted'
              const isDeclined = decision === 'declined'
              const isNotNow = decision === 'not_now'
              return (
                <div key={cohort.key} className="rounded-2xl p-4 space-y-4" style={{ background: 'var(--subtle)', border: '1px solid var(--card-border)' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm" style={{ fontWeight: 700, color: 'var(--heading)' }}>{cohort.name}</div>
                      <div className="text-xs mt-1.5" style={{ color: 'var(--t3)', lineHeight: 1.6 }}>{cohort.description}</div>
                    </div>
                    <span className="px-2 py-1 rounded-full text-[10px]" style={{ background: tone.bg, color: tone.color, fontWeight: 700 }}>
                      {tone.label}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Users className="w-4 h-4" style={{ color: tone.color }} />
                      <span className="text-sm" style={{ fontWeight: 700, color: 'var(--heading)' }}>{cohort.count}</span>
                      <span className="text-xs" style={{ color: 'var(--t4)' }}>members</span>
                    </div>
                    {decisionStyle ? (
                      <span className="px-2 py-1 rounded-full text-[10px]" style={{ background: decisionStyle.bg, color: decisionStyle.color, fontWeight: 700 }}>
                        {decisionStyle.label}
                      </span>
                    ) : null}
                  </div>

                  {isDeclined ? (
                    <div className="text-xs" style={{ color: 'var(--t3)', lineHeight: 1.6 }}>
                      Declined for today. Reset newcomer suggestions if you want this stage to come back into the queue.
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleAcceptSuggestion({
                          itemId: cohort.key,
                          title: cohort.name,
                          href: buildCohortAdvisorHref(clubId, cohort.createCohortPrompt),
                          action: 'build_cohort',
                        })}
                        disabled={setAdminTodoDecision.isPending}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:translate-x-[2px] disabled:opacity-60"
                        style={{ background: 'rgba(139,92,246,0.12)', color: '#8B5CF6' }}
                      >
                        <Filter className="w-3.5 h-3.5" />
                        {isAccepted ? 'Open cohort flow' : 'Build cohort'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAcceptSuggestion({
                          itemId: cohort.key,
                          title: cohort.name,
                          href: buildCohortAdvisorHref(clubId, cohort.draftCampaignPrompt),
                          action: 'draft_campaign',
                        })}
                        disabled={setAdminTodoDecision.isPending}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:translate-x-[2px] disabled:opacity-60"
                        style={{ background: tone.bg, color: tone.color }}
                      >
                        <Send className="w-3.5 h-3.5" />
                        {isAccepted ? 'Open campaign flow' : 'Draft campaign'}
                      </button>
                      {!isAccepted ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleSuggestionDecision({
                              itemId: cohort.key,
                              title: cohort.name,
                              href: buildCohortAdvisorHref(clubId, cohort.createCohortPrompt),
                              decision: 'not_now',
                              metadata: { action: 'snooze' },
                            })}
                            disabled={setAdminTodoDecision.isPending}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-60"
                            style={{ background: 'rgba(245,158,11,0.12)', color: '#F59E0B' }}
                          >
                            <Clock className="w-3.5 h-3.5" />
                            {isNotNow ? 'Snoozed' : 'Not now'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSuggestionDecision({
                              itemId: cohort.key,
                              title: cohort.name,
                              href: buildCohortAdvisorHref(clubId, cohort.createCohortPrompt),
                              decision: 'declined',
                              metadata: { action: 'decline' },
                            })}
                            disabled={setAdminTodoDecision.isPending}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-60"
                            style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444' }}
                          >
                            <X className="w-3.5 h-3.5" />
                            Decline
                          </button>
                        </>
                      ) : null}
                    </div>
                  )}
                  {isNotNow ? (
                    <div className="text-[11px]" style={{ color: 'var(--t4)', lineHeight: 1.6 }}>
                      Snoozed for now. Reset newcomer suggestions when you want the agent to surface this stage again.
                    </div>
                  ) : null}
                  {isAccepted ? (
                    <div className="text-[11px]" style={{ color: tone.color, lineHeight: 1.6, fontWeight: 600 }}>
                      Accepted into the newcomer workflow. Re-open the cohort or campaign flow from here whenever you need it.
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {/* Cohort list */}
      {!showCreate && !selectedCohortId && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cohorts?.map((c: any) => (
            <motion.div
              key={c.id}
              whileHover={{ scale: 1.02 }}
              className="group rounded-2xl p-5 cursor-pointer transition-all"
              style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
              onClick={() => setSelectedCohortId(c.id)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)' }}>
                  <Users className="w-5 h-5 text-white" />
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                  <button
                    onClick={(e) => { e.stopPropagation(); setCampaignCohort({ id: c.id, name: c.name, filters: c.filters }) }}
                    className="p-1.5 rounded-lg transition-all hover:bg-violet-500/10"
                    style={{ color: '#8B5CF6' }}
                    title="Launch campaign"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); if (confirm('Delete this cohort?')) deleteMutation.mutate({ clubId, cohortId: c.id }) }}
                    className="p-1.5 rounded-lg transition-all hover:bg-red-500/10"
                    style={{ color: 'var(--t4)' }}
                    title="Delete cohort"
                  >
                    <Trash2 className="w-4 h-4 hover:text-red-400" />
                  </button>
                </div>
              </div>
              <h3 className="text-base mb-1" style={{ fontWeight: 700, color: 'var(--heading)' }}>{c.name}</h3>
              {c.description && <p className="text-xs mb-3 line-clamp-2" style={{ color: 'var(--t3)' }}>{c.description}</p>}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4" style={{ color: '#8B5CF6' }} />
                  <span className="text-sm" style={{ fontWeight: 700, color: 'var(--heading)' }}>{c.memberCount}</span>
                  <span className="text-xs" style={{ color: 'var(--t4)' }}>members</span>
                </div>
                <ChevronRight className="w-4 h-4" style={{ color: 'var(--t4)' }} />
              </div>
              {/* Filter tags */}
              <div className="flex flex-wrap gap-1 mt-3">
                {parseCohortFilters(c.filters).map((f, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(139,92,246,0.1)', color: '#A78BFA' }}>
                    {FILTER_FIELDS.find(ff => ff.key === f.field)?.label || f.field} {OP_LABELS[f.op]} {formatCohortFilterValue(f.field, f.value)}
                  </span>
                ))}
              </div>
            </motion.div>
          ))}

          {cohorts?.length === 0 && (
            <div className="col-span-full text-center py-16" style={{ color: 'var(--t4)' }}>
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No segments yet. Create your first one!</p>
            </div>
          )}
        </div>
      )}

      {/* Quick Campaign Modal */}
      {campaignCohort && (
        <QuickCampaignModal clubId={clubId} cohort={campaignCohort} onClose={() => setCampaignCohort(null)} />
      )}
    </motion.div>
  )
}

// ── Quick Campaign Modal (Launch Campaign from Cohort) ──
function QuickCampaignModal({ clubId, cohort, onClose }: { clubId: string; cohort: { id: string; name: string; filters: any }; onClose: () => void }) {
  const [subject, setSubject] = useState(`Message for ${cohort.name}`)
  const [body, setBody] = useState('')
  const [channel, setChannel] = useState<'email' | 'sms' | 'both'>('email')
  const [generating, setGenerating] = useState(false)
  const [sent, setSent] = useState<{ sent: number; skipped: number; errors: number } | null>(null)

  // Load cohort members
  const { data: membersData, isLoading } = trpc.intelligence.getCohortMembers.useQuery(
    { clubId, cohortId: cohort.id },
    { enabled: !!cohort.id },
  )
  const members = membersData?.members || []

  // AI generate message
  const generateMutation = trpc.intelligence.generateCohortCampaign.useMutation({
    onSuccess: (data: any) => {
      if (data.subject) setSubject(data.subject)
      if (data.body) setBody(data.body)
      setGenerating(false)
    },
    onError: () => setGenerating(false),
  })

  const handleGenerate = () => {
    setGenerating(true)
    generateMutation.mutate({ clubId, cohortId: cohort.id })
  }

  // Send campaign
  const sendMutation = trpc.intelligence.sendOutreachMessage.useMutation({
    onSuccess: () => {},
  })

  const handleSend = async () => {
    let sentCount = 0, skippedCount = 0, errCount = 0
    for (const m of members) {
      if (!m.email) { skippedCount++; continue }
      try {
        await sendMutation.mutateAsync({
          clubId,
          userId: m.id,
          type: 'CAMPAIGN',
          channel,
          subject,
          body,
        } as any)
        sentCount++
      } catch {
        errCount++
      }
    }
    setSent({ sent: sentCount, skipped: skippedCount, errors: errCount })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl p-6"
        style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg" style={{ fontWeight: 700, color: 'var(--heading)' }}>
            <Send className="w-5 h-5 inline mr-2" style={{ color: '#8B5CF6' }} />
            Campaign: {cohort.name}
          </h2>
          <button onClick={onClose} style={{ color: 'var(--t4)' }}><X className="w-5 h-5" /></button>
        </div>

        {sent ? (
          <div className="text-center py-8">
            <div className="text-3xl mb-3">✅</div>
            <p className="text-lg mb-1" style={{ fontWeight: 700, color: 'var(--heading)' }}>Campaign Sent!</p>
            <p className="text-sm" style={{ color: 'var(--t3)' }}>
              {sent.sent} sent, {sent.skipped} skipped, {sent.errors} errors
            </p>
            <button onClick={onClose} className="mt-4 px-6 py-2 rounded-xl text-sm" style={{ background: 'var(--subtle)', color: 'var(--t2)', fontWeight: 600 }}>Close</button>
          </div>
        ) : (
          <>
            {/* Audience */}
            <div className="p-3 rounded-xl mb-4" style={{ background: 'var(--subtle)' }}>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4" style={{ color: '#8B5CF6' }} />
                <span className="text-sm" style={{ fontWeight: 600, color: 'var(--heading)' }}>
                  {isLoading ? '...' : members.length} recipients
                </span>
              </div>
            </div>

            {/* Channel */}
            <div className="flex gap-2 mb-4">
              {(['email', 'sms', 'both'] as const).map(ch => (
                <button key={ch} onClick={() => setChannel(ch)}
                  className="flex-1 py-2 rounded-xl text-xs capitalize transition-all"
                  style={{
                    background: channel === ch ? 'rgba(139,92,246,0.15)' : 'var(--subtle)',
                    color: channel === ch ? '#8B5CF6' : 'var(--t3)',
                    fontWeight: channel === ch ? 700 : 500,
                    border: channel === ch ? '1px solid rgba(139,92,246,0.3)' : '1px solid transparent',
                  }}>
                  {ch === 'both' ? 'Email + SMS' : ch.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Subject */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs" style={{ fontWeight: 600, color: 'var(--t2)' }}>Subject</label>
                <button onClick={handleGenerate} disabled={generating}
                  className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg"
                  style={{ background: 'rgba(139,92,246,0.1)', color: '#8B5CF6', fontWeight: 600 }}>
                  {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  AI Generate
                </button>
              </div>
              <input value={subject} onChange={e => setSubject(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--subtle)', color: 'var(--t1)', border: '1px solid var(--card-border)' }} />
            </div>

            {/* Body */}
            <div className="mb-4">
              <label className="text-xs mb-1 block" style={{ fontWeight: 600, color: 'var(--t2)' }}>Message</label>
              <textarea value={body} onChange={e => setBody(e.target.value)} rows={4}
                placeholder="Write your message or click AI Generate..."
                className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                style={{ background: 'var(--subtle)', color: 'var(--t1)', border: '1px solid var(--card-border)' }} />
            </div>

            {/* Send */}
            <button onClick={handleSend}
              disabled={!subject.trim() || !body.trim() || members.length === 0 || sendMutation.isPending}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm text-white transition-all disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)', fontWeight: 700 }}>
              {sendMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              Send to {members.length} member{members.length > 1 ? 's' : ''}
            </button>
          </>
        )}
      </motion.div>
    </div>
  )
}

// ── Cohort Builder ──
function CohortBuilder({ clubId, onClose, onSaved }: { clubId: string; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [filters, setFilters] = useState<CohortFilter[]>([])
  const [saving, setSaving] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiParsing, setAiParsing] = useState(false)

  const parseMutation = trpc.intelligence.parseCohortFromText.useMutation({
    onSuccess: (data) => {
      if (data.name) setName(data.name)
      if (data.description) setDescription(data.description)
      if (data.filters?.length) setFilters(data.filters as CohortFilter[])
      setAiPrompt('')
    },
    onSettled: () => setAiParsing(false),
  })

  const handleAiParse = () => {
    if (!aiPrompt.trim()) return
    setAiParsing(true)
    parseMutation.mutate({ clubId, text: aiPrompt.trim() })
  }

  const previewFilters = useMemo(() => sanitizeCohortFilters(filters), [filters])
  const hasIncompleteFilters = filters.length > 0 && previewFilters.length !== filters.length

  const previewQuery = trpc.intelligence.previewCohort.useQuery(
    { clubId, filters: previewFilters },
    { enabled: previewFilters.length > 0 }
  )

  const createMutation = trpc.intelligence.createCohort.useMutation({
    onSuccess: () => onSaved(),
  })

  const addFilter = () => {
    setFilters([...filters, { field: 'age', op: 'gte' as FilterOp, value: '' }])
  }

  const updateFilter = (i: number, update: Partial<CohortFilter>) => {
    const next = [...filters]
    next[i] = { ...next[i], ...update }
    // Reset value when field changes
    if (update.field) {
      const fieldDef = FILTER_FIELDS.find(f => f.key === update.field)
      next[i].op = (fieldDef?.ops[0] || 'eq') as FilterOp
      next[i].value = ''
    }
    setFilters(next)
  }

  const removeFilter = (i: number) => setFilters(filters.filter((_, idx) => idx !== i))

  const handleSave = async () => {
    if (!name.trim() || previewFilters.length === 0) return
    setSaving(true)
    try {
      await createMutation.mutateAsync({
        clubId,
        name: name.trim(),
        description: description.trim() || undefined,
        filters: previewFilters,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="rounded-2xl p-6 space-y-5"
      style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg" style={{ fontWeight: 700, color: 'var(--heading)' }}>
          <Filter className="w-5 h-5 inline mr-2" />
          Create Cohort
        </h2>
        <button onClick={onClose} style={{ color: 'var(--t4)' }}><X className="w-5 h-5" /></button>
      </div>

      {/* AI Natural Language Input */}
      <div className="flex gap-2">
        <input
          type="text" value={aiPrompt} onChange={e => setAiPrompt(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAiParse()}
          placeholder="Describe your cohort: e.g. &quot;DUPR 2-3, men 55+&quot; or &quot;active beginner women&quot;"
          className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-violet-500/30"
          style={{ background: 'rgba(139,92,246,0.06)', color: 'var(--t1)', border: '1px solid rgba(139,92,246,0.2)' }}
        />
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleAiParse}
          disabled={!aiPrompt.trim() || aiParsing}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm text-white"
          style={{ background: 'linear-gradient(135deg, #8B5CF6, #6366F1)', fontWeight: 600, opacity: (!aiPrompt.trim() || aiParsing) ? 0.5 : 1 }}
        >
          {aiParsing ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '✨'} AI
        </motion.button>
      </div>
      {parseMutation.error && (
        <p className="text-xs" style={{ color: '#EF4444' }}>{parseMutation.error.message}</p>
      )}

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px" style={{ background: 'var(--card-border)' }} />
        <span className="text-[10px] uppercase" style={{ color: 'var(--t4)' }}>or build manually</span>
        <div className="flex-1 h-px" style={{ background: 'var(--card-border)' }} />
      </div>

      {/* Name + description */}
      <div className="space-y-3">
        <input
          type="text" value={name} onChange={e => setName(e.target.value)}
          placeholder="Cohort name (e.g. Senior Men 55+)"
          className="w-full px-4 py-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-violet-500/30"
          style={{ background: 'var(--subtle)', color: 'var(--t1)', border: '1px solid var(--card-border)' }}
        />
        <input
          type="text" value={description} onChange={e => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className="w-full px-4 py-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-violet-500/30"
          style={{ background: 'var(--subtle)', color: 'var(--t1)', border: '1px solid var(--card-border)' }}
        />
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--t4)', fontWeight: 600 }}>Conditions</span>
          <button onClick={addFilter} className="text-xs flex items-center gap-1" style={{ color: '#8B5CF6', fontWeight: 600 }}>
            <Plus className="w-3.5 h-3.5" /> Add filter
          </button>
        </div>

        {filters.map((f, i) => {
          const fieldDef = FILTER_FIELDS.find(ff => ff.key === f.field)
          return (
            <div key={i} className="flex items-center gap-2 p-3 rounded-xl" style={{ background: 'var(--subtle)' }}>
              {/* Field */}
              <select
                value={f.field}
                onChange={e => updateFilter(i, { field: e.target.value as CohortFilterField })}
                className="px-2 py-1.5 rounded-lg text-xs outline-none"
                style={{ background: 'var(--card-bg)', color: 'var(--t1)', border: '1px solid var(--card-border)' }}
              >
                {FILTER_FIELDS.map(ff => <option key={ff.key} value={ff.key}>{ff.label}</option>)}
              </select>

              {/* Operator */}
              <select
                value={f.op}
                onChange={e => updateFilter(i, { op: e.target.value as FilterOp })}
                className="px-2 py-1.5 rounded-lg text-xs outline-none"
                style={{ background: 'var(--card-bg)', color: 'var(--t1)', border: '1px solid var(--card-border)' }}
              >
                {(fieldDef?.ops || ['eq']).map(op => <option key={op} value={op}>{OP_LABELS[op]}</option>)}
              </select>

              {/* Value */}
              {fieldDef?.type === 'select' ? (
                <select
                  value={f.value as string}
                  onChange={e => updateFilter(i, { value: e.target.value })}
                  className="flex-1 px-2 py-1.5 rounded-lg text-xs outline-none"
                  style={{ background: 'var(--card-bg)', color: 'var(--t1)', border: '1px solid var(--card-border)' }}
                >
                  <option value="">Select...</option>
                  {fieldDef.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <input
                  type={fieldDef?.type === 'number' ? 'number' : 'text'}
                  value={f.value as string}
                  onChange={e => updateFilter(i, { value: e.target.value })}
                  placeholder={fieldDef?.type === 'number' ? '0' : 'Value...'}
                  className="flex-1 px-2 py-1.5 rounded-lg text-xs outline-none"
                  style={{ background: 'var(--card-bg)', color: 'var(--t1)', border: '1px solid var(--card-border)' }}
                />
              )}

              <button onClick={() => removeFilter(i)} style={{ color: 'var(--t4)' }}>
                <X className="w-4 h-4" />
              </button>
            </div>
          )
        })}

        {filters.length === 0 && (
          <p className="text-xs text-center py-4" style={{ color: 'var(--t4)' }}>
            Add conditions to define who belongs to this cohort
          </p>
        )}
      </div>

      {/* Preview count */}
      {filters.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl" style={{ background: 'rgba(139,92,246,0.08)' }}>
            <Eye className="w-4 h-4" style={{ color: '#8B5CF6' }} />
            <span className="text-sm" style={{ color: '#A78BFA', fontWeight: 600 }}>
              {previewQuery.isLoading
                ? 'Counting...'
                : previewQuery.error
                  ? 'Could not preview this cohort'
                  : hasIncompleteFilters
                    ? `${previewFilters.length} valid filter${previewFilters.length === 1 ? '' : 's'} ready — complete the remaining fields`
                    : `${previewQuery.data?.count ?? 0} members match`}
            </span>
          </div>

          {hasIncompleteFilters ? (
            <p className="text-xs" style={{ color: '#F59E0B' }}>
              Some filters are still incomplete, so they are currently ignored in the preview.
            </p>
          ) : null}

          {previewQuery.error ? (
            <p className="text-xs" style={{ color: '#EF4444' }}>
              {previewQuery.error.message}
            </p>
          ) : null}
        </div>
      )}

      {/* Save */}
      <div className="flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm" style={{ color: 'var(--t3)' }}>Cancel</button>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={handleSave}
          disabled={!name.trim() || previewFilters.length === 0 || saving}
          className="px-5 py-2.5 rounded-xl text-sm text-white"
          style={{
            background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)',
            fontWeight: 600,
            opacity: (!name.trim() || previewFilters.length === 0 || saving) ? 0.5 : 1,
          }}
        >
          {saving ? 'Creating...' : 'Create Cohort'}
        </motion.button>
      </div>
    </motion.div>
  )
}

// ── Cohort Detail View ──
function CohortDetail({ clubId, cohortId, onClose }: { clubId: string; cohortId: string; onClose: () => void }) {
  const { data, isLoading } = trpc.intelligence.getCohortMembers.useQuery({ clubId, cohortId })

  if (isLoading) {
    return (
      <div className="rounded-2xl p-6" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: 'var(--subtle)' }} />)}
        </div>
      </div>
    )
  }

  const cohort = data?.cohort as any
  const members = (data?.members || []) as any[]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-4"
    >
      {/* Header */}
      <div className="rounded-2xl p-6" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg" style={{ fontWeight: 700, color: 'var(--heading)' }}>{cohort?.name}</h2>
            {cohort?.description && <p className="text-xs mt-1" style={{ color: 'var(--t3)' }}>{cohort.description}</p>}
          </div>
          <button onClick={onClose} style={{ color: 'var(--t4)' }}><X className="w-5 h-5" /></button>
        </div>

        {/* Filter tags */}
        <div className="flex flex-wrap gap-1.5">
              {parseCohortFilters(cohort?.filters).map((f, i) => (
                <span key={i} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(139,92,246,0.1)', color: '#A78BFA' }}>
                  {FILTER_FIELDS.find(ff => ff.key === f.field)?.label || f.field} {OP_LABELS[f.op]} {formatCohortFilterValue(f.field, f.value)}
                </span>
              ))}
          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(6,182,212,0.1)', color: '#06B6D4' }}>
            {members.length} members
          </span>
        </div>
      </div>

      {/* AI Campaign Strategies — primary action */}
      <CohortCampaignSuggestion clubId={clubId} cohortId={cohortId} memberCount={members.length} />

      {/* Members list */}
      <div className="rounded-2xl p-4" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
        <div className="space-y-1">
          {members.map((m: any) => (
            <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl transition-colors" style={{ background: 'var(--subtle)' }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xs text-white flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)', fontWeight: 700 }}>
                {(m.name || m.email || '?').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate" style={{ fontWeight: 600, color: 'var(--heading)' }}>{m.name || 'Unnamed'}</div>
                <div className="text-xs truncate" style={{ color: 'var(--t4)' }}>
                  {[
                    m.age ? `${m.age}y` : null,
                    m.gender === 'M' ? 'Male' : m.gender === 'F' ? 'Female' : null,
                    m.normalizedMembershipType && m.normalizedMembershipType !== 'unknown'
                      ? formatCohortFilterValue('normalizedMembershipType', m.normalizedMembershipType)
                      : null,
                    m.normalizedMembershipStatus && !['unknown', 'active'].includes(m.normalizedMembershipStatus)
                      ? formatCohortFilterValue('normalizedMembershipStatus', m.normalizedMembershipStatus)
                      : null,
                    m.membershipType,
                    m.skillLevel,
                  ].filter(Boolean).join(' · ') || m.email}
                </div>
              </div>
              {m.duprRating > 0 && <DuprBadge rating={Number(m.duprRating)} />}
            </div>
          ))}

          {members.length === 0 && (
            <p className="text-center py-8 text-sm" style={{ color: 'var(--t4)' }}>No members match these filters</p>
          )}
        </div>
      </div>

    </motion.div>
  )
}

// ── Strategy colors/icons ──
const STRATEGY_STYLES: Record<string, { gradient: string; icon: string; label: string }> = {
  before_peak: { gradient: 'linear-gradient(135deg, #8B5CF6, #06B6D4)', icon: '🎯', label: 'Peak Day Boost' },
  re_engage: { gradient: 'linear-gradient(135deg, #F59E0B, #EF4444)', icon: '💌', label: 'Re-engage' },
  slot_filler: { gradient: 'linear-gradient(135deg, #10B981, #059669)', icon: '⚡', label: 'Last-Minute Fill' },
}

// ── AI Campaign Suggestions ──
function CohortCampaignSuggestion({ clubId, cohortId, memberCount }: { clubId: string; cohortId: string; memberCount: number }) {
  const [campaigns, setCampaigns] = useState<any[] | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  const generateMutation = trpc.intelligence.generateCohortCampaign.useMutation({
    onSuccess: (data) => {
      setCampaigns(data.campaigns || [])
      setExpanded(null)
    },
  })

  if (memberCount === 0) return null

  return (
    <div className="rounded-2xl p-6" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm uppercase tracking-wider" style={{ color: 'var(--t4)', fontWeight: 600 }}>
          <Sparkles className="w-4 h-4 inline mr-1.5" style={{ color: '#F59E0B' }} />
          AI Campaign Strategies
        </h3>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => generateMutation.mutate({ clubId, cohortId })}
          disabled={generateMutation.isPending}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-white"
          style={{
            background: 'linear-gradient(135deg, #F59E0B, #EF4444)',
            fontWeight: 600,
            opacity: generateMutation.isPending ? 0.5 : 1,
          }}
        >
          {generateMutation.isPending ? (
            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Sparkles className="w-3.5 h-3.5" />
          )}
          {campaigns ? 'Regenerate' : 'Generate Strategies'}
        </motion.button>
      </div>

      {generateMutation.error && (
        <p className="text-xs mb-3" style={{ color: '#EF4444' }}>{generateMutation.error.message}</p>
      )}

      {!campaigns && !generateMutation.isPending && (
        <p className="text-xs text-center py-6" style={{ color: 'var(--t4)' }}>
          Click &quot;Generate Strategies&quot; to get 3 AI-powered campaign strategies for this cohort
        </p>
      )}

      {campaigns && campaigns.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          {campaigns.map((c, i) => {
            const style = STRATEGY_STYLES[c.strategy] || STRATEGY_STYLES.before_peak
            const isOpen = expanded === i

            return (
              <motion.div
                key={i}
                layout
                className="rounded-xl overflow-hidden"
                style={{ border: isOpen ? '1px solid rgba(139,92,246,0.3)' : '1px solid var(--card-border)' }}
              >
                {/* Header — always visible */}
                <div
                  className="flex items-center gap-3 p-4 cursor-pointer"
                  style={{ background: isOpen ? 'rgba(139,92,246,0.05)' : 'var(--subtle)' }}
                  onClick={() => setExpanded(isOpen ? null : i)}
                >
                  <span className="text-lg">{style.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm" style={{ fontWeight: 700, color: 'var(--heading)' }}>
                      {c.strategyLabel || style.label}
                    </div>
                    <div className="text-xs truncate" style={{ color: 'var(--t3)' }}>{c.subjectLine}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-md" style={{ background: 'var(--card-bg)' }}>
                      {c.channel === 'sms' ? <MessageSquare className="w-3 h-3" style={{ color: '#8B5CF6' }} /> : <Mail className="w-3 h-3" style={{ color: '#8B5CF6' }} />}
                      <span className="text-[10px]" style={{ color: 'var(--t3)' }}>{c.channel === 'sms' ? 'SMS' : 'Email'}</span>
                    </div>
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-md" style={{ background: 'var(--card-bg)' }}>
                      <Clock className="w-3 h-3" style={{ color: '#06B6D4' }} />
                      <span className="text-[10px]" style={{ color: 'var(--t3)' }}>{c.bestTimeToSend}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 transition-transform" style={{ color: 'var(--t4)', transform: isOpen ? 'rotate(90deg)' : 'none' }} />
                  </div>
                </div>

                {/* Expanded content */}
                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 space-y-3">
                        <div className="p-3 rounded-xl text-xs whitespace-pre-wrap" style={{ background: 'var(--card-bg)', color: 'var(--t2)', lineHeight: 1.6 }}>
                          {c.body}
                        </div>
                        {c.tone && (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(139,92,246,0.1)', color: '#A78BFA' }}>
                              Tone: {c.tone}
                            </span>
                          </div>
                        )}
                        {c.reasoning && (
                          <p className="text-[11px] italic" style={{ color: 'var(--t4)' }}>{c.reasoning}</p>
                        )}
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm text-white"
                          style={{ background: style.gradient, fontWeight: 600 }}
                        >
                          <Send className="w-3.5 h-3.5" /> Use This Strategy
                        </motion.button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </motion.div>
      )}
    </div>
  )
}
