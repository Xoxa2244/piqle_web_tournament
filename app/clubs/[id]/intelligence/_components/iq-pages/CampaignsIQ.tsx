'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { motion } from 'motion/react'
import { AlertTriangle, ArrowRight, CalendarDays, Check, Clock3, Loader2, Plus, Radar, ShieldAlert, ShieldCheck, Sparkles, TestTube2, Users, X, BarChart3 } from 'lucide-react'
import { CampaignKPIs } from './campaigns/CampaignKPIs'
import { CampaignChart } from './campaigns/CampaignChart'
import { CampaignList } from './campaigns/CampaignList'
// P1-T5: AutomationBanner removed — equivalent automation status now lives
// in Settings → Automation page (AgentCampaignLayer column 2: Live Rollout).
// Kept commented for traceability:
//   import { AutomationBanner } from './campaigns/AutomationBanner'
// P2-T9: CampaignCreator removed — replaced everywhere by CampaignWizard.
// P4-T1: New 4-step Campaign Wizard
import { CampaignWizard } from '../CampaignWizard'
// P4-T6: Active Campaigns table (lightweight)
import { ActiveCampaignsTable } from '../ActiveCampaignsTable'
import { CampaignsInsightsDrawer } from '../CampaignsInsightsDrawer'
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
  // P4-T7: Campaign Wizard drawer (replaces "+ New Campaign" entry).
  const [showWizard, setShowWizard] = useState(false)
  // P2-T9: pre-fill the wizard's Goal step when launched from an
  // AI-Recommended card. Mapped from the legacy CHECK_IN/etc enum.
  const [wizardInitialGoal, setWizardInitialGoal] = useState<'reactivate_dormant' | 'onboard_new' | 'promote_event' | 'upsell_tier' | 'renewal_reminder' | 'custom' | null>(null)
  // P2-T9: Insights drawer hosts Send Volume + legacy by-type event log,
  // moved off the main page.
  const [showInsights, setShowInsights] = useState(false)
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

      {/* Header + Insights / New Campaign CTAs */}
      <div className="flex items-center justify-between">
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--heading)' }}>Campaigns</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowInsights(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm transition-all"
            style={{
              background: 'var(--subtle)',
              color: 'var(--t2)',
              fontWeight: 600,
              border: '1px solid var(--card-border)',
            }}
          >
            <BarChart3 className="w-4 h-4" />
            Insights
          </button>
          <button
            onClick={() => setShowWizard(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:scale-[1.02]"
            style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)' }}
          >
            <Plus className="w-4 h-4" /> New Campaign
          </button>
        </div>
      </div>

      {/* P2-T9: Compact KPI strip — replaces the bigger CampaignKPIs block
          that used to live below the gradient panel. Always visible at the
          top of the page so admins see the week's pulse without scrolling. */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(() => {
            const totalSent = summary.totalSent ?? 0
            const opens = variantData?.totalOpens ?? 0
            const clicks = variantData?.totalClicks ?? 0
            const openRate = totalSent > 0 ? Math.round((opens / totalSent) * 100) : 0
            const clickRate = totalSent > 0 ? Math.round((clicks / totalSent) * 100) : 0
            const attributedCents = (campaignListData as any)?.attributedRevenueCents ?? 0
            const attributedDisplay = attributedCents >= 100_000
              ? `$${(attributedCents / 100_000).toFixed(1)}K`
              : `$${Math.round(attributedCents / 100)}`
            const tiles = [
              { label: 'Sent (this week)', value: String(summary.thisWeek ?? 0), sub: `${totalSent} in last 30d total` },
              { label: 'Open rate', value: `${openRate}%`, sub: `${opens.toLocaleString()} opens` },
              { label: 'Click rate', value: `${clickRate}%`, sub: `${clicks.toLocaleString()} clicks` },
              { label: '$ attributed', value: attributedDisplay, sub: 'last 30 days' },
            ]
            return tiles.map((t) => (
              <div
                key={t.label}
                className="rounded-2xl p-3"
                style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
              >
                <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--t4)', fontWeight: 600 }}>
                  {t.label}
                </div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--heading)' }}>{t.value}</div>
                <div className="text-[10px] mt-0.5" style={{ color: 'var(--t4)' }}>{t.sub}</div>
              </div>
            ))
          })()}
        </div>
      )}

      {/* P4-T1: Campaign Wizard drawer.
          P5-T5 fix #5: initialCohortId wired from ?cohortId= URL param
          (set by Cohort Builder's "Save + Create Campaign →"). */}
      {showWizard && (
        <CampaignWizard
          clubId={clubId}
          initialCohortId={wizardInitialCohortId}
          initialGoal={wizardInitialGoal}
          onClose={() => {
            setShowWizard(false)
            setWizardInitialCohortId(null)
            setWizardInitialGoal(null)
          }}
        />
      )}

      {/* P1-T4: AI-Recommended Campaigns lifted to top — first content block.
          P2-T9: "Preview & Launch" now opens the new CampaignWizard with the
          mapped Goal pre-filled (was opening the deprecated CampaignCreator). */}
      <CampaignSuggestions
        clubId={clubId}
        onSelectType={(type) => {
          // Map the legacy AI-suggestion enum (CHECK_IN/RETENTION_BOOST/...)
          // to the wizard's CampaignGoal vocabulary.
          const map: Record<string, typeof wizardInitialGoal> = {
            CHECK_IN: 'reactivate_dormant',
            RETENTION_BOOST: 'reactivate_dormant',
            REACTIVATION: 'reactivate_dormant',
            SLOT_FILLER: 'promote_event',
            EVENT_INVITE: 'promote_event',
            NEW_MEMBER_WELCOME: 'onboard_new',
          }
          setWizardInitialGoal(map[type] ?? 'custom')
          setShowWizard(true)
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


      {/* P2-T9: Insights drawer — Send Volume + legacy by-type event log
          live here now, off the main page so the focus stays on
          AI-Recommended → Active → History. */}
      <CampaignsInsightsDrawer
        open={showInsights}
        onClose={() => setShowInsights(false)}
        byDay={byDay ?? []}
        campaigns={campaigns}
        campaignListLoading={campaignListLoading}
        clubId={clubId}
        advisorDrafts={campaignDrafts}
        outreachMode={outreachMode}
        rolloutStatus={rolloutStatus}
        pilotHealth={pilotHealth}
        onCampaignClick={(campaign) => setSelectedCampaign(campaign)}
      />
    </motion.div>
  )
}
