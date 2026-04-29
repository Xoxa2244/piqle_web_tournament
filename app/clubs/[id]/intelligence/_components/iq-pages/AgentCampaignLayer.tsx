'use client'

/**
 * Agent Campaign Layer block.
 *
 * Originally rendered at the top of CampaignsIQ. Moved to Settings → Automation
 * in P1-T3 (see docs/ENGAGE_REDESIGN_SPEC.md §3 P1-T3) so the Campaigns page
 * is director-facing only, while this admin/devops view lives under
 * Settings → Automation.
 *
 * Self-contained: takes only `clubId`, runs all required queries internally.
 *
 * NOTE: Constants (OUTREACH_MODE_STYLES, PILOT_HEALTH_STYLES,
 * DRAFT_STATUS_STYLES) and helpers (formatRelativeTime,
 * formatCampaignDraftKind) are duplicated from CampaignsIQ. Future cleanup
 * (post-Engage redesign) should hoist these into a shared file.
 */

import Link from 'next/link'
import {
  AlertTriangle, ArrowRight, Clock3, Radar, ShieldAlert, ShieldCheck, Sparkles, TestTube2,
} from 'lucide-react'
import {
  useAdvisorDrafts,
  useAgentDecisionRecords,
  useIntelligenceSettings,
  useOutreachPilotHealth,
} from '../../_hooks/use-intelligence'
import { buildAdvisorContextHref as buildCampaignAdvisorHref } from './shared/growth-context'

// ── Constants (mirror CampaignsIQ) ──────────────────────────────────────

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

const DRAFT_STATUS_STYLES: Record<string, { label: string; bg: string; color: string }> = {
  review_ready: { label: 'Review Ready', bg: 'rgba(59,130,246,0.14)', color: '#3B82F6' },
  sandboxed: { label: 'Sandboxed', bg: 'rgba(245,158,11,0.14)', color: '#F59E0B' },
  scheduled: { label: 'Scheduled', bg: 'rgba(99,102,241,0.14)', color: '#6366F1' },
  sent: { label: 'Sent', bg: 'rgba(16,185,129,0.14)', color: '#10B981' },
  blocked: { label: 'Blocked', bg: 'rgba(239,68,68,0.14)', color: '#EF4444' },
  draft_saved: { label: 'Draft Saved', bg: 'rgba(148,163,184,0.14)', color: '#94A3B8' },
}

// ── Helpers (mirror CampaignsIQ) ────────────────────────────────────────

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

// ── Component ───────────────────────────────────────────────────────────

interface AgentCampaignLayerProps {
  clubId: string
}

export function AgentCampaignLayer({ clubId }: AgentCampaignLayerProps) {
  const { data: advisorDrafts = [] } = useAdvisorDrafts(clubId, 24)
  const { data: settingsData } = useIntelligenceSettings(clubId)
  const { data: pilotHealth } = useOutreachPilotHealth(clubId, 14)
  const { data: decisionRecords = [] } = useAgentDecisionRecords(clubId, 12)

  const intelligenceSettings = settingsData?.settings
  const outreachMode = intelligenceSettings?.controlPlane?.actions?.outreachSend?.mode ?? 'shadow'
  const outreachModeStyle = OUTREACH_MODE_STYLES[outreachMode] || OUTREACH_MODE_STYLES.shadow
  const rolloutStatus = settingsData?.outreachRolloutStatus
  const pilotStyle = PILOT_HEALTH_STYLES[pilotHealth?.health || 'idle'] || PILOT_HEALTH_STYLES.idle

  const campaignDrafts = advisorDrafts.filter((draft: any) => CAMPAIGN_AGENT_KINDS.has(draft.kind))
  const reviewReadyDrafts = campaignDrafts.filter((draft: any) => draft.status === 'review_ready')
  const sandboxedDrafts = campaignDrafts.filter((draft: any) => draft.status === 'sandboxed' || draft.sandboxMode)
  const scheduledDrafts = campaignDrafts.filter((draft: any) => draft.status === 'scheduled')
  const blockedDrafts = campaignDrafts.filter((draft: any) => draft.status === 'blocked')
  const latestDrafts = [...reviewReadyDrafts, ...sandboxedDrafts, ...scheduledDrafts].slice(0, 3)

  const recentOutreachDecisions = decisionRecords.filter((record: any) => record.action === 'outreachSend')
  const rolloutFriction = recentOutreachDecisions.filter(
    (record: any) => record.result === 'blocked' || record.result === 'shadowed',
  )

  return (
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
            Agent Campaign Layer
          </div>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--heading)' }}>Campaign control, draft review, and live pilot health</h2>
            <p className="text-sm mt-1" style={{ color: 'var(--t2)', maxWidth: 760 }}>
              Advisor drafts, rollout posture, blocked live sends, and pilot outcomes — the admin/devops view of the agent system.
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
        {/* ── Column 1: Draft Queue ── */}
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
                No campaign drafts are waiting right now. Use the quick starts on the Campaigns page to seed a new one in Advisor.
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

        {/* ── Column 2: Live Rollout ── */}
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
              No recent blocked or shadowed outreach sends. Rollout posture looks clean.
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

        {/* ── Column 3: Live Pilot Health ── */}
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
    </div>
  )
}
