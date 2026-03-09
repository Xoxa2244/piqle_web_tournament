import { Calendar, Trophy, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
    <Card className={cn(
      isTop ? 'border-green-200 bg-green-50/20' : 'border-orange-200 bg-orange-50/20',
      className,
    )}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          {isTop ? (
            <Trophy className="h-4 w-4 text-green-600" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          )}
          {isTop ? 'Top Sessions' : 'Needs Attention'}
          <Badge variant="secondary" className="ml-1 text-xs font-mono">
            {sessions.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {sessions.length === 0 ? (
          <div className="text-center py-4 text-sm text-muted-foreground">
            No sessions to show.
          </div>
        ) : (
          <div className="divide-y">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm truncate">{session.title}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                    <Calendar className="h-3 w-3 shrink-0" />
                    {new Date(session.date).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                    <span className="text-muted-foreground/40">|</span>
                    {session.startTime}–{session.endTime}
                    {session.courtName && (
                      <>
                        <span className="text-muted-foreground/40">|</span>
                        {session.courtName}
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-3">
                  <Badge variant="outline" className="text-[10px] font-normal">
                    {formatLabels[session.format] || session.format}
                  </Badge>
                  <div className="w-16">
                    <OccupancyBar value={session.occupancyPercent} />
                  </div>
                  <OccupancyBadge value={session.occupancyPercent} />
                  <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">
                    {session.confirmedCount}/{session.maxPlayers}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
