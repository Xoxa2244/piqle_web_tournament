'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  ChevronLeft, DollarSign, TrendingUp, TrendingDown, AlertTriangle,
  Sparkles, Users, Calendar, Clock, ArrowUpRight, ArrowDownRight,
  Zap, Target, BarChart3, ArrowRight, UserMinus, ShoppingCart, Flame
} from 'lucide-react'

// ── Mock Data ──────────────────────────────────────────────────────────────

const revenueStats = {
  monthlyRevenue: 12_400,
  prevMonthRevenue: 11_800,
  lostRevenue: 3_200, // from empty slots this month
  recoveredByAI: 1_850, // slots filled by AI recommendations
  avgSessionPrice: 15, // per player per session
  totalSessions: 120,
  filledSessions: 89,
  avgOccupancy: 68,
  targetOccupancy: 85,
}

const weeklyBreakdown = [
  { day: 'Mon', slots: 24, filled: 18, revenue: 270, potential: 360 },
  { day: 'Tue', slots: 24, filled: 14, revenue: 210, potential: 360 },
  { day: 'Wed', slots: 32, filled: 26, revenue: 390, potential: 480 },
  { day: 'Thu', slots: 24, filled: 20, revenue: 300, potential: 360 },
  { day: 'Fri', slots: 32, filled: 30, revenue: 450, potential: 480 },
  { day: 'Sat', slots: 48, filled: 46, revenue: 690, potential: 720 },
  { day: 'Sun', slots: 40, filled: 34, revenue: 510, potential: 600 },
]

const pricingSuggestions = [
  {
    id: '1',
    session: 'Tuesday Morning Open Play',
    currentPrice: 15,
    suggestedPrice: 10,
    reason: 'Consistently under 40% capacity. A $5 discount could attract 4-6 more players.',
    occupancy: 35,
    potentialLift: '+$40-60/session',
    type: 'discount' as const,
  },
  {
    id: '2',
    session: 'Saturday Morning All Courts',
    currentPrice: 15,
    suggestedPrice: 20,
    reason: 'Always full with waitlist. Premium pricing justified by demand.',
    occupancy: 98,
    potentialLift: '+$80-100/session',
    type: 'premium' as const,
  },
  {
    id: '3',
    session: 'Wednesday Evening Drill',
    currentPrice: 25,
    suggestedPrice: 20,
    reason: 'Drill sessions dropping from 80% to 55% over 4 weeks. Small price cut may reverse trend.',
    occupancy: 55,
    potentialLift: '+$30-50/session',
    type: 'discount' as const,
  },
]

const churnRisks = [
  {
    id: '1',
    name: 'Maria Garcia',
    avatar: '👩',
    dupr: 3.8,
    trend: [4, 3, 2, 1, 0] as number[], // sessions per week over last 5 weeks
    riskLevel: 'high' as const,
    lifetimeValue: 1_240,
    lastVisit: '12 days ago',
    suggestedAction: 'Send personalized invite to Thursday clinic (her preferred format)',
  },
  {
    id: '2',
    name: 'James Wilson',
    avatar: '👨',
    dupr: 4.2,
    trend: [3, 3, 2, 2, 1] as number[],
    riskLevel: 'medium' as const,
    lifetimeValue: 2_180,
    lastVisit: '8 days ago',
    suggestedAction: 'Invite to competitive round robin — matches his DUPR bracket',
  },
  {
    id: '3',
    name: 'Lisa Park',
    avatar: '👩',
    dupr: 2.9,
    trend: [2, 2, 1, 0, 0] as number[],
    riskLevel: 'high' as const,
    lifetimeValue: 680,
    lastVisit: '18 days ago',
    suggestedAction: 'Offer free beginner clinic + buddy pass for a friend',
  },
]

