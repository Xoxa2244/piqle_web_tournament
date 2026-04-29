'use client'
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { motion, useInView, AnimatePresence } from "motion/react";
import { trpc } from "@/lib/trpc";
import {
  Users, Search, Heart, Clock, Check, Loader2,
  CalendarDays, DollarSign, Mail,
  Smartphone, ArrowUpRight, ArrowDownRight, UserPlus,
  Target, LayoutGrid, List, Sparkles, ChevronRight,
  AlertTriangle, Filter as FilterIcon, BarChart3, ChevronDown, X as XIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SmsComingSoon, DuprBadge } from './shared/SmsBadge'
import { useAdminTodoDecisions, useSetAdminTodoDecision, useUpdateReferralRewardIssuance, useMemberKpiDeltas, useListCohorts, useChurnTrend } from '../../_hooks/use-intelligence'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, ComposedChart, Legend,
} from "recharts";
import { useTheme } from "../IQThemeProvider";
import { EmptyStateIQ } from "./EmptyStateIQ";
import { MembersReactivationSection } from "./MembersReactivationSection";
import { PlayerProfileIQ } from "./PlayerProfileIQ";
import { MemberDetailDrawer } from "../MemberDetailDrawer";
import { MembersFilterDrawer } from "../MembersFilterDrawer";
import { MembersChartsDrawer } from "../MembersChartsDrawer";
import { AIInsightRibbon } from "../AIInsightRibbon";
import type { GuestTrialExecutionContext } from "@/lib/ai/guest-trial-offers";
import type { ReferralExecutionContext } from "@/lib/ai/referral-offers";


type Segment = "all" | "power" | "regular" | "casual" | "at-risk" | "critical";

interface Member {
  id: string;
  name: string;
  avatar: string;
  email: string;
  phone: string;
  rating: number;
  sport: string;
  segment: Exclude<Segment, "all">;
  healthScore: number;
  sessionsThisMonth: number;
  totalSessions: number;
  memberSince: string;
  lastPlayed: string;
  revenue: number;
  trend: "up" | "down" | "stable";
  favoriteTime: string;
  favoriteFormat: string;
  activityLevel: 'power' | 'regular' | 'casual' | 'occasional';
  engagementTrend: 'growing' | 'stable' | 'declining' | 'churning';
  valueTier: 'high' | 'medium' | 'low';
  avgSessionsPerWeek: number;
  totalRevenue: number;
  membershipType: string | null;
  membershipStatus: string | null;
  normalizedMembershipType: string | null;
  normalizedMembershipStatus: string | null;
  suggestedAction: string;
}


const segmentConfig: Record<Exclude<Segment, "all">, { color: string; bg: string; label: string; tooltip: string }> = {
  power: { color: "#8B5CF6", bg: "rgba(139,92,246,0.1)", label: "Power Player", tooltip: "4+ sessions/week, health score 80+" },
  regular: { color: "#06B6D4", bg: "rgba(6,182,212,0.1)", label: "Regular", tooltip: "2-3 sessions/week, consistent attendance" },
  casual: { color: "#10B981", bg: "rgba(16,185,129,0.1)", label: "Casual", tooltip: "1 session/week or less, still active" },
  "at-risk": { color: "#F59E0B", bg: "rgba(245,158,11,0.1)", label: "At-Risk", tooltip: "Declining frequency, health score 25-49" },
  critical: { color: "#EF4444", bg: "rgba(239,68,68,0.1)", label: "Critical", tooltip: "Health score below 25, immediate attention needed" },
};

const activityColors: Record<string, { bg: string; text: string }> = {
  power: { bg: "rgba(139,92,246,0.15)", text: "#A78BFA" },
  regular: { bg: "rgba(6,182,212,0.15)", text: "#22D3EE" },
  casual: { bg: "rgba(16,185,129,0.15)", text: "#10B981" },
  occasional: { bg: "rgba(148,163,184,0.15)", text: "#94A3B8" },
};
const activityLabels: Record<string, string> = { power: 'Power Player', regular: 'Regular', casual: 'Casual', occasional: 'Occasional' };
const trendColors: Record<string, { bg: string; text: string }> = {
  growing: { bg: "rgba(16,185,129,0.15)", text: "#10B981" },
  stable: { bg: "rgba(6,182,212,0.1)", text: "#67E8F9" },
  declining: { bg: "rgba(245,158,11,0.15)", text: "#F59E0B" },
  churning: { bg: "rgba(239,68,68,0.15)", text: "#EF4444" },
};

const normalizedMembershipTypeLabels: Record<string, string> = {
  guest: 'Guest',
  drop_in: 'Drop-In',
  trial: 'Trial',
  package: 'Package',
  monthly: 'Monthly',
  unlimited: 'VIP / Unlimited',
  discounted: 'Discounted',
  insurance: 'Insurance',
  staff: 'Staff',
  unknown: 'Unknown',
}

const normalizedMembershipStatusLabels: Record<string, string> = {
  active: 'Active',
  suspended: 'Suspended',
  expired: 'Expired',
  cancelled: 'Cancelled',
  trial: 'Trial',
  guest: 'Guest',
  none: 'No Membership',
  unknown: 'Unknown',
}

const normalizedMembershipStatusStyles: Record<string, { bg: string; text: string }> = {
  active: { bg: "rgba(16,185,129,0.15)", text: "#10B981" },
  suspended: { bg: "rgba(245,158,11,0.15)", text: "#F59E0B" },
  expired: { bg: "rgba(239,68,68,0.15)", text: "#EF4444" },
  cancelled: { bg: "rgba(239,68,68,0.15)", text: "#F97316" },
  trial: { bg: "rgba(6,182,212,0.15)", text: "#06B6D4" },
  guest: { bg: "rgba(148,163,184,0.15)", text: "#94A3B8" },
  none: { bg: "rgba(148,163,184,0.15)", text: "#94A3B8" },
  unknown: { bg: "rgba(148,163,184,0.15)", text: "#94A3B8" },
}

function formatNormalizedMembershipType(value: string | null | undefined) {
  if (!value || value === 'unknown') return null
  return normalizedMembershipTypeLabels[value] || value
}

function formatNormalizedMembershipStatus(value: string | null | undefined) {
  if (!value || value === 'unknown') return null
  return normalizedMembershipStatusLabels[value] || value
}

function getNormalizedMembershipStatusStyle(value: string | null | undefined) {
  return normalizedMembershipStatusStyles[value || 'unknown'] || normalizedMembershipStatusStyles.unknown
}

interface MembersAgentAction {
  key: string
  title: string
  description: string
  count: number
  href: string
  tone: string
  Icon: LucideIcon
}

type SmartFirstSessionStage = 'book_first_session' | 'book_second_session' | 'convert_after_first_session'
type GuestTrialBookingStage = 'book_first_visit' | 'protect_first_show_up' | 'convert_to_paid'
type WinBackStage = 'expired_membership' | 'cancelled_membership' | 'high_value_lapsed'
type ReferralLane = 'vip_advocate' | 'social_regular' | 'dormant_advocate'

interface SmartFirstSessionCandidate {
  memberId: string
  name: string
  email: string | null
  score: number
  stage: SmartFirstSessionStage
  urgency: 'low' | 'medium' | 'high'
  daysSinceJoined: number
  daysSinceFirstBooking: number | null
  confirmedBookings: number
  normalizedMembershipType: string
  normalizedMembershipStatus: string
  topReason: string
  nextBestMove: string
}

interface SmartFirstSessionData {
  summary: {
    totalCandidates: number
    firstBookingCount: number
    secondSessionCount: number
    conversionReadyCount: number
    averageScore: number
    summary: string
  }
  candidates: SmartFirstSessionCandidate[]
}

interface GuestTrialBookingCandidate {
  memberId: string
  name: string
  email: string | null
  score: number
  stage: GuestTrialBookingStage
  urgency: 'low' | 'medium' | 'high'
  daysSinceJoined: number
  daysUntilNextBooking: number | null
  daysSinceFirstPlayed: number | null
  confirmedBookings: number
  playedConfirmedBookings: number
  normalizedMembershipType: string
  normalizedMembershipStatus: string
  recommendedOffer: {
    key: string
    name: string
    kind: string
    descriptor: string
    destinationDescriptor: string
    generated?: boolean
  } | null
  topReason: string
  nextBestMove: string
}

interface GuestTrialBookingData {
  summary: {
    totalCandidates: number
    firstBookingCount: number
    showUpProtectionCount: number
    paidConversionCount: number
    averageScore: number
    summary: string
    offers: {
      firstVisit: { name: string; descriptor: string; destinationDescriptor: string } | null
      showUpProtection: { name: string; descriptor: string; destinationDescriptor: string } | null
      paidConversion: { name: string; descriptor: string; destinationDescriptor: string } | null
    }
    offerLoop: Array<{
      key: string
      stage: GuestTrialBookingStage
      name: string
      descriptor: string
      destinationType: string
      destinationDescriptor: string
      candidateCount: number
      outcomeCount: number
      baseCount: number
      rate: number
      outcomeLabel: string
      summary: string
      status: 'healthy' | 'watch' | 'at_risk'
    }>
    routeLoop: Array<{
      key: string
      destinationType: string
      destinationDescriptor: string
      stageCount: number
      stages: GuestTrialBookingStage[]
      offerNames: string[]
      candidateCount: number
      outcomeCount: number
      baseCount: number
      rate: number
      outcomeLabel: string
      summary: string
      status: 'healthy' | 'watch' | 'at_risk'
    }>
    funnel: {
      entrantCount: number
      bookedCount: number
      showedUpCount: number
      paidCount: number
      bookingRate: number
      showUpRate: number
      paidConversionRate: number
      summary: string
    }
  }
  candidates: GuestTrialBookingCandidate[]
}

interface WinBackCandidate {
  memberId: string
  name: string
  email: string | null
  score: number
  stage: WinBackStage
  urgency: 'low' | 'medium' | 'high'
  daysSinceLastBooking: number
  confirmedBookings: number
  normalizedMembershipType: string
  normalizedMembershipStatus: string
  topReason: string
  nextBestMove: string
}

interface WinBackSnapshotData {
  summary: {
    totalCandidates: number
    expiredCount: number
    cancelledCount: number
    lapsedCount: number
    averageScore: number
    summary: string
    laneLoop: Array<{
      key: string
      stage: WinBackStage
      title: string
      candidateCount: number
      outcomeCount: number
      baseCount: number
      rate: number
      outcomeLabel: string
      summary: string
      status: 'healthy' | 'watch' | 'at_risk'
    }>
  }
  candidates: WinBackCandidate[]
}

interface ReferralCandidate {
  memberId: string
  name: string
  email: string | null
  score: number
  lane: ReferralLane
  urgency: 'low' | 'medium' | 'high'
  daysSinceLastBooking: number
  confirmedBookings: number
  recentConfirmedBookings: number
  activeCoPlayers: number
  totalCoPlayers: number
  normalizedMembershipType: string
  normalizedMembershipStatus: string
  recommendedOffer?: {
    key: string
    name: string
    descriptor: string
    destinationDescriptor: string
    destinationType?: string | null
  } | null
  topReason: string
  nextBestMove: string
}

interface ReferralSnapshotData {
  summary: {
    totalCandidates: number
    vipAdvocateCount: number
    socialRegularCount: number
    dormantAdvocateCount: number
    averageScore: number
    summary: string
    offers: {
      vipAdvocate: { key: string; name: string; descriptor: string; destinationDescriptor: string } | null
      socialRegular: { key: string; name: string; descriptor: string; destinationDescriptor: string } | null
      dormantAdvocate: { key: string; name: string; descriptor: string; destinationDescriptor: string } | null
    }
    laneLoop: Array<{
      key: string
      lane: ReferralLane
      title: string
      candidateCount: number
      outcomeCount: number
      baseCount: number
      rate: number
      outcomeLabel: string
      summary: string
      status: 'healthy' | 'watch' | 'at_risk'
    }>
    offerLoop: Array<{
      key: string
      lane: ReferralLane
      name: string
      descriptor: string
      destinationType: string
      destinationDescriptor: string
      candidateCount: number
      outcomeCount: number
      baseCount: number
      rate: number
      outcomeLabel: string
      summary: string
      status: 'healthy' | 'watch' | 'at_risk'
    }>
    routeLoop: Array<{
      key: string
      destinationType: string
      destinationDescriptor: string
      laneCount: number
      candidateCount: number
      outcomeCount: number
      baseCount: number
      rate: number
      lanes: ReferralLane[]
      offerNames: string[]
      outcomeLabel: string
      summary: string
      status: 'healthy' | 'watch' | 'at_risk'
    }>
    outcomeFunnel: {
      askCount: number
      engagedCount: number
      intentCount: number
      strongSignalCount: number
      engagementRate: number
      intentRate: number
      strongSignalRate: number
      summary: string
    }
    outcomeLoop: Array<{
      key: string
      lane: ReferralLane
      title: string
      askCount: number
      engagedCount: number
      intentCount: number
      strongSignalCount: number
      rate: number
      outcomeLabel: string
      summary: string
      status: 'idle' | 'healthy' | 'watch' | 'at_risk'
    }>
    rewardSummary: string
    rewardLoop: Array<{
      key: string
      lane: ReferralLane
      offerName: string
      rewardLabel: string
      destinationDescriptor: string
      askCount: number
      engagedCount: number
      intentCount: number
      strongSignalCount: number
      reviewCount: number
      rate: number
      summary: string
      status: 'quiet' | 'in_flight' | 'ready_review'
    }>
    rewardIssuance: {
      readyCount: number
      reviewCount: number
      blockedCount: number
      holdCount: number
      issuedCount: number
      summary: string
    }
    referredGuestFunnel: {
      capturedCount: number
      bookedCount: number
      showedUpCount: number
      paidCount: number
      bookingRate: number
      showUpRate: number
      paidConversionRate: number
      summary: string
    }
    funnel: {
      socialReachCount: number
      activeAdvocateCount: number
      dormantAdvocateCount: number
      highConfidenceCount: number
      activeAdvocateRate: number
      referralReadyRate: number
      summary: string
    }
  }
  candidates: ReferralCandidate[]
  referredGuests: Array<{
    guestUserId: string
    name: string
    email: string | null
    advocateUserId: string | null
    advocateName: string | null
    advocateEmail: string | null
    stage: 'captured' | 'booked_first_visit' | 'showed_up' | 'converted_to_paid'
    stageLabel: string
    capturedAt: string | Date | null
    lastTouchAt: string | Date | null
    confirmedBookings: number
    playedConfirmedBookings: number
    normalizedMembershipType: string
    normalizedMembershipStatus: string
    sourceOfferName: string | null
    sourceLane: ReferralLane | null
    sourceRouteDescriptor: string | null
    guestOfferName: string | null
    guestStage: 'book_first_visit' | 'protect_first_show_up' | 'convert_to_paid' | null
    guestDestinationDescriptor: string | null
    guestDestinationType: string | null
    guestTrialContext: any | null
    nextBestMove: string
  }>
  rewardIssuances: Array<{
    key: string
    advocateUserId: string
    advocateName: string
    advocateEmail: string | null
    referredGuestUserId: string
    referredGuestName: string
    referredGuestEmail: string | null
    offerKey: string
    offerName: string
    rewardLabel: string
    lane: ReferralLane
    destinationDescriptor: string | null
    status: 'ready_issue' | 'on_hold' | 'issued'
    guardrailStatus: 'clean' | 'review' | 'blocked'
    guardrailReasons: string[]
    guardrailSummary: string
    autoIssueSuggested: boolean
    duplicateRisk: boolean
    abuseRisk: boolean
    issuedAt: string | Date | null
    reviewedAt: string | Date | null
    updatedAt: string | Date | null
    summary: string
    nextBestMove: string
  }>
  rewardLedger: Array<{
    advocateUserId: string
    advocateName: string
    advocateEmail: string | null
    totalRewards: number
    readyCount: number
    reviewCount: number
    blockedCount: number
    holdCount: number
    issuedCount: number
    lastRewardLabel: string | null
    lastGuestName: string | null
    lastUpdatedAt: string | Date | null
    summary: string
  }>
}

const smartFirstSessionStageLabels: Record<SmartFirstSessionStage, string> = {
  book_first_session: 'Needs first booking',
  book_second_session: 'Needs second session',
  convert_after_first_session: 'Ready to convert',
}

const smartFirstSessionStageStyles: Record<SmartFirstSessionStage, { bg: string; text: string }> = {
  book_first_session: { bg: 'rgba(6,182,212,0.15)', text: '#06B6D4' },
  book_second_session: { bg: 'rgba(139,92,246,0.15)', text: '#8B5CF6' },
  convert_after_first_session: { bg: 'rgba(16,185,129,0.15)', text: '#10B981' },
}

const guestTrialStageLabels: Record<GuestTrialBookingStage, string> = {
  book_first_visit: 'Needs first visit',
  protect_first_show_up: 'Protect first show-up',
  convert_to_paid: 'Ready for paid step',
}

const guestTrialStageStyles: Record<GuestTrialBookingStage, { bg: string; text: string }> = {
  book_first_visit: { bg: 'rgba(6,182,212,0.15)', text: '#06B6D4' },
  protect_first_show_up: { bg: 'rgba(245,158,11,0.15)', text: '#F59E0B' },
  convert_to_paid: { bg: 'rgba(16,185,129,0.15)', text: '#10B981' },
}

const smartFirstSessionUrgencyStyles: Record<'low' | 'medium' | 'high', { bg: string; text: string; label: string }> = {
  low: { bg: 'rgba(148,163,184,0.15)', text: '#94A3B8', label: 'Low urgency' },
  medium: { bg: 'rgba(245,158,11,0.15)', text: '#F59E0B', label: 'Medium urgency' },
  high: { bg: 'rgba(239,68,68,0.15)', text: '#EF4444', label: 'High urgency' },
}

const winBackStageLabels: Record<WinBackStage, string> = {
  expired_membership: 'Expired',
  cancelled_membership: 'Cancelled',
  high_value_lapsed: 'High-Value Lapsed',
}

const winBackStageStyles: Record<WinBackStage, { bg: string; text: string }> = {
  expired_membership: { bg: 'rgba(239,68,68,0.15)', text: '#EF4444' },
  cancelled_membership: { bg: 'rgba(249,115,22,0.15)', text: '#F97316' },
  high_value_lapsed: { bg: 'rgba(139,92,246,0.15)', text: '#8B5CF6' },
}

const referralLaneLabels: Record<ReferralLane, string> = {
  vip_advocate: 'VIP Advocate',
  social_regular: 'Social Regular',
  dormant_advocate: 'Dormant Advocate',
}

const referralLaneStyles: Record<ReferralLane, { bg: string; text: string }> = {
  vip_advocate: { bg: 'rgba(245,158,11,0.15)', text: '#F59E0B' },
  social_regular: { bg: 'rgba(6,182,212,0.15)', text: '#06B6D4' },
  dormant_advocate: { bg: 'rgba(139,92,246,0.15)', text: '#8B5CF6' },
}

const referredGuestStageStyles: Record<
  'captured' | 'booked_first_visit' | 'showed_up' | 'converted_to_paid',
  { bg: string; text: string; label: string }
> = {
  captured: { bg: 'rgba(6,182,212,0.15)', text: '#06B6D4', label: 'Captured' },
  booked_first_visit: { bg: 'rgba(245,158,11,0.15)', text: '#F59E0B', label: 'Booked' },
  showed_up: { bg: 'rgba(139,92,246,0.15)', text: '#8B5CF6', label: 'Showed up' },
  converted_to_paid: { bg: 'rgba(16,185,129,0.15)', text: '#10B981', label: 'Paid' },
}

const suggestionDecisionStyles: Record<'accepted' | 'declined' | 'not_now', { bg: string; text: string; label: string }> = {
  accepted: { bg: 'rgba(16,185,129,0.14)', text: '#10B981', label: 'Accepted' },
  not_now: { bg: 'rgba(245,158,11,0.14)', text: '#F59E0B', label: 'Not now' },
  declined: { bg: 'rgba(239,68,68,0.14)', text: '#EF4444', label: 'Declined' },
}

const guestTrialOfferLoopStatusStyles: Record<'healthy' | 'watch' | 'at_risk', { bg: string; text: string; label: string }> = {
  healthy: { bg: 'rgba(16,185,129,0.14)', text: '#10B981', label: 'Healthy' },
  watch: { bg: 'rgba(245,158,11,0.14)', text: '#F59E0B', label: 'Watch' },
  at_risk: { bg: 'rgba(239,68,68,0.14)', text: '#EF4444', label: 'At Risk' },
}

const winBackLaneStatusStyles: Record<'healthy' | 'watch' | 'at_risk', { bg: string; text: string; label: string }> = {
  healthy: { bg: 'rgba(16,185,129,0.14)', text: '#10B981', label: 'Healthy' },
  watch: { bg: 'rgba(245,158,11,0.14)', text: '#F59E0B', label: 'Watch' },
  at_risk: { bg: 'rgba(239,68,68,0.14)', text: '#EF4444', label: 'At Risk' },
}

const referralLaneStatusStyles: Record<'idle' | 'healthy' | 'watch' | 'at_risk', { bg: string; text: string; label: string }> = {
  idle: { bg: 'rgba(148,163,184,0.14)', text: '#94A3B8', label: 'Idle' },
  healthy: { bg: 'rgba(16,185,129,0.14)', text: '#10B981', label: 'Healthy' },
  watch: { bg: 'rgba(245,158,11,0.14)', text: '#F59E0B', label: 'Watch' },
  at_risk: { bg: 'rgba(239,68,68,0.14)', text: '#EF4444', label: 'At Risk' },
}

const referralRewardStatusStyles: Record<'quiet' | 'in_flight' | 'ready_review', { bg: string; text: string; label: string }> = {
  quiet: { bg: 'rgba(148,163,184,0.14)', text: '#94A3B8', label: 'Quiet' },
  in_flight: { bg: 'rgba(6,182,212,0.14)', text: '#06B6D4', label: 'In Flight' },
  ready_review: { bg: 'rgba(245,158,11,0.14)', text: '#F59E0B', label: 'Needs Review' },
}

const referralRewardIssuanceStyles: Record<'ready_issue' | 'on_hold' | 'issued', { bg: string; text: string; label: string }> = {
  ready_issue: { bg: 'rgba(16,185,129,0.14)', text: '#10B981', label: 'Ready to Issue' },
  on_hold: { bg: 'rgba(245,158,11,0.14)', text: '#F59E0B', label: 'On Hold' },
  issued: { bg: 'rgba(59,130,246,0.14)', text: '#3B82F6', label: 'Issued' },
}

const referralRewardGuardrailStyles: Record<'clean' | 'review' | 'blocked', { bg: string; text: string; label: string }> = {
  clean: { bg: 'rgba(16,185,129,0.14)', text: '#10B981', label: 'Clean' },
  review: { bg: 'rgba(245,158,11,0.14)', text: '#F59E0B', label: 'Needs Review' },
  blocked: { bg: 'rgba(239,68,68,0.14)', text: '#EF4444', label: 'Blocked' },
}

type GuestTrialSuggestionAction = 'first_visit' | 'show_up' | 'paid_conversion'

interface GuestTrialSuggestion {
  key: string
  stage: GuestTrialBookingStage
  title: string
  description: string
  count: number
  href: string
  action: GuestTrialSuggestionAction
  tone: { bg: string; text: string }
}

function buildMembersAudienceContext(input: {
  view: "all" | "at-risk" | "reactivation"
  searchQuery: string
  filterActivity: string
  filterRisk: string
  filterTrend: string
  filterValue: string
  filterMembershipType: string
  filterMembershipStatus: string
}) {
  const parts = [
    input.view !== 'all' ? `view ${input.view}` : null,
    input.searchQuery.trim() ? `search "${input.searchQuery.trim()}"` : null,
    input.filterActivity !== 'all' ? `activity ${input.filterActivity}` : null,
    input.filterRisk !== 'all' ? `risk ${input.filterRisk}` : null,
    input.filterTrend !== 'all' ? `trend ${input.filterTrend}` : null,
    input.filterValue !== 'all' ? `value ${input.filterValue}` : null,
    input.filterMembershipType !== 'all' ? `membership tier ${formatNormalizedMembershipType(input.filterMembershipType)}` : null,
    input.filterMembershipStatus !== 'all' ? `membership state ${formatNormalizedMembershipStatus(input.filterMembershipStatus)}` : null,
  ].filter(Boolean)

  return parts.length > 0 ? parts.join(', ') : null
}

function buildMembersAdvisorHref(
  clubId: string,
  prompt: string,
  guestTrialContext?: GuestTrialExecutionContext | null,
  referralContext?: ReferralExecutionContext | null,
) {
  const params = new URLSearchParams({ prompt })
  if (guestTrialContext) {
    params.set('guestTrialContext', JSON.stringify(guestTrialContext))
  }
  if (referralContext) {
    params.set('referralContext', JSON.stringify(referralContext))
  }
  return `/clubs/${clubId}/intelligence/advisor?${params.toString()}`
}

