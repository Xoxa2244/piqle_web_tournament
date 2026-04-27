'use client'
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { motion, AnimatePresence } from "motion/react";
import {
    Brain, Send, Sparkles, TrendingUp, Users, CalendarDays,
    DollarSign, Target, Lightbulb, BarChart3, Clock, Zap,
    MessageSquare, ChevronRight, Mic, Paperclip, RotateCcw,
    ThumbsUp, ThumbsDown, Copy, BookOpen, Plus, Trash2, CheckCircle2, Mail,
    CheckSquare, Activity, PowerOff,
  } from "lucide-react";
import { useTheme } from "../IQThemeProvider";
import { trpc } from "@/lib/trpc";
import { AdvisorActionCard } from "./AdvisorActionCard";
import { PendingQueueCards } from "./PendingQueueCards";
import { extractAdvisorAction, getAdvisorActionFromMetadata, stripAdvisorAction } from "@/lib/ai/advisor-actions";
import { extractPendingQueue, stripPendingQueueTag } from "@/lib/ai/advisor-pending-queue";
import { getAdvisorActionRuntimeState } from "@/lib/ai/advisor-action-state";
import { getAdvisorLatestOutcome } from "@/lib/ai/advisor-outcomes";
import {
  parseGuestTrialExecutionContext,
  type GuestTrialExecutionContext,
} from "@/lib/ai/guest-trial-offers";
import {
  parseReferralExecutionContext,
  type ReferralExecutionContext,
} from "@/lib/ai/referral-offers";
import { useAdvisorDrafts } from "../../_hooks/use-intelligence";
import {
  formatGuestTrialWorkspaceSummary,
  formatReferralWorkspaceSummary,
} from "./shared/growth-context";
import { ChatRichText } from "../shared/ChatRichText";

/* --- Suggested Prompts ---
 * Mix of "planning" prompts (draft, analyze, recommend) and "ops"
 * prompts (pending approvals, kill switch, recent activity). Advisor
 * is the single AI surface — there is no separate Agent page for
 * agentic actions. We just surface the full capability here.
 */
const suggestedPrompts = [
  // ── Ops / agent-style (top so they're visible first) ──
  { icon: CheckSquare, text: "What needs my approval right now?", category: "Agent Queue" },
  { icon: Activity, text: "What did the agent do today?", category: "Agent Activity" },
  { icon: PowerOff, text: "Stop all AI sending", category: "Kill Switch" },
  // ── Planning / analysis ──
  { icon: Sparkles, text: "Draft a first-booking outreach plan for trial and guest members who still have no confirmed session", category: "Smart First Session" },
  { icon: CalendarDays, text: "Draft a second-session follow-up for newcomers who only booked once", category: "Smart First Session" },
  { icon: Users, text: "Which members are at risk of churning?", category: "Members" },
  { icon: TrendingUp, text: "Why is Tuesday morning occupancy so low?", category: "Occupancy" },
  { icon: DollarSign, text: "How can I increase revenue by 20% this quarter?", category: "Revenue" },
  { icon: Lightbulb, text: "Give me 3 quick wins to improve this week", category: "Strategy" },
];

/* --- Types --- */
interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
}

interface AdvisorDraftWorkspaceItem {
  id: string
  kind: string
  status: string
  title: string
  summary: string | null
  originalIntent: string | null
  selectedPlan: 'requested' | 'recommended'
  sandboxMode: boolean
  scheduledFor?: string | Date | null
  timeZone?: string | null
  metadata?: {
    sandboxPreview?: {
      kind?: string
      channel?: 'email' | 'sms' | 'both'
      deliveryMode?: 'send_now' | 'send_later'
      recipientCount?: number
      skippedCount?: number
      scheduledLabel?: string
      note?: string
      recipients?: Array<{
        memberId: string
        name: string
        channel: 'email' | 'sms' | 'both'
        score?: number
        email?: string
        phone?: string
      }>
    } | null
    programmingPreview?: {
      goal: string
      publishMode: 'draft_only'
      primary: {
        id: string
        title: string
        dayOfWeek: string
        timeSlot: 'morning' | 'afternoon' | 'evening'
        startTime: string
        endTime: string
        format: string
        skillLevel: string
        projectedOccupancy: number
        estimatedInterestedMembers: number
        confidence: number
      }
      alternatives?: Array<{
        id: string
        title: string
        dayOfWeek: string
        timeSlot: 'morning' | 'afternoon' | 'evening'
        startTime: string
        endTime: string
        format: string
        skillLevel: string
        projectedOccupancy: number
        estimatedInterestedMembers: number
        confidence: number
      }>
      insights?: string[]
    } | null
    opsSessionDrafts?: Array<{
      id: string
      sourceProposalId: string
      origin: 'primary' | 'alternative'
      state: 'ready_for_ops'
      title: string
      dayOfWeek: string
      timeSlot: 'morning' | 'afternoon' | 'evening'
      startTime: string
      endTime: string
      format: string
      skillLevel: string
      maxPlayers: number
      projectedOccupancy: number
      estimatedInterestedMembers: number
      confidence: number
      note: string
    }> | null
    guestTrialContext?: GuestTrialExecutionContext | null
    referralContext?: ReferralExecutionContext | null
  } | null
  updatedAt: string | Date
  createdAt: string | Date
  conversationId?: string | null
  conversation?: {
    id: string
    title: string | null
  } | null
}

const advisorDraftSections = [
  { key: 'review_ready', label: 'Needs Review' },
  { key: 'sandboxed', label: 'Preview Inbox' },
  { key: 'draft_saved', label: 'Drafts' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'completed', label: 'Recently Applied' },
  { key: 'paused', label: 'Paused' },
  { key: 'stopped', label: 'Stopped' },
] as const

function getAdvisorDraftBucket(status: string) {
  if (status === 'review_ready') return 'review_ready'
  if (status === 'sandboxed') return 'sandboxed'
  if (status === 'draft_saved') return 'draft_saved'
  if (status === 'scheduled') return 'scheduled'
  if (status === 'approved' || status === 'sent') return 'completed'
  if (status === 'snoozed') return 'paused'
  return 'stopped'
}

function formatDraftStatus(status: string) {
  switch (status) {
    case 'review_ready': return 'Review'
    case 'draft_saved': return 'Draft'
    case 'sandboxed': return 'Preview'
    case 'scheduled': return 'Scheduled'
    case 'approved': return 'Applied'
    case 'sent': return 'Sent'
    case 'snoozed': return 'Snoozed'
    case 'declined': return 'Declined'
    case 'blocked': return 'Blocked'
    default: return status
  }
}

function getDraftStatusStyles(status: string) {
  switch (status) {
    case 'review_ready':
      return { background: "rgba(139,92,246,0.14)", color: "#C4B5FD" }
    case 'draft_saved':
      return { background: "rgba(6,182,212,0.14)", color: "#67E8F9" }
    case 'sandboxed':
      return { background: "rgba(244,114,182,0.14)", color: "#F9A8D4" }
    case 'scheduled':
      return { background: "rgba(245,158,11,0.14)", color: "#FCD34D" }
    case 'approved':
    case 'sent':
      return { background: "rgba(16,185,129,0.14)", color: "#86EFAC" }
    case 'snoozed':
      return { background: "rgba(148,163,184,0.14)", color: "#CBD5E1" }
    default:
      return { background: "rgba(239,68,68,0.14)", color: "#FCA5A5" }
  }
}

