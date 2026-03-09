import { type LucideIcon, TrendingUp, TrendingDown, Minus, HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MetricCardProps {
  label: string
  value: string | number
  subtitle?: string
  icon: LucideIcon
  trend?: 'up' | 'down' | 'neutral'
  variant?: 'default' | 'danger' | 'success' | 'warning'
  trendValue?: number
  trendDirection?: 'up' | 'down' | 'neutral'
  periodLabel?: string
  sparkline?: number[]
  invertTrend?: boolean
  tooltip?: string
}

const iconGradients = {
  default: 'from-blue-500 to-blue-600 shadow-blue-500/25',
  danger: 'from-rose-500 to-pink-600 shadow-rose-500/25',
  success: 'from-emerald-500 to-green-600 shadow-emerald-500/25',
  warning: 'from-amber-500 to-orange-600 shadow-amber-500/25',
}

export function MetricCard({
  label, value, subtitle, icon: Icon, variant = 'default',
  trendValue, trendDirection, periodLabel, sparkline, invertTrend = false,
  tooltip,
}: MetricCardProps) {
  const hasTrend = trendValue !== undefined && trendDirection !== undefined

  const isPositive = invertTrend
    ? trendDirection === 'down'
    : trendDirection === 'up'
  const isNegative = invertTrend
    ? trendDirection === 'up'
    : trendDirection === 'down'

  return (
    <div className="group relative rounded-xl border border-border/60 bg-card p-4 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden">
      {/* Subtle gradient background glow */}
      <div className={cn(
        'absolute -top-8 -right-8 w-24 h-24 rounded-full opacity-[0.07] blur-2xl transition-opacity group-hover:opacity-[0.12]',
        variant === 'danger' ? 'bg-rose-500' :
        variant === 'success' ? 'bg-emerald-500' :
        variant === 'warning' ? 'bg-amber-500' : 'bg-blue-500'
      )} />

      <div className="relative flex items-start justify-between mb-3">
        {/* Icon with gradient background */}
        <div className={cn(
          'flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br shadow-lg',
          iconGradients[variant]
        )}>
          <Icon className="h-5 w-5 text-white" />
        </div>

        {/* Trend badge */}
        {hasTrend && trendDirection !== 'neutral' && (
          <div className={cn(
            'flex items-center gap-0.5 px-2 py-1 rounded-lg text-xs font-bold tabular-nums',
            isPositive && 'bg-emerald-50 text-emerald-600',
            isNegative && 'bg-rose-50 text-rose-600',
          )}>
            {trendDirection === 'up' && <TrendingUp className="h-3 w-3" />}
            {trendDirection === 'down' && <TrendingDown className="h-3 w-3" />}
            {trendValue! > 0 ? '+' : ''}{trendValue}%
          </div>
        )}
        {hasTrend && trendDirection === 'neutral' && (
          <div className="flex items-center gap-0.5 px-2 py-1 rounded-lg text-xs font-medium tabular-nums bg-muted text-muted-foreground">
            <Minus className="h-3 w-3" />
            0%
          </div>
        )}
      </div>

      {/* Value */}
      <div className="relative">
        <div className="text-2xl font-extrabold tracking-tight tabular-nums text-foreground">
          {value}
        </div>
        <div className="text-xs font-medium text-muted-foreground mt-0.5 flex items-center gap-1">
          {label}
          {tooltip && (
            <span className="group/tip relative inline-flex">
              <HelpCircle className="h-3 w-3 text-muted-foreground/40 cursor-help hover:text-muted-foreground/70 transition-colors" />
              <span className="invisible group-hover/tip:visible absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 text-[11px] leading-snug font-normal text-popover-foreground bg-popover border border-border rounded-md shadow-md whitespace-nowrap max-w-[200px] text-center">
                {tooltip}
              </span>
            </span>
          )}
        </div>
        {subtitle && (
          <div className="text-[11px] text-muted-foreground/70 mt-1">{subtitle}</div>
        )}
      </div>

      {/* Sparkline with gradient fill */}
      {sparkline && sparkline.length > 1 && (
        <div className="relative mt-3 -mb-1 -mx-1">
          <MiniSparkline
            data={sparkline}
            color={isPositive ? '#10b981' : isNegative ? '#f43f5e' : '#94a3b8'}
            fillColor={isPositive ? 'rgba(16,185,129,0.1)' : isNegative ? 'rgba(244,63,94,0.1)' : 'rgba(148,163,184,0.05)'}
          />
        </div>
      )}
    </div>
  )
}

// ── SVG sparkline with area fill ──
function MiniSparkline({ data, color = '#94a3b8', fillColor = 'rgba(148,163,184,0.05)', height = 32 }: {
  data: number[]
  color?: string
  fillColor?: string
  height?: number
}) {
  if (data.length < 2) return null

  const w = 120
  const h = height
  const padding = 2
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const points = data.map((v, i) => {
    const x = padding + (i / (data.length - 1)) * (w - padding * 2)
    const y = h - padding - ((v - min) / range) * (h - padding * 2)
    return { x, y }
  })

  const linePoints = points.map(p => `${p.x},${p.y}`).join(' ')
  const areaPoints = `${points[0].x},${h} ${linePoints} ${points[points.length - 1].x},${h}`

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full"
      style={{ height }}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={`fill-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.15} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon
        points={areaPoints}
        fill={`url(#fill-${color.replace('#', '')})`}
      />
      <polyline
        points={linePoints}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* End dot */}
      <circle
        cx={points[points.length - 1].x}
        cy={points[points.length - 1].y}
        r={2.5}
        fill={color}
      />
    </svg>
  )
}
