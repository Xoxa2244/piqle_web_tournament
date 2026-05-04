'use client'

/**
 * BirthdayPendingGiftsCard — admin-action queue for ENGAGE segment #8.
 *
 * Birthday emails promise a gift; without this widget the gift never gets
 * physically prepared. Lists upcoming birthdays + chosen gift + status,
 * with a per-row "Mark fulfilled" button that flips the row out of the
 * pending bucket.
 *
 * Status buckets (rendered top-to-bottom):
 *   1. chosen_pending   — picked a gift, NOT fulfilled (admin needs to act)
 *   2. awaiting_choice  — got the email, hasn't picked yet (just monitor)
 *   3. chosen_fulfilled — picked + delivered (collapsed by default)
 *
 * Sits on Settings → Automation page above the aggregated Birthday survey
 * widget — admin sees the action list first, breakdown second.
 */

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { trpc } from '@/lib/trpc'
import { Cake, CheckCircle2, Clock, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'

interface Props {
  clubId: string
}

const GIFT_LABEL: Record<string, { label: string; emoji: string }> = {
  gift_week:  { label: 'Week of free play',     emoji: '🎾' },
  gift_pass:  { label: 'Guest pass for friend', emoji: '👥' },
  gift_merch: { label: 'IQSport merch',         emoji: '👕' },
}

export function BirthdayPendingGiftsCard({ clubId }: Props) {
  const { data, isLoading, refetch } = trpc.intelligence.getBirthdayGiftQueue.useQuery({ clubId })
  const markFulfilled = trpc.intelligence.markBirthdayGiftFulfilled.useMutation({
    onSuccess: () => refetch(),
  })
  const [showFulfilled, setShowFulfilled] = useState(false)

  const pending = (data ?? []).filter((r) => r.status === 'chosen_pending')
  const awaiting = (data ?? []).filter((r) => r.status === 'awaiting_choice')
  const fulfilled = (data ?? []).filter((r) => r.status === 'chosen_fulfilled')

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <Cake className="h-5 w-5 text-pink-500 mt-0.5" />
          <div className="flex-1">
            <CardTitle className="text-base">Birthday gifts to prepare</CardTitle>
            <CardDescription>
              Pending fulfillment for upcoming + recent birthdays. Mark each one delivered
              once you have the gift code / invite link / merch ready.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (data ?? []).length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* Action-required: chose a gift, not yet fulfilled */}
            {pending.length > 0 && (
              <Section
                title="Needs preparation"
                icon={<AlertCircle className="h-4 w-4 text-amber-500" />}
                count={pending.length}
              >
                {pending.map((row) => (
                  <PendingRow
                    key={row.logId}
                    row={row}
                    onMarkFulfilled={() =>
                      markFulfilled.mutate({ clubId, logId: row.logId })
                    }
                    isMarking={markFulfilled.isLoading && markFulfilled.variables?.logId === row.logId}
                  />
                ))}
              </Section>
            )}

            {/* Awaiting member choice */}
            {awaiting.length > 0 && (
              <Section
                title="Awaiting member's choice"
                icon={<Clock className="h-4 w-4 text-slate-400" />}
                count={awaiting.length}
              >
                {awaiting.map((row) => (
                  <AwaitingRow key={row.logId} row={row} />
                ))}
              </Section>
            )}

            {/* Fulfilled — collapsed by default */}
            {fulfilled.length > 0 && (
              <div className="border-t border-slate-200 pt-3">
                <button
                  onClick={() => setShowFulfilled((v) => !v)}
                  className="text-xs text-muted-foreground flex items-center gap-1 hover:text-slate-700"
                >
                  {showFulfilled ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  {fulfilled.length} already fulfilled
                </button>
                {showFulfilled && (
                  <div className="mt-2 space-y-1">
                    {fulfilled.map((row) => (
                      <FulfilledRow key={row.logId} row={row} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function Section({ title, icon, count, children }: { title: string; icon: React.ReactNode; count: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-700 mb-2">
        {icon}
        <span>{title}</span>
        <span className="text-muted-foreground">({count})</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function formatBirthday(iso: string, daysUntil: number): string {
  const d = new Date(iso)
  const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (daysUntil === 0) return `${dateStr} (today)`
  if (daysUntil === 1) return `${dateStr} (tomorrow)`
  if (daysUntil > 0) return `${dateStr} (in ${daysUntil} days)`
  if (daysUntil === -1) return `${dateStr} (yesterday)`
  return `${dateStr} (${Math.abs(daysUntil)} days ago)`
}

function PendingRow({
  row,
  onMarkFulfilled,
  isMarking,
}: {
  row: any
  onMarkFulfilled: () => void
  isMarking: boolean
}) {
  const gift = GIFT_LABEL[row.chosenGift] ?? { label: row.chosenGift, emoji: '🎁' }
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 p-3">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-900 truncate">
          {row.userName || row.userEmail || row.userId}
        </div>
        <div className="text-xs text-slate-600 mt-0.5">
          {formatBirthday(row.birthdayThisYear, row.daysUntilBirthday)}
          {' · '}
          <span className="font-medium">
            {gift.emoji} {gift.label}
          </span>
        </div>
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={isMarking}
        onClick={onMarkFulfilled}
        className="shrink-0"
      >
        {isMarking ? '…' : 'Mark fulfilled'}
      </Button>
    </div>
  )
}

function AwaitingRow({ row }: { row: any }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-800 truncate">
          {row.userName || row.userEmail || row.userId}
        </div>
        <div className="text-xs text-slate-500 mt-0.5">
          {formatBirthday(row.birthdayThisYear, row.daysUntilBirthday)}
          {' · email sent, awaiting choice'}
        </div>
      </div>
    </div>
  )
}

function FulfilledRow({ row }: { row: any }) {
  const gift = row.chosenGift ? GIFT_LABEL[row.chosenGift] : null
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <CheckCircle2 className="h-3 w-3 text-green-600 shrink-0" />
      <span className="truncate">
        {row.userName || row.userEmail} — {formatBirthday(row.birthdayThisYear, row.daysUntilBirthday)}
        {gift ? ` · ${gift.emoji} ${gift.label}` : ''}
      </span>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
      <div className="font-medium text-slate-700 mb-1">No birthdays in the next 14 days</div>
      The detector fires 7 days before each member&apos;s birthday — when the next email goes out, the
      pending list will appear here automatically.
    </div>
  )
}
