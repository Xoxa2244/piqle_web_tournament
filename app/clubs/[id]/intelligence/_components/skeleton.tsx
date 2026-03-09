import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse bg-muted/60 rounded-md', className)} />
  )
}

export function MetricCardSkeleton() {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm space-y-3">
      <div className="flex items-start justify-between">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <Skeleton className="h-6 w-14 rounded-lg" />
      </div>
      <div className="space-y-1.5">
        <Skeleton className="h-7 w-20" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-24" />
      </div>
      <Skeleton className="h-8 w-full rounded-md" />
    </div>
  )
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* KPI Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <MetricCardSkeleton key={i} />
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border/60 bg-card p-5 shadow-sm space-y-3">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>

      {/* Occupancy Breakdown */}
      <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
        <div className="px-5 pt-5 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-4 w-36" />
          </div>
          <Skeleton className="h-8 w-48 rounded-lg" />
        </div>
        <div className="px-5 pb-5 flex items-end gap-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
              <Skeleton className="h-3 w-8" />
              <div className={cn('animate-pulse bg-muted/60 w-full rounded-lg')} style={{ height: 80 + i * 12 }} />
              <Skeleton className="h-3 w-6" />
            </div>
          ))}
        </div>
      </div>

      {/* Session Rankings */}
      <div className="grid md:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
            <div className="px-5 py-4 flex items-center gap-2.5">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-4 w-28" />
            </div>
            <div className="px-5 pb-4 space-y-3">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="flex items-center gap-3 py-2">
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-5 w-14 rounded-full" />
                  <Skeleton className="h-1.5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-10 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Player Activity */}
      <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
        <div className="px-5 pt-5 pb-3 flex items-center gap-2.5">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="px-5 pb-5 space-y-5">
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border/40 p-4 text-center space-y-2">
                <Skeleton className="h-8 w-8 rounded-lg mx-auto" />
                <Skeleton className="h-6 w-10 mx-auto" />
                <Skeleton className="h-3 w-16 mx-auto" />
              </div>
            ))}
          </div>
          <Skeleton className="h-3 w-24" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex justify-between">
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-3.5 w-12" />
              </div>
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border/60 bg-card p-4 flex items-center gap-4 shadow-sm">
          <Skeleton className="h-10 w-10 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  )
}