function buildGuestTrialExecutionContext(input: {
  stage: GuestTrialBookingStage
  offer?: {
    key?: string | null
    name?: string | null
    kind?: string | null
    destinationType?: string | null
    destinationDescriptor?: string | null
  } | null
  referralSource?: ReferralExecutionContext | null
}): GuestTrialExecutionContext | null {
  if (!input.offer?.key || !input.offer?.name || !input.offer?.kind || !input.offer?.destinationDescriptor) return null
  if (
    input.offer.kind !== 'guest_pass'
    && input.offer.kind !== 'trial_pass'
    && input.offer.kind !== 'starter_pack'
    && input.offer.kind !== 'paid_intro'
    && input.offer.kind !== 'membership_offer'
  ) {
    return null
  }

  const destinationType = input.offer.destinationType
    || (input.stage === 'book_first_visit'
      ? 'schedule'
      : input.stage === 'protect_first_show_up'
        ? 'manual_follow_up'
        : 'landing_page')

  if (
    destinationType !== 'schedule'
    && destinationType !== 'landing_page'
    && destinationType !== 'external_url'
    && destinationType !== 'manual_follow_up'
  ) {
    return null
  }

  return {
    source: 'guest_trial_booking',
    stage: input.stage,
    offerKey: input.offer.key,
    offerName: input.offer.name,
    offerKind: input.offer.kind,
    destinationType,
    destinationDescriptor: input.offer.destinationDescriptor,
    routeKey: `${destinationType}:${input.offer.destinationDescriptor}`,
    ...(input.referralSource ? { referralSource: input.referralSource } : {}),
  }
}

function buildReferralExecutionContext(input: {
  lane: ReferralLane
  offer?: {
    key?: string | null
    name?: string | null
    kind?: string | null
    destinationType?: string | null
    destinationDescriptor?: string | null
  } | null
  advocate?: {
    userId?: string | null
    name?: string | null
    email?: string | null
  } | null
}): ReferralExecutionContext | null {
  if (!input.offer?.key || !input.offer?.name || !input.offer?.kind || !input.offer?.destinationDescriptor) return null
  if (
    input.offer.kind !== 'bring_a_friend'
    && input.offer.kind !== 'vip_guest_pass'
    && input.offer.kind !== 'trial_invite'
    && input.offer.kind !== 'reward_credit'
    && input.offer.kind !== 'guest_pass'
  ) {
    return null
  }

  const destinationType = input.offer.destinationType
    || (input.lane === 'vip_advocate'
      ? 'landing_page'
      : input.lane === 'dormant_advocate'
        ? 'manual_follow_up'
        : 'schedule')

  if (
    destinationType !== 'schedule'
    && destinationType !== 'landing_page'
    && destinationType !== 'external_url'
    && destinationType !== 'manual_follow_up'
  ) {
    return null
  }

  return {
    source: 'referral_engine',
    lane: input.lane,
    offerKey: input.offer.key,
    offerName: input.offer.name,
    offerKind: input.offer.kind,
    destinationType,
    destinationDescriptor: input.offer.destinationDescriptor,
    routeKey: `${destinationType}:${input.offer.destinationDescriptor}`,
    advocateUserId: input.advocate?.userId || null,
    advocateName: input.advocate?.name || null,
    advocateEmail: input.advocate?.email || null,
  }
}

function buildGuestTrialOfferRemediationPrompt(input: {
  stage: GuestTrialBookingStage
  status: 'healthy' | 'watch' | 'at_risk'
  offerName: string
  descriptor: string
  rate: number
  candidateCount: number
  outcomeCount: number
  baseCount: number
  audienceLabel: string
}) {
  const isRisky = input.status === 'watch' || input.status === 'at_risk'

  if (input.stage === 'book_first_visit') {
    return {
      label: isRisky ? 'Rework first-visit offer' : 'Refine first-visit play',
      prompt: `Rework the guest/trial first-visit motion for ${input.candidateCount} members from ${input.audienceLabel}. ${input.offerName} is the current entry offer (${input.descriptor}) and first-visit booking is running at ${input.rate}% (${input.outcomeCount}/${input.baseCount}). Tighten the offer, reduce booking friction, and keep the first draft review-ready.`,
    }
  }

  if (input.stage === 'protect_first_show_up') {
    return {
      label: isRisky ? 'Tighten show-up reminder' : 'Refine show-up flow',
      prompt: `Rework the guest/trial first-show-up protection flow for ${input.candidateCount} members from ${input.audienceLabel}. ${input.offerName} is the current reminder anchor (${input.descriptor}) and show-up rate is ${input.rate}% (${input.outcomeCount}/${input.baseCount}). Improve reminder timing, expectation-setting, and backup-path logic, then keep the first version review-ready.`,
    }
  }

  return {
    label: isRisky ? 'Rework paid conversion' : 'Refine paid conversion',
    prompt: `Rework the guest/trial paid conversion play for ${input.candidateCount} members from ${input.audienceLabel}. ${input.offerName} is the current conversion offer (${input.descriptor}) and paid conversion is running at ${input.rate}% (${input.outcomeCount}/${input.baseCount}). Tighten the value framing and safest paid next step, then keep the first draft review-ready.`,
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
  stages: GuestTrialBookingStage[]
  offerNames: string[]
  status: 'healthy' | 'watch' | 'at_risk'
  rate: number
  candidateCount: number
  outcomeCount: number
  baseCount: number
  audienceLabel: string
}) {
  const isRisky = input.status === 'watch' || input.status === 'at_risk'
  const routeLabel = formatGuestTrialRouteType(input.destinationType)
  const stageSummary = input.stages.map((stage) => guestTrialStageLabels[stage].toLowerCase()).join(', ')
  const offerSummary = input.offerNames.join(', ')

  if (input.destinationType === 'schedule') {
    return {
      label: isRisky ? 'Tighten booking route' : 'Refine booking route',
      prompt: `Rework the guest/trial booking route for ${input.candidateCount} members from ${input.audienceLabel}. ${input.destinationDescriptor} currently carries ${stageSummary} via ${offerSummary}, and the combined stage rate is ${input.rate}% (${input.outcomeCount}/${input.baseCount}). Reduce booking friction, simplify the next step, and keep the first version review-ready.`,
    }
  }

  if (input.destinationType === 'manual_follow_up') {
    return {
      label: isRisky ? 'Tighten follow-up route' : 'Refine follow-up route',
      prompt: `Rework the guest/trial follow-up route for ${input.candidateCount} members from ${input.audienceLabel}. ${input.destinationDescriptor} currently carries ${stageSummary} via ${offerSummary}, and the combined stage rate is ${input.rate}% (${input.outcomeCount}/${input.baseCount}). Improve reminder timing, make the fallback clearer, and keep the first draft review-ready.`,
    }
  }

  if (input.destinationType === 'external_url') {
    return {
      label: isRisky ? 'Rework external route' : 'Refine external route',
      prompt: `Rework the guest/trial external route for ${input.candidateCount} members from ${input.audienceLabel}. ${input.destinationDescriptor} currently carries ${stageSummary} via ${offerSummary}, and the combined stage rate is ${input.rate}% (${input.outcomeCount}/${input.baseCount}). Reduce click-off friction, strengthen the handoff, and keep the first version review-ready.`,
    }
  }

  return {
    label: isRisky ? 'Rework landing path' : 'Refine landing path',
    prompt: `Rework the guest/trial landing path for ${input.candidateCount} members from ${input.audienceLabel}. ${input.destinationDescriptor} currently carries ${stageSummary} via ${offerSummary}, and the combined stage rate is ${input.rate}% (${input.outcomeCount}/${input.baseCount}). Tighten the offer-to-CTA handoff and keep the first version review-ready.`,
  }
}

function buildWinBackLaneRemediationPrompt(input: {
  stage: WinBackStage
  status: 'healthy' | 'watch' | 'at_risk'
  title: string
  rate: number
  candidateCount: number
  outcomeCount: number
  baseCount: number
  audienceLabel: string
}) {
  const isRisky = input.status === 'watch' || input.status === 'at_risk'

  if (input.stage === 'expired_membership') {
    return {
      label: isRisky ? 'Rework renewal rescue' : 'Refine renewal rescue',
      prompt: `Rework the expired-membership renewal rescue for ${input.candidateCount} members from ${input.audienceLabel}. The current warm-window rate is ${input.rate}% (${input.outcomeCount}/${input.baseCount}) in the "${input.title}" lane. Tighten the renewal framing, lower friction, and keep the first version review-ready.`,
    }
  }

  if (input.stage === 'cancelled_membership') {
    return {
      label: isRisky ? 'Rework cancelled comeback' : 'Refine cancelled comeback',
      prompt: `Rework the cancelled-member comeback flow for ${input.candidateCount} members from ${input.audienceLabel}. The current warm-comeback rate is ${input.rate}% (${input.outcomeCount}/${input.baseCount}) in the "${input.title}" lane. Make the tone softer, reduce commitment friction, and keep the first version review-ready.`,
    }
  }

  return {
    label: isRisky ? 'Rework high-value save' : 'Refine high-value save',
    prompt: `Rework the high-value lapsed save motion for ${input.candidateCount} members from ${input.audienceLabel}. High-intent save rate is ${input.rate}% (${input.outcomeCount}/${input.baseCount}) in the "${input.title}" lane. Increase personalization and comeback specificity, then keep the first draft review-ready.`,
  }
}

function buildReferralLaneRemediationPrompt(input: {
  lane: ReferralLane
  status: 'healthy' | 'watch' | 'at_risk'
  title: string
  rate: number
  candidateCount: number
  outcomeCount: number
  baseCount: number
  audienceLabel: string
}) {
  const isRisky = input.status === 'watch' || input.status === 'at_risk'

  if (input.lane === 'vip_advocate') {
    return {
      label: isRisky ? 'Tighten VIP advocate ask' : 'Refine VIP advocate ask',
      prompt: `Rework the VIP advocate referral motion for ${input.candidateCount} members from ${input.audienceLabel}. The "${input.title}" lane is running at ${input.rate}% (${input.outcomeCount}/${input.baseCount}) for high-trust social reach. Tighten the bring-a-friend framing, keep it premium and low-friction, and keep the first version review-ready.`,
    }
  }

  if (input.lane === 'social_regular') {
    return {
      label: isRisky ? 'Tighten friend invite ask' : 'Refine friend invite ask',
      prompt: `Rework the social regular referral ask for ${input.candidateCount} members from ${input.audienceLabel}. The "${input.title}" lane is running at ${input.rate}% (${input.outcomeCount}/${input.baseCount}) on warm social momentum. Make the invite simpler, more natural, and keep the first version review-ready.`,
    }
  }

  return {
    label: isRisky ? 'Rework dormant advocate restart' : 'Refine dormant advocate restart',
    prompt: `Rework the dormant advocate restart for ${input.candidateCount} members from ${input.audienceLabel}. The "${input.title}" lane is running at ${input.rate}% (${input.outcomeCount}/${input.baseCount}) on comeback network strength. Rebuild the relationship first, then stage the referral ask safely, and keep the first draft review-ready.`,
  }
}

function formatReferralRouteType(destinationType: string) {
  switch (destinationType) {
    case 'schedule':
      return 'Booking route'
    case 'landing_page':
      return 'Referral landing path'
    case 'external_url':
      return 'External invite route'
    case 'manual_follow_up':
      return 'Follow-up route'
    default:
      return 'Invite route'
  }
}

function buildReferralOfferRemediationPrompt(input: {
  lane: ReferralLane
  status: 'healthy' | 'watch' | 'at_risk'
  offerName: string
  descriptor: string
  destinationDescriptor: string
  rate: number
  candidateCount: number
  outcomeCount: number
  baseCount: number
  audienceLabel: string
}) {
  const isRisky = input.status === 'watch' || input.status === 'at_risk'

  if (input.lane === 'vip_advocate') {
    return {
      label: isRisky ? 'Tighten VIP referral offer' : 'Refine VIP referral offer',
      prompt: `Rework the VIP advocate referral offer for ${input.candidateCount} members from ${input.audienceLabel}. ${input.offerName} (${input.descriptor}) currently routes invites through ${input.destinationDescriptor}, and this lane is performing at ${input.rate}% (${input.outcomeCount}/${input.baseCount}). Keep the ask premium, social, and low-friction, then show me the first review-ready version.`,
    }
  }

  if (input.lane === 'dormant_advocate') {
    return {
      label: isRisky ? 'Rework dormant advocate offer' : 'Refine dormant advocate offer',
      prompt: `Rework the dormant advocate referral offer for ${input.candidateCount} members from ${input.audienceLabel}. ${input.offerName} (${input.descriptor}) currently routes the comeback invite through ${input.destinationDescriptor}, and this lane is performing at ${input.rate}% (${input.outcomeCount}/${input.baseCount}). Rebuild the relationship first, then stage the referral ask safely, and keep the first draft review-ready.`,
    }
  }

  return {
    label: isRisky ? 'Tighten friend invite offer' : 'Refine friend invite offer',
    prompt: `Rework the social regular referral offer for ${input.candidateCount} members from ${input.audienceLabel}. ${input.offerName} (${input.descriptor}) currently routes invites through ${input.destinationDescriptor}, and this lane is performing at ${input.rate}% (${input.outcomeCount}/${input.baseCount}). Make the bring-a-friend motion simpler and more natural, then keep the first version review-ready.`,
  }
}

function buildReferralRouteRemediationPrompt(input: {
  destinationType: string
  destinationDescriptor: string
  lanes: ReferralLane[]
  offerNames: string[]
  status: 'healthy' | 'watch' | 'at_risk'
  rate: number
  candidateCount: number
  outcomeCount: number
  baseCount: number
  audienceLabel: string
}) {
  const routeLabel = formatReferralRouteType(input.destinationType)
  const laneSummary = input.lanes.map((lane) => referralLaneLabels[lane]).join(', ')
  const offerSummary = input.offerNames.join(', ')
  const labelPrefix = input.status === 'watch' || input.status === 'at_risk' ? 'Rework' : 'Refine'

  return {
    label: `${labelPrefix} ${routeLabel.toLowerCase()}`,
    prompt: `Rework the referral ${routeLabel.toLowerCase()} for ${input.candidateCount} members from ${input.audienceLabel}. ${input.destinationDescriptor} currently carries ${laneSummary} via ${offerSummary}, and the combined route is performing at ${input.rate}% (${input.outcomeCount}/${input.baseCount}). Reduce friction, tighten the invite-to-booking handoff, and keep the first draft review-ready.`,
  }
}

function buildReferralOutcomeRemediationPrompt(input: {
  lane: ReferralLane
  status: 'idle' | 'healthy' | 'watch' | 'at_risk'
  askCount: number
  engagedCount: number
  intentCount: number
  strongSignalCount: number
  audienceLabel: string
}) {
  const laneLabel = referralLaneLabels[input.lane]

  if (input.status === 'idle') {
    return {
      label: 'Launch live referral ask',
      prompt: `Build the first live referral ask for the ${laneLabel.toLowerCase()} lane from ${input.audienceLabel}. There are no live outcome signals yet, so start with the safest review-ready motion, define the first CTA clearly, and keep the first version easy to approve.`,
    }
  }

  const riskPrefix = input.status === 'at_risk'
    ? 'Rework live referral ask'
    : input.status === 'watch'
      ? 'Tighten live referral ask'
      : 'Scale live referral ask'

  return {
    label: riskPrefix,
    prompt: `Review the live referral outcome loop for the ${laneLabel.toLowerCase()} lane from ${input.audienceLabel}. ${input.askCount} asks went out, ${input.engagedCount} advocates engaged, ${input.intentCount} showed intro intent, and ${input.strongSignalCount} produced the strongest response signals. Rework the ask, timing, and follow-up path so the next live version is safer and more effective, then keep it review-ready.`,
  }
}

function buildReferralRewardReviewPrompt(input: {
  lane: ReferralLane
  offerName: string
  rewardLabel: string
  destinationDescriptor: string
  status: 'quiet' | 'in_flight' | 'ready_review'
  askCount: number
  engagedCount: number
  reviewCount: number
  audienceLabel: string
}) {
  const laneLabel = referralLaneLabels[input.lane]

  if (input.status === 'ready_review') {
    return {
      label: 'Review reward follow-up',
      prompt: `Review referral reward follow-up for ${input.offerName} in the ${laneLabel.toLowerCase()} lane from ${input.audienceLabel}. ${input.reviewCount} advocates show strong enough signals to justify manual reward review. Reward label: ${input.rewardLabel}. Destination route: ${input.destinationDescriptor}. Draft the safest ops-ready follow-up and keep reward issuance manual.`,
    }
  }

  if (input.status === 'in_flight') {
    return {
      label: 'Plan reward ops',
      prompt: `Plan referral reward ops for ${input.offerName} in the ${laneLabel.toLowerCase()} lane from ${input.audienceLabel}. ${input.askCount} asks are in flight and ${input.engagedCount} advocates have engaged so far. Reward label: ${input.rewardLabel}. Destination route: ${input.destinationDescriptor}. Prepare the cleanest manual-review workflow before more advocates qualify.`,
    }
  }

  return {
    label: 'Set reward rubric',
    prompt: `Define the manual reward-review rubric for ${input.offerName} in the ${laneLabel.toLowerCase()} lane from ${input.audienceLabel}. Reward label: ${input.rewardLabel}. Destination route: ${input.destinationDescriptor}. Keep it simple, abuse-aware, and operator-reviewed first.`,
  }
}

