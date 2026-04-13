'use client'

import { useMemo, useState } from 'react'
import { CalendarDays, CheckCircle2, Loader2, Mail, Send, Users } from 'lucide-react'
import { useTheme } from '../IQThemeProvider'
import type { AdvisorAction } from '@/lib/ai/advisor-actions'
import { useExecuteAdvisorAction } from '../../_hooks/use-intelligence'

export function AdvisorActionCard({ clubId, action }: { clubId: string; action: AdvisorAction }) {
  const { isDark } = useTheme()
  const executeAction = useExecuteAdvisorAction()
  const [result, setResult] = useState<any | null>(null)

  const title = action.title
  const summary = action.summary

  const channelLabel = useMemo(() => {
    const channel = action.kind === 'create_campaign'
      ? action.campaign.channel
      : action.kind === 'fill_session'
        ? action.outreach.channel
        : null
    if (!channel) return null
    if (channel === 'both') return 'Email + SMS'
    if (channel === 'sms') return 'SMS'
    return 'Email'
  }, [action])

  const deliveryModeLabel = useMemo(() => {
    if (action.kind !== 'create_campaign') return null
    if (action.campaign.execution.mode === 'send_now') return 'Send Now'
    if (action.campaign.execution.mode === 'send_later') return 'Schedule Send'
    return 'Save Draft'
  }, [action])

  const scheduledLabel = useMemo(() => {
    if (action.kind !== 'create_campaign' || action.campaign.execution.mode !== 'send_later') return null
    if (!action.campaign.execution.scheduledFor) return null

    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: action.campaign.execution.timeZone || undefined,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: action.campaign.execution.timeZone ? 'short' : undefined,
      }).format(new Date(action.campaign.execution.scheduledFor))
    } catch {
      return action.campaign.execution.scheduledFor
    }
  }, [action])

  const recipientRuleLabels = useMemo(() => {
    if (action.kind !== 'create_campaign') return []
    const rules = action.campaign.execution.recipientRules
    if (!rules) return []

    return [
      rules.requireEmail ? 'Require email' : null,
      rules.requirePhone ? 'Require phone' : null,
      rules.smsOptInOnly ? 'SMS opt-in only' : null,
    ].filter(Boolean) as string[]
  }, [action])

  const targetCount = action.kind === 'create_cohort'
    ? action.cohort.count ?? 0
    : action.kind === 'create_campaign'
      ? action.audience.count ?? 0
      : action.outreach.candidateCount ?? 0

  const handleApprove = () => {
    executeAction.mutate(
      { clubId, action },
      {
        onSuccess: (data) => setResult(data),
      }
    )
  }

  const isDone = !!result?.ok

  return (
    <div
      className="mt-3 rounded-2xl p-4"
      style={{
        background: isDark ? 'rgba(139,92,246,0.08)' : 'rgba(139,92,246,0.05)',
        border: '1px solid rgba(139,92,246,0.18)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.12em]" style={{ color: '#A78BFA', fontWeight: 700 }}>
            {action.kind === 'create_cohort' ? 'Audience Draft' : action.kind === 'create_campaign' ? 'Campaign Draft' : 'Session Fill Draft'}
          </div>
          <div className="text-sm mt-1" style={{ fontWeight: 700, color: 'var(--heading)' }}>
            {title}
          </div>
          {summary && (
            <p className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
              {summary}
            </p>
          )}
        </div>
        <div
          className="text-[10px] px-2 py-1 rounded-full"
          style={{
            background: isDone ? 'rgba(16,185,129,0.14)' : 'rgba(245,158,11,0.12)',
            color: isDone ? '#10B981' : '#F59E0B',
            fontWeight: 700,
          }}
        >
          {isDone ? 'Approved' : 'Needs approval'}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          <div className="rounded-xl p-3" style={{ background: 'var(--subtle)' }}>
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--t3)', fontWeight: 600 }}>
              {action.kind === 'fill_session' ? <CalendarDays className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}
              {action.kind === 'fill_session' ? 'Session' : 'Audience'}
            </div>
            <div className="text-sm mt-2" style={{ fontWeight: 600, color: 'var(--heading)' }}>
              {action.kind === 'create_cohort' ? action.cohort.name : action.kind === 'create_campaign' ? action.audience.name : action.session.title}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
              {action.kind === 'fill_session'
                ? `${action.session.date} · ${action.session.startTime}${action.session.endTime ? `-${action.session.endTime}` : ''}`
                : `${targetCount} matching member${targetCount === 1 ? '' : 's'}`}
            </div>
            {action.kind === 'fill_session' ? (
              <p className="text-xs mt-2" style={{ color: 'var(--t2)', lineHeight: 1.5 }}>
                {action.session.court ? `${action.session.court} · ` : ''}
                {action.session.format || 'Session'} · {action.session.spotsRemaining} spot{action.session.spotsRemaining === 1 ? '' : 's'} left
              </p>
            ) : (
              (action.kind === 'create_cohort' ? action.cohort.description : action.audience.description) && (
                <p className="text-xs mt-2" style={{ color: 'var(--t2)', lineHeight: 1.5 }}>
                  {action.kind === 'create_cohort' ? action.cohort.description : action.audience.description}
                </p>
              )
            )}
          </div>

        {action.kind === 'create_campaign' ? (
          <div className="rounded-xl p-3" style={{ background: 'var(--subtle)' }}>
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--t3)', fontWeight: 600 }}>
              <Mail className="w-3.5 h-3.5" />
              Campaign
            </div>
            <div className="text-sm mt-2" style={{ fontWeight: 600, color: 'var(--heading)' }}>
              {action.campaign.type.replace(/_/g, ' ')}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
              {channelLabel}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
              {deliveryModeLabel}
            </div>
            {scheduledLabel && (
              <div className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
                {scheduledLabel}
              </div>
            )}
            {action.campaign.subject && (
              <p className="text-xs mt-2" style={{ color: 'var(--t2)' }}>
                <strong style={{ color: 'var(--heading)' }}>Subject:</strong> {action.campaign.subject}
              </p>
            )}
            {recipientRuleLabels.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {recipientRuleLabels.map((label) => (
                  <span
                    key={label}
                    className="text-[11px] px-2 py-1 rounded-full"
                    style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--t2)' }}
                  >
                    {label}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : action.kind === 'fill_session' ? (
          <div className="rounded-xl p-3" style={{ background: 'var(--subtle)' }}>
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--t3)', fontWeight: 600 }}>
              <Mail className="w-3.5 h-3.5" />
              Outreach
            </div>
            <div className="text-sm mt-2" style={{ fontWeight: 600, color: 'var(--heading)' }}>
              {channelLabel}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
              {action.outreach.candidateCount} matched player{action.outreach.candidateCount === 1 ? '' : 's'}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {action.outreach.candidates.slice(0, 4).map((candidate) => (
                <span
                  key={candidate.memberId}
                  className="text-[11px] px-2 py-1 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--t2)' }}
                >
                  {candidate.name} · {candidate.score}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-xl p-3" style={{ background: 'var(--subtle)' }}>
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--t3)', fontWeight: 600 }}>
              <CheckCircle2 className="w-3.5 h-3.5" />
              Filters
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {action.cohort.filters.slice(0, 4).map((filter, index) => (
                <span
                  key={`${filter.field}-${index}`}
                  className="text-[11px] px-2 py-1 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--t2)' }}
                >
                  {filter.field} {filter.op} {Array.isArray(filter.value) ? filter.value.join(', ') : String(filter.value)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {(action.kind === 'create_campaign' || action.kind === 'fill_session') && (
        <div className="rounded-xl p-3 mt-3" style={{ background: 'var(--subtle)' }}>
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--t3)', fontWeight: 600 }}>
            <Send className="w-3.5 h-3.5" />
            Message Preview
          </div>
          <div className="text-xs mt-2 whitespace-pre-wrap" style={{ color: 'var(--t2)', lineHeight: 1.6 }}>
            {action.kind === 'create_campaign' ? action.campaign.body : action.outreach.message}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 mt-4">
        {isDone ? (
          <div className="text-xs" style={{ color: '#10B981', fontWeight: 600 }}>
            {result.kind === 'create_cohort'
              ? `Audience created: ${result.name} (${result.memberCount} members)`
              : result.kind === 'fill_session'
                ? `Invites sent for ${result.sessionTitle} to ${result.sent} recipients${result.failed ? `, ${result.failed} failed` : ''}`
              : result.savedAsDraft
                ? `Draft saved for ${result.memberCount} eligible members${result.excludedByRules ? `, ${result.excludedByRules} excluded by rules` : ''}`
                : result.deliveryMode === 'send_later'
                  ? `Campaign scheduled for ${result.scheduledLabel || scheduledLabel || 'later'} with ${result.memberCount} eligible members${result.excludedByRules ? `, ${result.excludedByRules} excluded by rules` : ''}`
                : `Campaign sent to ${result.sent} members${result.emailSent ? `, ${result.emailSent} email` : ''}${result.smsSent ? `, ${result.smsSent} SMS` : ''}${result.failed ? `, ${result.failed} failed` : ''}${result.excludedByRules ? `, ${result.excludedByRules} excluded by rules` : ''}`}
          </div>
        ) : (
          <div className="text-xs" style={{ color: 'var(--t3)' }}>
            {action.kind === 'create_campaign' && action.campaign.execution.mode === 'save_draft'
              ? 'Approval is required before the platform saves this campaign draft.'
            : action.kind === 'create_campaign' && action.campaign.execution.mode === 'send_later'
                ? 'Approval is required before the platform schedules this campaign.'
              : action.kind === 'fill_session'
                ? 'Approval is required before the platform sends these invites.'
              : 'Approval is required before the platform makes this change.'}
          </div>
        )}

        <button
          type="button"
          onClick={handleApprove}
          disabled={executeAction.isPending || isDone}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-white"
          style={{
            background: isDone ? 'rgba(16,185,129,0.85)' : 'linear-gradient(135deg, #8B5CF6, #06B6D4)',
            fontWeight: 600,
            opacity: executeAction.isPending ? 0.75 : 1,
          }}
        >
          {executeAction.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          {isDone
            ? 'Approved'
            : action.kind === 'create_campaign'
              ? (
                  action.campaign.execution.mode === 'save_draft'
                    ? 'Save Draft'
                    : action.campaign.execution.mode === 'send_later'
                      ? 'Schedule Send'
                      : 'Send Now'
                )
              : action.kind === 'fill_session'
                ? 'Send Invites'
              : 'Approve'}
        </button>
      </div>

      {executeAction.error && !isDone && (
        <div className="text-xs mt-3" style={{ color: '#F87171' }}>
          {executeAction.error.message}
        </div>
      )}
    </div>
  )
}
