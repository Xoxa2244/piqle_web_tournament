'use client'

/**
 * Inline Approve / Skip / Snooze cards rendered inside Advisor chat when
 * the `ops_show_pending` intent fires and the backend response carries
 * a `<pending-queue>` tag. Lets admins act on approvals right in chat
 * without a context switch to /intelligence/agent.
 *
 * Lifecycle:
 *   1. Advisor POST returns assistantMessage with pending-queue JSON tag.
 *   2. AdvisorIQ parses the tag (extractPendingQueue) and strips it from
 *      the visible body.
 *   3. Each item renders as a card here. One click fires the matching
 *      tRPC mutation (approveAction / skipAction / snoozeAction) and
 *      we fade the card out locally. The optimistic approach keeps the
 *      chat feeling responsive; the next getPendingActions query will
 *      reconcile authoritatively.
 *
 * No refetch of the chat message — we never re-render stale pending data
 * inside a historical chat bubble; the card is gone after action.
 */

import { useState } from 'react'
import { CheckCircle2, X, Clock, Mail, MessageSquare, Loader2, AlertCircle } from 'lucide-react'
import type { PendingQueueItem } from '@/lib/ai/advisor-pending-queue'
import {
  useApproveAction,
  useSkipAction,
  useSnoozeAction,
} from '../../_hooks/use-intelligence'

interface Props {
  clubId: string
  items: PendingQueueItem[]
  totalCount: number
}

type ItemState =
  | { status: 'idle' }
  | { status: 'working'; action: 'approve' | 'skip' | 'snooze' }
  | { status: 'done'; action: 'approve' | 'skip' | 'snooze' }
  | { status: 'error'; message: string }

export function PendingQueueCards({ clubId, items, totalCount }: Props) {
  // Local per-item state. Not useReducer because we only mutate one key
  // at a time and the shape is flat.
  const [itemStates, setItemStates] = useState<Record<string, ItemState>>({})
  const approve = useApproveAction()
  const skip = useSkipAction()
  const snooze = useSnoozeAction()

  const runAction = async (
    item: PendingQueueItem,
    action: 'approve' | 'skip' | 'snooze',
  ) => {
    // Ignore double-clicks while an action is in-flight.
    const current = itemStates[item.id]
    if (current?.status === 'working' || current?.status === 'done') return

    setItemStates((prev) => ({ ...prev, [item.id]: { status: 'working', action } }))
    try {
      const mutation = action === 'approve' ? approve : action === 'skip' ? skip : snooze
      await mutation.mutateAsync({ clubId, actionId: item.id })
      setItemStates((prev) => ({ ...prev, [item.id]: { status: 'done', action } }))
    } catch (err) {
      setItemStates((prev) => ({
        ...prev,
        [item.id]: {
          status: 'error',
          message: err instanceof Error ? err.message.slice(0, 120) : 'Action failed',
        },
      }))
    }
  }

  if (items.length === 0) return null

  return (
    <div className="mt-3 space-y-2">
      {items.map((item) => {
        const state = itemStates[item.id] || { status: 'idle' as const }
        return (
          <PendingItemCard
            key={item.id}
            item={item}
            state={state}
            onAction={(action) => runAction(item, action)}
          />
        )
      })}
      {totalCount > items.length && (
        <div className="text-xs pt-1" style={{ color: 'var(--t3)' }}>
          +{totalCount - items.length} more in the full queue — open the Agent page to review.
        </div>
      )}
    </div>
  )
}

