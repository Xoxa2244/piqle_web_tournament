import { Users, UserCheck, UserMinus, UserPlus } from 'lucide-react'
import { HorizontalBarChart } from './charts'
import type { PlayerDistribution } from '@/types/intelligence'
import { cn } from '@/lib/utils'

interface PlayerActivityProps {
  activeCount: number
  inactiveCount: number
  newThisMonth: number
  bySkillLevel: PlayerDistribution[]
  byFormat: PlayerDistribution[]
  className?: string
}

export function PlayerActivity({
  activeCount, inactiveCount, newThisMonth,
  bySkillLevel, byFormat, className,
}: PlayerActivityProps) {
  const totalMembers = activeCount + inactiveCount

  return (
    <div className={cn('rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden', className)}>
      {/* Header */}
      <div className="px-5 pt-5 pb-3 flex items-center gap-2.5">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 shadow-md shadow-cyan-500/20">
          <Users className="h-4 w-4 text-white" />
        </div>
        <h3 className="text-sm font-bold text-foreground">Player Activity</h3>
      </div>

      <div className="px-5 pb-5 space-y-5">
        {/* Mini stats row */}
        <div className="grid grid-cols-3 gap-3">
          <MiniStat
            icon={UserCheck}
            label="Active (14d)"
            value={activeCount}
            total={totalMembers}
            gradient="from-emerald-500 to-green-600"
            bgColor="bg-emerald-50"
          />
          <MiniStat
            icon={UserMinus}
            label="Inactive"
            value={inactiveCount}
            total={totalMembers}
            gradient="from-orange-500 to-amber-600"
            bgColor="bg-orange-50"
          />
          <MiniStat
            icon={UserPlus}
            label="New this month"
            value={newThisMonth}
            gradient="from-blue-500 to-indigo-600"
            bgColor="bg-blue-50"
          />
        </div>

        {/* Skill Level Distribution */}
        {bySkillLevel.length > 0 && (
          <div>
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
              By Skill Level
            </h4>
            <HorizontalBarChart
              items={bySkillLevel.map(d => ({
                label: d.label,
                value: d.percent,
                sublabel: `${d.count} members`,
              }))}
              maxValue={100}
            />
          </div>
        )}

        {/* Format Preference */}
        {byFormat.length > 0 && (
          <div>
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
              Popular Formats
            </h4>
            <HorizontalBarChart
              items={byFormat.map(d => ({
                label: d.label,
                value: d.percent,
                sublabel: `${d.count} bookings`,
              }))}
              maxValue={100}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function MiniStat({
  icon: Icon, label, value, total, gradient, bgColor,
}: {
  icon: any; label: string; value: number; total?: number; gradient: string; bgColor: string
}) {
  return (
    <div className={cn('rounded-xl border border-border/40 p-4 text-center relative overflow-hidden group hover:shadow-sm transition-shadow')}>
      {/* Subtle background */}
      <div className={cn('absolute inset-0 opacity-[0.04]', bgColor)} />
      <div className="relative">
        <div className={cn(
          'w-8 h-8 rounded-lg bg-gradient-to-br mx-auto mb-2 flex items-center justify-center shadow-sm',
          gradient
        )}>
          <Icon className="h-4 w-4 text-white" />
        </div>
        <div className="text-xl font-extrabold tabular-nums">{value}</div>
        <div className="text-[10px] font-medium text-muted-foreground leading-tight mt-0.5">{label}</div>
        {total !== undefined && total > 0 && (
          <div className="text-[10px] text-muted-foreground/50 tabular-nums font-semibold mt-0.5">
            {Math.round((value / total) * 100)}%
          </div>
        )}
      </div>
    </div>
  )
}
