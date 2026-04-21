'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { useState, useEffect, useMemo } from 'react'
import { useBrand } from '@/components/BrandProvider'
import { SettingsIQ } from '../_components/iq-pages/SettingsIQ'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Settings, Globe, Dumbbell, MapPin, Calendar, Clock, DollarSign,
  Target, Mail, MessageSquare, Volume2, Zap, ArrowRight, Check, Users,
  Loader2, AlertTriangle, Shield, Eye, EyeOff, Plus, Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/use-toast'
import { generateOutreachMessages, type OutreachType } from '@/lib/ai/outreach-messages'
import {
  buildAgentControlPlaneSummary,
  describeAgentControlPlaneMode,
  getAgentControlPlaneAudit,
  resolveAgentControlPlane,
} from '@/lib/ai/agent-control-plane'
import {
  buildAgentOutreachRolloutSummary,
  describeAgentOutreachRolloutAction,
  resolveAgentOutreachRollout,
} from '@/lib/ai/agent-outreach-rollout'
import {
  buildAgentPermissionSummary,
  describeAgentPermissionMinimumRole,
  evaluateAgentPermission,
  formatClubAdminRole,
  resolveAgentPermissions,
} from '@/lib/ai/agent-permissions'
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

type ControlPlaneMode = 'disabled' | 'shadow' | 'live'
type PermissionRole = 'ADMIN' | 'MODERATOR'
type MembershipMappingSource = 'type' | 'status' | 'either'
type MembershipMappingMatchMode = 'contains' | 'equals'
type MembershipMappingRule = NonNullable<IntelligenceSettingsInput['membershipMappings']>['rules'][number]
type GuestTrialOffer = NonNullable<IntelligenceSettingsInput['guestTrialOffers']>['offers'][number]
type GuestTrialOfferKind = GuestTrialOffer['kind']
type GuestTrialOfferAudience = GuestTrialOffer['audience']
type GuestTrialOfferStage = GuestTrialOffer['stage']
type GuestTrialOfferDestinationType = NonNullable<GuestTrialOffer['destinationType']>
type ReferralOffer = NonNullable<IntelligenceSettingsInput['referralOffers']>['offers'][number]
type ReferralOfferKind = ReferralOffer['kind']
type ReferralOfferLane = ReferralOffer['lane']
type ReferralOfferDestinationType = NonNullable<ReferralOffer['destinationType']>
type PermissionActionKey =
  | 'draftManage'
  | 'approveActions'
  | 'outreachSend'
  | 'schedulePublish'
  | 'scheduleLiveEdit'
  | 'scheduleLiveRollback'
  | 'controlPlaneManage'
type ControlPlaneActionKey =
  | 'outreachSend'
  | 'schedulePublish'
  | 'scheduleLiveEdit'
  | 'scheduleLiveRollback'
  | 'adminReminderExternal'
type OutreachRolloutActionKey =
  | 'create_campaign'
  | 'fill_session'
  | 'reactivate_members'
  | 'trial_follow_up'
  | 'renewal_reactivation'
type PermissionSettings = {
  actions: Record<PermissionActionKey, { minimumRole: PermissionRole }>
}
type ControlPlaneSettings = {
  killSwitch: boolean
  actions: Record<ControlPlaneActionKey, { mode: ControlPlaneMode }>
  outreachRollout: {
    actions: Record<OutreachRolloutActionKey, { enabled: boolean }>
  }
  audit?: {
    lastChangedAt?: string
    lastChangedByUserId?: string
    lastChangedByLabel?: string
    summary?: string
    changes?: Array<{
      key: 'killSwitch' | 'outreachRollout' | ControlPlaneActionKey
      label: string
      from: string
      to: string
    }>
  }
}

const CONTROL_PLANE_ACTIONS = [
  {
    key: 'outreachSend',
    label: 'Outreach send',
    description: 'Real member-facing campaigns, slot fills, and lifecycle sends.',
  },
  {
    key: 'schedulePublish',
    label: 'Schedule publish',
    description: 'Create live sessions from internal ops drafts.',
  },
  {
    key: 'scheduleLiveEdit',
    label: 'Live session edit',
    description: 'Edit already published sessions in the live schedule.',
  },
  {
    key: 'scheduleLiveRollback',
    label: 'Live rollback',
    description: 'Restore a published session back to its planned version.',
  },
  {
    key: 'adminReminderExternal',
    label: 'Admin reminders',
    description: 'External admin pings by email or SMS.',
  },
] as const

const MEMBERSHIP_MAPPING_SOURCE_OPTIONS: Array<{ value: MembershipMappingSource; label: string }> = [
  { value: 'type', label: 'Type label' },
  { value: 'status', label: 'Status label' },
  { value: 'either', label: 'Type or status' },
]

const MEMBERSHIP_MAPPING_MATCH_MODE_OPTIONS: Array<{ value: MembershipMappingMatchMode; label: string }> = [
  { value: 'contains', label: 'Contains' },
  { value: 'equals', label: 'Exact match' },
]

const MEMBERSHIP_TYPE_OPTIONS = [
  { value: 'unlimited', label: 'Unlimited / VIP' },
  { value: 'monthly', label: 'Monthly member' },
  { value: 'package', label: 'Package / class pack' },
  { value: 'drop_in', label: 'Drop-in' },
  { value: 'trial', label: 'Trial' },
  { value: 'guest', label: 'Guest' },
  { value: 'discounted', label: 'Discounted' },
  { value: 'insurance', label: 'Insurance / SilverSneakers' },
  { value: 'staff', label: 'Staff / comped' },
] as const

const MEMBERSHIP_STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended / frozen' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'trial', label: 'Trial' },
  { value: 'guest', label: 'Guest / no member' },
  { value: 'none', label: 'No membership' },
] as const

const GUEST_TRIAL_OFFER_KIND_OPTIONS: Array<{ value: GuestTrialOfferKind; label: string }> = [
  { value: 'guest_pass', label: 'Guest pass' },
  { value: 'trial_pass', label: 'Trial pass' },
  { value: 'starter_pack', label: 'Starter pack' },
  { value: 'paid_intro', label: 'Paid intro' },
  { value: 'membership_offer', label: 'Membership offer' },
]

const GUEST_TRIAL_OFFER_AUDIENCE_OPTIONS: Array<{ value: GuestTrialOfferAudience; label: string }> = [
  { value: 'either', label: 'Guest or trial' },
  { value: 'guest', label: 'Guests only' },
  { value: 'trial', label: 'Trials only' },
]

const GUEST_TRIAL_OFFER_STAGE_OPTIONS: Array<{ value: GuestTrialOfferStage; label: string }> = [
  { value: 'book_first_visit', label: 'Book first visit' },
  { value: 'protect_first_show_up', label: 'Protect first show-up' },
  { value: 'convert_to_paid', label: 'Convert to paid' },
  { value: 'any', label: 'Any stage' },
]

