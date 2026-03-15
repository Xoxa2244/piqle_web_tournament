import { Calendar, Trophy, AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { OccupancyBar, OccupancyBadge } from './charts'
import type { SessionRanking } from '@/types/intelligence'
import { cn } from '@/lib/utils'

const formatLabels: Record<string, string> = {
  OPEN_PLAY: 'Open Play',
  CLINIC: 'Clinic',
  DRILL: 'Drill',
  LEAGUE_PLAY: 'League',
  SOCIAL: 'Social',
}

interface SessionTableProps {
  sessions: SessionRanking[]
  variant: 'top' | 'problematic'
  className?: string
}

export function SessionTable({ sessions, variant, className }: SessionTableProps) {
  const isTop = variant === 'top'

  return (
    <div className={cn(
      'rounded-xl border bg-card shadow-sm overflow-hidden',
      isTop ? 'border-emerald-200/60' : 'border-orange-200/60',
      className,
    )}>
      {/* Header with gradient accent */}
      <div className={cn(
        'px-5 py-4 flex items-center gap-2.5',
        isTop ? 'bg-gradient-to-r from-emerald-50/80 to-transparent' : 'bg-gradient-to-r from-orange-50/80 to-transparent',
      )}>
        <div className={cn(
          'flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br shadow-md',
          isTop
            ? 'from-emerald-500 to-green-600 shadow-emerald-500/20'
            : 'from-orange-500 to-amber-600 shadow-orange-500/20'
        )}>
          {isTop ? (
            <Trophy className="h-4 w-4 text-white" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-white" />
          )}
        </div>
        <h3 className="text-sm font-bold text-foreground">
          {isTop ? 'Top Sessions' : 'Needs Attention'}
        </h3>
        <Badge variant="secondary" className="ml-auto text-xs font-bold tabular-nums bg-muted/80">
          {sessions.length}
        </Badge>
      </div>

      {/* Content */}
      <div className="px-5 pb-4">
        {sessions.length === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground">
            No sessions to show.
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between py-3 first:pt-1 last:pb-0 group"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm truncate group-hover:text-foreground transition-colors">
                    {session.title}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                    <Calendar className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                    {new Date(session.date).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                    <span className="text-muted-foreground/30">|</span>
                    {session.startTime}–{session.endTime}
                    {session.courtName && (
                      <>
                        <span className="text-muted-foreground/30">|</span>
                        {session.courtName}
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-3">
                  <Badge variant="outline" className="text-[10px] font-medium border-border/40 text-muted-foreground">
                    {formatLabels[session.format] || session.format}
                  </Badge>
                  <div className="w-16">
                    <OccupancyBar value={session.occupancyPercent} />
                  </div>
                  <OccupancyBadge value={session.occupancyPercent} />
                  <span className="text-xs text-muted-foreground tabular-nums w-8 text-right font-medium">
                    {session.confirmedCount}/{session.maxPlayers}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
