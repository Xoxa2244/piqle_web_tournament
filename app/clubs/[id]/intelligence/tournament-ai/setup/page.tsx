'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  Brain,
  Users,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  BarChart3,
  Zap,
} from 'lucide-react';
import Link from 'next/link';

type Tab = 'seeding' | 'divisions' | 'prediction';

interface Player {
  seed: number;
  name: string;
  duprRating: number;
  recentForm: string;
  club: string;
  aiConfidence: number;
}

interface DivisionConfig {
  name: string;
  rating: string;
  playerCount: number;
  format: string;
  duration: string;
  courts: number;
}

interface AIInsight {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const mockPlayers: Player[] = [
  {
    seed: 1,
    name: 'Alex Johnson',
    duprRating: 4.8,
    recentForm: 'W-W-W-W-W',
    club: 'Riverside Club',
    aiConfidence: 98,
  },
  {
    seed: 2,
    name: 'Maria Santos',
    duprRating: 4.6,
    recentForm: 'W-W-W-L-W',
    club: 'Downtown Courts',
    aiConfidence: 96,
  },
  {
    seed: 3,
    name: 'James Wilson',
    duprRating: 4.5,
    recentForm: 'W-W-L-W-W',
    club: 'Riverside Club',
    aiConfidence: 94,
  },
  {
    seed: 4,
    name: 'Sarah Chen',
    duprRating: 4.4,
    recentForm: 'W-L-W-W-L',
    club: 'Oak Park Complex',
    aiConfidence: 91,
  },
  {
    seed: 5,
    name: 'Michael Garcia',
    duprRating: 4.3,
    recentForm: 'L-W-W-W-W',
    club: 'Downtown Courts',
    aiConfidence: 89,
  },
  {
    seed: 6,
    name: 'Lisa Anderson',
    duprRating: 4.2,
    recentForm: 'W-W-L-L-W',
    club: 'Riverside Club',
    aiConfidence: 87,
  },
  {
    seed: 7,
    name: 'David Torres',
    duprRating: 4.1,
    recentForm: 'W-L-W-L-W',
    club: 'Oak Park Complex',
    aiConfidence: 85,
  },
  {
    seed: 8,
    name: 'Jennifer Lee',
    duprRating: 4.0,
    recentForm: 'L-W-W-W-W',
    club: 'Sunset Courts',
    aiConfidence: 83,
  },
  {
    seed: 9,
    name: 'Robert Martinez',
    duprRating: 3.9,
    recentForm: 'W-W-W-L-L',
    club: 'Downtown Courts',
    aiConfidence: 81,
  },
  {
    seed: 10,
    name: 'Amanda White',
    duprRating: 3.8,
    recentForm: 'W-L-W-W-L',
    club: 'Oak Park Complex',
    aiConfidence: 78,
  },
  {
    seed: 11,
    name: 'Christopher Brown',
    duprRating: 3.7,
    recentForm: 'L-W-L-W-W',
    club: 'Riverside Club',
    aiConfidence: 76,
  },
  {
    seed: 12,
    name: 'Michelle Davis',
    duprRating: 3.6,
    recentForm: 'W-L-L-W-W',
    club: 'Sunset Courts',
    aiConfidence: 73,
  },
  {
    seed: 13,
    name: 'Kevin Thompson',
    duprRating: 3.5,
    recentForm: 'L-W-W-L-W',
    club: 'Downtown Courts',
    aiConfidence: 71,
  },
  {
    seed: 14,
    name: 'Patricia Garcia',
    duprRating: 3.4,
    recentForm: 'W-L-L-L-W',
    club: 'Oak Park Complex',
    aiConfidence: 68,
  },
  {
    seed: 15,
    name: 'Daniel Lopez',
    duprRating: 3.3,
    recentForm: 'L-L-W-W-L',
    club: 'Riverside Club',
    aiConfidence: 65,
  },
  {
    seed: 16,
    name: 'Rachel Green',
    duprRating: 3.2,
    recentForm: 'L-L-W-L-W',
    club: 'Sunset Courts',
    aiConfidence: 62,
  },
];

const aiReasoningCards: AIInsight[] = [
  {
    icon: <Users className="w-4 h-4" />,
    title: 'Club Separation Strategy',
    description:
      'Separated players from same club into different halves to ensure diverse matchups.',
  },
  {
    icon: <TrendingUp className="w-4 h-4" />,
    title: 'Head-to-Head Analysis',
    description:
      'Seeded #3 above #2 due to 3-0 h2h record despite slightly lower overall rating.',
  },
  {
    icon: <Zap className="w-4 h-4" />,
    title: 'Hot Streak Adjustment',
    description:
      'Adjusted for hot streak: +2 positions for Maria Santos (5W streak).',
  },
];

const divisionConfigs: DivisionConfig[] = [
  {
    name: 'Division A',
    rating: 'Advanced (4.0+)',
    playerCount: 10,
    format: 'Round Robin groups of 5 → Playoff Top 2',
    duration: '2.5 hours',
    courts: 3,
  },
  {
    name: 'Division B',
    rating: 'Intermediate (3.5-3.9)',
    playerCount: 18,
    format: '3 pools of 6 → Playoff Top 2 per pool',
    duration: '3.5 hours',
    courts: 4,
  },
  {
    name: 'Division C',
    rating: 'Beginner (3.0-3.4)',
    playerCount: 12,
    format: '2 pools of 6 → Playoff Top 2',
    duration: '2 hours',
    courts: 2,
  },
];

const fillPredictionInsights: AIInsight[] = [
  {
    icon: <TrendingUp className="w-4 h-4" />,
    title: 'Lower Entry Fee by $5',
    description: 'Expected impact: +6 additional registrations',
  },
  {
    icon: <Users className="w-4 h-4" />,
    title: 'Add 3.0-3.5 Division',
    description: 'Expand player pool: +8 additional registrations',
  },
  {
    icon: <Zap className="w-4 h-4" />,
    title: 'Targeted Invites Campaign',
    description: 'Send to 23 matching players: +4 additional registrations',
  },
];

export default function TournamentAISetupPage() {
  const params = useParams();
  const clubId = params.id as string;
  const [activeTab, setActiveTab] = useState<Tab>('seeding');
  const [seedsGenerated, setSeedsGenerated] = useState(false);
  const [expectedPlayers, setExpectedPlayers] = useState(40);

  const handleGenerateSeeds = () => {
    setSeedsGenerated(true);
  };

  const getDuprColor = (rating: number) => {
    if (rating >= 4.5) return 'bg-red-100 text-red-900';
    if (rating >= 4.0) return 'bg-orange-100 text-orange-900';
    if (rating >= 3.5) return 'bg-yellow-100 text-yellow-900';
    return 'bg-green-100 text-green-900';
  };

  const getFormColor = (result: string) => {
    const wins = (result.match(/W/g) || []).length;
    if (wins === 5) return 'bg-emerald-50 text-emerald-700';
    if (wins >= 3) return 'bg-blue-50 text-blue-700';
    return 'bg-slate-50 text-slate-700';
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 90) return 'bg-emerald-100 text-emerald-900';
    if (confidence >= 75) return 'bg-blue-100 text-blue-900';
    return 'bg-amber-100 text-amber-900';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4 mb-4">
            <Link href={`/clubs/${clubId}/intelligence/tournament-ai`}>
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="w-4 h-4" />
                Back
              </Button>
            </Link>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <Brain className="w-6 h-6 text-blue-600" />
                Smart Seeding &amp; Dynamic Division Builder
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                AI-powered tournament setup for optimal matchmaking
              </p>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-2 border-t border-slate-200 pt-4">
            {[
              { id: 'seeding', label: 'Smart Seeding' },
              { id: 'divisions', label: 'Division Builder' },
              { id: 'prediction', label: 'Fill Prediction' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as Tab)}
                className={cn(
                  'px-4 py-2 font-medium text-sm rounded-t-lg border-b-2 transition-colors',
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600 bg-blue-50'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* TAB 1: SMART SEEDING */}
        {activeTab === 'seeding' && (
          <div className="space-y-6">
            {/* Tournament Info */}
            <Card className="bg-white p-6 border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xl font-bold text-slate-900">
                  Spring Championship 2025
                </h2>
                <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                  16 Players Registered
                </Badge>
              </div>
              <p className="text-slate-600">
                Automatic seeding based on DUPR ratings, recent form, head-to-head records,
                and club distribution
              </p>
            </Card>

            {/* Generate Seeds Button */}
            {!seedsGenerated && (
              <div className="flex justify-center">
                <Button
                  onClick={handleGenerateSeeds}
                  size="lg"
                  className="gap-2 bg-blue-600 hover:bg-blue-700"
                >
                  <Zap className="w-5 h-5" />
                  Generate AI Seeds
                </Button>
              </div>
            )}

            {/* Seeding Table */}
            {seedsGenerated && (
              <Card className="bg-white border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                          Seed
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                          Player Name
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                          DUPR Rating
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                          Recent Form
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                          Club
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                          AI Confidence
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {mockPlayers.map((player) => (
                        <tr
                          key={player.seed}
                          className="hover:bg-slate-50 transition-colors"
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <Badge variant="outline" className="bg-slate-100">
                              #{player.seed}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap font-medium text-slate-900">
                            {player.name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <Badge className={getDuprColor(player.duprRating)}>
                              {player.duprRating.toFixed(1)}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <Badge className={getFormColor(player.recentForm)}>
                              {player.recentForm}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                            {player.club}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden">
                                <div
                                  className={cn(
                                    'h-full rounded-full',
                                    player.aiConfidence >= 90
                                      ? 'bg-emerald-500'
                                      : player.aiConfidence >= 75
                                        ? 'bg-blue-500'
                                        : 'bg-amber-500'
                                  )}
                                  style={{
                                    width: `${player.aiConfidence}%`,
                                  }}
                                />
                              </div>
                              <span className="text-xs font-medium text-slate-700">
                                {player.aiConfidence}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* AI Reasoning Cards */}
            {seedsGenerated && (
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-slate-900">
                  AI Reasoning Breakdown
                </h3>
                <div className="grid md:grid-cols-3 gap-4">
                  {aiReasoningCards.map((insight, idx) => (
                    <Card
                      key={idx}
                      className="bg-white border-slate-200 p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex gap-3">
                        <div className="flex-shrink-0 text-blue-600 mt-1">
                          {insight.icon}
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold text-slate-900 text-sm">
                            {insight.title}
                          </h4>
                          <p className="text-xs text-slate-600 mt-1">
                            {insight.description}
                          </p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: DYNAMIC DIVISION BUILDER */}
        {activeTab === 'divisions' && (
          <div className="space-y-6">
            {/* Player Input */}
            <Card className="bg-white p-6 border-slate-200">
              <h3 className="font-semibold text-slate-900 mb-4">
                Tournament Configuration
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-3">
                    Expected Players: <span className="text-lg font-bold text-blue-600">{expectedPlayers}</span>
                  </label>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={expectedPlayers}
                    onChange={(e) => setExpectedPlayers(parseInt(e.target.value))}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-slate-500 mt-1">
                    <span>10</span>
                    <span>100</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* AI Insight Callout */}
            <Card className="bg-amber-50 border-amber-200 p-4 flex gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-amber-900">AI Insight</h4>
                <p className="text-sm text-amber-800 mt-1">
                  Adding a 4th division (3.5-3.7) would reduce skill gaps by 34% but
                  requires 2 additional courts.
                </p>
              </div>
            </Card>

            {/* Division Cards */}
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-slate-900">
                Recommended Structure
              </h3>
              <div className="grid md:grid-cols-3 gap-4">
                {divisionConfigs.map((division, idx) => (
                  <Card
                    key={idx}
                    className="bg-white border-slate-200 p-6 hover:shadow-lg transition-shadow"
                  >
                    <div className="mb-4">
                      <h4 className="font-bold text-slate-900">{division.name}</h4>
                      <p className="text-sm text-slate-600">{division.rating}</p>
                    </div>

                    <div className="space-y-3">
                      <div className="bg-slate-50 rounded-lg p-3">
                        <p className="text-xs text-slate-600 uppercase tracking-wider font-semibold">
                          Players
                        </p>
                        <p className="text-2xl font-bold text-slate-900">
                          {division.playerCount}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-slate-600 font-semibold mb-1">
                          FORMAT
                        </p>
                        <p className="text-sm text-slate-900">{division.format}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <p className="text-xs text-slate-600 font-semibold">Duration</p>
                          <p className="text-slate-900">{division.duration}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-600 font-semibold">Courts</p>
                          <p className="text-slate-900">{division.courts}</p>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>

            {/* Summary */}
            <Card className="bg-blue-50 border-blue-200 p-4">
              <div className="flex gap-3">
                <CheckCircle2 className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-blue-900">Perfect Balance</h4>
                  <p className="text-sm text-blue-800 mt-1">
                    This structure optimizes court usage (9 courts total), minimizes skill
                    gaps within divisions, and provides compelling competitive opportunities.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* TAB 3: FILL PREDICTION */}
        {activeTab === 'prediction' && (
          <div className="space-y-6">
            {/* Tournament Info */}
            <Card className="bg-white p-6 border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xl font-bold text-slate-900">
                  Weekend Doubles Open
                </h2>
                <Badge variant="secondary" className="bg-orange-100 text-orange-800">
                  28/48 Spots Filled (58%)
                </Badge>
              </div>
              <p className="text-slate-600">
                Registration opens 14 days before event. AI predicts final fill based on
                historical patterns and current pace.
              </p>
            </Card>

            {/* Key Metrics */}
            <div className="grid md:grid-cols-3 gap-4">
              <Card className="bg-white border-slate-200 p-4">
                <p className="text-xs text-slate-600 font-semibold mb-2 uppercase">
                  Current Pace
                </p>
                <p className="text-2xl font-bold text-slate-900">2.1</p>
                <p className="text-xs text-slate-500 mt-1">registrations/day</p>
              </Card>

              <Card className="bg-white border-slate-200 p-4">
                <p className="text-xs text-slate-600 font-semibold mb-2 uppercase">
                  Predicted Fill
                </p>
                <p className="text-2xl font-bold text-slate-900">38/48</p>
                <p className="text-xs text-slate-500 mt-1">(79% capacity)</p>
              </Card>

              <Card className="bg-white border-slate-200 p-4">
                <p className="text-xs text-slate-600 font-semibold mb-2 uppercase">
                  Confidence Level
                </p>
                <p className="text-2xl font-bold text-amber-600">Medium</p>
                <p className="text-xs text-slate-500 mt-1">(±8 registrations)</p>
              </Card>
            </div>

            {/* Fill Prediction Chart */}
            <Card className="bg-white border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-600" />
                14-Day Fill Prediction
              </h3>

              <div className="space-y-3">
                {[
                  { day: 'Day 1', current: 28, predicted: 28, pct: '58%' },
                  { day: 'Day 2-3', current: 28, predicted: 32, pct: '67%' },
                  { day: 'Day 4-7', current: 28, predicted: 35, pct: '73%' },
                  { day: 'Day 8-11', current: 28, predicted: 38, pct: '79%' },
                  { day: 'Day 12-14', current: 28, predicted: 38, pct: '79%' },
                ].map((data, idx) => (
                  <div key={idx}>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium text-slate-900">
                        {data.day}
                      </span>
                      <span className="text-sm font-bold text-blue-600">
                        {data.predicted}/48 ({data.pct})
                      </span>
                    </div>
                    <div className="w-full h-8 bg-slate-100 rounded-lg overflow-hidden flex">
                      <div
                        className="bg-gradient-to-r from-blue-500 to-blue-400 rounded-lg transition-all"
                        style={{ width: `${(data.predicted / 48) * 100}%` }}
                      >
                        <div className="h-full flex items-center justify-end pr-2">
                          {data.predicted > 20 && (
                            <span className="text-xs font-bold text-white">
                              {data.predicted}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-xs text-slate-600 mt-4 pt-4 border-t border-slate-200">
                Prediction based on 24 months of historical tournament data and current
                registration velocity
              </p>
            </Card>

            {/* AI Recommendations */}
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-slate-900">
                AI Recommendations to Increase Registration
              </h3>
              <div className="grid md:grid-cols-3 gap-4">
                {fillPredictionInsights.map((insight, idx) => (
                  <Card
                    key={idx}
                    className="bg-white border-slate-200 p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 text-emerald-600 mt-1">
                        {insight.icon}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-slate-900 text-sm">
                          {insight.title}
                        </h4>
                        <p className="text-xs text-slate-600 mt-1">
                          {insight.description}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>

            {/* Bottom CTA */}
            <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-900">Ready to Optimize Your Event?</h4>
                  <p className="text-sm text-slate-600 mt-1">
                    Apply AI insights to increase registration and ensure competitive balance
                  </p>
                </div>
                <Button className="bg-blue-600 hover:bg-blue-700 gap-2">
                  <Zap className="w-4 h-4" />
                  Apply Recommendations
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
