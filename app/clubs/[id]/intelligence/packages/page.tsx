'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  ChevronLeft, Package, Sparkles, Users, Clock, DollarSign,
  TrendingUp, TrendingDown, CheckCircle2, ArrowRight, ArrowUpRight,
  Sun, Moon, Trophy, Heart, Zap, Send, AlertTriangle, Shield,
  UserPlus, Gift, Star
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────

type PackageType = 'tier_upgrade' | 'add_on' | 'retention' | 'acquisition'

// ── Mock Data: Membership Tiers ────────────────────────────────────────────

const currentTiers = [
  { name: 'Basic', price: 79, members: 45, color: 'bg-gray-100 text-gray-800' },
  { name: 'Standard', price: 129, members: 32, color: 'bg-blue-100 text-blue-800' },
  { name: 'Premium', price: 199, members: 18, color: 'bg-amber-100 text-amber-800' },
]

const membershipStats = {
  totalMembers: 95,
  avgMonthlyRevenue: 11_655,
  churnRate: 8.2, // percent per month
  avgLifetimeMonths: 14,
  membersAtRisk: 12,
  lostToChurnMonthly: 956,
}

// ── AI Recommendations ─────────────────────────────────────────────────────

const aiRecommendations = [
  {
    id: 'upgrade-competitive',
    type: 'tier_upgrade' as PackageType,
    name: 'Competitive Tier Upgrade',
    emoji: '🏆',
    icon: Trophy,
    color: 'from-red-500/20 to-rose-500/10',
    badgeColor: 'bg-red-100 text-red-800',
    typeBadge: 'Tier Upgrade',
    description: 'Basic members who play like Premium — upgrade them before they churn',
    insight: '7 Basic members ($79/mo) are booking 4+ sessions/week and entering tournaments. Their usage pattern matches Premium members. They\'re likely to churn when they realize they\'re overpaying per-session vs the Premium tier. Proactive upgrade offer retains them AND increases ARPU by $120/mo each.',
    matchedMembers: [
      { name: 'Carlos Mendez', avatar: '👨', currentTier: 'Basic', dupr: 4.5, sessionsPerWeek: 5, monthlySpendAddon: 85, riskScore: 'high' },
      { name: 'Jake Martinez', avatar: '👨', currentTier: 'Basic', dupr: 4.6, sessionsPerWeek: 4, monthlySpendAddon: 70, riskScore: 'high' },
      { name: 'David Park', avatar: '👨', currentTier: 'Basic', dupr: 4.1, sessionsPerWeek: 4, monthlySpendAddon: 60, riskScore: 'medium' },
      { name: 'Sarah Kim', avatar: '👩', currentTier: 'Basic', dupr: 4.2, sessionsPerWeek: 3, monthlySpendAddon: 55, riskScore: 'medium' },
      { name: 'Alex Rivera', avatar: '👨', currentTier: 'Basic', dupr: 3.8, sessionsPerWeek: 4, monthlySpendAddon: 65, riskScore: 'medium' },
      { name: 'Ryan Torres', avatar: '👨', currentTier: 'Basic', dupr: 4.4, sessionsPerWeek: 5, monthlySpendAddon: 90, riskScore: 'high' },
      { name: 'Chris Lee', avatar: '👨', currentTier: 'Basic', dupr: 4.7, sessionsPerWeek: 4, monthlySpendAddon: 75, riskScore: 'medium' },
    ],
    economics: {
      currentArpu: 79,
      currentAddons: 71, // avg monthly add-on spend
      totalCurrent: 150, // per member avg
      proposedTier: 'Premium',
      proposedPrice: 199,
      addonSavings: 45, // they save on add-ons with Premium
      netUplift: 49, // per member per month (199 - 150)
      totalMonthlyUplift: 343, // 7 × 49
      churnReduction: '60% lower churn for Premium vs Basic',
    },
    confidence: 91,
    actions: ['Send personalized upgrade offer', 'Offer 1st month at Standard price ($129)', 'Highlight savings on add-ons they already buy'],
  },
  {
    id: 'addon-clinic',
    type: 'add_on' as PackageType,
    name: 'Clinic Add-On Bundle',
    emoji: '📈',
    icon: TrendingUp,
    color: 'from-green-500/20 to-emerald-500/10',
    badgeColor: 'bg-green-100 text-green-800',
    typeBadge: 'Add-On Bundle',
    description: 'Members whose DUPR is rising — ready for structured coaching',
    insight: '9 members have improved their DUPR by 0.3+ in the last 2 months but only do open play. They\'re at the "plateau point" where improvement slows without coaching. A clinic bundle at $49/mo (4 clinics) is cheaper than individual clinics ($20 each = $80) and locks in revenue. AI predicts 78% uptake based on their improvement trajectory.',
    matchedMembers: [
      { name: 'Emily Zhang', avatar: '👩', currentTier: 'Standard', dupr: 3.4, sessionsPerWeek: 2, monthlySpendAddon: 15, riskScore: 'low' },
      { name: 'Mike Thompson', avatar: '👨', currentTier: 'Basic', dupr: 3.5, sessionsPerWeek: 2, monthlySpendAddon: 0, riskScore: 'low' },
      { name: 'Jennifer Wu', avatar: '👩', currentTier: 'Standard', dupr: 3.6, sessionsPerWeek: 3, monthlySpendAddon: 20, riskScore: 'low' },
      { name: 'Jason Lee', avatar: '👨', currentTier: 'Standard', dupr: 3.7, sessionsPerWeek: 2, monthlySpendAddon: 0, riskScore: 'low' },
      { name: 'Amanda Cruz', avatar: '👩', currentTier: 'Basic', dupr: 3.9, sessionsPerWeek: 2, monthlySpendAddon: 20, riskScore: 'low' },
      { name: 'Kevin Park', avatar: '👨', currentTier: 'Basic', dupr: 3.3, sessionsPerWeek: 3, monthlySpendAddon: 0, riskScore: 'low' },
      { name: 'Rachel Kim', avatar: '👩', currentTier: 'Standard', dupr: 3.5, sessionsPerWeek: 2, monthlySpendAddon: 0, riskScore: 'low' },
      { name: 'Brian Johnson', avatar: '👨', currentTier: 'Standard', dupr: 3.6, sessionsPerWeek: 3, monthlySpendAddon: 20, riskScore: 'low' },
      { name: 'Tina Chen', avatar: '👩', currentTier: 'Basic', dupr: 3.2, sessionsPerWeek: 2, monthlySpendAddon: 0, riskScore: 'low' },
    ],
    economics: {
      currentArpu: 108, // avg tier price
      currentAddons: 8, // avg add-on
      totalCurrent: 116,
      proposedTier: 'Current + Clinic Bundle',
      proposedPrice: 49, // add-on price
      addonSavings: 31, // vs buying 4 clinics individually
      netUplift: 41, // 49 - 8 current addon avg
      totalMonthlyUplift: 369, // 9 × 41
      churnReduction: 'Clinic members have 45% lower churn',
    },
    confidence: 78,
    actions: ['Offer first clinic free as trial', 'Send personalized "Your DUPR is growing" email', 'Bundle with DUPR tracking dashboard'],
  },
  {
    id: 'retention-at-risk',
    type: 'retention' as PackageType,
    name: 'Retention Rescue',
    emoji: '🛡️',
    icon: Shield,
    color: 'from-amber-500/20 to-orange-500/10',
    badgeColor: 'bg-amber-100 text-amber-800',
    typeBadge: 'Retention',
    description: 'Members showing churn signals — intervene before they cancel',
    insight: '5 members are showing classic pre-churn patterns: declining visit frequency over 4+ weeks, no upcoming bookings, and haven\'t opened last 2 club emails. At avg $127/mo membership, losing them = -$7,620/year. Retention cost is 5-7x cheaper than acquisition. AI recommends personalized win-back offers based on each member\'s persona.',
    matchedMembers: [
      { name: 'Maria Garcia', avatar: '👩', currentTier: 'Standard', dupr: 2.8, sessionsPerWeek: 0, monthlySpendAddon: 0, riskScore: 'critical' },
      { name: 'Lisa Park', avatar: '👩', currentTier: 'Premium', dupr: 2.9, sessionsPerWeek: 0, monthlySpendAddon: 0, riskScore: 'critical' },
      { name: 'George Wilson', avatar: '👨', currentTier: 'Basic', dupr: 2.9, sessionsPerWeek: 1, monthlySpendAddon: 0, riskScore: 'high' },
      { name: 'Steve Brown', avatar: '👨', currentTier: 'Standard', dupr: 2.6, sessionsPerWeek: 0, monthlySpendAddon: 0, riskScore: 'critical' },
      { name: 'Dorothy Miller', avatar: '👩', currentTier: 'Standard', dupr: 2.8, sessionsPerWeek: 1, monthlySpendAddon: 0, riskScore: 'high' },
    ],
    economics: {
      currentArpu: 127,
      currentAddons: 0,
      totalCurrent: 127,
      proposedTier: 'Personalized Retention Offer',
      proposedPrice: 0, // free incentives
      addonSavings: 0,
      netUplift: 0, // no immediate uplift — the value is preventing -$127/mo loss
      totalMonthlyUplift: 635, // preventing loss of 5 × $127
      churnReduction: 'Prevents estimated $7,620/year in lost memberships',
    },
    confidence: 85,
    actions: ['Free private lesson (for Maria — SOCIAL persona)', 'Free buddy session for 2 (for Lisa — she brought friends before)', 'Pause membership option (1 month free freeze)', 'Personal call from club manager', 'Exclusive invite to upcoming social event'],
  },
  {
    id: 'acquisition-referral',
    type: 'acquisition' as PackageType,
    name: 'Referral Accelerator',
    emoji: '🚀',
    icon: UserPlus,
    color: 'from-blue-500/20 to-cyan-500/10',
    badgeColor: 'bg-blue-100 text-blue-800',
    typeBadge: 'Acquisition',
    description: 'Your top social connectors — incentivize them to bring friends',
    insight: 'AI identified 4 "social connectors" who brought 11 guests in the last 3 months but received zero incentives. Each guest conversion = $79-199/mo new membership. Offering a referral bonus ($25 credit per conversion) costs 12-32% of first month revenue but dramatically accelerates growth. These 4 members could realistically bring 3-5 new members/month with proper incentives.',
    matchedMembers: [
      { name: 'Amy Chen', avatar: '👩', currentTier: 'Premium', dupr: 3.0, sessionsPerWeek: 2, monthlySpendAddon: 20, riskScore: 'none' },
      { name: 'Bob Jones', avatar: '👨', currentTier: 'Standard', dupr: 2.5, sessionsPerWeek: 2, monthlySpendAddon: 0, riskScore: 'none' },
      { name: 'Frank Johnson', avatar: '👨', currentTier: 'Premium', dupr: 3.5, sessionsPerWeek: 5, monthlySpendAddon: 0, riskScore: 'none' },
      { name: 'Patricia Lee', avatar: '👩', currentTier: 'Standard', dupr: 3.0, sessionsPerWeek: 3, monthlySpendAddon: 15, riskScore: 'none' },
    ],
    economics: {
      currentArpu: 152,
      currentAddons: 9,
      totalCurrent: 161,
      proposedTier: 'Referral Program',
      proposedPrice: -25, // credit per referral
      addonSavings: 0,
      netUplift: 0,
      totalMonthlyUplift: 475, // estimated 5 new members × avg $95 first month
      churnReduction: 'Referred members have 37% higher retention than organic',
    },
    confidence: 72,
    actions: ['Launch referral program with $25 credit per conversion', 'Give ambassadors 2 free guest passes/month', 'Create "Ambassador" badge in player profile', 'Send quarterly thank-you with stats on friends brought'],
  },
]

