import { Users, UserCheck, UserMinus, UserPlus } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
    <Card className={cn(className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Users className="h-4 w-4" />
          Player Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-5">
        {/* ── Mini stats row ── */}
        <div className="grid grid-cols-3 gap-3">
          <MiniStat
            icon={UserCheck}
            label="Active (14d)"
            value={activeCount}
            total={totalMembers}
            color="text-green-600"
          />
          <MiniStat
            icon={UserMinus}
            label="Inactive"
            value={inactiveCount}
            total={totalMembers}
            color="text-orange-500"
          />
          <MiniStat
            icon={UserPlus}
            label="New this month"
            value={newThisMonth}
            color="text-blue-600"
          />
        </div>

        {/* ── Skill Level Distribution ── */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
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

        {/* ── Format Preference ── */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Popular Formats (by bookings)
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
      </CardContent>
    </Card>
  )
}

function MiniStat({
  icon: Icon, label, value, total, color,
}: {
  icon: any; label: string; value: number; total?: number; color: string
}) {
  return (
    <div className="rounded-lg border bg-card p-3 text-center">
      <Icon className={cn('h-4 w-4 mx-auto mb-1', color)} />
      <div className="text-lg font-bold tabular-nums">{value}</div>
      <div className="text-[10px] text-muted-foreground leading-tight">{label}</div>
      {total !== undefined && total > 0 && (
        <div className="text-[10px] text-muted-foreground/60 tabular-nums">
          {Math.round((value / total) * 100)}%
        </div>
      )}
    </div>
  )
}
