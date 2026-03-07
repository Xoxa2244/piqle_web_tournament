import { cn } from '@/lib/utils'

// ── Horizontal bar chart ──
interface HBarItem {
  label: string
  value: number
  max?: number
  suffix?: string
  sublabel?: string
}

export function HorizontalBarChart({
  items,
  maxValue,
  className,
}: {
  items: HBarItem[]
  maxValue?: number
  className?: string
}) {
  const max = maxValue ?? Math.max(...items.map((i) => i.value), 1)

  return (
    <div className={cn('space-y-3', className)}>
      {items.map((item) => {
        const pct = Math.round((item.value / max) * 100)
        const color =
          pct >= 75 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-400' : pct >= 25 ? 'bg-orange-400' : 'bg-red-400'

        return (
          <div key={item.label} className="group">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-foreground">{item.label}</span>
              <div className="flex items-center gap-2">
                {item.sublabel && (
                  <span className="text-xs text-muted-foreground">{item.sublabel}</span>
                )}
                <span className="text-sm font-semibold tabular-nums w-12 text-right">
                  {item.value}{item.suffix || '%'}
                </span>
              </div>
            </div>
            <div className="h-2.5 bg-muted rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all duration-500', color)}
                style={{ width: `${Math.max(pct, 2)}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Vertical bar chart (for day-of-week etc.) ──
interface VBarItem {
  label: string
  value: number
  sublabel?: string
}

export function VerticalBarChart({
  items,
  maxValue,
  height = 120,
  className,
}: {
  items: VBarItem[]
  maxValue?: number
  height?: number
  className?: string
}) {
  const max = maxValue ?? Math.max(...items.map((i) => i.value), 1)

  return (
    <div className={cn('flex items-end gap-2', className)}>
      {items.map((item) => {
        const pct = max > 0 ? (item.value / max) * 100 : 0
        const color =
          pct >= 75 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-400' : pct >= 25 ? 'bg-orange-400' : 'bg-red-400'

        return (
          <div key={item.label} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-xs font-semibold tabular-nums text-foreground">
              {item.value > 0 ? `${item.value}%` : '-'}
            </span>
            <div
              className="w-full rounded-t-md bg-muted relative overflow-hidden"
              style={{ height }}
            >
              <div
                className={cn(
                  'absolute bottom-0 w-full rounded-t-md transition-all duration-500',
                  item.value > 0 ? color : 'bg-muted'
                )}
                style={{ height: `${Math.max(pct, item.value > 0 ? 4 : 0)}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground font-medium">{item.label}</span>
            {item.sublabel && (
              <span className="text-[10px] text-muted-foreground">{item.sublabel}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Occupancy badge ──
export function OccupancyBadge({ value, size = 'sm' }: { value: number; size?: 'sm' | 'md' }) {
  const color =
    value >= 80 ? 'bg-green-100 text-green-700 border-green-200' :
    value >= 50 ? 'bg-amber-100 text-amber-700 border-amber-200' :
    'bg-red-100 text-red-700 border-red-200'

  return (
    <span className={cn(
      'inline-flex items-center rounded-full border font-semibold tabular-nums',
      color,
      size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-2.5 py-0.5'
    )}>
      {value}%
    </span>
  )
}

// ── Occupancy inline bar ──
export function OccupancyBar({ value, className }: { value: number; className?: string }) {
  const color =
    value >= 80 ? 'bg-green-500' : value >= 50 ? 'bg-amber-400' : 'bg-red-400'

  return (
    <div className={cn('h-1.5 bg-muted rounded-full overflow-hidden', className)}>
      <div
        className={cn('h-full rounded-full transition-all duration-300', color)}
        style={{ width: `${value}%` }}
      />
    </div>
  )
}