// ── Helpers ─────────────────────────────────────────────────────────────────

const getTypeColor = (type: PackageType) => {
  switch (type) {
    case 'tier_upgrade': return 'bg-purple-100 text-purple-800'
    case 'add_on': return 'bg-green-100 text-green-800'
    case 'retention': return 'bg-amber-100 text-amber-800'
    case 'acquisition': return 'bg-blue-100 text-blue-800'
  }
}

const getRiskBadge = (risk: string) => {
  switch (risk) {
    case 'critical': return 'bg-red-100 text-red-800'
    case 'high': return 'bg-orange-100 text-orange-800'
    case 'medium': return 'bg-amber-100 text-amber-800'
    default: return 'bg-gray-100 text-gray-600'
  }
}

// ── Component ──────────────────────────────────────────────────────────────

export default function SmartPackagesPage() {
  const params = useParams()
  const clubId = params.id as string
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [launchedIds, setLaunchedIds] = useState<Set<string>>(new Set())

  const totalUplift = aiRecommendations.reduce((s, r) => s + r.economics.totalMonthlyUplift, 0)
  const totalMembers = aiRecommendations.reduce((s, r) => s + r.matchedMembers.length, 0)

  const handleLaunch = (id: string) => {
    setLaunchedIds(prev => new Set([...prev, id]))
  }

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
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-gradient-to-br from-violet-500/20 to-purple-500/10 rounded-lg">
              <Package className="w-6 h-6 text-violet-600" />
            </div>
            <h1 className="text-3xl font-bold text-foreground">Membership Intelligence</h1>
            <Badge className="bg-violet-100 text-violet-800">AI Powered</Badge>
          </div>
          <p className="text-muted-foreground">
            AI analyzed {membershipStats.totalMembers} memberships and identified {aiRecommendations.length} revenue opportunities
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Membership Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {currentTiers.map(tier => (
            <Card key={tier.name}>
              <CardContent className="pt-5 pb-5">
                <div className="flex items-center justify-between mb-1">
                  <Badge className={tier.color}>{tier.name}</Badge>
                  <span className="text-xs text-muted-foreground">${tier.price}/mo</span>
                </div>
                <p className="text-2xl font-bold">{tier.members}</p>
                <p className="text-xs text-muted-foreground">members</p>
              </CardContent>
            </Card>
          ))}
          <Card className="border-red-200">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-red-600 font-medium">Monthly Churn</span>
                <TrendingDown className="w-4 h-4 text-red-500" />
              </div>
              <p className="text-2xl font-bold text-red-600">{membershipStats.churnRate}%</p>
              <p className="text-xs text-muted-foreground">-${membershipStats.lostToChurnMonthly}/mo lost</p>
            </CardContent>
          </Card>
          <Card className="border-green-200">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-green-600 font-medium">AI Opportunity</span>
                <ArrowUpRight className="w-4 h-4 text-green-500" />
              </div>
              <p className="text-2xl font-bold text-green-600">+${totalUplift.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">monthly uplift possible</p>
            </CardContent>
          </Card>
        </div>

        {/* Recommendation Cards */}
        {aiRecommendations.map(rec => {
          const isExpanded = expandedId === rec.id
          const isLaunched = launchedIds.has(rec.id)
          const Icon = rec.icon

          return (
            <Card key={rec.id} className={cn(isLaunched && 'border-green-300 bg-green-50/30')}>
              <CardHeader className="cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : rec.id)}>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className={cn('p-3 rounded-xl bg-gradient-to-br', rec.color)}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <CardTitle className="text-lg">{rec.emoji} {rec.name}</CardTitle>
                        <Badge className={getTypeColor(rec.type)}>{rec.typeBadge}</Badge>
                        <Badge className={rec.badgeColor}>{rec.matchedMembers.length} members</Badge>
                        <Badge variant="outline" className="text-xs">{rec.confidence}% confidence</Badge>
                        {isLaunched && (
                          <Badge className="bg-green-100 text-green-800">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Launched
                          </Badge>
                        )}
                      </div>
                      <CardDescription>{rec.description}</CardDescription>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={cn(
                      'text-2xl font-bold',
                      rec.type === 'retention' ? 'text-amber-600' : 'text-green-600'
                    )}>
                      {rec.type === 'retention' ? 'saves' : '+'} ${rec.economics.totalMonthlyUplift}/mo
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {rec.type === 'retention' ? 'prevented loss' : 'revenue uplift'}
                    </p>
                  </div>
                </div>
              </CardHeader>

              {isExpanded && (
                <CardContent className="border-t pt-6 space-y-6">
                  {/* AI Insight */}
                  <div className="bg-muted rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium">AI Insight</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{rec.insight}</p>
                  </div>

                  {/* Economics */}
                  <div>
                    <h4 className="text-sm font-medium mb-3">Economics</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Card>
                        <CardContent className="pt-4 pb-4 text-center">
                          <p className="text-xs text-muted-foreground">Current ARPU</p>
                          <p className="text-lg font-bold">${rec.economics.totalCurrent}/mo</p>
                          <p className="text-xs text-muted-foreground">tier + add-ons</p>
                        </CardContent>
                      </Card>
                      <Card className="border-primary">
                        <CardContent className="pt-4 pb-4 text-center">
                          <p className="text-xs text-muted-foreground">{rec.economics.proposedTier}</p>
                          <p className="text-lg font-bold text-primary">
                            {rec.economics.proposedPrice >= 0
                              ? `$${rec.economics.proposedPrice}/mo`
                              : `$${Math.abs(rec.economics.proposedPrice)} credit`
                            }
                          </p>
                          {rec.economics.addonSavings > 0 && (
                            <p className="text-xs text-green-600">saves ${rec.economics.addonSavings} on add-ons</p>
                          )}
                        </CardContent>
                      </Card>
                      <Card className="border-green-200">
                        <CardContent className="pt-4 pb-4 text-center">
                          <p className="text-xs text-muted-foreground">Monthly Impact</p>
                          <p className="text-lg font-bold text-green-600">+${rec.economics.totalMonthlyUplift}/mo</p>
                          <p className="text-xs text-muted-foreground">{rec.matchedMembers.length} members</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-4 pb-4 text-center">
                          <p className="text-xs text-muted-foreground">Churn Impact</p>
                          <p className="text-xs font-medium text-green-600 mt-1">{rec.economics.churnReduction}</p>
                        </CardContent>
                      </Card>
                    </div>
                  </div>

                  {/* Matched Members */}
                  <div>
                    <h4 className="text-sm font-medium mb-3">Matched Members</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {rec.matchedMembers.map((member, i) => (
                        <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                          <span className="text-xl">{member.avatar}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{member.name}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{member.currentTier}</span>
                              <span>·</span>
                              <span>{member.sessionsPerWeek}x/wk</span>
                              {member.monthlySpendAddon > 0 && (
                                <>
                                  <span>·</span>
                                  <span>+${member.monthlySpendAddon} add-ons</span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            <Badge variant="outline" className="text-xs">DUPR {member.dupr}</Badge>
                            {member.riskScore !== 'none' && member.riskScore !== 'low' && (
                              <Badge className={cn('text-xs', getRiskBadge(member.riskScore))}>
                                {member.riskScore}
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recommended Actions */}
                  <div>
                    <h4 className="text-sm font-medium mb-3">Recommended Actions</h4>
                    <div className="space-y-2">
                      {rec.actions.map((action, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                          {action}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Launch */}
                  <div className="flex gap-3 pt-2">
                    {!isLaunched ? (
                      <>
                        <Button onClick={() => handleLaunch(rec.id)} className="gap-2">
                          <Zap className="w-4 h-4" />
                          Launch Campaign
                        </Button>
                        <Button variant="outline" className="gap-2">
                          <Send className="w-4 h-4" />
                          Send to {rec.matchedMembers.length} Members
                        </Button>
                      </>
                    ) : (
                      <div className="flex items-center gap-2 text-green-600">
                        <CheckCircle2 className="w-5 h-5" />
                        <span className="font-medium">
                          Campaign launched! Personalized offers sent to {rec.matchedMembers.length} members.
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
