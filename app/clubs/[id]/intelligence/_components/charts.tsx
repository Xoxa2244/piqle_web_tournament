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
    <div className={cn('space-y-4', className)}>
      {items.map((item) => {
        const pct = Math.round((item.value / max) * 100)
        const gradient =
          pct >= 75 ? 'from-emerald-400 to-emerald-500' :
          pct >= 50 ? 'from-amber-400 to-yellow-500' :
          pct >= 25 ? 'from-orange-400 to-orange-500' :
          'from-rose-400 to-rose-500'

        return (
          <div key={item.label}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-semibold text-foreground">{item.label}</span>
              <div className="flex items-center gap-2">
                {item.sublabel && (
                  <span className="text-xs text-muted-foreground/70">{item.sublabel}</span>
                )}
                <span className="text-sm font-bold tabular-nums min-w-[3rem] text-right">
                  {item.value}{item.suffix || '%'}
                </span>
              </div>
            </div>
            <div className="h-2 bg-muted/60 rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full bg-gradient-to-r transition-all duration-700 ease-out', gradient)}
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
  height = 140,
  className,
}: {
  items: VBarItem[]
  maxValue?: number
  height?: number
  className?: string
}) {
  const max = maxValue ?? Math.max(...items.map((i) => i.value), 1)

  return (
    <div className={cn('flex items-end gap-3', className)}>
      {items.map((item) => {
        const pct = max > 0 ? (item.value / max) * 100 : 0
        const gradient =
          pct >= 75 ? 'from-emerald-400 to-emerald-500' :
          pct >= 50 ? 'from-amber-400 to-yellow-500' :
          pct >= 25 ? 'from-orange-400 to-orange-500' :
          'from-rose-400 to-rose-500'

        return (
          <div key={item.label} className="flex-1 flex flex-col items-center gap-1.5 group">
            <span className="text-xs font-bold tabular-nums text-foreground opacity-80 group-hover:opacity-100 transition-opacity">
              {item.value > 0 ? `${item.value}%` : '-'}
            </span>
            <div
              className="w-full rounded-lg bg-muted/40 relative overflow-hidden"
              style={{ height }}
            >
              <div
                className={cn(
                  'absolute bottom-0 w-full rounded-lg bg-gradient-to-t transition-all duration-700 ease-out',
                  item.value > 0 ? gradient : 'bg-muted/40'
                )}
                style={{ height: `${Math.max(pct, item.value > 0 ? 4 : 0)}%` }}
              />
              {/* Hover highlight */}
              <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-colors rounded-lg" />
            </div>
            <span className="text-xs font-semibold text-muted-foreground group-hover:text-foreground transition-colors">
              {item.label}
            </span>
            {item.sublabel && (
              <span className="text-[10px] text-muted-foreground/60">{item.sublabel}</span>
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
    value >= 80 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
    value >= 50 ? 'bg-amber-50 text-amber-700 border-amber-200' :
    'bg-rose-50 text-rose-700 border-rose-200'

  return (
    <span className={cn(
      'inline-flex items-center rounded-full border font-bold tabular-nums',
      color,
      size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-2.5 py-0.5'
    )}>
      {value}%
    </span>
  )
}

// ── Occupancy inline bar ──
export function OccupancyBar({ value, className }: { value: number; className?: string }) {
  const gradient =
    value >= 80 ? 'from-emerald-400 to-emerald-500' :
    value >= 50 ? 'from-amber-400 to-yellow-500' :
    'from-rose-400 to-rose-500'

  return (
    <div className={cn('h-1.5 bg-muted/60 rounded-full overflow-hidden', className)}>
      <div
        className={cn('h-full rounded-full bg-gradient-to-r transition-all duration-500', gradient)}
        style={{ width: `${value}%` }}
      />
    </div>
  )
}
