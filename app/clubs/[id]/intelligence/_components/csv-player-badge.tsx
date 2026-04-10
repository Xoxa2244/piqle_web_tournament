'use client'

import { UserPlus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

/**
 * Check if a player/member was imported from a CSV file (no email on file).
 * Works with any object that has an `id` string field.
 */
export function isCsvPlayer(entity: { id: string }): boolean {
  return entity.id.startsWith('csv-')
}

interface CsvPlayerBadgeProps {
  /** Compact mode: just a small badge (use in tight lists like Events player cards) */
  variant?: 'compact' | 'default'
  /** Optional callback when "Add contact" is clicked */
  onAddContact?: () => void
  className?: string
}

/**
 * Unified badge for CSV-imported players across all Intelligence pages.
 *
 * Shows a native tooltip explaining why the player can't receive invites,
 * with an optional "Add contact info" action.
 *
 * Usage:
 *   {isCsvPlayer(player) ? <CsvPlayerBadge /> : <InviteButton />}
 */
export function CsvPlayerBadge({
  variant = 'default',
  onAddContact,
  className,
}: CsvPlayerBadgeProps) {
  const tooltipText = onAddContact
    ? 'Imported from CSV. Click to add email so they can receive invites.'
    : 'Imported from CSV. Add their email via Member Import to enable invites.'

  const badge = (
    <Badge
      variant="secondary"
      className={`text-[10px] font-medium bg-slate-100 text-slate-500 flex-shrink-0 cursor-help gap-1 ${className || ''}`}
      title={tooltipText}
    >
      <UserPlus className="h-2.5 w-2.5" />
      {variant === 'compact' ? 'No email' : 'No contact info'}
    </Badge>
  )

  if (onAddContact) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation()
          onAddContact()
        }}
        className="inline-flex"
        title={tooltipText}
      >
        {badge}
      </button>
    )
  }

  return badge
}