function formatDraftKind(kind: string) {
  switch (kind) {
    case 'create_campaign': return 'Campaign'
    case 'fill_session': return 'Slot Filler'
    case 'reactivate_members': return 'Reactivation'
    case 'trial_follow_up': return 'Trial Follow-up'
    case 'renewal_reactivation': return 'Renewal Outreach'
    case 'program_schedule': return 'Programming Plan'
    case 'create_cohort': return 'Audience'
    case 'update_contact_policy': return 'Contact Policy'
    case 'update_autonomy_policy': return 'Autopilot Policy'
    case 'update_sandbox_routing': return 'Sandbox Routing'
    case 'update_admin_reminder_routing': return 'Admin Reminder Routing'
    default: return kind.replace(/_/g, ' ')
  }
}

function formatDraftSchedule(value: string | Date | null | undefined, timeZone?: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timeZone || undefined,
  }).format(date)
}

function formatProgrammingValue(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatProgrammingWindow(preview: NonNullable<AdvisorDraftWorkspaceItem['metadata']>['programmingPreview']) {
  if (!preview) return null
  return `${preview.primary.dayOfWeek} · ${preview.primary.startTime}-${preview.primary.endTime} · ${formatProgrammingValue(preview.primary.format)} · ${formatProgrammingValue(preview.primary.skillLevel)}`
}

/* --- Typing Indicator --- */
function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-2 h-2 rounded-full"
          style={{ background: "var(--t4)" }}
          animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}
    </div>
  );
}

/* --- Relative date formatter --- */
function formatRelative(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffMs / 86400000);
  if (diffH < 1) return 'Just now';
  if (diffH < 24) return `${diffH}h ago`;
  if (diffD === 1) return 'Yesterday';
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* --- Extract suggested follow-up questions from <suggested> tags --- */
function extractSuggestions(text: string): { cleanText: string; suggestions: string[] } {
  const match = text.match(/<suggested>\s*([\s\S]*?)\s*<\/suggested>/i);
  if (match) {
    const suggestions = match[1]
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0 && s.length < 80);
    const cleanText = text.replace(/<suggested>[\s\S]*?<\/suggested>/gi, '').trimEnd();
    return { cleanText, suggestions };
  }
  // Incomplete block (during streaming): hide partial <suggested> tag
  const lowerText = text.toLowerCase();
  const partialIdx = lowerText.indexOf('<suggested>');
  if (partialIdx !== -1) {
    return { cleanText: text.slice(0, partialIdx).trimEnd(), suggestions: [] };
  }
  return { cleanText: text, suggestions: [] };
}

/* --- Get text content from a message (parts-first, then content fallback) --- */
function getMessageText(message: { parts?: Array<{ type: string; text?: string }>; content?: string }): string {
  if (message.parts && Array.isArray(message.parts)) {
    const fromParts = message.parts
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('');
    if (fromParts) return fromParts;
  }
  if (typeof message.content === 'string') return message.content;
  return '';
}

function classifySuggestionChip(text: string) {
  const lower = text.toLowerCase();

  if (/\b(approve|send now|launch now|use current audience)\b/.test(lower)) {
    return { tone: "primary" as const, icon: CheckCircle2 };
  }
  if (/\b(email|sms|both)\b/.test(lower)) {
    return { tone: "choice" as const, icon: Send };
  }
  if (/\b(tomorrow|friday|tuesday|today|tonight|\d{1,2}(:\d{2})?\s*(am|pm))\b/.test(lower)) {
    return { tone: "choice" as const, icon: CalendarDays };
  }
  if (/\b(another|other|different|show me)\b/.test(lower)) {
    return { tone: "ghost" as const, icon: ChevronRight };
  }

  return { tone: "default" as const, icon: Sparkles };
}

type PendingClarification = {
  action: 'create_cohort' | 'draft_campaign' | 'fill_session' | 'reactivate_members'
  field: 'audience' | 'audience_mode' | 'channel' | 'schedule' | 'session'
  question: string
  options: string[]
  sessionOptions?: Array<{
    id: string
    title: string
    date: string
    startTime: string
    endTime?: string | null
    court?: string | null
    format?: string | null
    spotsRemaining?: number
  }>
}

function getPendingClarification(metadata: unknown): PendingClarification | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const advisorState = (metadata as any).advisorState;
  const pending = advisorState?.pendingClarification;
  if (!pending || typeof pending !== 'object') return null;
  if (typeof pending.question !== 'string' || !Array.isArray(pending.options)) return null;
  return pending as PendingClarification;
}

function getClarificationDraft(field: PendingClarification['field']) {
  if (field === 'audience' || field === 'audience_mode') return 'Target members who ';
  if (field === 'schedule') return 'Send it ';
  if (field === 'session') return 'Fill the ';
  return '';
}

type ClarificationTone = 'primary' | 'choice' | 'default' | 'ghost'

type ClarificationChoice = {
  value: string
  label: string
  description: string
  impact: string
  icon: typeof Sparkles
  tone: ClarificationTone
  recommended?: boolean
  whyRecommended?: string
  badges?: string[]
}

function getClarificationSectionTitle(field: PendingClarification['field']) {
  if (field === 'audience_mode') return 'Audience Source'
  if (field === 'audience') return 'Audience Brief'
  if (field === 'channel') return 'Delivery Channel'
  if (field === 'schedule') return 'Send Timing'
  return 'Session Match'
}

function getClarificationOptionUi(field: PendingClarification['field'], option: string) {
  const lower = option.toLowerCase();

  if (field === 'channel') {
    if (lower.includes('sms')) return { icon: Send, tone: 'choice' as const };
    if (lower.includes('email')) return { icon: Mail, tone: 'primary' as const };
  }

  if (field === 'schedule' || /\b(today|tomorrow|friday|tuesday|tonight|\d{1,2}(:\d{2})?\s*(am|pm))\b/.test(lower)) {
    return { icon: CalendarDays, tone: 'choice' as const };
  }

  if (field === 'audience' || field === 'audience_mode') {
    if (lower.includes('current audience') || lower.includes('текущ') || lower.includes('actual')) {
      return { icon: CheckCircle2, tone: 'primary' as const };
    }
    return { icon: Users, tone: 'default' as const };
  }

  if (field === 'session') {
    return { icon: CalendarDays, tone: 'default' as const };
  }

  return { icon: Sparkles, tone: 'default' as const };
}

function getClarificationOptionStyles(tone: ClarificationTone) {
  if (tone === 'primary') {
    return {
      background: "linear-gradient(135deg, rgba(139,92,246,0.18), rgba(6,182,212,0.16))",
      border: "1px solid rgba(139,92,246,0.28)",
      color: "var(--heading)",
    };
  }
  if (tone === 'choice') {
    return {
      background: "rgba(6,182,212,0.08)",
      border: "1px solid rgba(6,182,212,0.22)",
      color: "var(--t2)",
    };
  }
  if (tone === 'ghost') {
    return {
      background: "rgba(148,163,184,0.08)",
      border: "1px solid rgba(148,163,184,0.18)",
      color: "var(--t2)",
    };
  }
  return {
    background: "rgba(139,92,246,0.08)",
    border: "1px solid rgba(139,92,246,0.2)",
    color: "var(--t2)",
  };
}

function describeAudienceOption(option: string) {
  const lower = option.toLowerCase()
  if (lower.includes('inactive') || lower.includes('неактив') || lower.includes('inactiv')) {
    return 'Focus on members who have recently cooled off and need a win-back nudge.'
  }
  if (lower.includes('weekday evening') || lower.includes('будня') || lower.includes('entre semana')) {
    return 'Useful when you want to fill after-work sessions with your most relevant players.'
  }
  if (lower.includes('55') || lower.includes('женщ') || lower.includes('mujeres')) {
    return 'A narrower segment the agent can build directly into a campaign or audience.'
  }
  return 'Use this as a ready-made audience brief and let the agent keep going.'
}

