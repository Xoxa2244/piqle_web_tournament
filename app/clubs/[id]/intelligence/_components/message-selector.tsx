'use client'

import type { MessageVariant } from '@/lib/ai/reactivation-messages'

interface MessageSelectorProps {
  variants: MessageVariant[]
  selectedId: string
  channel: 'email' | 'sms' | 'both'
  onSelect: (id: string) => void
}

export function MessageSelector({ variants, selectedId, channel, onSelect }: MessageSelectorProps) {
  // Auto-select recommended variant when no explicit selection
  const effectiveId = selectedId || variants.find(v => v.recommended)?.id || variants[0]?.id || ''

  return (
    <div className="space-y-2 mt-3">
      <div className="text-xs font-medium text-muted-foreground">Choose a message style</div>
      {variants.map((v) => {
        const isSelected = v.id === effectiveId
        const preview = channel === 'sms' ? v.smsBody : v.emailBody

        return (
          <button
            key={v.id}
            type="button"
            onClick={() => onSelect(v.id)}
            className={`w-full text-left rounded-lg border-2 p-3 transition-all ${
              isSelected && v.recommended
                ? 'border-green-500 bg-green-50/60 ring-1 ring-green-200'
                : isSelected
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                  : 'border-border hover:border-muted-foreground/30 bg-card'
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              {/* Radio circle */}
              <div
                className={`h-4 w-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                  isSelected
                    ? v.recommended
                      ? 'border-green-500'
                      : 'border-primary'
                    : 'border-muted-foreground/40'
                }`}
              >
                {isSelected && (
                  <div
                    className={`h-2 w-2 rounded-full ${
                      v.recommended ? 'bg-green-500' : 'bg-primary'
                    }`}
                  />
                )}
              </div>

              {/* Label + badge */}
              <span className="text-sm font-medium">{v.label}</span>
              {v.recommended && (
                <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-green-100 text-green-700 border border-green-200">
                  Recommended
                </span>
              )}
            </div>

            {/* Message preview */}
            <div className="text-xs text-muted-foreground line-clamp-3 pl-6">
              {preview}
            </div>
          </button>
        )
      })}
    </div>
  )
}
