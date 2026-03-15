'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  ArrowUp,
  Star,
  TrendingUp,
  Zap,
  AlertCircle,
  Target,
  Users,
} from 'lucide-react';

export default function PlayerInsightsPage() {
  const params = useParams();
  const router = useRouter();
  const clubId = params.id as string;
  const [activeTab, setActiveTab] = useState<'insights' | 'rivalry'>('insights');

  // Mock player data
  const playerProfile = {
    name: 'Maria Santos',
    dupr: 3.8,
    memberSince: 2023,
    tournamentStats: {
      played: 12,
      winRate: 68,
      bestResult: '1st Place (Spring Championship 2025)',
      duprTrend: { old: 3.4, new: 3.8, months: 12 },
    },
    performanceBreakdown: {
      singles: 58,
      doubles: 74,
      mixed: 71,
    },
    strengths: [
      'Dominant in doubles — strong net play and communication',
      'Performs well under pressure — 80% win rate in 3-set matches',
    ],
    weaknesses: [
      'Struggles against left-handed opponents (33% win rate)',
      'First-set win rate drops to 45% in morning matches (before 10am)',
    ],
    aiRecommendation:
      'Focus on singles practice and morning tournament slots to address weak spots.',
  };

  const rivals = [
    {
      name: 'Sarah Chen',
      h2hWins: 3,
      h2hLosses: 2,
      lastResult: 'W 11-8, 11-9',
      badge: '🔥 Rivalry',
    },
    {
      name: 'Jessica Park',
      h2hWins: 2,
      h2hLosses: 3,
      lastResult: 'L 9-11, 11-7, 8-11',
      badge: 'Rematch available Mar 15',
    },
    {
      name: 'Diana Lopez',
      h2hWins: 4,
      h2hLosses: 1,
      lastResult: 'W 11-3, 11-5',
      badge: 'Dominant',
    },
    {
      name: 'Amy Zhang',
      h2hWins: 1,
      h2hLosses: 1,
      lastResult: 'W 11-9, 9-11, 11-7',
      badge: 'Evenly matched',
    },
    {
      name: 'Rachel Kim',
      h2hWins: 0,
      h2hLosses: 2,
      lastResult: 'L 6-11, 8-11',
      badge: 'Nemesis 👀',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-slate-900">
              Player Insights &amp; Rivalry
            </h1>
            <p className="text-lg text-slate-600">
              AI-powered analysis for {playerProfile.name}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() =>
              router.push(
                `/clubs/${clubId}/intelligence/tournament-ai`
              )
            }
          >
            Back to Tournament AI
          </Button>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 border-b border-slate-200">
          <button
            onClick={() => setActiveTab('insights')}
            className={cn(
              'px-4 py-3 font-medium transition-colors',
              activeTab === 'insights'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-slate-600 hover:text-slate-900'
            )}
          >
            Player Insights
          </button>
          <button
            onClick={() => setActiveTab('rivalry')}
            className={cn(
              'px-4 py-3 font-medium transition-colors',
              activeTab === 'rivalry'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-slate-600 hover:text-slate-900'
            )}
          >
            Rivalry Graph
          </button>
        </div>

        {/* TAB 1: PLAYER INSIGHTS */}
        {activeTab === 'insights' && (
          <div className="space-y-6">
            {/* Player Profile Card */}
            <Card className="border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-3xl font-bold text-slate-900">
                    {playerProfile.name}
                  </h2>
                  <div className="mt-2 flex gap-4">
                    <Badge variant="secondary" className="text-lg">
                      DUPR {playerProfile.dupr}
                    </Badge>
                    <p className="text-slate-600">
                      Member since {playerProfile.memberSince}
                    </p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Tournament Stats Grid */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              {/* Tournaments Played */}
              <Card className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600">Tournaments Played</p>
                    <p className="text-3xl font-bold text-slate-900">
                      {playerProfile.tournamentStats.played}
                    </p>
                  </div>
                  <Zap className="h-10 w-10 text-amber-500" />
                </div>
              </Card>

              {/* Win Rate with Visual Ring */}
              <Card className="p-6">
                <p className="text-sm text-slate-600">Win Rate</p>
                <div className="mt-4 flex items-center justify-center">
                  <div className="relative h-20 w-20">
                    <svg className="h-full w-full" viewBox="0 0 100 100">
                      <circle
                        cx="50"
                        cy="50"
                        r="45"
                        fill="none"
                        stroke="#e2e8f0"
                        strokeWidth="8"
                      />
                      <circle
                        cx="50"
                        cy="50"
                        r="45"
                        fill="none"
                        stroke="#3b82f6"
                        strokeWidth="8"
                        strokeDasharray={`${
                          (playerProfile.tournamentStats.winRate / 100) *
                          2 *
                          Math.PI *
                          45
                        } ${2 * Math.PI * 45}`}
                        strokeLinecap="round"
                        transform="rotate(-90 50 50)"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-lg font-bold text-slate-900">
                        {playerProfile.tournamentStats.winRate}%
                      </span>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Best Result */}
              <Card className="p-6">
                <p className="text-sm text-slate-600">Best Result</p>
                <p className="mt-4 font-semibold text-slate-900">
                  {playerProfile.tournamentStats.bestResult}
                </p>
              </Card>

              {/* DUPR Trend */}
              <Card className="p-6">
                <p className="text-sm text-slate-600">DUPR Trend</p>
                <div className="mt-4 flex items-center gap-2">
                  <span className="text-sm text-slate-600">
                    {playerProfile.tournamentStats.duprTrend.old}
                  </span>
                  <ArrowUp className="h-5 w-5 text-green-600" />
                  <span className="text-xl font-bold text-slate-900">
                    {playerProfile.tournamentStats.duprTrend.new}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Over {playerProfile.tournamentStats.duprTrend.months} months
                </p>
              </Card>
            </div>

            {/* Performance Breakdown */}
            <Card className="p-6">
              <h3 className="mb-4 flex items-center gap-2 text-xl font-bold text-slate-900">
                <TrendingUp className="h-5 w-5" />
                Performance Breakdown
              </h3>
              <div className="space-y-4">
                {[
                  {
                    format: 'Singles',
                    rate: playerProfile.performanceBreakdown.singles,
                    icon: '👤',
                  },
                  {
                    format: 'Doubles',
                    rate: playerProfile.performanceBreakdown.doubles,
                    icon: '⭐',
                    bestFormat: true,
                  },
                  {
                    format: 'Mixed Doubles',
                    rate: playerProfile.performanceBreakdown.mixed,
                    icon: '👥',
                  },
                ].map((item) => (
                  <div key={item.format}>
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                        <span>{item.icon}</span>
                        <span>{item.format}</span>
                        {item.bestFormat && <Star className="h-4 w-4 text-yellow-500" />}
                      </label>
                      <span className="font-bold text-slate-900">
                        {item.rate}%
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full bg-blue-600 transition-all"
                        style={{ width: `${item.rate}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Strengths & Weaknesses */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Strengths */}
              <Card className="border-green-100 bg-gradient-to-br from-green-50 to-emerald-50 p-6">
                <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-green-900">
                  <Zap className="h-5 w-5" />
                  Strengths
                </h3>
                <ul className="space-y-3">
                  {playerProfile.strengths.map((strength, idx) => (
                    <li key={idx} className="flex gap-3">
                      <span className="text-green-600">✓</span>
                      <span className="text-slate-700">{strength}</span>
                    </li>
                  ))}
                </ul>
              </Card>

              {/* Weaknesses */}
              <Card className="border-amber-100 bg-gradient-to-br from-amber-50 to-orange-50 p-6">
                <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-amber-900">
                  <AlertCircle className="h-5 w-5" />
                  Areas to Improve
                </h3>
                <ul className="space-y-3">
                  {playerProfile.weaknesses.map((weakness, idx) => (
                    <li key={idx} className="flex gap-3">
                      <span className="text-amber-600">⚠</span>
                      <span className="text-slate-700">{weakness}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>

            {/* AI Recommendation */}
            <Card className="border-purple-100 bg-gradient-to-br from-purple-50 to-pink-50 p-6">
              <h3 className="mb-3 flex items-center gap-2 text-lg font-bold text-purple-900">
                <Target className="h-5 w-5" />
                AI Recommendation
              </h3>
              <p className="text-slate-700">{playerProfile.aiRecommendation}</p>
            </Card>
          </div>
        )}

        {/* TAB 2: RIVALRY GRAPH */}
        {activeTab === 'rivalry' && (
          <div className="space-y-6">
            {/* Most Anticipated Rematch */}
            <Card className="border-red-100 bg-gradient-to-br from-red-50 to-pink-50 p-6">
              <h3 className="mb-2 flex items-center gap-2 text-xl font-bold text-red-900">
                <Zap className="h-5 w-5" />
                Most Anticipated Rematch
              </h3>
              <p className="text-slate-700">
                {playerProfile.name} vs Jessica Park — tied at 2-2 in 2024,
                both registered for Weekend Open
              </p>
            </Card>

            {/* Rivals Grid */}
            <div className="space-y-4">
              <h3 className="flex items-center gap-2 text-xl font-bold text-slate-900">
                <Users className="h-5 w-5" />
                Top 5 Rivals
              </h3>
              {rivals.map((rival, idx) => (
                <Card key={idx} className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="text-lg font-bold text-slate-900">
                        vs {rival.name}
                      </h4>
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-700">
                            H2H Record:
                          </span>
                          <span className="text-slate-600">
                            {rival.h2hWins}-{rival.h2hLosses}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-700">
                            Last Match:
                          </span>
                          <span className="text-slate-600">
                            {rival.lastResult}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Badge
                      variant="secondary"
                      className="whitespace-nowrap bg-slate-100"
                    >
                      {rival.badge}
                    </Badge>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
