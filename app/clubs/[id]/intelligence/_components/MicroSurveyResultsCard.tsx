'use client'

/**
 * MicroSurveyResultsCard — aggregated breakdown of micro-survey responses
 * for one survey type. Currently rendered on Settings → Automation for the
 * Newcomer Day-12 survey ("what's holding new members back?").
 *
 * Same component shape will work for all future surveys (Снижение
 * активности, Спящий, etc.) — pass a different surveyType prop and a
 * different label dictionary.
 *
 * Empty state: shows a friendly "no responses yet" panel rather than
 * empty bars, since most clubs will see this for the first time when
 * <10 newcomers have hit Day 12.
 */

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { trpc } from '@/lib/trpc'
import { ClipboardList, MessageSquare } from 'lucide-react'

interface OptionLabel {
  label: string
  hint: string
}

/** Human-readable labels for the 5 newcomer Day-12 survey options.
 *  Other survey types have their own dictionaries below. */
const NEWCOMER_DAY12_LABELS: Record<string, OptionLabel> = {
  schedule: {
    label: 'Schedule does not fit',
    hint: 'They want different times — useful for new sessions or a clinic at a different hour.',
  },
  level: {
    label: 'Not sure of my level',
    hint: 'Skill anxiety. Worth surfacing a Beginner / Skill Assessment session.',
  },
  partners: {
    label: 'No partner / nobody to play with',
    hint: 'Social isolation. Group sessions or a Meet-the-Pro intro could help.',
  },
  price: {
    label: 'Pricing concerns',
    hint: 'Member-only price-sensitive. Consider a discount on the first month or trial extension.',
  },
  other: {
    label: 'Something else',
    hint: 'Open-ended. Future Phase 2.5 will let them tell us what specifically.',
  },
}

/** Labels for the 4-option Day-1 declining-reactivation survey. Each hint
 *  suggests a different operator response — the segment exists precisely to
 *  separate "we can fix this" answers (schedule) from "let it ride" ones
 *  (injury, busy, pause). */
const DECLINING_DAY1_LABELS: Record<string, OptionLabel> = {
  injury: {
    label: 'Injury or health issue',
    hint: 'Often = needs a pause, not a churn signal. Soft check-in in 30 days; do not push incentives.',
  },
  busy: {
    label: 'Slammed at work / life',
    hint: 'Temporary external. A flexible "freeze" plan or short pause-and-resume offer keeps them.',
  },
  schedule: {
    label: 'Schedule does not work',
    hint: 'Same signal as Newcomer: programming hint — they want different times. Worth a programming review.',
  },
  pause: {
    label: 'Just taking a pause',
    hint: 'Honest answer — respect it. Soft check-in in 30 days; no escalation needed.',
  },
}

/** Labels for the 4-option Day-14 sleeping-reactivation survey. Different
 *  vocabulary than declining — sleeping members have been gone longer,
 *  so reasons skew toward longer-term life changes vs short-term excuses. */
const SLEEPING_DAY14_LABELS: Record<string, OptionLabel> = {
  planschanged: {
    label: 'My plans changed',
    hint: 'Life event (move, job change, etc). Probably not coming back — respect the signal, no further escalation.',
  },
  time: {
    label: 'Cannot find a good time',
    hint: 'Real friction. Worth a programming review of less-popular slots — could you add a session at their old preferred time?',
  },
  schedule: {
    label: 'Schedule does not work',
    hint: 'Same as Declining hint — programming gap. Cross-reference with Newcomer Day 12 schedule answers for confirmation.',
  },
  other: {
    label: 'Something else',
    hint: 'Open-ended. Future free-text follow-up will let them tell you specifically.',
  },
}

const SURVEY_COPY: Record<
  'onboarding_day12' | 'declining_reactivation' | 'sleeping_reactivation',
  { title: string; description: (windowDays: number) => string; labels: Record<string, OptionLabel> }
> = {
  onboarding_day12: {
    title: 'Newcomer survey — what is holding new members back?',
    description: (w) =>
      `Answers from the Day 12 onboarding email sent to members with 0 bookings in their first 12 days. Last ${w} days.`,
    labels: NEWCOMER_DAY12_LABELS,
  },
  declining_reactivation: {
    title: 'Declining-activity survey — why did regulars drop off?',
    description: (w) =>
      `Answers from the Day 1 email sent when a member who was booking ≥3 sessions per month suddenly drops to 0–1. Last ${w} days.`,
    labels: DECLINING_DAY1_LABELS,
  },
  sleeping_reactivation: {
    title: 'Sleeping-member survey — why have they been quiet?',
    description: (w) =>
      `Answers from the Day 14 follow-up sent to members who have been inactive for 30–90 days while their subscription is still active. Last ${w} days.`,
    labels: SLEEPING_DAY14_LABELS,
  },
}

