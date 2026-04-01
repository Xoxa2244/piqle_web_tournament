'use client'

import Image from 'next/image'
import { useCallback, useRef } from 'react'

import { formatUsTimeShort } from '@/lib/dateFormat'
import type { ChatMessage } from '@/lib/chatMessages'
import { cn } from '@/lib/utils'

const LONG_PRESS_MS = 450
const AVATAR_PX = 32

type DateGroup = { dateKey: string; dateLabel: string; list: ChatMessage[] }

type Props = {
  groups: DateGroup[]
  currentUserId?: string
  canDelete: (message: ChatMessage) => boolean
  onRequestDelete: (messageId: string) => void
}

function UserAvatar({ user, size = AVATAR_PX }: { user?: ChatMessage['user']; size?: number }) {
  const s = size
  if (user?.image) {
    return (
      <div className="relative shrink-0 overflow-hidden rounded-full border border-gray-200/80 bg-gray-100 shadow-sm" style={{ width: s, height: s }}>
        <Image src={user.image} alt="" fill className="object-cover" sizes={`${s}px`} />
      </div>
    )
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full border border-gray-200/80 bg-gradient-to-br from-slate-200 to-slate-300 text-[11px] font-semibold text-slate-600 shadow-sm"
      style={{ width: s, height: s }}
    >
      {(user?.name || 'U').charAt(0).toUpperCase()}
    </div>
  )
}

export function ChatMessageRows({ groups, currentUserId, canDelete, onRequestDelete }: Props) {
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pressStart = useRef<{ x: number; y: number } | null>(null)

  const clearPress = useCallback(() => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
    pressStart.current = null
  }, [])

  const onPointerDown = useCallback(
    (e: React.PointerEvent, message: ChatMessage) => {
      if (!canDelete(message) || message.isDeleted) return
      pressStart.current = { x: e.clientX, y: e.clientY }
      pressTimer.current = setTimeout(() => {
        pressTimer.current = null
        onRequestDelete(message.id)
      }, LONG_PRESS_MS)
    },
    [canDelete, onRequestDelete]
  )

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!pressStart.current || !pressTimer.current) return
    const dx = Math.abs(e.clientX - pressStart.current.x)
    const dy = Math.abs(e.clientY - pressStart.current.y)
    if (dx > 12 || dy > 12) clearPress()
  }, [clearPress])

  return (
    <div className="space-y-3 px-1.5 py-2">
      {groups.map((g) => (
        <div key={g.dateKey} className="space-y-1">
          <div className="flex justify-center py-1">
            <span className="rounded-full bg-black/10 px-3 py-0.5 text-[11px] font-medium text-slate-600 shadow-sm backdrop-blur-sm">
              {g.dateLabel}
            </span>
          </div>
          {g.list.map((m, idx) => {
            const isMine = Boolean(currentUserId && m.userId === currentUserId)
            const prev = idx > 0 ? g.list[idx - 1] : null
            const sameAuthorAsPrev = Boolean(prev && prev.userId === m.userId)
            const showName = !isMine && (!prev || prev.userId !== m.userId)
            const showAvatar = !isMine && (!prev || prev.userId !== m.userId)
            const tightTop = sameAuthorAsPrev

            const deletable = canDelete(m) && !m.isDeleted

            return (
              <div
                key={m.id}
                className={cn(
                  'flex items-end gap-2',
                  isMine ? 'flex-row-reverse' : 'flex-row',
                  tightTop ? '-mt-0.5' : 'mt-0.5'
                )}
              >
                {!isMine ? (
                  showAvatar ? (
                    <UserAvatar user={m.user} />
                  ) : (
                    <div className="shrink-0" style={{ width: AVATAR_PX, height: AVATAR_PX }} aria-hidden />
                  )
                ) : null}

                <div
                  role="button"
                  tabIndex={0}
                  className={cn(
                    'max-w-[min(85%,28rem)] cursor-default select-none rounded-2xl px-3 py-2 text-sm shadow-sm transition-transform active:scale-[0.99]',
                    isMine
                      ? 'rounded-br-md bg-gradient-to-br from-sky-600 to-blue-700 text-white'
                      : 'rounded-bl-md border border-gray-200/80 bg-white/95 text-gray-900 backdrop-blur-[1px]',
                    deletable && 'cursor-pointer'
                  )}
                  onPointerDown={(e) => onPointerDown(e, m)}
                  onPointerUp={clearPress}
                  onPointerLeave={clearPress}
                  onPointerCancel={clearPress}
                  onPointerMove={onPointerMove}
                  title={deletable ? 'Long-press to delete' : undefined}
                >
                  {showName ? <div className="mb-0.5 truncate text-xs font-semibold text-slate-600">{m.user?.name || 'User'}</div> : null}
                  <div className={cn('whitespace-pre-wrap break-words', m.isDeleted && 'italic opacity-80')}>
                    {m.isDeleted ? 'Message removed' : m.text}
                  </div>
                  <div className={cn('mt-1 text-[10px] tabular-nums', isMine ? 'text-sky-100/90' : 'text-slate-500')}>
                    {m.createdAt ? formatUsTimeShort(m.createdAt) : ''}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
