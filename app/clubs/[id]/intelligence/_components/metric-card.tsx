import { type LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MetricCardProps {
  label: string
  value: string | number
  subtitle?: string
  icon: LucideIcon
  trend?: 'up' | 'down' | 'neutral'
  variant?: 'default' | 'danger' | 'success' | 'warning'
  trendValue?: number       // e.g. +12.5 or -3.2
  trendDirection?: 'up' | 'down' | 'neutral'
  periodLabel?: string      // e.g. "vs last 30d"
  sparkline?: number[]      // 7 data points
  invertTrend?: boolean     // true = down is good (e.g. lost revenue)
}

const variantStyles = {
  default: 'border-border',
  danger: 'border-red-200 bg-red-50/30',
  success: 'border-green-200 bg-green-50/30',
  warning: 'border-orange-200 bg-orange-50/30',
}

const valueStyles = {
  default: 'text-foreground',
  danger: 'text-red-600',
  success: 'text-green-600',
  warning: 'text-orange-600',
}

export function MetricCard({
  label, value, subtitle, icon: Icon, variant = 'default',
  trendValue, trendDirection, periodLabel, sparkline, invertTrend = false,
}: MetricCardProps) {
  const hasTrend = trendValue !== undefined && trendDirection !== undefined

  // For inverted metrics (like lost revenue), down = green, up = red
  const isPositive = invertTrend
    ? trendDirection === 'down'
    : trendDirection === 'up'
  const isNegative = invertTrend
    ? trendDirection === 'up'
    : trendDirection === 'down'

  return (
    <div className={cn('rounded-lg border p-4 transition-colors', variantStyles[variant])}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-wide">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
        {hasTrend && (
          <div className={cn(
            'flex items-center gap-0.5 text-xs font-semibold tabular-nums',
            isPositive && 'text-green-600',
            isNegative && 'text-red-600',
            trendDirection === 'neutral' && 'text-muted-foreground',
          )}>
            {trendDirection === 'up' && <TrendingUp className="h-3 w-3" />}
            {trendDirection === 'down' && <TrendingDown className="h-3 w-3" />}
            {trendDirection === 'neutral' && <Minus className="h-3 w-3" />}
            {trendValue > 0 ? '+' : ''}{trendValue}%
          </div>
        )}
      </div>
      <div className={cn('text-2xl font-bold tabular-nums', valueStyles[variant])}>
        {value}
      </div>
      <div className="flex items-center justify-between mt-1">
        {subtitle && (
          <div className="text-xs text-muted-foreground">{subtitle}</div>
        )}
        {periodLabel && !subtitle && (
          <div className="text-xs text-muted-foreground">{periodLabel}</div>
        )}
      </div>
      {sparkline && sparkline.length > 1 && (
        <div className="mt-2">
          <MiniSparkline
            data={sparkline}
            color={isPositive ? '#16a34a' : isNegative ? '#dc2626' : '#9ca3af'}
          />
        </div>
      )}
    </div>
  )
}

// ── Inline SVG sparkline ──
function MiniSparkline({ data, color = '#9ca3af', height = 24, width }: {
  data: number[]
  color?: string
  height?: number
  width?: number
}) {
  if (data.length < 2) return null

  const w = width ?? 100 // will use 100% of parent
  const h = height
  const padding = 2
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const points = data.map((v, i) => {
    const x = padding + (i / (data.length - 1)) * (w - padding * 2)
    const y = h - padding - ((v - min) / range) * (h - padding * 2)
    return `${x},${y}`
  }).join(' ')

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full"
      style={{ height }}
      preserveAspectRatio="none"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