interface MicroSurveyResultsCardProps {
  clubId: string
  surveyType?: 'onboarding_day12' | 'declining_reactivation' | 'sleeping_reactivation'
  /** Window in days to look back. Default 90 — wide enough that a small
   *  club still has at least a handful of responses to display. */
  windowDays?: number
}

export function MicroSurveyResultsCard({
  clubId,
  surveyType = 'onboarding_day12',
  windowDays = 90,
}: MicroSurveyResultsCardProps) {
  const { data, isLoading } = trpc.intelligence.getMicroSurveyResults.useQuery({
    clubId,
    surveyType,
    windowDays,
  })

  const copy = SURVEY_COPY[surveyType]
  const labels = copy.labels

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <ClipboardList className="h-5 w-5 text-violet-500 mt-0.5" />
          <div className="flex-1">
            <CardTitle className="text-base">{copy.title}</CardTitle>
            <CardDescription>{copy.description(windowDays)}</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : !data || data.totalSurveyEmailsSent === 0 ? (
          <EmptyPanel windowDays={windowDays} surveyType={surveyType} />
        ) : data.totalResponses === 0 ? (
          <NoResponsesYetPanel
            sentCount={data.totalSurveyEmailsSent}
            windowDays={windowDays}
          />
        ) : (
          <ResultsBreakdown data={data} labels={labels} />
        )}
      </CardContent>
    </Card>
  )
}

const EMPTY_COPY: Record<'onboarding_day12' | 'declining_reactivation' | 'sleeping_reactivation', (w: number) => string> = {
  onboarding_day12: (w) =>
    `No new members have hit Day 12 with zero bookings in the last ${w} days. The survey only goes out to stalled newcomers — engaged ones get a congrats email instead.`,
  declining_reactivation: (w) =>
    `No regular members have dropped from ≥3 sessions per month down to 0–1 in the last ${w} days. The survey only goes out when this pattern is detected.`,
  sleeping_reactivation: (w) =>
    `No sleeping members have hit the Day 14 follow-up in the last ${w} days. The survey only goes to members 30–90 days inactive who didn't book or click after the first re-engagement email.`,
}

function EmptyPanel({
  windowDays,
  surveyType,
}: {
  windowDays: number
  surveyType: 'onboarding_day12' | 'declining_reactivation' | 'sleeping_reactivation'
}) {
  return (
    <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
      <div className="font-medium text-slate-700 mb-1">No surveys sent yet</div>
      {EMPTY_COPY[surveyType](windowDays)}
    </div>
  )
}

function NoResponsesYetPanel({ sentCount, windowDays }: { sentCount: number; windowDays: number }) {
  return (
    <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
      <div className="font-medium text-slate-700 mb-1">
        {sentCount} survey{sentCount === 1 ? '' : 's'} sent · 0 responses yet
      </div>
      Most responses arrive in the 3 days after the email goes out. Check back soon — last {windowDays} days.
    </div>
  )
}

function ResultsBreakdown({
  data,
  labels,
}: {
  data: {
    totalSurveyEmailsSent: number
    totalResponses: number
    responseRatePct: number
    breakdown: Array<{ option: string; count: number }>
  }
  labels: Record<string, OptionLabel>
}) {
  const maxCount = Math.max(...data.breakdown.map((b) => b.count), 1)

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm">
        <div>
          <span className="font-semibold text-slate-900">{data.totalResponses}</span>{' '}
          <span className="text-muted-foreground">responses</span>
        </div>
        <div>
          <span className="font-semibold text-slate-900">{data.responseRatePct}%</span>{' '}
          <span className="text-muted-foreground">response rate</span>
        </div>
        <div className="text-muted-foreground">
          {data.totalSurveyEmailsSent} survey email{data.totalSurveyEmailsSent === 1 ? '' : 's'} sent
        </div>
      </div>

      {/* Per-option breakdown bars */}
      <div className="space-y-3">
        {data.breakdown.map((row) => {
          const meta = labels[row.option]
          const widthPct = (row.count / maxCount) * 100
          return (
            <div key={row.option}>
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <div className="text-sm font-medium text-slate-800">
                  {meta?.label ?? row.option}
                </div>
                <div className="text-sm tabular-nums text-slate-700">
                  {row.count} ({Math.round((row.count / data.totalResponses) * 100)}%)
                </div>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-violet-500 rounded-full transition-all"
                  style={{ width: `${widthPct}%` }}
                />
              </div>
              {meta?.hint && (
                <div className="text-xs text-muted-foreground mt-1 flex items-start gap-1.5">
                  <MessageSquare className="h-3 w-3 mt-0.5 shrink-0" />
                  <span>{meta.hint}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
