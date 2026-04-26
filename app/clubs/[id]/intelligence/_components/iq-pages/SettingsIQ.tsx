'use client'

import { useState } from "react";
import { motion } from "motion/react";
import {
  Settings, Globe, Dumbbell, Calendar, Clock, DollarSign,
  Target, Mail, Smartphone, Volume2, Zap, Check, Bell,
  Shield, ChevronDown, Trash2, AlertTriangle, Star, Plus, Users,
} from "lucide-react";
import { useTheme } from "../IQThemeProvider";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import {
  buildAgentControlPlaneSummary,
  describeAgentControlPlaneMode,
  getAgentControlPlaneAudit,
  resolveAgentControlPlane,
} from "@/lib/ai/agent-control-plane";
import {
  buildAgentOutreachRolloutSummary,
  describeAgentOutreachRolloutAction,
  resolveAgentOutreachRollout,
} from "@/lib/ai/agent-outreach-rollout";
import {
  buildAgentPermissionSummary,
  describeAgentPermissionMinimumRole,
  evaluateAgentPermission,
  formatClubAdminRole,
  resolveAgentPermissions,
} from "@/lib/ai/agent-permissions";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl p-5 ${className}`} style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", backdropFilter: "var(--glass-blur)", boxShadow: "var(--card-shadow)" }}>
      {children}
    </div>
  );
}

function SectionHeader({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #8B5CF6, #06B6D4)" }}>
        <Icon className="w-4.5 h-4.5 text-white" />
      </div>
      <div>
        <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--heading)" }}>{title}</h3>
        <p className="text-xs mt-0.5" style={{ color: "var(--t4)" }}>{subtitle}</p>
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  const { isDark } = useTheme();
  return (
    <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: "var(--subtle)" }}>
      <div>
        <div className="text-sm" style={{ fontWeight: 600, color: "var(--t1)" }}>{label}</div>
        {description && <div className="text-[11px] mt-0.5" style={{ color: "var(--t4)" }}>{description}</div>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className="w-11 h-6 rounded-full transition-all relative shrink-0"
        style={{ background: checked ? "linear-gradient(135deg, #8B5CF6, #06B6D4)" : isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)" }}
      >
        <motion.div
          animate={{ x: checked ? 20 : 2 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className="absolute top-1 w-4 h-4 rounded-full bg-white"
          style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }}
        />
      </button>
    </div>
  );
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  const { isDark } = useTheme();
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-xl text-xs transition-all"
      style={{
        background: selected ? "var(--pill-active)" : "var(--subtle)",
        color: selected ? (isDark ? "#C4B5FD" : "#7C3AED") : "var(--t3)",
        fontWeight: selected ? 600 : 500,
        border: selected ? "1px solid rgba(139,92,246,0.2)" : "1px solid transparent",
      }}
    >
      {children}
    </button>
  );
}

type SettingsIQProps = {
  intelligenceData?: any;
  automationData?: any;
  saveMutation?: any;
  saveAutoMutation?: any;
  isLoading?: boolean;
  clubId?: string;
};

type ControlPlaneMode = "disabled" | "shadow" | "live";
type PermissionRole = "ADMIN" | "MODERATOR";
type MembershipMappingSource = "type" | "status" | "either";
type MembershipMappingMatchMode = "contains" | "equals";
type GuestTrialOfferKind = "guest_pass" | "trial_pass" | "starter_pack" | "paid_intro" | "membership_offer";
type GuestTrialOfferAudience = "guest" | "trial" | "either";
type GuestTrialOfferStage = "book_first_visit" | "protect_first_show_up" | "convert_to_paid" | "any";
type GuestTrialOfferDestinationType = "schedule" | "landing_page" | "external_url" | "manual_follow_up";
type ReferralOfferKind = "bring_a_friend" | "vip_guest_pass" | "trial_invite" | "reward_credit" | "guest_pass";
type ReferralOfferLane = "vip_advocate" | "social_regular" | "dormant_advocate" | "any";
type ReferralOfferDestinationType = "schedule" | "landing_page" | "external_url" | "manual_follow_up";
type MembershipMappingRule = {
  rawLabel: string;
  source: MembershipMappingSource;
  matchMode: MembershipMappingMatchMode;
  normalizedType?: "unlimited" | "monthly" | "package" | "drop_in" | "trial" | "guest" | "discounted" | "insurance" | "staff";
  normalizedStatus?: "active" | "suspended" | "expired" | "cancelled" | "trial" | "guest" | "none";
};
type MembershipMappingSettings = {
  rules: MembershipMappingRule[];
};
type GuestTrialOffer = {
  key: string;
  name: string;
  kind: GuestTrialOfferKind;
  audience: GuestTrialOfferAudience;
  stage: GuestTrialOfferStage;
  priceLabel?: string;
  durationLabel?: string;
  summary?: string;
  ctaLabel?: string;
  destinationType?: GuestTrialOfferDestinationType;
  destinationLabel?: string;
  destinationUrl?: string;
  destinationNotes?: string;
  active?: boolean;
  highlight?: boolean;
};
type GuestTrialOfferSettings = {
  offers: GuestTrialOffer[];
};
type ReferralOffer = {
  key: string;
  name: string;
  kind: ReferralOfferKind;
  lane: ReferralOfferLane;
  rewardLabel?: string;
  summary?: string;
  ctaLabel?: string;
  destinationType?: ReferralOfferDestinationType;
  destinationLabel?: string;
  destinationUrl?: string;
  destinationNotes?: string;
  active?: boolean;
  highlight?: boolean;
};
type ReferralOfferSettings = {
  offers: ReferralOffer[];
};
type PermissionActionKey =
  | "draftManage"
  | "approveActions"
  | "outreachSend"
  | "schedulePublish"
  | "scheduleLiveEdit"
  | "scheduleLiveRollback"
  | "controlPlaneManage";
type ControlPlaneActionKey =
  | "outreachSend"
  | "schedulePublish"
  | "scheduleLiveEdit"
  | "scheduleLiveRollback"
  | "adminReminderExternal";
type OutreachRolloutActionKey =
  | "create_campaign"
  | "fill_session"
  | "reactivate_members"
  | "trial_follow_up"
  | "renewal_reactivation";
type PermissionSettings = {
  actions: Record<PermissionActionKey, { minimumRole: PermissionRole }>;
};
type ControlPlaneSettings = {
  killSwitch: boolean;
  actions: Record<ControlPlaneActionKey, { mode: ControlPlaneMode }>;
  outreachRollout: {
    actions: Record<OutreachRolloutActionKey, { enabled: boolean }>;
  };
  audit?: {
    lastChangedAt?: string;
    lastChangedByUserId?: string;
    lastChangedByLabel?: string;
    summary?: string;
    changes?: Array<{
      key: "killSwitch" | "outreachRollout" | ControlPlaneActionKey;
      label: string;
      from: string;
      to: string;
    }>;
  };
};

const DEFAULT_CONTROL_PLANE: ControlPlaneSettings = {
  killSwitch: false,
  actions: {
    outreachSend: { mode: "shadow" },
    schedulePublish: { mode: "live" },
    scheduleLiveEdit: { mode: "live" },
    scheduleLiveRollback: { mode: "live" },
    adminReminderExternal: { mode: "live" },
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
};

const DEFAULT_PERMISSIONS: PermissionSettings = {
  actions: {
    draftManage: { minimumRole: "MODERATOR" },
    approveActions: { minimumRole: "ADMIN" },
    outreachSend: { minimumRole: "ADMIN" },
    schedulePublish: { minimumRole: "ADMIN" },
    scheduleLiveEdit: { minimumRole: "ADMIN" },
    scheduleLiveRollback: { minimumRole: "ADMIN" },
    controlPlaneManage: { minimumRole: "ADMIN" },
  },
};

const DEFAULT_MEMBERSHIP_MAPPINGS: MembershipMappingSettings = {
  rules: [],
};

const DEFAULT_GUEST_TRIAL_OFFERS: GuestTrialOfferSettings = {
  offers: [],
};

const DEFAULT_REFERRAL_OFFERS: ReferralOfferSettings = {
  offers: [],
};

const MEMBERSHIP_MAPPING_SOURCE_OPTIONS = [
  { value: "type", label: "Type label" },
  { value: "status", label: "Status label" },
  { value: "either", label: "Type or status" },
] as const;

const MEMBERSHIP_MAPPING_MATCH_MODE_OPTIONS = [
  { value: "contains", label: "Contains" },
  { value: "equals", label: "Exact match" },
] as const;

const MEMBERSHIP_TYPE_OPTIONS = [
  { value: "unlimited", label: "Unlimited / VIP" },
  { value: "monthly", label: "Monthly member" },
  { value: "package", label: "Package / class pack" },
  { value: "drop_in", label: "Drop-in" },
  { value: "trial", label: "Trial" },
  { value: "guest", label: "Guest" },
  { value: "discounted", label: "Discounted" },
  { value: "insurance", label: "Insurance / SilverSneakers" },
  { value: "staff", label: "Staff / comped" },
] as const;

const MEMBERSHIP_STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended / frozen" },
  { value: "expired", label: "Expired" },
  { value: "cancelled", label: "Cancelled" },
  { value: "trial", label: "Trial" },
  { value: "guest", label: "Guest / no member" },
  { value: "none", label: "No membership" },
] as const;

const GUEST_TRIAL_OFFER_KIND_OPTIONS = [
  { value: "guest_pass", label: "Guest pass" },
  { value: "trial_pass", label: "Trial pass" },
  { value: "starter_pack", label: "Starter pack" },
  { value: "paid_intro", label: "Paid intro" },
  { value: "membership_offer", label: "Membership offer" },
] as const;

const GUEST_TRIAL_OFFER_AUDIENCE_OPTIONS = [
  { value: "either", label: "Guest or trial" },
  { value: "guest", label: "Guests only" },
  { value: "trial", label: "Trials only" },
] as const;

const GUEST_TRIAL_OFFER_STAGE_OPTIONS = [
  { value: "book_first_visit", label: "Book first visit" },
  { value: "protect_first_show_up", label: "Protect first show-up" },
  { value: "convert_to_paid", label: "Convert to paid" },
  { value: "any", label: "Any stage" },
] as const;

const GUEST_TRIAL_OFFER_DESTINATION_OPTIONS = [
  { value: "schedule", label: "Schedule page" },
  { value: "landing_page", label: "Offer landing page" },
  { value: "external_url", label: "External booking URL" },
  { value: "manual_follow_up", label: "Manual follow-up path" },
] as const;

const REFERRAL_OFFER_KIND_OPTIONS = [
  { value: "bring_a_friend", label: "Bring-a-friend" },
  { value: "vip_guest_pass", label: "VIP guest pass" },
  { value: "trial_invite", label: "Trial invite" },
  { value: "reward_credit", label: "Reward credit" },
  { value: "guest_pass", label: "Guest pass" },
] as const;

const REFERRAL_OFFER_LANE_OPTIONS = [
  { value: "vip_advocate", label: "VIP advocates" },
  { value: "social_regular", label: "Social regulars" },
  { value: "dormant_advocate", label: "Dormant advocates" },
  { value: "any", label: "Any lane" },
] as const;

const REFERRAL_OFFER_DESTINATION_OPTIONS = [
  { value: "schedule", label: "Schedule page" },
  { value: "landing_page", label: "Referral landing page" },
  { value: "external_url", label: "External invite URL" },
  { value: "manual_follow_up", label: "Manual follow-up path" },
] as const;

function normalizeMembershipMappings(raw?: any): MembershipMappingSettings {
  return {
    rules: Array.isArray(raw?.rules)
      ? raw.rules.map((rule: any) => ({
        rawLabel: typeof rule?.rawLabel === "string" ? rule.rawLabel : "",
        source: rule?.source === "status" || rule?.source === "either" ? rule.source : "type",
        matchMode: rule?.matchMode === "equals" ? "equals" : "contains",
        normalizedType: rule?.normalizedType,
        normalizedStatus: rule?.normalizedStatus,
      }))
      : [],
  };
}

function normalizeGuestTrialOffers(raw?: any): GuestTrialOfferSettings {
  return {
    offers: Array.isArray(raw?.offers)
      ? raw.offers.map((offer: any) => {
        const stage = offer?.stage || "any";
        const defaultDestinationType: GuestTrialOfferDestinationType = stage === "convert_to_paid"
          ? "landing_page"
          : stage === "protect_first_show_up"
            ? "manual_follow_up"
            : "schedule";

        return {
          key: typeof offer?.key === "string" ? offer.key : "",
          name: typeof offer?.name === "string" ? offer.name : "",
          kind: offer?.kind || "paid_intro",
          audience: offer?.audience || "either",
          stage,
          priceLabel: typeof offer?.priceLabel === "string" ? offer.priceLabel : "",
          durationLabel: typeof offer?.durationLabel === "string" ? offer.durationLabel : "",
          summary: typeof offer?.summary === "string" ? offer.summary : "",
          ctaLabel: typeof offer?.ctaLabel === "string" ? offer.ctaLabel : "",
          destinationType: offer?.destinationType || defaultDestinationType,
          destinationLabel: typeof offer?.destinationLabel === "string" ? offer.destinationLabel : "",
          destinationUrl: typeof offer?.destinationUrl === "string" ? offer.destinationUrl : "",
          destinationNotes: typeof offer?.destinationNotes === "string" ? offer.destinationNotes : "",
          active: offer?.active !== false,
          highlight: offer?.highlight === true,
        };
      })
      : [],
  };
}

function normalizeReferralOffers(raw?: any): ReferralOfferSettings {
  return {
    offers: Array.isArray(raw?.offers)
      ? raw.offers.map((offer: any) => {
        const lane = offer?.lane || "any";
        const defaultDestinationType: ReferralOfferDestinationType = lane === "dormant_advocate"
          ? "manual_follow_up"
          : lane === "vip_advocate"
            ? "landing_page"
            : "schedule";

        return {
          key: typeof offer?.key === "string" ? offer.key : "",
          name: typeof offer?.name === "string" ? offer.name : "",
          kind: offer?.kind || "bring_a_friend",
          lane,
          rewardLabel: typeof offer?.rewardLabel === "string" ? offer.rewardLabel : "",
          summary: typeof offer?.summary === "string" ? offer.summary : "",
          ctaLabel: typeof offer?.ctaLabel === "string" ? offer.ctaLabel : "",
          destinationType: offer?.destinationType || defaultDestinationType,
          destinationLabel: typeof offer?.destinationLabel === "string" ? offer.destinationLabel : "",
          destinationUrl: typeof offer?.destinationUrl === "string" ? offer.destinationUrl : "",
          destinationNotes: typeof offer?.destinationNotes === "string" ? offer.destinationNotes : "",
          active: offer?.active !== false,
          highlight: offer?.highlight === true,
        };
      })
      : [],
  };
}

const PERMISSION_ACTIONS = [
  {
    key: "draftManage",
    label: "Draft work",
    description: "Create and move advisor drafts, ops drafts, and queue workflow.",
  },
  {
    key: "approveActions",
    label: "Approve actions",
    description: "Approve, snooze, decline, or execute review-only agent actions.",
  },
  {
    key: "outreachSend",
    label: "Send outreach",
    description: "Send or schedule live member-facing outreach.",
  },
  {
    key: "schedulePublish",
    label: "Publish schedule",
    description: "Publish internal ops drafts into the live schedule.",
  },
  {
    key: "scheduleLiveEdit",
    label: "Edit live sessions",
    description: "Change already-published sessions in the live schedule.",
  },
  {
    key: "scheduleLiveRollback",
    label: "Rollback live sessions",
    description: "Restore a live session back to its planned version.",
  },
  {
    key: "controlPlaneManage",
    label: "Manage rollout",
    description: "Change control-plane modes and this permission matrix.",
  },
] as const;

const CONTROL_PLANE_ACTIONS = [
  {
    key: "outreachSend",
    label: "Outreach send",
    description: "Live member-facing campaigns, slot fills, and lifecycle sends.",
  },
  {
    key: "schedulePublish",
    label: "Schedule publish",
    description: "Create real sessions from internal ops drafts.",
  },
  {
    key: "scheduleLiveEdit",
    label: "Live session edit",
    description: "Change already-published sessions in the live schedule.",
  },
  {
    key: "scheduleLiveRollback",
    label: "Live rollback",
    description: "Restore a published session back to its planned version.",
  },
  {
    key: "adminReminderExternal",
    label: "Admin reminders",
    description: "External admin pings by email or SMS.",
  },
] as const;

const OUTREACH_ROLLOUT_ACTIONS = [
  {
    key: "create_campaign",
    label: "Campaign sends",
    description: "Agent-drafted campaigns sent to a cohort or selected audience.",
  },
  {
    key: "fill_session",
    label: "Slot filler sends",
    description: "Live outreach to fill an underbooked session.",
  },
  {
    key: "reactivate_members",
    label: "Reactivation sends",
    description: "Live win-back outreach to inactive members.",
  },
  {
    key: "trial_follow_up",
    label: "Trial follow-up sends",
    description: "Live outreach to trial members after their first experience.",
  },
  {
    key: "renewal_reactivation",
    label: "Renewal outreach sends",
    description: "Live renewal recovery and expiration outreach.",
  },
] as const;

function mergeControlPlane(raw?: any, agentLive?: boolean): ControlPlaneSettings {
  const merged: ControlPlaneSettings = {
    ...DEFAULT_CONTROL_PLANE,
    ...(raw || {}),
    actions: {
      ...DEFAULT_CONTROL_PLANE.actions,
      ...(raw?.actions || {}),
    },
    outreachRollout: {
      actions: {
        ...DEFAULT_CONTROL_PLANE.outreachRollout.actions,
        ...(raw?.outreachRollout?.actions || {}),
      },
    },
    audit: raw?.audit,
  };

  if (!raw?.actions?.outreachSend?.mode && agentLive === true) {
    merged.actions.outreachSend = { mode: "live" };
  }

  return merged;
}

function mergePermissions(raw?: any): PermissionSettings {
  return {
    actions: {
      draftManage: {
        minimumRole: raw?.actions?.draftManage?.minimumRole ?? DEFAULT_PERMISSIONS.actions.draftManage.minimumRole,
      },
      approveActions: {
        minimumRole: raw?.actions?.approveActions?.minimumRole ?? DEFAULT_PERMISSIONS.actions.approveActions.minimumRole,
      },
      outreachSend: {
        minimumRole: raw?.actions?.outreachSend?.minimumRole ?? DEFAULT_PERMISSIONS.actions.outreachSend.minimumRole,
      },
      schedulePublish: {
        minimumRole: raw?.actions?.schedulePublish?.minimumRole ?? DEFAULT_PERMISSIONS.actions.schedulePublish.minimumRole,
      },
      scheduleLiveEdit: {
        minimumRole: raw?.actions?.scheduleLiveEdit?.minimumRole ?? DEFAULT_PERMISSIONS.actions.scheduleLiveEdit.minimumRole,
      },
      scheduleLiveRollback: {
        minimumRole: raw?.actions?.scheduleLiveRollback?.minimumRole ?? DEFAULT_PERMISSIONS.actions.scheduleLiveRollback.minimumRole,
      },
      controlPlaneManage: {
        minimumRole: raw?.actions?.controlPlaneManage?.minimumRole ?? DEFAULT_PERMISSIONS.actions.controlPlaneManage.minimumRole,
      },
    },
  };
}

export function SettingsIQ({ intelligenceData, automationData, saveMutation, saveAutoMutation, isLoading: externalLoading, clubId }: SettingsIQProps = {}) {
  const { isDark } = useTheme();

  // Hydrate from real data or use defaults
  const realSettings = intelligenceData?.settings;
  const realAutomation = automationData?.settings;

  // Club Profile
  const [timezone, setTimezone] = useState("America/New_York");
  const [sports, setSports] = useState(["pickleball", "padel", "tennis"]);
  const [courts, setCourts] = useState(6);
  const [operatingDays, setOperatingDays] = useState(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  const [openTime, setOpenTime] = useState("06:00");
  const [closeTime, setCloseTime] = useState("22:00");
  const [pricingModel, setPricingModel] = useState("per_session");
  const [sessionPrice, setSessionPrice] = useState(15);

  // Communication
  const [channel, setChannel] = useState("both");
  const [tone, setTone] = useState("friendly");
  const [maxMessages, setMaxMessages] = useState(4);

  // Automation
  const [autoHealthyWatch, setAutoHealthyWatch] = useState(true);
  const [autoWatchRisk, setAutoWatchRisk] = useState(true);
  const [autoRiskCritical, setAutoRiskCritical] = useState(false);
  const [autoChurned, setAutoChurned] = useState(false);

  // Google Reviews
  const [googleReviewUrl, setGoogleReviewUrl] = useState("");

  // Goals
  const [goals, setGoals] = useState(["fill_sessions", "improve_retention"]);
  const [controlPlane, setControlPlane] = useState(DEFAULT_CONTROL_PLANE);
  const [permissions, setPermissions] = useState(DEFAULT_PERMISSIONS);
  const [membershipMappings, setMembershipMappings] = useState<MembershipMappingSettings>(DEFAULT_MEMBERSHIP_MAPPINGS);
  const [guestTrialOffers, setGuestTrialOffers] = useState<GuestTrialOfferSettings>(DEFAULT_GUEST_TRIAL_OFFERS);
  const [referralOffers, setReferralOffers] = useState<ReferralOfferSettings>(DEFAULT_REFERRAL_OFFERS);

  const [saved, setSaved] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const resolvedControlPlane = resolveAgentControlPlane({ intelligence: { controlPlane, agentLive: controlPlane.actions.outreachSend.mode === "live" } });
  const controlPlaneSummary = buildAgentControlPlaneSummary(resolvedControlPlane);
  const controlPlaneAudit = getAgentControlPlaneAudit({ intelligence: { controlPlane } });
  const resolvedOutreachRollout = resolveAgentOutreachRollout({ intelligence: { controlPlane } });
  const outreachRolloutSummary = buildAgentOutreachRolloutSummary({
    envAllowlistConfigured: !!intelligenceData?.outreachRolloutStatus?.envAllowlistConfigured,
    clubAllowlisted: !!intelligenceData?.outreachRolloutStatus?.clubAllowlisted,
    clubBypassEnabled: !!intelligenceData?.outreachRolloutStatus?.clubBypassEnabled,
    allowlistedClubIds: intelligenceData?.outreachRolloutStatus?.allowlistedClubIds || [],
    enabledActionKinds: Object.entries(resolvedOutreachRollout.actions)
      .filter(([, action]) => action.enabled)
      .map(([actionKind]) => actionKind as OutreachRolloutActionKey),
    actions: resolvedOutreachRollout.actions,
    summary: "",
  });
  const resolvedPermissions = resolveAgentPermissions({ intelligence: { permissions } });
  const permissionSummary = buildAgentPermissionSummary(resolvedPermissions);
  const currentClubRole = intelligenceData?.clubRole as PermissionRole | null | undefined;
  const controlPlaneManagePermission = currentClubRole
    ? evaluateAgentPermission({
        automationSettings: { intelligence: { permissions } },
        action: "controlPlaneManage",
        clubAdminRole: currentClubRole,
      })
    : null;

  // Hydrate from server data once
  if (realSettings && !hydrated) {
    if (realSettings.timezone) setTimezone(realSettings.timezone);
    if (realSettings.sportTypes?.length) setSports(realSettings.sportTypes);
    if (realSettings.courtCount) setCourts(realSettings.courtCount);
    if (realSettings.operatingDays?.length) setOperatingDays(realSettings.operatingDays);
    if (realSettings.operatingHoursStart) setOpenTime(realSettings.operatingHoursStart);
    if (realSettings.operatingHoursEnd) setCloseTime(realSettings.operatingHoursEnd);
    if (realSettings.pricingModel) setPricingModel(realSettings.pricingModel);
    if (realSettings.avgSessionPriceCents) setSessionPrice(realSettings.avgSessionPriceCents / 100);
    if (realSettings.communicationPreferences?.preferredChannel) setChannel(realSettings.communicationPreferences.preferredChannel);
    if (realSettings.communicationPreferences?.tone) setTone(realSettings.communicationPreferences.tone);
    if (realSettings.communicationPreferences?.maxMessagesPerWeek) setMaxMessages(realSettings.communicationPreferences.maxMessagesPerWeek);
    if (realSettings.goals?.length) setGoals(realSettings.goals);
    setControlPlane(mergeControlPlane(realSettings.controlPlane, realSettings.agentLive));
    setPermissions(mergePermissions(realSettings.permissions));
    setMembershipMappings(normalizeMembershipMappings(realSettings.membershipMappings));
    setGuestTrialOffers(normalizeGuestTrialOffers(realSettings.guestTrialOffers));
    setReferralOffers(normalizeReferralOffers(realSettings.referralOffers));
    setHydrated(true);
  }
  if (realAutomation && !hydrated) {
    if (realAutomation.healthyToWatch !== undefined) setAutoHealthyWatch(realAutomation.healthyToWatch);
    if (realAutomation.watchToAtRisk !== undefined) setAutoWatchRisk(realAutomation.watchToAtRisk);
    if (realAutomation.atRiskToCritical !== undefined) setAutoRiskCritical(realAutomation.atRiskToCritical);
    if (realAutomation.churned !== undefined) setAutoChurned(realAutomation.churned);
    if (realAutomation.googleReviewUrl) setGoogleReviewUrl(realAutomation.googleReviewUrl);
  }

  const handleSave = () => {
    if (saveMutation && clubId) {
      saveMutation.mutate({
        clubId,
        settings: {
          timezone,
          sportTypes: sports,
          courtCount: courts,
          operatingDays,
          operatingHoursStart: openTime,
          operatingHoursEnd: closeTime,
          pricingModel,
          avgSessionPriceCents: Math.round(sessionPrice * 100),
          goals,
          communicationPreferences: { preferredChannel: channel, tone, maxMessagesPerWeek: maxMessages },
          agentLive: controlPlane.actions.outreachSend.mode === "live",
          permissions,
          membershipMappings: {
            rules: membershipMappings.rules
              .map((rule) => ({
                rawLabel: rule.rawLabel.trim(),
                source: rule.source,
                matchMode: rule.matchMode,
                normalizedType: rule.normalizedType,
                normalizedStatus: rule.normalizedStatus,
              }))
              .filter((rule) => rule.rawLabel.length > 0 && (rule.normalizedType || rule.normalizedStatus)),
          },
          guestTrialOffers: {
            offers: guestTrialOffers.offers
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
          },
          referralOffers: {
            offers: referralOffers.offers
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
          },
          controlPlane,
        },
      }, {
        onSuccess: (data: any) => {
          if (data?.settings) {
            setControlPlane(mergeControlPlane(data.settings.controlPlane, data.settings.agentLive));
            setPermissions(mergePermissions(data.settings.permissions));
            setMembershipMappings(normalizeMembershipMappings(data.settings.membershipMappings));
            setGuestTrialOffers(normalizeGuestTrialOffers(data.settings.guestTrialOffers));
            setReferralOffers(normalizeReferralOffers(data.settings.referralOffers));
          }
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        },
      });
    }
    if (saveAutoMutation && clubId) {
      saveAutoMutation.mutate({
        clubId,
        settings: {
          enabled: true,
          healthyToWatch: autoHealthyWatch,
          watchToAtRisk: autoWatchRisk,
          atRiskToCritical: autoRiskCritical,
          churned: autoChurned,
          channel,
          googleReviewUrl: googleReviewUrl.trim() || undefined,
        },
      });
    }
    if (!saveMutation) {
      // Mock mode
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const addMembershipMappingRule = () => {
    setMembershipMappings((prev) => ({
      rules: [
        ...prev.rules,
        {
          rawLabel: "",
          source: "type",
          matchMode: "contains",
          normalizedType: "monthly",
        },
      ],
    }));
    setSaved(false);
  };

  const updateMembershipMappingRule = (index: number, patch: Partial<MembershipMappingRule>) => {
    setMembershipMappings((prev) => ({
      rules: prev.rules.map((rule, ruleIndex) => (
        ruleIndex === index
          ? { ...rule, ...patch }
          : rule
      )),
    }));
    setSaved(false);
  };

  const removeMembershipMappingRule = (index: number) => {
    setMembershipMappings((prev) => ({
      rules: prev.rules.filter((_, ruleIndex) => ruleIndex !== index),
    }));
    setSaved(false);
  };

  const addGuestTrialOffer = () => {
    setGuestTrialOffers((prev) => ({
      offers: [
        ...prev.offers,
        {
          key: `offer_${prev.offers.length + 1}`,
          name: "",
          kind: "paid_intro",
          audience: "either",
          stage: "convert_to_paid",
          priceLabel: "",
          durationLabel: "",
          summary: "",
          ctaLabel: "",
          destinationType: "landing_page",
          destinationLabel: "",
          destinationUrl: "",
          destinationNotes: "",
          active: true,
          highlight: false,
        },
      ],
    }));
    setSaved(false);
  };

  const updateGuestTrialOffer = (index: number, patch: Partial<GuestTrialOffer>) => {
    setGuestTrialOffers((prev) => ({
      offers: prev.offers.map((offer, offerIndex) => (
        offerIndex === index
          ? { ...offer, ...patch }
          : offer
      )),
    }));
    setSaved(false);
  };

  const removeGuestTrialOffer = (index: number) => {
    setGuestTrialOffers((prev) => ({
      offers: prev.offers.filter((_, offerIndex) => offerIndex !== index),
    }));
    setSaved(false);
  };

  const addReferralOffer = () => {
    setReferralOffers((prev) => ({
      offers: [
        ...prev.offers,
        {
          key: `referral_offer_${prev.offers.length + 1}`,
          name: "",
          kind: "bring_a_friend",
          lane: "social_regular",
          rewardLabel: "",
          summary: "",
          ctaLabel: "",
          destinationType: "schedule",
          destinationLabel: "",
          destinationUrl: "",
          destinationNotes: "",
          active: true,
          highlight: false,
        },
      ],
    }));
    setSaved(false);
  };

  const updateReferralOffer = (index: number, patch: Partial<ReferralOffer>) => {
    setReferralOffers((prev) => ({
      offers: prev.offers.map((offer, offerIndex) => (
        offerIndex === index
          ? { ...offer, ...patch }
          : offer
      )),
    }));
    setSaved(false);
  };

  const removeReferralOffer = (index: number) => {
    setReferralOffers((prev) => ({
      offers: prev.offers.filter((_, offerIndex) => offerIndex !== index),
    }));
    setSaved(false);
  };

  const toggleSport = (id: string) => setSports(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  const toggleDay = (d: string) => setOperatingDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  const toggleGoal = (g: string) => setGoals(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);
  const updateControlPlaneMode = (actionKey: ControlPlaneActionKey, mode: ControlPlaneMode) => {
    setControlPlane((prev) => ({
      ...prev,
      actions: {
        ...prev.actions,
        [actionKey]: { mode },
      },
    }));
    setSaved(false);
  };
  const updateOutreachRolloutAction = (actionKey: OutreachRolloutActionKey, enabled: boolean) => {
    setControlPlane((prev) => ({
      ...prev,
      outreachRollout: {
        actions: {
          ...prev.outreachRollout.actions,
          [actionKey]: { enabled },
        },
      },
    }));
    setSaved(false);
  };
  const updatePermissionMinimumRole = (actionKey: PermissionActionKey, minimumRole: PermissionRole) => {
    setPermissions((prev) => ({
      actions: {
        ...prev.actions,
        [actionKey]: { minimumRole },
      },
    }));
    setSaved(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6 max-w-[1000px] mx-auto"
    >
      {/* Header */}
      <div>
        <h1 style={{ fontSize: "24px", fontWeight: 800, color: "var(--heading)" }}>Settings</h1>
        <p className="text-sm mt-1" style={{ color: "var(--t3)" }}>Configure your club profile, AI automation, and communication preferences</p>
      </div>

      {/* Club Profile */}
      <Card>
        <SectionHeader icon={Settings} title="Club Profile" subtitle="Basic club information for AI context" />
        <div className="space-y-4">
          {/* Timezone */}
          <div>
            <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Timezone</label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-sm outline-none"
              style={{ background: "var(--subtle)", border: "1px solid var(--card-border)", color: "var(--t1)", colorScheme: isDark ? "dark" : "light" }}
            >
              {["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Phoenix", "America/Toronto", "Europe/London", "Europe/Berlin", "Asia/Tokyo", "Australia/Sydney"].map(tz => (
                <option key={tz} value={tz}>{tz.replace("_", " ")}</option>
              ))}
            </select>
          </div>

          {/* Sports */}
          <div>
            <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Sports</label>
            <div className="flex flex-wrap gap-2">
              {[{ id: "pickleball", label: "Pickleball" }, { id: "tennis", label: "Tennis" }, { id: "padel", label: "Padel" }, { id: "squash", label: "Squash" }, { id: "badminton", label: "Badminton" }].map(s => (
                <Chip key={s.id} selected={sports.includes(s.id)} onClick={() => toggleSport(s.id)}>{s.label}</Chip>
              ))}
            </div>
          </div>

          {/* Courts */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Number of Courts</label>
              <input
                type="number" min={1} max={50} value={courts}
                onChange={(e) => setCourts(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                style={{ background: "var(--subtle)", border: "1px solid var(--card-border)", color: "var(--t1)", colorScheme: isDark ? "dark" : "light" }}
              />
              {(intelligenceData as any)?.courtCountSource === 'synced' && (
                <p className="text-[11px] mt-1.5" style={{ color: "var(--t4)" }}>
                  Auto-detected from {(intelligenceData as any)?.syncedActiveCourts ?? 0} active courts synced via CourtReserve. Edits save to settings but the synced value will continue to display on reload.
                </p>
              )}
            </div>
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Avg Session Price ($)</label>
              <input
                type="number" min={0} max={500} value={sessionPrice}
                onChange={(e) => setSessionPrice(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                style={{ background: "var(--subtle)", border: "1px solid var(--card-border)", color: "var(--t1)", colorScheme: isDark ? "dark" : "light" }}
              />
            </div>
          </div>

          {/* Operating Days */}
          <div>
            <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Operating Days</label>
            <div className="flex gap-1.5">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => (
                <Chip key={d} selected={operatingDays.includes(d)} onClick={() => toggleDay(d)}>{d}</Chip>
              ))}
            </div>
          </div>

          {/* Hours */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Opens</label>
              <input type="time" value={openTime} onChange={(e) => setOpenTime(e.target.value)} className="w-full px-3 py-2 rounded-xl text-sm outline-none" style={{ background: "var(--subtle)", border: "1px solid var(--card-border)", color: "var(--t1)", colorScheme: isDark ? "dark" : "light" }} />
            </div>
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Closes</label>
              <input type="time" value={closeTime} onChange={(e) => setCloseTime(e.target.value)} className="w-full px-3 py-2 rounded-xl text-sm outline-none" style={{ background: "var(--subtle)", border: "1px solid var(--card-border)", color: "var(--t1)", colorScheme: isDark ? "dark" : "light" }} />
            </div>
          </div>

          {/* Pricing */}
          <div>
            <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Pricing Model</label>
            <div className="flex flex-wrap gap-2">
              {[{ id: "per_session", label: "Per Session" }, { id: "membership", label: "Membership" }, { id: "free", label: "Free" }, { id: "hybrid", label: "Hybrid" }].map(p => (
                <Chip key={p.id} selected={pricingModel === p.id} onClick={() => setPricingModel(p.id)}>{p.label}</Chip>
              ))}
            </div>
          </div>

          {/* Goals */}
          <div>
            <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Club Goals</label>
            <div className="flex flex-wrap gap-2">
              {[{ id: "fill_sessions", label: "Fill Sessions" }, { id: "grow_membership", label: "Grow Membership" }, { id: "improve_retention", label: "Improve Retention" }, { id: "increase_revenue", label: "Increase Revenue" }, { id: "reduce_no_shows", label: "Reduce No-Shows" }].map(g => (
                <Chip key={g.id} selected={goals.includes(g.id)} onClick={() => toggleGoal(g.id)}>{g.label}</Chip>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Communication */}
      <Card>
        <SectionHeader icon={Mail} title="Communication" subtitle="Outreach preferences for AI campaigns" />
        <div className="space-y-4">
          <div>
            <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Channel</label>
            <div className="flex gap-2">
              {[{ id: "email", label: "Email", icon: Mail }, { id: "sms", label: "SMS", icon: Smartphone }, { id: "both", label: "Email + SMS", icon: Mail }].map(c => (
                <Chip key={c.id} selected={channel === c.id} onClick={() => setChannel(c.id)}>{c.label}</Chip>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Tone</label>
            <div className="flex gap-2">
              {["friendly", "professional", "casual"].map(t => (
                <Chip key={t} selected={tone === t} onClick={() => setTone(t)}>{t.charAt(0).toUpperCase() + t.slice(1)}</Chip>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Max Messages per Week: <strong style={{ color: "var(--t1)" }}>{maxMessages}</strong></label>
            <input
              type="range" min={1} max={7} value={maxMessages}
              onChange={(e) => setMaxMessages(Number(e.target.value))}
              className="w-full accent-violet-500"
            />
            <div className="flex justify-between text-[10px] mt-1" style={{ color: "var(--t4)" }}>
              <span>1/week</span><span>7/week</span>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <SectionHeader icon={Star} title="Membership Mapping" subtitle="Teach the agent how this club names member plans and statuses" />
        <div className="space-y-4">
          <div className="rounded-xl p-3 text-xs" style={{ background: "var(--subtle)", color: "var(--t4)", border: "1px solid var(--card-border)" }}>
            Keep your raw labels exactly as they come from CourtReserve or imports. These rules let the agent interpret them as guest, VIP/unlimited, package, monthly, trial, and lifecycle status.
          </div>

          <div className="space-y-3">
            {membershipMappings.rules.map((rule, index) => (
              <div key={`${index}-${rule.rawLabel}`} className="rounded-xl p-4 space-y-3" style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm" style={{ fontWeight: 700, color: "var(--t1)" }}>Rule {index + 1}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: "var(--t4)" }}>Case-insensitive. Use contains for noisy labels like “Open Play Pass - $49.99/Month”.</div>
                  </div>
                  <button
                    onClick={() => removeMembershipMappingRule(index)}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] transition-colors"
                    style={{ background: "rgba(239,68,68,0.1)", color: "#F87171", fontWeight: 600 }}
                  >
                    <Trash2 className="w-3.5 h-3.5 inline mr-1" />
                    Remove
                  </button>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Raw label</label>
                    <input
                      value={rule.rawLabel}
                      placeholder="e.g. VIP Gold, Guest Pass, No Membership"
                      onChange={(e) => updateMembershipMappingRule(index, { rawLabel: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ background: "var(--bg)", border: "1px solid var(--card-border)", color: "var(--t1)", colorScheme: isDark ? "dark" : "light" }}
                    />
                  </div>
                  <div>
                    <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Where to match</label>
                    <select
                      value={rule.source}
                      onChange={(e) => updateMembershipMappingRule(index, { source: e.target.value as MembershipMappingSource })}
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ background: "var(--bg)", border: "1px solid var(--card-border)", color: "var(--t1)", colorScheme: isDark ? "dark" : "light" }}
                    >
                      {MEMBERSHIP_MAPPING_SOURCE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Match mode</label>
                    <select
                      value={rule.matchMode}
                      onChange={(e) => updateMembershipMappingRule(index, { matchMode: e.target.value as MembershipMappingMatchMode })}
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ background: "var(--bg)", border: "1px solid var(--card-border)", color: "var(--t1)", colorScheme: isDark ? "dark" : "light" }}
                    >
                      {MEMBERSHIP_MAPPING_MATCH_MODE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Canonical type</label>
                    <select
                      value={rule.normalizedType || ""}
                      onChange={(e) => updateMembershipMappingRule(index, { normalizedType: e.target.value ? e.target.value as MembershipMappingRule["normalizedType"] : undefined })}
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ background: "var(--bg)", border: "1px solid var(--card-border)", color: "var(--t1)", colorScheme: isDark ? "dark" : "light" }}
                    >
                      <option value="">No type override</option>
                      {MEMBERSHIP_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Canonical status</label>
                    <select
                      value={rule.normalizedStatus || ""}
                      onChange={(e) => updateMembershipMappingRule(index, { normalizedStatus: e.target.value ? e.target.value as MembershipMappingRule["normalizedStatus"] : undefined })}
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ background: "var(--bg)", border: "1px solid var(--card-border)", color: "var(--t1)", colorScheme: isDark ? "dark" : "light" }}
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

          <button
            onClick={addMembershipMappingRule}
            className="px-3 py-2 rounded-xl text-sm transition-colors"
            style={{ background: "var(--subtle)", color: "var(--t2)", fontWeight: 600, border: "1px solid var(--card-border)" }}
          >
            <Plus className="w-4 h-4 inline mr-1.5" />
            Add membership rule
          </button>
        </div>
      </Card>

      <Card>
        <SectionHeader icon={DollarSign} title="Guest / Trial Offers" subtitle="Give the agent concrete entry and paid-conversion offers" />
        <div className="space-y-4">
          <div className="rounded-xl p-3 text-xs" style={{ background: "var(--subtle)", color: "var(--t4)", border: "1px solid var(--card-border)" }}>
            These offers stay club-specific. The agent can use them in guest booking, first show-up protection, and guest/trial to paid conversion flows.
          </div>

          <div className="space-y-3">
            {guestTrialOffers.offers.map((offer, index) => (
              <div key={`${index}-${offer.key}`} className="rounded-xl p-4 space-y-3" style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm" style={{ fontWeight: 700, color: "var(--t1)" }}>Offer {index + 1}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: "var(--t4)" }}>A real offer name the agent can reference instead of generic paid-step language.</div>
                  </div>
                  <button
                    onClick={() => removeGuestTrialOffer(index)}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] transition-colors"
                    style={{ background: "rgba(239,68,68,0.1)", color: "#F87171", fontWeight: 600 }}
                  >
                    <Trash2 className="w-3.5 h-3.5 inline mr-1" />
                    Remove
                  </button>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Offer key</label>
                    <input
                      value={offer.key}
                      placeholder="e.g. starter_pack"
                      onChange={(e) => updateGuestTrialOffer(index, { key: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ background: "var(--bg)", border: "1px solid var(--card-border)", color: "var(--t1)", colorScheme: isDark ? "dark" : "light" }}
                    />
                  </div>
                  <div>
                    <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Offer name</label>
                    <input
                      value={offer.name}
                      placeholder="e.g. Guest Pass, Starter Pack, Intro Membership"
                      onChange={(e) => updateGuestTrialOffer(index, { name: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ background: "var(--bg)", border: "1px solid var(--card-border)", color: "var(--t1)", colorScheme: isDark ? "dark" : "light" }}
                    />
                  </div>
                  <div>
                    <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Offer kind</label>
                    <select
                      value={offer.kind}
                      onChange={(e) => updateGuestTrialOffer(index, { kind: e.target.value as GuestTrialOfferKind })}
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ background: "var(--bg)", border: "1px solid var(--card-border)", color: "var(--t1)", colorScheme: isDark ? "dark" : "light" }}
                    >
                      {GUEST_TRIAL_OFFER_KIND_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Audience</label>
                    <select
                      value={offer.audience}
                      onChange={(e) => updateGuestTrialOffer(index, { audience: e.target.value as GuestTrialOfferAudience })}
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ background: "var(--bg)", border: "1px solid var(--card-border)", color: "var(--t1)", colorScheme: isDark ? "dark" : "light" }}
                    >
                      {GUEST_TRIAL_OFFER_AUDIENCE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Funnel stage</label>
                    <select
                      value={offer.stage}
                      onChange={(e) => updateGuestTrialOffer(index, { stage: e.target.value as GuestTrialOfferStage })}
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ background: "var(--bg)", border: "1px solid var(--card-border)", color: "var(--t1)", colorScheme: isDark ? "dark" : "light" }}
                    >
                      {GUEST_TRIAL_OFFER_STAGE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Price label</label>
                    <input
                      value={offer.priceLabel || ""}
                      placeholder="e.g. $29 intro, $49/month"
                      onChange={(e) => updateGuestTrialOffer(index, { priceLabel: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ background: "var(--bg)", border: "1px solid var(--card-border)", color: "var(--t1)", colorScheme: isDark ? "dark" : "light" }}
                    />
                  </div>
                  <div>
                    <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Duration / credits</label>
                    <input
                      value={offer.durationLabel || ""}
                      placeholder="e.g. 14 days, 3 visits"
                      onChange={(e) => updateGuestTrialOffer(index, { durationLabel: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ background: "var(--bg)", border: "1px solid var(--card-border)", color: "var(--t1)", colorScheme: isDark ? "dark" : "light" }}
                    />
                  </div>
                  <div>
                    <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>CTA label</label>
                    <input
                      value={offer.ctaLabel || ""}
                      placeholder="e.g. Start trial"
                      onChange={(e) => updateGuestTrialOffer(index, { ctaLabel: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ background: "var(--bg)", border: "1px solid var(--card-border)", color: "var(--t1)", colorScheme: isDark ? "dark" : "light" }}
                    />
                  </div>
                  <div>
                    <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Destination type</label>
                    <select
                      value={offer.destinationType || "schedule"}
                      onChange={(e) => updateGuestTrialOffer(index, { destinationType: e.target.value as GuestTrialOfferDestinationType })}
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ background: "var(--bg)", border: "1px solid var(--card-border)", color: "var(--t1)", colorScheme: isDark ? "dark" : "light" }}
                    >
                      {GUEST_TRIAL_OFFER_DESTINATION_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Destination label</label>
                    <input
                      value={offer.destinationLabel || ""}
                      placeholder="e.g. Beginner booking page"
                      onChange={(e) => updateGuestTrialOffer(index, { destinationLabel: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ background: "var(--bg)", border: "1px solid var(--card-border)", color: "var(--t1)", colorScheme: isDark ? "dark" : "light" }}
                    />
                  </div>
                  <div>
                    <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Destination URL</label>
                    <input
                      value={offer.destinationUrl || ""}
                      placeholder="e.g. https://... or /trial-booking"
                      onChange={(e) => updateGuestTrialOffer(index, { destinationUrl: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ background: "var(--bg)", border: "1px solid var(--card-border)", color: "var(--t1)", colorScheme: isDark ? "dark" : "light" }}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Destination notes</label>
                    <input
                      value={offer.destinationNotes || ""}
                      placeholder="e.g. Start with the easiest first-booking path, then fall back to manual follow-up"
                      onChange={(e) => updateGuestTrialOffer(index, { destinationNotes: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ background: "var(--bg)", border: "1px solid var(--card-border)", color: "var(--t1)", colorScheme: isDark ? "dark" : "light" }}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Offer summary</label>
                    <input
                      value={offer.summary || ""}
                      placeholder="e.g. Low-friction first paid step after the first visit"
                      onChange={(e) => updateGuestTrialOffer(index, { summary: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ background: "var(--bg)", border: "1px solid var(--card-border)", color: "var(--t1)", colorScheme: isDark ? "dark" : "light" }}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-6 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={offer.active !== false}
                      onChange={(e) => updateGuestTrialOffer(index, { active: e.target.checked })}
                      className="rounded border-input accent-primary"
                    />
                    <span className="text-sm">Active</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={offer.highlight === true}
                      onChange={(e) => updateGuestTrialOffer(index, { highlight: e.target.checked })}
                      className="rounded border-input accent-primary"
                    />
                    <span className="text-sm">Highlight as preferred</span>
                  </label>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={addGuestTrialOffer}
            className="px-3 py-2 rounded-xl text-sm transition-colors"
            style={{ background: "var(--subtle)", color: "var(--t2)", fontWeight: 600, border: "1px solid var(--card-border)" }}
          >
            <Plus className="w-4 h-4 inline mr-1.5" />
            Add guest / trial offer
          </button>
        </div>
      </Card>

      <Card>
        <SectionHeader icon={Users} title="Referral Offers" subtitle="Bring-a-friend offers and invite destinations" />
        <div className="space-y-4">
          <div className="rounded-xl p-3 text-xs" style={{ background: "var(--subtle)", color: "var(--t3)", lineHeight: 1.6 }}>
            These offers stay club-specific. The agent uses them across VIP advocates, social regulars, and dormant advocate restart flows.
          </div>

          <div className="space-y-3">
            {(referralOffers.offers || []).map((offer, index) => (
              <div key={`${index}-${offer.key || offer.name}`} className="rounded-2xl p-4 space-y-4" style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm" style={{ fontWeight: 700, color: "var(--heading)" }}>Referral offer {index + 1}</div>
                    <div className="text-xs mt-1" style={{ color: "var(--t4)" }}>
                      A concrete advocate offer and invite path the agent can reference directly.
                    </div>
                  </div>
                  <button
                    onClick={() => removeReferralOffer(index)}
                    className="px-3 py-1.5 rounded-xl text-xs font-medium"
                    style={{ background: "rgba(239,68,68,0.12)", color: "#EF4444" }}
                  >
                    Remove
                  </button>
                </div>

                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Offer key</label>
                    <input
                      value={offer.key}
                      placeholder="e.g. bring_a_friend"
                      onChange={(e) => updateReferralOffer(index, { key: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ background: "var(--bg)", border: "1px solid var(--card-border)", color: "var(--t1)", colorScheme: isDark ? "dark" : "light" }}
                    />
                  </div>
                  <div>
                    <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Offer name</label>
                    <input
                      value={offer.name}
                      placeholder="e.g. Bring-a-Friend Pass"
                      onChange={(e) => updateReferralOffer(index, { name: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ background: "var(--bg)", border: "1px solid var(--card-border)", color: "var(--t1)", colorScheme: isDark ? "dark" : "light" }}
                    />
                  </div>
                  <div>
                    <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Offer kind</label>
                    <select
                      value={offer.kind}
                      onChange={(e) => updateReferralOffer(index, { kind: e.target.value as ReferralOfferKind })}
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ background: "var(--bg)", border: "1px solid var(--card-border)", color: "var(--t1)", colorScheme: isDark ? "dark" : "light" }}
                    >
                      {REFERRAL_OFFER_KIND_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Referral lane</label>
                    <select
                      value={offer.lane}
                      onChange={(e) => updateReferralOffer(index, { lane: e.target.value as ReferralOfferLane })}
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ background: "var(--bg)", border: "1px solid var(--card-border)", color: "var(--t1)", colorScheme: isDark ? "dark" : "light" }}
                    >
                      {REFERRAL_OFFER_LANE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Reward / perk</label>
                    <input
                      value={offer.rewardLabel || ""}
                      placeholder="e.g. Bring one guest free, $20 credit"
                      onChange={(e) => updateReferralOffer(index, { rewardLabel: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ background: "var(--bg)", border: "1px solid var(--card-border)", color: "var(--t1)", colorScheme: isDark ? "dark" : "light" }}
                    />
                  </div>
                  <div>
                    <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>CTA label</label>
                    <input
                      value={offer.ctaLabel || ""}
                      placeholder="e.g. Invite a friend"
                      onChange={(e) => updateReferralOffer(index, { ctaLabel: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ background: "var(--bg)", border: "1px solid var(--card-border)", color: "var(--t1)", colorScheme: isDark ? "dark" : "light" }}
                    />
                  </div>
                  <div>
                    <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Destination type</label>
                    <select
                      value={offer.destinationType || "schedule"}
                      onChange={(e) => updateReferralOffer(index, { destinationType: e.target.value as ReferralOfferDestinationType })}
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ background: "var(--bg)", border: "1px solid var(--card-border)", color: "var(--t1)", colorScheme: isDark ? "dark" : "light" }}
                    >
                      {REFERRAL_OFFER_DESTINATION_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Destination label</label>
                    <input
                      value={offer.destinationLabel || ""}
                      placeholder="e.g. Bring-a-friend booking page"
                      onChange={(e) => updateReferralOffer(index, { destinationLabel: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ background: "var(--bg)", border: "1px solid var(--card-border)", color: "var(--t1)", colorScheme: isDark ? "dark" : "light" }}
                    />
                  </div>
                  <div>
                    <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Destination URL</label>
                    <input
                      value={offer.destinationUrl || ""}
                      placeholder="e.g. https://... or /bring-a-friend"
                      onChange={(e) => updateReferralOffer(index, { destinationUrl: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ background: "var(--bg)", border: "1px solid var(--card-border)", color: "var(--t1)", colorScheme: isDark ? "dark" : "light" }}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Destination notes</label>
                    <input
                      value={offer.destinationNotes || ""}
                      placeholder="e.g. Route referred guests into the easiest beginner-friendly invite path"
                      onChange={(e) => updateReferralOffer(index, { destinationNotes: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ background: "var(--bg)", border: "1px solid var(--card-border)", color: "var(--t1)", colorScheme: isDark ? "dark" : "light" }}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs mb-1.5 block" style={{ color: "var(--t3)", fontWeight: 600 }}>Offer summary</label>
                    <input
                      value={offer.summary || ""}
                      placeholder="e.g. Low-friction referral motion for members with strong social trust"
                      onChange={(e) => updateReferralOffer(index, { summary: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ background: "var(--bg)", border: "1px solid var(--card-border)", color: "var(--t1)", colorScheme: isDark ? "dark" : "light" }}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-6 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={offer.active !== false}
                      onChange={(e) => updateReferralOffer(index, { active: e.target.checked })}
                      className="rounded border-input accent-primary"
                    />
                    <span className="text-sm">Active</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={offer.highlight === true}
                      onChange={(e) => updateReferralOffer(index, { highlight: e.target.checked })}
                      className="rounded border-input accent-primary"
                    />
                    <span className="text-sm">Highlight as preferred</span>
                  </label>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={addReferralOffer}
            className="px-3 py-2 rounded-xl text-sm transition-colors"
            style={{ background: "var(--subtle)", color: "var(--t2)", fontWeight: 600, border: "1px solid var(--card-border)" }}
          >
            <Plus className="w-4 h-4 inline mr-1.5" />
            Add referral offer
          </button>
        </div>
      </Card>

      {/* Automation */}
      <Card>
        <SectionHeader icon={Zap} title="AI Automation" subtitle="Auto-trigger campaigns when member health changes" />
        <div className="space-y-3">
          <Toggle checked={autoHealthyWatch} onChange={setAutoHealthyWatch} label="Healthy → Watch" description="Send gentle check-in when frequency drops" />
          <Toggle checked={autoWatchRisk} onChange={setAutoWatchRisk} label="Watch → At Risk" description="Send retention boost when engagement drops significantly" />
          <Toggle checked={autoRiskCritical} onChange={setAutoRiskCritical} label="At Risk → Critical" description="Urgent win-back with personal offer" />
          <Toggle checked={autoChurned} onChange={setAutoChurned} label="Churned 21+ days" description="Reactivation campaign with special incentive" />
        </div>
      </Card>

      {/* Agent Control Plane */}
      <Card>
        <SectionHeader icon={Shield} title="Agent Control Plane" subtitle="Roll out risky live actions gradually, one surface at a time" />
        <div className="space-y-4">
          <Toggle
            checked={controlPlane.killSwitch}
            onChange={(value) => {
              setControlPlane((prev) => ({ ...prev, killSwitch: value }));
              setSaved(false);
            }}
            label="Kill switch"
            description="Block every controlled live side effect for this club instantly"
          />

          <div className="text-[11px] px-3 py-2 rounded-xl" style={{ background: "var(--subtle)", color: "var(--t4)" }}>
            Outreach defaults to shadow mode until you explicitly arm it. Schedule publish, edit, rollback, and external admin reminders can each be managed separately.
          </div>

          <div className="rounded-xl px-4 py-3" style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}>
            <div className="text-[11px] uppercase tracking-[0.08em]" style={{ color: "var(--t4)", fontWeight: 700 }}>
              Current posture
            </div>
            <div className="text-sm mt-1" style={{ color: "var(--t1)", fontWeight: 600 }}>
              {controlPlaneSummary}
            </div>
            <div className="text-[11px] mt-2" style={{ color: "var(--t4)", lineHeight: 1.6 }}>
              {currentClubRole ? (
                <div>
                  Your club role: <span style={{ color: "var(--t2)", fontWeight: 600 }}>{formatClubAdminRole(currentClubRole)}</span>
                </div>
              ) : null}
              {controlPlaneAudit ? (
                <>
                  <div>
                    Last changed by <span style={{ color: "var(--t2)", fontWeight: 600 }}>{controlPlaneAudit.lastChangedByLabel || "Club admin"}</span>
                    {controlPlaneAudit.lastChangedAt
                      ? ` on ${new Date(controlPlaneAudit.lastChangedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
                      : ""}
                  </div>
                  {controlPlaneAudit.summary ? <div>{controlPlaneAudit.summary}</div> : null}
                </>
              ) : (
                <div>No rollout changes recorded yet. Once someone arms, shadows, or disables an action, the latest change will show up here.</div>
              )}
              {controlPlaneManagePermission && !controlPlaneManagePermission.allowed ? (
                <div style={{ color: "#F87171" }}>{controlPlaneManagePermission.reason}</div>
              ) : null}
            </div>
          </div>

          <div
            className="rounded-xl p-4"
            style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}
          >
            <div className="space-y-1 mb-3">
              <div className="text-sm" style={{ fontWeight: 600, color: "var(--t1)" }}>Outreach live rollout</div>
              <div className="text-[11px]" style={{ color: "var(--t4)" }}>
                Live outreach needs both a server-side club allowlist and the specific outreach action type to be armed here.
              </div>
            </div>
            <div className="rounded-xl px-4 py-3 mb-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--card-border)" }}>
              <div className="text-[11px] uppercase tracking-[0.08em]" style={{ color: "var(--t4)", fontWeight: 700 }}>
                Current rollout posture
              </div>
              <div className="text-sm mt-1" style={{ color: "var(--t1)", fontWeight: 600 }}>
                {outreachRolloutSummary}
              </div>
              <div className="text-[11px] mt-2" style={{ color: "var(--t4)", lineHeight: 1.6 }}>
                {intelligenceData?.outreachRolloutStatus?.envAllowlistConfigured
                  ? intelligenceData?.outreachRolloutStatus?.clubAllowlisted
                    ? "This club is allowlisted in the server rollout env."
                    : "This club is still outside the server rollout allowlist, so outreach stays shadow-only even if you arm an action below."
                  : "No rollout clubs are configured in the server env yet, so outreach stays shadow-only until that allowlist is set."}
              </div>
            </div>
            <div className="space-y-3">
              {OUTREACH_ROLLOUT_ACTIONS.map((action) => {
                const currentEnabled = controlPlane.outreachRollout.actions[action.key].enabled;
                const resolvedAction = resolvedOutreachRollout.actions[action.key];
                return (
                  <div
                    key={action.key}
                    className="rounded-xl p-4"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--card-border)" }}
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <div className="text-sm" style={{ fontWeight: 600, color: "var(--t1)" }}>{action.label}</div>
                        <div className="text-[11px] mt-1" style={{ color: "var(--t4)" }}>{action.description}</div>
                      </div>
                      <div
                        className="px-2.5 py-1 rounded-full text-[10px]"
                        style={{
                          fontWeight: 700,
                          background: currentEnabled ? "rgba(16,185,129,0.12)" : "rgba(148,163,184,0.14)",
                          color: currentEnabled ? "#10B981" : "var(--t3)",
                        }}
                      >
                        {currentEnabled ? "armed" : "shadow-only"}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Chip selected={!currentEnabled} onClick={() => updateOutreachRolloutAction(action.key, false)}>
                        Shadow only
                      </Chip>
                      <Chip selected={currentEnabled} onClick={() => updateOutreachRolloutAction(action.key, true)}>
                        Armed
                      </Chip>
                    </div>
                    <div className="text-[11px] mt-3" style={{ color: "var(--t4)" }}>
                      {describeAgentOutreachRolloutAction(resolvedAction)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            {CONTROL_PLANE_ACTIONS.map((action) => {
              const currentMode = controlPlane.actions[action.key].mode;
              return (
                <div
                  key={action.key}
                  className="rounded-xl p-4"
                  style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="text-sm" style={{ fontWeight: 600, color: "var(--t1)" }}>{action.label}</div>
                      <div className="text-[11px] mt-1" style={{ color: "var(--t4)" }}>{action.description}</div>
                    </div>
                    <div
                      className="px-2.5 py-1 rounded-full text-[10px]"
                      style={{
                        fontWeight: 700,
                        background:
                          currentMode === "live"
                            ? "rgba(16,185,129,0.12)"
                            : currentMode === "shadow"
                              ? "rgba(245,158,11,0.12)"
                              : "rgba(148,163,184,0.14)",
                        color:
                          currentMode === "live"
                            ? "#10B981"
                            : currentMode === "shadow"
                              ? "#F59E0B"
                              : "var(--t3)",
                      }}
                    >
                      {currentMode}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {(["disabled", "shadow", "live"] as const).map((mode) => (
                      <Chip
                        key={mode}
                        selected={currentMode === mode}
                        onClick={() => updateControlPlaneMode(action.key, mode)}
                      >
                        {mode === "disabled" ? "Disabled" : mode === "shadow" ? "Shadow" : "Live"}
                      </Chip>
                    ))}
                  </div>
                  <div className="text-[11px] mt-3" style={{ color: "var(--t4)" }}>
                    {describeAgentControlPlaneMode(currentMode, action.label)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      <Card>
        <SectionHeader icon={Shield} title="Action Permissions" subtitle="Choose which club role can draft, approve, publish, and send" />
        <div className="space-y-4">
          <div className="rounded-xl px-4 py-3" style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}>
            <div className="text-[11px] uppercase tracking-[0.08em]" style={{ color: "var(--t4)", fontWeight: 700 }}>
              Current posture
            </div>
            <div className="text-sm mt-1" style={{ color: "var(--t1)", fontWeight: 600 }}>
              {permissionSummary}
            </div>
            <div className="text-[11px] mt-2" style={{ color: "var(--t4)", lineHeight: 1.6 }}>
              {currentClubRole ? (
                <div>
                  You are signed in as <span style={{ color: "var(--t2)", fontWeight: 600 }}>{formatClubAdminRole(currentClubRole)}</span>
                </div>
              ) : null}
              {controlPlaneManagePermission && !controlPlaneManagePermission.allowed ? (
                <div style={{ color: "#F87171" }}>Only admins with rollout-management access can save permission changes.</div>
              ) : (
                <div>Moderators can own draft work while publish, rollback, and outreach stay tighter when needed.</div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            {PERMISSION_ACTIONS.map((action) => {
              const currentMinimumRole = permissions.actions[action.key].minimumRole;
              return (
                <div
                  key={action.key}
                  className="rounded-xl p-4"
                  style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="text-sm" style={{ fontWeight: 600, color: "var(--t1)" }}>{action.label}</div>
                      <div className="text-[11px] mt-1" style={{ color: "var(--t4)" }}>{action.description}</div>
                    </div>
                    <div
                      className="px-2.5 py-1 rounded-full text-[10px]"
                      style={{
                        fontWeight: 700,
                        background: "rgba(148,163,184,0.14)",
                        color: "var(--t3)",
                      }}
                    >
                      {formatClubAdminRole(currentMinimumRole)}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {(["MODERATOR", "ADMIN"] as const).map((role) => (
                      <Chip
                        key={role}
                        selected={currentMinimumRole === role}
                        onClick={() => updatePermissionMinimumRole(action.key, role)}
                      >
                        {role === "ADMIN" ? "Admin" : "Moderator"}
                      </Chip>
                    ))}
                  </div>
                  <div className="text-[11px] mt-3" style={{ color: "var(--t4)" }}>
                    {describeAgentPermissionMinimumRole(currentMinimumRole, action.label)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Google Reviews */}
      <Card>
        <SectionHeader icon={Star} title="Google Reviews" subtitle="Automatically request reviews after sessions" />
        <div className="space-y-3">
          <div>
            <label className="block text-xs mb-1.5" style={{ color: "var(--t3)", fontWeight: 600 }}>Google Review URL</label>
            <input
              value={googleReviewUrl}
              onChange={(e) => setGoogleReviewUrl(e.target.value)}
              placeholder="https://g.page/r/your-club/review"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: "var(--subtle)", border: "1px solid var(--card-border)", color: "var(--t1)" }}
            />
            <p className="text-[10px] mt-1.5" style={{ color: "var(--t4)" }}>
              Find your link: Google Maps → Your business → Share → &quot;Ask for reviews&quot;. After saving, members will receive a review request email after playing a session (max 1 per 30 days).
            </p>
          </div>
          {googleReviewUrl && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.15)" }}>
              <Check className="w-3.5 h-3.5" style={{ color: "#10B981" }} />
              <span className="text-xs" style={{ color: "#10B981", fontWeight: 600 }}>Review requests enabled — sent daily after sessions</span>
            </div>
          )}
        </div>
      </Card>

      {/* Save */}
      <div className="flex justify-end pb-8">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleSave}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm text-white"
          style={{
            background: saved ? "linear-gradient(135deg, #10B981, #059669)" : "linear-gradient(135deg, #8B5CF6, #06B6D4)",
            fontWeight: 600,
            boxShadow: saved ? "0 4px 15px rgba(16,185,129,0.3)" : "0 4px 15px rgba(139,92,246,0.3)",
          }}
        >
          {saved ? <><Check className="w-4 h-4" /> Saved</> : "Save Changes"}
        </motion.button>
      </div>

      {/* Danger Zone */}
      {clubId && <DangerZone clubId={clubId} />}
    </motion.div>
  );
}

function DangerZone({ clubId }: { clubId: string }) {
  const { isDark } = useTheme();
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const deleteClub = trpc.club.delete.useMutation();

  const handleDelete = async () => {
    if (confirmText !== "DELETE") return;
    setDeleting(true);
    try {
      await deleteClub.mutateAsync({ clubId });
      router.replace("/clubs");
    } catch (err: any) {
      console.error("[Settings] Delete failed:", err?.message || err);
      setDeleting(false);
    }
  };

  return (
    <div className="pb-8">
      <div className="rounded-2xl p-5" style={{
        background: isDark ? "rgba(239,68,68,0.05)" : "rgba(239,68,68,0.03)",
        border: "1px solid rgba(239,68,68,0.2)",
      }}>
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-4 h-4" style={{ color: "#EF4444" }} />
          <span className="text-sm" style={{ fontWeight: 700, color: "#EF4444" }}>Danger Zone</span>
        </div>
        <p className="text-sm mb-4" style={{ color: "var(--t3)" }}>
          Permanently delete this club and all its data. This action cannot be undone.
        </p>

        {!showConfirm ? (
          <button
            onClick={() => setShowConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all"
            style={{
              background: "rgba(239,68,68,0.1)",
              color: "#EF4444",
              fontWeight: 600,
              border: "1px solid rgba(239,68,68,0.2)",
            }}
          >
            <Trash2 className="w-4 h-4" /> Delete Club
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-xs" style={{ color: "var(--t3)" }}>
              Type <strong style={{ color: "#EF4444" }}>DELETE</strong> to confirm:
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder="Type DELETE"
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
              style={{
                background: "var(--subtle)",
                color: "var(--t1)",
                border: confirmText === "DELETE" ? "1px solid rgba(239,68,68,0.5)" : "1px solid var(--card-border)",
              }}
              autoFocus
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleDelete}
                disabled={confirmText !== "DELETE" || deleting}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-white transition-all"
                style={{
                  background: confirmText === "DELETE" ? "#EF4444" : "rgba(239,68,68,0.3)",
                  fontWeight: 600,
                  cursor: confirmText === "DELETE" && !deleting ? "pointer" : "not-allowed",
                  opacity: deleting ? 0.5 : 1,
                }}
              >
                <Trash2 className="w-4 h-4" /> {deleting ? "Deleting..." : "Confirm Delete"}
              </button>
              <button
                onClick={() => { setShowConfirm(false); setConfirmText(""); }}
                className="px-4 py-2 rounded-xl text-sm"
                style={{ color: "var(--t3)", fontWeight: 500 }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
