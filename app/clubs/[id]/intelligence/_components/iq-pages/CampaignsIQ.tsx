'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { motion } from 'motion/react'
import { AlertTriangle, ArrowRight, CalendarDays, Check, Clock3, Loader2, Plus, Radar, ShieldAlert, ShieldCheck, Sparkles, TestTube2, Users, X } from 'lucide-react'
import { CampaignKPIs } from './campaigns/CampaignKPIs'
import { CampaignChart } from './campaigns/CampaignChart'
import { CampaignList } from './campaigns/CampaignList'
// P1-T5: AutomationBanner removed — equivalent automation status now lives
// in Settings → Automation page (AgentCampaignLayer column 2: Live Rollout).
// Kept commented for traceability:
//   import { AutomationBanner } from './campaigns/AutomationBanner'
import { CampaignCreator } from './campaigns/CampaignCreator'
// P4-T1: New 4-step Campaign Wizard
import { CampaignWizard } from '../CampaignWizard'
// P4-T6: Active Campaigns table (lightweight)
import { ActiveCampaignsTable } from '../ActiveCampaignsTable'
import { CampaignSuggestions } from './campaigns/CampaignSuggestions'
import {
  buildAdvisorContextHref as buildCampaignAdvisorHref,
  buildGuestTrialExecutionContext,
  buildReferralExecutionContext,
} from './shared/growth-context'
import { ReferralCampaignsSection } from './campaigns/ReferralCampaignsSection'
import {
  useAdvisorDrafts,
  useGuestTrialBooking,
  useCampaignDrilldown,
  useAgentDecisionRecords,
  useIntelligenceSettings,
  useOutreachPilotHealth,
  useShadowBackOutreachRolloutAction,
  useSmartFirstSession,
  useWinBackSnapshot,
  useReferralSnapshot,
  useUpdateReferralRewardIssuance,
} from '../../_hooks/use-intelligence'

interface CampaignsIQProps {
  campaignData: any
  campaignListData: any
  variantData?: any
  isLoading: boolean
  campaignListLoading?: boolean
  clubId: string
}

const CAMPAIGN_AGENT_KINDS = new Set([
  'create_campaign',
  'reactivate_members',
  'trial_follow_up',
  'renewal_reactivation',
])

const OUTREACH_MODE_STYLES: Record<string, { label: string; bg: string; color: string }> = {
  disabled: { label: 'Disabled', bg: 'rgba(239,68,68,0.14)', color: '#EF4444' },
  shadow: { label: 'Shadow', bg: 'rgba(245,158,11,0.14)', color: '#F59E0B' },
  live: { label: 'Live', bg: 'rgba(16,185,129,0.14)', color: '#10B981' },
}

const PILOT_HEALTH_STYLES: Record<string, { label: string; bg: string; color: string }> = {
  idle: { label: 'Idle', bg: 'rgba(148,163,184,0.14)', color: '#94A3B8' },
  healthy: { label: 'Healthy', bg: 'rgba(16,185,129,0.14)', color: '#10B981' },
  watch: { label: 'Watch', bg: 'rgba(245,158,11,0.14)', color: '#F59E0B' },
  at_risk: { label: 'At Risk', bg: 'rgba(239,68,68,0.14)', color: '#EF4444' },
}

const GUEST_TRIAL_OFFER_LOOP_STYLES: Record<string, { label: string; bg: string; color: string }> = {
  healthy: { label: 'Healthy', bg: 'rgba(16,185,129,0.14)', color: '#10B981' },
  watch: { label: 'Watch', bg: 'rgba(245,158,11,0.14)', color: '#F59E0B' },
  at_risk: { label: 'At Risk', bg: 'rgba(239,68,68,0.14)', color: '#EF4444' },
}

const WIN_BACK_LANE_STYLES: Record<string, { label: string; bg: string; color: string }> = {
  healthy: { label: 'Healthy', bg: 'rgba(16,185,129,0.14)', color: '#10B981' },
  watch: { label: 'Watch', bg: 'rgba(245,158,11,0.14)', color: '#F59E0B' },
  at_risk: { label: 'At Risk', bg: 'rgba(239,68,68,0.14)', color: '#EF4444' },
}

const DRAFT_STATUS_STYLES: Record<string, { label: string; bg: string; color: string }> = {
  review_ready: { label: 'Review Ready', bg: 'rgba(59,130,246,0.14)', color: '#3B82F6' },
  sandboxed: { label: 'Sandboxed', bg: 'rgba(245,158,11,0.14)', color: '#F59E0B' },
  scheduled: { label: 'Scheduled', bg: 'rgba(99,102,241,0.14)', color: '#6366F1' },
  sent: { label: 'Sent', bg: 'rgba(16,185,129,0.14)', color: '#10B981' },
  blocked: { label: 'Blocked', bg: 'rgba(239,68,68,0.14)', color: '#EF4444' },
  draft_saved: { label: 'Draft Saved', bg: 'rgba(148,163,184,0.14)', color: '#94A3B8' },
}

type CampaignActionKind = 'create_campaign' | 'fill_session' | 'reactivate_members'

function mapCampaignTypeToActionKind(type?: string | null): CampaignActionKind {
  switch (type) {
    case 'SLOT_FILLER':
      return 'fill_session'
    case 'REACTIVATION':
      return 'reactivate_members'
    default:
      return 'create_campaign'
  }
}

function formatCampaignActionKind(kind: CampaignActionKind) {
  switch (kind) {
    case 'fill_session':
      return 'Slot filler'
    case 'reactivate_members':
      return 'Reactivation'
    default:
      return 'Campaign sends'
  }
}

function buildGuestTrialOfferRemediationPrompt(input: {
  stage: 'book_first_visit' | 'protect_first_show_up' | 'convert_to_paid'
  status: 'healthy' | 'watch' | 'at_risk'
  offerName: string
  descriptor: string
  destinationDescriptor?: string | null
  rate: number
  candidateCount: number
  outcomeCount: number
  baseCount: number
}) {
  const isRisky = input.status === 'watch' || input.status === 'at_risk'

  if (input.stage === 'book_first_visit') {
    return {
      label: isRisky ? 'Rework first-visit offer' : 'Refine first-visit play',
      prompt: `Rework the guest/trial first-visit campaign. ${input.offerName} is the current entry offer (${input.descriptor})${input.destinationDescriptor ? ` and routes people through ${input.destinationDescriptor}` : ''}, and booking is at ${input.rate}% (${input.outcomeCount}/${input.baseCount}) with ${input.candidateCount} members still in play. Tighten the offer framing, reduce booking friction, and keep the first version review-ready.`,
    }
  }

  if (input.stage === 'protect_first_show_up') {
    return {
      label: isRisky ? 'Tighten show-up reminder' : 'Refine show-up flow',
      prompt: `Rework the guest/trial first-show-up protection flow. ${input.offerName} is the current reminder anchor (${input.descriptor})${input.destinationDescriptor ? ` and should keep people on ${input.destinationDescriptor}` : ''}, and show-up rate is ${input.rate}% (${input.outcomeCount}/${input.baseCount}) with ${input.candidateCount} members still in play. Improve reminder timing, expectation-setting, and safety copy, then keep the first version review-ready.`,
    }
  }

  return {
    label: isRisky ? 'Rework paid conversion' : 'Refine paid conversion',
    prompt: `Rework the guest/trial paid conversion campaign. ${input.offerName} is the current conversion offer (${input.descriptor})${input.destinationDescriptor ? ` and routes people through ${input.destinationDescriptor}` : ''}, and paid conversion is at ${input.rate}% (${input.outcomeCount}/${input.baseCount}) with ${input.candidateCount} warm members still in play. Tighten the value framing and safest paid next step, then keep the first version review-ready.`,
  }
}

function formatGuestTrialRouteType(destinationType: string) {
  switch (destinationType) {
    case 'schedule':
      return 'Booking route'
    case 'landing_page':
      return 'Landing path'
    case 'external_url':
      return 'External route'
    case 'manual_follow_up':
      return 'Follow-up route'
    default:
      return 'Route'
  }
}

function buildGuestTrialRouteRemediationPrompt(input: {
  destinationType: string
  destinationDescriptor: string
  stages: Array<'book_first_visit' | 'protect_first_show_up' | 'convert_to_paid'>
  offerNames: string[]
  status: 'healthy' | 'watch' | 'at_risk'
  rate: number
  candidateCount: number
  outcomeCount: number
  baseCount: number
}) {
  const isRisky = input.status === 'watch' || input.status === 'at_risk'
  const stageSummary = input.stages.map((stage) => {
    if (stage === 'book_first_visit') return 'first-visit booking'
    if (stage === 'protect_first_show_up') return 'first-show protection'
    return 'paid conversion'
  }).join(', ')
  const offerSummary = input.offerNames.join(', ')

  if (input.destinationType === 'schedule') {
    return {
      label: isRisky ? 'Tighten booking route' : 'Refine booking route',
      prompt: `Rework the guest/trial booking route. ${input.destinationDescriptor} currently carries ${stageSummary} via ${offerSummary}, and the combined stage rate is ${input.rate}% (${input.outcomeCount}/${input.baseCount}) with ${input.candidateCount} members still in play. Reduce booking friction, simplify the next step, and keep the first version review-ready.`,
    }
  }

  if (input.destinationType === 'manual_follow_up') {
    return {
      label: isRisky ? 'Tighten follow-up route' : 'Refine follow-up route',
      prompt: `Rework the guest/trial follow-up route. ${input.destinationDescriptor} currently carries ${stageSummary} via ${offerSummary}, and the combined stage rate is ${input.rate}% (${input.outcomeCount}/${input.baseCount}) with ${input.candidateCount} members still in play. Improve the reminder handoff, reduce ambiguity, and keep the first version review-ready.`,
    }
  }

  if (input.destinationType === 'external_url') {
    return {
      label: isRisky ? 'Rework external route' : 'Refine external route',
      prompt: `Rework the guest/trial external route. ${input.destinationDescriptor} currently carries ${stageSummary} via ${offerSummary}, and the combined stage rate is ${input.rate}% (${input.outcomeCount}/${input.baseCount}) with ${input.candidateCount} members still in play. Reduce off-site friction, improve message-to-CTA continuity, and keep the first draft review-ready.`,
    }
  }

  return {
    label: isRisky ? 'Rework landing path' : 'Refine landing path',
    prompt: `Rework the guest/trial landing path. ${input.destinationDescriptor} currently carries ${stageSummary} via ${offerSummary}, and the combined stage rate is ${input.rate}% (${input.outcomeCount}/${input.baseCount}) with ${input.candidateCount} members still in play. Tighten the offer-to-CTA handoff and keep the first version review-ready.`,
  }
}

function buildWinBackLaneRemediationPrompt(input: {
  stage: 'expired_membership' | 'cancelled_membership' | 'high_value_lapsed'
  status: 'healthy' | 'watch' | 'at_risk'
  title: string
  rate: number
  candidateCount: number
  outcomeCount: number
  baseCount: number
}) {
  const isRisky = input.status === 'watch' || input.status === 'at_risk'

  if (input.stage === 'expired_membership') {
    return {
      label: isRisky ? 'Rework renewal rescue' : 'Refine renewal rescue',
      prompt: `Rework the expired-membership renewal rescue. The "${input.title}" lane is running at ${input.rate}% (${input.outcomeCount}/${input.baseCount}) with ${input.candidateCount} members in scope. Tighten the renewal framing, reduce friction, and keep the first version review-ready.`,
    }
  }

  if (input.stage === 'cancelled_membership') {
    return {
      label: isRisky ? 'Rework cancelled comeback' : 'Refine cancelled comeback',
      prompt: `Rework the cancelled-member comeback motion. The "${input.title}" lane is running at ${input.rate}% (${input.outcomeCount}/${input.baseCount}) with ${input.candidateCount} members in scope. Soften the tone, lower commitment friction, and keep the first version review-ready.`,
    }
  }

  return {
    label: isRisky ? 'Rework high-value save' : 'Refine high-value save',
    prompt: `Rework the high-value lapsed save campaign. The "${input.title}" lane is running at ${input.rate}% (${input.outcomeCount}/${input.baseCount}) with ${input.candidateCount} members in scope. Increase personalization and comeback specificity, then keep the first draft review-ready.`,
  }
}