function describeScheduleOption(option: string) {
  const lower = option.toLowerCase()
  if (lower.includes('6pm') || lower.includes('18:00')) {
    return 'A strong after-work send window for most outreach.'
  }
  if (lower.includes('9am') || lower.includes('9 утра')) {
    return 'A morning delivery window that is good for inbox visibility.'
  }
  if (lower.includes('tuesday') || lower.includes('вторник') || lower.includes('martes')) {
    return 'Queue a timed send and let the agent handle delivery later.'
  }
  return 'Use this time window and let the platform schedule it.'
}

function buildClarificationChoices(pending: PendingClarification): ClarificationChoice[] {
  return pending.options.map((option, index) => {
    const lower = option.toLowerCase()
    const optionUi = getClarificationOptionUi(pending.field, option)

    if (pending.field === 'audience_mode') {
      const isCurrent = lower.includes('current audience') || lower.includes('текущ') || lower.includes('actual')
      return {
        value: option,
        label: isCurrent ? 'Use current audience' : option,
        description: isCurrent
          ? 'Fastest path: reuse the audience already in context and move straight into execution.'
          : 'Switch to a fresh audience brief and let the agent rebuild the targeting.',
        impact: isCurrent
          ? 'Keeps the current targeting context and avoids rebuilding the audience from scratch.'
          : 'Replaces the current audience context and makes the agent rebuild targeting before it continues.',
        icon: isCurrent ? CheckCircle2 : Users,
        tone: isCurrent ? 'primary' : 'default',
        recommended: isCurrent,
        whyRecommended: isCurrent ? 'The agent already has this audience in memory, so this removes one extra step.' : undefined,
        badges: isCurrent ? ['Fastest path', 'Keeps context'] : ['New targeting'],
      }
    }

    if (pending.field === 'channel') {
      if (lower.includes('both')) {
        return {
          value: option,
          label: 'Email + SMS',
          description: 'Maximize reach across both channels when the campaign matters most.',
          impact: 'Broadest reach, but guardrails may split delivery per member depending on channel eligibility.',
          icon: Send,
          tone: 'choice',
          badges: ['Max reach'],
        }
      }
      if (lower.includes('sms')) {
        return {
          value: option,
          label: 'SMS',
          description: 'Best for urgent nudges and fast visibility on mobile.',
          impact: 'Pushes the agent toward shorter copy and only members with phone + SMS consent stay eligible.',
          icon: Send,
          tone: 'choice',
          badges: ['Urgent', 'Mobile first'],
        }
      }
      return {
        value: option,
        label: 'Email',
        description: 'Best for richer copy, lower friction, and a more detailed message.',
        impact: 'Keeps the campaign in a safer long-form channel and targets email-eligible members first.',
        icon: Mail,
        tone: 'primary',
        recommended: true,
        whyRecommended: 'Email is usually the lowest-risk default when the user has not explicitly asked for SMS.',
        badges: ['Safer default', 'Richer copy'],
      }
    }

    if (pending.field === 'schedule') {
      return {
        value: option,
        label: option,
        description: describeScheduleOption(option),
        impact: 'Queues the campaign for later instead of sending immediately, so the agent can respect timing and guardrails.',
        icon: CalendarDays,
        tone: index === 0 ? 'primary' : 'choice',
        recommended: index === 0,
        whyRecommended: index === 0 ? 'This is the quickest suggested send window so the draft can move forward without more back-and-forth.' : undefined,
        badges: index === 0 ? ['Fastest schedule', 'Keeps momentum'] : ['Scheduled send'],
      }
    }

    if (pending.field === 'audience') {
      return {
        value: option,
        label: option,
        description: describeAudienceOption(option),
        impact: lower.includes('inactive') || lower.includes('неактив') || lower.includes('inactiv')
          ? 'Pushes the agent toward win-back logic and member health signals.'
          : lower.includes('weekday evening') || lower.includes('будня') || lower.includes('entre semana')
            ? 'Re-centers the plan around after-work demand and likely session-fit members.'
            : 'Narrows the segment so the agent can produce a more specific audience or campaign next.',
        icon: Users,
        tone: index === 0 ? 'primary' : optionUi.tone,
        recommended: index === 0,
        whyRecommended: index === 0 ? 'This is the cleanest audience brief to keep the conversation moving.' : undefined,
        badges: index === 0 ? ['Fastest brief'] : ['Narrower segment'],
      }
    }

    return {
      value: option,
      label: option,
      description: 'Use this option and let the agent keep moving.',
      impact: 'The agent will continue with this choice as the next operational step.',
      icon: optionUi.icon,
      tone: optionUi.tone,
      badges: ['Continue'],
    }
  })
}