const GUEST_TRIAL_OFFER_DESTINATION_OPTIONS: Array<{ value: GuestTrialOfferDestinationType; label: string }> = [
  { value: 'schedule', label: 'Schedule page' },
  { value: 'landing_page', label: 'Offer landing page' },
  { value: 'external_url', label: 'External booking URL' },
  { value: 'manual_follow_up', label: 'Manual follow-up path' },
]

const REFERRAL_OFFER_KIND_OPTIONS: Array<{ value: ReferralOfferKind; label: string }> = [
  { value: 'bring_a_friend', label: 'Bring-a-friend' },
  { value: 'vip_guest_pass', label: 'VIP guest pass' },
  { value: 'trial_invite', label: 'Trial invite' },
  { value: 'reward_credit', label: 'Reward credit' },
  { value: 'guest_pass', label: 'Guest pass' },
]

const REFERRAL_OFFER_LANE_OPTIONS: Array<{ value: ReferralOfferLane; label: string }> = [
  { value: 'vip_advocate', label: 'VIP advocates' },
  { value: 'social_regular', label: 'Social regulars' },
  { value: 'dormant_advocate', label: 'Dormant advocates' },
  { value: 'any', label: 'Any lane' },
]

const REFERRAL_OFFER_DESTINATION_OPTIONS: Array<{ value: ReferralOfferDestinationType; label: string }> = [
  { value: 'schedule', label: 'Schedule page' },
  { value: 'landing_page', label: 'Referral landing page' },
  { value: 'external_url', label: 'External invite URL' },
  { value: 'manual_follow_up', label: 'Manual follow-up path' },
]

const CONTROL_PLANE_MODE_OPTIONS = [
  { value: 'disabled', label: 'Disabled' },
  { value: 'shadow', label: 'Shadow' },
  { value: 'live', label: 'Live' },
] as const

const OUTREACH_ROLLOUT_ACTIONS = [
  {
    key: 'create_campaign',
    label: 'Campaign sends',
    description: 'Agent-drafted campaigns sent to a cohort or selected audience.',
  },
  {
    key: 'fill_session',
    label: 'Slot filler sends',
    description: 'Live outreach to fill an underbooked session.',
  },
  {
    key: 'reactivate_members',
    label: 'Reactivation sends',
    description: 'Live win-back outreach to inactive members.',
  },
  {
    key: 'trial_follow_up',
    label: 'Trial follow-up sends',
    description: 'Live outreach to trial members after their first experience.',
  },
  {
    key: 'renewal_reactivation',
    label: 'Renewal outreach sends',
    description: 'Live renewal recovery and expiration outreach.',
  },
] as const

const DEFAULT_CONTROL_PLANE: ControlPlaneSettings = {
  killSwitch: false,
  actions: {
    outreachSend: { mode: 'shadow' },
    schedulePublish: { mode: 'live' },
    scheduleLiveEdit: { mode: 'live' },
    scheduleLiveRollback: { mode: 'live' },
    adminReminderExternal: { mode: 'live' },
  },
  outreachRollout: {
    actions: {
      create_campaign: { enabled: false },
      fill_session: { enabled: false },
      reactivate_members: { enabled: false },
      trial_follow_up: { enabled: false },
      renewal_reactivation: { enabled: false },
    },
  },
}

const PERMISSION_ACTIONS = [
  {
    key: 'draftManage',
    label: 'Draft work',
    description: 'Create and move advisor drafts, ops drafts, and queue workflow.',
  },
  {
    key: 'approveActions',
    label: 'Approve actions',
    description: 'Approve, snooze, decline, or execute review-only agent actions.',
  },
  {
    key: 'outreachSend',
    label: 'Send outreach',
    description: 'Send or schedule real member-facing outreach.',
  },
  {
    key: 'schedulePublish',
    label: 'Publish schedule',
    description: 'Publish internal ops drafts into the live schedule.',
  },
  {
    key: 'scheduleLiveEdit',
    label: 'Edit live sessions',
    description: 'Change already published live sessions.',
  },
  {
    key: 'scheduleLiveRollback',
    label: 'Rollback live sessions',
    description: 'Restore a live session back to its planned draft version.',
  },
  {
    key: 'controlPlaneManage',
    label: 'Manage rollout',
    description: 'Change control-plane modes and this permission matrix.',
  },
] as const

const PERMISSION_ROLE_OPTIONS = [
  { value: 'MODERATOR', label: 'Moderator' },
  { value: 'ADMIN', label: 'Admin' },
] as const

const DEFAULT_PERMISSIONS: PermissionSettings = {
  actions: {
    draftManage: { minimumRole: 'MODERATOR' },
    approveActions: { minimumRole: 'ADMIN' },
    outreachSend: { minimumRole: 'ADMIN' },
    schedulePublish: { minimumRole: 'ADMIN' },
    scheduleLiveEdit: { minimumRole: 'ADMIN' },
    scheduleLiveRollback: { minimumRole: 'ADMIN' },
    controlPlaneManage: { minimumRole: 'ADMIN' },
  },
}

const DEFAULT_SANDBOX_ROUTING = {
  mode: 'preview_only' as const,
  emailRecipients: [] as string[],
  smsRecipients: [] as string[],
}

const DEFAULT_MEMBERSHIP_MAPPINGS: NonNullable<IntelligenceSettingsInput['membershipMappings']> = {
  rules: [],
}

const DEFAULT_GUEST_TRIAL_OFFERS: NonNullable<IntelligenceSettingsInput['guestTrialOffers']> = {
  offers: [],
}

const DEFAULT_REFERRAL_OFFERS: NonNullable<IntelligenceSettingsInput['referralOffers']> = {
  offers: [],
}

function normalizeMembershipMappings(
  raw?: Partial<NonNullable<IntelligenceSettingsInput['membershipMappings']>> | null,
): NonNullable<IntelligenceSettingsInput['membershipMappings']> {
  return {
    rules: Array.isArray(raw?.rules)
      ? raw.rules
        .map((rule) => ({
          rawLabel: typeof rule?.rawLabel === 'string' ? rule.rawLabel : '',
          source: rule?.source === 'status' || rule?.source === 'either' ? rule.source : 'type',
          matchMode: rule?.matchMode === 'equals' ? 'equals' : 'contains',
          normalizedType: rule?.normalizedType,
          normalizedStatus: rule?.normalizedStatus,
        }))
      : [],
  }
}

function normalizeGuestTrialOffers(
  raw?: Partial<NonNullable<IntelligenceSettingsInput['guestTrialOffers']>> | null,
): NonNullable<IntelligenceSettingsInput['guestTrialOffers']> {
  return {
    offers: Array.isArray(raw?.offers)
      ? raw.offers.map((offer) => {
        const stage = offer?.stage || 'any'
        const defaultDestinationType: GuestTrialOfferDestinationType = stage === 'convert_to_paid'
          ? 'landing_page'
          : stage === 'protect_first_show_up'
            ? 'manual_follow_up'
            : 'schedule'

        return {
          key: typeof offer?.key === 'string' ? offer.key : '',
          name: typeof offer?.name === 'string' ? offer.name : '',
          kind: offer?.kind || 'paid_intro',
          audience: offer?.audience || 'either',
          stage,
          priceLabel: typeof offer?.priceLabel === 'string' ? offer.priceLabel : '',
          durationLabel: typeof offer?.durationLabel === 'string' ? offer.durationLabel : '',
          summary: typeof offer?.summary === 'string' ? offer.summary : '',
          ctaLabel: typeof offer?.ctaLabel === 'string' ? offer.ctaLabel : '',
          destinationType: offer?.destinationType || defaultDestinationType,
          destinationLabel: typeof offer?.destinationLabel === 'string' ? offer.destinationLabel : '',
          destinationUrl: typeof offer?.destinationUrl === 'string' ? offer.destinationUrl : '',
          destinationNotes: typeof offer?.destinationNotes === 'string' ? offer.destinationNotes : '',
          active: offer?.active !== false,
          highlight: offer?.highlight === true,
        }
      })
      : [],
  }
}