function formatReferralLaneLabel(lane?: string | null) {
  if (lane === 'vip_advocate') return 'VIP advocate'
  if (lane === 'social_regular') return 'Social regular'
  if (lane === 'dormant_advocate') return 'Dormant advocate'
  return 'Referral lane'
}

function formatRelativeTime(value?: string | null) {
  if (!value) return 'Just updated'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const diffMs = Date.now() - date.getTime()
  const diffH = Math.floor(diffMs / 3600000)
  const diffD = Math.floor(diffMs / 86400000)

  if (diffH < 1) return 'Just now'
  if (diffH < 24) return `${diffH}h ago`
  if (diffD < 7) return `${diffD}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatCampaignDraftKind(kind?: string | null) {
  switch (kind) {
    case 'create_campaign':
      return 'Campaign'
    case 'reactivate_members':
      return 'Reactivation'
    case 'trial_follow_up':
      return 'Trial Follow-Up'
    case 'renewal_reactivation':
      return 'Renewal Rescue'
    default:
      return 'Advisor Draft'
  }
}

function formatCampaignActivityType(type?: string | null) {
  if (!type) return 'Campaign'
  if (type === 'SLOT_FILLER') return 'Slot filler'
  if (type === 'REACTIVATION') return 'Reactivation'
  return String(type)
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatCampaignActivityStatus(status?: string | null) {
  if (!status) return 'Unknown'
  return String(status)
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatGuestTrialActivityStage(stage?: string | null) {
  if (stage === 'book_first_visit') return 'First visit'
  if (stage === 'protect_first_show_up') return 'Show-up'
  if (stage === 'convert_to_paid') return 'Paid'
  return 'Guest / trial'
}

function matchesDraftText(draft: any, patterns: string[]) {
  const text = `${draft?.title || ''} ${draft?.summary || ''} ${draft?.originalIntent || ''}`.toLowerCase()
  return patterns.some((pattern) => text.includes(pattern))
}

export function CampaignsIQ({ campaignData, campaignListData, variantData, isLoading, campaignListLoading = false, clubId }: CampaignsIQProps) {
  const [showCreator, setShowCreator] = useState(false)
  const [initialType, setInitialType] = useState<string | null>(null)
  // P4-T7: Campaign Wizard drawer (replaces "+ New Campaign" entry).
  const [showWizard, setShowWizard] = useState(false)
  // P5-T5 fix #5: read ?cohortId= from URL (set by Cohort Builder's
  // "Save + Create Campaign →" handoff or by AI-Suggested → Campaign).
  // Open the wizard once with the cohort pre-selected, then strip the
  // param so refresh doesn't reopen the wizard unexpectedly.
  const wizardSearchParams = useSearchParams()
  const wizardRouter = useRouter()
  const wizardPathname = usePathname()
  const [wizardInitialCohortId, setWizardInitialCohortId] = useState<string | null>(null)
  useEffect(() => {
    const cohortIdFromUrl = wizardSearchParams?.get('cohortId') ?? null
    if (cohortIdFromUrl && !showWizard) {
      setWizardInitialCohortId(cohortIdFromUrl)
      setShowWizard(true)
      // Strip the param after we've consumed it.
      if (wizardPathname) {
        const next = new URLSearchParams(wizardSearchParams.toString())
        next.delete('cohortId')
        const qs = next.toString()
        wizardRouter.replace(qs ? `${wizardPathname}?${qs}` : wizardPathname, { scroll: false })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizardSearchParams])
  const [selectedCampaign, setSelectedCampaign] = useState<{ id: string; type: string; date: string; name?: string | null } | null>(null)
  const [activityOfferFilter, setActivityOfferFilter] = useState<string>('all')
  const [activityRouteFilter, setActivityRouteFilter] = useState<string>('all')
  const [activityReferralOfferFilter, setActivityReferralOfferFilter] = useState<string>('all')
  const [activityReferralLaneFilter, setActivityReferralLaneFilter] = useState<string>('all')
  const [activityReferralRouteFilter, setActivityReferralRouteFilter] = useState<string>('all')
  const [activeReferralRewardIssuanceKey, setActiveReferralRewardIssuanceKey] = useState<string | null>(null)
  const [loadSecondaryInsights, setLoadSecondaryInsights] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setLoadSecondaryInsights(true), 250)
    return () => window.clearTimeout(timer)
  }, [])
  const { data: advisorDrafts = [] } = useAdvisorDrafts(clubId, 24, { enabled: loadSecondaryInsights })
  const { data: settingsData } = useIntelligenceSettings(clubId, { enabled: loadSecondaryInsights })
  const { data: pilotHealth } = useOutreachPilotHealth(clubId, 14, { enabled: loadSecondaryInsights })
  const { data: smartFirstSessionData } = useSmartFirstSession(clubId, 21, 8, { enabled: loadSecondaryInsights })
  const { data: guestTrialBookingData } = useGuestTrialBooking(clubId, 21, 8, { enabled: loadSecondaryInsights })
  const { data: winBackSnapshot } = useWinBackSnapshot(clubId, 60, 8, { enabled: loadSecondaryInsights })
  const { data: referralSnapshot } = useReferralSnapshot(clubId, 60, 8, { enabled: loadSecondaryInsights })
  const { data: campaignDrilldown, isLoading: isCampaignDrilldownLoading } = useCampaignDrilldown(
    clubId,
    selectedCampaign?.type || null,
    selectedCampaign?.date || null,
  )
  const { data: decisionRecords = [] } = useAgentDecisionRecords(clubId, 12, { enabled: loadSecondaryInsights })
  const shadowBackOutreachRolloutAction = useShadowBackOutreachRolloutAction()
  const updateReferralRewardIssuance = useUpdateReferralRewardIssuance()

  const summary = campaignData?.summary
  const byDay = campaignData?.byDay
  const recentActivityLogs = campaignData?.recentLogs ?? []
  const topActivityGuestTrialOffers = campaignData?.topGuestTrialOffers ?? []
  const topActivityGuestTrialRoutes = campaignData?.topGuestTrialRoutes ?? []
  const topActivityReferralOffers = campaignData?.topReferralOffers ?? []
  const topActivityReferralLanes = campaignData?.topReferralLanes ?? []
  const topActivityReferralRoutes = campaignData?.topReferralRoutes ?? []
  const topActivityReferredGuestSources = campaignData?.topReferredGuestSources ?? []
  const topActivityReferredGuestRoutes = campaignData?.topReferredGuestRoutes ?? []
  const campaigns = campaignListData?.campaigns ?? []
  const intelligenceSettings = settingsData?.settings
  const outreachMode = intelligenceSettings?.controlPlane?.actions?.outreachSend?.mode ?? 'shadow'
  const outreachModeStyle = OUTREACH_MODE_STYLES[outreachMode] || OUTREACH_MODE_STYLES.shadow
  const rolloutStatus = settingsData?.outreachRolloutStatus
  const pilotStyle = PILOT_HEALTH_STYLES[pilotHealth?.health || 'idle'] || PILOT_HEALTH_STYLES.idle

  const campaignDrafts = advisorDrafts.filter((draft: any) => CAMPAIGN_AGENT_KINDS.has(draft.kind))
  const guestTrialSummary = guestTrialBookingData?.summary || null
  const guestTrialFunnel = guestTrialSummary?.funnel || null
  const guestTrialOffers = guestTrialSummary?.offers || null
  const guestTrialOfferLoop = guestTrialSummary?.offerLoop || []
  const guestTrialRouteLoop = guestTrialSummary?.routeLoop || []
  const smartFirstSessionSummary = smartFirstSessionData?.summary || null
  const smartFirstSessionFunnel = smartFirstSessionSummary?.funnel || null
  const winBackSummary = winBackSnapshot?.summary || null
  const winBackFunnel = winBackSummary?.funnel || null
  const winBackLaneLoop = winBackSummary?.laneLoop || []
  const referralSummary = referralSnapshot?.summary || null
  const referralOffers = referralSummary?.offers || null
  const referralFunnel = referralSummary?.funnel || null
  const referralOutcomeFunnel = referralSummary?.outcomeFunnel || null
  const referralLaneLoop = referralSummary?.laneLoop || []
  const referralOfferLoop = referralSummary?.offerLoop || []
  const referralRouteLoop = referralSummary?.routeLoop || []
  const referralOutcomeLoop = referralSummary?.outcomeLoop || []
  const referralRewardLoop = referralSummary?.rewardLoop || []
  const referralRewardSummary = referralSummary?.rewardSummary || ''
  const referralRewardIssuanceSummary = referralSummary?.rewardIssuance || null
  const referralReferredGuestFunnel = referralSummary?.referredGuestFunnel || null
  const referralReferredGuests = referralSnapshot?.referredGuests || []
  const referralRewardIssuances = referralSnapshot?.rewardIssuances || []
  const referralRewardLedger = referralSnapshot?.rewardLedger || []
  const referralHasLiveTracking = Boolean(
    (referralOutcomeFunnel?.askCount || 0) > 0
      || referralRewardLoop.length > 0
      || referralRewardIssuances.length > 0
      || (referralReferredGuestFunnel?.capturedCount || 0) > 0,
  )
  const filteredRecentActivity = recentActivityLogs.filter((log: any) => {
    const offerMatch = activityOfferFilter === 'all' || log.guestTrialOfferKey === activityOfferFilter
    const routeMatch = activityRouteFilter === 'all' || log.guestTrialRouteKey === activityRouteFilter
    const referralOfferMatch = activityReferralOfferFilter === 'all' || log.referralOfferKey === activityReferralOfferFilter
    const referralLaneMatch = activityReferralLaneFilter === 'all' || log.referralOfferLane === activityReferralLaneFilter
    const referralRouteMatch = activityReferralRouteFilter === 'all' || log.referralRouteKey === activityReferralRouteFilter
    return offerMatch && routeMatch && referralOfferMatch && referralLaneMatch && referralRouteMatch
  })
  const visibleRecentActivity = filteredRecentActivity.slice(0, 8)

  const reviewReadyDrafts = campaignDrafts.filter((draft: any) => draft.status === 'review_ready')
  const sandboxedDrafts = campaignDrafts.filter((draft: any) => draft.status === 'sandboxed' || draft.sandboxMode)
  const scheduledDrafts = campaignDrafts.filter((draft: any) => draft.status === 'scheduled')
  const blockedDrafts = campaignDrafts.filter((draft: any) => draft.status === 'blocked')
  const latestDrafts = [...reviewReadyDrafts, ...sandboxedDrafts, ...scheduledDrafts].slice(0, 3)

  const recentOutreachDecisions = decisionRecords.filter((record: any) => record.action === 'outreachSend')
  const rolloutFriction = recentOutreachDecisions.filter(
    (record: any) => record.result === 'blocked' || record.result === 'shadowed',
  )
  const firstBookingDrafts = campaignDrafts.filter((draft: any) => draft.kind === 'trial_follow_up')
  const guestTrialFirstVisitDrafts = campaignDrafts.filter((draft: any) => (
    draft.kind === 'trial_follow_up'
    || matchesDraftText(draft, ['first visit', 'first booking', 'trial booking', 'guest booking', 'book the first visit'])
  ))
  const guestTrialShowUpDrafts = campaignDrafts.filter((draft: any) => (
    ['trial_follow_up', 'create_campaign'].includes(draft.kind)
    && matchesDraftText(draft, ['show-up', 'show up', 'no-show', 'no show', 'booking reminder', 'protect first'])
  ))
  const guestTrialPaidDrafts = campaignDrafts.filter((draft: any) => (
    ['trial_follow_up', 'create_campaign'].includes(draft.kind)
    && matchesDraftText(draft, ['guest conversion', 'guest-to-paid', 'trial conversion', 'convert to paid', 'paid next step'])
  ))
  const secondSessionDrafts = campaignDrafts.filter((draft: any) => (
    draft.kind === 'create_campaign'
    && matchesDraftText(draft, ['second session', 'newcomer habit', 'first session momentum', 'booked once'])
  ))
  const conversionDrafts = campaignDrafts.filter((draft: any) => (
    draft.kind === 'create_campaign'
    && matchesDraftText(draft, ['guest conversion', 'convert guests', 'trial conversion', 'guest-to-paid', 'paid next step'])
  ))
  const expiredWinBackDrafts = campaignDrafts.filter((draft: any) => (
    (draft.kind === 'renewal_reactivation' || draft.kind === 'reactivate_members')
    && matchesDraftText(draft, ['expired', 'renewal', 'renew'])
  ))
  const cancelledWinBackDrafts = campaignDrafts.filter((draft: any) => (
    draft.kind === 'reactivate_members'
    && matchesDraftText(draft, ['cancelled', 'canceled', 'come back', 'win-back'])
  ))
  const lapsedWinBackDrafts = campaignDrafts.filter((draft: any) => (
    ['reactivate_members', 'create_campaign'].includes(draft.kind)
    && matchesDraftText(draft, ['lapsed', 'drifting', 'inactive', 'high-value', 'quiet'])
  ))
  const vipReferralDrafts = campaignDrafts.filter((draft: any) => (
    draft.kind === 'create_campaign'
    && matchesDraftText(draft, ['referral', 'bring a friend', 'vip advocate', 'invite a friend', 'plus one'])
  ))
  const socialReferralDrafts = campaignDrafts.filter((draft: any) => (
    draft.kind === 'create_campaign'
    && matchesDraftText(draft, ['referral', 'social regular', 'friend invite', 'bring a friend', 'co-player'])
  ))
  const dormantReferralDrafts = campaignDrafts.filter((draft: any) => (
    draft.kind === 'create_campaign'
    && matchesDraftText(draft, ['dormant advocate', 'restart advocates', 'reignite advocates', 'referral restart'])
  ))

  const smartFirstSessionPlays = smartFirstSessionSummary
    ? [
        smartFirstSessionSummary.firstBookingCount > 0 ? {
          key: 'first-booking',
          title: 'Book the first session',
          count: smartFirstSessionSummary.firstBookingCount,
          draftCount: firstBookingDrafts.length,
          description: 'Turn fresh trials and guests into their first confirmed booking before signup momentum cools off.',
          href: buildCampaignAdvisorHref(clubId, {
            prompt: `Draft a first-booking outreach plan for ${smartFirstSessionSummary.firstBookingCount} newcomer members who still have no confirmed first session. Prioritize trial and guest members, recommend the safest beginner-friendly session, and keep the first version review-ready.`,
          }),
          tone: { bg: 'rgba(6,182,212,0.10)', border: 'rgba(6,182,212,0.22)', color: '#06B6D4' },
        } : null,
        smartFirstSessionSummary.secondSessionCount > 0 ? {
          key: 'second-session',
          title: 'Lock in the second session',
          count: smartFirstSessionSummary.secondSessionCount,
          draftCount: secondSessionDrafts.length,
          description: 'Catch newcomers who only booked once and move them toward early habit before they drift away.',
          href: buildCampaignAdvisorHref(clubId, {
            prompt: `Draft a second-session follow-up for ${smartFirstSessionSummary.secondSessionCount} newcomer members who only have one confirmed booking. Focus on habit-building, reduce friction, and keep it as a review-ready draft first.`,
          }),
          tone: { bg: 'rgba(139,92,246,0.10)', border: 'rgba(139,92,246,0.22)', color: '#8B5CF6' },
        } : null,
        smartFirstSessionSummary.conversionReadyCount > 0 ? {
          key: 'paid-conversion',
          title: 'Convert to paid after first play',
          count: smartFirstSessionSummary.conversionReadyCount,
          draftCount: conversionDrafts.length,
          description: 'Move guests and trials who already tasted the club into the easiest next paid membership step.',
          href: buildCampaignAdvisorHref(clubId, {
            prompt: `Draft a guest-to-paid conversion campaign for ${smartFirstSessionSummary.conversionReadyCount} newcomer members who already booked their first session and are ready for a paid next step. Recommend the safest offer and keep it review-ready first.`,
          }),
          tone: { bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.22)', color: '#10B981' },
        } : null,
      ].filter(Boolean)
    : []
  const guestTrialPlays = guestTrialSummary
    ? [
        guestTrialSummary.firstBookingCount > 0 ? {
          key: 'guest-trial-first-visit',
          title: 'Book the first visit',
          count: guestTrialSummary.firstBookingCount,
          draftCount: guestTrialFirstVisitDrafts.length,
          descriptor: guestTrialOffers?.firstVisit?.descriptor || null,
          description: `Turn fresh guests and trial members into their first confirmed session before the onboarding window cools off.${guestTrialOffers?.firstVisit ? ` Lead with ${guestTrialOffers.firstVisit.descriptor} via ${guestTrialOffers.firstVisit.destinationDescriptor}.` : ''}`,
          href: buildCampaignAdvisorHref(clubId, {
            prompt: `Draft a guest and trial first-booking campaign for ${guestTrialSummary.firstBookingCount} members who still have no confirmed first visit.${guestTrialOffers?.firstVisit ? ` Use ${guestTrialOffers.firstVisit.descriptor} as the default entry offer and route them through ${guestTrialOffers.firstVisit.destinationDescriptor}.` : ''} Keep the first version review-ready and focus on the easiest beginner-friendly session.`,
            guestTrialContext: buildGuestTrialExecutionContext({
              stage: 'book_first_visit',
              offer: guestTrialOffers?.firstVisit || null,
            }),
          }),
          tone: { bg: 'rgba(6,182,212,0.10)', border: 'rgba(6,182,212,0.22)', color: '#06B6D4' },
        } : null,
        guestTrialSummary.showUpProtectionCount > 0 ? {
          key: 'guest-trial-show-up',
          title: 'Protect the first show-up',
          count: guestTrialSummary.showUpProtectionCount,
          draftCount: guestTrialShowUpDrafts.length,
          descriptor: guestTrialOffers?.showUpProtection?.descriptor || null,
          description: `Support guests and trials who booked once but still have not actually shown up to the club.${guestTrialOffers?.showUpProtection ? ` Anchor the reminder around ${guestTrialOffers.showUpProtection.name} through ${guestTrialOffers.showUpProtection.destinationDescriptor}.` : ''}`,
          href: buildCampaignAdvisorHref(clubId, {
            prompt: `Draft a first show-up protection flow for ${guestTrialSummary.showUpProtectionCount} guest or trial members who already booked but have not played yet.${guestTrialOffers?.showUpProtection ? ` Reinforce ${guestTrialOffers.showUpProtection.descriptor} in the reminder and route them through ${guestTrialOffers.showUpProtection.destinationDescriptor}.` : ''} Reduce no-show risk, keep it gentle, and keep the first version review-ready.`,
            guestTrialContext: buildGuestTrialExecutionContext({
              stage: 'protect_first_show_up',
              offer: guestTrialOffers?.showUpProtection || null,
            }),
          }),
          tone: { bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.22)', color: '#F59E0B' },
        } : null,
        guestTrialSummary.paidConversionCount > 0 ? {
          key: 'guest-trial-paid',
          title: 'Convert to the first paid tier',
          count: guestTrialSummary.paidConversionCount,
          draftCount: guestTrialPaidDrafts.length,
          descriptor: guestTrialOffers?.paidConversion?.descriptor || null,
          description: `Offer a clean paid next step once the guest or trial member has already shown up and tasted the club.${guestTrialOffers?.paidConversion ? ` Use ${guestTrialOffers.paidConversion.descriptor} via ${guestTrialOffers.paidConversion.destinationDescriptor}.` : ''}`,
          href: buildCampaignAdvisorHref(clubId, {
            prompt: `Draft a guest/trial to paid conversion campaign for ${guestTrialSummary.paidConversionCount} members who already showed up for at least one session.${guestTrialOffers?.paidConversion ? ` Use ${guestTrialOffers.paidConversion.descriptor} as the default next paid step and route them through ${guestTrialOffers.paidConversion.destinationDescriptor}.` : ''} Recommend the safest next paid step and keep the draft review-ready first.`,
            guestTrialContext: buildGuestTrialExecutionContext({
              stage: 'convert_to_paid',
              offer: guestTrialOffers?.paidConversion || null,
            }),
          }),
          tone: { bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.22)', color: '#10B981' },
        } : null,
      ].filter(Boolean)
    : []
  const winBackPlays = winBackSummary
    ? [
        winBackSummary.expiredCount > 0 ? {
          key: 'expired-renewal',
          title: 'Bring back expired members',
          count: winBackSummary.expiredCount,
          draftCount: expiredWinBackDrafts.length,
          description: 'Catch recently active members whose membership expired before the renewal window goes cold.',
          href: buildCampaignAdvisorHref(clubId, {
            prompt: `Draft a renewal rescue campaign for ${winBackSummary.expiredCount} recently active members whose membership is expired. Keep it review-ready first and segment the copy for the warmest candidates.`,
          }),
          tone: { bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.22)', color: '#EF4444' },
        } : null,
        winBackSummary.cancelledCount > 0 ? {
          key: 'cancelled-comeback',
          title: 'Rescue recently cancelled',
          count: winBackSummary.cancelledCount,
          draftCount: cancelledWinBackDrafts.length,
          description: 'Use a softer comeback play for members who actively cancelled but still have recent club context.',
          href: buildCampaignAdvisorHref(clubId, {
            prompt: `Draft a comeback campaign for ${winBackSummary.cancelledCount} recently cancelled members. Keep the tone empathetic, reduce friction, and show me the safest review-ready version first.`,
          }),
          tone: { bg: 'rgba(249,115,22,0.10)', border: 'rgba(249,115,22,0.22)', color: '#F97316' },
        } : null,
        winBackSummary.lapsedCount > 0 ? {
          key: 'lapsed-high-value',
          title: 'Restart high-value lapsed',
          count: winBackSummary.lapsedCount,
          draftCount: lapsedWinBackDrafts.length,
          description: 'Prioritize members with real historical value who have gone quiet without formally churning.',
          href: buildCampaignAdvisorHref(clubId, {
            prompt: `Draft a high-value lapsed member win-back campaign for ${winBackSummary.lapsedCount} members who used to play regularly but have gone quiet. Personalize the comeback angle and keep it draft-only for review.`,
          }),
          tone: { bg: 'rgba(139,92,246,0.10)', border: 'rgba(139,92,246,0.22)', color: '#8B5CF6' },
        } : null,
      ].filter(Boolean)
    : []
  const referralPlays = referralSummary
    ? [
        referralSummary.vipAdvocateCount > 0 ? {
          key: 'vip-advocates',
          title: 'Activate VIP advocates',
          count: referralSummary.vipAdvocateCount,
          draftCount: vipReferralDrafts.length,
          description: `Ask the strongest high-trust members to bring a friend while their social rhythm is still active.${referralOffers?.vipAdvocate ? ` Lead with ${referralOffers.vipAdvocate.descriptor} via ${referralOffers.vipAdvocate.destinationDescriptor}.` : ''}`,
          href: buildCampaignAdvisorHref(clubId, {
            prompt: `Draft a VIP advocate referral campaign for ${referralSummary.vipAdvocateCount} high-trust members.${referralOffers?.vipAdvocate ? ` Use ${referralOffers.vipAdvocate.descriptor} as the lead motion and route invites through ${referralOffers.vipAdvocate.destinationDescriptor}.` : ''} Keep the ask premium, low-friction, and review-ready first.`,
            referralContext: buildReferralExecutionContext({
              lane: 'vip_advocate',
              offer: referralOffers?.vipAdvocate || null,
            }),
          }),
          tone: { bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.22)', color: '#F59E0B' },
        } : null,
        referralSummary.socialRegularCount > 0 ? {
          key: 'social-regulars',
          title: 'Ask social regulars to bring a friend',
          count: referralSummary.socialRegularCount,
          draftCount: socialReferralDrafts.length,
          description: `Turn active social regulars into simple bring-a-friend campaigns without over-engineering the ask.${referralOffers?.socialRegular ? ` Use ${referralOffers.socialRegular.descriptor} via ${referralOffers.socialRegular.destinationDescriptor}.` : ''}`,
          href: buildCampaignAdvisorHref(clubId, {
            prompt: `Draft a social regular referral campaign for ${referralSummary.socialRegularCount} active members with strong co-player patterns.${referralOffers?.socialRegular ? ` Use ${referralOffers.socialRegular.descriptor} and route invites through ${referralOffers.socialRegular.destinationDescriptor}.` : ''} Keep the friend-invite ask simple, safe, and review-ready first.`,
            referralContext: buildReferralExecutionContext({
              lane: 'social_regular',
              offer: referralOffers?.socialRegular || null,
            }),
          }),
          tone: { bg: 'rgba(6,182,212,0.10)', border: 'rgba(6,182,212,0.22)', color: '#06B6D4' },
        } : null,
        referralSummary.dormantAdvocateCount > 0 ? {
          key: 'dormant-advocates',
          title: 'Reignite dormant advocates first',
          count: referralSummary.dormantAdvocateCount,
          draftCount: dormantReferralDrafts.length,
          description: `Restart socially valuable members before turning the comeback motion into a referral ask.${referralOffers?.dormantAdvocate ? ` Use ${referralOffers.dormantAdvocate.descriptor} via ${referralOffers.dormantAdvocate.destinationDescriptor}.` : ''}`,
          href: buildCampaignAdvisorHref(clubId, {
            prompt: `Draft a dormant advocate restart campaign for ${referralSummary.dormantAdvocateCount} socially-connected members who have gone quiet.${referralOffers?.dormantAdvocate ? ` Use ${referralOffers.dormantAdvocate.descriptor} and route the comeback invite through ${referralOffers.dormantAdvocate.destinationDescriptor}.` : ''} Rebuild the relationship first and stage the referral ask carefully, keeping the first version review-ready.`,
            referralContext: buildReferralExecutionContext({
              lane: 'dormant_advocate',
              offer: referralOffers?.dormantAdvocate || null,
            }),
          }),
          tone: { bg: 'rgba(139,92,246,0.10)', border: 'rgba(139,92,246,0.22)', color: '#8B5CF6' },
        } : null,
      ].filter(Boolean)
    : []

  // P5-T5: dead-code removed — `quickActions` IIFE used to feed the
  // "Agent Quick Starts" JSX block that P1-T4 deleted. The lookups it
  // performs (reviewReadyDrafts[0], pilotHealth.recommendation, etc.)
  // are still computed above for the AC Layer in Settings → Automation.

  const selectedCampaignName = selectedCampaign?.name || campaignDrilldown?.campaign?.name || 'Campaign'
  const selectedActionKind = selectedCampaign ? mapCampaignTypeToActionKind(selectedCampaign.type) : null
  const selectedPilotAction = selectedActionKind
    ? pilotHealth?.actions?.find((action: any) => action.actionKind === selectedActionKind) || null
    : null
  const canManageRollout = settingsData?.clubRole === 'ADMIN'
  const isShadowBackPending = !!selectedActionKind && shadowBackOutreachRolloutAction.isPending
  const topVariant = campaignDrilldown?.topVariants?.[0] || null
  const topSource = campaignDrilldown?.topSources?.[0] || null

  const handleShadowBackFromDrilldown = () => {
    if (!selectedActionKind) return

    shadowBackOutreachRolloutAction.mutate({
      clubId,
      actionKind: selectedActionKind,
      reason: `Campaign drilldown flagged ${selectedCampaignName} for remediation after ${campaignDrilldown?.campaign?.failed || 0} failed and ${campaignDrilldown?.campaign?.bounced || 0} bounced outcomes.`,
    })
  }

  const handleReferralRewardIssuanceUpdate = async (issuance: any, status: 'ready_issue' | 'on_hold' | 'issued') => {
    setActiveReferralRewardIssuanceKey(issuance.key)
    try {
      await updateReferralRewardIssuance.mutateAsync({
        clubId,
        advocateUserId: issuance.advocateUserId,
        referredGuestUserId: issuance.referredGuestUserId,
        offerKey: issuance.offerKey,
        lane: issuance.lane,
        offerName: issuance.offerName,
        rewardLabel: issuance.rewardLabel,
        status,
        metadata: {
          advocateName: issuance.advocateName,
          advocateEmail: issuance.advocateEmail,
          referredGuestName: issuance.referredGuestName,
          referredGuestEmail: issuance.referredGuestEmail,
          destinationDescriptor: issuance.destinationDescriptor,
        },
      })
    } finally {
      setActiveReferralRewardIssuanceKey(null)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5 max-w-[1400px] mx-auto">
      {/* P1-T5: AutomationBanner removed — see import comment for context. */}

      {/* Header + New Campaign — P4-T7 wires the button to the new Wizard */}
      <div className="flex items-center justify-between">
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--heading)' }}>Campaigns</h1>
        <button
          onClick={() => setShowWizard(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:scale-[1.02]"
          style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)' }}
        >
          <Plus className="w-4 h-4" /> New Campaign
        </button>
      </div>

      {/* P4-T1: Campaign Wizard drawer.
          P5-T5 fix #5: initialCohortId wired from ?cohortId= URL param
          (set by Cohort Builder's "Save + Create Campaign →"). */}
      {showWizard && (
        <CampaignWizard
          clubId={clubId}
          initialCohortId={wizardInitialCohortId}
          onClose={() => {
            setShowWizard(false)
            setWizardInitialCohortId(null)
          }}
        />
      )}

      {/* P1-T4: AI-Recommended Campaigns lifted to top — first content block.
          Always rendered (was previously only shown when no summary).
          Sorted by $ impact desc; placeholder values until P3-T1 wires real
          generators. See SPEC §3 P1-T4 / PLAN §6.4. */}
      <CampaignSuggestions
        clubId={clubId}
        onSelectType={(type) => {
          setInitialType(type)
          setShowCreator(true)
        }}
      />

      {/* P4-T6: Active Campaigns lightweight table (empty until launch
          backend lands in P5-T2). See SPEC §6 P4-T6. */}
      <ActiveCampaignsTable clubId={clubId} />

      {/* P5-T5: Campaign History collapsed accordion. Empty state until
          Campaign model is live (P5-T2 deploy); keeps the UX shape so
          directors know where past campaigns will appear. */}
      <details className="rounded-2xl px-5 py-3 transition-all" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
        <summary className="cursor-pointer flex items-center justify-between text-sm" style={{ color: 'var(--heading)', fontWeight: 600 }}>
          <span>Campaign History</span>
          <span className="text-[11px]" style={{ color: 'var(--t4)' }}>0 past campaigns · $0 attributed (v1 — populates after Phase 5 launch)</span>
        </summary>
        <div className="mt-3 text-xs" style={{ color: 'var(--t3)' }}>
          Past campaigns will appear here, sorted by recency, with attributed revenue
          per row. Open rate and conversion rolled up to the Money Story widget on
          the Dashboard (deferred to Dashboard redesign — see PLAN §11).
        </div>
      </details>

      <div
        className="rounded-3xl p-5 md:p-6 space-y-5"
        style={{
          background: 'linear-gradient(135deg, rgba(139,92,246,0.16), rgba(6,182,212,0.08))',
          border: '1px solid rgba(139,92,246,0.18)',
          boxShadow: 'var(--card-shadow)',
        }}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-semibold" style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--heading)' }}>
              <Sparkles className="w-3.5 h-3.5" />
              Campaign Operations
            </div>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--heading)' }}>Growth lanes, guest trial, and referral campaigns</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--t2)', maxWidth: 760 }}>
                Director-facing campaign surface. The agent execution layer (draft queue, rollout, pilot health) lives in <Link href={`/clubs/${clubId}/intelligence/settings/automation`} className="underline" style={{ color: '#8B5CF6' }}>Settings → Automation</Link>.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* P1-T3: Outreach Mode + Pilot Health badges stay on Campaigns
                per SPEC §3 acceptance — useful at-a-glance status while
                launching campaigns. */}
            <span
              className="px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ background: outreachModeStyle.bg, color: outreachModeStyle.color }}
            >
              Outreach mode: {outreachModeStyle.label}
            </span>
            <span
              className="px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ background: pilotStyle.bg, color: pilotStyle.color }}
            >
              Live health: {pilotStyle.label}
            </span>
          </div>
        </div>

        {/* P1-T3: Agent Campaign Layer 3-column grid moved to
            Settings → Automation. See AgentCampaignLayer.tsx.
            P1-T4: Agent Quick Starts deleted — duplicates AI-Recommended
            (lifted to top of page). See PLAN §6.6. */}

        {guestTrialSummary && guestTrialPlays.length > 0 ? (
          <div
            className="rounded-2xl p-4 space-y-4"
            style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--t4)' }}>Guest / Trial Booking</div>
                <div className="text-sm mt-1" style={{ color: 'var(--t2)', maxWidth: 780 }}>
                  This top-of-funnel lane is purpose-built for guests and trials: get the first visit booked, protect the first show-up, and convert warm first-timers into the easiest paid step.
                  {guestTrialOffers?.paidConversion ? ` Current paid default: ${guestTrialOffers.paidConversion.descriptor} via ${guestTrialOffers.paidConversion.destinationDescriptor}.` : ''}
                </div>
              </div>
              <div
                className="px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{ background: 'rgba(6,182,212,0.12)', color: '#06B6D4' }}
              >
                {guestTrialSummary.totalCandidates} guest/trial actions
              </div>
            </div>

            {guestTrialFunnel ? (
              <>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {[
                    {
                      label: 'Entrants',
                      value: guestTrialFunnel.entrantCount,
                      sub: 'recent guest/trial entrants',
                      accent: '#94A3B8',
                    },
                    {
                      label: 'Booked first visit',
                      value: guestTrialFunnel.bookedCount,
                      sub: `${guestTrialFunnel.bookingRate}% of entrants`,
                      accent: '#06B6D4',
                    },
                    {
                      label: 'Showed up',
                      value: guestTrialFunnel.showedUpCount,
                      sub: `${guestTrialFunnel.showUpRate}% of booked`,
                      accent: '#F59E0B',
                    },
                    {
                      label: 'Paid tier',
                      value: guestTrialFunnel.paidCount,
                      sub: `${guestTrialFunnel.paidConversionRate}% of showed-up`,
                      accent: '#10B981',
                    },
                  ].map((item) => (
                    <div key={item.label} className="rounded-2xl p-4" style={{ background: 'var(--subtle)' }}>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--t4)' }}>{item.label}</div>
                      <div className="text-2xl font-bold mt-2" style={{ color: 'var(--heading)' }}>{item.value}</div>
                      <div className="text-[11px] mt-1" style={{ color: item.accent }}>{item.sub}</div>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl px-4 py-3" style={{ background: 'var(--subtle)' }}>
                  <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>Guest / trial booking loop</div>
                  <div className="text-sm mt-1.5" style={{ color: 'var(--t2)', lineHeight: 1.7 }}>
                    {guestTrialFunnel.summary}
                  </div>
                </div>

                {guestTrialOfferLoop.length > 0 ? (
                  <div className="rounded-2xl px-4 py-3" style={{ background: 'var(--subtle)' }}>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>Offer outcome loop</div>
                        <div className="text-sm mt-1.5" style={{ color: 'var(--t2)', lineHeight: 1.7 }}>
                          Each configured guest/trial offer now has a live funnel lens, so you can see which offer owns each stage and whether that stage is healthy, watch-level, or at risk.
                        </div>
                      </div>
                      <span
                        className="px-3 py-1.5 rounded-full text-xs font-semibold"
                        style={{ background: 'rgba(139,92,246,0.12)', color: '#8B5CF6' }}
                      >
                        {guestTrialOfferLoop.length} tracked offers
                      </span>
                    </div>

                    <div className="grid gap-3 xl:grid-cols-3 mt-4">
                      {guestTrialOfferLoop.map((offer: any) => {
                        const tone = GUEST_TRIAL_OFFER_LOOP_STYLES[offer.status] || GUEST_TRIAL_OFFER_LOOP_STYLES.watch
                        const remediation = buildGuestTrialOfferRemediationPrompt({
                          stage: offer.stage,
                          status: offer.status,
                          offerName: offer.name,
                          descriptor: offer.descriptor,
                          destinationDescriptor: offer.destinationDescriptor,
                          rate: offer.rate,
                          candidateCount: offer.candidateCount,
                          outcomeCount: offer.outcomeCount,
                          baseCount: offer.baseCount,
                        })
                        return (
                          <div
                            key={offer.key}
                            className="rounded-2xl p-4"
                            style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>{offer.name}</div>
                                <div className="text-xs mt-1.5" style={{ color: 'var(--t3)', lineHeight: 1.6 }}>{offer.descriptor}</div>
                                <div className="text-xs mt-1.5" style={{ color: tone.color, lineHeight: 1.6 }}>
                                  Route: {offer.destinationDescriptor}
                                </div>
                              </div>
                              <span
                                className="px-2 py-1 rounded-full text-[10px] font-semibold"
                                style={{ background: tone.bg, color: tone.color }}
                              >
                                {tone.label}
                              </span>
                            </div>

                            <div className="grid grid-cols-3 gap-2 mt-4">
                              <div className="rounded-xl p-3" style={{ background: 'var(--subtle)' }}>
                                <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--t4)' }}>In play</div>
                                <div className="text-lg font-semibold mt-1" style={{ color: 'var(--heading)' }}>{offer.candidateCount}</div>
                              </div>
                              <div className="rounded-xl p-3" style={{ background: 'var(--subtle)' }}>
                                <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--t4)' }}>Outcome</div>
                                <div className="text-lg font-semibold mt-1" style={{ color: 'var(--heading)' }}>{offer.outcomeCount}</div>
                              </div>
                              <div className="rounded-xl p-3" style={{ background: 'var(--subtle)' }}>
                                <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--t4)' }}>Rate</div>
                                <div className="text-lg font-semibold mt-1" style={{ color: tone.color }}>{offer.rate}%</div>
                              </div>
                            </div>

                            <div className="text-xs mt-4" style={{ color: tone.color, fontWeight: 700 }}>{offer.outcomeLabel}</div>
                            <div className="text-xs mt-1.5 leading-relaxed" style={{ color: 'var(--t3)' }}>
                              {offer.summary}
                            </div>

                            <Link
                              href={buildCampaignAdvisorHref(clubId, { prompt: remediation.prompt })}
                              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:-translate-y-[1px] mt-4"
                              style={{ background: tone.bg, color: tone.color }}
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              {remediation.label}
                            </Link>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : null}

                {guestTrialRouteLoop.length > 0 ? (
                  <div className="rounded-2xl px-4 py-3" style={{ background: 'var(--subtle)' }}>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>Route attribution loop</div>
                        <div className="text-sm mt-1.5" style={{ color: 'var(--t2)', lineHeight: 1.7 }}>
                          This is the route layer: which booking or conversion path is currently carrying guest/trial progress, and which destination is adding or removing friction across the funnel.
                        </div>
                      </div>
                      <span
                        className="px-3 py-1.5 rounded-full text-xs font-semibold"
                        style={{ background: 'rgba(6,182,212,0.12)', color: '#06B6D4' }}
                      >
                        {guestTrialRouteLoop.length} tracked routes
                      </span>
                    </div>

                    <div className="grid gap-3 xl:grid-cols-3 mt-4">
                      {guestTrialRouteLoop.map((route: any) => {
                        const tone = GUEST_TRIAL_OFFER_LOOP_STYLES[route.status] || GUEST_TRIAL_OFFER_LOOP_STYLES.watch
                        const remediation = buildGuestTrialRouteRemediationPrompt({
                          destinationType: route.destinationType,
                          destinationDescriptor: route.destinationDescriptor,
                          stages: route.stages,
                          offerNames: route.offerNames,
                          status: route.status,
                          rate: route.rate,
                          candidateCount: route.candidateCount,
                          outcomeCount: route.outcomeCount,
                          baseCount: route.baseCount,
                        })
                        return (
                          <div
                            key={route.key}
                            className="rounded-2xl p-4"
                            style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>{route.destinationDescriptor}</div>
                                <div className="text-xs mt-1.5" style={{ color: tone.color, lineHeight: 1.6 }}>
                                  {formatGuestTrialRouteType(route.destinationType)}
                                </div>
                              </div>
                              <span
                                className="px-2 py-1 rounded-full text-[10px] font-semibold"
                                style={{ background: tone.bg, color: tone.color }}
                              >
                                {tone.label}
                              </span>
                            </div>

                            <div className="flex flex-wrap gap-2 mt-3">
                              {route.stages.map((stage: string) => (
                                <span
                                  key={`${route.key}-${stage}`}
                                  className="px-2 py-1 rounded-full text-[10px] font-semibold"
                                  style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--heading)' }}
                                >
                                  {stage === 'book_first_visit'
                                    ? 'First visit'
                                    : stage === 'protect_first_show_up'
                                      ? 'Show-up'
                                      : 'Paid'}
                                </span>
                              ))}
                            </div>

                            <div className="grid grid-cols-3 gap-2 mt-4">
                              <div className="rounded-xl p-3" style={{ background: 'var(--subtle)' }}>
                                <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--t4)' }}>In play</div>
                                <div className="text-lg font-semibold mt-1" style={{ color: 'var(--heading)' }}>{route.candidateCount}</div>
                              </div>
                              <div className="rounded-xl p-3" style={{ background: 'var(--subtle)' }}>
                                <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--t4)' }}>Outcome</div>
                                <div className="text-lg font-semibold mt-1" style={{ color: 'var(--heading)' }}>{route.outcomeCount}</div>
                              </div>
                              <div className="rounded-xl p-3" style={{ background: 'var(--subtle)' }}>
                                <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--t4)' }}>Rate</div>
                                <div className="text-lg font-semibold mt-1" style={{ color: tone.color }}>{route.rate}%</div>
                              </div>
                            </div>

                            <div className="text-xs mt-4" style={{ color: tone.color, fontWeight: 700 }}>{route.outcomeLabel}</div>
                            <div className="text-xs mt-1.5 leading-relaxed" style={{ color: 'var(--t3)' }}>
                              {route.summary}
                            </div>
                            <div className="text-[11px] mt-2 leading-relaxed" style={{ color: 'var(--t4)' }}>
                              Offers on this route: {route.offerNames.join(', ')}
                            </div>

                            <Link
                              href={buildCampaignAdvisorHref(clubId, { prompt: remediation.prompt })}
                              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:-translate-y-[1px] mt-4"
                              style={{ background: tone.bg, color: tone.color }}
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              {remediation.label}
                            </Link>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            <div className="grid gap-3 xl:grid-cols-3">
              {guestTrialPlays.map((play: any) => (
                <Link
                  key={play.key}
                  href={play.href}
                  className="rounded-2xl p-4 transition-all hover:-translate-y-[2px]"
                  style={{
                    background: play.tone.bg,
                    border: `1px solid ${play.tone.border}`,
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>{play.title}</div>
                      <div className="text-xs mt-1.5 leading-relaxed" style={{ color: 'var(--t2)' }}>
                        {play.description}
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 shrink-0" style={{ color: play.tone.color }} />
                  </div>

                  <div className="flex flex-wrap gap-2 mt-4">
                    <span
                      className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold"
                      style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--heading)' }}
                    >
                      {play.count} members
                    </span>
                    <span
                      className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold"
                      style={{ background: 'rgba(255,255,255,0.08)', color: play.tone.color }}
                    >
                      {play.draftCount} related drafts
                    </span>
                    {'descriptor' in play && play.descriptor ? (
                      <span
                        className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold"
                        style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--heading)' }}
                      >
                        {play.descriptor}
                      </span>
                    ) : null}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        {smartFirstSessionSummary && smartFirstSessionPlays.length > 0 ? (
          <div
            className="rounded-2xl p-4 space-y-4"
            style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--t4)' }}>Smart First Session Campaigns</div>
                <div className="text-sm mt-1" style={{ color: 'var(--t2)', maxWidth: 780 }}>
                  The newcomer growth lane is now campaign-ready too: one play for first booking, one for second-session habit, and one for guest-to-paid conversion.
                </div>
              </div>
              <div
                className="px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{ background: 'rgba(6,182,212,0.12)', color: '#06B6D4' }}
              >
                {smartFirstSessionSummary.totalCandidates} newcomers in scope
              </div>
            </div>

            {smartFirstSessionFunnel ? (
              <>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {[
                    {
                      label: 'Joined recent',
                      value: smartFirstSessionFunnel.newcomerCount,
                      sub: 'newcomers in current window',
                      accent: '#94A3B8',
                    },
                    {
                      label: 'First booking',
                      value: smartFirstSessionFunnel.firstBookedCount,
                      sub: `${smartFirstSessionFunnel.firstBookingRate}% of joined`,
                      accent: '#06B6D4',
                    },
                    {
                      label: 'Second session',
                      value: smartFirstSessionFunnel.secondBookedCount,
                      sub: `${smartFirstSessionFunnel.secondSessionRate}% of first-bookers`,
                      accent: '#8B5CF6',
                    },
                    {
                      label: 'Paid tier',
                      value: smartFirstSessionFunnel.paidMemberCount,
                      sub: `${smartFirstSessionFunnel.paidConversionRate}% of first-bookers`,
                      accent: '#10B981',
                    },
                  ].map((item) => (
                    <div key={item.label} className="rounded-2xl p-4" style={{ background: 'var(--subtle)' }}>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--t4)' }}>{item.label}</div>
                      <div className="text-2xl font-bold mt-2" style={{ color: 'var(--heading)' }}>{item.value}</div>
                      <div className="text-[11px] mt-1" style={{ color: item.accent }}>{item.sub}</div>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl px-4 py-3" style={{ background: 'var(--subtle)' }}>
                  <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>Newcomer outcome loop</div>
                  <div className="text-sm mt-1.5" style={{ color: 'var(--t2)', lineHeight: 1.7 }}>
                    {smartFirstSessionFunnel.summary}
                  </div>
                </div>
              </>
            ) : null}

            <div className="grid gap-3 xl:grid-cols-3">
              {smartFirstSessionPlays.map((play: any) => (
                <Link
                  key={play.key}
                  href={play.href}
                  className="rounded-2xl p-4 transition-all hover:-translate-y-[2px]"
                  style={{
                    background: play.tone.bg,
                    border: `1px solid ${play.tone.border}`,
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>{play.title}</div>
                      <div className="text-xs mt-1.5 leading-relaxed" style={{ color: 'var(--t2)' }}>
                        {play.description}
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 shrink-0" style={{ color: play.tone.color }} />
                  </div>

                  <div className="flex flex-wrap gap-2 mt-4">
                    <span
                      className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold"
                      style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--heading)' }}
                    >
                      {play.count} members
                    </span>
                    <span
                      className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold"
                      style={{ background: 'rgba(255,255,255,0.08)', color: play.tone.color }}
                    >
                      {play.draftCount} related drafts
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        {winBackSummary && winBackPlays.length > 0 ? (
          <div
            className="rounded-2xl p-4 space-y-4"
            style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--t4)' }}>Win-Back Campaigns</div>
                <div className="text-sm mt-1" style={{ color: 'var(--t2)', maxWidth: 780 }}>
                  This lane turns expired, cancelled, and high-value lapsed member signals into campaign-ready comeback plays instead of one generic reactivation blast.
                </div>
              </div>
              <div
                className="px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444' }}
              >
                {winBackSummary.totalCandidates} win-back opportunities
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  label: 'In scope',
                  value: winBackSummary.totalCandidates,
                  sub: 'members ready for comeback outreach',
                  accent: '#EF4444',
                },
                {
                  label: 'Expired',
                  value: winBackSummary.expiredCount,
                  sub: 'warm renewal rescue',
                  accent: '#EF4444',
                },
                {
                  label: 'Cancelled',
                  value: winBackSummary.cancelledCount,
                  sub: 'comeback after churn',
                  accent: '#F97316',
                },
                {
                  label: 'High-value lapsed',
                  value: winBackSummary.lapsedCount,
                  sub: 'quiet but worth saving',
                  accent: '#8B5CF6',
                },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl p-4" style={{ background: 'var(--subtle)' }}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--t4)' }}>{item.label}</div>
                  <div className="text-2xl font-bold mt-2" style={{ color: 'var(--heading)' }}>{item.value}</div>
                  <div className="text-[11px] mt-1" style={{ color: item.accent }}>{item.sub}</div>
                </div>
              ))}
            </div>

            {winBackFunnel ? (
              <>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {[
                    {
                      label: 'Recoverable pool',
                      value: winBackFunnel.recoverableCount,
                      sub: 'members still worth a save',
                      accent: '#94A3B8',
                    },
                    {
                      label: 'Former paid',
                      value: winBackFunnel.formerPaidCount,
                      sub: 'expired or cancelled',
                      accent: '#EF4444',
                    },
                    {
                      label: 'Warm window',
                      value: winBackFunnel.warmWindowCount,
                      sub: `${winBackFunnel.warmWindowRate}% of former paid`,
                      accent: '#F97316',
                    },
                    {
                      label: 'High intent',
                      value: winBackFunnel.highIntentCount,
                      sub: `${winBackFunnel.highIntentRate}% of recoverable pool`,
                      accent: '#8B5CF6',
                    },
                  ].map((item) => (
                    <div key={item.label} className="rounded-2xl p-4" style={{ background: 'var(--subtle)' }}>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--t4)' }}>{item.label}</div>
                      <div className="text-2xl font-bold mt-2" style={{ color: 'var(--heading)' }}>{item.value}</div>
                      <div className="text-[11px] mt-1" style={{ color: item.accent }}>{item.sub}</div>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl px-4 py-3" style={{ background: 'var(--subtle)' }}>
                  <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>Win-back recovery loop</div>
                  <div className="text-sm mt-1.5" style={{ color: 'var(--t2)', lineHeight: 1.7 }}>
                    {winBackFunnel.summary}
                  </div>
                </div>

                {winBackLaneLoop.length > 0 ? (
                  <div className="rounded-2xl px-4 py-3" style={{ background: 'var(--subtle)' }}>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>Lane recovery loop</div>
                        <div className="text-sm mt-1.5" style={{ color: 'var(--t2)', lineHeight: 1.7 }}>
                          Each win-back lane now has its own health lens, so you can see whether renewal rescue, cancelled comeback, or high-value saves need a tighter comeback motion.
                        </div>
                      </div>
                      <span
                        className="px-3 py-1.5 rounded-full text-xs font-semibold"
                        style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444' }}
                      >
                        {winBackLaneLoop.length} tracked lanes
                      </span>
                    </div>

                    <div className="grid gap-3 xl:grid-cols-3 mt-4">
                      {winBackLaneLoop.map((lane: any) => {
                        const tone = WIN_BACK_LANE_STYLES[lane.status] || WIN_BACK_LANE_STYLES.watch
                        const remediation = buildWinBackLaneRemediationPrompt({
                          stage: lane.stage,
                          status: lane.status,
                          title: lane.title,
                          rate: lane.rate,
                          candidateCount: lane.candidateCount,
                          outcomeCount: lane.outcomeCount,
                          baseCount: lane.baseCount,
                        })
                        return (
                          <div
                            key={lane.key}
                            className="rounded-2xl p-4"
                            style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>{lane.title}</div>
                                <div className="text-xs mt-1.5" style={{ color: 'var(--t3)', lineHeight: 1.6 }}>{lane.outcomeLabel}</div>
                              </div>
                              <span
                                className="px-2 py-1 rounded-full text-[10px] font-semibold"
                                style={{ background: tone.bg, color: tone.color }}
                              >
                                {tone.label}
                              </span>
                            </div>

                            <div className="grid grid-cols-3 gap-2 mt-4">
                              <div className="rounded-xl p-3" style={{ background: 'var(--subtle)' }}>
                                <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--t4)' }}>In lane</div>
                                <div className="text-lg font-semibold mt-1" style={{ color: 'var(--heading)' }}>{lane.candidateCount}</div>
                              </div>
                              <div className="rounded-xl p-3" style={{ background: 'var(--subtle)' }}>
                                <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--t4)' }}>Outcome</div>
                                <div className="text-lg font-semibold mt-1" style={{ color: 'var(--heading)' }}>{lane.outcomeCount}</div>
                              </div>
                              <div className="rounded-xl p-3" style={{ background: 'var(--subtle)' }}>
                                <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--t4)' }}>Rate</div>
                                <div className="text-lg font-semibold mt-1" style={{ color: tone.color }}>{lane.rate}%</div>
                              </div>
                            </div>

                            <div className="text-xs mt-4 leading-relaxed" style={{ color: 'var(--t3)' }}>
                              {lane.summary}
                            </div>

                            <Link
                              href={buildCampaignAdvisorHref(clubId, { prompt: remediation.prompt })}
                              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:-translate-y-[1px] mt-4"
                              style={{ background: tone.bg, color: tone.color }}
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              {remediation.label}
                            </Link>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            <div className="rounded-2xl px-4 py-3" style={{ background: 'var(--subtle)' }}>
              <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>Win-back summary</div>
              <div className="text-sm mt-1.5" style={{ color: 'var(--t2)', lineHeight: 1.7 }}>
                {winBackSummary.summary}
              </div>
            </div>

            <div className="grid gap-3 xl:grid-cols-3">
              {winBackPlays.map((play: any) => (
                <Link
                  key={play.key}
                  href={play.href}
                  className="rounded-2xl p-4 transition-all hover:-translate-y-[2px]"
                  style={{
                    background: play.tone.bg,
                    border: `1px solid ${play.tone.border}`,
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>{play.title}</div>
                      <div className="text-xs mt-1.5 leading-relaxed" style={{ color: 'var(--t2)' }}>
                        {play.description}
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 shrink-0" style={{ color: play.tone.color }} />
                  </div>

                  <div className="flex flex-wrap gap-2 mt-4">
                    <span
                      className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold"
                      style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--heading)' }}
                    >
                      {play.count} members
                    </span>
                    <span
                      className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold"
                      style={{ background: 'rgba(255,255,255,0.08)', color: play.tone.color }}
                    >
                      {play.draftCount} related drafts
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        <ReferralCampaignsSection
          clubId={clubId}
          referralSummary={referralSummary}
          referralPlays={referralPlays}
          referralHasLiveTracking={referralHasLiveTracking}
          referralFunnel={referralFunnel}
          referralOffers={referralOffers}
          referralOutcomeFunnel={referralOutcomeFunnel}
          referralLaneLoop={referralLaneLoop}
          referralOfferLoop={referralOfferLoop}
          referralRouteLoop={referralRouteLoop}
          referralOutcomeLoop={referralOutcomeLoop}
          referralRewardLoop={referralRewardLoop}
          referralRewardSummary={referralRewardSummary}
          referralRewardIssuanceSummary={referralRewardIssuanceSummary}
          referralReferredGuestFunnel={referralReferredGuestFunnel}
          referralReferredGuests={referralReferredGuests}
          referralRewardIssuances={referralRewardIssuances}
          referralRewardLedger={referralRewardLedger}
          guestTrialOffers={guestTrialOffers}
          activeReferralRewardIssuanceKey={activeReferralRewardIssuanceKey}
          isRewardIssuancePending={updateReferralRewardIssuance.isPending}
          onUpdateReferralRewardIssuance={handleReferralRewardIssuanceUpdate}
        />

      </div>

      {/* P1-T4: CampaignSuggestions lifted to top of page. The conditional
          `!summary ? <CampaignSuggestions> : <KPIs+chart+list>` was replaced
          with always-show suggestions at top + always-show KPIs/chart/list
          below (when summary exists). */}
      {summary && (
        <>
          {/* KPI cards */}
          <CampaignKPIs summary={summary} variantData={variantData} />

          {/* Performance chart */}
          {byDay?.length > 0 && <CampaignChart byDay={byDay} />}

          {/* Campaign list */}
          <CampaignList
            campaigns={campaigns}
            isLoading={campaignListLoading}
            clubId={clubId}
            advisorDrafts={campaignDrafts}
            outreachMode={outreachMode}
            rolloutStatus={rolloutStatus}
            pilotHealth={pilotHealth}
            onCampaignClick={(campaign) => setSelectedCampaign(campaign)}
          />

          {recentActivityLogs.length > 0 ? (
            <div
              className="rounded-3xl p-5 md:p-6 space-y-5"
              style={{
                background: 'var(--card-bg)',
                border: '1px solid var(--card-border)',
                boxShadow: 'var(--card-shadow)',
              }}
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-semibold" style={{ background: 'rgba(6,182,212,0.12)', color: '#06B6D4' }}>
                    <Radar className="w-3.5 h-3.5" />
                    Campaign analytics rows
                  </div>
                  <div>
                    <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--heading)' }}>Recent activity by offer and route</h3>
                    <p className="text-sm mt-1" style={{ color: 'var(--t2)', maxWidth: 760 }}>
                      Filter the latest campaign rows by exact guest/trial offer, referral offer, referral lane, and destination route so you can see performance by motion, plus where referred guests are entering the club funnel.
                    </p>
                  </div>
                </div>
                <div
                  className="px-3 py-1.5 rounded-full text-xs font-semibold"
                  style={{ background: 'rgba(139,92,246,0.12)', color: '#8B5CF6' }}
                >
                  {filteredRecentActivity.length} of {recentActivityLogs.length} rows
                </div>
              </div>

              {topActivityGuestTrialOffers.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--t4)' }}>Filter by offer</div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setActivityOfferFilter('all')}
                      className="px-3 py-2 rounded-xl text-xs font-semibold transition-all"
                      style={{
                        background: activityOfferFilter === 'all' ? 'rgba(16,185,129,0.14)' : 'var(--subtle)',
                        color: activityOfferFilter === 'all' ? '#10B981' : 'var(--heading)',
                      }}
                    >
                      All offers
                    </button>
                    {topActivityGuestTrialOffers.map((offer: any) => (
                      <button
                        key={offer.key}
                        type="button"
                        onClick={() => setActivityOfferFilter(offer.key)}
                        className="px-3 py-2 rounded-xl text-xs font-semibold transition-all"
                        style={{
                          background: activityOfferFilter === offer.key ? 'rgba(16,185,129,0.14)' : 'var(--subtle)',
                          color: activityOfferFilter === offer.key ? '#10B981' : 'var(--heading)',
                        }}
                      >
                        {offer.label} · {offer.count}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {topActivityGuestTrialRoutes.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--t4)' }}>Filter by route</div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setActivityRouteFilter('all')}
                      className="px-3 py-2 rounded-xl text-xs font-semibold transition-all"
                      style={{
                        background: activityRouteFilter === 'all' ? 'rgba(6,182,212,0.14)' : 'var(--subtle)',
                        color: activityRouteFilter === 'all' ? '#06B6D4' : 'var(--heading)',
                      }}
                    >
                      All routes
                    </button>
                    {topActivityGuestTrialRoutes.map((route: any) => (
                      <button
                        key={route.key}
                        type="button"
                        onClick={() => setActivityRouteFilter(route.key)}
                        className="px-3 py-2 rounded-xl text-xs font-semibold transition-all"
                        style={{
                          background: activityRouteFilter === route.key ? 'rgba(6,182,212,0.14)' : 'var(--subtle)',
                          color: activityRouteFilter === route.key ? '#06B6D4' : 'var(--heading)',
                        }}
                      >
                        {route.label} · {route.count}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {topActivityReferralOffers.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--t4)' }}>Filter by referral offer</div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setActivityReferralOfferFilter('all')}
                      className="px-3 py-2 rounded-xl text-xs font-semibold transition-all"
                      style={{
                        background: activityReferralOfferFilter === 'all' ? 'rgba(245,158,11,0.14)' : 'var(--subtle)',
                        color: activityReferralOfferFilter === 'all' ? '#F59E0B' : 'var(--heading)',
                      }}
                    >
                      All referral offers
                    </button>
                    {topActivityReferralOffers.map((offer: any) => (
                      <button
                        key={offer.key}
                        type="button"
                        onClick={() => setActivityReferralOfferFilter(offer.key)}
                        className="px-3 py-2 rounded-xl text-xs font-semibold transition-all"
                        style={{
                          background: activityReferralOfferFilter === offer.key ? 'rgba(245,158,11,0.14)' : 'var(--subtle)',
                          color: activityReferralOfferFilter === offer.key ? '#F59E0B' : 'var(--heading)',
                        }}
                      >
                        {offer.label} · {offer.count}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {topActivityReferralLanes.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--t4)' }}>Filter by referral lane</div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setActivityReferralLaneFilter('all')}
                      className="px-3 py-2 rounded-xl text-xs font-semibold transition-all"
                      style={{
                        background: activityReferralLaneFilter === 'all' ? 'rgba(139,92,246,0.14)' : 'var(--subtle)',
                        color: activityReferralLaneFilter === 'all' ? '#8B5CF6' : 'var(--heading)',
                      }}
                    >
                      All lanes
                    </button>
                    {topActivityReferralLanes.map((lane: any) => (
                      <button
                        key={lane.key}
                        type="button"
                        onClick={() => setActivityReferralLaneFilter(lane.key)}
                        className="px-3 py-2 rounded-xl text-xs font-semibold transition-all"
                        style={{
                          background: activityReferralLaneFilter === lane.key ? 'rgba(139,92,246,0.14)' : 'var(--subtle)',
                          color: activityReferralLaneFilter === lane.key ? '#8B5CF6' : 'var(--heading)',
                        }}
                      >
                        {formatReferralLaneLabel(lane.key)} · {lane.count}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {topActivityReferralRoutes.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--t4)' }}>Filter by referral route</div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setActivityReferralRouteFilter('all')}
                      className="px-3 py-2 rounded-xl text-xs font-semibold transition-all"
                      style={{
                        background: activityReferralRouteFilter === 'all' ? 'rgba(250,204,21,0.14)' : 'var(--subtle)',
                        color: activityReferralRouteFilter === 'all' ? '#FACC15' : 'var(--heading)',
                      }}
                    >
                      All referral routes
                    </button>
                    {topActivityReferralRoutes.map((route: any) => (
                      <button
                        key={route.key}
                        type="button"
                        onClick={() => setActivityReferralRouteFilter(route.key)}
                        className="px-3 py-2 rounded-xl text-xs font-semibold transition-all"
                        style={{
                          background: activityReferralRouteFilter === route.key ? 'rgba(250,204,21,0.14)' : 'var(--subtle)',
                          color: activityReferralRouteFilter === route.key ? '#FACC15' : 'var(--heading)',
                        }}
                      >
                        {route.label} · {route.count}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {topActivityReferredGuestSources.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--t4)' }}>Referred guest capture sources</div>
                  <div className="flex flex-wrap gap-2">
                    {topActivityReferredGuestSources.map((source: any) => (
                      <span
                        key={source.key}
                        className="px-3 py-2 rounded-xl text-xs font-semibold"
                        style={{ background: 'rgba(14,165,233,0.14)', color: '#38BDF8' }}
                      >
                        {source.label}
                        {source.lane ? ` · ${formatReferralLaneLabel(source.lane)}` : ''}
                        {` · ${source.count}`}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {topActivityReferredGuestRoutes.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--t4)' }}>Referred guest routes into guest / trial</div>
                  <div className="flex flex-wrap gap-2">
                    {topActivityReferredGuestRoutes.map((route: any) => (
                      <span
                        key={route.key}
                        className="px-3 py-2 rounded-xl text-xs font-semibold"
                        style={{ background: 'rgba(45,212,191,0.14)', color: '#2DD4BF' }}
                      >
                        {route.label} · {route.count}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {filteredRecentActivity.length === 0 ? (
                <div className="rounded-2xl px-4 py-4 text-sm" style={{ background: 'var(--subtle)', color: 'var(--t3)' }}>
                  No recent campaign rows match this exact offer/lane/route combination yet. Clear one of the filters or wait for the next live or shadowed campaign activity.
                </div>
              ) : (
                <div className="space-y-3">
                  {visibleRecentActivity.map((log: any) => (
                    <div
                      key={log.id}
                      className="rounded-2xl p-4"
                      style={{ background: 'var(--subtle)', border: '1px solid transparent' }}
                    >
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>{log.userName}</div>
                          <div className="text-xs mt-1.5" style={{ color: 'var(--t3)' }}>
                            {formatCampaignActivityType(log.type)} · {log.channel ? String(log.channel).toUpperCase() : 'No channel'} · {formatRelativeTime(log.createdAt)}
                          </div>
                        </div>
                        <span
                          className="px-2.5 py-1 rounded-full text-[11px] font-semibold"
                          style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--heading)' }}
                        >
                          {formatCampaignActivityStatus(log.status)}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2 mt-3">
                        {log.guestTrialOfferName ? (
                          <span
                            className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold"
                            style={{ background: 'rgba(16,185,129,0.14)', color: '#10B981' }}
                          >
                            {formatGuestTrialActivityStage(log.guestTrialOfferStage)} · {log.guestTrialOfferName}
                          </span>
                        ) : null}
                        {log.guestTrialDestinationDescriptor ? (
                          <span
                            className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold"
                            style={{ background: 'rgba(6,182,212,0.14)', color: '#06B6D4' }}
                          >
                            {log.guestTrialDestinationDescriptor}
                          </span>
                        ) : null}
                        {log.referralOfferName ? (
                          <span
                            className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold"
                            style={{ background: 'rgba(245,158,11,0.14)', color: '#F59E0B' }}
                          >
                            {log.referralOfferName}
                          </span>
                        ) : null}
                        {log.referralOfferLane ? (
                          <span
                            className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold"
                            style={{ background: 'rgba(139,92,246,0.14)', color: '#8B5CF6' }}
                          >
                            {formatReferralLaneLabel(log.referralOfferLane)}
                          </span>
                        ) : null}
                        {log.referralDestinationDescriptor ? (
                          <span
                            className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold"
                            style={{ background: 'rgba(250,204,21,0.14)', color: '#FACC15' }}
                          >
                            {log.referralDestinationDescriptor}
                          </span>
                        ) : null}
                        {log.referredGuestSourceOfferName ? (
                          <span
                            className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold"
                            style={{ background: 'rgba(14,165,233,0.14)', color: '#38BDF8' }}
                          >
                            Referred guest from {log.referredGuestSourceOfferName}
                          </span>
                        ) : null}
                        {log.referredGuestSourceLane ? (
                          <span
                            className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold"
                            style={{ background: 'rgba(45,212,191,0.14)', color: '#2DD4BF' }}
                          >
                            {formatReferralLaneLabel(log.referredGuestSourceLane)}
                          </span>
                        ) : null}
                        {log.referredGuestSourceDestinationDescriptor ? (
                          <span
                            className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold"
                            style={{ background: 'rgba(34,197,94,0.14)', color: '#22C55E' }}
                          >
                            {log.referredGuestSourceDestinationDescriptor}
                          </span>
                        ) : null}
                        {!log.guestTrialOfferName && !log.guestTrialDestinationDescriptor ? (
                          <span
                            className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold"
                            style={{ background: 'rgba(148,163,184,0.14)', color: '#94A3B8' }}
                          >
                            {!log.referralOfferName && !log.referralDestinationDescriptor ? 'No growth attribution' : 'No guest / trial attribution'}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))}

                  {filteredRecentActivity.length > visibleRecentActivity.length ? (
                    <div className="text-xs" style={{ color: 'var(--t4)' }}>
                      Showing the latest {visibleRecentActivity.length} matching rows.
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}

          {selectedCampaign ? (
            <div
              className="rounded-3xl p-5 md:p-6 space-y-5"
              style={{
                background: 'linear-gradient(135deg, rgba(6,182,212,0.10), rgba(139,92,246,0.08))',
                border: '1px solid rgba(6,182,212,0.14)',
                boxShadow: 'var(--card-shadow)',
              }}
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-semibold" style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--heading)' }}>
                    <CalendarDays className="w-3.5 h-3.5" />
                    After-Send Drilldown
                  </div>
                  <div>
                    <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--heading)' }}>{selectedCampaignName}</h3>
                    <p className="text-sm mt-1" style={{ color: 'var(--t2)' }}>
                      Channel mix, audience outcomes, and the fastest way to rework this campaign based on what actually happened after send.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedCampaign(null)}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:translate-x-[2px]"
                  style={{ background: 'rgba(148,163,184,0.14)', color: '#64748B' }}
                >
                  <X className="w-3.5 h-3.5" />
                  Close
                </button>
              </div>

              {isCampaignDrilldownLoading ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="animate-pulse rounded-2xl h-28" style={{ background: 'var(--subtle)' }} />
                  ))}
                </div>
              ) : campaignDrilldown ? (
                <>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                    {[
                      { label: 'Sent', value: campaignDrilldown.campaign.sent },
                      { label: 'Opened', value: campaignDrilldown.campaign.opened },
                      { label: 'Clicked', value: campaignDrilldown.campaign.clicked },
                      { label: 'Booked', value: campaignDrilldown.campaign.converted },
                      { label: 'Failed / Bounced', value: campaignDrilldown.campaign.failed + campaignDrilldown.campaign.bounced },
                    ].map((item) => (
                      <div key={item.label} className="rounded-2xl px-4 py-3" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--t4)' }}>{item.label}</div>
                        <div className="text-2xl font-bold mt-2" style={{ color: 'var(--heading)' }}>{item.value}</div>
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-4 xl:grid-cols-3">
                    <div className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                      <div className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--t4)' }}>Channel mix</div>
                      <div className="space-y-2">
                        {campaignDrilldown.channels.length === 0 ? (
                          <div className="text-sm" style={{ color: 'var(--t3)' }}>No channel breakdown yet.</div>
                        ) : campaignDrilldown.channels.map((channel: any) => (
                          <div key={channel.channel} className="rounded-xl px-3 py-3" style={{ background: 'var(--subtle)' }}>
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>{String(channel.channel).toUpperCase()}</div>
                              <div className="text-xs" style={{ color: 'var(--t3)' }}>{channel.sent} sent</div>
                            </div>
                            <div className="flex items-center gap-3 flex-wrap text-xs mt-2" style={{ color: 'var(--t3)' }}>
                              <span>{channel.opened} opened</span>
                              <span>{channel.clicked} clicked</span>
                              <span>{channel.converted} booked</span>
                              <span>{channel.failed} failed</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                      <div className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--t4)' }}>Outcome shape</div>
                      <div className="flex flex-wrap gap-2">
                        {campaignDrilldown.outcomes.map((outcome: any) => (
                          <span
                            key={outcome.key}
                            className="px-3 py-2 rounded-xl text-xs font-semibold"
                            style={{ background: 'var(--subtle)', color: 'var(--heading)' }}
                          >
                            {String(outcome.key).replace(/_/g, ' ')} · {outcome.count}
                          </span>
                        ))}
                      </div>
                      <div className="space-y-2">
                        {campaignDrilldown.topSources?.length > 0 ? (
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--t4)' }}>Top sources</div>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {campaignDrilldown.topSources.map((source: any) => (
                                <span key={source.key} className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold" style={{ background: 'rgba(139,92,246,0.14)', color: '#8B5CF6' }}>
                                  {source.key} · {source.count}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {campaignDrilldown.topGuestTrialOffers?.length > 0 ? (
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--t4)' }}>Top guest / trial offers</div>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {campaignDrilldown.topGuestTrialOffers.map((offer: any) => (
                                <span key={offer.key} className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold" style={{ background: 'rgba(16,185,129,0.14)', color: '#10B981' }}>
                                  {offer.label} · {offer.count}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {campaignDrilldown.topGuestTrialRoutes?.length > 0 ? (
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--t4)' }}>Top guest / trial routes</div>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {campaignDrilldown.topGuestTrialRoutes.map((route: any) => (
                                <span key={route.key} className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold" style={{ background: 'rgba(6,182,212,0.14)', color: '#06B6D4' }}>
                                  {route.label} · {route.count}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {campaignDrilldown.topReferralOffers?.length > 0 ? (
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--t4)' }}>Top referral offers</div>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {campaignDrilldown.topReferralOffers.map((offer: any) => (
                                <span key={offer.key} className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold" style={{ background: 'rgba(245,158,11,0.14)', color: '#F59E0B' }}>
                                  {offer.label} · {offer.count}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {campaignDrilldown.topReferralRoutes?.length > 0 ? (
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--t4)' }}>Top referral routes</div>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {campaignDrilldown.topReferralRoutes.map((route: any) => (
                                <span key={route.key} className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold" style={{ background: 'rgba(250,204,21,0.14)', color: '#FACC15' }}>
                                  {route.label} · {route.count}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {campaignDrilldown.topReferredGuestSources?.length > 0 ? (
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--t4)' }}>Top referred guest sources</div>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {campaignDrilldown.topReferredGuestSources.map((source: any) => (
                                <span key={source.key} className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold" style={{ background: 'rgba(14,165,233,0.14)', color: '#38BDF8' }}>
                                  {source.label}
                                  {source.lane ? ` · ${formatReferralLaneLabel(source.lane)}` : ''}
                                  {` · ${source.count}`}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {campaignDrilldown.topReferredGuestRoutes?.length > 0 ? (
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--t4)' }}>Top referred guest routes</div>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {campaignDrilldown.topReferredGuestRoutes.map((route: any) => (
                                <span key={route.key} className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold" style={{ background: 'rgba(45,212,191,0.14)', color: '#2DD4BF' }}>
                                  {route.label} · {route.count}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {campaignDrilldown.topVariants?.length > 0 ? (
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--t4)' }}>Top variants</div>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {campaignDrilldown.topVariants.map((variant: any) => (
                                <span key={variant.key} className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold" style={{ background: 'rgba(6,182,212,0.14)', color: '#06B6D4' }}>
                                  {variant.key} · {variant.count}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                      <div className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--t4)' }}>Next best move</div>
                      <div className="rounded-xl px-3 py-3 text-sm" style={{ background: 'var(--subtle)', color: 'var(--heading)' }}>
                        {campaignDrilldown.campaign.failed + campaignDrilldown.campaign.bounced > 0
                          ? 'Failure or bounce pressure is showing up here. Rework the audience and delivery mix before widening this campaign.'
                          : campaignDrilldown.campaign.converted > 0
                            ? 'This campaign is producing bookings. Use it as the baseline for a smarter follow-up or the next iteration.'
                            : 'This campaign reached people, but it still needs a sharper angle or tighter audience to convert better.'}
                      </div>
                      {selectedPilotAction && (selectedPilotAction.health === 'watch' || selectedPilotAction.health === 'at_risk') ? (
                        <div
                          className="rounded-xl px-3 py-3 space-y-2"
                          style={{
                            background: selectedPilotAction.health === 'at_risk' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)',
                            border: `1px solid ${selectedPilotAction.health === 'at_risk' ? 'rgba(239,68,68,0.16)' : 'rgba(245,158,11,0.16)'}`,
                          }}
                        >
                          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: selectedPilotAction.health === 'at_risk' ? '#EF4444' : '#F59E0B' }}>
                            <AlertTriangle className="w-4 h-4" />
                            Shadow-back recommendation
                          </div>
                          <div className="text-sm" style={{ color: 'var(--heading)' }}>
                            {selectedPilotAction.label || formatCampaignActionKind(selectedActionKind || 'create_campaign')} is showing risky live behavior for this campaign family.
                          </div>
                          <div className="text-xs" style={{ color: 'var(--t3)', lineHeight: 1.6 }}>
                            {pilotHealth?.recommendation?.actionKind === selectedActionKind
                              ? pilotHealth.recommendation.reason
                              : `Live ${formatCampaignActionKind(selectedActionKind || 'create_campaign').toLowerCase()} should move back to shadow until this campaign is reworked.`}
                          </div>
                          <button
                            type="button"
                            onClick={handleShadowBackFromDrilldown}
                            disabled={!canManageRollout || isShadowBackPending}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed"
                            style={{
                              background: 'rgba(255,255,255,0.08)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              color: 'var(--heading)',
                            }}
                          >
                            <ShieldAlert className="w-3.5 h-3.5" />
                            {isShadowBackPending ? 'Moving to shadow...' : 'Move back to shadow'}
                          </button>
                          {!canManageRollout ? (
                            <div className="text-[11px]" style={{ color: '#FCA5A5', lineHeight: 1.5 }}>
                              Only admins can change live rollout posture from this page.
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={buildCampaignAdvisorHref(clubId, {
                            prompt: `Rework the ${selectedCampaignName} campaign based on these results: ${campaignDrilldown.campaign.opened} opened, ${campaignDrilldown.campaign.clicked} clicked, ${campaignDrilldown.campaign.converted} booked, ${campaignDrilldown.campaign.failed + campaignDrilldown.campaign.bounced} failed or bounced. Keep it as a review-ready draft first.`,
                          })}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:translate-x-[2px]"
                          style={{ background: 'rgba(139,92,246,0.14)', color: '#8B5CF6' }}
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          Rework in Advisor
                        </Link>
                        <Link
                          href={buildCampaignAdvisorHref(clubId, {
                            prompt: `Tighten the audience for ${selectedCampaignName}. Focus on the segments most likely to respond, reduce delivery risk, and explain who should be excluded after seeing ${campaignDrilldown.campaign.failed + campaignDrilldown.campaign.bounced} failed or bounced outcomes. Keep it as a review-ready draft.`,
                          })}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:translate-x-[2px]"
                          style={{ background: 'rgba(245,158,11,0.14)', color: '#F59E0B' }}
                        >
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Tighten audience
                        </Link>
                        <Link
                          href={buildCampaignAdvisorHref(clubId, {
                            prompt: `Draft a follow-up to ${selectedCampaignName} for members who opened or clicked but did not book. Keep it draft-only for review.`,
                          })}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:translate-x-[2px]"
                          style={{ background: 'rgba(6,182,212,0.14)', color: '#06B6D4' }}
                        >
                          <ArrowRight className="w-3.5 h-3.5" />
                          Draft follow-up
                        </Link>
                        <Link
                          href={buildCampaignAdvisorHref(clubId, {
                            prompt: `Draft the next iteration of ${selectedCampaignName} using ${topVariant ? `best-performing variant ${topVariant.key}` : 'the strongest-performing angle'}${topSource ? ` and leaning into source ${topSource.key}` : ''}. Keep it review-ready, not live.`,
                          })}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:translate-x-[2px]"
                          style={{ background: 'rgba(16,185,129,0.14)', color: '#10B981' }}
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          Clone best variant
                        </Link>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--t4)' }}>Recent audience outcomes</div>
                    {campaignDrilldown.recipients.length === 0 ? (
                      <div className="text-sm" style={{ color: 'var(--t3)' }}>No audience rows available for this campaign yet.</div>
                    ) : (
                      <div className="space-y-2">
                        {campaignDrilldown.recipients.map((recipient: any) => (
                          <div key={recipient.id} className="rounded-xl px-3 py-3 flex items-center justify-between gap-3 flex-wrap" style={{ background: 'var(--subtle)' }}>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold truncate" style={{ color: 'var(--heading)' }}>{recipient.name}</div>
                              <div className="text-xs mt-1 flex items-center gap-2 flex-wrap" style={{ color: 'var(--t3)' }}>
                                <span>{recipient.email || 'No email on file'}</span>
                                <span>{String(recipient.channel).toUpperCase()}</span>
                                {recipient.membershipType ? <span>{recipient.membershipType}</span> : null}
                                {recipient.membershipStatus ? <span>{recipient.membershipStatus}</span> : null}
                                {recipient.source ? <span>{recipient.source}</span> : null}
                                {recipient.guestTrialOfferName ? <span>{recipient.guestTrialOfferName}</span> : null}
                                {recipient.guestTrialDestinationDescriptor ? <span>{recipient.guestTrialDestinationDescriptor}</span> : null}
                                {recipient.referredGuestSourceOfferName ? <span>{`from ${recipient.referredGuestSourceOfferName}`}</span> : null}
                                {recipient.referredGuestSourceLane ? <span>{formatReferralLaneLabel(recipient.referredGuestSourceLane)}</span> : null}
                                {recipient.referredGuestSourceDestinationDescriptor ? <span>{recipient.referredGuestSourceDestinationDescriptor}</span> : null}
                                {recipient.referralOfferName ? <span>{recipient.referralOfferName}</span> : null}
                                {recipient.referralOfferLane ? <span>{String(recipient.referralOfferLane).replace(/_/g, ' ')}</span> : null}
                                {recipient.referralDestinationDescriptor ? <span>{recipient.referralDestinationDescriptor}</span> : null}
                              </div>
                            </div>
                            <span
                              className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold"
                              style={{
                                background: recipient.outcome === 'booked'
                                  ? 'rgba(16,185,129,0.15)'
                                  : recipient.outcome === 'failed' || recipient.outcome === 'bounced'
                                    ? 'rgba(239,68,68,0.15)'
                                    : recipient.outcome === 'clicked' || recipient.outcome === 'opened'
                                      ? 'rgba(6,182,212,0.15)'
                                      : 'rgba(148,163,184,0.15)',
                                color: recipient.outcome === 'booked'
                                  ? '#10B981'
                                  : recipient.outcome === 'failed' || recipient.outcome === 'bounced'
                                    ? '#EF4444'
                                    : recipient.outcome === 'clicked' || recipient.outcome === 'opened'
                                      ? '#06B6D4'
                                      : '#64748B',
                              }}
                            >
                              {String(recipient.outcome).replace(/_/g, ' ')}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="rounded-2xl px-4 py-4 text-sm" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--t3)' }}>
                  I could not load the detailed send breakdown for this campaign right now.
                </div>
              )}
            </div>
          ) : campaigns.length > 0 ? (
            <div className="rounded-2xl px-4 py-4 text-sm" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--t3)' }}>
              Click any campaign row to open its after-send drilldown: channel mix, audience outcomes, and rework/follow-up actions.
            </div>
          ) : null}
        </>
      )}

      {/* Campaign Creator modal */}
      {showCreator && (
        <CampaignCreator
          clubId={clubId}
          initialType={initialType}
          onClose={() => { setShowCreator(false); setInitialType(null) }}
          onSuccess={() => { setShowCreator(false); setInitialType(null) }}
        />
      )}
    </motion.div>
  )
}