function buildReferredGuestFollowUpPrompt(input: {
  guestName: string
  stage: 'captured' | 'booked_first_visit' | 'showed_up' | 'converted_to_paid'
  sourceOfferName: string | null
  sourceLane: ReferralLane | null
  sourceRouteDescriptor: string | null
  guestOfferName: string | null
  guestDestinationDescriptor: string | null
  nextBestMove: string
  audienceLabel: string
}) {
  const sourceLaneLabel = input.sourceLane ? referralLaneLabels[input.sourceLane] : 'Referral'
  const sourceSummary = input.sourceOfferName
    ? `${sourceLaneLabel} via ${input.sourceOfferName}${input.sourceRouteDescriptor ? ` -> ${input.sourceRouteDescriptor}` : ''}`
    : sourceLaneLabel

  if (input.stage === 'captured') {
    return {
      label: 'Draft first-booking follow-up',
      prompt: `Build a referred-guest first-booking follow-up for ${input.guestName} from ${sourceSummary} in ${input.audienceLabel}.${input.guestOfferName ? ` Move them into ${input.guestOfferName}` : ''}${input.guestDestinationDescriptor ? ` via ${input.guestDestinationDescriptor}` : ''}. ${input.nextBestMove} Keep the first version review-ready.`,
    }
  }

  if (input.stage === 'booked_first_visit') {
    return {
      label: 'Protect first show-up',
      prompt: `Build a referred-guest show-up protection flow for ${input.guestName} from ${sourceSummary} in ${input.audienceLabel}. They already booked the first visit.${input.guestDestinationDescriptor ? ` Protect the route through ${input.guestDestinationDescriptor}.` : ''} ${input.nextBestMove} Keep it review-ready and low-friction.`,
    }
  }

  if (input.stage === 'showed_up') {
    return {
      label: 'Draft paid conversion',
      prompt: `Build a referred-guest paid conversion follow-up for ${input.guestName} from ${sourceSummary} in ${input.audienceLabel}. They already showed up once.${input.guestOfferName ? ` Use ${input.guestOfferName} as the conversion context.` : ''} ${input.nextBestMove} Keep the first version review-ready.`,
    }
  }

  return {
    label: 'Review reward handoff',
    prompt: `Review the referral reward handoff for ${input.guestName} from ${sourceSummary} in ${input.audienceLabel}. They already converted to paid. ${input.nextBestMove} Draft the safest operator-ready follow-up, keep reward issuance manual, and preserve the evidence trail.`,
  }
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl p-5 ${className}`} style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", backdropFilter: "var(--glass-blur)", boxShadow: "var(--card-shadow)" }}>
      {children}
    </div>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl px-4 py-3 text-xs" style={{ background: "var(--tooltip-bg)", border: "1px solid var(--tooltip-border)", color: "var(--tooltip-color)", backdropFilter: "blur(12px)" }}>
      <div className="mb-2" style={{ fontWeight: 600 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span style={{ color: "var(--t3)" }}>{p.name}:</span>
          <span style={{ fontWeight: 600 }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

function HealthBar({ score }: { score: number }) {
  const color = score <= 30 ? "#EF4444" : score <= 50 ? "#F59E0B" : score <= 70 ? "#06B6D4" : "#10B981";
  return (
    <div className="flex items-center gap-2">
      <div className="w-14 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--subtle)" }}>
        <div className="h-full rounded-full" style={{ background: color, width: `${score}%` }} />
      </div>
      <span className="text-[10px]" style={{ color, fontWeight: 700 }}>{score}</span>
    </div>
  );
}

function SegmentBadge({ segment }: { segment: Exclude<Segment, "all"> }) {
  const cfg = segmentConfig[segment];
  return (
    <span title={cfg.tooltip} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] cursor-help" style={{ background: cfg.bg, color: cfg.color, fontWeight: 600 }}>
      <div className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.color }} />
      {cfg.label}
    </span>
  );
}

/* ============================================= */
/*              MEMBERS PAGE                      */
/* ============================================= */
type Period = "week" | "month" | "quarter" | "custom";

function getSessionsForPeriod(member: Member, period: Period): number {
  // Mock: derive from sessionsThisMonth
  if (period === "week") return Math.round(member.sessionsThisMonth * 0.28);
  if (period === "month") return member.sessionsThisMonth;
  if (period === "quarter") return Math.round(member.sessionsThisMonth * 2.8);
  return member.sessionsThisMonth;
}

function getPeriodLabel(p: Period): string {
  if (p === "week") return "This Week";
  if (p === "month") return "This Month";
  if (p === "quarter") return "This Quarter";
  return "Custom Range";
}

type MembersIQProps = {
  memberHealthData?: any; // from useMemberHealth
  memberGrowthData?: any; // from useMemberGrowth
  smartFirstSessionData?: SmartFirstSessionData | null;
  guestTrialBookingData?: GuestTrialBookingData | null;
  winBackSnapshot?: WinBackSnapshotData | null;
  referralSnapshot?: ReferralSnapshotData | null;
  isLoading?: boolean;
  sendOutreach?: any;
  clubId?: string;
  reactivationCandidates?: any[];
  aiProfiles?: Record<string, any>;
  onRegenerateProfiles?: () => void;
  sendReactivation?: any;
};

function riskToSegment(risk: string): Exclude<Segment, "all"> {
  if (risk === "healthy") return "power";
  if (risk === "watch") return "regular";
  if (risk === "at_risk") return "at-risk";
  if (risk === "critical") return "critical";
  return "casual";
}

function lifecycleToSegment(stage: string): Exclude<Segment, "all"> {
  if (stage === "active") return "power";
  if (stage === "ramping" || stage === "onboarding") return "regular";
  if (stage === "at_risk") return "at-risk";
  if (stage === "critical" || stage === "churned") return "critical";
  return "casual";
}

function mapRealMembers(data: any): Member[] {
  if (!data?.members) return [];
  return data.members.map((m: any) => ({
    id: m.memberId,
    name: m.member?.name || m.member?.email || "Unknown",
    avatar: (m.member?.name || "??").split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase(),
    email: m.member?.email || "",
    phone: "",
    rating: m.member?.duprRatingDoubles || 0,
    sport: "Pickleball",
    segment: riskToSegment(m.riskLevel),
    healthScore: m.healthScore,
    sessionsThisMonth: m.totalBookings || 0,
    totalSessions: m.totalBookings || 0,
    memberSince: m.joinedDaysAgo ? `${Math.round(m.joinedDaysAgo / 30)}mo ago` : "N/A",
    lastPlayed: m.daysSinceLastBooking != null ? (m.daysSinceLastBooking === 0 ? "Today" : m.daysSinceLastBooking === 1 ? "Yesterday" : `${m.daysSinceLastBooking} days ago`) : "N/A",
    revenue: 0, // not available in health data
    trend: m.trend === "improving" ? "up" as const : m.trend === "declining" ? "down" as const : "stable" as const,
    favoriteTime: "",
    favoriteFormat: "",
    activityLevel: m.segment?.activityLevel || (m.riskLevel === 'healthy' ? 'regular' : 'casual') as Member['activityLevel'],
    engagementTrend: (m.segment?.trend || m.trend || 'stable') as Member['engagementTrend'],
    valueTier: (m.segment?.valueTier || 'medium') as Member['valueTier'],
    avgSessionsPerWeek: m.avgSessionsPerWeek || 0,
    totalRevenue: m.totalRevenue || 0,
    membershipType: m.membershipType || null,
    membershipStatus: m.membershipStatus || null,
    normalizedMembershipType: m.normalizedMembershipType || null,
    normalizedMembershipStatus: m.normalizedMembershipStatus || null,
    suggestedAction: m.suggestedAction || '',
  }));
}

export function MembersIQ({ memberHealthData, memberGrowthData, smartFirstSessionData, guestTrialBookingData, winBackSnapshot, referralSnapshot, isLoading: externalLoading, sendOutreach, clubId, reactivationCandidates, aiProfiles, onRegenerateProfiles, sendReactivation }: MembersIQProps = {}) {
  const { isDark } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const searchParamsForUrl = useSearchParams();
  const guestTrialSuggestionDateKey = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [view, setView] = useState<"all" | "at-risk" | "reactivation">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterActivity, setFilterActivity] = useState<string>("all");
  const [filterRisk, setFilterRisk] = useState<string>("all");
  const [filterTrend, setFilterTrend] = useState<string>("all");
  const [filterValue, setFilterValue] = useState<string>("all");
  const [filterMembershipType, setFilterMembershipType] = useState<string>("all");
  const [filterMembershipStatus, setFilterMembershipStatus] = useState<string>("all");
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"name" | "health" | "revenue" | "sessions">("health");
  // P2-T2: viewMode defaults to "list" (compact rows, scales to 500+ members),
  // persisted per user via localStorage. Grid mode kept as alternative for
  // working with 2-3 members at a time. "Cards" mode planned but not yet
  // distinct from Grid — see SPEC §4 P2-T2.
  const [viewMode, setViewMode] = useState<"list" | "grid" | "cards">(() => {
    if (typeof window === 'undefined') return 'list'
    const stored = window.localStorage.getItem('iq:members:viewMode')
    if (stored === 'list' || stored === 'grid' || stored === 'cards') return stored
    return 'list'
  });
  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [sentMessages, setSentMessages] = useState<Record<string, string>>({});
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const { data: guestTrialSuggestionDecisions = [] } = useAdminTodoDecisions(clubId || '', guestTrialSuggestionDateKey)
  const setAdminTodoDecision = useSetAdminTodoDecision()
  const updateReferralRewardIssuance = useUpdateReferralRewardIssuance()
  // P2-T1: KPI deltas vs previous period (driven by `period` selector).
  const { data: kpiDeltas } = useMemberKpiDeltas(clubId || '', period === 'custom' ? 'month' : period)

  // P2-T6: Churn & reactivation trend (driven by period selector → months).
  const churnMonths = period === 'week' ? 2 : period === 'month' ? 6 : period === 'quarter' ? 12 : 6
  const { data: churnTrendData } = useChurnTrend(clubId || '', churnMonths)

  // P2-T3: Bulk select for "Add to cohort" / "Send campaign" workflows.
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set())
  const [bulkAddCohortOpen, setBulkAddCohortOpen] = useState(false)
  const { data: existingCohortsForBulk = [] } = useListCohorts(clubId || '')

  // P2-T8: Filter & charts drawers replace the prior 6-row inline filter
  // strip + 3-col chart grid that pushed the table below the fold. Filter
  // state lives here; drawers are pure presentation.
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false)
  const [chartsDrawerOpen, setChartsDrawerOpen] = useState(false)
  const [presetMenuOpen, setPresetMenuOpen] = useState(false)

  const clearAllFilters = () => {
    setFilterMembershipStatus('all')
    setFilterMembershipType('all')
    setFilterActivity('all')
    setFilterRisk('all')
    setFilterTrend('all')
    setFilterValue('all')
  }

  // Quick presets — each clears all filters then sets only what the preset
  // implies. Single-axis only by design (current state model has no OR
  // logic, so multi-axis presets would lie about results).
  const applyPreset = (key: string) => {
    clearAllFilters()
    if (key === 'at-risk') setFilterRisk('at-risk')
    else if (key === 'critical') setFilterRisk('critical')
    else if (key === 'vip') setFilterMembershipType('unlimited')
    else if (key === 'trial') setFilterMembershipType('trial')
    else if (key === 'inactive') setFilterActivity('occasional')
    else if (key === 'power') setFilterActivity('power')
    setPage(1)
  }

  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: string; group: string; label: string; onClear: () => void }> = []
    if (filterMembershipStatus !== 'all') {
      chips.push({
        key: 'state',
        group: 'State',
        label: formatNormalizedMembershipStatus(filterMembershipStatus) || filterMembershipStatus,
        onClear: () => setFilterMembershipStatus('all'),
      })
    }
    if (filterMembershipType !== 'all') {
      chips.push({
        key: 'tier',
        group: 'Tier',
        label: formatNormalizedMembershipType(filterMembershipType) || filterMembershipType,
        onClear: () => setFilterMembershipType('all'),
      })
    }
    if (filterActivity !== 'all') {
      const labelMap: Record<string, string> = { power: 'Power', regular: 'Regular', casual: 'Casual', occasional: 'Occasional' }
      chips.push({
        key: 'activity',
        group: 'Activity',
        label: labelMap[filterActivity] || filterActivity,
        onClear: () => setFilterActivity('all'),
      })
    }
    if (filterRisk !== 'all') {
      // Risk uses internal segment values: power→Healthy, regular→Watch
      const labelMap: Record<string, string> = { power: 'Healthy', regular: 'Watch', 'at-risk': 'At-Risk', critical: 'Critical' }
      chips.push({
        key: 'risk',
        group: 'Risk',
        label: labelMap[filterRisk] || filterRisk,
        onClear: () => setFilterRisk('all'),
      })
    }
    if (filterTrend !== 'all') {
      chips.push({
        key: 'trend',
        group: 'Trend',
        label: filterTrend.charAt(0).toUpperCase() + filterTrend.slice(1),
        onClear: () => setFilterTrend('all'),
      })
    }
    if (filterValue !== 'all') {
      const labelMap: Record<string, string> = { high: 'High LTV', medium: 'Mid', low: 'Low' }
      chips.push({
        key: 'value',
        group: 'Value',
        label: labelMap[filterValue] || filterValue,
        onClear: () => setFilterValue('all'),
      })
    }
    return chips
  }, [filterMembershipStatus, filterMembershipType, filterActivity, filterRisk, filterTrend, filterValue])

  const activeFilterCount = activeFilterChips.length

  const currentPresetLabel = useMemo(() => {
    if (activeFilterCount === 0) return 'All members'
    if (activeFilterCount === 1) {
      if (filterRisk === 'at-risk') return 'At-Risk'
      if (filterRisk === 'critical') return 'Critical'
      if (filterMembershipType === 'unlimited') return 'VIP'
      if (filterMembershipType === 'trial') return 'Trial members'
      if (filterActivity === 'occasional') return 'Inactive'
      if (filterActivity === 'power') return 'Power players'
    }
    return 'Custom'
  }, [activeFilterCount, filterRisk, filterMembershipType, filterActivity])

  const toggleMemberSelection = (memberId: string) => {
    setSelectedMemberIds(prev => {
      const next = new Set(prev)
      if (next.has(memberId)) next.delete(memberId)
      else next.add(memberId)
      return next
    })
  }
  const clearMemberSelection = () => setSelectedMemberIds(new Set())

  // P2-T2: persist viewMode preference per user.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('iq:members:viewMode', viewMode)
    }
  }, [viewMode])

  // P2-T4: URL ↔ selectedPlayerId sync for shareable Member Detail drawer.
  // Reading `?member=<userId>` opens the drawer on page load (and from
  // direct/shared links). Browser back closes the drawer because the
  // URL param is part of history.
  useEffect(() => {
    const fromUrl = searchParamsForUrl?.get('member') ?? null
    if (fromUrl !== selectedPlayerId) {
      setSelectedPlayerId(fromUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParamsForUrl])

  const openMemberDrawer = (memberId: string) => {
    setSelectedPlayerId(memberId)
    if (pathname) {
      const next = new URLSearchParams(searchParamsForUrl?.toString() ?? '')
      next.set('member', memberId)
      router.replace(`${pathname}?${next.toString()}`, { scroll: false })
    }
  }
  const closeMemberDrawer = () => {
    setSelectedPlayerId(null)
    if (pathname) {
      const next = new URLSearchParams(searchParamsForUrl?.toString() ?? '')
      next.delete('member')
      const qs = next.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    }
  }
  const [activeReferralRewardIssuanceKey, setActiveReferralRewardIssuanceKey] = useState<string | null>(null)

  const handleOutreach = (memberId: string, channel: "email" | "sms", member: Member) => {
    if (sendOutreach && clubId) {
      sendOutreach.mutate({
        clubId,
        memberId,
        type: "CHECK_IN",
        channel,
        healthScore: member.healthScore,
        riskLevel: member.segment === "at-risk" ? "at_risk" : member.segment === "critical" ? "critical" : "healthy",
      }, {
        onSuccess: () => setSentMessages(prev => ({ ...prev, [memberId]: channel })),
      });
    } else {
      // Mock mode — just show sent state
      setSentMessages(prev => ({ ...prev, [memberId]: channel }));
    }
  };

  // Use real data — no mock fallback
  const realMembers = mapRealMembers(memberHealthData);
  const allMembers = realMembers.length > 0 ? realMembers : [];

  // Counts for Quick view presets — shown next to each item in the
  // dropdown so admin sees the size of each segment before clicking.
  const presetCounts = useMemo(() => ({
    all: allMembers.length,
    'at-risk': allMembers.filter(m => m.segment === 'at-risk').length,
    critical: allMembers.filter(m => m.segment === 'critical').length,
    vip: allMembers.filter(m => m.normalizedMembershipType === 'unlimited').length,
    trial: allMembers.filter(m => m.normalizedMembershipType === 'trial').length,
    inactive: allMembers.filter(m => m.activityLevel === 'occasional').length,
    power: allMembers.filter(m => m.activityLevel === 'power').length,
  }), [allMembers])

  // Member growth chart — from real data
  const displayMemberGrowth = memberGrowthData?.growth?.length
    ? memberGrowthData.growth.map((g: any) => ({
        month: new Date(g.month + '-01').toLocaleDateString('en-US', { month: 'short' }),
        total: g.total, new: g.new, churned: g.churned,
      }))
    : [];

  // Activity distribution — derive from real member sessions data
  const displayActivityDistribution = realMembers.length > 0
    ? (() => {
        const ranges = [{ range: "0", min: 0, max: 0 }, { range: "1-2", min: 1, max: 2 }, { range: "3-4", min: 3, max: 4 }, { range: "5-6", min: 5, max: 6 }, { range: "7-8", min: 7, max: 8 }, { range: "9+", min: 9, max: 999 }];
        return ranges.map(r => ({ range: r.range, count: realMembers.filter((m: any) => m.sessionsThisMonth >= r.min && m.sessionsThisMonth <= r.max).length }));
      })()
    : [];

  const filtered = allMembers
    .filter((m) => {
      // At-risk subtab: only show at-risk + critical segments
      if (view === "at-risk" && m.segment !== "at-risk" && m.segment !== "critical") return false;
      if (filterActivity !== "all" && m.activityLevel !== filterActivity) return false;
      if (filterRisk !== "all" && m.segment !== filterRisk) return false;
      if (filterTrend !== "all" && m.engagementTrend !== filterTrend) return false;
      if (filterValue !== "all" && m.valueTier !== filterValue) return false;
      if (filterMembershipType !== "all" && m.normalizedMembershipType !== filterMembershipType) return false;
      if (filterMembershipStatus !== "all" && m.normalizedMembershipStatus !== filterMembershipStatus) return false;
      if (searchQuery && !m.name.toLowerCase().includes(searchQuery.toLowerCase()) && !m.email.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "health") return b.healthScore - a.healthScore;
      if (sortBy === "revenue") return b.revenue - a.revenue;
      if (sortBy === "sessions") return b.sessionsThisMonth - a.sessionsThisMonth;
      return 0;
    });

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const audienceMembers = filtered.length > 0 ? filtered : allMembers;
  const audienceContext = buildMembersAudienceContext({
    view,
    searchQuery,
    filterActivity,
    filterRisk,
    filterTrend,
    filterValue,
    filterMembershipType,
    filterMembershipStatus,
  });
  const audienceLabel = audienceContext
    ? `the current Members view (${audienceMembers.length} members, ${audienceContext})`
    : `the current member base (${audienceMembers.length} members)`;

  const guestAudienceCount = audienceMembers.filter((m) =>
    ['guest', 'drop_in'].includes(m.normalizedMembershipType || '') || ['guest', 'none'].includes(m.normalizedMembershipStatus || '')
  ).length;
  const trialAudienceCount = audienceMembers.filter((m) =>
    m.normalizedMembershipType === 'trial' || m.normalizedMembershipStatus === 'trial'
  ).length;
  const renewalAudienceCount = audienceMembers.filter((m) =>
    ['expired', 'cancelled', 'suspended'].includes(m.normalizedMembershipStatus || '')
  ).length;
  const packageAudienceCount = audienceMembers.filter((m) => m.normalizedMembershipType === 'package').length;
  const vipAtRiskAudienceCount = audienceMembers.filter((m) =>
    m.normalizedMembershipType === 'unlimited' && ['at-risk', 'critical'].includes(m.segment)
  ).length;
  const smartFirstSessionSummary = smartFirstSessionData?.summary || null;
  const smartFirstSessionCandidates = smartFirstSessionData?.candidates || [];
  const guestTrialSummary = guestTrialBookingData?.summary || null;
  const guestTrialCandidates = useMemo(
    () => guestTrialBookingData?.candidates || [],
    [guestTrialBookingData?.candidates],
  );
  const guestTrialOffers = guestTrialSummary?.offers || null;
  const guestTrialOfferLoop = guestTrialSummary?.offerLoop || [];
  const guestTrialRouteLoop = guestTrialSummary?.routeLoop || [];
  const winBackSummary = winBackSnapshot?.summary || null;
  const winBackLaneLoop = winBackSummary?.laneLoop || [];
  const winBackCandidates = winBackSnapshot?.candidates || [];
  const referralSummary = referralSnapshot?.summary || null;
  const referralOffers = referralSummary?.offers || null;
  const referralOutcomeFunnel = referralSummary?.outcomeFunnel || null;
  const referralLaneLoop = referralSummary?.laneLoop || [];
  const referralOfferLoop = referralSummary?.offerLoop || [];
  const referralRouteLoop = referralSummary?.routeLoop || [];
  const referralOutcomeLoop = referralSummary?.outcomeLoop || [];
  const referralRewardLoop = referralSummary?.rewardLoop || [];
  const referralRewardSummary = referralSummary?.rewardSummary || '';
  const referralRewardIssuanceSummary = referralSummary?.rewardIssuance || null;
  const referralReferredGuestFunnel = referralSummary?.referredGuestFunnel || null;
  const referralCandidates = referralSnapshot?.candidates || [];
  const referralReferredGuests = referralSnapshot?.referredGuests || [];
  const referralRewardIssuances = referralSnapshot?.rewardIssuances || [];
  const referralRewardLedger = referralSnapshot?.rewardLedger || [];
  const referralHasLiveTracking = Boolean(
    (referralOutcomeFunnel?.askCount || 0) > 0
      || referralRewardLoop.length > 0
      || referralRewardIssuances.length > 0
      || (referralReferredGuestFunnel?.capturedCount || 0) > 0,
  );
  const smartFirstSessionPrimaryPrompt = smartFirstSessionSummary && smartFirstSessionSummary.totalCandidates > 0
    ? `Build a Smart First Session plan for ${smartFirstSessionSummary.totalCandidates} newcomer members. ${smartFirstSessionSummary.firstBookingCount} still need a first booking, ${smartFirstSessionSummary.secondSessionCount} need a second session, and ${smartFirstSessionSummary.conversionReadyCount} are ready for a paid next step. Keep the first version review-ready and segment the plan by those three stages.`
    : null;
  const smartFirstSessionRefinePrompt = smartFirstSessionCandidates[0]
    ? `Draft the safest next move for ${smartFirstSessionCandidates[0].name}. They are in the "${smartFirstSessionStageLabels[smartFirstSessionCandidates[0].stage].toLowerCase()}" stage. Reason: ${smartFirstSessionCandidates[0].topReason} Keep it review-ready first.`
    : null;
  const guestTrialPrimaryPrompt = guestTrialSummary && guestTrialSummary.totalCandidates > 0
    ? `Build a guest and trial booking plan for ${guestTrialSummary.totalCandidates} members. ${guestTrialSummary.firstBookingCount} still need their first visit${guestTrialOffers?.firstVisit ? ` and should start with ${guestTrialOffers.firstVisit.descriptor} via ${guestTrialOffers.firstVisit.destinationDescriptor}` : ''}, ${guestTrialSummary.showUpProtectionCount} have a first booking that needs show-up protection${guestTrialOffers?.showUpProtection ? ` around ${guestTrialOffers.showUpProtection.name} through ${guestTrialOffers.showUpProtection.destinationDescriptor}` : ''}, and ${guestTrialSummary.paidConversionCount} are ready for a paid next step${guestTrialOffers?.paidConversion ? ` through ${guestTrialOffers.paidConversion.descriptor} via ${guestTrialOffers.paidConversion.destinationDescriptor}` : ''}. Keep the first version review-ready and segment the plan by those three stages.`
    : null;
  const guestTrialRefinePrompt = guestTrialCandidates[0]
    ? `Draft the safest guest/trial move for ${guestTrialCandidates[0].name}. They are in the "${guestTrialStageLabels[guestTrialCandidates[0].stage].toLowerCase()}" lane.${guestTrialCandidates[0].recommendedOffer ? ` Use ${guestTrialCandidates[0].recommendedOffer.descriptor} as the primary offer and route them through ${guestTrialCandidates[0].recommendedOffer.destinationDescriptor}.` : ''} Reason: ${guestTrialCandidates[0].topReason} Keep it review-ready first.`
    : null;
  const guestTrialRefineContext = guestTrialCandidates[0]?.recommendedOffer
    ? buildGuestTrialExecutionContext({
        stage: guestTrialCandidates[0].stage,
        offer: guestTrialCandidates[0].recommendedOffer,
      })
    : null;
  const guestTrialRefineHref = guestTrialRefinePrompt
    ? buildMembersAdvisorHref(clubId || '', guestTrialRefinePrompt, guestTrialRefineContext)
    : null;
  const winBackPrimaryPrompt = winBackSummary && winBackSummary.totalCandidates > 0
    ? `Build a win-back plan for ${winBackSummary.totalCandidates} members. ${winBackSummary.expiredCount} have expired memberships, ${winBackSummary.cancelledCount} are cancelled, and ${winBackSummary.lapsedCount} are high-value lapsed members who have gone quiet. Keep the first version review-ready and segment the plan by those three stages.`
    : null;
  const winBackRefinePrompt = winBackCandidates[0]
    ? `Draft the safest win-back move for ${winBackCandidates[0].name}. They are in the "${winBackStageLabels[winBackCandidates[0].stage].toLowerCase()}" lane. Reason: ${winBackCandidates[0].topReason} Keep it review-ready first.`
    : null;
  const referralPrimaryPrompt = referralSummary && referralSummary.totalCandidates > 0
    ? `Build a referral engine plan for ${referralSummary.totalCandidates} members. ${referralSummary.vipAdvocateCount} are VIP advocates${referralOffers?.vipAdvocate ? ` and should lead with ${referralOffers.vipAdvocate.descriptor} via ${referralOffers.vipAdvocate.destinationDescriptor}` : ''}, ${referralSummary.socialRegularCount} are active social regulars${referralOffers?.socialRegular ? ` and should use ${referralOffers.socialRegular.descriptor} via ${referralOffers.socialRegular.destinationDescriptor}` : ''}, and ${referralSummary.dormantAdvocateCount} are dormant advocates worth restarting before the referral ask${referralOffers?.dormantAdvocate ? ` with ${referralOffers.dormantAdvocate.descriptor} through ${referralOffers.dormantAdvocate.destinationDescriptor}` : ''}. Keep the first version review-ready and segment it by those three lanes.`
    : null;
  const topReferralCandidate = referralCandidates[0] || null
  const referralRefinePrompt = topReferralCandidate
    ? `Draft the safest referral move for ${topReferralCandidate.name}. They are in the "${referralLaneLabels[topReferralCandidate.lane].toLowerCase()}" lane.${topReferralCandidate.recommendedOffer ? ` Use ${topReferralCandidate.recommendedOffer.descriptor} and route the invite through ${topReferralCandidate.recommendedOffer.destinationDescriptor}.` : ''} Reason: ${topReferralCandidate.topReason} Keep it review-ready first.`
    : null;
  const guestTrialSuggestionMap = useMemo(() => {
    const initialMap: Record<string, 'accepted' | 'declined' | 'not_now'> = {}
    return guestTrialSuggestionDecisions.reduce((acc: Record<string, 'accepted' | 'declined' | 'not_now'>, record: any) => {
      if (record.bucket !== 'guest_trial_booking') return acc
      if (record.decision === 'accepted' || record.decision === 'declined' || record.decision === 'not_now') {
        acc[record.itemId] = record.decision
      }
      return acc
    }, initialMap)
  }, [guestTrialSuggestionDecisions])
  const guestTrialSuggestions: GuestTrialSuggestion[] = useMemo(() => {
    if (!guestTrialSummary || !clubId) return []

    const stageLead = (stage: GuestTrialBookingStage) => guestTrialCandidates.find((candidate) => candidate.stage === stage)
    const suggestions: GuestTrialSuggestion[] = []

    if (guestTrialSummary.firstBookingCount > 0) {
      const lead = stageLead('book_first_visit')
      const offerText = guestTrialOffers?.firstVisit ? `Lead with ${guestTrialOffers.firstVisit.descriptor} via ${guestTrialOffers.firstVisit.destinationDescriptor}.` : 'Lead with the easiest first-visit offer.'
      const prompt = `Build a guest and trial first-visit plan for ${guestTrialSummary.firstBookingCount} members from ${audienceLabel}. Focus on removing booking friction, creating one obvious next step, and keep the first draft review-ready.${guestTrialOffers?.firstVisit ? ` Use ${guestTrialOffers.firstVisit.descriptor} as the lead offer and send them through ${guestTrialOffers.firstVisit.destinationDescriptor}.` : ''}${lead ? ` Start with ${lead.name} because ${lead.topReason}` : ''}`
      suggestions.push({
        key: 'guest-trial-book-first-visit',
        stage: 'book_first_visit',
        title: 'Book the first visit',
        description: `${guestTrialSummary.firstBookingCount} guests or trials still have no first visit on the calendar. ${offerText}`,
        count: guestTrialSummary.firstBookingCount,
        href: buildMembersAdvisorHref(
          clubId,
          prompt,
          buildGuestTrialExecutionContext({
            stage: 'book_first_visit',
            offer: guestTrialOffers?.firstVisit || lead?.recommendedOffer || null,
          }),
        ),
        action: 'first_visit',
        tone: guestTrialStageStyles.book_first_visit,
      })
    }

    if (guestTrialSummary.showUpProtectionCount > 0) {
      const lead = stageLead('protect_first_show_up')
      const offerText = guestTrialOffers?.showUpProtection ? `Anchor reminders around ${guestTrialOffers.showUpProtection.name} via ${guestTrialOffers.showUpProtection.destinationDescriptor}.` : 'Protect the booking with the easiest reminder flow.'
      const prompt = `Build a guest and trial first-show-up protection plan for ${guestTrialSummary.showUpProtectionCount} members from ${audienceLabel}. Focus on confirmation, expectation-setting, and one safe backup path.${guestTrialOffers?.showUpProtection ? ` Use ${guestTrialOffers.showUpProtection.descriptor} as the core offer context and route them through ${guestTrialOffers.showUpProtection.destinationDescriptor}.` : ''}${lead ? ` Start with ${lead.name} because ${lead.topReason}` : ''} Keep the first version review-ready.`
      suggestions.push({
        key: 'guest-trial-protect-show-up',
        stage: 'protect_first_show_up',
        title: 'Protect the first show-up',
        description: `${guestTrialSummary.showUpProtectionCount} guests or trials already booked once but still need help actually making it to court. ${offerText}`,
        count: guestTrialSummary.showUpProtectionCount,
        href: buildMembersAdvisorHref(
          clubId,
          prompt,
          buildGuestTrialExecutionContext({
            stage: 'protect_first_show_up',
            offer: guestTrialOffers?.showUpProtection || lead?.recommendedOffer || null,
          }),
        ),
        action: 'show_up',
        tone: guestTrialStageStyles.protect_first_show_up,
      })
    }

    if (guestTrialSummary.paidConversionCount > 0) {
      const lead = stageLead('convert_to_paid')
      const offerText = guestTrialOffers?.paidConversion ? `Convert with ${guestTrialOffers.paidConversion.descriptor} via ${guestTrialOffers.paidConversion.destinationDescriptor}.` : 'Convert through the safest paid next step.'
      const prompt = `Build a guest and trial paid conversion plan for ${guestTrialSummary.paidConversionCount} warm members from ${audienceLabel}. Focus on converting after a positive first-play experience and keep the first draft review-ready.${guestTrialOffers?.paidConversion ? ` Use ${guestTrialOffers.paidConversion.descriptor} as the primary conversion offer and route them through ${guestTrialOffers.paidConversion.destinationDescriptor}.` : ''}${lead ? ` Start with ${lead.name} because ${lead.topReason}` : ''}`
      suggestions.push({
        key: 'guest-trial-convert-to-paid',
        stage: 'convert_to_paid',
        title: 'Convert to the paid tier',
        description: `${guestTrialSummary.paidConversionCount} guests or trials already showed up and are warm enough for the first paid step. ${offerText}`,
        count: guestTrialSummary.paidConversionCount,
        href: buildMembersAdvisorHref(
          clubId,
          prompt,
          buildGuestTrialExecutionContext({
            stage: 'convert_to_paid',
            offer: guestTrialOffers?.paidConversion || lead?.recommendedOffer || null,
          }),
        ),
        action: 'paid_conversion',
        tone: guestTrialStageStyles.convert_to_paid,
      })
    }

    return suggestions
  }, [audienceLabel, clubId, guestTrialCandidates, guestTrialOffers, guestTrialSummary])

  const handleGuestTrialSuggestionDecision = async (options: {
    itemId: string
    title: string
    href: string
    decision: 'accepted' | 'declined' | 'not_now'
    metadata?: Record<string, unknown>
  }) => {
    if (!clubId) return
    await setAdminTodoDecision.mutateAsync({
      clubId,
      dateKey: guestTrialSuggestionDateKey,
      itemId: options.itemId,
      decision: options.decision,
      title: options.title,
      bucket: 'guest_trial_booking',
      href: options.href,
      metadata: options.metadata,
    })
  }

  const handleGuestTrialSuggestionAccept = async (suggestion: GuestTrialSuggestion) => {
    await handleGuestTrialSuggestionDecision({
      itemId: suggestion.key,
      title: suggestion.title,
      href: suggestion.href,
      decision: 'accepted',
      metadata: { action: suggestion.action, stage: suggestion.stage },
    })
    router.push(suggestion.href)
  }

  const handleReferralRewardIssuanceUpdate = async (issuance: ReferralSnapshotData['rewardIssuances'][number], status: 'ready_issue' | 'on_hold' | 'issued') => {
    if (!clubId) return
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

  const membersAgentActions: MembersAgentAction[] = [
    guestTrialSummary && guestTrialSummary.totalCandidates > 0 ? {
      key: 'guest-trial-booking',
      title: 'Launch Guest / Trial Booking',
      description: 'Move guests and trial members from first booking to first show-up and then into the easiest paid step.',
      count: guestTrialSummary.totalCandidates,
      href: buildMembersAdvisorHref(
        clubId || '',
        `Build a guest and trial booking plan for ${guestTrialSummary.totalCandidates} members from ${audienceLabel}. Segment the draft into first booking, first show-up protection, and paid conversion, then keep the safest review-ready version first.`
          + `${guestTrialOffers?.firstVisit ? ` Use ${guestTrialOffers.firstVisit.descriptor} as the default first-visit offer and route them through ${guestTrialOffers.firstVisit.destinationDescriptor}.` : ''}`
          + `${guestTrialOffers?.paidConversion ? ` Convert warm members through ${guestTrialOffers.paidConversion.descriptor} via ${guestTrialOffers.paidConversion.destinationDescriptor}.` : ''}`
      ),
      tone: 'from-cyan-500/20 to-emerald-500/10',
      Icon: Check,
    } : null,
    referralSummary && referralSummary.totalCandidates > 0 ? {
      key: 'referral-engine',
      title: 'Launch Referral Engine',
      description: 'Turn VIP advocates, social regulars, and dormant advocates into staged bring-a-friend and restart flows.',
      count: referralSummary.totalCandidates,
      href: buildMembersAdvisorHref(
        clubId || '',
        `Build a referral plan for ${referralSummary.totalCandidates} members from ${audienceLabel}. Segment the draft into VIP advocates, social regulars, and dormant advocates, then keep the safest review-ready version first.`
      ),
      tone: 'from-amber-500/20 to-cyan-500/10',
      Icon: Users,
    } : null,
    winBackSummary && winBackSummary.totalCandidates > 0 ? {
      key: 'win-back',
      title: 'Launch Win-Back',
      description: 'Target expired, cancelled, and high-value lapsed members with a staged comeback plan.',
      count: winBackSummary.totalCandidates,
      href: buildMembersAdvisorHref(
        clubId || '',
        `Build a win-back plan for ${winBackSummary.totalCandidates} members from ${audienceLabel}. Segment the draft into expired memberships, cancelled memberships, and high-value lapsed players, then keep the safest review-ready version first.`
      ),
      tone: 'from-rose-500/20 to-violet-500/10',
      Icon: Mail,
    } : null,
    renewalAudienceCount > 0 ? {
      key: 'renewal',
      title: 'Renew Expired Members',
      description: 'Build a renewal or win-back sequence for expired, cancelled, or suspended members.',
      count: renewalAudienceCount,
      href: buildMembersAdvisorHref(
        clubId || '',
        `Create a renewal and reactivation outreach plan for ${renewalAudienceCount} members from ${audienceLabel}. Segment the draft by expired, cancelled, and suspended status, and show me the safest review-ready version first.`
      ),
      tone: 'from-red-500/20 to-orange-500/10',
      Icon: Heart,
    } : null,
    vipAtRiskAudienceCount > 0 ? {
      key: 'vip-retention',
      title: 'Protect VIP Members',
      description: 'Draft a white-glove retention move for high-value unlimited members showing churn risk.',
      count: vipAtRiskAudienceCount,
      href: buildMembersAdvisorHref(
        clubId || '',
        `Review ${vipAtRiskAudienceCount} VIP or unlimited members from ${audienceLabel} who are showing watch, at-risk, or critical signals. Create a white-glove retention plan and draft the outreach, with the highest-value members first.`
      ),
      tone: 'from-amber-500/20 to-rose-500/10',
      Icon: Sparkles,
    } : null,
    trialAudienceCount > 0 ? {
      key: 'trial-follow-up',
      title: 'Follow Up Trials',
      description: 'Turn trial players into repeat players with a targeted follow-up flow.',
      count: trialAudienceCount,
      href: buildMembersAdvisorHref(
        clubId || '',
        `Create a trial follow-up sequence for ${trialAudienceCount} trial members from ${audienceLabel}. Focus on getting them into the right next session and show me the review-ready draft first.`
      ),
      tone: 'from-cyan-500/20 to-violet-500/10',
      Icon: CalendarDays,
    } : null,
    guestAudienceCount > 0 ? {
      key: 'guest-conversion',
      title: 'Convert Guests',
      description: 'Draft a conversion play for guests and drop-ins to move them into a first paid tier.',
      count: guestAudienceCount,
      href: buildMembersAdvisorHref(
        clubId || '',
        `Create a guest conversion campaign for ${guestAudienceCount} guest or drop-in members from ${audienceLabel}. Recommend the best first paid offer, then draft the outreach in review-ready form.`
          + `${guestTrialOffers?.paidConversion ? ` Start from ${guestTrialOffers.paidConversion.descriptor} via ${guestTrialOffers.paidConversion.destinationDescriptor}.` : ''}`
      ),
      tone: 'from-emerald-500/20 to-cyan-500/10',
      Icon: UserPlus,
    } : null,
    packageAudienceCount > 0 ? {
      key: 'package-upsell',
      title: 'Upsell Package Holders',
      description: 'Identify package members who are good candidates for monthly or unlimited plans.',
      count: packageAudienceCount,
      href: buildMembersAdvisorHref(
        clubId || '',
        `Review ${packageAudienceCount} package members from ${audienceLabel}. Suggest who should be upsold to monthly or unlimited, explain why, and draft the safest outreach path first.`
      ),
      tone: 'from-violet-500/20 to-fuchsia-500/10',
      Icon: DollarSign,
    } : null,
  ].filter(Boolean) as MembersAgentAction[];

  const activeMember = allMembers.find((m) => m.id === selectedMember);

  const hasData = allMembers.length > 0;
  if (!hasData && !externalLoading) {
    return <EmptyStateIQ icon={Users} title="No members yet" description="Import session data with player names to track member health, engagement, and retention." ctaLabel="Import Data" ctaHref={clubId ? `/clubs/${clubId}/intelligence` : undefined} />;
  }

  // P2-T4: PlayerProfileIQ used to be rendered as a full-page replacement
  // here. Now wrapped in <MemberDetailDrawer> at the bottom of the return
  // tree so the Members list stays visible behind the drawer.

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6 max-w-[1400px] mx-auto"
    >
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 800, color: "var(--heading)" }}>Members</h1>
          <p className="text-sm mt-1" style={{ color: "var(--t3)" }}>360° member profiles with health scores and segments</p>
        </div>
        <div className="flex items-center gap-2">
          {/* P2-T8: Insights moved here from the toolbar — it's a "look at the
              data" CTA, not a list-affecting filter, so it sits next to the
              other page-level CTAs (Add Member). */}
          <button
            onClick={() => setChartsDrawerOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm transition-all"
            style={{
              background: "var(--subtle)",
              color: "var(--t2)",
              fontWeight: 600,
              border: "1px solid var(--card-border)",
            }}
          >
            <BarChart3 className="w-4 h-4" />
            Insights
          </button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm text-white"
            style={{ background: "linear-gradient(135deg, #8B5CF6, #06B6D4)", fontWeight: 600, boxShadow: "0 4px 15px rgba(139,92,246,0.3)" }}
          >
            <UserPlus className="w-4 h-4" />
            Add Member
          </motion.button>
        </div>
      </div>

      {/* View Subtabs */}
      {(() => {
        const atRiskCount = allMembers.filter(m => m.segment === "at-risk" || m.segment === "critical").length;
        const reactivationCount = reactivationCandidates?.length || 0;
        const tabs: { key: typeof view; label: string; count?: number }[] = [
          { key: "all", label: "All Members" },
          { key: "at-risk", label: "At-Risk", count: atRiskCount },
          { key: "reactivation", label: "Reactivation", count: reactivationCount },
        ];
        return (
          <div className="flex rounded-xl overflow-hidden" style={{ border: "1px solid var(--card-border)" }}>
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => { setView(tab.key); setPage(1); }}
                className="px-4 py-2 text-xs transition-all flex items-center gap-1.5"
                style={{
                  background: view === tab.key ? "var(--pill-active)" : "transparent",
                  color: view === tab.key ? (isDark ? "#C4B5FD" : "#7C3AED") : "var(--t3)",
                  fontWeight: view === tab.key ? 600 : 500,
                }}
              >
                {tab.label}
                {tab.count != null && tab.count > 0 && (
                  <span className="px-1.5 py-0.5 rounded-md text-[9px]" style={{
                    background: view === tab.key ? "rgba(139,92,246,0.2)" : "var(--subtle)",
                    fontWeight: 700,
                  }}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        );
      })()}

      {/* P2-T8: Bulk select toolbar lifted out of the All Members branch so
          it also shows when ticking checkboxes inside the Reactivation view.
          Same selection state (selectedMemberIds) feeds both views. */}
      {selectedMemberIds.size > 0 && (
        <BulkSelectToolbar
          clubId={clubId || ''}
          selectedIds={Array.from(selectedMemberIds)}
          existingCohorts={existingCohortsForBulk as any[]}
          onClear={clearMemberSelection}
          isOpen={bulkAddCohortOpen}
          setOpen={setBulkAddCohortOpen}
          isDark={isDark}
        />
      )}

      {/* Reactivation View */}
      {view === "reactivation" ? (
        <MembersReactivationSection
          candidates={reactivationCandidates}
          aiProfiles={aiProfiles}
          isLoading={externalLoading}
          onRegenerate={onRegenerateProfiles}
          sendReactivation={sendReactivation}
          clubId={clubId}
          clubName={memberHealthData?.clubName}
          isDark={isDark}
          selectedMemberIds={selectedMemberIds}
          onToggleSelection={toggleMemberSelection}
        />
      ) : (<>

      {/* P2-T8: Period selector moved into Insights drawer (it only drives
          KPI deltas + churn chart window — neither affects the list). */}

      {guestTrialSummary && guestTrialSummary.totalCandidates > 0 && (
        <Card>
          <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Check className="w-4 h-4" style={{ color: '#06B6D4' }} />
                <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--heading)" }}>Guest / Trial Booking</h3>
              </div>
              <p className="text-[11px]" style={{ color: "var(--t4)", maxWidth: 760 }}>
                A dedicated top-of-funnel lane for guests and trials: get the first visit booked, protect the first show-up, and convert warm first-timers into the safest paid next step.
                {guestTrialOffers?.paidConversion ? ` Current paid offer: ${guestTrialOffers.paidConversion.descriptor} via ${guestTrialOffers.paidConversion.destinationDescriptor}.` : ''}
              </p>
            </div>
            <div className="text-[10px] px-2.5 py-1 rounded-lg" style={{ background: "rgba(6,182,212,0.12)", color: "#06B6D4", fontWeight: 700 }}>
              Avg score {guestTrialSummary.averageScore}
            </div>
          </div>

          {guestTrialSuggestions.length > 0 ? (
            <div className="rounded-2xl p-4 mb-4 space-y-4" style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4" style={{ color: '#06B6D4' }} />
                    <span className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--t4)" }}>
                      Agent Suggested Guest / Trial Plays
                    </span>
                  </div>
                  <p className="text-sm mt-2" style={{ color: "var(--t3)", maxWidth: 760 }}>
                    The agent is turning the guest/trial funnel into three reviewable plays, so you can accept the next move, snooze it, or decline it without losing the state on refresh.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs px-3 py-1.5 rounded-full" style={{ background: 'rgba(6,182,212,0.12)', color: '#06B6D4', fontWeight: 700 }}>
                    {guestTrialSuggestions.length} active plays
                  </span>
                </div>
              </div>

                <div className="grid gap-3 lg:grid-cols-3">
                  {guestTrialSuggestions.map((suggestion) => {
                  const decision = guestTrialSuggestionMap[suggestion.key] as 'accepted' | 'declined' | 'not_now' | undefined
                  const decisionStyle = decision ? suggestionDecisionStyles[decision] : null
                  const isAccepted = decision === 'accepted'
                  const isDeclined = decision === 'declined'
                  const isNotNow = decision === 'not_now'
                  return (
                    <div
                      key={suggestion.key}
                      className="rounded-2xl p-4 space-y-4"
                      style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm" style={{ fontWeight: 700, color: "var(--heading)" }}>{suggestion.title}</div>
                          <div className="text-xs mt-1.5" style={{ color: "var(--t3)", lineHeight: 1.6 }}>{suggestion.description}</div>
                        </div>
                        <span className="px-2 py-1 rounded-full text-[10px]" style={{ background: suggestion.tone.bg, color: suggestion.tone.text, fontWeight: 700 }}>
                          {guestTrialStageLabels[suggestion.stage]}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Users className="w-4 h-4" style={{ color: suggestion.tone.text }} />
                          <span className="text-sm" style={{ fontWeight: 700, color: "var(--heading)" }}>{suggestion.count}</span>
                          <span className="text-xs" style={{ color: "var(--t4)" }}>members</span>
                        </div>
                        {decisionStyle ? (
                          <span className="px-2 py-1 rounded-full text-[10px]" style={{ background: decisionStyle.bg, color: decisionStyle.text, fontWeight: 700 }}>
                            {decisionStyle.label}
                          </span>
                        ) : null}
                      </div>

                      {isDeclined ? (
                        <div className="text-xs" style={{ color: "var(--t3)", lineHeight: 1.6 }}>
                          Declined for today. Reset guest/trial suggestions if you want this play to come back into the queue.
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleGuestTrialSuggestionAccept(suggestion)}
                            disabled={setAdminTodoDecision.isPending || !clubId}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:translate-x-[2px] disabled:opacity-60"
                            style={{ background: suggestion.tone.bg, color: suggestion.tone.text }}
                          >
                            <Check className="w-3.5 h-3.5" />
                            {isAccepted ? 'Open flow' : 'Accept'}
                          </button>
                          {!isAccepted ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleGuestTrialSuggestionDecision({
                                  itemId: suggestion.key,
                                  title: suggestion.title,
                                  href: suggestion.href,
                                  decision: 'not_now',
                                  metadata: { action: 'snooze', stage: suggestion.stage },
                                })}
                                disabled={setAdminTodoDecision.isPending || !clubId}
                                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-60"
                                style={{ background: 'rgba(245,158,11,0.12)', color: '#F59E0B' }}
                              >
                                <Clock className="w-3.5 h-3.5" />
                                {isNotNow ? 'Snoozed' : 'Not now'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleGuestTrialSuggestionDecision({
                                  itemId: suggestion.key,
                                  title: suggestion.title,
                                  href: suggestion.href,
                                  decision: 'declined',
                                  metadata: { action: 'decline', stage: suggestion.stage },
                                })}
                                disabled={setAdminTodoDecision.isPending || !clubId}
                                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-60"
                                style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444' }}
                              >
                                <ArrowDownRight className="w-3.5 h-3.5" />
                                Decline
                              </button>
                            </>
                          ) : null}
                        </div>
                      )}

                      {isNotNow ? (
                        <div className="text-[11px]" style={{ color: "var(--t4)", lineHeight: 1.6 }}>
                          Snoozed for now. Reset guest/trial suggestions when you want the agent to surface this stage again.
                        </div>
                      ) : null}
                      {isAccepted ? (
                        <div className="text-[11px]" style={{ color: suggestion.tone.text, lineHeight: 1.6, fontWeight: 600 }}>
                          Accepted into the guest/trial workflow. Re-open the flow from here whenever you want to keep pushing this stage.
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            {[
              { label: 'In scope', value: guestTrialSummary.totalCandidates, sub: 'guest/trial actions', color: '#06B6D4' },
              { label: 'Need first visit', value: guestTrialSummary.firstBookingCount, sub: 'still unbooked', color: '#06B6D4' },
              { label: 'Protect show-up', value: guestTrialSummary.showUpProtectionCount, sub: 'booked but not played yet', color: '#F59E0B' },
              { label: 'Ready for paid', value: guestTrialSummary.paidConversionCount, sub: 'showed up and still entry-tier', color: '#10B981' },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl px-4 py-3" style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}>
                <div className="text-[11px]" style={{ color: "var(--t4)", fontWeight: 600 }}>{item.label}</div>
                <div className="text-2xl mt-2" style={{ color: "var(--heading)", fontWeight: 800 }}>{item.value}</div>
                <div className="text-[10px] mt-1" style={{ color: item.color }}>{item.sub}</div>
              </div>
            ))}
          </div>

          <div className="rounded-2xl px-4 py-3 mb-4" style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}>
            <div className="text-sm" style={{ color: "var(--heading)", fontWeight: 600 }}>{guestTrialSummary.summary}</div>
            <div className="text-[11px] mt-2" style={{ color: "var(--t3)", lineHeight: 1.6 }}>
              {guestTrialSummary.funnel.summary}
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {guestTrialPrimaryPrompt ? (
                <Link
                  href={buildMembersAdvisorHref(clubId || '', guestTrialPrimaryPrompt)}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:translate-x-[2px]"
                  style={{ background: "rgba(6,182,212,0.14)", color: "#06B6D4" }}
                >
                  <Check className="w-3.5 h-3.5" />
                  Build guest/trial plan
                </Link>
              ) : null}
              {guestTrialRefinePrompt ? (
                <Link
                  href={guestTrialRefineHref || buildMembersAdvisorHref(clubId || '', guestTrialRefinePrompt)}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:translate-x-[2px]"
                  style={{ background: "rgba(16,185,129,0.14)", color: "#10B981" }}
                >
                  <Target className="w-3.5 h-3.5" />
                  Draft top guest/trial move
                </Link>
              ) : null}
            </div>
          </div>

          {guestTrialOfferLoop.length > 0 ? (
            <div className="rounded-2xl p-4 mb-4 space-y-3" style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-sm" style={{ color: "var(--heading)", fontWeight: 700 }}>Offer outcome loop</div>
                  <div className="text-[11px] mt-1.5" style={{ color: "var(--t3)", lineHeight: 1.6 }}>
                    This is the guest/trial offer layer: which club offer currently owns each stage, how that stage is converting, and where the funnel is strong versus slipping.
                  </div>
                </div>
                <span className="text-[10px] px-2.5 py-1 rounded-lg" style={{ background: "rgba(139,92,246,0.12)", color: "#A78BFA", fontWeight: 700 }}>
                  {guestTrialOfferLoop.length} tracked offers
                </span>
              </div>

              <div className="grid gap-3 xl:grid-cols-3">
                {guestTrialOfferLoop.map((offer) => {
                  const stageTone = guestTrialStageStyles[offer.stage]
                  const statusTone = guestTrialOfferLoopStatusStyles[offer.status]
                  const remediation = buildGuestTrialOfferRemediationPrompt({
                    stage: offer.stage,
                    status: offer.status,
                    offerName: offer.name,
                    descriptor: offer.descriptor,
                    rate: offer.rate,
                    candidateCount: offer.candidateCount,
                    outcomeCount: offer.outcomeCount,
                    baseCount: offer.baseCount,
                    audienceLabel,
                  })
                  return (
                    <div
                      key={offer.key}
                      className="rounded-2xl p-4"
                      style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
                    >
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <div className="text-sm" style={{ color: "var(--heading)", fontWeight: 700 }}>{offer.name}</div>
                          <div className="text-[11px] mt-1" style={{ color: "var(--t4)" }}>{offer.descriptor}</div>
                          <div className="text-[11px] mt-1" style={{ color: stageTone.text, lineHeight: 1.5 }}>
                            Route: {offer.destinationDescriptor}
                          </div>
                        </div>
                        <span className="px-2 py-1 rounded-full text-[10px]" style={{ background: stageTone.bg, color: stageTone.text, fontWeight: 700 }}>
                          {guestTrialStageLabels[offer.stage]}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2 mb-3">
                        <span className="px-2 py-1 rounded-full text-[10px]" style={{ background: statusTone.bg, color: statusTone.text, fontWeight: 700 }}>
                          {statusTone.label}
                        </span>
                        <span className="px-2 py-1 rounded-full text-[10px]" style={{ background: "rgba(255,255,255,0.08)", color: "var(--heading)", fontWeight: 700 }}>
                          {offer.rate}% rate
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 mb-3">
                        <div className="rounded-xl px-3 py-2" style={{ background: "var(--subtle)" }}>
                          <div className="text-[10px]" style={{ color: "var(--t4)", fontWeight: 600 }}>In play</div>
                          <div className="text-sm mt-1" style={{ color: "var(--heading)", fontWeight: 800 }}>{offer.candidateCount}</div>
                        </div>
                        <div className="rounded-xl px-3 py-2" style={{ background: "var(--subtle)" }}>
                          <div className="text-[10px]" style={{ color: "var(--t4)", fontWeight: 600 }}>Outcome</div>
                          <div className="text-sm mt-1" style={{ color: "var(--heading)", fontWeight: 800 }}>{offer.outcomeCount}</div>
                        </div>
                        <div className="rounded-xl px-3 py-2" style={{ background: "var(--subtle)" }}>
                          <div className="text-[10px]" style={{ color: "var(--t4)", fontWeight: 600 }}>Base</div>
                          <div className="text-sm mt-1" style={{ color: "var(--heading)", fontWeight: 800 }}>{offer.baseCount}</div>
                        </div>
                      </div>

                      <div className="text-[11px]" style={{ color: stageTone.text, fontWeight: 700 }}>
                        {offer.outcomeLabel}
                      </div>
                      <div className="text-[11px] mt-1.5" style={{ color: "var(--t3)", lineHeight: 1.6 }}>
                        {offer.summary}
                      </div>

                      <div className="mt-4">
                        <Link
                          href={buildMembersAdvisorHref(clubId || '', remediation.prompt)}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:translate-x-[2px]"
                          style={{ background: stageTone.bg, color: stageTone.text }}
                        >
                          <ArrowUpRight className="w-3.5 h-3.5" />
                          {remediation.label}
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          {guestTrialRouteLoop.length > 0 ? (
            <div className="rounded-2xl p-4 mb-4 space-y-3" style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-sm" style={{ color: "var(--heading)", fontWeight: 700 }}>Route attribution loop</div>
                  <div className="text-[11px] mt-1.5" style={{ color: "var(--t3)", lineHeight: 1.6 }}>
                    This is the destination layer: which route is carrying first booking, first show-up, or paid conversion right now, and which path is actually holding up versus adding friction.
                  </div>
                </div>
                <span className="text-[10px] px-2.5 py-1 rounded-lg" style={{ background: "rgba(6,182,212,0.12)", color: "#06B6D4", fontWeight: 700 }}>
                  {guestTrialRouteLoop.length} tracked routes
                </span>
              </div>

              <div className="grid gap-3 xl:grid-cols-3">
                {guestTrialRouteLoop.map((route) => {
                  const statusTone = guestTrialOfferLoopStatusStyles[route.status]
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
                    audienceLabel,
                  })
                  return (
                    <div
                      key={route.key}
                      className="rounded-2xl p-4"
                      style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
                    >
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <div className="text-sm" style={{ color: "var(--heading)", fontWeight: 700 }}>{route.destinationDescriptor}</div>
                          <div className="text-[11px] mt-1" style={{ color: statusTone.text }}>
                            {formatGuestTrialRouteType(route.destinationType)}
                          </div>
                        </div>
                        <span className="px-2 py-1 rounded-full text-[10px]" style={{ background: statusTone.bg, color: statusTone.text, fontWeight: 700 }}>
                          {statusTone.label}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {route.stages.map((stage) => {
                          const stageStyle = guestTrialStageStyles[stage]
                          return (
                            <span
                              key={`${route.key}-${stage}`}
                              className="px-2 py-0.5 rounded-lg text-[10px]"
                              style={{ background: stageStyle.bg, color: stageStyle.text, fontWeight: 700 }}
                            >
                              {guestTrialStageLabels[stage]}
                            </span>
                          )
                        })}
                      </div>

                      <div className="grid grid-cols-3 gap-2 mb-3">
                        <div className="rounded-xl px-3 py-2" style={{ background: "var(--subtle)" }}>
                          <div className="text-[10px]" style={{ color: "var(--t4)", fontWeight: 600 }}>In play</div>
                          <div className="text-sm mt-1" style={{ color: "var(--heading)", fontWeight: 800 }}>{route.candidateCount}</div>
                        </div>
                        <div className="rounded-xl px-3 py-2" style={{ background: "var(--subtle)" }}>
                          <div className="text-[10px]" style={{ color: "var(--t4)", fontWeight: 600 }}>Outcome</div>
                          <div className="text-sm mt-1" style={{ color: "var(--heading)", fontWeight: 800 }}>{route.outcomeCount}</div>
                        </div>
                        <div className="rounded-xl px-3 py-2" style={{ background: "var(--subtle)" }}>
                          <div className="text-[10px]" style={{ color: "var(--t4)", fontWeight: 600 }}>Rate</div>
                          <div className="text-sm mt-1" style={{ color: "var(--heading)", fontWeight: 800 }}>{route.rate}%</div>
                        </div>
                      </div>

                      <div className="text-[11px]" style={{ color: statusTone.text, fontWeight: 700 }}>
                        {route.outcomeLabel}
                      </div>
                      <div className="text-[11px] mt-1.5" style={{ color: "var(--t3)", lineHeight: 1.6 }}>
                        {route.summary}
                      </div>
                      <div className="text-[10px] mt-2" style={{ color: "var(--t4)", lineHeight: 1.5 }}>
                        Offers on this route: {route.offerNames.join(', ')}
                      </div>

                      <div className="mt-4">
                        <Link
                          href={buildMembersAdvisorHref(clubId || '', remediation.prompt)}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:translate-x-[2px]"
                          style={{ background: statusTone.bg, color: statusTone.text }}
                        >
                          <ArrowUpRight className="w-3.5 h-3.5" />
                          {remediation.label}
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
            {guestTrialCandidates.slice(0, 4).map((candidate) => {
              const stageStyle = guestTrialStageStyles[candidate.stage];
              const urgencyStyle = smartFirstSessionUrgencyStyles[candidate.urgency];
              return (
                <div
                  key={candidate.memberId}
                  className="rounded-2xl p-4"
                  style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0">
                      <div className="text-sm truncate" style={{ color: "var(--heading)", fontWeight: 700 }}>{candidate.name}</div>
                      <div className="text-[11px] mt-1" style={{ color: "var(--t4)" }}>
                        {candidate.email || 'No email on file'}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-lg text-[10px]" style={{ background: "rgba(255,255,255,0.08)", color: "var(--heading)", fontWeight: 700 }}>
                      {candidate.score}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-3">
                    <span className="px-2 py-0.5 rounded-lg text-[10px]" style={{ background: stageStyle.bg, color: stageStyle.text, fontWeight: 700 }}>
                      {guestTrialStageLabels[candidate.stage]}
                    </span>
                    <span className="px-2 py-0.5 rounded-lg text-[10px]" style={{ background: urgencyStyle.bg, color: urgencyStyle.text, fontWeight: 700 }}>
                      {urgencyStyle.label}
                    </span>
                    {formatNormalizedMembershipType(candidate.normalizedMembershipType) ? (
                      <span className="px-2 py-0.5 rounded-lg text-[10px]" style={{ background: "rgba(139,92,246,0.12)", color: "#A78BFA", fontWeight: 700 }}>
                        {formatNormalizedMembershipType(candidate.normalizedMembershipType)}
                      </span>
                    ) : null}
                  </div>

                  <div className="text-[11px]" style={{ color: "var(--t3)", lineHeight: 1.55 }}>
                    {candidate.topReason}
                  </div>
                  <div className="mt-3 text-[11px]" style={{ color: stageStyle.text, lineHeight: 1.55, fontWeight: 600 }}>
                    {candidate.nextBestMove}
                  </div>
                  {candidate.recommendedOffer ? (
                    <div className="mt-3 space-y-1.5">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px]" style={{ background: "rgba(139,92,246,0.12)", color: "#A78BFA", fontWeight: 700 }}>
                        <DollarSign className="w-3 h-3" />
                        {candidate.recommendedOffer.descriptor}
                      </div>
                      <div className="text-[10px]" style={{ color: stageStyle.text, lineHeight: 1.5, fontWeight: 600 }}>
                        Route: {candidate.recommendedOffer.destinationDescriptor}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {smartFirstSessionSummary && smartFirstSessionSummary.totalCandidates > 0 && (
        <Card>
          <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-4 h-4" style={{ color: '#06B6D4' }} />
                <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--heading)" }}>Smart First Session</h3>
              </div>
              <p className="text-[11px]" style={{ color: "var(--t4)", maxWidth: 760 }}>
                Newcomer scoring for the first booking, second session, and first paid conversion. This gives the agent a focused growth layer instead of treating every new member the same.
              </p>
            </div>
            <div className="text-[10px] px-2.5 py-1 rounded-lg" style={{ background: "rgba(6,182,212,0.12)", color: "#06B6D4", fontWeight: 700 }}>
              Avg score {smartFirstSessionSummary.averageScore}
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            {[
              { label: 'In scope', value: smartFirstSessionSummary.totalCandidates, sub: 'newcomer opportunities', tone: 'rgba(6,182,212,0.12)', color: '#06B6D4' },
              { label: 'Need first booking', value: smartFirstSessionSummary.firstBookingCount, sub: 'signup -> first session', tone: 'rgba(6,182,212,0.12)', color: '#06B6D4' },
              { label: 'Need second session', value: smartFirstSessionSummary.secondSessionCount, sub: 'first session -> habit', tone: 'rgba(139,92,246,0.12)', color: '#8B5CF6' },
              { label: 'Ready to convert', value: smartFirstSessionSummary.conversionReadyCount, sub: 'guest/trial -> paid tier', tone: 'rgba(16,185,129,0.12)', color: '#10B981' },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl px-4 py-3" style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}>
                <div className="text-[11px]" style={{ color: "var(--t4)", fontWeight: 600 }}>{item.label}</div>
                <div className="text-2xl mt-2" style={{ color: "var(--heading)", fontWeight: 800 }}>{item.value}</div>
                <div className="text-[10px] mt-1" style={{ color: item.color }}>{item.sub}</div>
              </div>
            ))}
          </div>

          <div className="rounded-2xl px-4 py-3 mb-4" style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}>
            <div className="text-sm" style={{ color: "var(--heading)", fontWeight: 600 }}>{smartFirstSessionSummary.summary}</div>
            <div className="flex flex-wrap gap-2 mt-3">
              {smartFirstSessionPrimaryPrompt ? (
                <Link
                  href={buildMembersAdvisorHref(clubId || '', smartFirstSessionPrimaryPrompt)}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:translate-x-[2px]"
                  style={{ background: "rgba(6,182,212,0.14)", color: "#06B6D4" }}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Build Smart First Session plan
                </Link>
              ) : null}
              {smartFirstSessionRefinePrompt ? (
                <Link
                  href={buildMembersAdvisorHref(clubId || '', smartFirstSessionRefinePrompt)}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:translate-x-[2px]"
                  style={{ background: "rgba(139,92,246,0.14)", color: "#8B5CF6" }}
                >
                  <Target className="w-3.5 h-3.5" />
                  Draft top newcomer move
                </Link>
              ) : null}
            </div>
          </div>

          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
            {smartFirstSessionCandidates.slice(0, 4).map((candidate) => {
              const stageStyle = smartFirstSessionStageStyles[candidate.stage];
              const urgencyStyle = smartFirstSessionUrgencyStyles[candidate.urgency];
              return (
                <div
                  key={candidate.memberId}
                  className="rounded-2xl p-4"
                  style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0">
                      <div className="text-sm truncate" style={{ color: "var(--heading)", fontWeight: 700 }}>{candidate.name}</div>
                      <div className="text-[11px] mt-1" style={{ color: "var(--t4)" }}>
                        {candidate.email || 'No email on file'}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-lg text-[10px]" style={{ background: "rgba(255,255,255,0.08)", color: "var(--heading)", fontWeight: 700 }}>
                      {candidate.score}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-3">
                    <span className="px-2 py-0.5 rounded-lg text-[10px]" style={{ background: stageStyle.bg, color: stageStyle.text, fontWeight: 700 }}>
                      {smartFirstSessionStageLabels[candidate.stage]}
                    </span>
                    <span className="px-2 py-0.5 rounded-lg text-[10px]" style={{ background: urgencyStyle.bg, color: urgencyStyle.text, fontWeight: 700 }}>
                      {urgencyStyle.label}
                    </span>
                    {formatNormalizedMembershipType(candidate.normalizedMembershipType) ? (
                      <span className="px-2 py-0.5 rounded-lg text-[10px]" style={{ background: "rgba(139,92,246,0.12)", color: "#A78BFA", fontWeight: 700 }}>
                        {formatNormalizedMembershipType(candidate.normalizedMembershipType)}
                      </span>
                    ) : null}
                  </div>

                  <div className="text-[11px]" style={{ color: "var(--t3)", lineHeight: 1.55 }}>
                    {candidate.topReason}
                  </div>
                  <div className="mt-3 text-[11px]" style={{ color: "#67E8F9", lineHeight: 1.55, fontWeight: 600 }}>
                    {candidate.nextBestMove}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {winBackSummary && winBackSummary.totalCandidates > 0 && (
        <Card>
          <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Mail className="w-4 h-4" style={{ color: '#EF4444' }} />
                <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--heading)" }}>Win-Back бывших</h3>
              </div>
              <p className="text-[11px]" style={{ color: "var(--t4)", maxWidth: 760 }}>
                This lane treats former and drifting members differently: expired memberships, cancelled memberships, and high-value players who quietly lapsed each get their own comeback motion.
              </p>
            </div>
            <div className="text-[10px] px-2.5 py-1 rounded-lg" style={{ background: "rgba(239,68,68,0.12)", color: "#EF4444", fontWeight: 700 }}>
              Avg score {winBackSummary.averageScore}
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            {[
              { label: 'In scope', value: winBackSummary.totalCandidates, sub: 'win-back opportunities', color: '#EF4444' },
              { label: 'Expired', value: winBackSummary.expiredCount, sub: 'renewal rescue lane', color: '#EF4444' },
              { label: 'Cancelled', value: winBackSummary.cancelledCount, sub: 'comeback after churn', color: '#F97316' },
              { label: 'High-value lapsed', value: winBackSummary.lapsedCount, sub: 'quiet but worth saving', color: '#8B5CF6' },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl px-4 py-3" style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}>
                <div className="text-[11px]" style={{ color: "var(--t4)", fontWeight: 600 }}>{item.label}</div>
                <div className="text-2xl mt-2" style={{ color: "var(--heading)", fontWeight: 800 }}>{item.value}</div>
                <div className="text-[10px] mt-1" style={{ color: item.color }}>{item.sub}</div>
              </div>
            ))}
          </div>

          <div className="rounded-2xl px-4 py-3 mb-4" style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}>
            <div className="text-sm" style={{ color: "var(--heading)", fontWeight: 600 }}>{winBackSummary.summary}</div>
            <div className="flex flex-wrap gap-2 mt-3">
              {winBackPrimaryPrompt ? (
                <Link
                  href={buildMembersAdvisorHref(clubId || '', winBackPrimaryPrompt)}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:translate-x-[2px]"
                  style={{ background: "rgba(239,68,68,0.14)", color: "#EF4444" }}
                >
                  <Mail className="w-3.5 h-3.5" />
                  Build win-back plan
                </Link>
              ) : null}
              {winBackRefinePrompt ? (
                <Link
                  href={buildMembersAdvisorHref(clubId || '', winBackRefinePrompt)}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:translate-x-[2px]"
                  style={{ background: "rgba(249,115,22,0.14)", color: "#F97316" }}
                >
                  <Target className="w-3.5 h-3.5" />
                  Draft top win-back move
                </Link>
              ) : null}
            </div>
          </div>

          {winBackLaneLoop.length > 0 ? (
            <div className="rounded-2xl p-4 mb-4 space-y-3" style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-sm" style={{ color: "var(--heading)", fontWeight: 700 }}>Lane recovery loop</div>
                  <div className="text-[11px] mt-1.5" style={{ color: "var(--t3)", lineHeight: 1.6 }}>
                    Each win-back lane now has its own health lens, so you can see whether expired renewals, cancelled comebacks, or high-value saves need a tighter comeback motion.
                  </div>
                </div>
                <span className="text-[10px] px-2.5 py-1 rounded-lg" style={{ background: "rgba(239,68,68,0.12)", color: "#EF4444", fontWeight: 700 }}>
                  {winBackLaneLoop.length} tracked lanes
                </span>
              </div>

              <div className="grid gap-3 xl:grid-cols-3">
                {winBackLaneLoop.map((lane) => {
                  const stageTone = winBackStageStyles[lane.stage]
                  const statusTone = winBackLaneStatusStyles[lane.status]
                  const remediation = buildWinBackLaneRemediationPrompt({
                    stage: lane.stage,
                    status: lane.status,
                    title: lane.title,
                    rate: lane.rate,
                    candidateCount: lane.candidateCount,
                    outcomeCount: lane.outcomeCount,
                    baseCount: lane.baseCount,
                    audienceLabel,
                  })
                  return (
                    <div
                      key={lane.key}
                      className="rounded-2xl p-4"
                      style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
                    >
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <div className="text-sm" style={{ color: "var(--heading)", fontWeight: 700 }}>{lane.title}</div>
                          <div className="text-[11px] mt-1" style={{ color: "var(--t4)" }}>{winBackStageLabels[lane.stage]}</div>
                        </div>
                        <span className="px-2 py-1 rounded-full text-[10px]" style={{ background: statusTone.bg, color: statusTone.text, fontWeight: 700 }}>
                          {statusTone.label}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2 mb-3">
                        <span className="px-2 py-1 rounded-full text-[10px]" style={{ background: stageTone.bg, color: stageTone.text, fontWeight: 700 }}>
                          {lane.rate}% rate
                        </span>
                        <span className="px-2 py-1 rounded-full text-[10px]" style={{ background: "rgba(255,255,255,0.08)", color: "var(--heading)", fontWeight: 700 }}>
                          {lane.candidateCount} in lane
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 mb-3">
                        <div className="rounded-xl px-3 py-2" style={{ background: "var(--subtle)" }}>
                          <div className="text-[10px]" style={{ color: "var(--t4)", fontWeight: 600 }}>In lane</div>
                          <div className="text-sm mt-1" style={{ color: "var(--heading)", fontWeight: 800 }}>{lane.candidateCount}</div>
                        </div>
                        <div className="rounded-xl px-3 py-2" style={{ background: "var(--subtle)" }}>
                          <div className="text-[10px]" style={{ color: "var(--t4)", fontWeight: 600 }}>Outcome</div>
                          <div className="text-sm mt-1" style={{ color: "var(--heading)", fontWeight: 800 }}>{lane.outcomeCount}</div>
                        </div>
                        <div className="rounded-xl px-3 py-2" style={{ background: "var(--subtle)" }}>
                          <div className="text-[10px]" style={{ color: "var(--t4)", fontWeight: 600 }}>Base</div>
                          <div className="text-sm mt-1" style={{ color: "var(--heading)", fontWeight: 800 }}>{lane.baseCount}</div>
                        </div>
                      </div>

                      <div className="text-[11px]" style={{ color: stageTone.text, fontWeight: 700 }}>
                        {lane.outcomeLabel}
                      </div>
                      <div className="text-[11px] mt-1.5" style={{ color: "var(--t3)", lineHeight: 1.6 }}>
                        {lane.summary}
                      </div>

                      <div className="mt-4">
                        <Link
                          href={buildMembersAdvisorHref(clubId || '', remediation.prompt)}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:translate-x-[2px]"
                          style={{ background: stageTone.bg, color: stageTone.text }}
                        >
                          <ArrowUpRight className="w-3.5 h-3.5" />
                          {remediation.label}
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
            {winBackCandidates.slice(0, 4).map((candidate) => {
              const stageStyle = winBackStageStyles[candidate.stage];
              const urgencyStyle = smartFirstSessionUrgencyStyles[candidate.urgency];
              return (
                <div
                  key={candidate.memberId}
                  className="rounded-2xl p-4"
                  style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0">
                      <div className="text-sm truncate" style={{ color: "var(--heading)", fontWeight: 700 }}>{candidate.name}</div>
                      <div className="text-[11px] mt-1" style={{ color: "var(--t4)" }}>
                        {candidate.email || 'No email on file'}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-lg text-[10px]" style={{ background: "rgba(255,255,255,0.08)", color: "var(--heading)", fontWeight: 700 }}>
                      {candidate.score}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-3">
                    <span className="px-2 py-0.5 rounded-lg text-[10px]" style={{ background: stageStyle.bg, color: stageStyle.text, fontWeight: 700 }}>
                      {winBackStageLabels[candidate.stage]}
                    </span>
                    <span className="px-2 py-0.5 rounded-lg text-[10px]" style={{ background: urgencyStyle.bg, color: urgencyStyle.text, fontWeight: 700 }}>
                      {urgencyStyle.label}
                    </span>
                    {formatNormalizedMembershipType(candidate.normalizedMembershipType) ? (
                      <span className="px-2 py-0.5 rounded-lg text-[10px]" style={{ background: "rgba(139,92,246,0.12)", color: "#A78BFA", fontWeight: 700 }}>
                        {formatNormalizedMembershipType(candidate.normalizedMembershipType)}
                      </span>
                    ) : null}
                  </div>

                  <div className="text-[11px]" style={{ color: "var(--t3)", lineHeight: 1.55 }}>
                    {candidate.topReason}
                  </div>
                  <div className="mt-3 text-[11px]" style={{ color: stageStyle.text, lineHeight: 1.55, fontWeight: 600 }}>
                    {candidate.nextBestMove}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {referralSummary && (referralSummary.totalCandidates > 0 || referralHasLiveTracking) && (
        <Card>
          <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4" style={{ color: '#06B6D4' }} />
                <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--heading)" }}>Referral Engine</h3>
              </div>
              <p className="text-[11px]" style={{ color: "var(--t4)", maxWidth: 760 }}>
                This lane turns social proof into a real growth surface: identify the members safest to ask for a bring-a-friend intro, separate VIP advocates from regular social players, and restart dormant advocates before the referral ask.
              </p>
            </div>
            <div className="text-[10px] px-2.5 py-1 rounded-lg" style={{ background: "rgba(6,182,212,0.12)", color: "#06B6D4", fontWeight: 700 }}>
              Avg score {referralSummary.averageScore}
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            {[
              { label: 'In scope', value: referralSummary.totalCandidates, sub: 'referral opportunities', color: '#06B6D4' },
              { label: 'VIP advocates', value: referralSummary.vipAdvocateCount, sub: 'high-trust social reach', color: '#F59E0B' },
              { label: 'Social regulars', value: referralSummary.socialRegularCount, sub: 'active friend-invite asks', color: '#06B6D4' },
              { label: 'Dormant advocates', value: referralSummary.dormantAdvocateCount, sub: 'restart before asking', color: '#8B5CF6' },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl px-4 py-3" style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}>
                <div className="text-[11px]" style={{ color: "var(--t4)", fontWeight: 600 }}>{item.label}</div>
                <div className="text-2xl mt-2" style={{ color: "var(--heading)", fontWeight: 800 }}>{item.value}</div>
                <div className="text-[10px] mt-1" style={{ color: item.color }}>{item.sub}</div>
              </div>
            ))}
          </div>

          <div className="rounded-2xl px-4 py-3 mb-4" style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}>
            <div className="text-sm" style={{ color: "var(--heading)", fontWeight: 600 }}>{referralSummary.summary}</div>
            <div className="text-[11px] mt-2" style={{ color: "var(--t3)", lineHeight: 1.6 }}>
              {referralSummary.funnel.summary}
              {referralOffers?.vipAdvocate ? ` Current VIP default: ${referralOffers.vipAdvocate.descriptor} via ${referralOffers.vipAdvocate.destinationDescriptor}.` : ''}
              {referralOffers?.socialRegular ? ` Current social default: ${referralOffers.socialRegular.descriptor} via ${referralOffers.socialRegular.destinationDescriptor}.` : ''}
              {referralOffers?.dormantAdvocate ? ` Current dormant restart: ${referralOffers.dormantAdvocate.descriptor} via ${referralOffers.dormantAdvocate.destinationDescriptor}.` : ''}
            </div>
            {referralOutcomeFunnel ? (
              <div className="text-[11px] mt-2" style={{ color: "#06B6D4", lineHeight: 1.6 }}>
                {referralOutcomeFunnel.summary}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2 mt-3">
              {referralPrimaryPrompt ? (
                <Link
                  href={buildMembersAdvisorHref(clubId || '', referralPrimaryPrompt)}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:translate-x-[2px]"
                  style={{ background: "rgba(6,182,212,0.14)", color: "#06B6D4" }}
                >
                  <Users className="w-3.5 h-3.5" />
                  Build referral plan
                </Link>
              ) : null}
              {referralRefinePrompt ? (
                <Link
                  href={buildMembersAdvisorHref(
                    clubId || '',
                    referralRefinePrompt,
                    null,
                    topReferralCandidate
                      ? buildReferralExecutionContext({
                          lane: topReferralCandidate.lane,
                          offer: topReferralCandidate.recommendedOffer || null,
                          advocate: {
                            userId: topReferralCandidate.memberId,
                            name: topReferralCandidate.name,
                            email: topReferralCandidate.email,
                          },
                        })
                      : null,
                  )}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:translate-x-[2px]"
                  style={{ background: "rgba(245,158,11,0.14)", color: "#F59E0B" }}
                >
                  <Target className="w-3.5 h-3.5" />
                  Draft top referral move
                </Link>
              ) : null}
            </div>
          </div>

          {referralOfferLoop.length > 0 ? (
            <div className="rounded-2xl p-4 mb-4 space-y-3" style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-sm" style={{ color: "var(--heading)", fontWeight: 700 }}>Referral offer loop</div>
                  <div className="text-[11px] mt-1.5" style={{ color: "var(--t3)", lineHeight: 1.6 }}>
                    This is the referral offer layer: which bring-a-friend motion owns each advocate lane, how that lane is converting, and where the invite framing still needs work.
                  </div>
                </div>
                <span className="text-[10px] px-2.5 py-1 rounded-lg" style={{ background: "rgba(6,182,212,0.12)", color: "#06B6D4", fontWeight: 700 }}>
                  {referralOfferLoop.length} tracked offers
                </span>
              </div>

              <div className="grid gap-3 xl:grid-cols-3">
                {referralOfferLoop.map((offer) => {
                  const laneTone = referralLaneStyles[offer.lane]
                  const statusTone = referralLaneStatusStyles[offer.status]
                  const referralSourceContext = buildReferralExecutionContext({
                    lane: offer.lane,
                    offer,
                  })
                  const referredGuestCaptureContext = guestTrialOffers?.firstVisit
                    ? buildGuestTrialExecutionContext({
                        stage: 'book_first_visit',
                        offer: guestTrialOffers.firstVisit,
                        referralSource: referralSourceContext,
                      })
                    : null
                  const referredGuestCapturePrompt = guestTrialOffers?.firstVisit
                    ? `Build a referred guest capture plan for invitees coming through ${offer.name} in the ${referralLaneLabels[offer.lane].toLowerCase()} lane. Move referred guests into ${guestTrialOffers.firstVisit.descriptor} via ${guestTrialOffers.firstVisit.destinationDescriptor}, keep the first version review-ready, and focus on referred guest capture, first booking, and first-show follow-through.`
                    : null
                  const remediation = buildReferralOfferRemediationPrompt({
                    lane: offer.lane,
                    status: offer.status,
                    offerName: offer.name,
                    descriptor: offer.descriptor,
                    destinationDescriptor: offer.destinationDescriptor,
                    rate: offer.rate,
                    candidateCount: offer.candidateCount,
                    outcomeCount: offer.outcomeCount,
                    baseCount: offer.baseCount,
                    audienceLabel,
                  })
                  return (
                    <div
                      key={offer.key}
                      className="rounded-2xl p-4"
                      style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
                    >
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <div className="text-sm" style={{ color: "var(--heading)", fontWeight: 700 }}>{offer.name}</div>
                          <div className="text-[11px] mt-1" style={{ color: "var(--t4)" }}>{offer.descriptor}</div>
                          <div className="text-[11px] mt-1" style={{ color: laneTone.text, lineHeight: 1.5 }}>
                            Route: {offer.destinationDescriptor}
                          </div>
                        </div>
                        <span className="px-2 py-1 rounded-full text-[10px]" style={{ background: statusTone.bg, color: statusTone.text, fontWeight: 700 }}>
                          {statusTone.label}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2 mb-3">
                        <span className="px-2 py-1 rounded-full text-[10px]" style={{ background: laneTone.bg, color: laneTone.text, fontWeight: 700 }}>
                          {referralLaneLabels[offer.lane]}
                        </span>
                        <span className="px-2 py-1 rounded-full text-[10px]" style={{ background: "rgba(255,255,255,0.08)", color: "var(--heading)", fontWeight: 700 }}>
                          {offer.rate}% rate
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 mb-3">
                        <div className="rounded-xl px-3 py-2" style={{ background: "var(--subtle)" }}>
                          <div className="text-[10px]" style={{ color: "var(--t4)", fontWeight: 600 }}>In play</div>
                          <div className="text-sm mt-1" style={{ color: "var(--heading)", fontWeight: 800 }}>{offer.candidateCount}</div>
                        </div>
                        <div className="rounded-xl px-3 py-2" style={{ background: "var(--subtle)" }}>
                          <div className="text-[10px]" style={{ color: "var(--t4)", fontWeight: 600 }}>Outcome</div>
                          <div className="text-sm mt-1" style={{ color: "var(--heading)", fontWeight: 800 }}>{offer.outcomeCount}</div>
                        </div>
                        <div className="rounded-xl px-3 py-2" style={{ background: "var(--subtle)" }}>
                          <div className="text-[10px]" style={{ color: "var(--t4)", fontWeight: 600 }}>Base</div>
                          <div className="text-sm mt-1" style={{ color: "var(--heading)", fontWeight: 800 }}>{offer.baseCount}</div>
                        </div>
                      </div>

                      <div className="text-[11px]" style={{ color: laneTone.text, fontWeight: 700 }}>
                        {offer.outcomeLabel}
                      </div>
                      <div className="text-[11px] mt-1.5" style={{ color: "var(--t3)", lineHeight: 1.6 }}>
                        {offer.summary}
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Link
                          href={buildMembersAdvisorHref(
                            clubId || '',
                            remediation.prompt,
                            null,
                            referralSourceContext,
                          )}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:translate-x-[2px]"
                          style={{ background: laneTone.bg, color: laneTone.text }}
                        >
                          <ArrowUpRight className="w-3.5 h-3.5" />
                          {remediation.label}
                        </Link>
                        {referredGuestCapturePrompt && referredGuestCaptureContext ? (
                          <Link
                            href={buildMembersAdvisorHref(
                              clubId || '',
                              referredGuestCapturePrompt,
                              referredGuestCaptureContext,
                            )}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:translate-x-[2px]"
                            style={{ background: 'rgba(16,185,129,0.14)', color: '#10B981' }}
                          >
                            <ArrowUpRight className="w-3.5 h-3.5" />
                            Capture referred guest
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          {referralRouteLoop.length > 0 ? (
            <div className="rounded-2xl p-4 mb-4 space-y-3" style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-sm" style={{ color: "var(--heading)", fontWeight: 700 }}>Referral route loop</div>
                  <div className="text-[11px] mt-1.5" style={{ color: "var(--t3)", lineHeight: 1.6 }}>
                    This is the invite-path layer: which referral route is carrying momentum right now, and where the handoff from advocate to guest still feels weak.
                  </div>
                </div>
                <span className="text-[10px] px-2.5 py-1 rounded-lg" style={{ background: "rgba(245,158,11,0.12)", color: "#F59E0B", fontWeight: 700 }}>
                  {referralRouteLoop.length} tracked routes
                </span>
              </div>

              <div className="grid gap-3 xl:grid-cols-3">
                {referralRouteLoop.map((route) => {
                  const statusTone = referralLaneStatusStyles[route.status]
                  const remediation = buildReferralRouteRemediationPrompt({
                    destinationType: route.destinationType,
                    destinationDescriptor: route.destinationDescriptor,
                    lanes: route.lanes,
                    offerNames: route.offerNames,
                    status: route.status,
                    rate: route.rate,
                    candidateCount: route.candidateCount,
                    outcomeCount: route.outcomeCount,
                    baseCount: route.baseCount,
                    audienceLabel,
                  })
                  return (
                    <div
                      key={route.key}
                      className="rounded-2xl p-4"
                      style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
                    >
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <div className="text-sm" style={{ color: "var(--heading)", fontWeight: 700 }}>{route.destinationDescriptor}</div>
                          <div className="text-[11px] mt-1" style={{ color: statusTone.text }}>
                            {formatReferralRouteType(route.destinationType)}
                          </div>
                        </div>
                        <span className="px-2 py-1 rounded-full text-[10px]" style={{ background: statusTone.bg, color: statusTone.text, fontWeight: 700 }}>
                          {statusTone.label}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {route.lanes.map((lane) => (
                          <span
                            key={`${route.key}-${lane}`}
                            className="px-2 py-0.5 rounded-lg text-[10px]"
                            style={{ background: referralLaneStyles[lane].bg, color: referralLaneStyles[lane].text, fontWeight: 700 }}
                          >
                            {referralLaneLabels[lane]}
                          </span>
                        ))}
                      </div>

                      <div className="grid grid-cols-3 gap-2 mb-3">
                        <div className="rounded-xl px-3 py-2" style={{ background: "var(--subtle)" }}>
                          <div className="text-[10px]" style={{ color: "var(--t4)", fontWeight: 600 }}>In play</div>
                          <div className="text-sm mt-1" style={{ color: "var(--heading)", fontWeight: 800 }}>{route.candidateCount}</div>
                        </div>
                        <div className="rounded-xl px-3 py-2" style={{ background: "var(--subtle)" }}>
                          <div className="text-[10px]" style={{ color: "var(--t4)", fontWeight: 600 }}>Outcome</div>
                          <div className="text-sm mt-1" style={{ color: "var(--heading)", fontWeight: 800 }}>{route.outcomeCount}</div>
                        </div>
                        <div className="rounded-xl px-3 py-2" style={{ background: "var(--subtle)" }}>
                          <div className="text-[10px]" style={{ color: "var(--t4)", fontWeight: 600 }}>Rate</div>
                          <div className="text-sm mt-1" style={{ color: "var(--heading)", fontWeight: 800 }}>{route.rate}%</div>
                        </div>
                      </div>

                      <div className="text-[11px]" style={{ color: statusTone.text, fontWeight: 700 }}>
                        {route.outcomeLabel}
                      </div>
                      <div className="text-[11px] mt-1.5" style={{ color: "var(--t3)", lineHeight: 1.6 }}>
                        {route.summary}
                      </div>
                      <div className="text-[10px] mt-2" style={{ color: "var(--t4)", lineHeight: 1.5 }}>
                        Offers on this route: {route.offerNames.join(', ')}
                      </div>

                      <div className="mt-4">
                        <Link
                          href={buildMembersAdvisorHref(clubId || '', remediation.prompt)}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:translate-x-[2px]"
                          style={{ background: statusTone.bg, color: statusTone.text }}
                        >
                          <ArrowUpRight className="w-3.5 h-3.5" />
                          {remediation.label}
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          {(referralOutcomeFunnel?.askCount || 0) > 0 || referralOutcomeLoop.length > 0 ? (
            <div className="rounded-2xl p-4 mb-4 space-y-3" style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-sm" style={{ color: "var(--heading)", fontWeight: 700 }}>Referral outcome loop</div>
                  <div className="text-[11px] mt-1.5" style={{ color: "var(--t3)", lineHeight: 1.6 }}>
                    This is the truthful live layer: not downstream friend signups yet, but real advocate response signals from live referral asks by lane.
                  </div>
                </div>
                <span className="text-[10px] px-2.5 py-1 rounded-lg" style={{ background: "rgba(6,182,212,0.12)", color: "#06B6D4", fontWeight: 700 }}>
                  {referralOutcomeFunnel?.askCount || 0} live asks
                </span>
              </div>

              {referralOutcomeFunnel ? (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { label: 'Asks sent', value: referralOutcomeFunnel.askCount, sub: `${referralOutcomeFunnel.engagementRate}% engaged`, color: '#06B6D4' },
                    { label: 'Engaged', value: referralOutcomeFunnel.engagedCount, sub: 'opened or clicked', color: '#10B981' },
                    { label: 'Intent', value: referralOutcomeFunnel.intentCount, sub: `${referralOutcomeFunnel.intentRate}% intro intent`, color: '#F59E0B' },
                    { label: 'Strongest signal', value: referralOutcomeFunnel.strongSignalCount, sub: `${referralOutcomeFunnel.strongSignalRate}% strongest response`, color: '#8B5CF6' },
                  ].map((item) => (
                    <div key={item.label} className="rounded-2xl px-4 py-3" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
                      <div className="text-[11px]" style={{ color: "var(--t4)", fontWeight: 600 }}>{item.label}</div>
                      <div className="text-2xl mt-2" style={{ color: "var(--heading)", fontWeight: 800 }}>{item.value}</div>
                      <div className="text-[10px] mt-1" style={{ color: item.color }}>{item.sub}</div>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="grid gap-3 xl:grid-cols-3">
                {referralOutcomeLoop.map((lane) => {
                  const laneTone = referralLaneStyles[lane.lane]
                  const statusTone = referralLaneStatusStyles[lane.status]
                  const remediation = buildReferralOutcomeRemediationPrompt({
                    lane: lane.lane,
                    status: lane.status,
                    askCount: lane.askCount,
                    engagedCount: lane.engagedCount,
                    intentCount: lane.intentCount,
                    strongSignalCount: lane.strongSignalCount,
                    audienceLabel,
                  })
                  return (
                    <div
                      key={lane.key}
                      className="rounded-2xl p-4"
                      style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
                    >
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <div className="text-sm" style={{ color: "var(--heading)", fontWeight: 700 }}>{lane.title}</div>
                          <div className="text-[11px] mt-1" style={{ color: laneTone.text }}>{referralLaneLabels[lane.lane]}</div>
                        </div>
                        <span className="px-2 py-1 rounded-full text-[10px]" style={{ background: statusTone.bg, color: statusTone.text, fontWeight: 700 }}>
                          {statusTone.label}
                        </span>
                      </div>

                      <div className="grid grid-cols-4 gap-2 mb-3">
                        <div className="rounded-xl px-3 py-2" style={{ background: "var(--subtle)" }}>
                          <div className="text-[10px]" style={{ color: "var(--t4)", fontWeight: 600 }}>Asks</div>
                          <div className="text-sm mt-1" style={{ color: "var(--heading)", fontWeight: 800 }}>{lane.askCount}</div>
                        </div>
                        <div className="rounded-xl px-3 py-2" style={{ background: "var(--subtle)" }}>
                          <div className="text-[10px]" style={{ color: "var(--t4)", fontWeight: 600 }}>Engaged</div>
                          <div className="text-sm mt-1" style={{ color: "var(--heading)", fontWeight: 800 }}>{lane.engagedCount}</div>
                        </div>
                        <div className="rounded-xl px-3 py-2" style={{ background: "var(--subtle)" }}>
                          <div className="text-[10px]" style={{ color: "var(--t4)", fontWeight: 600 }}>Intent</div>
                          <div className="text-sm mt-1" style={{ color: "var(--heading)", fontWeight: 800 }}>{lane.intentCount}</div>
                        </div>
                        <div className="rounded-xl px-3 py-2" style={{ background: "var(--subtle)" }}>
                          <div className="text-[10px]" style={{ color: "var(--t4)", fontWeight: 600 }}>Rate</div>
                          <div className="text-sm mt-1" style={{ color: laneTone.text, fontWeight: 800 }}>{lane.rate}%</div>
                        </div>
                      </div>

                      <div className="text-[11px]" style={{ color: laneTone.text, fontWeight: 700 }}>
                        {lane.outcomeLabel}
                      </div>
                      <div className="text-[11px] mt-1.5" style={{ color: "var(--t3)", lineHeight: 1.6 }}>
                        {lane.summary}
                      </div>

                      <div className="mt-4">
                        <Link
                          href={buildMembersAdvisorHref(clubId || '', remediation.prompt)}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:translate-x-[2px]"
                          style={{ background: laneTone.bg, color: laneTone.text }}
                        >
                          <ArrowUpRight className="w-3.5 h-3.5" />
                          {remediation.label}
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          {referralRewardLoop.length > 0 ? (
            <div className="rounded-2xl p-4 mb-4 space-y-3" style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-sm" style={{ color: "var(--heading)", fontWeight: 700 }}>Referral reward review</div>
                  <div className="text-[11px] mt-1.5" style={{ color: "var(--t3)", lineHeight: 1.6 }}>
                    Rewards stay manual here. This queue just tells ops which referral offers now have enough live advocate signal to deserve a clean review.
                  </div>
                </div>
                <span className="text-[10px] px-2.5 py-1 rounded-lg" style={{ background: "rgba(245,158,11,0.12)", color: "#F59E0B", fontWeight: 700 }}>
                  {referralRewardSummary}
                </span>
              </div>

              <div className="grid gap-3 xl:grid-cols-3">
                {referralRewardLoop.map((offer) => {
                  const laneTone = referralLaneStyles[offer.lane]
                  const statusTone = referralRewardStatusStyles[offer.status]
                  const remediation = buildReferralRewardReviewPrompt({
                    lane: offer.lane,
                    offerName: offer.offerName,
                    rewardLabel: offer.rewardLabel,
                    destinationDescriptor: offer.destinationDescriptor,
                    status: offer.status,
                    askCount: offer.askCount,
                    engagedCount: offer.engagedCount,
                    reviewCount: offer.reviewCount,
                    audienceLabel,
                  })
                  return (
                    <div
                      key={offer.key}
                      className="rounded-2xl p-4"
                      style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
                    >
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <div className="text-sm" style={{ color: "var(--heading)", fontWeight: 700 }}>{offer.offerName}</div>
                          <div className="text-[11px] mt-1" style={{ color: laneTone.text }}>{offer.rewardLabel}</div>
                          <div className="text-[11px] mt-1" style={{ color: "var(--t4)" }}>{offer.destinationDescriptor}</div>
                        </div>
                        <span className="px-2 py-1 rounded-full text-[10px]" style={{ background: statusTone.bg, color: statusTone.text, fontWeight: 700 }}>
                          {statusTone.label}
                        </span>
                      </div>

                      <div className="grid grid-cols-4 gap-2 mb-3">
                        <div className="rounded-xl px-3 py-2" style={{ background: "var(--subtle)" }}>
                          <div className="text-[10px]" style={{ color: "var(--t4)", fontWeight: 600 }}>Asks</div>
                          <div className="text-sm mt-1" style={{ color: "var(--heading)", fontWeight: 800 }}>{offer.askCount}</div>
                        </div>
                        <div className="rounded-xl px-3 py-2" style={{ background: "var(--subtle)" }}>
                          <div className="text-[10px]" style={{ color: "var(--t4)", fontWeight: 600 }}>Engaged</div>
                          <div className="text-sm mt-1" style={{ color: "var(--heading)", fontWeight: 800 }}>{offer.engagedCount}</div>
                        </div>
                        <div className="rounded-xl px-3 py-2" style={{ background: "var(--subtle)" }}>
                          <div className="text-[10px]" style={{ color: "var(--t4)", fontWeight: 600 }}>Review</div>
                          <div className="text-sm mt-1" style={{ color: "var(--heading)", fontWeight: 800 }}>{offer.reviewCount}</div>
                        </div>
                        <div className="rounded-xl px-3 py-2" style={{ background: "var(--subtle)" }}>
                          <div className="text-[10px]" style={{ color: "var(--t4)", fontWeight: 600 }}>Rate</div>
                          <div className="text-sm mt-1" style={{ color: laneTone.text, fontWeight: 800 }}>{offer.rate}%</div>
                        </div>
                      </div>

                      <div className="text-[11px] mt-1.5" style={{ color: "var(--t3)", lineHeight: 1.6 }}>
                        {offer.summary}
                      </div>

                      <div className="mt-4">
                        <Link
                          href={buildMembersAdvisorHref(clubId || '', remediation.prompt)}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:translate-x-[2px]"
                          style={{ background: laneTone.bg, color: laneTone.text }}
                        >
                          <ArrowUpRight className="w-3.5 h-3.5" />
                          {remediation.label}
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          {(referralReferredGuestFunnel?.capturedCount || 0) > 0 || referralReferredGuests.length > 0 ? (
            <div className="rounded-2xl p-4 mb-4 space-y-3" style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-sm" style={{ color: "var(--heading)", fontWeight: 700 }}>Captured referred guests</div>
                  <div className="text-[11px] mt-1.5" style={{ color: "var(--t3)", lineHeight: 1.6 }}>
                    This is the concrete identity layer: actual guests inside the club funnel who came from a known referral motion, not just advocate-side campaign attribution.
                  </div>
                </div>
                <span className="text-[10px] px-2.5 py-1 rounded-lg" style={{ background: "rgba(16,185,129,0.12)", color: "#10B981", fontWeight: 700 }}>
                  {referralReferredGuestFunnel?.capturedCount || referralReferredGuests.length} captured guests
                </span>
              </div>

              {referralReferredGuestFunnel ? (
                <>
                  <div className="text-[11px]" style={{ color: "var(--t3)", lineHeight: 1.6 }}>
                    {referralReferredGuestFunnel.summary}
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                      { label: 'Captured', value: referralReferredGuestFunnel.capturedCount, sub: `${referralReferredGuestFunnel.bookingRate}% booked`, color: '#06B6D4' },
                      { label: 'Booked', value: referralReferredGuestFunnel.bookedCount, sub: `${referralReferredGuestFunnel.showUpRate}% showed up`, color: '#F59E0B' },
                      { label: 'Showed up', value: referralReferredGuestFunnel.showedUpCount, sub: `${referralReferredGuestFunnel.paidConversionRate}% paid`, color: '#8B5CF6' },
                      { label: 'Paid', value: referralReferredGuestFunnel.paidCount, sub: 'converted members', color: '#10B981' },
                    ].map((item) => (
                      <div key={item.label} className="rounded-2xl px-4 py-3" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
                        <div className="text-[11px]" style={{ color: "var(--t4)", fontWeight: 600 }}>{item.label}</div>
                        <div className="text-2xl mt-2" style={{ color: "var(--heading)", fontWeight: 800 }}>{item.value}</div>
                        <div className="text-[10px] mt-1" style={{ color: item.color }}>{item.sub}</div>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}

              <div className="grid gap-3 xl:grid-cols-3">
                {referralReferredGuests.slice(0, 6).map((guest) => {
                  const stageTone = referredGuestStageStyles[guest.stage]
                  const laneTone = guest.sourceLane ? referralLaneStyles[guest.sourceLane] : { bg: 'rgba(148,163,184,0.15)', text: '#94A3B8' }
                  const remediation = buildReferredGuestFollowUpPrompt({
                    guestName: guest.name,
                    stage: guest.stage,
                    sourceOfferName: guest.sourceOfferName,
                    sourceLane: guest.sourceLane,
                    sourceRouteDescriptor: guest.sourceRouteDescriptor,
                    guestOfferName: guest.guestOfferName,
                    guestDestinationDescriptor: guest.guestDestinationDescriptor,
                    nextBestMove: guest.nextBestMove,
                    audienceLabel,
                  })

                  return (
                    <div
                      key={guest.guestUserId}
                      className="rounded-2xl p-4"
                      style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
                    >
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <div className="text-sm" style={{ color: "var(--heading)", fontWeight: 700 }}>{guest.name}</div>
                          <div className="text-[11px] mt-1" style={{ color: "var(--t4)" }}>{guest.email || 'No email on file'}</div>
                        </div>
                        <span className="px-2 py-1 rounded-full text-[10px]" style={{ background: stageTone.bg, color: stageTone.text, fontWeight: 700 }}>
                          {stageTone.label}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {guest.sourceLane ? (
                          <span className="px-2 py-0.5 rounded-lg text-[10px]" style={{ background: laneTone.bg, color: laneTone.text, fontWeight: 700 }}>
                            {referralLaneLabels[guest.sourceLane]}
                          </span>
                        ) : null}
                        {guest.sourceOfferName ? (
                          <span className="px-2 py-0.5 rounded-lg text-[10px]" style={{ background: "rgba(255,255,255,0.06)", color: "var(--heading)", fontWeight: 700 }}>
                            {guest.sourceOfferName}
                          </span>
                        ) : null}
                        {guest.guestOfferName ? (
                          <span className="px-2 py-0.5 rounded-lg text-[10px]" style={{ background: "rgba(6,182,212,0.12)", color: "#06B6D4", fontWeight: 700 }}>
                            {guest.guestOfferName}
                          </span>
                        ) : null}
                      </div>

                      <div className="grid grid-cols-3 gap-2 mb-3">
                        <div className="rounded-xl px-3 py-2" style={{ background: "var(--subtle)" }}>
                          <div className="text-[10px]" style={{ color: "var(--t4)", fontWeight: 600 }}>Bookings</div>
                          <div className="text-sm mt-1" style={{ color: "var(--heading)", fontWeight: 800 }}>{guest.confirmedBookings}</div>
                        </div>
                        <div className="rounded-xl px-3 py-2" style={{ background: "var(--subtle)" }}>
                          <div className="text-[10px]" style={{ color: "var(--t4)", fontWeight: 600 }}>Showed up</div>
                          <div className="text-sm mt-1" style={{ color: "var(--heading)", fontWeight: 800 }}>{guest.playedConfirmedBookings}</div>
                        </div>
                        <div className="rounded-xl px-3 py-2" style={{ background: "var(--subtle)" }}>
                          <div className="text-[10px]" style={{ color: "var(--t4)", fontWeight: 600 }}>Membership</div>
                          <div className="text-sm mt-1" style={{ color: stageTone.text, fontWeight: 800 }}>{formatNormalizedMembershipType(guest.normalizedMembershipType)}</div>
                        </div>
                      </div>

                      <div className="text-[11px]" style={{ color: stageTone.text, fontWeight: 700 }}>
                        {guest.stageLabel}
                      </div>
                      <div className="text-[11px] mt-1.5" style={{ color: "var(--t3)", lineHeight: 1.6 }}>
                        {guest.nextBestMove}
                      </div>
                      <div className="text-[10px] mt-2" style={{ color: "var(--t4)", lineHeight: 1.5 }}>
                        {guest.sourceRouteDescriptor ? `Referral route: ${guest.sourceRouteDescriptor}. ` : ''}
                        {guest.guestDestinationDescriptor ? `Guest route: ${guest.guestDestinationDescriptor}.` : ''}
                      </div>

                      <div className="mt-4">
                        <Link
                          href={buildMembersAdvisorHref(clubId || '', remediation.prompt, guest.guestTrialContext)}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:translate-x-[2px]"
                          style={{ background: stageTone.bg, color: stageTone.text }}
                        >
                          <ArrowUpRight className="w-3.5 h-3.5" />
                          {remediation.label}
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          {referralRewardIssuanceSummary && referralRewardIssuances.length > 0 ? (
            <div className="rounded-2xl p-4 mb-4 space-y-3" style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-sm" style={{ color: "var(--heading)", fontWeight: 700 }}>Reward issuance queue</div>
                  <div className="text-[11px] mt-1.5" style={{ color: "var(--t3)", lineHeight: 1.6 }}>
                    {referralRewardIssuanceSummary.summary}
                  </div>
                </div>
                <span className="text-[10px] px-2.5 py-1 rounded-lg" style={{ background: "rgba(16,185,129,0.12)", color: "#10B981", fontWeight: 700 }}>
                  {referralRewardIssuanceSummary.readyCount} clean and ready
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-5">
                {[
                  { label: 'Ready', value: referralRewardIssuanceSummary.readyCount, color: '#10B981' },
                  { label: 'Review', value: referralRewardIssuanceSummary.reviewCount, color: '#F59E0B' },
                  { label: 'Blocked', value: referralRewardIssuanceSummary.blockedCount, color: '#EF4444' },
                  { label: 'On hold', value: referralRewardIssuanceSummary.holdCount, color: '#F59E0B' },
                  { label: 'Issued', value: referralRewardIssuanceSummary.issuedCount, color: '#3B82F6' },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl px-4 py-3" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
                    <div className="text-[11px]" style={{ color: "var(--t4)", fontWeight: 600 }}>{item.label}</div>
                    <div className="text-2xl mt-2" style={{ color: "var(--heading)", fontWeight: 800 }}>{item.value}</div>
                    <div className="text-[10px] mt-1" style={{ color: item.color }}>identity-backed rewards</div>
                  </div>
                ))}
              </div>

              <div className="grid gap-3 xl:grid-cols-2">
                {referralRewardIssuances.slice(0, 6).map((issuance) => {
                  const tone = referralRewardIssuanceStyles[issuance.status]
                  const guardrailTone = referralRewardGuardrailStyles[issuance.guardrailStatus]
                  const isBusy = activeReferralRewardIssuanceKey === issuance.key && updateReferralRewardIssuance.isPending
                  return (
                    <div
                      key={issuance.key}
                      className="rounded-2xl p-4"
                      style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
                    >
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <div className="text-sm" style={{ color: "var(--heading)", fontWeight: 700 }}>
                            {issuance.advocateName} → {issuance.referredGuestName}
                          </div>
                          <div className="text-[11px] mt-1" style={{ color: "var(--t4)" }}>
                            {issuance.rewardLabel} via {referralLaneLabels[issuance.lane]}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                          <span className="px-2 py-1 rounded-full text-[10px]" style={{ background: tone.bg, color: tone.text, fontWeight: 700 }}>
                            {tone.label}
                          </span>
                          <span className="px-2 py-1 rounded-full text-[10px]" style={{ background: guardrailTone.bg, color: guardrailTone.text, fontWeight: 700 }}>
                            {guardrailTone.label}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5 mb-3">
                        <span className="px-2 py-0.5 rounded-lg text-[10px]" style={{ background: "rgba(255,255,255,0.06)", color: "var(--heading)", fontWeight: 700 }}>
                          {issuance.offerName}
                        </span>
                        {issuance.destinationDescriptor ? (
                          <span className="px-2 py-0.5 rounded-lg text-[10px]" style={{ background: "rgba(6,182,212,0.12)", color: "#06B6D4", fontWeight: 700 }}>
                            {issuance.destinationDescriptor}
                          </span>
                        ) : null}
                        {issuance.autoIssueSuggested ? (
                          <span className="px-2 py-0.5 rounded-lg text-[10px]" style={{ background: "rgba(16,185,129,0.12)", color: "#10B981", fontWeight: 700 }}>
                            Issue now suggested
                          </span>
                        ) : null}
                        {issuance.duplicateRisk ? (
                          <span className="px-2 py-0.5 rounded-lg text-[10px]" style={{ background: "rgba(245,158,11,0.12)", color: "#F59E0B", fontWeight: 700 }}>
                            Duplicate risk
                          </span>
                        ) : null}
                        {issuance.abuseRisk ? (
                          <span className="px-2 py-0.5 rounded-lg text-[10px]" style={{ background: "rgba(239,68,68,0.12)", color: "#EF4444", fontWeight: 700 }}>
                            Abuse risk
                          </span>
                        ) : null}
                      </div>

                      <div className="text-[11px]" style={{ color: "var(--t3)", lineHeight: 1.6 }}>
                        {issuance.summary}
                      </div>
                      <div className="text-[11px] mt-2" style={{ color: guardrailTone.text, lineHeight: 1.6, fontWeight: 700 }}>
                        {issuance.guardrailSummary}
                      </div>
                      <div className="text-[11px] mt-2" style={{ color: tone.text, lineHeight: 1.6, fontWeight: 700 }}>
                        {issuance.nextBestMove}
                      </div>
                      {issuance.guardrailReasons.length > 0 ? (
                        <div className="mt-3 space-y-1">
                          {issuance.guardrailReasons.map((reason) => (
                            <div key={reason} className="text-[10px]" style={{ color: "var(--t4)", lineHeight: 1.5 }}>
                              • {reason}
                            </div>
                          ))}
                        </div>
                      ) : null}

                      <div className="flex flex-wrap gap-2 mt-4">
                        {issuance.status !== 'issued' ? (
                          <button
                            onClick={() => handleReferralRewardIssuanceUpdate(issuance, 'issued')}
                            disabled={isBusy || !clubId || issuance.guardrailStatus === 'blocked'}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:translate-x-[2px] disabled:opacity-60"
                            style={{ background: 'rgba(16,185,129,0.14)', color: '#10B981' }}
                          >
                            {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            {issuance.autoIssueSuggested ? 'Mark issued' : 'Issue after review'}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleReferralRewardIssuanceUpdate(issuance, 'ready_issue')}
                            disabled={isBusy || !clubId}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:translate-x-[2px] disabled:opacity-60"
                            style={{ background: 'rgba(59,130,246,0.14)', color: '#3B82F6' }}
                          >
                            {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                            Reopen
                          </button>
                        )}

                        {issuance.status !== 'on_hold' ? (
                          <button
                            onClick={() => handleReferralRewardIssuanceUpdate(issuance, 'on_hold')}
                            disabled={isBusy || !clubId}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:translate-x-[2px] disabled:opacity-60"
                            style={{ background: 'rgba(245,158,11,0.14)', color: '#F59E0B' }}
                          >
                            {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clock className="w-3.5 h-3.5" />}
                            Hold
                          </button>
                        ) : (
                          <button
                            onClick={() => handleReferralRewardIssuanceUpdate(issuance, 'ready_issue')}
                            disabled={isBusy || !clubId}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:translate-x-[2px] disabled:opacity-60"
                            style={{ background: 'rgba(16,185,129,0.14)', color: '#10B981' }}
                          >
                            {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            Ready again
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {referralRewardLedger.length > 0 ? (
                <div className="rounded-2xl p-4" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
                  <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                    <div>
                      <div className="text-sm" style={{ color: "var(--heading)", fontWeight: 700 }}>Advocate reward ledger</div>
                      <div className="text-[11px] mt-1.5" style={{ color: "var(--t3)", lineHeight: 1.6 }}>
                        The ledger rolls reward state up by advocate, so clean cases, review work and issued rewards stay visible on one line.
                      </div>
                    </div>
                    <span className="text-[10px] px-2.5 py-1 rounded-lg" style={{ background: "rgba(59,130,246,0.12)", color: "#3B82F6", fontWeight: 700 }}>
                      {referralRewardLedger.length} tracked advocates
                    </span>
                  </div>

                  <div className="grid gap-3 xl:grid-cols-2">
                    {referralRewardLedger.slice(0, 6).map((entry) => (
                      <div key={entry.advocateUserId} className="rounded-2xl p-4" style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm" style={{ color: "var(--heading)", fontWeight: 700 }}>{entry.advocateName}</div>
                            <div className="text-[11px] mt-1" style={{ color: "var(--t4)" }}>
                              {entry.lastRewardLabel ? `${entry.lastRewardLabel}${entry.lastGuestName ? ` for ${entry.lastGuestName}` : ''}` : 'No issued rewards yet'}
                            </div>
                          </div>
                          <span className="px-2 py-1 rounded-full text-[10px]" style={{ background: "rgba(255,255,255,0.06)", color: "var(--heading)", fontWeight: 700 }}>
                            {entry.totalRewards} tracked rewards
                          </span>
                        </div>
                        <div className="grid grid-cols-5 gap-2 mt-3">
                          {[
                            { label: 'Ready', value: entry.readyCount, color: '#10B981' },
                            { label: 'Review', value: entry.reviewCount, color: '#F59E0B' },
                            { label: 'Blocked', value: entry.blockedCount, color: '#EF4444' },
                            { label: 'Hold', value: entry.holdCount, color: '#F59E0B' },
                            { label: 'Issued', value: entry.issuedCount, color: '#3B82F6' },
                          ].map((item) => (
                            <div key={item.label} className="rounded-xl px-2 py-2 text-center" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
                              <div className="text-[10px]" style={{ color: "var(--t4)", fontWeight: 600 }}>{item.label}</div>
                              <div className="text-sm mt-1" style={{ color: item.color, fontWeight: 800 }}>{item.value}</div>
                            </div>
                          ))}
                        </div>
                        <div className="text-[11px] mt-3" style={{ color: "var(--t3)", lineHeight: 1.6 }}>{entry.summary}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {referralLaneLoop.length > 0 ? (
            <div className="rounded-2xl p-4 mb-4 space-y-3" style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-sm" style={{ color: "var(--heading)", fontWeight: 700 }}>Referral lane loop</div>
                  <div className="text-[11px] mt-1.5" style={{ color: "var(--t3)", lineHeight: 1.6 }}>
                    Each referral lane now has its own health lens, so you can see whether VIP advocates, social regulars, or dormant advocates need a tighter bring-a-friend motion.
                  </div>
                </div>
                <span className="text-[10px] px-2.5 py-1 rounded-lg" style={{ background: "rgba(6,182,212,0.12)", color: "#06B6D4", fontWeight: 700 }}>
                  {referralLaneLoop.length} tracked lanes
                </span>
              </div>

              <div className="grid gap-3 xl:grid-cols-3">
                {referralLaneLoop.map((lane) => {
                  const laneTone = referralLaneStyles[lane.lane]
                  const statusTone = referralLaneStatusStyles[lane.status]
                  const remediation = buildReferralLaneRemediationPrompt({
                    lane: lane.lane,
                    status: lane.status,
                    title: lane.title,
                    rate: lane.rate,
                    candidateCount: lane.candidateCount,
                    outcomeCount: lane.outcomeCount,
                    baseCount: lane.baseCount,
                    audienceLabel,
                  })
                  return (
                    <div
                      key={lane.key}
                      className="rounded-2xl p-4"
                      style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
                    >
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <div className="text-sm" style={{ color: "var(--heading)", fontWeight: 700 }}>{lane.title}</div>
                          <div className="text-[11px] mt-1" style={{ color: "var(--t4)" }}>{referralLaneLabels[lane.lane]}</div>
                        </div>
                        <span className="px-2 py-1 rounded-full text-[10px]" style={{ background: statusTone.bg, color: statusTone.text, fontWeight: 700 }}>
                          {statusTone.label}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2 mb-3">
                        <span className="px-2 py-1 rounded-full text-[10px]" style={{ background: laneTone.bg, color: laneTone.text, fontWeight: 700 }}>
                          {lane.rate}% rate
                        </span>
                        <span className="px-2 py-1 rounded-full text-[10px]" style={{ background: "rgba(255,255,255,0.08)", color: "var(--heading)", fontWeight: 700 }}>
                          {lane.candidateCount} in lane
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 mb-3">
                        <div className="rounded-xl px-3 py-2" style={{ background: "var(--subtle)" }}>
                          <div className="text-[10px]" style={{ color: "var(--t4)", fontWeight: 600 }}>In lane</div>
                          <div className="text-sm mt-1" style={{ color: "var(--heading)", fontWeight: 800 }}>{lane.candidateCount}</div>
                        </div>
                        <div className="rounded-xl px-3 py-2" style={{ background: "var(--subtle)" }}>
                          <div className="text-[10px]" style={{ color: "var(--t4)", fontWeight: 600 }}>Outcome</div>
                          <div className="text-sm mt-1" style={{ color: "var(--heading)", fontWeight: 800 }}>{lane.outcomeCount}</div>
                        </div>
                        <div className="rounded-xl px-3 py-2" style={{ background: "var(--subtle)" }}>
                          <div className="text-[10px]" style={{ color: "var(--t4)", fontWeight: 600 }}>Base</div>
                          <div className="text-sm mt-1" style={{ color: "var(--heading)", fontWeight: 800 }}>{lane.baseCount}</div>
                        </div>
                      </div>

                      <div className="text-[11px]" style={{ color: laneTone.text, fontWeight: 700 }}>
                        {lane.outcomeLabel}
                      </div>
                      <div className="text-[11px] mt-1.5" style={{ color: "var(--t3)", lineHeight: 1.6 }}>
                        {lane.summary}
                      </div>

                      <div className="mt-4">
                        <Link
                          href={buildMembersAdvisorHref(clubId || '', remediation.prompt)}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:translate-x-[2px]"
                          style={{ background: laneTone.bg, color: laneTone.text }}
                        >
                          <ArrowUpRight className="w-3.5 h-3.5" />
                          {remediation.label}
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
            {referralCandidates.slice(0, 4).map((candidate) => {
              const laneStyle = referralLaneStyles[candidate.lane]
              const urgencyStyle = smartFirstSessionUrgencyStyles[candidate.urgency]
              return (
                <div
                  key={candidate.memberId}
                  className="rounded-2xl p-4"
                  style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0">
                      <div className="text-sm truncate" style={{ color: "var(--heading)", fontWeight: 700 }}>{candidate.name}</div>
                      <div className="text-[11px] mt-1" style={{ color: "var(--t4)" }}>
                        {candidate.email || 'No email on file'}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-lg text-[10px]" style={{ background: "rgba(255,255,255,0.08)", color: "var(--heading)", fontWeight: 700 }}>
                      {candidate.score}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-3">
                    <span className="px-2 py-0.5 rounded-lg text-[10px]" style={{ background: laneStyle.bg, color: laneStyle.text, fontWeight: 700 }}>
                      {referralLaneLabels[candidate.lane]}
                    </span>
                    <span className="px-2 py-0.5 rounded-lg text-[10px]" style={{ background: urgencyStyle.bg, color: urgencyStyle.text, fontWeight: 700 }}>
                      {urgencyStyle.label}
                    </span>
                    <span className="px-2 py-0.5 rounded-lg text-[10px]" style={{ background: "rgba(255,255,255,0.08)", color: "var(--heading)", fontWeight: 700 }}>
                      {candidate.activeCoPlayers}/{candidate.totalCoPlayers} co-players
                    </span>
                  </div>

                  <div className="text-[11px]" style={{ color: "var(--t3)", lineHeight: 1.55 }}>
                    {candidate.topReason}
                  </div>
                  {candidate.recommendedOffer ? (
                    <div className="mt-2 text-[11px]" style={{ color: laneStyle.text, lineHeight: 1.55 }}>
                      Offer: {candidate.recommendedOffer.descriptor} via {candidate.recommendedOffer.destinationDescriptor}
                    </div>
                  ) : null}
                  <div className="mt-3 text-[11px]" style={{ color: laneStyle.text, lineHeight: 1.55, fontWeight: 600 }}>
                    {candidate.nextBestMove}
                  </div>
                  {candidate.recommendedOffer ? (
                    <div className="mt-4">
                      <Link
                        href={buildMembersAdvisorHref(
                          clubId || '',
                          `Draft the safest referral move for ${candidate.name} in the ${referralLaneLabels[candidate.lane].toLowerCase()} lane. Use ${candidate.recommendedOffer.descriptor} via ${candidate.recommendedOffer.destinationDescriptor}. ${candidate.topReason} Keep the first version review-ready and targeted to this advocate.`,
                          null,
                          buildReferralExecutionContext({
                            lane: candidate.lane,
                            offer: candidate.recommendedOffer,
                            advocate: {
                              userId: candidate.memberId,
                              name: candidate.name,
                              email: candidate.email,
                            },
                          }),
                        )}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:translate-x-[2px]"
                        style={{ background: laneStyle.bg, color: laneStyle.text }}
                      >
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        Draft advocate move
                      </Link>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* P2-T8: KPI strip moved into Insights drawer (assembled below before
          drawer mount; rendered there so the table is visible immediately). */}

      {/* P2-T5: AI Insight ribbon — single high-impact insight below KPIs.
          Hidden when no rule matches OR user dismissed (7d localStorage).
          See SPEC §4 P2-T5. */}
      {clubId && <AIInsightRibbon clubId={clubId} />}

      {/* P5-T5: Agent Actions block fully removed. The "Renew Expired" /
          "Upsell Package" cards are now AI-Suggested cohorts on the
          Cohorts page (P3-T2). See PLAN §3.6 + §4.7 for migration
          rationale. The `membersAgentActions` memo above stays for now
          because its computed counts feed `audienceMembers`-driven
          summaries elsewhere on the page; remove once those callers
          are tidied. */}
      {false && membersAgentActions.length > 0 && (
        <Card>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {membersAgentActions.slice(0, 3).map((action) => {
              const Icon = action.Icon;
              return (
                <Link
                  key={action.key}
                  href={action.href}
                  className="group rounded-2xl p-4 transition-all"
                  style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br ${action.tone}`}>
                      <Icon className="w-4 h-4" style={{ color: "var(--heading)" }} />
                    </div>
                    <span className="px-2 py-0.5 rounded-lg text-[10px]" style={{ background: "rgba(139,92,246,0.1)", color: "#A78BFA", fontWeight: 700 }}>
                      {action.count}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    <div className="text-sm" style={{ color: "var(--heading)", fontWeight: 700 }}>{action.title}</div>
                    <div className="text-[11px]" style={{ color: "var(--t3)", lineHeight: 1.5 }}>{action.description}</div>
                  </div>
                  <div className="mt-4 flex items-center gap-1.5 text-[11px]" style={{ color: '#8B5CF6', fontWeight: 700 }}>
                    Open in Advisor
                    <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>
      )}

      {/* P2-T8: Compact toolbar replacing the prior 6-row inline filter strip
          + 3-col chart grid. All filters now live in MembersFilterDrawer (right
          slide-in); charts in MembersChartsDrawer. Active filters render as
          dismissible chips below the toolbar. */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          {/* Search */}
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl flex-1 min-w-[240px] max-w-[360px]"
            style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}
          >
            <Search className="w-4 h-4" style={{ color: "var(--t4)" }} />
            <input
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              className="bg-transparent border-none outline-none text-sm w-full"
              style={{ color: "var(--t1)" }}
            />
          </div>

          {/* Right cluster */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Filters drawer trigger */}
            <button
              onClick={() => setFilterDrawerOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs transition-all"
              style={{
                background: activeFilterCount > 0 ? "var(--pill-active)" : "var(--subtle)",
                color: activeFilterCount > 0 ? (isDark ? "#C4B5FD" : "#7C3AED") : "var(--t3)",
                fontWeight: activeFilterCount > 0 ? 700 : 600,
                border: "1px solid var(--card-border)",
              }}
            >
              <FilterIcon className="w-3.5 h-3.5" />
              Filters
              {activeFilterCount > 0 && (
                <span
                  className="px-1.5 rounded-full text-[10px]"
                  style={{ background: "rgba(139,92,246,0.25)", fontWeight: 700 }}
                >
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Quick presets dropdown */}
            <div className="relative">
              <button
                onClick={() => setPresetMenuOpen(o => !o)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs transition-all"
                style={{
                  background: "var(--subtle)",
                  color: "var(--t3)",
                  fontWeight: 600,
                  border: "1px solid var(--card-border)",
                }}
              >
                {currentPresetLabel}
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {presetMenuOpen && (
                <>
                  {/* Click-outside catcher */}
                  <div
                    className="fixed inset-0 z-20"
                    onClick={() => setPresetMenuOpen(false)}
                  />
                  <div
                    className="absolute right-0 mt-2 z-30 rounded-xl py-1 min-w-[220px] backdrop-blur-md"
                    style={{
                      background: isDark ? "#15151F" : "#FFFFFF",
                      border: "1px solid var(--card-border)",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
                    }}
                  >
                    {[
                      { key: "all", label: "All members" },
                      { key: "at-risk", label: "At-Risk" },
                      { key: "critical", label: "Critical" },
                      { key: "vip", label: "VIP" },
                      { key: "trial", label: "Trial members" },
                      { key: "inactive", label: "Inactive" },
                      { key: "power", label: "Power players" },
                    ].map(p => {
                      const count = presetCounts[p.key as keyof typeof presetCounts] ?? 0
                      return (
                        <button
                          key={p.key}
                          onClick={() => { applyPreset(p.key); setPresetMenuOpen(false); }}
                          className="w-full flex items-center justify-between gap-3 text-left px-3 py-1.5 text-xs transition-colors"
                          style={{ color: "var(--t2)" }}
                          onMouseEnter={(e: MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"; }}
                          onMouseLeave={(e: MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = "transparent"; }}
                        >
                          <span>{p.label}</span>
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded-md tabular-nums"
                            style={{
                              background: count > 0 ? "var(--subtle)" : "transparent",
                              color: count > 0 ? "var(--t3)" : "var(--t4)",
                              fontWeight: 600,
                              minWidth: 22,
                              textAlign: "center",
                            }}
                          >
                            {count}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Sort */}
            <div className="flex items-center gap-1 text-[11px]" style={{ color: "var(--t3)" }}>
              <span>Sort:</span>
              {(["health", "revenue", "sessions", "name"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSortBy(s)}
                  className="px-2 py-1 rounded-lg capitalize transition-all"
                  style={{
                    background: sortBy === s ? "var(--pill-active)" : "transparent",
                    color: sortBy === s ? (isDark ? "#C4B5FD" : "#7C3AED") : "var(--t4)",
                    fontWeight: sortBy === s ? 600 : 400,
                  }}
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Page size */}
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="text-[11px] px-2 py-1.5 rounded-xl outline-none"
              style={{ background: "var(--subtle)", border: "1px solid var(--card-border)", color: "var(--t2)" }}
            >
              {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n} / page</option>)}
            </select>

            {/* View toggle */}
            <div className="flex rounded-xl overflow-hidden" style={{ border: "1px solid var(--card-border)" }}>
              {([
                { mode: "list" as const, Icon: List, title: "List view (default)" },
                { mode: "grid" as const, Icon: LayoutGrid, title: "Grid view" },
                { mode: "cards" as const, Icon: Sparkles, title: "Cards view" },
              ]).map(({ mode, Icon, title }) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  title={title}
                  className="p-2 transition-all"
                  style={{
                    background: viewMode === mode ? "var(--pill-active)" : "transparent",
                    color: viewMode === mode ? (isDark ? "#C4B5FD" : "#7C3AED") : "var(--t4)",
                  }}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Active filter chips — dismissible */}
        {activeFilterCount > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {activeFilterChips.map(c => (
              <button
                key={c.key}
                onClick={c.onClear}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] transition-all"
                style={{
                  background: "var(--pill-active)",
                  color: isDark ? "#C4B5FD" : "#7C3AED",
                  fontWeight: 600,
                  border: "1px solid rgba(139,92,246,0.25)",
                }}
              >
                <span style={{ color: "var(--t4)", fontWeight: 500 }}>{c.group}:</span>
                {c.label}
                <XIcon className="w-3 h-3 opacity-70" />
              </button>
            ))}
            <button
              onClick={clearAllFilters}
              className="text-[11px] px-2 py-1 rounded-lg transition-colors"
              style={{ color: "var(--t4)" }}
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Save filtered members as Cohort */}
      {(filterRisk !== 'all' || filterTrend !== 'all' || filterValue !== 'all' || filterActivity !== 'all' || filterMembershipType !== 'all' || filterMembershipStatus !== 'all') && filtered.length > 0 && (
        <SaveAsCohortButton clubId={clubId!} memberIds={filtered.map(m => m.id).filter(Boolean) as string[]} filterDescription={[
          filterRisk !== 'all' ? `Risk: ${filterRisk}` : '',
          filterTrend !== 'all' ? `Trend: ${filterTrend}` : '',
          filterValue !== 'all' ? `Value: ${filterValue}` : '',
          filterActivity !== 'all' ? `Activity: ${filterActivity}` : '',
          filterMembershipStatus !== 'all' ? `Membership state: ${formatNormalizedMembershipStatus(filterMembershipStatus)}` : '',
          filterMembershipType !== 'all' ? `Membership tier: ${formatNormalizedMembershipType(filterMembershipType)}` : '',
        ].filter(Boolean).join(', ')} count={filtered.length} />
      )}

      {/* P2-T8: BulkSelectToolbar lifted to top of view (above ternary) so
          it appears on both All Members and Reactivation views. */}

      {/* P2-T2: Member layout — list (default), grid (multi-col), cards (alias of grid for now) */}
      {(viewMode === "grid" || viewMode === "cards") ? (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {paginated.map((member, i) => (
            <motion.div
              key={member.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <Card className="cursor-pointer transition-all hover:scale-[1.02]">
                <div onClick={() => openMemberDrawer(member.id)} className="flex items-start gap-3 mb-4">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-sm text-white shrink-0"
                    style={{ background: `linear-gradient(135deg, ${segmentConfig[member.segment].color}, ${segmentConfig[member.segment].color}99)`, fontWeight: 700 }}
                  >
                    {member.avatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm truncate hover:underline" style={{ fontWeight: 700, color: "var(--heading)" }}>{member.name}</span>
                      {member.trend === "up" && <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />}
                      {member.trend === "down" && <ArrowDownRight className="w-3.5 h-3.5 text-red-400" />}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      <span className="px-1.5 py-0.5 rounded text-[9px]" style={{ background: activityColors[member.activityLevel].bg, color: activityColors[member.activityLevel].text, fontWeight: 600 }}>
                        {activityLabels[member.activityLevel]}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[9px]" style={{ background: trendColors[member.engagementTrend].bg, color: trendColors[member.engagementTrend].text, fontWeight: 600 }}>
                        {member.engagementTrend === 'growing' ? '\u2191 Growing' : member.engagementTrend === 'declining' ? '\u2193 Declining' : member.engagementTrend === 'churning' ? '\u23F8 Churning' : '\u2192 Stable'}
                      </span>
                      {member.valueTier === 'high' && (
                        <span className="px-1.5 py-0.5 rounded text-[9px]" style={{ background: "rgba(245,158,11,0.15)", color: "#F59E0B", fontWeight: 600 }}>
                          \u2605 High LTV
                        </span>
                      )}
                      {formatNormalizedMembershipType(member.normalizedMembershipType) && (
                        <span className="px-1.5 py-0.5 rounded text-[9px]" style={{ background: "rgba(139,92,246,0.12)", color: "#A78BFA", fontWeight: 600 }}>
                          {formatNormalizedMembershipType(member.normalizedMembershipType)}
                        </span>
                      )}
                      {formatNormalizedMembershipStatus(member.normalizedMembershipStatus) && member.normalizedMembershipStatus !== 'active' && (
                        <span className="px-1.5 py-0.5 rounded text-[9px]" style={{
                          background: getNormalizedMembershipStatusStyle(member.normalizedMembershipStatus).bg,
                          color: getNormalizedMembershipStatusStyle(member.normalizedMembershipStatus).text,
                          fontWeight: 600,
                        }}>
                          {formatNormalizedMembershipStatus(member.normalizedMembershipStatus)}
                        </span>
                      )}
                      <span className="text-[9px] self-center" style={{ color: "var(--t4)" }}>{member.sport}</span>
                    </div>
                    {(member.membershipType || member.membershipStatus) && (
                      <div className="text-[9px] truncate max-w-[200px]" style={{ color: "var(--t4)" }} title={member.membershipType || member.membershipStatus || undefined}>
                        {[
                          member.membershipType ? `Raw: ${member.membershipType}` : null,
                          member.membershipStatus && member.membershipStatus !== 'Currently Active' ? member.membershipStatus : null,
                        ].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                  <HealthBar score={member.healthScore} />
                </div>

                {/* Suggested action for at-risk members */}
                {member.suggestedAction && (member.segment === 'at-risk' || member.segment === 'critical' || (member.normalizedMembershipStatus && !['active', 'unknown'].includes(member.normalizedMembershipStatus))) && (
                  <div className="mb-3 px-3 py-2 rounded-lg text-[11px] flex items-start gap-2" style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.15)", color: "#A78BFA" }}>
                    <Target className="w-3 h-3 mt-0.5 shrink-0" />
                    {member.suggestedAction}
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[
                    { label: "Rating", value: member.rating ? `\u2B50 ${member.rating}` : "N/A" },
                    { label: getPeriodLabel(period), value: `${getSessionsForPeriod(member, period)} sessions` },
                    { label: "Avg/Week", value: `${member.avgSessionsPerWeek} sessions` },
                  ].map((stat) => (
                    <div key={stat.label} className="text-center p-2 rounded-lg" style={{ background: "var(--subtle)" }}>
                      <div className="text-[10px]" style={{ color: "var(--t4)" }}>{stat.label}</div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--t1)", fontWeight: 600 }}>{stat.value}</div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between text-[11px]" style={{ color: "var(--t3)" }}>
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>Last: {member.lastPlayed}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <CalendarDays className="w-3 h-3" />
                    <span>Since {member.memberSince}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: "1px solid var(--divider)" }}>
                  <span className="text-[10px]" style={{ color: "var(--t4)" }}>Prefers: {member.favoriteTime} {"\u2022"} {member.favoriteFormat}</span>
                  <div className="ml-auto flex items-center gap-1.5">
                    {sentMessages[member.id] ? (
                      <span className="px-2.5 py-1 rounded-lg text-[10px] flex items-center gap-1" style={{ background: "rgba(16,185,129,0.15)", color: "#10B981", fontWeight: 600 }}>
                        ✓ Sent via {sentMessages[member.id]}
                      </span>
                    ) : (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); handleOutreach(member.id, "email", member); }} className="px-2.5 py-1 rounded-lg text-[10px] flex items-center gap-1 transition-colors" style={{ background: "rgba(139,92,246,0.15)", color: "#A78BFA", fontWeight: 600 }}>
                          <Mail className="w-3 h-3" /> Email
                        </button>
                        <SmsComingSoon />
                      </>
                    )}
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      ) : (
        <Card className="!p-0 overflow-hidden">
          {/* List header — P2-T3: checkbox column added at start */}
          <div
            className="grid items-center px-5 py-3 text-[10px] uppercase tracking-wider"
            style={{
              gridTemplateColumns: "32px 40px 1fr 100px 52px 64px 72px 72px 80px 120px",
              gap: "0 12px",
              color: "var(--t4)",
              fontWeight: 600,
              borderBottom: "1px solid var(--divider)",
            }}
          >
            {/* Master checkbox: select all on current page */}
            <div className="flex items-center justify-center">
              <input
                type="checkbox"
                aria-label="Select all on page"
                className="w-4 h-4 cursor-pointer"
                checked={paginated.length > 0 && paginated.every(m => selectedMemberIds.has(m.id))}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedMemberIds(prev => {
                      const next = new Set(prev)
                      paginated.forEach(m => next.add(m.id))
                      return next
                    })
                  } else {
                    setSelectedMemberIds(prev => {
                      const next = new Set(prev)
                      paginated.forEach(m => next.delete(m.id))
                      return next
                    })
                  }
                }}
              />
            </div>
            <span />
            <span>Member</span>
            <span className="hidden md:block">Segment</span>
            <span className="text-center hidden md:block">Rating</span>
            <span className="text-center hidden md:block">Sessions</span>
            <span className="text-right hidden sm:block">Revenue</span>
            <span className="text-center hidden lg:block">Health</span>
            <span className="hidden lg:block">Last Active</span>
            <span />
          </div>
          {paginated.map((member, i) => {
            const seg = segmentConfig[member.segment];
            const isSelected = selectedMemberIds.has(member.id)
            return (
              <motion.div
                key={member.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.02 }}
                className="grid items-center px-5 py-3 cursor-pointer transition-colors"
                style={{
                  gridTemplateColumns: "32px 40px 1fr 100px 52px 64px 72px 72px 80px 120px",
                  gap: "0 12px",
                  borderBottom: "1px solid var(--divider)",
                  background: isSelected ? "rgba(139,92,246,0.06)" : undefined,
                }}
                onClick={() => openMemberDrawer(member.id)}
                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "var(--hover)" }}
                onMouseLeave={(e) => { e.currentTarget.style.background = isSelected ? "rgba(139,92,246,0.06)" : "transparent" }}
              >
                {/* P2-T3: per-row checkbox; click stops propagation so row click still opens drawer */}
                <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    aria-label={`Select ${member.name}`}
                    checked={isSelected}
                    onChange={() => toggleMemberSelection(member.id)}
                    className="w-4 h-4 cursor-pointer"
                  />
                </div>
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-xs text-white"
                  style={{ background: `linear-gradient(135deg, ${seg.color}, ${seg.color}99)`, fontWeight: 700 }}
                >
                  {member.avatar}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm truncate" style={{ fontWeight: 600, color: "var(--heading)" }}>{member.name}</span>
                    {member.trend === "up" && <ArrowUpRight className="w-3 h-3 text-emerald-400 shrink-0" />}
                    {member.trend === "down" && <ArrowDownRight className="w-3 h-3 text-red-400 shrink-0" />}
                  </div>
                  <div className="text-[10px] flex flex-wrap gap-1.5" style={{ color: "var(--t4)" }}>
                    <span>{member.sport}</span>
                    {formatNormalizedMembershipType(member.normalizedMembershipType) && (
                      <span>{formatNormalizedMembershipType(member.normalizedMembershipType)}</span>
                    )}
                    {formatNormalizedMembershipStatus(member.normalizedMembershipStatus) && member.normalizedMembershipStatus !== 'active' && (
                      <span>{formatNormalizedMembershipStatus(member.normalizedMembershipStatus)}</span>
                    )}
                  </div>
                </div>
                <div className="hidden md:flex flex-wrap gap-0.5">
                  <span className="px-1.5 py-0.5 rounded text-[9px]" style={{ background: activityColors[member.activityLevel].bg, color: activityColors[member.activityLevel].text, fontWeight: 600 }}>{activityLabels[member.activityLevel]}</span>
                  <span className="px-1.5 py-0.5 rounded text-[9px]" style={{ background: trendColors[member.engagementTrend].bg, color: trendColors[member.engagementTrend].text, fontWeight: 600 }}>{member.engagementTrend === 'growing' ? '\u2191' : member.engagementTrend === 'declining' ? '\u2193' : member.engagementTrend === 'churning' ? '\u23F8' : '\u2192'}</span>
                </div>
                <div className="text-center text-xs hidden md:block" style={{ color: "var(--t1)", fontWeight: 600 }}>{member.rating}</div>
                <div className="text-center text-xs hidden md:block" style={{ color: "var(--t1)", fontWeight: 600 }}>{getSessionsForPeriod(member, period)}</div>
                <div className="text-right text-xs hidden sm:block" style={{ color: "#10B981", fontWeight: 700 }}>${member.revenue.toLocaleString()}</div>
                <div className="hidden lg:block"><HealthBar score={member.healthScore} /></div>
                <div className="text-[11px] hidden lg:block" style={{ color: "var(--t3)" }}>{member.lastPlayed}</div>
                <div className="flex items-center gap-1.5 justify-end">
                  {sentMessages[member.id] ? (
                    <span className="px-2 py-0.5 rounded-lg text-[10px]" style={{ background: "rgba(16,185,129,0.15)", color: "#10B981", fontWeight: 600 }}>✓ {sentMessages[member.id]}</span>
                  ) : (<>
                  <button onClick={(e) => { e.stopPropagation(); handleOutreach(member.id, "email", member); }} className="px-2 py-0.5 rounded-lg text-[10px] flex items-center gap-1 transition-colors" style={{ background: "rgba(139,92,246,0.15)", color: "#A78BFA", fontWeight: 600 }}>
                    <Mail className="w-3 h-3" /> Email
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleOutreach(member.id, "sms", member); }} className="px-2 py-0.5 rounded-lg text-[10px] flex items-center gap-1 transition-colors" style={{ background: "rgba(16,185,129,0.15)", color: "#10B981", fontWeight: 600 }}>
                    <Smartphone className="w-3 h-3" /> SMS
                  </button>
                  </>)}
                </div>
              </motion.div>
            );
          })}
        </Card>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between pt-2" style={{ borderTop: "1px solid var(--divider)" }}>
        <span className="text-xs" style={{ color: "var(--t4)" }}>
          Showing {filtered.length === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of {filtered.length} members
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-lg text-xs transition-all disabled:opacity-30"
              style={{ background: "var(--subtle)", border: "1px solid var(--card-border)", color: "var(--t2)" }}
            >
              ← Prev
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const p = totalPages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= totalPages - 3 ? totalPages - 6 + i : page - 3 + i;
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className="w-8 h-8 rounded-lg text-xs transition-all"
                  style={{
                    background: page === p ? "linear-gradient(135deg, #8B5CF6, #06B6D4)" : "var(--subtle)",
                    border: `1px solid ${page === p ? "transparent" : "var(--card-border)"}`,
                    color: page === p ? "white" : "var(--t2)",
                    fontWeight: page === p ? 700 : 500,
                  }}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 rounded-lg text-xs transition-all disabled:opacity-30"
              style={{ background: "var(--subtle)", border: "1px solid var(--card-border)", color: "var(--t2)" }}
            >
              Next →
            </button>
          </div>
        )}
      </div>
      </>)}

      {/* P2-T4: Member Detail side-drawer (replaces full-page navigation).
          URL ?member=<userId> ↔ selectedPlayerId synced via useEffect above. */}
      {clubId && (
        <MemberDetailDrawer
          memberId={selectedPlayerId}
          clubId={clubId}
          onClose={closeMemberDrawer}
        />
      )}

      {/* P2-T8: Filter drawer — replaces 6-row inline filter strip. */}
      <MembersFilterDrawer
        open={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
        matchCount={filtered.length}
        filterMembershipStatus={filterMembershipStatus}
        setFilterMembershipStatus={setFilterMembershipStatus}
        filterMembershipType={filterMembershipType}
        setFilterMembershipType={setFilterMembershipType}
        filterActivity={filterActivity}
        setFilterActivity={setFilterActivity}
        filterRisk={filterRisk}
        setFilterRisk={setFilterRisk}
        filterTrend={filterTrend}
        setFilterTrend={setFilterTrend}
        filterValue={filterValue}
        setFilterValue={setFilterValue}
        isDark={isDark}
      />

      {/* P2-T8: Insights drawer — Period selector + KPI strip + 3 trend
          charts. State stays here; drawer renders the JSX we hand it. */}
      <MembersChartsDrawer
        open={chartsDrawerOpen}
        onClose={() => setChartsDrawerOpen(false)}
        memberGrowth={displayMemberGrowth}
        activityDistribution={displayActivityDistribution}
        churnTrend={churnTrendData?.trend ?? []}
        header={(() => {
          // Period buttons drive useMemberKpiDeltas + useChurnTrend windows.
          // Custom date range is reserved for Phase 6 — currently behaves like Month.
          const periodButtons = (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--t4)" }}>Period</span>
              <div className="flex rounded-xl overflow-hidden" style={{ border: "1px solid var(--card-border)" }}>
                {(["week", "month", "quarter", "custom"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className="px-3 py-1.5 text-xs capitalize transition-all"
                    style={{
                      background: period === p ? "var(--pill-active)" : "transparent",
                      color: period === p ? (isDark ? "#C4B5FD" : "#7C3AED") : "var(--t3)",
                      fontWeight: period === p ? 600 : 500,
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
              {period === "custom" && (
                <div className="flex items-center gap-2">
                  <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-8 px-2 text-xs rounded-lg outline-none" style={{ background: "var(--subtle)", border: "1px solid var(--card-border)", color: "var(--t2)", colorScheme: isDark ? "dark" : "light" }} />
                  <span className="text-xs" style={{ color: "var(--t4)" }}>to</span>
                  <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-8 px-2 text-xs rounded-lg outline-none" style={{ background: "var(--subtle)", border: "1px solid var(--card-border)", color: "var(--t2)", colorScheme: isDark ? "dark" : "light" }} />
                </div>
              )}
            </div>
          );

          // KPI strip — same logic as before, just rendered inside the
          // drawer at 2-col on narrow / 3-col on the 720px drawer width.
          const active = allMembers.filter(m => m.normalizedMembershipStatus === 'active').length;
          const packages = allMembers.filter(m => m.normalizedMembershipType === 'package').length;
          const vip = allMembers.filter(m => m.normalizedMembershipType === 'unlimited').length;
          const avgHealth = allMembers.length > 0 ? Math.round(allMembers.reduce((s, m) => s + m.healthScore, 0) / allMembers.length) : 0;
          const atRisk = allMembers.filter(m => m.segment === 'at-risk' || m.segment === 'critical').length;
          const ltvTotalCents = allMembers.reduce((s, m) => s + (m.totalRevenue || 0), 0);

          const fmtDelta = (delta: number | null | undefined, label = 'vs last') => {
            if (delta == null) return { text: '—', color: 'var(--t4)' };
            if (delta === 0) return { text: `0 ${label}`, color: 'var(--t4)' };
            const sign = delta > 0 ? '↗ +' : '↘ ';
            const color = delta > 0 ? '#10B981' : '#F59E0B';
            return { text: `${sign}${Math.abs(delta)} ${label}`, color };
          };
          const fmtMoneyDelta = (cents: number | null | undefined) => {
            if (cents == null) return { text: '—', color: 'var(--t4)' };
            if (cents === 0) return { text: '$0 vs last', color: 'var(--t4)' };
            const sign = cents > 0 ? '+' : '−';
            const color = cents > 0 ? '#10B981' : '#F59E0B';
            const dollars = Math.abs(Math.round(cents / 100));
            const text = dollars >= 1000 ? `${sign}$${(dollars / 1000).toFixed(1)}K` : `${sign}$${dollars}`;
            return { text: `${text} vs last`, color };
          };

          const ltvDisplay = ltvTotalCents >= 100_000
            ? `$${(ltvTotalCents / 100_000).toFixed(1)}K`
            : `$${Math.round(ltvTotalCents / 100)}`;

          const kpis = [
            { label: 'Active Members', value: String(active || allMembers.length), icon: Users, gradient: 'from-violet-500 to-purple-600', sub: `of ${allMembers.length} total`, delta: fmtDelta(kpiDeltas?.activeDelta) },
            { label: 'Avg Health', value: String(avgHealth), icon: Heart, gradient: 'from-emerald-500 to-green-500', sub: 'engagement score', delta: fmtDelta(kpiDeltas?.avgHealthDelta, 'pts vs last') },
            { label: 'At-Risk', value: String(atRisk), icon: AlertTriangle, gradient: 'from-orange-500 to-red-500', sub: atRisk > 0 ? 'need attention' : 'all healthy', delta: fmtDelta(kpiDeltas?.atRiskDelta) },
            { label: 'LTV total', value: ltvDisplay, icon: DollarSign, gradient: 'from-amber-500 to-yellow-500', sub: 'cumulative revenue', delta: fmtMoneyDelta(kpiDeltas?.ltvDeltaCents) },
            { label: 'VIP', value: String(vip), icon: Sparkles, gradient: 'from-cyan-500 to-blue-500', sub: `${packages} Package${packages !== 1 ? 's' : ''}`, delta: { text: '', color: 'transparent' } },
          ];

          return (
            <div className="space-y-4">
              {periodButtons}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {kpis.map((kpi) => {
                  const Icon = kpi.icon;
                  return (
                    <div key={kpi.label} className="rounded-2xl p-3" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                      <div className="flex items-center gap-2.5">
                        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${kpi.gradient} flex items-center justify-center shrink-0`}>
                          <Icon className="w-4 h-4 text-white" />
                        </div>
                        <div className="min-w-0">
                          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--heading)', lineHeight: 1 }}>{kpi.value}</div>
                          <div className="text-[10px] mt-0.5" style={{ color: 'var(--t3)' }}>{kpi.label}</div>
                        </div>
                      </div>
                      <div className="text-[10px] mt-2" style={{ color: 'var(--t4)' }}>{kpi.sub}</div>
                      {kpi.delta.text && (
                        <div className="text-[10px] mt-1" style={{ color: kpi.delta.color, fontWeight: 600 }}>
                          {kpi.delta.text}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      />
    </motion.div>
  );
}

// ── P2-T3: Bulk select toolbar ──
// Sticky bar shown when ≥1 member is checked. Provides:
//   - "Add to cohort ▾" — saves selection as new cohort, OR shows existing
//     (existing cohorts disabled with "Coming in P3-T3" tooltip until the
//     cohort builder enriches them with userId-IN merge logic).
//   - "Send campaign" — disabled until P4-T1 (Campaign Wizard).
//   - "Clear selection" — empties the Set.
function BulkSelectToolbar({ clubId, selectedIds, existingCohorts, onClear, isOpen, setOpen, isDark }: {
  clubId: string
  selectedIds: string[]
  existingCohorts: any[]
  onClear: () => void
  isOpen: boolean
  setOpen: (v: boolean) => void
  isDark?: boolean
}) {
  const [savedCohortName, setSavedCohortName] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const utils = trpc.useUtils()

  const showSavedBadge = (name: string) => {
    setSavedCohortName(name)
    setOpen(false)
    setErrorMessage(null)
    // Refresh Your Cohorts list (and sidebar counters) so the new/updated
    // cohort shows up without a manual reload.
    utils.intelligence.listCohorts.invalidate({ clubId }).catch(() => {})
    setTimeout(() => {
      setSavedCohortName(null)
      onClear()
    }, 2500)
  }

  const showError = (msg: string) => {
    setErrorMessage(msg)
    setOpen(false)
    setTimeout(() => setErrorMessage(null), 4500)
  }

  const createMutation = trpc.intelligence.createCohort.useMutation({
    onSuccess: (cohort: any) => showSavedBadge(cohort?.name || 'Cohort'),
    onError: (err: any) => showError(`Couldn't create cohort: ${err?.message || 'unknown error'}`),
  })

  // P2-T8: real "Add to existing" wiring (was disabled with "soon" label).
  // Direct call — `?.useMutation?.()` style breaks `this`-binding through
  // the tRPC react-query proxy (same crash we hit on Members AI Insight).
  const addMembersMutation = (trpc.intelligence as any).addMembersToCohort.useMutation({
    onSuccess: (cohort: any) => showSavedBadge(`${cohort?.name || 'Cohort'} (+${selectedIds.length})`),
    onError: (err: any) => showError(`Couldn't add to cohort: ${err?.message || 'unknown error'}`),
  })

  if (savedCohortName) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl"
        style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', color: '#10B981' }}
      >
        <Check className="w-4 h-4" />
        <span className="text-sm font-semibold">Saved &ldquo;{savedCohortName}&rdquo;</span>
      </motion.div>
    )
  }

  if (errorMessage) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl"
        style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#F87171' }}
      >
        <AlertTriangle className="w-4 h-4" />
        <span className="text-sm">{errorMessage}</span>
      </motion.div>
    )
  }

  const isPending = createMutation.isPending || addMembersMutation?.isPending

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 px-4 py-2.5 rounded-xl flex-wrap"
      style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}
    >
      <span className="text-sm font-semibold" style={{ color: '#A78BFA' }}>
        {selectedIds.length} selected
      </span>

      <div className="relative">
        <button
          onClick={() => setOpen(!isOpen)}
          disabled={isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-[1.02] disabled:opacity-50"
          style={{ background: 'rgba(139,92,246,0.18)', color: '#A78BFA' }}
        >
          <Users className="w-3.5 h-3.5" />
          Add to cohort
          <ChevronRight className="w-3 h-3 rotate-90" />
        </button>

        {isOpen && (
          <>
            {/* Click-outside catcher */}
            <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
            <div
              className="absolute top-full mt-1 left-0 z-30 min-w-[280px] rounded-xl shadow-lg overflow-hidden backdrop-blur-md"
              style={{
                background: isDark ? '#15151F' : '#FFFFFF',
                border: '1px solid var(--card-border)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
              }}
            >
              {/* Create new cohort */}
              <button
                onClick={() => createMutation.mutate({
                  clubId,
                  name: `Selection of ${selectedIds.length} · ${new Date().toLocaleDateString()}`,
                  description: `Members hand-picked from Members list (${selectedIds.length} total)`,
                  filters: [{ field: 'userId', op: 'in' as const, value: selectedIds }],
                })}
                disabled={isPending}
                className="w-full text-left px-3 py-2.5 text-xs flex items-center gap-2 transition-colors disabled:opacity-50"
                style={{ color: 'var(--heading)', borderBottom: '1px solid var(--card-border)' }}
                onMouseEnter={(e: MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }}
                onMouseLeave={(e: MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = 'transparent' }}
              >
                {createMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" style={{ color: '#8B5CF6' }} />}
                <span className="font-semibold">+ Create new cohort from selection</span>
              </button>

              {/* Existing cohorts — clickable, calls addMembersToCohort */}
              <div className="px-3 py-2 text-[10px] uppercase tracking-wider" style={{ color: 'var(--t4)', fontWeight: 600 }}>
                Add to existing
              </div>
              {existingCohorts.length === 0 ? (
                <div className="px-3 pb-3 text-[11px]" style={{ color: 'var(--t4)' }}>
                  No saved cohorts yet.
                </div>
              ) : (
                existingCohorts.slice(0, 8).map((cohort) => (
                  <button
                    key={cohort.id}
                    onClick={() => {
                      addMembersMutation.mutate({
                        clubId,
                        cohortId: cohort.id,
                        userIds: selectedIds,
                      })
                    }}
                    disabled={isPending}
                    className="w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 transition-colors disabled:opacity-50"
                    style={{ color: 'var(--t2)' }}
                    onMouseEnter={(e: MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }}
                    onMouseLeave={(e: MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <span className="truncate">{cohort.name}</span>
                    <span className="shrink-0 text-[10px]" style={{ color: 'var(--t4)' }}>
                      {cohort.memberCount} · +{selectedIds.length}
                    </span>
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </div>

      <button
        disabled
        title="Available in P4-T1 (Campaign Wizard)"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold opacity-50 cursor-not-allowed"
        style={{ background: 'rgba(6,182,212,0.18)', color: '#06B6D4' }}
      >
        <Mail className="w-3.5 h-3.5" />
        Send campaign
      </button>

      <button
        onClick={onClear}
        className="ml-auto text-xs px-2 py-1 rounded-lg transition-colors hover:bg-[var(--hover)]"
        style={{ color: 'var(--t3)' }}
      >
        Clear selection
      </button>
    </motion.div>
  )
}

// ── Save filtered members as Cohort ──
function SaveAsCohortButton({ clubId, memberIds, filterDescription, count }: {
  clubId: string; memberIds: string[]; filterDescription: string; count: number
}) {
  const [saved, setSaved] = useState(false)
  const createMutation = trpc.intelligence.createCohort.useMutation({
    onSuccess: () => setSaved(true),
  })

  if (saved) {
    return (
      <div className="flex items-center gap-2 text-xs px-4 py-2 rounded-xl" style={{ background: 'rgba(16,185,129,0.08)', color: '#10B981' }}>
        <Check className="w-3.5 h-3.5" /> Cohort saved!
      </div>
    )
  }

  return (
    <motion.button
      initial={{ opacity: 0, y: -5 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      onClick={() => createMutation.mutate({
        clubId,
        name: `Members: ${filterDescription}`,
        description: `Auto-created from Members filter: ${filterDescription}`,
        filters: [{ field: 'userId', op: 'in' as const, value: memberIds }],
      })}
      disabled={createMutation.isPending}
      className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs transition-all"
      style={{ background: 'rgba(139,92,246,0.1)', color: '#8B5CF6', fontWeight: 600, border: 'none', cursor: 'pointer' }}
    >
      {createMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />}
      Save as Cohort ({count} members)
    </motion.button>
  )
}