function normalizeReferralOffers(
  raw?: Partial<NonNullable<IntelligenceSettingsInput['referralOffers']>> | null,
): NonNullable<IntelligenceSettingsInput['referralOffers']> {
  return {
    offers: Array.isArray(raw?.offers)
      ? raw.offers.map((offer) => {
        const lane = offer?.lane || 'any'
        const defaultDestinationType: ReferralOfferDestinationType = lane === 'dormant_advocate'
          ? 'manual_follow_up'
          : lane === 'vip_advocate'
            ? 'landing_page'
            : 'schedule'

        return {
          key: typeof offer?.key === 'string' ? offer.key : '',
          name: typeof offer?.name === 'string' ? offer.name : '',
          kind: offer?.kind || 'bring_a_friend',
          lane,
          rewardLabel: typeof offer?.rewardLabel === 'string' ? offer.rewardLabel : '',
          summary: typeof offer?.summary === 'string' ? offer.summary : '',
          ctaLabel: typeof offer?.ctaLabel === 'string' ? offer.ctaLabel : '',
          destinationType: offer?.destinationType || defaultDestinationType,
          destinationLabel: typeof offer?.destinationLabel === 'string' ? offer.destinationLabel : '',
          destinationUrl: typeof offer?.destinationUrl === 'string' ? offer.destinationUrl : '',
          destinationNotes: typeof offer?.destinationNotes === 'string' ? offer.destinationNotes : '',
          active: offer?.active !== false,
          highlight: offer?.highlight === true,
        }
      })
      : [],
  }
}