const upsellOpportunities = [
  {
    id: '1',
    segment: 'Rising Intermediates',
    count: 8,
    description: '8 players with DUPR 3.0-3.5 who only do open play. Ready for clinics.',
    currentSpend: '$15/session',
    upsellTo: 'Advanced Clinic ($25/session)',
    potentialRevenue: '+$320/month',
    icon: '📈',
  },
  {
    id: '2',
    segment: 'Frequent Casuals',
    count: 12,
    description: '12 players booking 3+ times/week without a package. Losing money on per-session pricing.',
    currentSpend: '$45+/week',
    upsellTo: 'Unlimited Monthly ($149/mo)',
    potentialRevenue: '+$480/month',
    icon: '🔄',
  },
  {
    id: '3',
    segment: 'Social Connectors',
    count: 5,
    description: '5 members who regularly bring guests. High referral potential.',
    currentSpend: 'Varies',
    upsellTo: 'Ambassador Program (free sessions + referral bonus)',
    potentialRevenue: '+$750/month from referrals',
    icon: '🤝',
  },
  {
    id: '4',
    segment: 'League-Ready Players',
    count: 15,
    description: '15 competitive players (DUPR 4.0+) not in any league. Would pay premium.',
    currentSpend: '$15/session',
    upsellTo: 'Weekly League ($35/session)',
    potentialRevenue: '+$1,200/month',
    icon: '🏆',
  },
]

// ── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number) => `$${n.toLocaleString()}`