function PendingItemCard({
  item,
  state,
  onAction,
}: {
  item: PendingQueueItem
  state: ItemState
  onAction: (action: 'approve' | 'skip' | 'snooze') => void
}) {
  const channelIcon = item.channel === 'sms'
    ? MessageSquare
    : item.channel === 'both'
      ? Mail
      : Mail
  const ChannelIcon = channelIcon
  const age = item.createdAt ? formatAgo(new Date(item.createdAt)) : null
  const title = item.title || item.summary || humanizeType(item.type) || 'Pending action'
  const recipient = item.memberName || item.memberEmail || null

  // Done / error states replace the whole card so the chat bubble
  // doesn't pile up stale buttons.
  if (state.status === 'done') {
    const verb = state.action === 'approve' ? 'Approved' : state.action === 'skip' ? 'Skipped' : 'Snoozed'
    const color = state.action === 'approve' ? '#10B981' : state.action === 'skip' ? '#94A3B8' : '#F59E0B'
    return (
      <div
        className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs"
        style={{
          background: `${color}14`,
          border: `1px solid ${color}40`,
          color: 'var(--t2)',
        }}
      >
        <CheckCircle2 className="w-3.5 h-3.5" style={{ color }} />
        <span>
          <strong style={{ color }}>{verb}</strong> · {title}
        </span>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div
        className="flex items-start gap-2 rounded-xl px-3 py-2 text-xs"
        style={{
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.30)',
          color: '#FCA5A5',
        }}
      >
        <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <div>
          <div className="font-medium" style={{ color: '#F87171' }}>
            Could not update — {state.message}
          </div>
          <div style={{ color: 'var(--t3)' }}>Try the Agent page for this one.</div>
        </div>
      </div>
    )
  }

  const isWorking = state.status === 'working'

  return (
    <div
      className="rounded-xl p-3"
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
      }}
    >
      <div className="flex items-start gap-2 mb-2.5">
        <ChannelIcon className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: 'var(--t3)' }} />
        <div className="flex-1 min-w-0">
          <div
            className="text-xs font-semibold truncate"
            style={{ color: 'var(--heading)' }}
            title={title}
          >
            {title}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[11px]" style={{ color: 'var(--t3)' }}>
            {item.type && <span>{humanizeType(item.type)}</span>}
            {recipient && <span>· {recipient}</span>}
            {age && <span>· {age}</span>}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <ActionButton
          label={isWorking && state.action === 'approve' ? 'Approving…' : 'Approve'}
          tone="approve"
          working={isWorking && state.action === 'approve'}
          disabled={isWorking}
          onClick={() => onAction('approve')}
        />
        <ActionButton
          label={isWorking && state.action === 'skip' ? 'Skipping…' : 'Skip'}
          tone="neutral"
          working={isWorking && state.action === 'skip'}
          disabled={isWorking}
          onClick={() => onAction('skip')}
        />
        <ActionButton
          label={isWorking && state.action === 'snooze' ? 'Snoozing…' : 'Snooze'}
          tone="snooze"
          working={isWorking && state.action === 'snooze'}
          disabled={isWorking}
          onClick={() => onAction('snooze')}
        />
      </div>
    </div>
  )
}

function ActionButton({
  label,
  tone,
  working,
  disabled,
  onClick,
}: {
  label: string
  tone: 'approve' | 'neutral' | 'snooze'
  working: boolean
  disabled: boolean
  onClick: () => void
}) {
  const palette = tone === 'approve'
    ? { bg: '#10B981', text: '#FFFFFF' }
    : tone === 'snooze'
      ? { bg: 'rgba(245,158,11,0.14)', text: '#F59E0B' }
      : { bg: 'var(--subtle)', text: 'var(--t2)' }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition disabled:opacity-60"
      style={{
        background: palette.bg,
        color: palette.text,
        border: tone === 'neutral' ? '1px solid var(--card-border)' : 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {working ? <Loader2 className="w-3 h-3 animate-spin" /> : tone === 'snooze' ? <Clock className="w-3 h-3" /> : tone === 'neutral' ? <X className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
      {label}
    </button>
  )
}

function humanizeType(type?: string): string | null {
  if (!type) return null
  return type
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(' ')
}

function formatAgo(when: Date): string {
  const diffMs = Date.now() - when.getTime()
  if (!Number.isFinite(diffMs) || diffMs < 0) return 'just now'
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  return `${days}d ago`
}