function mergeIntelligenceSettings(
  raw: Partial<IntelligenceSettingsInput> | null | undefined,
): IntelligenceSettingsInput {
  const rawControlActions = raw?.controlPlane?.actions
  const rawOutreachRolloutActions = raw?.controlPlane?.outreachRollout?.actions
  const rawPermissionActions = raw?.permissions?.actions
  const mergedControlPlane: ControlPlaneSettings = {
    killSwitch: raw?.controlPlane?.killSwitch ?? DEFAULT_CONTROL_PLANE.killSwitch,
    actions: {
      outreachSend: {
        mode: rawControlActions?.outreachSend?.mode ?? (raw?.agentLive === true ? 'live' : DEFAULT_CONTROL_PLANE.actions.outreachSend.mode),
      },
      schedulePublish: {
        mode: rawControlActions?.schedulePublish?.mode ?? DEFAULT_CONTROL_PLANE.actions.schedulePublish.mode,
      },
      scheduleLiveEdit: {
        mode: rawControlActions?.scheduleLiveEdit?.mode ?? DEFAULT_CONTROL_PLANE.actions.scheduleLiveEdit.mode,
      },
      scheduleLiveRollback: {
        mode: rawControlActions?.scheduleLiveRollback?.mode ?? DEFAULT_CONTROL_PLANE.actions.scheduleLiveRollback.mode,
      },
      adminReminderExternal: {
        mode: rawControlActions?.adminReminderExternal?.mode ?? DEFAULT_CONTROL_PLANE.actions.adminReminderExternal.mode,
      },
    },
    outreachRollout: {
      actions: {
        create_campaign: {
          enabled: rawOutreachRolloutActions?.create_campaign?.enabled ?? DEFAULT_CONTROL_PLANE.outreachRollout.actions.create_campaign.enabled,
        },
        fill_session: {
          enabled: rawOutreachRolloutActions?.fill_session?.enabled ?? DEFAULT_CONTROL_PLANE.outreachRollout.actions.fill_session.enabled,
        },
        reactivate_members: {
          enabled: rawOutreachRolloutActions?.reactivate_members?.enabled ?? DEFAULT_CONTROL_PLANE.outreachRollout.actions.reactivate_members.enabled,
        },
        trial_follow_up: {
          enabled: rawOutreachRolloutActions?.trial_follow_up?.enabled ?? DEFAULT_CONTROL_PLANE.outreachRollout.actions.trial_follow_up.enabled,
        },
        renewal_reactivation: {
          enabled: rawOutreachRolloutActions?.renewal_reactivation?.enabled ?? DEFAULT_CONTROL_PLANE.outreachRollout.actions.renewal_reactivation.enabled,
        },
      },
    },
    audit: raw?.controlPlane?.audit,
  }
  const mergedPermissions: PermissionSettings = {
    actions: {
      draftManage: {
        minimumRole: rawPermissionActions?.draftManage?.minimumRole ?? DEFAULT_PERMISSIONS.actions.draftManage.minimumRole,
      },
      approveActions: {
        minimumRole: rawPermissionActions?.approveActions?.minimumRole ?? DEFAULT_PERMISSIONS.actions.approveActions.minimumRole,
      },
      outreachSend: {
        minimumRole: rawPermissionActions?.outreachSend?.minimumRole ?? DEFAULT_PERMISSIONS.actions.outreachSend.minimumRole,
      },
      schedulePublish: {
        minimumRole: rawPermissionActions?.schedulePublish?.minimumRole ?? DEFAULT_PERMISSIONS.actions.schedulePublish.minimumRole,
      },
      scheduleLiveEdit: {
        minimumRole: rawPermissionActions?.scheduleLiveEdit?.minimumRole ?? DEFAULT_PERMISSIONS.actions.scheduleLiveEdit.minimumRole,
      },
      scheduleLiveRollback: {
        minimumRole: rawPermissionActions?.scheduleLiveRollback?.minimumRole ?? DEFAULT_PERMISSIONS.actions.scheduleLiveRollback.minimumRole,
      },
      controlPlaneManage: {
        minimumRole: rawPermissionActions?.controlPlaneManage?.minimumRole ?? DEFAULT_PERMISSIONS.actions.controlPlaneManage.minimumRole,
      },
    },
  }

  return {
    ...DEFAULT_INTELLIGENCE_SETTINGS,
    ...(raw || {}),
    operatingHours: {
      ...DEFAULT_INTELLIGENCE_SETTINGS.operatingHours,
      ...(raw?.operatingHours || {}),
    },
    peakHours: {
      ...DEFAULT_INTELLIGENCE_SETTINGS.peakHours,
      ...(raw?.peakHours || {}),
    },
    communicationPreferences: {
      ...DEFAULT_INTELLIGENCE_SETTINGS.communicationPreferences,
      ...(raw?.communicationPreferences || {}),
    },
    sandboxRouting: {
      ...DEFAULT_SANDBOX_ROUTING,
      ...(raw?.sandboxRouting || {}),
      mode: raw?.sandboxRouting?.mode ?? DEFAULT_SANDBOX_ROUTING.mode,
      emailRecipients: raw?.sandboxRouting?.emailRecipients ?? DEFAULT_SANDBOX_ROUTING.emailRecipients,
      smsRecipients: raw?.sandboxRouting?.smsRecipients ?? DEFAULT_SANDBOX_ROUTING.smsRecipients,
    },
    membershipMappings: normalizeMembershipMappings(raw?.membershipMappings),
    guestTrialOffers: normalizeGuestTrialOffers(raw?.guestTrialOffers),
    referralOffers: normalizeReferralOffers(raw?.referralOffers),
    permissions: mergedPermissions,
    controlPlane: mergedControlPlane,
  }
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

function PiqleSettingsPage() {
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
      setSettings(mergeIntelligenceSettings(intelligenceData.settings as IntelligenceSettingsInput))
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

  const updateControlPlane = (
    patch: Partial<ControlPlaneSettings>,
  ) => {
    setSettings((prev) => {
      const nextActions: ControlPlaneSettings['actions'] = {
        outreachSend: {
          mode: patch.actions?.outreachSend?.mode
            ?? prev.controlPlane?.actions?.outreachSend?.mode
            ?? DEFAULT_CONTROL_PLANE.actions.outreachSend.mode,
        },
        schedulePublish: {
          mode: patch.actions?.schedulePublish?.mode
            ?? prev.controlPlane?.actions?.schedulePublish?.mode
            ?? DEFAULT_CONTROL_PLANE.actions.schedulePublish.mode,
        },
        scheduleLiveEdit: {
          mode: patch.actions?.scheduleLiveEdit?.mode
            ?? prev.controlPlane?.actions?.scheduleLiveEdit?.mode
            ?? DEFAULT_CONTROL_PLANE.actions.scheduleLiveEdit.mode,
        },
        scheduleLiveRollback: {
          mode: patch.actions?.scheduleLiveRollback?.mode
            ?? prev.controlPlane?.actions?.scheduleLiveRollback?.mode
            ?? DEFAULT_CONTROL_PLANE.actions.scheduleLiveRollback.mode,
        },
        adminReminderExternal: {
          mode: patch.actions?.adminReminderExternal?.mode
            ?? prev.controlPlane?.actions?.adminReminderExternal?.mode
            ?? DEFAULT_CONTROL_PLANE.actions.adminReminderExternal.mode,
        },
      }
      const nextOutreachRolloutActions: ControlPlaneSettings['outreachRollout']['actions'] = {
        create_campaign: {
          enabled: patch.outreachRollout?.actions?.create_campaign?.enabled
            ?? prev.controlPlane?.outreachRollout?.actions?.create_campaign?.enabled
            ?? DEFAULT_CONTROL_PLANE.outreachRollout.actions.create_campaign.enabled,
        },
        fill_session: {
          enabled: patch.outreachRollout?.actions?.fill_session?.enabled
            ?? prev.controlPlane?.outreachRollout?.actions?.fill_session?.enabled
            ?? DEFAULT_CONTROL_PLANE.outreachRollout.actions.fill_session.enabled,
        },
        reactivate_members: {
          enabled: patch.outreachRollout?.actions?.reactivate_members?.enabled
            ?? prev.controlPlane?.outreachRollout?.actions?.reactivate_members?.enabled
            ?? DEFAULT_CONTROL_PLANE.outreachRollout.actions.reactivate_members.enabled,
        },
        trial_follow_up: {
          enabled: patch.outreachRollout?.actions?.trial_follow_up?.enabled
            ?? prev.controlPlane?.outreachRollout?.actions?.trial_follow_up?.enabled
            ?? DEFAULT_CONTROL_PLANE.outreachRollout.actions.trial_follow_up.enabled,
        },
        renewal_reactivation: {
          enabled: patch.outreachRollout?.actions?.renewal_reactivation?.enabled
            ?? prev.controlPlane?.outreachRollout?.actions?.renewal_reactivation?.enabled
            ?? DEFAULT_CONTROL_PLANE.outreachRollout.actions.renewal_reactivation.enabled,
        },
      }
      const next = {
        ...prev,
        controlPlane: {
          killSwitch: patch.killSwitch ?? prev.controlPlane?.killSwitch ?? DEFAULT_CONTROL_PLANE.killSwitch,
          actions: nextActions,
          outreachRollout: {
            actions: nextOutreachRolloutActions,
          },
          audit: prev.controlPlane?.audit,
        },
      }
      return {
        ...next,
        agentLive: next.controlPlane.actions.outreachSend.mode === 'live',
      }
    })
    setHasChanges(true)
    setSaved(false)
  }

  const updateControlPlaneActionMode = (
    actionKey: ControlPlaneActionKey,
    mode: ControlPlaneMode,
  ) => {
    updateControlPlane({
      actions: {
        ...DEFAULT_CONTROL_PLANE.actions,
        ...(settings.controlPlane?.actions || {}),
        [actionKey]: { mode },
      } as ControlPlaneSettings['actions'],
    })
  }

  const updateOutreachRolloutAction = (
    actionKey: OutreachRolloutActionKey,
    enabled: boolean,
  ) => {
    updateControlPlane({
      outreachRollout: {
        actions: {
          create_campaign: {
            enabled: actionKey === 'create_campaign'
              ? enabled
              : settings.controlPlane?.outreachRollout?.actions?.create_campaign?.enabled ?? DEFAULT_CONTROL_PLANE.outreachRollout.actions.create_campaign.enabled,
          },
          fill_session: {
            enabled: actionKey === 'fill_session'
              ? enabled
              : settings.controlPlane?.outreachRollout?.actions?.fill_session?.enabled ?? DEFAULT_CONTROL_PLANE.outreachRollout.actions.fill_session.enabled,
          },
          reactivate_members: {
            enabled: actionKey === 'reactivate_members'
              ? enabled
              : settings.controlPlane?.outreachRollout?.actions?.reactivate_members?.enabled ?? DEFAULT_CONTROL_PLANE.outreachRollout.actions.reactivate_members.enabled,
          },
          trial_follow_up: {
            enabled: actionKey === 'trial_follow_up'
              ? enabled
              : settings.controlPlane?.outreachRollout?.actions?.trial_follow_up?.enabled ?? DEFAULT_CONTROL_PLANE.outreachRollout.actions.trial_follow_up.enabled,
          },
          renewal_reactivation: {
            enabled: actionKey === 'renewal_reactivation'
              ? enabled
              : settings.controlPlane?.outreachRollout?.actions?.renewal_reactivation?.enabled ?? DEFAULT_CONTROL_PLANE.outreachRollout.actions.renewal_reactivation.enabled,
          },
        },
      },
    })
  }

  const updateTrigger = (key: keyof AutomationTriggersInput['triggers'], value: boolean) => {
    setAutomation(prev => ({
      ...prev,
      triggers: { ...prev.triggers, [key]: value },
    }))
    setHasChanges(true)
    setSaved(false)
  }

  const updatePermissionMinimumRole = (
    actionKey: PermissionActionKey,
    minimumRole: PermissionRole,
  ) => {
    setSettings((prev) => ({
      ...prev,
      permissions: {
        actions: {
          ...DEFAULT_PERMISSIONS.actions,
          ...(prev.permissions?.actions || {}),
          [actionKey]: { minimumRole },
        } as PermissionSettings['actions'],
      },
    }))
    setHasChanges(true)
    setSaved(false)
  }

  const updateMembershipMappings = (rules: MembershipMappingRule[]) => {
    setSettings((prev) => ({
      ...prev,
      membershipMappings: {
        rules,
      },
    }))
    setHasChanges(true)
    setSaved(false)
  }

  const updateGuestTrialOffers = (offers: GuestTrialOffer[]) => {
    setSettings((prev) => ({
      ...prev,
      guestTrialOffers: {
        offers,
      },
    }))
    setHasChanges(true)
    setSaved(false)
  }

  const updateReferralOffers = (offers: ReferralOffer[]) => {
    setSettings((prev) => ({
      ...prev,
      referralOffers: {
        offers,
      },
    }))
    setHasChanges(true)
    setSaved(false)
  }

  const addMembershipMappingRule = () => {
    updateMembershipMappings([
      ...(settings.membershipMappings?.rules || []),
      {
        rawLabel: '',
        source: 'type',
        matchMode: 'contains',
        normalizedType: 'monthly',
      },
    ])
  }

  const updateMembershipMappingRule = (
    index: number,
    patch: Partial<MembershipMappingRule>,
  ) => {
    const nextRules = [...(settings.membershipMappings?.rules || [])]
    const current = nextRules[index]
    if (!current) return
    nextRules[index] = {
      ...current,
      ...patch,
    }
    updateMembershipMappings(nextRules)
  }

  const removeMembershipMappingRule = (index: number) => {
    updateMembershipMappings(
      (settings.membershipMappings?.rules || []).filter((_, ruleIndex) => ruleIndex !== index),
    )
  }

  const addGuestTrialOffer = () => {
    updateGuestTrialOffers([
      ...(settings.guestTrialOffers?.offers || []),
      {
        key: `offer_${(settings.guestTrialOffers?.offers || []).length + 1}`,
        name: '',
        kind: 'paid_intro',
        audience: 'either',
        stage: 'convert_to_paid',
        priceLabel: '',
        durationLabel: '',
        summary: '',
        ctaLabel: '',
        destinationType: 'landing_page',
        destinationLabel: '',
        destinationUrl: '',
        destinationNotes: '',
        active: true,
        highlight: false,
      },
    ])
  }

  const updateGuestTrialOffer = (
    index: number,
    patch: Partial<GuestTrialOffer>,
  ) => {
    const nextOffers = [...(settings.guestTrialOffers?.offers || [])]
    const current = nextOffers[index]
    if (!current) return
    nextOffers[index] = {
      ...current,
      ...patch,
    }
    updateGuestTrialOffers(nextOffers)
  }

  const removeGuestTrialOffer = (index: number) => {
    updateGuestTrialOffers(
      (settings.guestTrialOffers?.offers || []).filter((_, offerIndex) => offerIndex !== index),
    )
  }

  const addReferralOffer = () => {
    updateReferralOffers([
      ...(settings.referralOffers?.offers || []),
      {
        key: `referral_offer_${(settings.referralOffers?.offers || []).length + 1}`,
        name: '',
        kind: 'bring_a_friend',
        lane: 'social_regular',
        rewardLabel: '',
        summary: '',
        ctaLabel: '',
        destinationType: 'schedule',
        destinationLabel: '',
        destinationUrl: '',
        destinationNotes: '',
        active: true,
        highlight: false,
      },
    ])
  }

  const updateReferralOffer = (
    index: number,
    patch: Partial<ReferralOffer>,
  ) => {
    const nextOffers = [...(settings.referralOffers?.offers || [])]
    const current = nextOffers[index]
    if (!current) return
    nextOffers[index] = {
      ...current,
      ...patch,
    }
    updateReferralOffers(nextOffers)
  }

  const removeReferralOffer = (index: number) => {
    updateReferralOffers(
      (settings.referralOffers?.offers || []).filter((_, offerIndex) => offerIndex !== index),
    )
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
      const sanitizedMembershipMappings = {
        rules: (settings.membershipMappings?.rules || [])
          .map((rule) => ({
            rawLabel: rule.rawLabel.trim(),
            source: rule.source,
            matchMode: rule.matchMode,
            normalizedType: rule.normalizedType,
            normalizedStatus: rule.normalizedStatus,
          }))
          .filter((rule) => rule.rawLabel.length > 0 && (rule.normalizedType || rule.normalizedStatus)),
      }
      const sanitizedGuestTrialOffers = {
        offers: (settings.guestTrialOffers?.offers || [])
          .map((offer) => ({
            key: offer.key.trim(),
            name: offer.name.trim(),
            kind: offer.kind,
            audience: offer.audience,
            stage: offer.stage,
            priceLabel: offer.priceLabel?.trim() || undefined,
            durationLabel: offer.durationLabel?.trim() || undefined,
            summary: offer.summary?.trim() || undefined,
            ctaLabel: offer.ctaLabel?.trim() || undefined,
            destinationType: offer.destinationType || undefined,
            destinationLabel: offer.destinationLabel?.trim() || undefined,
            destinationUrl: offer.destinationUrl?.trim() || undefined,
            destinationNotes: offer.destinationNotes?.trim() || undefined,
            active: offer.active !== false,
            highlight: offer.highlight === true,
          }))
          .filter((offer) => offer.key.length > 0 && offer.name.length > 0),
      }
      const sanitizedReferralOffers = {
        offers: (settings.referralOffers?.offers || [])
          .map((offer) => ({
            key: offer.key.trim(),
            name: offer.name.trim(),
            kind: offer.kind,
            lane: offer.lane,
            rewardLabel: offer.rewardLabel?.trim() || undefined,
            summary: offer.summary?.trim() || undefined,
            ctaLabel: offer.ctaLabel?.trim() || undefined,
            destinationType: offer.destinationType || undefined,
            destinationLabel: offer.destinationLabel?.trim() || undefined,
            destinationUrl: offer.destinationUrl?.trim() || undefined,
            destinationNotes: offer.destinationNotes?.trim() || undefined,
            active: offer.active !== false,
            highlight: offer.highlight === true,
          }))
          .filter((offer) => offer.key.length > 0 && offer.name.length > 0),
      }
      const [saveResult] = await Promise.all([
        saveMutation.mutateAsync({
          clubId,
          settings: {
            ...settings,
            membershipMappings: sanitizedMembershipMappings,
            guestTrialOffers: sanitizedGuestTrialOffers,
            referralOffers: sanitizedReferralOffers,
            agentLive: settings.controlPlane?.actions?.outreachSend?.mode === 'live',
          } as any,
        }),
        saveAutoMutation.mutateAsync({ clubId, settings: automation }),
      ])
      if (saveResult?.settings) {
        setSettings(mergeIntelligenceSettings(saveResult.settings as IntelligenceSettingsInput))
      }
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
  const resolvedControlPlane = useMemo(
    () => resolveAgentControlPlane({ intelligence: settings }),
    [settings],
  )
  const controlPlaneSummary = useMemo(
    () => buildAgentControlPlaneSummary(resolvedControlPlane),
    [resolvedControlPlane],
  )
  const controlPlaneAudit = useMemo(
    () => getAgentControlPlaneAudit({ intelligence: settings }),
    [settings],
  )
  const resolvedOutreachRollout = useMemo(
    () => resolveAgentOutreachRollout({ intelligence: settings }),
    [settings],
  )
  const outreachRolloutSummary = useMemo(() => {
    return buildAgentOutreachRolloutSummary({
      envAllowlistConfigured: !!(intelligenceData as any)?.outreachRolloutStatus?.envAllowlistConfigured,
      clubAllowlisted: !!(intelligenceData as any)?.outreachRolloutStatus?.clubAllowlisted,
      clubBypassEnabled: !!(intelligenceData as any)?.outreachRolloutStatus?.clubBypassEnabled,
      allowlistedClubIds: (intelligenceData as any)?.outreachRolloutStatus?.allowlistedClubIds || [],
      enabledActionKinds: Object.entries(resolvedOutreachRollout.actions)
        .filter(([, action]) => action.enabled)
        .map(([actionKind]) => actionKind as OutreachRolloutActionKey),
      actions: resolvedOutreachRollout.actions,
      summary: '',
    })
  }, [intelligenceData, resolvedOutreachRollout])
  const resolvedPermissions = useMemo(
    () => resolveAgentPermissions({ intelligence: settings }),
    [settings],
  )
  const permissionSummary = useMemo(
    () => buildAgentPermissionSummary(resolvedPermissions),
    [resolvedPermissions],
  )
  const currentClubRole = (intelligenceData as any)?.clubRole as PermissionRole | null | undefined
  const controlPlaneManagePermission = useMemo(
    () =>
      currentClubRole
        ? evaluateAgentPermission({
            automationSettings: { intelligence: settings },
            action: 'controlPlaneManage',
            clubAdminRole: currentClubRole,
          })
        : null,
    [currentClubRole, settings],
  )

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

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Membership Mapping</CardTitle>
          </div>
          <CardDescription>
            Keep each club&apos;s raw membership names, but teach the agent how to interpret them as guests, VIP/unlimited, packages, monthly plans, and lifecycle statuses.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
            Rules are case-insensitive. Use <strong>contains</strong> for labels like <code>Open Play Pass - $49.99/Month</code>, or <strong>exact match</strong> when the connector sends a clean fixed label.
          </div>

          <div className="space-y-3">
            {(settings.membershipMappings?.rules || []).map((rule, index) => (
              <div key={`${index}-${rule.rawLabel}`} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Rule {index + 1}</p>
                    <p className="text-xs text-muted-foreground">
                      Map a club-specific membership label into the agent&apos;s internal understanding.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeMembershipMappingRule(index)}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Remove
                  </Button>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Raw label</Label>
                    <Input
                      value={rule.rawLabel}
                      placeholder="e.g. VIP Gold, Open Play Pass, No Membership"
                      onChange={(event) => updateMembershipMappingRule(index, { rawLabel: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Where to match</Label>
                    <select
                      value={rule.source}
                      onChange={(event) => updateMembershipMappingRule(index, { source: event.target.value as MembershipMappingSource })}
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    >
                      {MEMBERSHIP_MAPPING_SOURCE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Match mode</Label>
                    <select
                      value={rule.matchMode}
                      onChange={(event) => updateMembershipMappingRule(index, { matchMode: event.target.value as MembershipMappingMatchMode })}
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    >
                      {MEMBERSHIP_MAPPING_MATCH_MODE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Canonical type</Label>
                    <select
                      value={rule.normalizedType || ''}
                      onChange={(event) => updateMembershipMappingRule(index, {
                        normalizedType: event.target.value ? event.target.value as MembershipMappingRule['normalizedType'] : undefined,
                      })}
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    >
                      <option value="">No type override</option>
                      {MEMBERSHIP_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Canonical status</Label>
                    <select
                      value={rule.normalizedStatus || ''}
                      onChange={(event) => updateMembershipMappingRule(index, {
                        normalizedStatus: event.target.value ? event.target.value as MembershipMappingRule['normalizedStatus'] : undefined,
                      })}
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    >
                      <option value="">No status override</option>
                      {MEMBERSHIP_STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <Button type="button" variant="outline" onClick={addMembershipMappingRule}>
            <Plus className="h-4 w-4 mr-2" />
            Add membership rule
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Guest / Trial Offers</CardTitle>
          </div>
          <CardDescription>
            Give the agent concrete entry and conversion offers to use for guests and trials instead of generic “best next paid step” language.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
            These offers stay club-specific. The agent uses them in guest/trial booking, first-show protection, and paid conversion prompts.
          </div>

          <div className="space-y-3">
            {(settings.guestTrialOffers?.offers || []).map((offer, index) => (
              <div key={`${index}-${offer.key || offer.name}`} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Offer {index + 1}</p>
                    <p className="text-xs text-muted-foreground">
                      A concrete guest, trial, or first-paid offer that the agent can reference directly.
                    </p>
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeGuestTrialOffer(index)}>
                    <Trash2 className="h-4 w-4 mr-1" />
                    Remove
                  </Button>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Offer key</Label>
                    <Input
                      value={offer.key}
                      placeholder="e.g. starter_pack"
                      onChange={(event) => updateGuestTrialOffer(index, { key: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Offer name</Label>
                    <Input
                      value={offer.name}
                      placeholder="e.g. Starter Pack, Guest Pass, Intro Membership"
                      onChange={(event) => updateGuestTrialOffer(index, { name: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Offer kind</Label>
                    <select
                      value={offer.kind}
                      onChange={(event) => updateGuestTrialOffer(index, { kind: event.target.value as GuestTrialOfferKind })}
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    >
                      {GUEST_TRIAL_OFFER_KIND_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Audience</Label>
                    <select
                      value={offer.audience}
                      onChange={(event) => updateGuestTrialOffer(index, { audience: event.target.value as GuestTrialOfferAudience })}
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    >
                      {GUEST_TRIAL_OFFER_AUDIENCE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Funnel stage</Label>
                    <select
                      value={offer.stage}
                      onChange={(event) => updateGuestTrialOffer(index, { stage: event.target.value as GuestTrialOfferStage })}
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    >
                      {GUEST_TRIAL_OFFER_STAGE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Price label</Label>
                    <Input
                      value={offer.priceLabel || ''}
                      placeholder="e.g. $29 intro, $49/month"
                      onChange={(event) => updateGuestTrialOffer(index, { priceLabel: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Duration / credits</Label>
                    <Input
                      value={offer.durationLabel || ''}
                      placeholder="e.g. 14 days, 3 visits"
                      onChange={(event) => updateGuestTrialOffer(index, { durationLabel: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>CTA label</Label>
                    <Input
                      value={offer.ctaLabel || ''}
                      placeholder="e.g. Start your trial"
                      onChange={(event) => updateGuestTrialOffer(index, { ctaLabel: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Destination type</Label>
                    <select
                      value={offer.destinationType || 'schedule'}
                      onChange={(event) => updateGuestTrialOffer(index, {
                        destinationType: event.target.value as GuestTrialOfferDestinationType,
                      })}
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    >
                      {GUEST_TRIAL_OFFER_DESTINATION_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Destination label</Label>
                    <Input
                      value={offer.destinationLabel || ''}
                      placeholder="e.g. Beginner booking page, Trial checkout"
                      onChange={(event) => updateGuestTrialOffer(index, { destinationLabel: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Destination URL</Label>
                    <Input
                      value={offer.destinationUrl || ''}
                      placeholder="e.g. https://... or /trial-booking"
                      onChange={(event) => updateGuestTrialOffer(index, { destinationUrl: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Destination notes</Label>
                    <Input
                      value={offer.destinationNotes || ''}
                      placeholder="e.g. Use the beginner-friendly schedule first, then fall back to staff follow-up"
                      onChange={(event) => updateGuestTrialOffer(index, { destinationNotes: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Offer summary</Label>
                    <Input
                      value={offer.summary || ''}
                      placeholder="e.g. Best low-friction paid next step after the first visit"
                      onChange={(event) => updateGuestTrialOffer(index, { summary: event.target.value })}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-6 pt-1">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={offer.active !== false}
                      onChange={(event) => updateGuestTrialOffer(index, { active: event.target.checked })}
                    />
                    Active
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={offer.highlight === true}
                      onChange={(event) => updateGuestTrialOffer(index, { highlight: event.target.checked })}
                    />
                    Highlight as preferred
                  </label>
                </div>
              </div>
            ))}
          </div>

          <Button type="button" variant="outline" onClick={addGuestTrialOffer}>
            <Plus className="h-4 w-4 mr-2" />
            Add guest / trial offer
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Referral Offers</CardTitle>
          </div>
          <CardDescription>
            Give the agent concrete bring-a-friend and advocate offers, plus the exact destination path to route referred guests into.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
            These offers stay club-specific. The agent uses them across VIP advocates, social regulars, and dormant advocate restart flows.
          </div>

          <div className="space-y-3">
            {(settings.referralOffers?.offers || []).map((offer, index) => (
              <div key={`${index}-${offer.key || offer.name}`} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Referral offer {index + 1}</p>
                    <p className="text-xs text-muted-foreground">
                      A concrete advocate offer and invite route the agent can reference directly.
                    </p>
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeReferralOffer(index)}>
                    <Trash2 className="h-4 w-4 mr-1" />
                    Remove
                  </Button>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Offer key</Label>
                    <Input
                      value={offer.key}
                      placeholder="e.g. bring_a_friend"
                      onChange={(event) => updateReferralOffer(index, { key: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Offer name</Label>
                    <Input
                      value={offer.name}
                      placeholder="e.g. Bring-a-Friend Pass, VIP Guest Invite"
                      onChange={(event) => updateReferralOffer(index, { name: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Offer kind</Label>
                    <select
                      value={offer.kind}
                      onChange={(event) => updateReferralOffer(index, { kind: event.target.value as ReferralOfferKind })}
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    >
                      {REFERRAL_OFFER_KIND_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Referral lane</Label>
                    <select
                      value={offer.lane}
                      onChange={(event) => updateReferralOffer(index, { lane: event.target.value as ReferralOfferLane })}
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    >
                      {REFERRAL_OFFER_LANE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Reward / perk label</Label>
                    <Input
                      value={offer.rewardLabel || ''}
                      placeholder="e.g. Bring one guest free, $20 credit"
                      onChange={(event) => updateReferralOffer(index, { rewardLabel: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>CTA label</Label>
                    <Input
                      value={offer.ctaLabel || ''}
                      placeholder="e.g. Invite a friend"
                      onChange={(event) => updateReferralOffer(index, { ctaLabel: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Destination type</Label>
                    <select
                      value={offer.destinationType || 'schedule'}
                      onChange={(event) => updateReferralOffer(index, {
                        destinationType: event.target.value as ReferralOfferDestinationType,
                      })}
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    >
                      {REFERRAL_OFFER_DESTINATION_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Destination label</Label>
                    <Input
                      value={offer.destinationLabel || ''}
                      placeholder="e.g. Bring-a-friend booking page, VIP referral page"
                      onChange={(event) => updateReferralOffer(index, { destinationLabel: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Destination URL</Label>
                    <Input
                      value={offer.destinationUrl || ''}
                      placeholder="e.g. https://... or /bring-a-friend"
                      onChange={(event) => updateReferralOffer(index, { destinationUrl: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Destination notes</Label>
                    <Input
                      value={offer.destinationNotes || ''}
                      placeholder="e.g. Route referred guests into the easiest beginner-friendly invite path"
                      onChange={(event) => updateReferralOffer(index, { destinationNotes: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Offer summary</Label>
                    <Input
                      value={offer.summary || ''}
                      placeholder="e.g. Premium low-friction referral ask for members with strong social trust"
                      onChange={(event) => updateReferralOffer(index, { summary: event.target.value })}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-6 pt-1">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={offer.active !== false}
                      onChange={(event) => updateReferralOffer(index, { active: event.target.checked })}
                    />
                    Active
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={offer.highlight === true}
                      onChange={(event) => updateReferralOffer(index, { highlight: event.target.checked })}
                    />
                    Highlight
                  </label>
                </div>
              </div>
            ))}
          </div>

          <Button type="button" variant="outline" onClick={addReferralOffer}>
            <Plus className="h-4 w-4 mr-2" />
            Add referral offer
          </Button>
        </CardContent>
      </Card>

      {/* ══════ SECTION: CONTROL PLANE ══════ */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Agent Control Plane</CardTitle>
          </div>
          <CardDescription>
            Roll out risky live actions gradually. Use shadow mode to let the agent review work without causing the real side effect.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-lg border bg-muted/20 p-4 space-y-2">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Current posture</p>
              <p className="text-sm font-medium mt-1">{controlPlaneSummary}</p>
            </div>
            {currentClubRole ? (
              <p className="text-xs text-muted-foreground">
                Your club role: <strong>{formatClubAdminRole(currentClubRole)}</strong>
              </p>
            ) : null}
            {controlPlaneAudit ? (
              <div className="text-xs text-muted-foreground space-y-1">
                <p>
                  Last changed by <strong>{controlPlaneAudit.lastChangedByLabel || 'Club admin'}</strong>
                  {controlPlaneAudit.lastChangedAt
                    ? ` on ${new Date(controlPlaneAudit.lastChangedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
                    : ''}
                </p>
                {controlPlaneAudit.summary ? (
                  <p>{controlPlaneAudit.summary}</p>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No rollout changes recorded yet. Once someone arms, shadows, or disables an action, the latest change will show up here.
              </p>
            )}
            {controlPlaneManagePermission && !controlPlaneManagePermission.allowed ? (
              <p className="text-xs text-red-600">
                {controlPlaneManagePermission.reason}
              </p>
            ) : null}
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
            <div className="flex items-start gap-3">
              <div className={cn(
                'h-8 w-8 rounded-lg flex items-center justify-center mt-0.5',
                settings.controlPlane?.killSwitch ? 'bg-red-100' : 'bg-muted'
              )}>
                <AlertTriangle className={cn(
                  'h-4 w-4',
                  settings.controlPlane?.killSwitch ? 'text-red-600' : 'text-muted-foreground'
                )} />
              </div>
              <div>
                <p className="font-medium text-sm">Kill switch</p>
                <p className="text-xs text-muted-foreground">
                  Instantly block every controlled live side effect for this club.
                </p>
              </div>
            </div>
            <Switch
              checked={settings.controlPlane?.killSwitch === true}
              onCheckedChange={(checked: boolean) => updateControlPlane({ killSwitch: checked })}
            />
          </div>

          <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
            Outreach defaults to <strong>shadow</strong> until you explicitly arm it. Schedule publish, edit, rollback, and admin reminders can each be managed separately.
          </div>

          <div className="rounded-lg border p-4 space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">Outreach live rollout</p>
              <p className="text-xs text-muted-foreground">
                Live outreach now requires both a server-side club allowlist and the specific outreach action type to be armed here.
              </p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Current rollout posture</p>
              <p className="text-sm font-medium">{outreachRolloutSummary}</p>
              <p className="text-xs text-muted-foreground">
                {(intelligenceData as any)?.outreachRolloutStatus?.envAllowlistConfigured
                  ? ((intelligenceData as any)?.outreachRolloutStatus?.clubAllowlisted
                    ? 'This club is allowlisted in the server rollout env.'
                    : 'This club is still outside the server rollout allowlist, so outreach stays shadow-only even if you arm an action below.')
                  : 'No rollout clubs are configured in the server env yet, so outreach stays shadow-only until that allowlist is set.'}
              </p>
            </div>
            <div className="space-y-3">
              {OUTREACH_ROLLOUT_ACTIONS.map((action) => {
                const currentEnabled = settings.controlPlane?.outreachRollout?.actions?.[action.key]?.enabled ?? false
                const resolvedAction = resolvedOutreachRollout.actions[action.key]
                return (
                  <div key={action.key} className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{action.label}</p>
                        <p className="text-xs text-muted-foreground">{action.description}</p>
                      </div>
                      <span className={cn(
                        'rounded-full px-2.5 py-1 text-[11px] font-medium',
                        currentEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700',
                      )}>
                        {currentEnabled ? 'armed' : 'shadow-only'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <RadioOption
                        value="shadow_only"
                        label="Shadow only"
                        selected={!currentEnabled}
                        onSelect={() => updateOutreachRolloutAction(action.key, false)}
                      />
                      <RadioOption
                        value="armed"
                        label="Armed"
                        selected={currentEnabled}
                        onSelect={() => updateOutreachRolloutAction(action.key, true)}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {describeAgentOutreachRolloutAction(resolvedAction)}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="space-y-3">
            {CONTROL_PLANE_ACTIONS.map((action) => {
              const currentMode = settings.controlPlane?.actions?.[action.key]?.mode || 'shadow'
              return (
                <div key={action.key} className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{action.label}</p>
                      <p className="text-xs text-muted-foreground">{action.description}</p>
                    </div>
                    <span className={cn(
                      'rounded-full px-2.5 py-1 text-[11px] font-medium',
                      currentMode === 'live'
                        ? 'bg-emerald-100 text-emerald-700'
                        : currentMode === 'shadow'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-slate-100 text-slate-700'
                    )}>
                      {currentMode}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {CONTROL_PLANE_MODE_OPTIONS.map((option) => (
                      <RadioOption
                        key={option.value}
                        value={option.value}
                        label={option.label}
                        selected={currentMode === option.value}
                        onSelect={(value) => updateControlPlaneActionMode(
                          action.key,
                          value as 'disabled' | 'shadow' | 'live',
                        )}
                      />
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {describeAgentControlPlaneMode(currentMode, action.label)}
                  </p>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Action Permissions</CardTitle>
          </div>
          <CardDescription>
            Decide which club role can draft, approve, publish, roll back, and arm rollout settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-lg border bg-muted/20 p-4 space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Current permission posture</p>
            <p className="text-sm font-medium">{permissionSummary}</p>
            {currentClubRole ? (
              <p className="text-xs text-muted-foreground">
                You are signed in as <strong>{formatClubAdminRole(currentClubRole)}</strong>.
              </p>
            ) : null}
            {controlPlaneManagePermission && !controlPlaneManagePermission.allowed ? (
              <p className="text-xs text-red-600">
                Only admins with rollout-management access can save permission changes.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Moderators can still be trusted with drafting while publish, rollback, and send access stay tighter.
              </p>
            )}
          </div>

          <div className="space-y-3">
            {PERMISSION_ACTIONS.map((action) => {
              const currentMinimumRole = settings.permissions?.actions?.[action.key]?.minimumRole || DEFAULT_PERMISSIONS.actions[action.key].minimumRole
              return (
                <div key={action.key} className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{action.label}</p>
                      <p className="text-xs text-muted-foreground">{action.description}</p>
                    </div>
                    <span className="rounded-full px-2.5 py-1 text-[11px] font-medium bg-slate-100 text-slate-700">
                      {formatClubAdminRole(currentMinimumRole)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {PERMISSION_ROLE_OPTIONS.map((option) => (
                      <RadioOption
                        key={option.value}
                        value={option.value}
                        label={option.label}
                        selected={currentMinimumRole === option.value}
                        onSelect={(value) => updatePermissionMinimumRole(action.key, value as PermissionRole)}
                      />
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {describeAgentPermissionMinimumRole(currentMinimumRole, action.label)}
                  </p>
                </div>
              )
            })}
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

export default function SettingsPage() {
  const brand = useBrand()
  const params = useParams()
  const clubId = params.id as string

  if (brand.key === 'iqsport') {
    return <SettingsIQWrapper clubId={clubId} />
  }
  return <PiqleSettingsPage />
}

function SettingsIQWrapper({ clubId }: { clubId: string }) {
  const { data: intelligenceData, isLoading } = useIntelligenceSettings(clubId)
  const { data: automationData } = useAutomationSettings(clubId)
  const saveMutation = useSaveIntelligenceSettings()
  const saveAutoMutation = useSaveAutomationSettings()

  return (
    <SettingsIQ
      intelligenceData={intelligenceData}
      automationData={automationData}
      saveMutation={saveMutation}
      saveAutoMutation={saveAutoMutation}
      isLoading={isLoading}
      clubId={clubId}
    />
  )
}
