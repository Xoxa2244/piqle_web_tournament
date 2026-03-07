import { type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MetricCardProps {
  label: string
  value: string | number
  subtitle?: string
  icon: LucideIcon
  trend?: 'up' | 'down' | 'neutral'
  variant?: 'default' | 'danger' | 'success' | 'warning'
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

export function MetricCard({ label, value, subtitle, icon: Icon, variant = 'default' }: MetricCardProps) {
  return (
    <div className={cn('rounded-lg border p-4 transition-colors', variantStyles[variant])}>
      <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-wide mb-2">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className={cn('text-2xl font-bold tabular-nums', valueStyles[variant])}>
        {value}
      </div>
      {subtitle && (
        <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>
      )}
    </div>
  )
}
