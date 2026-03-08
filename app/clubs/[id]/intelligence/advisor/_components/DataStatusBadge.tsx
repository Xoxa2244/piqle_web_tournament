'use client'

import { Badge } from '@/components/ui/badge'
import { Database, AlertCircle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ClubDataStatus } from '../_hooks/useAdvisorState'

export function DataStatusBadge({ status }: { status: ClubDataStatus | null }) {
  if (!status || !status.hasData) {
    return (
      <Badge variant="outline" className="gap-1 text-red-600 border-red-200 bg-red-50 dark:bg-red-950/20 dark:text-red-400 dark:border-red-800">
        <AlertCircle className="w-3 h-3" />
        No data
      </Badge>
    )
  }

  const daysSinceImport = status.lastImportAt
    ? Math.floor((Date.now() - new Date(status.lastImportAt).getTime()) / (1000 * 60 * 60 * 24))
    : null

  const isFresh = daysSinceImport !== null && daysSinceImport < 7
  const isStale = daysSinceImport !== null && daysSinceImport >= 7 && daysSinceImport < 30
  const isOld = daysSinceImport !== null && daysSinceImport >= 30

  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1',
        isFresh && 'text-green-700 border-green-300 bg-green-50 dark:bg-green-950/20 dark:text-green-400 dark:border-green-700',
        isStale && 'text-yellow-700 border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20 dark:text-yellow-400 dark:border-yellow-700',
        isOld && 'text-red-600 border-red-200 bg-red-50 dark:bg-red-950/20 dark:text-red-400 dark:border-red-800'
      )}
    >
      {isFresh ? <Database className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
      {daysSinceImport === 0 ? 'Updated today' :
       daysSinceImport === 1 ? 'Updated yesterday' :
       daysSinceImport !== null ? `${daysSinceImport}d ago` : 'No data'}
      {status.sessionCount > 0 && (
        <span className="text-muted-foreground">
          ({status.sessionCount} sessions)
        </span>
      )}
    </Badge>
  )
}
