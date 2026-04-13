'use client'

import { useMemo, useState } from 'react'
import { CheckCircle2, Loader2, Mail, Send, Users } from 'lucide-react'
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
    if (action.kind !== 'create_campaign') return null
    if (action.campaign.channel === 'both') return 'Email + SMS'
    if (action.campaign.channel === 'sms') return 'SMS'
    return 'Email'
  }, [action])

  const deliveryModeLabel = useMemo(() => {
    if (action.kind !== 'create_campaign') return null
    return action.campaign.execution.mode === 'send_now' ? 'Send Now' : 'Save Draft'
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

  const audienceCount = action.kind === 'create_cohort'
    ? action.cohort.count ?? 0
    : action.audience.count ?? 0

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
            {action.kind === 'create_cohort' ? 'Audience Draft' : 'Campaign Draft'}
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
            <Users className="w-3.5 h-3.5" />
            Audience
          </div>
          <div className="text-sm mt-2" style={{ fontWeight: 600, color: 'var(--heading)' }}>
            {action.kind === 'create_cohort' ? action.cohort.name : action.audience.name}
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
            {audienceCount} matching member{audienceCount === 1 ? '' : 's'}
          </div>
          {(action.kind === 'create_cohort' ? action.cohort.description : action.audience.description) && (
            <p className="text-xs mt-2" style={{ color: 'var(--t2)', lineHeight: 1.5 }}>
              {action.kind === 'create_cohort' ? action.cohort.description : action.audience.description}
            </p>
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

      {action.kind === 'create_campaign' && (
        <div className="rounded-xl p-3 mt-3" style={{ background: 'var(--subtle)' }}>
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--t3)', fontWeight: 600 }}>
            <Send className="w-3.5 h-3.5" />
            Message Preview
          </div>
          <div className="text-xs mt-2 whitespace-pre-wrap" style={{ color: 'var(--t2)', lineHeight: 1.6 }}>
            {action.campaign.body}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 mt-4">
        {isDone ? (
          <div className="text-xs" style={{ color: '#10B981', fontWeight: 600 }}>
            {result.kind === 'create_cohort'
              ? `Audience created: ${result.name} (${result.memberCount} members)`
              : result.savedAsDraft
                ? `Draft saved for ${result.memberCount} eligible members${result.excludedByRules ? `, ${result.excludedByRules} excluded by rules` : ''}`
                : `Campaign sent to ${result.sent} members${result.emailSent ? `, ${result.emailSent} email` : ''}${result.smsSent ? `, ${result.smsSent} SMS` : ''}${result.failed ? `, ${result.failed} failed` : ''}${result.excludedByRules ? `, ${result.excludedByRules} excluded by rules` : ''}`}
          </div>
        ) : (
          <div className="text-xs" style={{ color: 'var(--t3)' }}>
            {action.kind === 'create_campaign' && action.campaign.execution.mode === 'save_draft'
              ? 'Approval is required before the platform saves this campaign draft.'
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
              ? (action.campaign.execution.mode === 'save_draft' ? 'Save Draft' : 'Send Now')
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