function AdvisorClarificationCard({
  pending,
  onSelect,
  onDraft,
}: {
  pending: PendingClarification
  onSelect: (value: string) => void
  onDraft: (value: string) => void
}) {
  const draftSeed = getClarificationDraft(pending.field);
  const choices = buildClarificationChoices(pending);
  const sectionTitle = getClarificationSectionTitle(pending.field);
  const customCtaLabel = pending.field === 'audience' || pending.field === 'audience_mode'
    ? 'Type custom audience'
    : pending.field === 'schedule'
      ? 'Type custom time'
      : pending.field === 'session'
        ? 'Type custom session'
        : 'Type custom answer'

  return (
    <div
      className="mt-3 rounded-2xl p-4"
      style={{
        background: "rgba(6,182,212,0.06)",
        border: "1px solid rgba(6,182,212,0.18)",
      }}
    >
      <div className="text-[11px] uppercase tracking-[0.12em]" style={{ color: "#06B6D4", fontWeight: 700 }}>
        Decision Card
      </div>
      <div className="text-sm mt-1" style={{ fontWeight: 700, color: "var(--heading)" }}>
        {pending.question}
      </div>
      <p className="text-xs mt-2" style={{ color: "var(--t3)", lineHeight: 1.6 }}>
        Pick the fastest path below, or switch to a custom instruction when you want something more specific.
      </p>
      <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full mt-3 text-[11px]" style={{ background: "rgba(6,182,212,0.10)", color: "#0891B2", fontWeight: 700 }}>
        <Sparkles className="w-3.5 h-3.5" />
        {sectionTitle}
      </div>

      {pending.field === 'session' && pending.sessionOptions?.length ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
          {pending.sessionOptions.map((session, index) => (
            <button
              key={session.id}
              onClick={() => onSelect(`${session.date} ${session.startTime} ${session.title}`)}
              className="text-left rounded-xl p-3 transition-all hover:scale-[1.01]"
              style={{
                background: "var(--subtle)",
                border: "1px solid var(--card-border)",
              }}
            >
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2" style={{ color: "var(--t3)", fontWeight: 600 }}>
                <CalendarDays className="w-3.5 h-3.5" />
                Session option
                </div>
                {index === 0 && (
                  <span
                    className="px-2 py-1 rounded-full text-[10px]"
                    style={{ background: "rgba(139,92,246,0.14)", color: "#C4B5FD", fontWeight: 700 }}
                  >
                    Best match
                  </span>
                )}
              </div>
              <div className="text-sm mt-2" style={{ color: "var(--heading)", fontWeight: 700 }}>
                {session.title}
              </div>
              <div className="text-xs mt-1" style={{ color: "var(--t3)" }}>
                {session.date} · {session.startTime}{session.endTime ? `-${session.endTime}` : ''}
              </div>
              <div className="text-xs mt-1" style={{ color: "var(--t2)" }}>
                {[session.court, session.format, typeof session.spotsRemaining === 'number' ? `${session.spotsRemaining} spots left` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
              <div
                className="mt-3 rounded-lg px-2.5 py-2 text-[11px]"
                style={{ background: "rgba(255,255,255,0.05)", color: "var(--t3)", lineHeight: 1.5 }}
              >
                {index === 0
                  ? 'Why recommended: this is the best current match for the request and available capacity.'
                  : 'Alternative path: use this if you want to steer the agent toward a different session option.'}
              </div>
              <div className="text-[11px] mt-3 flex items-center gap-1.5" style={{ color: "#06B6D4", fontWeight: 700 }}>
                Select this session
                <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
          {choices.map((choice) => {
            const OptionIcon = choice.icon;
            return (
              <button
                key={choice.value}
                onClick={() => onSelect(choice.value)}
                className="text-left rounded-xl p-3 transition-all hover:scale-[1.01]"
                style={{
                  ...getClarificationOptionStyles(choice.tone),
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: "rgba(255,255,255,0.08)", color: "var(--heading)" }}
                    >
                      <OptionIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm" style={{ color: "var(--heading)", fontWeight: 700 }}>
                        {choice.label}
                      </div>
                      <div className="text-xs mt-1" style={{ color: "var(--t3)", lineHeight: 1.5 }}>
                        {choice.description}
                      </div>
                      <div
                        className="mt-2 rounded-lg px-2.5 py-2 text-[11px]"
                        style={{ background: "rgba(255,255,255,0.05)", color: "var(--t2)", lineHeight: 1.5 }}
                      >
                        What changes: {choice.impact}
                      </div>
                      {choice.whyRecommended && (
                        <div className="text-[11px] mt-2" style={{ color: "#06B6D4", fontWeight: 700, lineHeight: 1.5 }}>
                          Why recommended: {choice.whyRecommended}
                        </div>
                      )}
                      {choice.badges && choice.badges.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {choice.badges.map((badge) => (
                            <span
                              key={badge}
                              className="px-2 py-1 rounded-full text-[10px]"
                              style={{ background: "rgba(255,255,255,0.06)", color: "var(--t3)", fontWeight: 700 }}
                            >
                              {badge}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  {choice.recommended && (
                    <span
                      className="px-2 py-1 rounded-full text-[10px] shrink-0"
                      style={{ background: "rgba(139,92,246,0.14)", color: "#C4B5FD", fontWeight: 700 }}
                    >
                      Fastest
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mt-3">
        {pending.field === 'session' && (
          <button
            onClick={() => onDraft('Pick another session for me.')}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
            style={{
              background: "rgba(139,92,246,0.08)",
              border: "1px solid rgba(139,92,246,0.18)",
              color: "var(--t2)",
              fontWeight: 600,
            }}
          >
            <ChevronRight className="w-3.5 h-3.5" />
            Pick another session
          </button>
        )}
        <button
          onClick={() => onDraft(draftSeed)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
          style={{
            background: "rgba(148,163,184,0.08)",
            border: "1px solid rgba(148,163,184,0.18)",
            color: "var(--t2)",
            fontWeight: 600,
          }}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          {customCtaLabel}
        </button>
      </div>
    </div>
  );
}

/* ============================================= */
/*       AI ADVISOR PAGE — useChat() version      */
/* ============================================= */
export function AdvisorIQ({ clubId }: { clubId: string }) {
  const { isDark } = useTheme();
  const searchParams = useSearchParams();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  // /api/ai/advisor-action goes OUTSIDE useChat's streaming flow (plain
  // POST → JSON), so `status` from useChat doesn't flip to 'submitted'
  // while we're waiting. Without this local flag the typing indicator
  // never shows and the composer stays enabled — suggested prompt chips
  // feel unresponsive (the call can take 30-70s on a cold planner).
  const [advisorActionPending, setAdvisorActionPending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const {
    data: advisorDrafts = [],
    isLoading: isDraftsLoading,
    refetch: refetchAdvisorDrafts,
  } = useAdvisorDrafts(clubId, 24);

  // Track conversation ID from API response without re-creating transport mid-stream
  const convIdRef = useRef<string | null>(null);
  const pendingConvIdRef = useRef<string | null>(null);
  const loadFromDbRef = useRef(false);
  const appliedPromptRef = useRef<string | null>(null);
  const pendingGuestTrialContextRef = useRef<GuestTrialExecutionContext | null>(null);
  const pendingReferralContextRef = useRef<ReferralExecutionContext | null>(null);
  convIdRef.current = conversationId;

  // Build transport (memoized on clubId)
  const transport = useMemo(() => {
    return new DefaultChatTransport({
      api: '/api/ai/chat',
      body: { clubId },
      fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
        // Inject current conversationId from ref
        if (init?.body) {
          try {
            const bodyObj = JSON.parse(init.body as string);
            bodyObj.conversationId = convIdRef.current;
            init = { ...init, body: JSON.stringify(bodyObj) };
          } catch { /* keep original body */ }
        }
        const response = await globalThis.fetch(url, init);
        const newConvId = response.headers.get('X-Conversation-Id');
        if (newConvId && !convIdRef.current) {
          pendingConvIdRef.current = newConvId;
        }
        return response;
      },
    });
  }, [clubId]); // eslint-disable-line react-hooks/exhaustive-deps

  const {
    messages,
    sendMessage,
    status,
    error,
    setMessages,
  } = useChat({ transport });

  // Combines useChat streaming status with the out-of-band advisor-action
  // POST so every place that cares about "AI is working" (send button
  // disabled, typing indicator, suggestions hidden) stays truthful.
  const isBusy = status === 'submitted' || status === 'streaming' || advisorActionPending;

  const refreshConversations = useCallback(() => {
    fetch(`/api/ai/conversations?clubId=${clubId}`)
      .then(r => r.ok ? r.json() : { conversations: [] })
      .then(data => setConversations(data.conversations || []))
      .catch(() => {});
  }, [clubId]);

  const deleteConversation = trpc.intelligence.deleteConversation.useMutation({
    onSuccess: (_result, variables) => {
      setConversations((prev) => prev.filter((conv) => conv.id !== variables.conversationId));
      if (activeConvId === variables.conversationId) {
        setActiveConvId(null);
        setConversationId(null);
        setMessages([]);
      }
    },
  });

  // Apply pending conversation ID after streaming ends
  useEffect(() => {
    if (!isBusy && pendingConvIdRef.current) {
      setConversationId(pendingConvIdRef.current);
      setActiveConvId(pendingConvIdRef.current);
      pendingConvIdRef.current = null;
      refreshConversations();
    }
  }, [isBusy, refreshConversations]);

  // Load conversation list on mount
  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  useEffect(() => {
    const prompt = searchParams.get('prompt');
    if (!prompt) return;
    if (appliedPromptRef.current === prompt) return;

    appliedPromptRef.current = prompt;
    setInputValue(prompt);

    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, [searchParams]);

  useEffect(() => {
    pendingGuestTrialContextRef.current = parseGuestTrialExecutionContext(
      searchParams.get('guestTrialContext'),
    );
    pendingReferralContextRef.current = parseReferralExecutionContext(
      searchParams.get('referralContext'),
    );
  }, [searchParams]);

  // Load a specific conversation's messages from DB
  const loadConversation = useCallback(async (convId: string) => {
    try {
      const res = await fetch(`/api/ai/conversations/${convId}/messages`);
      if (!res.ok) return;
      const data = await res.json();
      setMessages(
        (data.messages || [])
          .filter((m: any) => m.role !== 'system')
          .map((m: any) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            parts: [{ type: 'text' as const, text: m.content }],
              createdAt: new Date(m.createdAt),
              metadata: m.metadata ?? undefined,
            }))
      );
      setConversationId(convId);
      setActiveConvId(convId);
    } catch { /* ignore */ }
  }, [setMessages]);

  useEffect(() => {
    const requestedConversationId = searchParams.get('conversationId');
    if (!requestedConversationId) return;
    if (requestedConversationId === activeConvId) return;
    void loadConversation(requestedConversationId);
  }, [activeConvId, loadConversation, searchParams]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isBusy]);

  const startNewChat = useCallback(() => {
    setActiveConvId(null);
    setConversationId(null);
    setMessages([]);
    setInputValue("");
    inputRef.current?.focus();
  }, [setMessages]);

  const handleSend = useCallback(async (text?: string) => {
    const msg = text || inputValue.trim();
    if (!msg || isBusy) return;
    setInputValue("");

    // Optimistic UI: push the user's message immediately so the typing
    // indicator + bubble show up the moment the chip/Send is clicked.
    // /api/ai/advisor-action can take tens of seconds on a cold planner —
    // without this, the whole page looks frozen and users click the chip
    // a second time assuming nothing happened.
    const optimisticUserMsgId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      {
        id: optimisticUserMsgId,
        role: 'user',
        parts: [{ type: 'text' as const, text: msg }],
        createdAt: new Date(),
      },
    ]);
    setAdvisorActionPending(true);

    try {
      const response = await fetch('/api/ai/advisor-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clubId,
          message: msg,
          conversationId: convIdRef.current,
          guestTrialContext: pendingGuestTrialContextRef.current,
          referralContext: pendingReferralContextRef.current,
        }),
      });

      if (response.ok) {
        const payload = await response.json();
        if (payload?.handled) {
          pendingGuestTrialContextRef.current = null;
          pendingReferralContextRef.current = null;
          const nextConvId = payload.conversationId || convIdRef.current;
          if (nextConvId) {
            setConversationId(nextConvId);
            setActiveConvId(nextConvId);
          }

          // User message already optimistically added — only append the
          // assistant reply so we don't duplicate.
          setMessages((prev) => [
            ...prev,
            {
              id: payload.assistantMessageId || crypto.randomUUID(),
              role: 'assistant',
              parts: [{ type: 'text' as const, text: payload.assistantMessage }],
              createdAt: new Date(),
              metadata: payload.assistantMetadata ?? undefined,
            },
          ]);
          void refetchAdvisorDrafts();
          refreshConversations();
          setAdvisorActionPending(false);
          return;
        }
      }
    } catch {
      // Fall through to normal chat flow
    } finally {
      // Always clear the local pending flag — useChat.sendMessage below
      // will own the busy state from that point forward.
      setAdvisorActionPending(false);
    }

    // Fallback to the useChat stream path. Drop the optimistic user
    // message first — useChat appends its own, and duplicates would
    // leak into the DB conversation history on save.
    setMessages((prev) => prev.filter((m) => m.id !== optimisticUserMsgId));
    pendingGuestTrialContextRef.current = null;
    sendMessage({ text: msg });
  }, [clubId, inputValue, isBusy, refetchAdvisorDrafts, refreshConversations, sendMessage, setMessages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSend();
  };

  const draftIntoComposer = useCallback((text: string) => {
    setInputValue(text);
    inputRef.current?.focus();
  }, []);

  const groupedDrafts = useMemo(() => {
    const buckets = new Map<string, AdvisorDraftWorkspaceItem[]>()
    advisorDraftSections.forEach((section) => buckets.set(section.key, []))

    for (const draft of advisorDrafts as AdvisorDraftWorkspaceItem[]) {
      if (draft.kind === 'program_schedule') continue
      const bucket = getAdvisorDraftBucket(draft.status)
      buckets.get(bucket)?.push(draft)
    }

    return advisorDraftSections
      .map((section) => ({
        ...section,
        drafts: buckets.get(section.key) || [],
      }))
      .filter((section) => section.drafts.length > 0)
  }, [advisorDrafts]);

  const programmingDrafts = useMemo(
    () => (advisorDrafts as AdvisorDraftWorkspaceItem[]).filter((draft) => draft.kind === 'program_schedule').slice(0, 4),
    [advisorDrafts],
  );

  const openDraftWorkspaceItem = useCallback((draft: AdvisorDraftWorkspaceItem) => {
    if (draft.conversationId) {
      void loadConversation(draft.conversationId)
      return
    }

    startNewChat()
    if (draft.originalIntent) {
      draftIntoComposer(draft.originalIntent)
    }
  }, [draftIntoComposer, loadConversation, startNewChat]);

  return (
    <div className="flex gap-6 max-w-[1400px] mx-auto" style={{ height: "calc(100vh - 112px)" }}>
      {/* Left Sidebar — Chat History */}
      <div className="hidden lg:flex flex-col w-64 shrink-0 rounded-2xl overflow-hidden" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", backdropFilter: "var(--glass-blur)" }}>
        <div className="flex items-center justify-between px-4 py-4 shrink-0" style={{ borderBottom: "1px solid var(--divider)" }}>
          <h3 style={{ fontSize: "13px", fontWeight: 700, color: "var(--heading)" }}>Conversations</h3>
          <button
            onClick={startNewChat}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] transition-colors"
            style={{ background: "var(--subtle)", color: "var(--t3)", fontWeight: 500 }}
          >
            <Plus className="w-3 h-3" /> New
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-4">
          <div className="space-y-1">
            {conversations.length === 0 && (
              <div className="text-center py-8 text-[11px]" style={{ color: "var(--t4)" }}>
                No conversations yet
              </div>
            )}
            {conversations.map((conv) => {
              const isActive = activeConvId === conv.id;
              return (
                <div
                  key={conv.id}
                  className="group rounded-xl transition-all"
                  style={{
                    background: isActive ? (isDark ? "rgba(139,92,246,0.08)" : "rgba(139,92,246,0.04)") : "transparent",
                    border: isActive ? "1px solid rgba(139,92,246,0.2)" : "1px solid transparent",
                  }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "var(--hover)"; }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                >
                  <div className="flex items-start gap-1 px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => loadConversation(conv.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="text-xs truncate" style={{ fontWeight: isActive ? 600 : 500, color: isActive ? "var(--heading)" : "var(--t2)" }}>
                        {conv.title || 'New conversation'}
                      </div>
                      <div className="text-[10px] mt-0.5" style={{ color: "var(--t4)" }}>{formatRelative(conv.updatedAt)}</div>
                    </button>
                    <button
                      type="button"
                      aria-label="Delete conversation"
                      disabled={deleteConversation.isPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteConversation.mutate({ conversationId: conv.id });
                      }}
                      className="mt-0.5 rounded-lg p-1 opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-40"
                      style={{ color: "var(--t4)" }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-3" style={{ borderTop: "1px solid var(--divider)" }}>
            <div className="flex items-center justify-between px-2 pb-2">
              <div>
                <h4 style={{ fontSize: "12px", fontWeight: 700, color: "var(--heading)" }}>Agent Drafts</h4>
                <div className="text-[10px]" style={{ color: "var(--t4)" }}>
                  {advisorDrafts.length} records in the agent workspace
                </div>
              </div>
              <button
                onClick={() => void refetchAdvisorDrafts()}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] transition-colors"
                style={{ background: "var(--subtle)", color: "var(--t3)", fontWeight: 600 }}
              >
                <RotateCcw className="w-3 h-3" />
                Refresh
              </button>
            </div>

            {isDraftsLoading && (
              <div className="px-2 py-4 text-[11px]" style={{ color: "var(--t4)" }}>
                Loading draft workspace…
              </div>
            )}

            {!isDraftsLoading && groupedDrafts.length === 0 && (
              <div className="px-2 py-4 text-[11px]" style={{ color: "var(--t4)" }}>
                No agent drafts yet
              </div>
            )}

            <div className="space-y-3">
              {programmingDrafts.length > 0 && (
                <div>
                  <div className="px-2 pb-1 text-[10px] uppercase tracking-[0.12em]" style={{ color: "#A78BFA", fontWeight: 700 }}>
                    Programming Drafts
                  </div>
                  <div className="space-y-2">
                    {programmingDrafts.map((draft) => {
                      const preview = draft.metadata?.programmingPreview || null
                      const opsSessionDrafts = draft.metadata?.opsSessionDrafts || []
                      const statusStyles = getDraftStatusStyles(draft.status)
                      const isDraftActive = Boolean(draft.conversationId && draft.conversationId === activeConvId)
                      const previewWindow = formatProgrammingWindow(preview || null)

                      return (
                        <button
                          key={`programming-${draft.id}`}
                          onClick={() => openDraftWorkspaceItem(draft)}
                          className="w-full text-left px-3 py-3 rounded-xl transition-all"
                          style={{
                            background: isDraftActive ? (isDark ? "rgba(139,92,246,0.10)" : "rgba(139,92,246,0.05)") : "rgba(139,92,246,0.05)",
                            border: isDraftActive ? "1px solid rgba(139,92,246,0.26)" : "1px solid rgba(139,92,246,0.12)",
                          }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-[11px]" style={{ color: "#C4B5FD", fontWeight: 700 }}>
                                Draft-first schedule plan
                              </div>
                              <div className="text-xs mt-1 truncate" style={{ color: "var(--heading)", fontWeight: 700 }}>
                                {preview?.primary.title || draft.title}
                              </div>
                            </div>
                            <span
                              className="px-2 py-1 rounded-full text-[10px] shrink-0"
                              style={{ ...statusStyles, fontWeight: 700 }}
                            >
                              {formatDraftStatus(draft.status)}
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-1.5 mt-2">
                            <span
                              className="px-2 py-1 rounded-full text-[10px]"
                              style={{ background: "rgba(139,92,246,0.16)", color: "#DDD6FE", fontWeight: 700 }}
                            >
                              {preview ? `${1 + (preview.alternatives?.length || 0)} ideas` : 'Programming'}
                            </span>
                            {draft.selectedPlan === 'recommended' && (
                              <span
                                className="px-2 py-1 rounded-full text-[10px]"
                                style={{ background: "rgba(6,182,212,0.12)", color: "#67E8F9", fontWeight: 700 }}
                              >
                                Agent plan
                              </span>
                            )}
                            <span
                              className="px-2 py-1 rounded-full text-[10px]"
                              style={{ background: "rgba(245,158,11,0.12)", color: "#FCD34D", fontWeight: 700 }}
                            >
                              Draft only
                            </span>
                            {opsSessionDrafts.length > 0 && (
                              <span
                                className="px-2 py-1 rounded-full text-[10px]"
                                style={{ background: "rgba(16,185,129,0.12)", color: "#86EFAC", fontWeight: 700 }}
                              >
                                {opsSessionDrafts.length} ops ready
                              </span>
                            )}
                          </div>

                          {previewWindow && (
                            <div className="text-[11px] mt-2" style={{ color: "var(--t3)", lineHeight: 1.5 }}>
                              {previewWindow}
                            </div>
                          )}

                          {preview && (
                            <div
                              className="mt-2 rounded-lg px-2.5 py-2 text-[11px]"
                              style={{ background: "rgba(255,255,255,0.04)", color: "var(--t2)", lineHeight: 1.5 }}
                            >
                              <div style={{ fontWeight: 700, color: "var(--heading)" }}>
                                Programming preview
                              </div>
                              <div className="mt-1">
                                {preview.primary.projectedOccupancy}% projected fill · {preview.primary.estimatedInterestedMembers} likely players · {preview.primary.confidence}/100 confidence
                              </div>
                              {opsSessionDrafts.length > 0 && (
                                <div className="mt-1" style={{ color: "#67E8F9" }}>
                                  {opsSessionDrafts.length} internal ops draft{opsSessionDrafts.length === 1 ? '' : 's'} ready for scheduling review.
                                </div>
                              )}
                              {preview.insights?.[0] && (
                                <div className="mt-1" style={{ color: "var(--t3)" }}>
                                  {preview.insights[0]}
                                </div>
                              )}
                            </div>
                          )}

                          <div className="flex items-center justify-between mt-2 text-[10px]" style={{ color: "var(--t4)" }}>
                            <span>{draft.conversation?.title || 'Open in Advisor'}</span>
                            <span>{formatRelative(String(draft.updatedAt))}</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {groupedDrafts.map((section) => (
                <div key={section.key}>
                  <div className="px-2 pb-1 text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--t4)", fontWeight: 700 }}>
                    {section.label}
                  </div>
                  <div className="space-y-1">
                    {section.drafts.map((draft) => {
                      const statusStyles = getDraftStatusStyles(draft.status)
                      const scheduleLabel = formatDraftSchedule(draft.scheduledFor, draft.timeZone)
                      const isDraftActive = Boolean(draft.conversationId && draft.conversationId === activeConvId)
                      const sandboxPreview = draft.metadata?.sandboxPreview || null
                      const sandboxRecipients = sandboxPreview?.recipients || []
                      const programmingPreview = draft.metadata?.programmingPreview || null
                      const opsSessionDrafts = draft.metadata?.opsSessionDrafts || []
                      const guestTrialContext = parseGuestTrialExecutionContext(draft.metadata?.guestTrialContext || null)
                      const guestTrialWorkspaceSummary = formatGuestTrialWorkspaceSummary(guestTrialContext)
                      const referralContext = parseReferralExecutionContext(draft.metadata?.referralContext || null)
                      const referralWorkspaceSummary = formatReferralWorkspaceSummary(referralContext)
                      const programmingWindow = formatProgrammingWindow(programmingPreview || null)
                      const sandboxSummary = draft.status === 'sandboxed'
                        ? `${sandboxPreview?.recipientCount || 0} eligible${sandboxPreview?.skippedCount ? `, ${sandboxPreview.skippedCount} skipped` : ''}`
                        : null

                      return (
                        <button
                          key={draft.id}
                          onClick={() => openDraftWorkspaceItem(draft)}
                          className="w-full text-left px-3 py-2.5 rounded-xl transition-all"
                          style={{
                            background: isDraftActive ? (isDark ? "rgba(6,182,212,0.08)" : "rgba(6,182,212,0.05)") : "var(--subtle)",
                            border: isDraftActive ? "1px solid rgba(6,182,212,0.22)" : "1px solid var(--card-border)",
                          }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-[11px]" style={{ color: "var(--t4)", fontWeight: 700 }}>
                                {formatDraftKind(draft.kind)}
                              </div>
                              <div className="text-xs truncate mt-0.5" style={{ color: "var(--heading)", fontWeight: 700 }}>
                                {draft.title}
                              </div>
                            </div>
                            <span
                              className="px-2 py-1 rounded-full text-[10px] shrink-0"
                              style={{ ...statusStyles, fontWeight: 700 }}
                            >
                              {formatDraftStatus(draft.status)}
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {draft.selectedPlan === 'recommended' && (
                              <span
                                className="px-2 py-1 rounded-full text-[10px]"
                                style={{ background: "rgba(139,92,246,0.12)", color: "#C4B5FD", fontWeight: 700 }}
                              >
                                Agent plan
                              </span>
                            )}
                            {draft.sandboxMode && (
                              <span
                                className="px-2 py-1 rounded-full text-[10px]"
                                style={{ background: "rgba(245,158,11,0.12)", color: "#FCD34D", fontWeight: 700 }}
                              >
                                Sandbox
                              </span>
                            )}
                            {guestTrialWorkspaceSummary && (
                              <>
                                <span
                                  className="px-2 py-1 rounded-full text-[10px]"
                                  style={{ background: "rgba(6,182,212,0.12)", color: "#67E8F9", fontWeight: 700 }}
                                >
                                  {guestTrialWorkspaceSummary.stage}
                                </span>
                                <span
                                  className="px-2 py-1 rounded-full text-[10px]"
                                  style={{ background: "rgba(255,255,255,0.06)", color: "var(--t2)" }}
                                >
                                  {guestTrialWorkspaceSummary.detail}
                                </span>
                              </>
                            )}
                            {referralWorkspaceSummary && (
                              <>
                                <span
                                  className="px-2 py-1 rounded-full text-[10px]"
                                  style={{ background: "rgba(245,158,11,0.12)", color: "#FCD34D", fontWeight: 700 }}
                                >
                                  {referralWorkspaceSummary.lane}
                                </span>
                                <span
                                  className="px-2 py-1 rounded-full text-[10px]"
                                  style={{ background: "rgba(245,158,11,0.10)", color: "#FDE68A", fontWeight: 700 }}
                                >
                                  {referralWorkspaceSummary.detail}
                                </span>
                              </>
                            )}
                          </div>

                          {(draft.summary || scheduleLabel) && (
                            <div className="text-[11px] mt-2" style={{ color: "var(--t3)", lineHeight: 1.5 }}>
                              {draft.summary || (scheduleLabel ? `Scheduled for ${scheduleLabel}` : '')}
                            </div>
                          )}

                          {sandboxSummary && (
                            <div
                              className="mt-2 rounded-lg px-2.5 py-2 text-[11px]"
                              style={{ background: "rgba(244,114,182,0.08)", color: "var(--t2)", lineHeight: 1.5 }}
                            >
                              <div style={{ fontWeight: 700, color: "var(--heading)" }}>
                                Sandbox preview
                              </div>
                              <div className="mt-1">
                                {sandboxSummary}
                                {sandboxPreview?.scheduledLabel ? ` · ${sandboxPreview.scheduledLabel}` : ''}
                              </div>
                              {sandboxRecipients.length > 0 && (
                                <div className="mt-1" style={{ color: "var(--t3)" }}>
                                  {sandboxRecipients.slice(0, 3).map((recipient) => recipient.name).join(', ')}
                                  {sandboxPreview?.recipientCount && sandboxPreview.recipientCount > 3
                                    ? ` +${sandboxPreview.recipientCount - 3} more`
                                    : ''}
                                </div>
                              )}
                            </div>
                          )}

                          {!sandboxSummary && draft.kind === 'program_schedule' && programmingPreview && (
                            <div
                              className="mt-2 rounded-lg px-2.5 py-2 text-[11px]"
                              style={{ background: "rgba(139,92,246,0.08)", color: "var(--t2)", lineHeight: 1.5 }}
                            >
                              <div style={{ fontWeight: 700, color: "var(--heading)" }}>
                                Draft preview
                              </div>
                              <div className="mt-1">
                                {programmingPreview.primary.title}
                                {programmingWindow ? ` · ${programmingWindow}` : ''}
                              </div>
                              <div className="mt-1" style={{ color: "var(--t3)" }}>
                                {programmingPreview.primary.projectedOccupancy}% projected fill · {programmingPreview.primary.estimatedInterestedMembers} likely players
                                {programmingPreview.alternatives?.length ? ` · +${programmingPreview.alternatives.length} alternatives` : ''}
                              </div>
                              {opsSessionDrafts.length > 0 && (
                                <div className="mt-1" style={{ color: "#67E8F9" }}>
                                  {opsSessionDrafts.length} internal ops draft{opsSessionDrafts.length === 1 ? '' : 's'} ready for the club ops team
                                </div>
                              )}
                            </div>
                          )}

                          <div className="flex items-center justify-between mt-2 text-[10px]" style={{ color: "var(--t4)" }}>
                            <span>{draft.conversation?.title || 'Open in Advisor'}</span>
                            <span>{formatRelative(String(draft.updatedAt))}</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main Chat */}
      <div className="flex-1 flex flex-col rounded-2xl overflow-hidden" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", backdropFilter: "var(--glass-blur)" }}>
        {/* Chat Header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: "1px solid var(--divider)" }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #8B5CF6, #06B6D4)", boxShadow: "0 4px 15px rgba(139, 92, 246, 0.3)" }}>
              <Brain className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--heading)" }}>AI Advisor</h2>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-[11px]" style={{ color: "var(--t3)" }}>Analyzing your club data in real-time</span>
              </div>
            </div>
          </div>
          <button
            onClick={startNewChat}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors"
            style={{ background: "var(--subtle)", color: "var(--t3)", fontWeight: 500 }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            New Chat
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* Empty state */}
          {messages.length === 0 && !isBusy && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.15), rgba(6,182,212,0.1))", border: "1px solid rgba(139,92,246,0.2)" }}>
                <Sparkles className="w-8 h-8" style={{ color: isDark ? "#A78BFA" : "#7C3AED" }} />
              </div>
              <h3 className="text-lg font-semibold mb-2" style={{ color: "var(--heading)" }}>Ask me anything about your club</h3>
              <p className="text-sm mb-6 max-w-md" style={{ color: "var(--t3)" }}>
                I have access to your sessions, members, bookings, and revenue data. Ask me to analyze trends, build audiences, draft campaigns, or suggest strategies.
              </p>
              <div className="grid grid-cols-2 gap-2 max-w-lg">
                {suggestedPrompts.map((p) => {
                  const Icon = p.icon;
                  return (
                    <button
                      key={p.text}
                      onClick={() => handleSend(p.text)}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs text-left transition-all hover:scale-[1.02]"
                      style={{
                        background: "var(--subtle)",
                        border: "1px solid var(--card-border)",
                        color: "var(--t2)",
                        fontWeight: 500,
                      }}
                    >
                      <Icon className="w-4 h-4 shrink-0" style={{ color: isDark ? "#A78BFA" : "#7C3AED" }} />
                      <span>{p.text}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <AnimatePresence>
            {messages.map((msg, msgIdx) => {
              const text = getMessageText(msg);
              const action = msg.role === 'assistant'
                ? getAdvisorActionFromMetadata((msg as any).metadata) || extractAdvisorAction(text)
                : null;
              const draftMetadata = msg.role === 'assistant'
                ? ((msg as any).metadata?.advisorDraft as { sandboxMode?: boolean; status?: string } | undefined)
                : undefined;
              const actionState = action ? getAdvisorActionRuntimeState((msg as any).metadata) : null;
              const persistedOutcome = action ? getAdvisorLatestOutcome((msg as any).metadata) : null;
              const pendingClarification = msg.role === 'assistant'
                ? getPendingClarification((msg as any).metadata)
                : null;
              // Extract the pending-queue payload (if the ops_show_pending
              // intent fired) so we can render inline Approve/Skip/Snooze
              // cards. Tag is stripped from the visible body below so the
              // chat bubble only shows the human-readable headline.
              const pendingQueue = msg.role === 'assistant' ? extractPendingQueue(text) : null;
              const textWithoutAction = msg.role === 'assistant'
                ? stripPendingQueueTag(stripAdvisorAction(text))
                : text;
              // Debug: log message structure
              if (typeof window !== 'undefined') {
                console.log(`[AdvisorIQ msg ${msgIdx}]`, msg.role, 'text:', text.slice(0, 100), 'parts:', JSON.stringify((msg as any).parts?.map((p: any) => ({ type: p.type, hasText: !!p.text })) || 'none'));
              }
              // Skip assistant messages with no text/action/queue
              if (msg.role === 'assistant' && !textWithoutAction.trim() && !action && !pendingQueue) return null;
              const isLastAssistant = msg.role === 'assistant' && msgIdx === messages.length - 1;
              const { cleanText, suggestions } = msg.role === 'assistant'
                ? extractSuggestions(textWithoutAction)
                : { cleanText: text, suggestions: [] };

              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}
                >
                  {msg.role === "assistant" && (
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, #8B5CF6, #06B6D4)" }}>
                      <Sparkles className="w-4 h-4 text-white" />
                    </div>
                  )}
                  <div className={`max-w-[75%] ${msg.role === "user" ? "order-first" : ""}`}>
                    {cleanText.trim() && (
                      <div
                        className="rounded-2xl px-5 py-4 text-sm"
                        style={{
                          background: msg.role === "user"
                            ? "linear-gradient(135deg, rgba(139,92,246,0.2), rgba(6,182,212,0.15))"
                            : "var(--subtle)",
                          border: `1px solid ${msg.role === "user" ? "rgba(139,92,246,0.2)" : "var(--card-border)"}`,
                          color: "var(--t1)",
                          lineHeight: 1.7,
                        }}
                      >
                            <ChatRichText
                              text={cleanText}
                              className="space-y-1.5"
                              lineClassName="whitespace-pre-wrap"
                              linkClassName="font-semibold underline"
                              linkStyle={{ color: "#67E8F9" }}
                              strongStyle={{ fontWeight: 700, color: "var(--heading)" }}
                            />
                          </div>
                    )}

                    {msg.role === "assistant" && action && (
                      <AdvisorActionCard
                        clubId={clubId}
                        messageId={String(msg.id)}
                        action={action}
                        sandboxMode={draftMetadata?.sandboxMode}
                        draftStatus={draftMetadata?.status}
                        actionState={actionState}
                        persistedOutcome={persistedOutcome}
                        onDraftPrompt={draftIntoComposer}
                      />
                    )}

                    {msg.role === "assistant" && pendingQueue && pendingQueue.items.length > 0 && (
                      <PendingQueueCards
                        clubId={clubId}
                        items={pendingQueue.items}
                        totalCount={pendingQueue.totalCount}
                      />
                    )}

                    {msg.role === "assistant" && pendingClarification && isLastAssistant && !isBusy && (
                      <AdvisorClarificationCard
                        pending={pendingClarification}
                        onSelect={handleSend}
                        onDraft={draftIntoComposer}
                      />
                    )}

                    {/* Suggested follow-up questions */}
                    {suggestions.length > 0 && msg.role === "assistant" && isLastAssistant && !isBusy && !pendingClarification && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {suggestions.map((q, qi) => (
                          (() => {
                            const suggestionUi = classifySuggestionChip(q);
                            const SuggestionIcon = suggestionUi.icon;
                            const styles = suggestionUi.tone === "primary"
                              ? {
                                  background: "linear-gradient(135deg, rgba(139,92,246,0.18), rgba(6,182,212,0.16))",
                                  border: "1px solid rgba(139,92,246,0.28)",
                                  color: "var(--heading)",
                                }
                              : suggestionUi.tone === "choice"
                                ? {
                                    background: "rgba(6,182,212,0.08)",
                                    border: "1px solid rgba(6,182,212,0.22)",
                                    color: "var(--t2)",
                                  }
                                : suggestionUi.tone === "ghost"
                                  ? {
                                      background: "rgba(148,163,184,0.08)",
                                      border: "1px solid rgba(148,163,184,0.18)",
                                      color: "var(--t2)",
                                    }
                                  : {
                                      background: "rgba(139,92,246,0.08)",
                                      border: "1px solid rgba(139,92,246,0.2)",
                                      color: "var(--t2)",
                                    };

                            return (
                          <button
                            key={qi}
                            onClick={() => handleSend(q)}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs transition-all hover:scale-[1.02]"
                            style={{
                              ...styles,
                              fontWeight: 600,
                            }}
                          >
                            <SuggestionIcon className="w-3.5 h-3.5" />
                            {q}
                          </button>
                            );
                          })()
                        ))}
                      </div>
                    )}

                    {/* Message meta */}
                    {msg.role === "assistant" && (
                      <div className="flex items-center gap-3 mt-2 ml-1">
                        <span className="text-[10px]" style={{ color: "var(--t4)" }}>Just now</span>
                        <div className="flex items-center gap-1">
                          {[ThumbsUp, ThumbsDown, Copy].map((Icon, idx) => (
                            <button
                              key={idx}
                              className="p-1 rounded hover:bg-white/5 transition-colors"
                              onClick={idx === 2 ? () => navigator.clipboard.writeText(textWithoutAction) : undefined}
                            >
                              <Icon className="w-3 h-3" style={{ color: "var(--t4)" }} />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {msg.role === "user" && (
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs text-white" style={{ background: "linear-gradient(135deg, #8B5CF6, #06B6D4)", fontWeight: 700 }}>
                      You
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Loading indicator when waiting for first response chunk */}
          {isBusy && messages[messages.length - 1]?.role === 'user' && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, #8B5CF6, #06B6D4)" }}>
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className="rounded-2xl px-4 py-2" style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}>
                <TypingIndicator />
              </div>
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, #8B5CF6, #06B6D4)" }}>
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className="rounded-2xl px-5 py-4 text-sm" style={{ background: "var(--subtle)", border: "1px solid rgba(239,68,68,0.3)", color: "var(--t1)" }}>
                Sorry, I encountered an error. Please try again.
                <br />
                <span style={{ color: "var(--t4)", fontSize: "12px" }}>{error.message}</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-6 pb-4 pt-2 shrink-0" style={{ borderTop: "1px solid var(--divider)" }}>
          <form onSubmit={handleSubmit} className="flex items-center gap-3">
            <div
              className="flex-1 flex items-center gap-2 px-4 py-3 rounded-xl"
              style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}
            >
              <input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask about your club data..."
                className="flex-1 bg-transparent border-none outline-none text-sm"
                style={{ color: "var(--t1)" }}
                disabled={isBusy}
              />
            </div>
            <motion.button
              type="submit"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              disabled={!inputValue.trim() || isBusy}
              className="p-3 rounded-xl text-white transition-all"
              style={{
                background: inputValue.trim() ? "linear-gradient(135deg, #8B5CF6, #06B6D4)" : "var(--subtle)",
                opacity: inputValue.trim() ? 1 : 0.5,
                boxShadow: inputValue.trim() ? "0 4px 15px rgba(139, 92, 246, 0.3)" : "none",
              }}
            >
              <Send className="w-5 h-5" />
            </motion.button>
          </form>
        </div>
      </div>
    </div>
  );
}
