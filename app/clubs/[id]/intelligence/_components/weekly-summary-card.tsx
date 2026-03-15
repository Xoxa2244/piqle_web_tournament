'use client'

import { useState, useRef, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Sparkles, ChevronDown, ChevronUp, TrendingUp, TrendingDown,
  Minus, AlertTriangle, CheckCircle2, Wrench, BarChart3, RefreshCw, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ──

export interface WeeklySummaryContent {
  executiveSummary: string
  wins: string[]
  risks: string[]
  actionsTaken: string[]
  keyNumbers: {
    label: string
    thisWeek: number | string
    lastWeek: number | string
    changePercent: number
    direction: 'up' | 'down' | 'neutral'
  }[]
  generatedAt: string
  weekLabel: string
}

interface WeeklySummaryCardProps {
  summary: WeeklySummaryContent | null
  generatedAt: string | null
  isGenerating: boolean
  onRegenerate: () => void
  isDemo?: boolean
}

// ── Section helper ──

function SummarySection({
  icon: Icon, title, items, colorClass, dotClass,
}: {
  icon: any; title: string; items: string[]; colorClass: string; dotClass: string
}) {
  if (!items.length) return null
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className={cn('h-4 w-4', colorClass)} />
        <span className="text-xs font-semibold text-foreground">{title}</span>
      </div>
      <ul className="space-y-1 ml-6">
        {items.map((item, i) => (
          <li key={i} className="text-xs text-muted-foreground leading-relaxed flex items-start gap-1.5">
            <span className={cn('mt-1.5 w-1.5 h-1.5 rounded-full shrink-0', dotClass)} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Main component ──

export function WeeklySummaryCard({
  summary, generatedAt, isGenerating, onRegenerate, isDemo,
}: WeeklySummaryCardProps) {
  const [expanded, setExpanded] = useState(false)
  const hasTriggered = useRef(false)

  // Auto-generate on first load if no summary exists (prod only)
  useEffect(() => {
    if (!summary && !isDemo && !isGenerating && !hasTriggered.current) {
      hasTriggered.current = true
      onRegenerate()
    }
  }, [summary, isDemo, isGenerating, onRegenerate])

  // Loading state
  if (isGenerating && !summary) {
    return (
      <Card className="rounded-xl border-border/60 shadow-sm">
        <CardContent className="flex items-center gap-4 p-5">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/25 shrink-0">
            <Loader2 className="h-5 w-5 text-white animate-spin" />
          </div>
          <div>
            <p className="font-bold text-sm">Generating your AI summary...</p>
            <p className="text-xs text-muted-foreground">Analyzing campaign performance, member health, and engagement data</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Empty state (fallback if auto-generate didn't fire)
  if (!summary) {
    return (
      <Card className="rounded-xl border-border/60 shadow-sm">
        <CardContent className="flex items-center justify-between p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-sm">Weekly AI Summary</p>
              <p className="text-xs text-muted-foreground">No summary generated yet</p>
            </div>
          </div>
          <Button size="sm" onClick={onRegenerate} disabled={isGenerating} className="gap-1.5">
            {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Generate
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="rounded-xl border-border/60 shadow-sm overflow-hidden">
      {/* Header — always visible */}
      <div
        className="flex items-start justify-between p-5 pb-3 cursor-pointer hover:bg-muted/20 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/25 shrink-0">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-bold text-sm">Weekly AI Summary</h3>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{summary.weekLabel}</Badge>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{summary.executiveSummary}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 ml-3 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => { e.stopPropagation(); onRegenerate() }}
            disabled={isGenerating}
            className="h-8 w-8 p-0"
          >
            {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {/* Expandable sections */}
      {expanded && (
        <CardContent className="pt-0 pb-5 px-5 space-y-4">
          {/* Wins */}
          <SummarySection
            icon={CheckCircle2}
            title="Wins"
            items={summary.wins}
            colorClass="text-emerald-600"
            dotClass="bg-emerald-500"
          />

          {/* Risks */}
          <SummarySection
            icon={AlertTriangle}
            title="Needs Attention"
            items={summary.risks}
            colorClass="text-orange-600"
            dotClass="bg-orange-500"
          />

          {/* Actions Taken */}
          <SummarySection
            icon={Wrench}
            title="Actions Taken"
            items={summary.actionsTaken}
            colorClass="text-blue-600"
            dotClass="bg-blue-500"
          />

          {/* Key Numbers */}
          {summary.keyNumbers.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="h-4 w-4 text-violet-600" />
                <span className="text-xs font-semibold text-foreground">Key Numbers</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {summary.keyNumbers.map((kn) => {
                  const isPositive = kn.direction === 'up'
                  const isNegative = kn.direction === 'down'
                  // "At-Risk Members" going up is bad
                  const isBadUp = kn.label.toLowerCase().includes('risk') || kn.label.toLowerCase().includes('bounce')
                  const trendColor = isBadUp
                    ? (isPositive ? 'text-rose-600' : isNegative ? 'text-emerald-600' : 'text-muted-foreground')
                    : (isPositive ? 'text-emerald-600' : isNegative ? 'text-rose-600' : 'text-muted-foreground')

                  return (
                    <div key={kn.label} className="rounded-lg border border-border/40 p-2.5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{kn.label}</p>
                      <p className="text-lg font-bold tabular-nums">{kn.thisWeek}</p>
                      <div className={cn('flex items-center gap-0.5 text-[11px] font-semibold', trendColor)}>
                        {isPositive ? <TrendingUp className="h-3 w-3" /> : isNegative ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                        {kn.changePercent > 0 ? '+' : ''}{kn.changePercent.toFixed(1)}%
                        <span className="text-muted-foreground font-normal ml-0.5">vs {kn.lastWeek}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Footer */}
          {generatedAt && (
            <p className="text-[10px] text-muted-foreground text-right pt-1">
              Generated {new Date(generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </CardContent>
      )}
    </Card>
  )
}
