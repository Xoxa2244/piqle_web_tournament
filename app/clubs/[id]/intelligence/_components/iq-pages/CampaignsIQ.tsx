'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion } from 'motion/react'
import { AlertTriangle, ArrowRight, CalendarDays, Check, Clock3, Loader2, Plus, Radar, ShieldAlert, ShieldCheck, Sparkles, TestTube2, Users, X } from 'lucide-react'
import { CampaignKPIs } from './campaigns/CampaignKPIs'
import { CampaignChart } from './campaigns/CampaignChart'
import { CampaignList } from './campaigns/CampaignList'
import { AutomationBanner } from './campaigns/AutomationBanner'
import { CampaignCreator } from './campaigns/CampaignCreator'
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
  const searchParams = useSearchParams()
  const isDemo = searchParams.get('demo') === 'true'
  const [showCreator, setShowCreator] = useState(false)
  const [initialType, setInitialType] = useState<string | null>(null)
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

  const quickActions = (() => {
    const actions = []

    if (reviewReadyDrafts[0]) {
      actions.push({
        key: `review:${reviewReadyDrafts[0].id}`,
        title: 'Review latest draft',
        description: reviewReadyDrafts[0].title || 'Open the most recent campaign draft in Advisor.',
        href: buildCampaignAdvisorHref(clubId, {
          conversationId: reviewReadyDrafts[0].conversationId || null,
          prompt: reviewReadyDrafts[0].originalIntent || undefined,
        }),
      })
    }

    actions.push({
      key: 'reactivation',
      title: 'Draft reactivation push',
      description: 'Build a win-back draft for expired, cancelled, and drifting members.',
      href: buildCampaignAdvisorHref(clubId, {
        prompt: 'Draft a reactivation campaign for expired and cancelled members. Keep it as a review-ready draft first.',
      }),
    })

    actions.push({
      key: 'guest-conversion',
      title: 'Convert guests',
      description: 'Turn frequent guests and drop-ins into a campaign-ready membership offer.',
      href: buildCampaignAdvisorHref(clubId, {
        prompt: 'Draft a guest conversion campaign for frequent guests and drop-ins. Keep it in draft for review before sending.',
      }),
    })

    if (pilotHealth?.recommendation) {
      actions.push({
        key: 'rework-risky',
        title: 'Rework risky live action',
        description: pilotHealth.recommendation.reason,
        href: buildCampaignAdvisorHref(clubId, {
          prompt: `Draft a safer ${pilotHealth.recommendation.label.toLowerCase()} alternative with a tighter audience and gentler copy. Keep it in draft only.`,
        }),
      })
    } else {
      actions.push({
        key: 'vip-protect',
        title: 'Protect VIP members',
        description: 'Draft a high-touch campaign for unlimited and high-value members.',
        href: buildCampaignAdvisorHref(clubId, {
          prompt: 'Draft a VIP appreciation campaign for our unlimited and high-value members. Keep it as a review-ready draft first.',
        }),
      })
    }

    return actions.slice(0, 4)
  })()

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
      {/* Automation status */}
      <AutomationBanner clubId={clubId} />

      {/* Header + New Campaign */}
      <div className="flex items-center justify-between">
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--heading)' }}>Campaigns</h1>
        <button
          onClick={() => setShowCreator(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:scale-[1.02]"
          style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)' }}
        >
          <Plus className="w-4 h-4" /> New Campaign
        </button>
      </div>

      <div
        className="rounded-3xl p-5 md:p-6 space-y-5"
        style={{
          background: 'linear-gradient(135deg, rgba(139,92,246,0.16), rgba(6,182,212,0.08))',
          border: '1px solid rgba(139,92,246,0.18)',
          boxShadow: 'var(--card-shadow)',
        }}
      >
        {/* Hide the operator-facing "Agent Campaign Layer" hero (rollout
            posture, draft queue, live pilot health) in demo mode — those
            counts are operational metadata that all read as zeros without
            a live agent, which makes the AI look broken to a demo viewer.
            Quick Starts and Referral sections still render below. */}
        {!isDemo && (
        <>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-semibold" style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--heading)' }}>
              <Sparkles className="w-3.5 h-3.5" />
              Agent Campaign Layer
            </div>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--heading)' }}>Campaign control, draft review, and live pilot health</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--t2)', maxWidth: 760 }}>
                Advisor drafts, rollout posture, blocked live sends, and pilot outcomes now sit on top of the campaigns surface instead of living in separate corners of the product.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
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

        <div className="grid gap-4 xl:grid-cols-3">
          <div
            className="rounded-2xl p-4 space-y-4"
            style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--t4)' }}>Draft queue</div>
                <div className="text-lg font-bold mt-1" style={{ color: 'var(--heading)' }}>{campaignDrafts.length} agent campaign drafts</div>
              </div>
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.14)', color: '#8B5CF6' }}>
                <Clock3 className="w-5 h-5" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Review ready', value: reviewReadyDrafts.length },
                { label: 'Sandboxed', value: sandboxedDrafts.length },
                { label: 'Scheduled', value: scheduledDrafts.length },
                { label: 'Blocked', value: blockedDrafts.length },
              ].map((item) => (
                <div key={item.label} className="rounded-xl px-3 py-2.5" style={{ background: 'var(--subtle)' }}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--t4)' }}>{item.label}</div>
                  <div className="text-xl font-bold mt-1" style={{ color: 'var(--heading)' }}>{item.value}</div>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              {latestDrafts.length === 0 ? (
                <div className="rounded-xl px-3 py-3 text-sm" style={{ background: 'var(--subtle)', color: 'var(--t3)' }}>
                  No campaign drafts are waiting right now. Use the quick starts below to seed a new one in Advisor.
                </div>
              ) : latestDrafts.map((draft: any) => {
                const draftStatusStyle = DRAFT_STATUS_STYLES[draft.status] || DRAFT_STATUS_STYLES.draft_saved
                return (
                  <Link
                    key={draft.id}
                    href={buildCampaignAdvisorHref(clubId, {
                      conversationId: draft.conversationId || null,
                      prompt: draft.originalIntent || undefined,
                    })}
                    className="block rounded-xl px-3 py-3 transition-all hover:translate-x-[2px]"
                    style={{ background: 'var(--subtle)' }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate" style={{ color: 'var(--heading)' }}>
                          {draft.title || formatCampaignDraftKind(draft.kind)}
                        </div>
                        <div className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
                          {formatCampaignDraftKind(draft.kind)} · {formatRelativeTime(draft.updatedAt)}
                        </div>
                      </div>
                      <span
                        className="px-2 py-1 rounded-full text-[10px] font-semibold shrink-0"
                        style={{ background: draftStatusStyle.bg, color: draftStatusStyle.color }}
                      >
                        {draftStatusStyle.label}
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>

          <div
            className="rounded-2xl p-4 space-y-4"
            style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--t4)' }}>Live rollout</div>
                <div className="text-lg font-bold mt-1" style={{ color: 'var(--heading)' }}>
                  {rolloutStatus?.summary || 'Shadow-only until rollout is armed'}
                </div>
              </div>
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center"
                style={{
                  background: rolloutStatus?.clubAllowlisted ? 'rgba(16,185,129,0.14)' : 'rgba(245,158,11,0.14)',
                  color: rolloutStatus?.clubAllowlisted ? '#10B981' : '#F59E0B',
                }}
              >
                {rolloutStatus?.clubAllowlisted ? <ShieldCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl px-3 py-2.5" style={{ background: 'var(--subtle)' }}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--t4)' }}>Allowlist</div>
                <div className="text-base font-bold mt-1" style={{ color: 'var(--heading)' }}>
                  {rolloutStatus?.clubAllowlisted ? 'Live enabled' : rolloutStatus?.envAllowlistConfigured ? 'Waiting on superadmin' : 'No env allowlist'}
                </div>
              </div>
              <div className="rounded-xl px-3 py-2.5" style={{ background: 'var(--subtle)' }}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--t4)' }}>Armed actions</div>
                <div className="text-base font-bold mt-1" style={{ color: 'var(--heading)' }}>
                  {rolloutStatus?.enabledActionKinds?.length || 0} live types armed
                </div>
              </div>
            </div>

            {rolloutFriction.length > 0 ? (
              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--t4)' }}>Recent rollout friction</div>
                {rolloutFriction.slice(0, 3).map((record: any) => (
                  <div key={record.id} className="rounded-xl px-3 py-3" style={{ background: 'var(--subtle)' }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-sm" style={{ color: 'var(--heading)' }}>{record.summary}</div>
                      <span
                        className="px-2 py-1 rounded-full text-[10px] font-semibold shrink-0"
                        style={{
                          background: record.result === 'blocked' ? 'rgba(239,68,68,0.14)' : 'rgba(245,158,11,0.14)',
                          color: record.result === 'blocked' ? '#EF4444' : '#F59E0B',
                        }}
                      >
                        {record.result === 'blocked' ? 'Blocked' : 'Shadowed'}
                      </span>
                    </div>
                    <div className="text-xs mt-2" style={{ color: 'var(--t3)' }}>
                      {formatRelativeTime(record.createdAt)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl px-3 py-3 text-sm" style={{ background: 'var(--subtle)', color: 'var(--t3)' }}>
                No recent blocked or shadowed outreach sends. Rollout posture looks clean from this page.
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Link
                href={`/clubs/${clubId}/intelligence/settings`}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:translate-x-[2px]"
                style={{ background: 'rgba(139,92,246,0.14)', color: '#8B5CF6' }}
              >
                Open settings <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          <div
            className="rounded-2xl p-4 space-y-4"
            style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--t4)' }}>Live pilot health</div>
                <div className="text-lg font-bold mt-1" style={{ color: 'var(--heading)' }}>
                  {pilotHealth?.summary || 'No live outreach outcomes in the last 14d.'}
                </div>
              </div>
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: pilotStyle.bg, color: pilotStyle.color }}>
                <Radar className="w-5 h-5" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl px-3 py-2.5" style={{ background: 'var(--subtle)' }}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--t4)' }}>Top live action</div>
                <div className="text-base font-bold mt-1" style={{ color: 'var(--heading)' }}>
                  {pilotHealth?.topAction?.label || 'No clear leader yet'}
                </div>
              </div>
              <div className="rounded-xl px-3 py-2.5" style={{ background: 'var(--subtle)' }}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--t4)' }}>Bookings</div>
                <div className="text-base font-bold mt-1" style={{ color: 'var(--heading)' }}>
                  {pilotHealth?.totals?.converted || 0} booked from live sends
                </div>
              </div>
            </div>

            {pilotHealth?.recommendation ? (
              <div
                className="rounded-xl px-3 py-3 space-y-2"
                style={{
                  background: pilotHealth.recommendation.health === 'at_risk' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)',
                  border: `1px solid ${pilotHealth.recommendation.health === 'at_risk' ? 'rgba(239,68,68,0.16)' : 'rgba(245,158,11,0.16)'}`,
                }}
              >
                <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: pilotHealth.recommendation.health === 'at_risk' ? '#EF4444' : '#F59E0B' }}>
                  <AlertTriangle className="w-4 h-4" />
                  Shadow-back recommendation
                </div>
                <div className="text-sm" style={{ color: 'var(--heading)' }}>
                  {pilotHealth.recommendation.reason}
                </div>
              </div>
            ) : (
              <div className="rounded-xl px-3 py-3 text-sm" style={{ background: 'var(--subtle)', color: 'var(--t3)' }}>
                No action currently needs to move back to shadow. This is a good place to monitor live campaign quality before widening rollout.
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Link
                href={buildCampaignAdvisorHref(clubId, {
                  prompt: pilotHealth?.topAction
                    ? `Draft another ${pilotHealth.topAction.label.toLowerCase()} based on our recent strongest live outreach, but keep it in review-ready draft mode first.`
                    : 'Draft a high-confidence campaign for our best current audience. Keep it as a review-ready draft first.',
                })}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:translate-x-[2px]"
                style={{ background: 'rgba(6,182,212,0.14)', color: '#06B6D4' }}
              >
                <TestTube2 className="w-3.5 h-3.5" />
                Draft from live signal
              </Link>
            </div>
          </div>
        </div>
        </>
        )}

      </div>

      {!summary ? (
        <CampaignSuggestions
          clubId={clubId}
          onSelectType={(type) => {
            setInitialType(type)
            setShowCreator(true)
          }}
        />
      ) : (
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