const TrendMini = ({ data, color }: { data: number[], color: string }) => {
  const max = Math.max(...data, 1)
  const h = 24
  const w = 60
  const step = w / (data.length - 1)
  const points = data.map((v, i) => `${i * step},${h - (v / max) * h}`).join(' ')
  return (
    <svg width={w} height={h} className="flex-shrink-0">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ── Component ──────────────────────────────────────────────────────────────

export default function RevenueDashboardPage() {
  const params = useParams()
  const clubId = params.id as string
  const [activeTab, setActiveTab] = useState<'overview' | 'pricing' | 'churn' | 'upsell'>('overview')

  const revenueGrowth = ((revenueStats.monthlyRevenue - revenueStats.prevMonthRevenue) / revenueStats.prevMonthRevenue * 100).toFixed(1)
  const isGrowthPositive = revenueStats.monthlyRevenue >= revenueStats.prevMonthRevenue
  const recoveryRate = Math.round((revenueStats.recoveredByAI / revenueStats.lostRevenue) * 100)

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-4 mb-6">
            <Link
              href={`/clubs/${clubId}/intelligence`}
              className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="text-sm">Back to Intelligence</span>
            </Link>
          </div>

          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-gradient-to-br from-green-500/20 to-emerald-500/10 rounded-lg">
                  <DollarSign className="w-6 h-6 text-green-600" />
                </div>
                <h1 className="text-3xl font-bold text-foreground">Revenue Intelligence</h1>
              </div>
              <p className="text-muted-foreground">AI-powered revenue optimization and growth opportunities</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-6 border-b border-border -mb-[1px]">
            {[
              { key: 'overview', label: 'Overview', icon: BarChart3 },
              { key: 'pricing', label: 'Dynamic Pricing', icon: DollarSign },
              { key: 'churn', label: 'Churn Risk', icon: UserMinus },
              { key: 'upsell', label: 'Upsell', icon: ShoppingCart },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as typeof activeTab)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                  activeTab === tab.key
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* ════════════ OVERVIEW TAB ════════════ */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* Top Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-muted-foreground">Monthly Revenue</p>
                    <DollarSign className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <p className="text-3xl font-bold">{fmt(revenueStats.monthlyRevenue)}</p>
                  <div className={cn('flex items-center gap-1 mt-1 text-sm', isGrowthPositive ? 'text-green-600' : 'text-red-600')}>
                    {isGrowthPositive ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                    {revenueGrowth}% vs last month
                  </div>
                </CardContent>
              </Card>

              <Card className="border-red-200">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-muted-foreground">Lost to Empty Slots</p>
                    <TrendingDown className="w-4 h-4 text-red-500" />
                  </div>
                  <p className="text-3xl font-bold text-red-600">{fmt(revenueStats.lostRevenue)}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {Math.round(revenueStats.lostRevenue / revenueStats.avgSessionPrice)} empty player slots
                  </p>
                </CardContent>
              </Card>

              <Card className="border-green-200">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-muted-foreground">Recovered by AI</p>
                    <Sparkles className="w-4 h-4 text-green-500" />
                  </div>
                  <p className="text-3xl font-bold text-green-600">{fmt(revenueStats.recoveredByAI)}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {recoveryRate}% recovery rate
                  </p>
                </CardContent>
              </Card>

              <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-amber-800">Untapped Potential</p>
                    <Flame className="w-4 h-4 text-amber-500" />
                  </div>
                  <p className="text-3xl font-bold text-amber-700">{fmt(revenueStats.lostRevenue - revenueStats.recoveredByAI)}</p>
                  <p className="text-sm text-amber-600 mt-1">
                    still recoverable this month
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Weekly Revenue Chart (simplified bar chart) */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Weekly Revenue by Day</CardTitle>
                <CardDescription>Actual revenue vs potential if all slots were filled</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {weeklyBreakdown.map(day => {
                    const pctFilled = Math.round((day.revenue / day.potential) * 100)
                    const gap = day.potential - day.revenue
                    return (
                      <div key={day.day} className="flex items-center gap-4">
                        <span className="text-sm font-medium w-8 text-muted-foreground">{day.day}</span>
                        <div className="flex-1">
                          <div className="relative w-full bg-secondary rounded-full h-6">
                            {/* Potential (background) */}
                            <div
                              className="absolute inset-y-0 left-0 bg-red-100 rounded-full"
                              style={{ width: '100%' }}
                            />
                            {/* Actual (foreground) */}
                            <div
                              className={cn(
                                'absolute inset-y-0 left-0 rounded-full transition-all',
                                pctFilled >= 80 ? 'bg-green-500' : pctFilled >= 60 ? 'bg-yellow-500' : 'bg-orange-500'
                              )}
                              style={{ width: `${pctFilled}%` }}
                            />
                            <div className="absolute inset-0 flex items-center px-3">
                              <span className="text-xs font-medium text-white drop-shadow-sm">
                                {fmt(day.revenue)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right w-24 flex-shrink-0">
                          <span className="text-xs text-muted-foreground">{pctFilled}%</span>
                          {gap > 0 && (
                            <span className="text-xs text-red-500 ml-2">-{fmt(gap)}</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-green-500" />
                    Actual Revenue
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-red-100" />
                    Lost Revenue
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Occupancy Target */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Occupancy Target</CardTitle>
                    <CardDescription>Current: {revenueStats.avgOccupancy}% → Target: {revenueStats.targetOccupancy}%</CardDescription>
                  </div>
                  <Badge variant="outline" className="text-orange-600 border-orange-200">
                    {revenueStats.targetOccupancy - revenueStats.avgOccupancy}% gap
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="relative w-full bg-secondary rounded-full h-4 mb-3">
                  <div
                    className="bg-primary rounded-full h-4 transition-all"
                    style={{ width: `${revenueStats.avgOccupancy}%` }}
                  />
                  {/* Target marker */}
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-foreground"
                    style={{ left: `${revenueStats.targetOccupancy}%` }}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  Reaching {revenueStats.targetOccupancy}% occupancy would add approximately{' '}
                  <span className="font-semibold text-green-600">
                    {fmt(Math.round(revenueStats.lostRevenue * ((revenueStats.targetOccupancy - revenueStats.avgOccupancy) / (100 - revenueStats.avgOccupancy))))}
                  </span>
                  {' '}in monthly revenue.
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ════════════ DYNAMIC PRICING TAB ════════════ */}
        {activeTab === 'pricing' && (
          <div className="space-y-6">
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <Zap className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-blue-900">AI Pricing Recommendations</p>
                    <p className="text-xs text-blue-700 mt-1">
                      Based on occupancy patterns, demand curves, and member behavior analysis.
                      Estimated total impact: <span className="font-semibold">+$150-210/week</span>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {pricingSuggestions.map(item => (
              <Card key={item.id}>
                <CardContent className="py-5">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-sm">{item.session}</h3>
                        <Badge className={cn(
                          'text-xs',
                          item.type === 'discount'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-100 text-amber-800'
                        )}>
                          {item.type === 'discount' ? 'Discount to Fill' : 'Premium Pricing'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">{item.reason}</p>
                      <div className="flex items-center gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Current: </span>
                          <span className="font-medium">${item.currentPrice}</span>
                        </div>
                        <ArrowRight className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <span className="text-muted-foreground">Suggested: </span>
                          <span className={cn('font-semibold', item.type === 'discount' ? 'text-blue-600' : 'text-amber-600')}>
                            ${item.suggestedPrice}
                          </span>
                        </div>
                        <Badge variant="outline" className="text-green-600 border-green-200">
                          {item.potentialLift}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Current Occupancy</p>
                        <p className={cn(
                          'text-lg font-bold',
                          item.occupancy < 50 ? 'text-red-600' : item.occupancy < 80 ? 'text-orange-600' : 'text-green-600'
                        )}>
                          {item.occupancy}%
                        </p>
                      </div>
                      <Button size="sm" variant="outline">
                        Apply Price
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ════════════ CHURN RISK TAB ════════════ */}
        {activeTab === 'churn' && (
          <div className="space-y-6">
            <Card className="bg-red-50 border-red-200">
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-red-900">
                      {churnRisks.length} Members at Risk of Churning
                    </p>
                    <p className="text-xs text-red-700 mt-1">
                      Combined lifetime value: {fmt(churnRisks.reduce((s, m) => s + m.lifetimeValue, 0))}.
                      AI detected declining booking patterns before they became inactive.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {churnRisks.map(member => (
              <Card key={member.id} className={cn(
                member.riskLevel === 'high' ? 'border-red-200' : 'border-amber-200'
              )}>
                <CardContent className="py-5">
                  <div className="flex items-start gap-4">
                    <div className="text-2xl">{member.avatar}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-sm">{member.name}</h3>
                        <Badge className={cn(
                          'text-xs',
                          member.riskLevel === 'high'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-amber-100 text-amber-800'
                        )}>
                          {member.riskLevel} risk
                        </Badge>
                        <Badge variant="outline" className="text-xs">DUPR {member.dupr}</Badge>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
                        <span>Last visit: {member.lastVisit}</span>
                        <span>Lifetime value: {fmt(member.lifetimeValue)}</span>
                      </div>
                      {/* Booking trend */}
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-xs text-muted-foreground">Booking trend:</span>
                        <TrendMini
                          data={member.trend}
                          color={member.riskLevel === 'high' ? '#ef4444' : '#f59e0b'}
                        />
                        <span className="text-xs text-muted-foreground">
                          {member.trend[0]} → {member.trend[member.trend.length - 1]} sessions/week
                        </span>
                      </div>
                      {/* AI Suggestion */}
                      <div className="bg-muted rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Sparkles className="w-3.5 h-3.5 text-primary" />
                          <span className="text-xs font-medium">AI Recommendation</span>
                        </div>
                        <p className="text-sm text-muted-foreground">{member.suggestedAction}</p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      <Button size="sm">
                        <Sparkles className="w-3.5 h-3.5 mr-1" />
                        Send Invite
                      </Button>
                      <Button size="sm" variant="outline">
                        View Profile
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ════════════ UPSELL TAB ════════════ */}
        {activeTab === 'upsell' && (
          <div className="space-y-6">
            <Card className="bg-purple-50 border-purple-200">
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <TrendingUp className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-purple-900">
                      AI-Identified Upsell Segments
                    </p>
                    <p className="text-xs text-purple-700 mt-1">
                      Total potential: <span className="font-semibold">
                        +{fmt(upsellOpportunities.reduce((s, o) => {
                          const num = parseInt(o.potentialRevenue.replace(/[^0-9]/g, ''))
                          return s + (isNaN(num) ? 0 : num)
                        }, 0))}/month
                      </span> from {upsellOpportunities.reduce((s, o) => s + o.count, 0)} members across {upsellOpportunities.length} segments.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {upsellOpportunities.map(item => (
                <Card key={item.id} className="flex flex-col">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{item.icon}</span>
                      <div>
                        <CardTitle className="text-base">{item.segment}</CardTitle>
                        <CardDescription>{item.count} members</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <p className="text-sm text-muted-foreground mb-4">{item.description}</p>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Current</span>
                        <span>{item.currentSpend}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Upsell to</span>
                        <span className="font-medium">{item.upsellTo}</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t">
                        <span className="text-muted-foreground">Potential</span>
                        <span className="font-semibold text-green-600">{item.potentialRevenue}</span>
                      </div>
                    </div>
                  </CardContent>
                  <div className="px-6 py-4 border-t border-border">
                    <Button variant="outline" className="w-full" size="sm">
                      <Sparkles className="w-3.5 h-3.5 mr-2" />
                      Create Campaign
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
