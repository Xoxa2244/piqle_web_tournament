'use client'

import { useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'motion/react'
import { Users, Plus, Trash2, X, Filter, ChevronRight, Eye, Send, UserCheck, Sparkles, Clock, Mail, MessageSquare, Wand2, Loader2, Download, Pencil, Check as CheckIcon } from 'lucide-react'
import { DuprBadge } from './shared/SmsBadge'
import { trpc } from '@/lib/trpc'
import { LOOKALIKE_EXPORT_PRESETS, type LookalikeExportPreset } from '@/lib/ai/lookalike-export'
import { useAdminTodoDecisions, useClearAdminTodoDecisions, useExportLookalikeAudienceCsv, useLookalikeAudienceExport, useLookalikeAudienceExportPreview, useLookalikeExportHistory, useSetAdminTodoDecision, useSmartFirstSession, useSuggestedCohorts } from '../../_hooks/use-intelligence'
import { SuggestedCohortCard } from '../SuggestedCohortCard'
import { STATUS_OPTIONS, TIER_OPTIONS } from '../MembersFilterDrawer'

// ── Filter field definitions ──
const NORMALIZED_MEMBERSHIP_TYPE_OPTIONS = TIER_OPTIONS
  .filter((option) => option.key !== 'all')
  .map((option) => ({ label: option.label, value: option.key }))

const NORMALIZED_MEMBERSHIP_STATUS_OPTIONS = STATUS_OPTIONS
  .filter((option) => option.key !== 'all')
  .map((option) => ({ label: option.label, value: option.key }))

const RISK_LEVEL_OPTIONS = [
  { label: 'Healthy', value: 'healthy' },
  { label: 'Watch', value: 'watch' },
  { label: 'At-Risk', value: 'at_risk' },
  { label: 'Critical', value: 'critical' },
]

const QUICK_FILTER_COPY = {
  membershipStatus: {
    label: 'Membership State',
    hint: 'Same lifecycle vocabulary as Members.',
  },
  membershipType: {
    label: 'Membership Tier',
    hint: 'Trial, package, monthly, VIP, and more.',
  },
  riskLevel: {
    label: 'Risk',
    hint: 'Current health-based save priority.',
  },
}

const BIRTHDAY_MONTH_OPTIONS = [
  { label: 'January',   value: '1'  }, { label: 'February',  value: '2'  },
  { label: 'March',     value: '3'  }, { label: 'April',     value: '4'  },
  { label: 'May',       value: '5'  }, { label: 'June',      value: '6'  },
  { label: 'July',      value: '7'  }, { label: 'August',    value: '8'  },
  { label: 'September', value: '9'  }, { label: 'October',   value: '10' },
  { label: 'November',  value: '11' }, { label: 'December',  value: '12' },
]

const FILTER_FIELDS = [
  { key: 'age', label: 'Age', type: 'number' as const, ops: ['gte', 'lte', 'gt', 'lt', 'eq'] },
  { key: 'gender', label: 'Gender', type: 'select' as const, ops: ['eq'], options: [{ label: 'Male', value: 'M' }, { label: 'Female', value: 'F' }] },
  // P3-T3 D7 fields:
  { key: 'healthScore', label: 'Health Score', type: 'number' as const, ops: ['gte', 'lte', 'gt', 'lt', 'eq'] },
  { key: 'riskLevel', label: 'Risk Level', type: 'select' as const, ops: ['eq'], options: RISK_LEVEL_OPTIONS },
  { key: 'joinedDaysAgo', label: 'Joined (days ago)', type: 'number' as const, ops: ['lte', 'gte'] },
  { key: 'birthdayMonth', label: 'Birthday Month', type: 'select' as const, ops: ['eq'], options: BIRTHDAY_MONTH_OPTIONS },
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
type CohortBuilderMode = 'quick' | 'advanced'
type PreviewSort = 'alpha' | 'risk' | 'activity' | 'newest' | 'inactive'

// Must stay in sync with cohortFilterSchema in server/routers/intelligence.ts
// — if you add a new field on the server, mirror it here so TS accepts it at
// the tRPC call site.
type CohortFilterField =
  | 'age' | 'gender' | 'membershipType' | 'membershipStatus' | 'skillLevel'
  | 'zipCode' | 'city' | 'sessionFormat' | 'dayOfWeek' | 'frequency'
  | 'recency' | 'userId' | 'duprRating'
  | 'healthScore' | 'riskLevel' | 'joinedDaysAgo' | 'birthdayMonth'
  | 'normalizedMembershipType' | 'normalizedMembershipStatus'

interface CohortFilter {
  field: CohortFilterField
  op: FilterOp
  value: string | number | string[]
}

interface QuickCohortState {
  membershipStatus: string[]
  membershipType: string[]
  riskLevel: string[]
  joinedWithinDays: string
  inactiveDays: string
  sessionsPerMonthMin: string
  sessionsPerMonthMax: string
}

const EMPTY_QUICK_COHORT: QuickCohortState = {
  membershipStatus: [],
  membershipType: [],
  riskLevel: [],
  joinedWithinDays: '',
  inactiveDays: '',
  sessionsPerMonthMin: '',
  sessionsPerMonthMax: '',
}

const QUICK_COHORT_PRESETS: Array<{
  id: string
  label: string
  description: string
  name: string
  state: Partial<QuickCohortState>
}> = [
  {
    id: 'at-risk-vips',
    label: 'At-Risk VIPs',
    description: 'Unlimited members who need attention before they quietly churn.',
    name: 'At-Risk VIPs',
    state: { membershipType: ['unlimited'], riskLevel: ['at_risk', 'critical'] },
  },
  {
    id: 'trial-not-converted',
    label: 'Trial Not Converted',
    description: 'Trial players who have already touched the product and need a nudge.',
    name: 'Trial Not Converted',
    state: { membershipStatus: ['trial'], sessionsPerMonthMin: '2', inactiveDays: '7' },
  },
  {
    id: 'inactive-regulars',
    label: 'Inactive Regulars',
    description: 'Previously active members who have gone quiet long enough to matter.',
    name: 'Inactive Regulars',
    state: { membershipStatus: ['active'], inactiveDays: '21', sessionsPerMonthMin: '1' },
  },
  {
    id: 'new-members',
    label: 'New Members',
    description: 'Fresh joiners who should move into onboarding or first-campaign flows.',
    name: 'New Members',
    state: { joinedWithinDays: '30', membershipStatus: ['active', 'trial'] },
  },
]

function toggleQuickValue(values: string[], nextValue: string) {
  return values.includes(nextValue)
    ? values.filter((value) => value !== nextValue)
    : [...values, nextValue]
}

function buildQuickCohortFilters(draft: QuickCohortState): CohortFilter[] {
  const filters: CohortFilter[] = []

  if (draft.membershipStatus.length === 1) {
    filters.push({ field: 'normalizedMembershipStatus', op: 'eq', value: draft.membershipStatus[0] })
  } else if (draft.membershipStatus.length > 1) {
    filters.push({ field: 'normalizedMembershipStatus', op: 'in', value: draft.membershipStatus })
  }

  if (draft.membershipType.length === 1) {
    filters.push({ field: 'normalizedMembershipType', op: 'eq', value: draft.membershipType[0] })
  } else if (draft.membershipType.length > 1) {
    filters.push({ field: 'normalizedMembershipType', op: 'in', value: draft.membershipType })
  }

  if (draft.riskLevel.length === 1) {
    filters.push({ field: 'riskLevel', op: 'eq', value: draft.riskLevel[0] })
  } else if (draft.riskLevel.length > 1) {
    filters.push({ field: 'riskLevel', op: 'in', value: draft.riskLevel })
  }

  const joinedWithinDays = Number(draft.joinedWithinDays)
  if (Number.isFinite(joinedWithinDays) && joinedWithinDays > 0) {
    filters.push({ field: 'joinedDaysAgo', op: 'lte', value: joinedWithinDays })
  }

  const inactiveDays = Number(draft.inactiveDays)
  if (Number.isFinite(inactiveDays) && inactiveDays > 0) {
    filters.push({ field: 'recency', op: 'gte', value: inactiveDays })
  }

  const sessionsPerMonthMin = Number(draft.sessionsPerMonthMin)
  if (Number.isFinite(sessionsPerMonthMin) && sessionsPerMonthMin >= 0) {
    filters.push({ field: 'frequency', op: 'gte', value: sessionsPerMonthMin })
  }

  const sessionsPerMonthMax = Number(draft.sessionsPerMonthMax)
  if (Number.isFinite(sessionsPerMonthMax) && sessionsPerMonthMax >= 0) {
    filters.push({ field: 'frequency', op: 'lte', value: sessionsPerMonthMax })
  }

  return filters
}

function looksLikeRawFilterDescription(description: string | null | undefined) {
  if (!description) return false
  return /(userId|riskLevel|normalizedMembership|joinedDaysAgo|membershipStatus|membershipType|frequency|recency)\s+(eq|in|gte|lte|contains)/i.test(description)
}

function formatCohortFilterSummary(filter: CohortFilter) {
  if (filter.field === 'userId' && filter.op === 'in' && Array.isArray(filter.value)) {
    return `${filter.value.length} hand-picked members`
  }
  if (filter.field === 'joinedDaysAgo' && filter.op === 'lte' && typeof filter.value === 'number') {
    return `Joined in last ${filter.value} days`
  }
  if (filter.field === 'recency' && filter.op === 'gte' && typeof filter.value === 'number') {
    return `Inactive ${filter.value}+ days`
  }
  if (filter.field === 'frequency' && filter.op === 'gte' && typeof filter.value === 'number') {
    return `${filter.value}+ sessions / month`
  }
  if (filter.field === 'frequency' && filter.op === 'lte' && typeof filter.value === 'number') {
    return `Up to ${filter.value} sessions / month`
  }

  const fieldLabel = FILTER_FIELDS.find((entry) => entry.key === filter.field)?.label || filter.field
  return `${fieldLabel} ${OP_LABELS[filter.op]} ${formatCohortFilterValue(filter.field, filter.value)}`
}

function buildReadableCohortDescription(filters: CohortFilter[]) {
  if (filters.length === 0) return ''
  const summaries = filters.map(formatCohortFilterSummary)
  const visible = summaries.slice(0, 3)
  return summaries.length > 3
    ? `${visible.join(' · ')} +${summaries.length - 3} more`
    : visible.join(' · ')
}

function getCohortDisplayDescription(description: string | null | undefined, rawFilters: unknown) {
  if (description && !looksLikeRawFilterDescription(description)) return description
  return buildReadableCohortDescription(parseCohortFilters(rawFilters))
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

    if (fieldDef?.type === 'number' || ['age', 'frequency', 'recency', 'duprRating', 'healthScore', 'joinedDaysAgo'].includes(filter.field)) {
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
  const clubId = params.id as string
  const suggestionDateKey = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const [showCreate, setShowCreate] = useState(false)
  const [selectedCohortId, setSelectedCohortId] = useState<string | null>(null)
  const [campaignCohort, setCampaignCohort] = useState<{ id: string; name: string; filters: any } | null>(null)
  const [activeLookalikeExportKey, setActiveLookalikeExportKey] = useState<string | null>(null)
  const [activeLookalikeSaveKey, setActiveLookalikeSaveKey] = useState<string | null>(null)
  const [selectedLookalikeAudienceKeys, setSelectedLookalikeAudienceKeys] = useState<string[]>([])
  const [lookalikeExportPreset, setLookalikeExportPreset] = useState<LookalikeExportPreset>('generic_csv')

  const { data: cohorts, refetch } = trpc.intelligence.listCohorts.useQuery({ clubId })
  // P3-T2: AI-suggested cohorts (3 generators per D4)
  const { data: suggestedCohorts = [] } = useSuggestedCohorts(clubId)
  const { data: coverage, refetch: refetchCoverage } = trpc.intelligence.getCohortDataCoverage.useQuery({ clubId })
  const { data: smartFirstSessionData } = useSmartFirstSession(clubId, 21, 8)
  const { data: lookalikeExportData } = useLookalikeAudienceExport(clubId)
  const { data: lookalikeExportHistory = [], isLoading: lookalikeExportHistoryLoading } = useLookalikeExportHistory(clubId, 8)
  const { data: smartSuggestionDecisions = [] } = useAdminTodoDecisions(clubId, suggestionDateKey)
  const setAdminTodoDecision = useSetAdminTodoDecision()
  const clearAdminTodoDecisions = useClearAdminTodoDecisions()
  const exportLookalikeAudienceCsv = useExportLookalikeAudienceCsv()
  const deleteMutation = trpc.intelligence.deleteCohort.useMutation({ onSuccess: () => refetch() })
  const createCohortMutation = trpc.intelligence.createCohort.useMutation({ onSuccess: () => refetch() })
  const updateCohortMutation = trpc.intelligence.updateCohort.useMutation({ onSuccess: () => refetch() })

  // P2-T8 follow-up: inline rename. Click pencil → name turns into input;
  // Enter saves, Esc cancels. Only one rename open at a time.
  const [renamingCohortId, setRenamingCohortId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const startRename = (id: string, currentName: string) => {
    setRenamingCohortId(id)
    setRenameDraft(currentName)
  }
  const cancelRename = () => {
    setRenamingCohortId(null)
    setRenameDraft('')
  }
  const commitRename = (cohortId: string) => {
    const trimmed = renameDraft.trim()
    if (!trimmed) { cancelRename(); return }
    updateCohortMutation.mutate({ clubId, cohortId, name: trimmed })
    cancelRename()
  }
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
            Cohorts
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--t3)' }}>
            Create custom member segments for targeted AI campaigns
          </p>
        </div>
        {/* Top-right "Create Cohort" CTA removed — duplicated the in-flow
            "+ Build a custom cohort" tile in Your Cohorts. Single CTA keeps
            the action near context. */}
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

      {/* P3-T2: AI-Suggested Cohorts.
          Three generators (Renewal in 14d, Lost Evening Players,
          New & Engaged) live in lib/ai/cohort-generators/. Sorted by
          $ impact desc; empties hidden. See SPEC §5 P3-T2. */}
      {!showCreate && !selectedCohortId && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4" style={{ color: '#8B5CF6' }} />
            <h2 className="text-base" style={{ fontWeight: 800, color: 'var(--heading)' }}>
              AI-Suggested Cohorts
            </h2>
            <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(139,92,246,0.12)', color: '#A78BFA', fontWeight: 600 }}>
              refreshed daily
            </span>
          </div>
          {suggestedCohorts.length === 0 ? (
            <div
              className="rounded-2xl p-5 text-sm"
              style={{ background: 'var(--card-bg)', border: '1px dashed var(--card-border)', color: 'var(--t3)' }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4" style={{ color: '#8B5CF6' }} />
                <span className="text-xs font-semibold" style={{ color: 'var(--heading)' }}>No suggestions right now</span>
              </div>
              <p className="text-xs leading-relaxed mb-2">
                IQ checks three angles every day: members whose membership expires soon,
                regulars who stopped showing up to evening sessions, and new joiners who
                are engaging fast. None matched today — usually because the club doesn&apos;t
                have enough session history yet, or the underlying data (e.g. membership
                expiry from CSV import) isn&apos;t populated.
              </p>
              <p className="text-[11px]" style={{ color: 'var(--t4)' }}>
                Cards appear here automatically once the data lines up. You can always build a custom cohort below.
              </p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {suggestedCohorts.map((suggestion: any) => (
                <SuggestedCohortCard
                  key={suggestion.id}
                  clubId={clubId}
                  suggestion={suggestion}
                  // P5-T5 fix #5: hand off to Campaign Wizard via
                  // ?cohortId=… on the Campaigns page.
                  onLaunchCampaign={(s) => {
                    router.push(`/clubs/${clubId}/intelligence/campaigns?cohortId=${s.id}`)
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

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

      {/* P3-T6: Your Cohorts — heading + cards + "+ Create empty" tile */}
      {!showCreate && !selectedCohortId && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4" style={{ color: '#06B6D4' }} />
            <h2 className="text-base" style={{ fontWeight: 800, color: 'var(--heading)' }}>
              Your Cohorts
            </h2>
            <span className="text-[11px]" style={{ color: 'var(--t4)' }}>
              {cohorts?.length ?? 0} saved
            </span>
          </div>

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
                  {/* Delete kept on hover only — destructive, don't surface
                      it as a primary affordance. Campaign CTA moves to the
                      bottom row where it's always visible. */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
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
                {/* Title — inline-editable on pencil click */}
                {renamingCohortId === c.id ? (
                  <div className="flex items-center gap-1 mb-1" onClick={(e) => e.stopPropagation()}>
                    <input
                      autoFocus
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename(c.id)
                        else if (e.key === 'Escape') cancelRename()
                      }}
                      className="flex-1 text-base px-2 py-1 rounded-lg outline-none"
                      style={{
                        background: 'var(--subtle)',
                        border: '1px solid var(--card-border)',
                        color: 'var(--heading)',
                        fontWeight: 700,
                      }}
                      maxLength={100}
                      placeholder="Cohort name"
                    />
                    <button
                      onClick={() => commitRename(c.id)}
                      className="p-1.5 rounded-lg hover:bg-emerald-500/10"
                      style={{ color: '#10B981' }}
                      title="Save (Enter)"
                    >
                      <CheckIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={cancelRename}
                      className="p-1.5 rounded-lg hover:bg-red-500/10"
                      style={{ color: 'var(--t4)' }}
                      title="Cancel (Esc)"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-start gap-1.5 mb-1 group/title">
                    <h3 className="text-base flex-1" style={{ fontWeight: 700, color: 'var(--heading)' }}>{c.name}</h3>
                    <button
                      onClick={(e) => { e.stopPropagation(); startRename(c.id, c.name) }}
                      className="p-1 rounded-md transition-opacity opacity-0 group-hover/title:opacity-100 hover:bg-violet-500/10"
                      style={{ color: 'var(--t4)' }}
                      title="Rename cohort"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  </div>
                )}
                {getCohortDisplayDescription(c.description, c.filters) ? (
                  <p className="text-xs mb-3 line-clamp-2" style={{ color: 'var(--t3)' }}>
                    {getCohortDisplayDescription(c.description, c.filters)}
                  </p>
                ) : null}
                <div className="flex items-center gap-1.5 mb-3">
                  <UserCheck className="w-4 h-4" style={{ color: '#8B5CF6' }} />
                  <span className="text-sm" style={{ fontWeight: 700, color: 'var(--heading)' }}>{c.memberCount}</span>
                  <span className="text-xs" style={{ color: 'var(--t4)' }}>members</span>
                </div>
                {/* Filter tags. Frozen userId-IN cohorts (created from a member
                    selection or after Add-to-existing) get a single
                    "N hand-picked members" pill instead of dumping the raw uuid
                    list onto the card. Predicate-based filters render as
                    before. */}
                {(() => {
                  const parsed = parseCohortFilters(c.filters)
                  const handPickedFilter = parsed.find(
                    (f) => f.field === 'userId' && f.op === 'in' && Array.isArray(f.value),
                  )
                  const otherFilters = parsed.filter((f) => f !== handPickedFilter)
                  const handPickedCount = handPickedFilter && Array.isArray(handPickedFilter.value)
                    ? handPickedFilter.value.length
                    : 0
                  return (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {handPickedFilter && (
                        <span
                          className="text-[10px] px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                          style={{ background: 'rgba(245,158,11,0.1)', color: '#F59E0B' }}
                          title="Frozen list — fixed members, no longer re-evaluated against filters"
                        >
                          🔒 {handPickedCount} hand-picked
                        </span>
                      )}
                      {otherFilters.map((f, i) => (
                        <span key={i} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(139,92,246,0.1)', color: '#A78BFA' }}>
                          {FILTER_FIELDS.find((ff) => ff.key === f.field)?.label || f.field} {OP_LABELS[f.op]} {formatCohortFilterValue(f.field, f.value)}
                        </span>
                      ))}
                    </div>
                  )
                })()}
                {/* Always-visible Create campaign CTA + last-edit timestamp.
                    Mirrors the "→ Campaign" affordance on AI-Suggested cards
                    so saved cohorts have the same fast-path. */}
                <div className="flex items-center justify-between gap-2 pt-3" style={{ borderTop: '1px solid var(--card-border)' }}>
                  {(c.updatedAt || c.createdAt) ? (
                    <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--t4)' }}>
                      <Clock className="w-3 h-3" />
                      {new Date(c.updatedAt ?? c.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  ) : <span />}
                  <button
                    onClick={(e) => { e.stopPropagation(); setCampaignCohort({ id: c.id, name: c.name, filters: c.filters }) }}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] transition-all"
                    style={{
                      background: 'rgba(139,92,246,0.12)',
                      color: '#A78BFA',
                      fontWeight: 700,
                      border: '1px solid rgba(139,92,246,0.2)',
                    }}
                  >
                    <Send className="w-3 h-3" />
                    Create campaign
                  </button>
                </div>
              </motion.div>
            ))}

            {/* P3-T6: "+ Create empty" tile at end of list */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => { setShowCreate(true); setSelectedCohortId(null) }}
              className="rounded-2xl p-5 transition-all flex flex-col items-center justify-center gap-2 text-center"
              style={{
                background: 'transparent',
                border: '1px dashed var(--card-border)',
                color: 'var(--t3)',
                minHeight: 180,
              }}
            >
              <Plus className="w-8 h-8" style={{ color: '#8B5CF6' }} />
              <span className="text-sm font-bold" style={{ color: 'var(--heading)' }}>Build a custom cohort</span>
              <span className="text-[11px] leading-relaxed max-w-[180px]" style={{ color: 'var(--t4)' }}>
                Start with quick segments or drop into the advanced rule builder
              </span>
            </motion.button>

            {cohorts?.length === 0 && (
              <div className="col-span-full sm:col-span-1 lg:col-span-2 text-center py-8" style={{ color: 'var(--t4)' }}>
                <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No saved cohorts yet — start with the AI suggestions above or build a custom one →</p>
              </div>
            )}
          </div>
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
  const [mode, setMode] = useState<CohortBuilderMode>('quick')
  const [quickFilters, setQuickFilters] = useState<QuickCohortState>(EMPTY_QUICK_COHORT)
  const [filters, setFilters] = useState<CohortFilter[]>([])
  const [saving, setSaving] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiParsing, setAiParsing] = useState(false)
  const [previewSort, setPreviewSort] = useState<PreviewSort>('alpha')

  const parseMutation = trpc.intelligence.parseCohortFromText.useMutation({
    onSuccess: (data) => {
      if (data.name) setName(data.name)
      if (data.description) setDescription(data.description)
      if (data.filters?.length) {
        setMode('advanced')
        setFilters(data.filters as CohortFilter[])
      }
      setAiPrompt('')
    },
    onSettled: () => setAiParsing(false),
  })

  const handleAiParse = () => {
    if (!aiPrompt.trim()) return
    setAiParsing(true)
    parseMutation.mutate({ clubId, text: aiPrompt.trim() })
  }

  const advancedPreviewFilters = useMemo(() => sanitizeCohortFilters(filters), [filters])
  const quickPreviewFilters = useMemo(() => buildQuickCohortFilters(quickFilters), [quickFilters])
  const effectiveFilters = mode === 'quick' ? quickPreviewFilters : advancedPreviewFilters
  const hasIncompleteFilters = mode === 'advanced' && filters.length > 0 && advancedPreviewFilters.length !== filters.length
  const generatedDescription = useMemo(() => {
    if (mode !== 'quick') return ''
    return buildReadableCohortDescription(quickPreviewFilters)
  }, [mode, quickPreviewFilters])

  const previewQuery = trpc.intelligence.previewCohort.useQuery(
    { clubId, filters: effectiveFilters },
    { enabled: effectiveFilters.length > 0 }
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
    if (!name.trim() || effectiveFilters.length === 0) return
    setSaving(true)
    try {
      await createMutation.mutateAsync({
        clubId,
        name: name.trim(),
        description: description.trim() || generatedDescription || undefined,
        filters: effectiveFilters,
      })
    } finally {
      setSaving(false)
    }
  }

  // P3-T4: "Save + Create campaign →" — saves cohort, then redirects to
  // Campaigns page. When Phase 4 lands the wizard (P4-T1), this will
  // open the wizard pre-filled with the new cohort instead of redirecting.
  const router = useRouter()
  const handleSaveAndCampaign = async () => {
    if (!name.trim() || effectiveFilters.length === 0) return
    setSaving(true)
    try {
      const created = await createMutation.mutateAsync({
        clubId,
        name: name.trim(),
        description: description.trim() || generatedDescription || undefined,
        filters: effectiveFilters,
      })
      // Redirect to Campaigns with cohort pre-selected via query param.
      // Phase 4 wizard will read ?cohortId=<id> on load.
      const cohortId = (created as any)?.id
      router.push(`/clubs/${clubId}/intelligence/campaigns${cohortId ? `?cohortId=${cohortId}` : ''}`)
    } finally {
      setSaving(false)
    }
  }

  const activeFilterSummaries = useMemo(
    () => effectiveFilters.map(formatCohortFilterSummary),
    [effectiveFilters],
  )

  const sortedPreviewMembers = useMemo(() => {
    const members = [...(((previewQuery.data?.sampleMembers || []) as any[]))]
    const riskRank: Record<string, number> = { critical: 4, at_risk: 3, watch: 2, healthy: 1 }
    members.sort((a, b) => {
      if (previewSort === 'risk') {
        return (riskRank[b.riskLevel || ''] || 0) - (riskRank[a.riskLevel || ''] || 0)
          || Number(a.healthScore ?? 999) - Number(b.healthScore ?? 999)
          || String(a.name || '').localeCompare(String(b.name || ''))
      }
      if (previewSort === 'activity') {
        return Number(b.sessionsLast30 ?? 0) - Number(a.sessionsLast30 ?? 0)
          || String(a.name || '').localeCompare(String(b.name || ''))
      }
      if (previewSort === 'newest') {
        return Number(a.joinedDaysAgo ?? 99999) - Number(b.joinedDaysAgo ?? 99999)
          || String(a.name || '').localeCompare(String(b.name || ''))
      }
      if (previewSort === 'inactive') {
        return Number(b.daysSinceLastVisit ?? -1) - Number(a.daysSinceLastVisit ?? -1)
          || String(a.name || '').localeCompare(String(b.name || ''))
      }
      return String(a.name || '').localeCompare(String(b.name || ''))
    })
    return members
  }, [previewQuery.data?.sampleMembers, previewSort])

  const updateQuickFilter = (key: keyof QuickCohortState, value: string | string[]) => {
    setQuickFilters((current) => ({ ...current, [key]: value }))
  }

  const applyPreset = (preset: typeof QUICK_COHORT_PRESETS[number]) => {
    setMode('quick')
    setQuickFilters({ ...EMPTY_QUICK_COHORT, ...preset.state })
    if (!name.trim()) setName(preset.name)
    if (!description.trim()) setDescription(preset.description)
  }

  const renderMultiChipGroup = (
    label: string,
    hint: string,
    options: Array<{ label: string; value: string }>,
    values: string[],
    onToggle: (value: string) => void,
  ) => (
    <div className="space-y-2">
      <div>
        <div className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--t4)', fontWeight: 700 }}>{label}</div>
        {hint ? <p className="text-xs mt-1" style={{ color: 'var(--t3)' }}>{hint}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = values.includes(option.value)
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onToggle(option.value)}
              className="px-3 py-1.5 rounded-full text-xs transition-all"
              style={{
                background: active ? 'rgba(139,92,246,0.16)' : 'var(--subtle)',
                color: active ? '#C4B5FD' : 'var(--t3)',
                border: `1px solid ${active ? 'rgba(139,92,246,0.35)' : 'var(--card-border)'}`,
                fontWeight: active ? 700 : 500,
              }}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )

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

      <div className="inline-flex rounded-2xl p-1" style={{ background: 'var(--subtle)', border: '1px solid var(--card-border)' }}>
        {([
          { key: 'quick', label: 'Quick Cohort' },
          { key: 'advanced', label: 'Advanced Builder' },
        ] as const).map((option) => {
          const active = mode === option.key
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => setMode(option.key)}
              className="px-4 py-2 rounded-xl text-sm transition-all"
              style={{
                background: active ? 'rgba(139,92,246,0.14)' : 'transparent',
                border: `1px solid ${active ? 'rgba(139,92,246,0.28)' : 'transparent'}`,
                color: active ? '#C4B5FD' : 'var(--t3)',
                fontWeight: active ? 700 : 600,
              }}
            >
              {option.label}
            </button>
          )
        })}
      </div>

      {/* AI Natural Language Input */}
      <div className="space-y-2 rounded-2xl p-4" style={{ background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.16)' }}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm" style={{ fontWeight: 700, color: 'var(--heading)' }}>AI assist</div>
          <span className="text-[10px] uppercase tracking-wider" style={{ color: '#A78BFA', fontWeight: 700 }}>Plain English → Rules</span>
        </div>
        <div className="flex gap-2 flex-wrap sm:flex-nowrap">
          <input
            type="text" value={aiPrompt} onChange={e => setAiPrompt(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAiParse()}
            placeholder="e.g. trial members inactive 14+ days, or women 55+ with DUPR 3.0+"
            className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-violet-500/30"
            style={{ background: 'var(--card-bg)', color: 'var(--t1)', border: '1px solid rgba(139,92,246,0.2)' }}
          />
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleAiParse}
            disabled={!aiPrompt.trim() || aiParsing}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm text-white min-w-[108px]"
            style={{ background: 'linear-gradient(135deg, #8B5CF6, #6366F1)', fontWeight: 600, opacity: (!aiPrompt.trim() || aiParsing) ? 0.5 : 1 }}
          >
            {aiParsing ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '✨'} AI
          </motion.button>
        </div>
      </div>
      {parseMutation.error && (
        <p className="text-xs" style={{ color: '#EF4444' }}>{parseMutation.error.message}</p>
      )}

      {/* Name + description */}
      <div className="space-y-3">
        <input
          type="text" value={name} onChange={e => setName(e.target.value)}
          placeholder="Cohort name (e.g. At-Risk VIPs)"
          className="w-full px-4 py-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-violet-500/30"
          style={{ background: 'var(--subtle)', color: 'var(--t1)', border: '1px solid var(--card-border)' }}
        />
        <input
          type="text" value={description} onChange={e => setDescription(e.target.value)}
          placeholder={mode === 'quick' && generatedDescription ? generatedDescription : 'Description (optional)'}
          className="w-full px-4 py-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-violet-500/30"
          style={{ background: 'var(--subtle)', color: 'var(--t1)', border: '1px solid var(--card-border)' }}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_320px] items-start">
        <div className="space-y-5">
          {mode === 'quick' ? (
            <div className="rounded-2xl p-4 space-y-5" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-sm" style={{ fontWeight: 700, color: 'var(--heading)' }}>Quick presets</div>
                  <p className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
                    Start from a common audience, then tune the filters below.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setQuickFilters(EMPTY_QUICK_COHORT)}
                  className="text-xs px-3 py-1.5 rounded-full"
                  style={{ color: 'var(--t3)', border: '1px solid var(--card-border)' }}
                >
                  Clear
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {QUICK_COHORT_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className="px-3 py-1.5 rounded-full text-xs transition-all"
                    style={{ background: 'var(--subtle)', border: '1px solid var(--card-border)', color: 'var(--t2)', fontWeight: 700 }}
                    title={preset.description}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div className="space-y-4 pt-1" style={{ borderTop: '1px solid var(--card-border)' }}>
                <div className="text-sm" style={{ fontWeight: 700, color: 'var(--heading)' }}>Audience</div>
                {renderMultiChipGroup(
                  QUICK_FILTER_COPY.membershipStatus.label,
                  QUICK_FILTER_COPY.membershipStatus.hint,
                  NORMALIZED_MEMBERSHIP_STATUS_OPTIONS,
                  quickFilters.membershipStatus,
                  (value) => updateQuickFilter('membershipStatus', toggleQuickValue(quickFilters.membershipStatus, value)),
                )}
                {renderMultiChipGroup(
                  QUICK_FILTER_COPY.membershipType.label,
                  QUICK_FILTER_COPY.membershipType.hint,
                  NORMALIZED_MEMBERSHIP_TYPE_OPTIONS,
                  quickFilters.membershipType,
                  (value) => updateQuickFilter('membershipType', toggleQuickValue(quickFilters.membershipType, value)),
                )}
                {renderMultiChipGroup(
                  QUICK_FILTER_COPY.riskLevel.label,
                  QUICK_FILTER_COPY.riskLevel.hint,
                  RISK_LEVEL_OPTIONS,
                  quickFilters.riskLevel,
                  (value) => updateQuickFilter('riskLevel', toggleQuickValue(quickFilters.riskLevel, value)),
                )}
              </div>

              <div className="space-y-4 pt-1" style={{ borderTop: '1px solid var(--card-border)' }}>
                <div className="text-sm" style={{ fontWeight: 700, color: 'var(--heading)' }}>Behavior</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1.5">
                    <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--t4)', fontWeight: 700 }}>Joined in last</span>
                    <input
                      type="number"
                      min={0}
                      value={quickFilters.joinedWithinDays}
                      onChange={(e) => updateQuickFilter('joinedWithinDays', e.target.value)}
                      placeholder="Days"
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ background: 'var(--subtle)', color: 'var(--t1)', border: '1px solid var(--card-border)' }}
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--t4)', fontWeight: 700 }}>Inactive for</span>
                    <input
                      type="number"
                      min={0}
                      value={quickFilters.inactiveDays}
                      onChange={(e) => updateQuickFilter('inactiveDays', e.target.value)}
                      placeholder="Days"
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ background: 'var(--subtle)', color: 'var(--t1)', border: '1px solid var(--card-border)' }}
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--t4)', fontWeight: 700 }}>Sessions / month min</span>
                    <input
                      type="number"
                      min={0}
                      value={quickFilters.sessionsPerMonthMin}
                      onChange={(e) => updateQuickFilter('sessionsPerMonthMin', e.target.value)}
                      placeholder="Minimum"
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ background: 'var(--subtle)', color: 'var(--t1)', border: '1px solid var(--card-border)' }}
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--t4)', fontWeight: 700 }}>Sessions / month max</span>
                    <input
                      type="number"
                      min={0}
                      value={quickFilters.sessionsPerMonthMax}
                      onChange={(e) => updateQuickFilter('sessionsPerMonthMax', e.target.value)}
                      placeholder="Maximum"
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ background: 'var(--subtle)', color: 'var(--t1)', border: '1px solid var(--card-border)' }}
                    />
                  </label>
                </div>
                <p className="text-xs" style={{ color: 'var(--t4)' }}>
                  Need city, DUPR, birthday month, or session-specific rules? Switch to Advanced Builder.
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl p-4 space-y-4" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm" style={{ fontWeight: 700, color: 'var(--heading)' }}>Advanced conditions</div>
                  <p className="text-xs mt-1" style={{ color: 'var(--t3)' }}>Use raw fields when quick filters are not enough.</p>
                </div>
                <button onClick={addFilter} className="text-xs flex items-center gap-1" style={{ color: '#8B5CF6', fontWeight: 600 }}>
                  <Plus className="w-3.5 h-3.5" /> Add filter
                </button>
              </div>

              {filters.map((f, i) => {
                const fieldDef = FILTER_FIELDS.find(ff => ff.key === f.field)
                return (
                  <div key={i} className="flex items-center gap-2 p-3 rounded-xl flex-wrap" style={{ background: 'var(--subtle)' }}>
                    <select
                      value={f.field}
                      onChange={e => updateFilter(i, { field: e.target.value as CohortFilterField })}
                      className="px-2 py-1.5 rounded-lg text-xs outline-none"
                      style={{ background: 'var(--card-bg)', color: 'var(--t1)', border: '1px solid var(--card-border)' }}
                    >
                      {FILTER_FIELDS.map(ff => <option key={ff.key} value={ff.key}>{ff.label}</option>)}
                    </select>

                    <select
                      value={f.op}
                      onChange={e => updateFilter(i, { op: e.target.value as FilterOp })}
                      className="px-2 py-1.5 rounded-lg text-xs outline-none"
                      style={{ background: 'var(--card-bg)', color: 'var(--t1)', border: '1px solid var(--card-border)' }}
                    >
                      {(fieldDef?.ops || ['eq']).map(op => <option key={op} value={op}>{OP_LABELS[op]}</option>)}
                    </select>

                    {fieldDef?.type === 'select' ? (
                      <select
                        value={f.value as string}
                        onChange={e => updateFilter(i, { value: e.target.value })}
                        className="flex-1 min-w-[180px] px-2 py-1.5 rounded-lg text-xs outline-none"
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
                        className="flex-1 min-w-[180px] px-2 py-1.5 rounded-lg text-xs outline-none"
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
          )}
        </div>

        <div className="xl:sticky xl:top-5">
          <div className="rounded-2xl p-4 space-y-4" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm" style={{ fontWeight: 700, color: 'var(--heading)' }}>Live Preview</div>
                <p className="text-xs mt-1" style={{ color: 'var(--t3)' }}>{mode === 'quick' ? 'Built from your quick filters.' : 'Uses valid advanced rules only.'}</p>
              </div>
              <Eye className="w-4 h-4" style={{ color: '#8B5CF6' }} />
            </div>

            <div className="rounded-2xl p-4" style={{ background: 'rgba(139,92,246,0.08)' }}>
              <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: '#C4B5FD', fontWeight: 700 }}>Matches</div>
              <div className="text-2xl" style={{ fontWeight: 800, color: 'var(--heading)' }}>
                {effectiveFilters.length === 0
                  ? '—'
                  : previewQuery.isLoading
                    ? '...'
                    : previewQuery.error
                      ? 'Error'
                      : String(previewQuery.data?.count ?? 0)}
              </div>
              <p className="text-xs mt-1" style={{ color: '#DDD6FE' }}>
                {effectiveFilters.length === 0
                  ? 'Add a filter to preview this audience.'
                  : hasIncompleteFilters
                    ? `${advancedPreviewFilters.length} valid filter${advancedPreviewFilters.length === 1 ? '' : 's'} active while you finish the rest.`
                    : 'Updates as you edit.'}
              </p>
            </div>

            {activeFilterSummaries.length > 0 ? (
              <div className="space-y-2">
                <div className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--t4)', fontWeight: 700 }}>Applied filters</div>
                <div className="flex flex-wrap gap-1.5">
                  {activeFilterSummaries.map((summary, index) => (
                    <span key={`${summary}-${index}`} className="text-[10px] px-2 py-1 rounded-full" style={{ background: 'rgba(139,92,246,0.12)', color: '#C4B5FD' }}>
                      {summary}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {previewQuery.error ? (
              <p className="text-xs" style={{ color: '#EF4444' }}>
                {previewQuery.error.message}
              </p>
            ) : null}

            {sortedPreviewMembers.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--t4)', fontWeight: 700 }}>Sample members</div>
                  <select
                    value={previewSort}
                    onChange={(e) => setPreviewSort(e.target.value as PreviewSort)}
                    className="px-2 py-1 rounded-lg text-[11px] outline-none"
                    style={{ background: 'var(--subtle)', color: 'var(--t2)', border: '1px solid var(--card-border)' }}
                  >
                    <option value="alpha">A-Z</option>
                    <option value="risk">Highest risk first</option>
                    <option value="activity">Most active first</option>
                    <option value="newest">Newest first</option>
                    <option value="inactive">Longest inactive first</option>
                  </select>
                </div>

                <div className="space-y-2">
                  {sortedPreviewMembers.map((member: any) => (
                    <div key={member.id} className="rounded-xl p-3" style={{ background: 'var(--subtle)', border: '1px solid rgba(255,255,255,0.03)' }}>
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xs text-white shrink-0"
                          style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)', fontWeight: 700 }}>
                          {(member.name || member.email || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm truncate" style={{ fontWeight: 700, color: 'var(--heading)' }}>{member.name || 'Unnamed'}</div>
                          <div className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--t4)' }}>
                            {[
                              member.riskLevel ? formatCohortFilterValue('riskLevel', member.riskLevel) : null,
                              member.membershipType || formatCohortFilterValue('normalizedMembershipType', member.normalizedMembershipType || ''),
                              member.city,
                            ].filter(Boolean).join(' · ') || member.email || 'Member profile'}
                          </div>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {member.healthScore != null ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.12)', color: '#FCA5A5' }}>
                                Health {member.healthScore}
                              </span>
                            ) : null}
                            {member.sessionsLast30 != null ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(6,182,212,0.12)', color: '#67E8F9' }}>
                                {member.sessionsLast30} in 30d
                              </span>
                            ) : null}
                            {member.daysSinceLastVisit != null ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.12)', color: '#FCD34D' }}>
                                {member.daysSinceLastVisit}d since visit
                              </span>
                            ) : null}
                            {member.joinedDaysAgo != null ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(139,92,246,0.12)', color: '#C4B5FD' }}>
                                Joined {member.joinedDaysAgo}d ago
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {previewQuery.data?.truncated ? (
                  <p className="text-[11px]" style={{ color: 'var(--t4)' }}>
                    Sample only. Save the cohort to inspect the full audience.
                  </p>
                ) : null}
              </div>
            ) : effectiveFilters.length > 0 && !previewQuery.isLoading && !previewQuery.error ? (
              <p className="text-xs" style={{ color: 'var(--t4)' }}>
                No members match these filters yet.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Save */}
      <div className="flex justify-end gap-3 flex-wrap">
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm" style={{ color: 'var(--t3)' }}>Cancel</button>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={handleSave}
          disabled={!name.trim() || effectiveFilters.length === 0 || saving}
          className="px-5 py-2.5 rounded-xl text-sm"
          style={{
            background: 'rgba(139,92,246,0.16)',
            color: '#A78BFA',
            border: '1px solid rgba(139,92,246,0.32)',
            fontWeight: 600,
            opacity: (!name.trim() || effectiveFilters.length === 0 || saving) ? 0.5 : 1,
          }}
        >
          {saving ? 'Creating...' : 'Save Cohort'}
        </motion.button>
        {/* P3-T4: Save + Create campaign bridge.
            v1 redirects to Campaigns page; P4-T1 wizard will open
            pre-filled with the new cohort once the wizard ships. */}
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={handleSaveAndCampaign}
          disabled={!name.trim() || effectiveFilters.length === 0 || saving}
          className="px-5 py-2.5 rounded-xl text-sm text-white flex items-center gap-1.5"
          style={{
            background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)',
            fontWeight: 600,
            opacity: (!name.trim() || effectiveFilters.length === 0 || saving) ? 0.5 : 1,
          }}
        >
          {saving ? 'Creating...' : 'Save + Create Campaign'}
          <ChevronRight className="w-4 h-4" />
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
            {getCohortDisplayDescription(cohort?.description, cohort?.filters) ? (
              <p className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
                {getCohortDisplayDescription(cohort?.description, cohort?.filters)}
              </p>
            ) : null}
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
