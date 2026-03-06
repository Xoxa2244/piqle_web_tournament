'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Copy, Instagram, Facebook, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type TabType = 'analytics' | 'recap' | 'benchmarks';

const TOURNAMENT_DATA = {
  name: 'Spring Championship 2025',
  status: 'Completed',
  stats: {
    players: 48,
    matches: 32,
    courts: 6,
    duration: '4.5 Hours',
  },
  competitiveness: {
    score: 8.2,
    explanation: '82% of matches went to 3+ games',
  },
  matchQuality: {
    blowouts: 4,
    competitive: 18,
    nailbiters: 10,
  },
  divisions: [
    {
      name: 'Intermediate',
      avgQuality: 7.8,
      mostCompetitive: 'Smith vs Chen (11-9, 9-11, 11-7)',
      biggestUpset: 'Garcia defeated #2 seed Williams',
    },
    {
      name: 'Advanced',
      avgQuality: 8.5,
      mostCompetitive: 'Santos vs Rivera (11-9, 7-11, 11-8)',
      biggestUpset: '#4 seed Santos defeated #1 seed Johnson',
    },
    {
      name: 'Beginners',
      avgQuality: 7.2,
      mostCompetitive: 'Lee vs Brown (11-8, 10-12, 11-9)',
      biggestUpset: 'Martinez defeated #3 seed Thompson',
    },
  ],
  satisfaction: {
    rating: 4.6,
    total: 5,
    responses: 32,
  },
  revenue: {
    entryFees: 1680,
    concessions: 420,
    total: 2100,
  },
};

const SOCIAL_RECAP = `🏆 Spring Championship Recap!
48 players. 32 matches. 1 champion.

The Spring Championship delivered drama: #4 seed Team Santos pulled off back-to-back upsets in the playoffs, defeating #1 seed Team Johnson 11-9, 7-11, 11-8 in a thrilling final.

🔥 Match of the Day: Santos vs Rivera semifinal — 3 sets, 2 tiebreaks
📊 Most competitive division: Intermediate (avg margin: 3.2 points)
⭐ MVP: Maria Santos (4-0, +28 point differential)

See full results: [link]`;

const EMAIL_RECAP = `SPRING CHAMPIONSHIP 2025 - FULL TOURNAMENT RECAP

Tournament Overview
Date: March 1-2, 2025
Venue: Elite Pickleball Courts
Participants: 48 players across 3 divisions
Format: Double elimination

Key Statistics
• Total Matches Played: 32
• Courts Utilized: 6
• Average Match Duration: 28 minutes
• Total Tournament Duration: 4.5 hours

Tournament Highlights

Grand Finals Victory
#4 seed Maria Santos and her partner delivered an incredible upset, winning the Advanced Division championship. Their thrilling 11-9, 7-11, 11-8 victory over #1 seeds Team Johnson captivated spectators and proved that tournament seeding can be overcome with determination and skill.

Match of the Tournament
The semifinal between Santos and Rivera was nothing short of spectacular. Playing across 3 intense sets with 2 tiebreaks, this match had fans on the edge of their seats and showcased the high caliber of play at your tournament.

Competitive Division Breakdown

Advanced Division
• Most Competitive Match: Santos vs Rivera (11-9, 7-11, 11-8)
• Average Match Quality: 8.5/10
• Biggest Upset: #4 seed Santos defeats #1 seed Johnson

Intermediate Division
• Most Competitive Match: Smith vs Chen (11-9, 9-11, 11-7)
• Average Match Quality: 7.8/10
• Biggest Upset: Garcia defeats #2 seed Williams

Beginners Division
• Most Competitive Match: Lee vs Brown (11-8, 10-12, 11-9)
• Average Match Quality: 7.2/10
• Biggest Upset: Martinez defeats #3 seed Thompson

Player Satisfaction & Feedback
Overall Player Rating: 4.6/5 stars
Survey Responses: 32 players
Players praised the fair scheduling, smooth tournament flow, and competitive level of play across divisions.

Tournament Quality Metrics
• Competitiveness Score: 8.2/10
• 82% of matches went to 3+ games
• Match Quality Distribution:
  - Nail-biters (10+ point swings): 10 matches
  - Competitive (5-10 point margin): 18 matches
  - Blowouts (<5 point margin): 4 matches

Financial Summary
Entry Fees: $1,680
Concessions Sales: $420
Total Revenue: $2,100

Thank you to all players, volunteers, and sponsors who made the Spring Championship 2025 a success!`;

const BENCHMARKS = {
  fillRate: {
    current: 100,
    average: 78,
    percentile: 'Top 15%',
    label: 'Fill Rate',
  },
  playerReturn: {
    current: 71,
    average: 58,
    percentile: 'Top 20%',
    label: 'Player Return Rate',
  },
  waitTime: {
    current: 28,
    average: 42,
    percentile: 'Top 10%',
    label: 'Avg Wait Time (min)',
    inverse: true,
  },
  nps: {
    current: 72,
    average: 54,
    percentile: 'Top 25%',
    label: 'Net Promoter Score',
  },
  efficiency: {
    current: 92,
    average: 71,
    percentile: 'Top 5%',
    label: 'Schedule Efficiency',
  },
};

export default function TournamentAnalyticsPage() {
  const params = useParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('analytics');
  const [copied, setCopied] = useState(false);

  const clubId = params.id as string;

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(SOCIAL_RECAP);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleBack = () => {
    router.push(`/clubs/${clubId}/intelligence/tournament-ai`);
  };

  const tabs: Array<{ id: TabType; label: string }> = [
    { id: 'analytics', label: 'Analytics' },
    { id: 'recap', label: 'Auto Recap' },
    { id: 'benchmarks', label: 'Director Benchmarks' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            className="h-10 w-10"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Post-Tournament Analytics, Recap &amp; Director Benchmarks
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {TOURNAMENT_DATA.name} • {TOURNAMENT_DATA.status}
            </p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b bg-white">
        <div className="flex gap-8 px-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'border-b-2 px-1 py-4 text-sm font-medium transition-colors',
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="px-6 py-8">
        {/* ANALYTICS TAB */}
        {activeTab === 'analytics' && (
          <div className="space-y-8">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="p-6">
                <div className="text-gray-500 text-sm font-medium">Players</div>
                <div className="mt-2 text-3xl font-bold text-gray-900">
                  {TOURNAMENT_DATA.stats.players}
                </div>
              </Card>
              <Card className="p-6">
                <div className="text-gray-500 text-sm font-medium">Matches</div>
                <div className="mt-2 text-3xl font-bold text-gray-900">
                  {TOURNAMENT_DATA.stats.matches}
                </div>
              </Card>
              <Card className="p-6">
                <div className="text-gray-500 text-sm font-medium">
                  Courts Used
                </div>
                <div className="mt-2 text-3xl font-bold text-gray-900">
                  {TOURNAMENT_DATA.stats.courts}
                </div>
              </Card>
              <Card className="p-6">
                <div className="text-gray-500 text-sm font-medium">Duration</div>
                <div className="mt-2 text-3xl font-bold text-gray-900">
                  {TOURNAMENT_DATA.stats.duration}
                </div>
              </Card>
            </div>

            {/* Competitiveness Score */}
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-gray-900">
                Competitiveness Score
              </h2>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-4xl font-bold text-blue-600">
                  {TOURNAMENT_DATA.competitiveness.score}
                </span>
                <span className="text-lg text-gray-600">/10</span>
              </div>
              <p className="mt-3 text-sm text-gray-600">
                {TOURNAMENT_DATA.competitiveness.explanation}
              </p>
            </Card>

            {/* Match Quality Distribution */}
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-gray-900">
                Match Quality Distribution
              </h2>
              <div className="mt-6 space-y-4">
                {[
                  {
                    label: 'Nail-biters (10+ point swings)',
                    count: TOURNAMENT_DATA.matchQuality.nailbiters,
                    color: 'bg-green-500',
                  },
                  {
                    label: 'Competitive (5-10 point margin)',
                    count: TOURNAMENT_DATA.matchQuality.competitive,
                    color: 'bg-blue-500',
                  },
                  {
                    label: 'Blowouts (<5 point margin)',
                    count: TOURNAMENT_DATA.matchQuality.blowouts,
                    color: 'bg-orange-500',
                  },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">{item.label}</span>
                      <span className="font-semibold text-gray-900">
                        {item.count}
                      </span>
                    </div>
                    <div className="mt-2 h-3 overflow-hidden rounded-full bg-gray-200">
                      <div
                        className={cn('h-full', item.color)}
                        style={{ width: `${(item.count / 32) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Division Breakdown */}
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-gray-900">
                Division Breakdown
              </h2>
              <div className="mt-6 space-y-6">
                {TOURNAMENT_DATA.divisions.map((division) => (
                  <div
                    key={division.name}
                    className="border-b pb-6 last:border-b-0 last:pb-0"
                  >
                    <h3 className="font-semibold text-gray-900">
                      {division.name}
                    </h3>
                    <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div>
                        <p className="text-xs text-gray-500">
                          Avg Match Quality
                        </p>
                        <p className="mt-1 text-lg font-semibold text-gray-900">
                          {division.avgQuality}/10
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">
                          Most Competitive Match
                        </p>
                        <p className="mt-1 text-sm text-gray-900">
                          {division.mostCompetitive}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Biggest Upset</p>
                        <p className="mt-1 text-sm text-gray-900">
                          {division.biggestUpset}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Player Satisfaction */}
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-gray-900">
                Player Satisfaction
              </h2>
              <div className="mt-4 flex items-baseline gap-2">
                <div className="flex items-center gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={cn(
                        'h-5 w-5',
                        i <
                        Math.floor(TOURNAMENT_DATA.satisfaction.rating)
                          ? 'fill-yellow-400 text-yellow-400'
                          : 'text-gray-300'
                      )}
                    />
                  ))}
                </div>
                <span className="text-2xl font-bold text-gray-900">
                  {TOURNAMENT_DATA.satisfaction.rating}
                </span>
                <span className="text-gray-600">/5.0</span>
              </div>
              <p className="mt-2 text-sm text-gray-600">
                Based on {TOURNAMENT_DATA.satisfaction.responses} survey
                responses
              </p>
            </Card>

            {/* Revenue Summary */}
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-gray-900">
                Revenue Summary
              </h2>
              <div className="mt-6 space-y-4">
                <div className="flex justify-between">
                  <span className="text-gray-700">Entry Fees</span>
                  <span className="font-semibold text-gray-900">
                    ${TOURNAMENT_DATA.revenue.entryFees.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-700">Concessions</span>
                  <span className="font-semibold text-gray-900">
                    ${TOURNAMENT_DATA.revenue.concessions.toLocaleString()}
                  </span>
                </div>
                <div className="border-t pt-4 flex justify-between">
                  <span className="font-semibold text-gray-900">Total</span>
                  <span className="text-lg font-bold text-blue-600">
                    ${TOURNAMENT_DATA.revenue.total.toLocaleString()}
                  </span>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* RECAP TAB */}
        {activeTab === 'recap' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
              {/* Phone Mockup */}
              <div>
                <h2 className="mb-4 text-lg font-semibold text-gray-900">
                  Social Media Recap
                </h2>
                <div className="mx-auto w-full max-w-sm rounded-3xl border-8 border-gray-900 bg-gray-900 p-3 shadow-2xl">
                  <div className="rounded-2xl bg-white p-4 text-sm">
                    <div className="whitespace-pre-wrap text-gray-900">
                      {SOCIAL_RECAP}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="mt-6 space-y-2">
                  <Button
                    onClick={handleCopyToClipboard}
                    variant="outline"
                    className="w-full gap-2"
                  >
                    <Copy className="h-4 w-4" />
                    {copied ? 'Copied!' : 'Copy to Clipboard'}
                  </Button>
                  <Button
                    onClick={() => window.open('#')}
                    variant="outline"
                    className="w-full gap-2"
                  >
                    <Instagram className="h-4 w-4" />
                    Share to Instagram
                  </Button>
                  <Button
                    onClick={() => window.open('#')}
                    variant="outline"
                    className="w-full gap-2"
                  >
                    <Facebook className="h-4 w-4" />
                    Share to Facebook
                  </Button>
                </div>
              </div>

              {/* Email Recap */}
              <div>
                <h2 className="mb-4 text-lg font-semibold text-gray-900">
                  Email &amp; Newsletter Recap
                </h2>
                <Card className="p-6">
                  <div className="max-h-96 overflow-y-auto whitespace-pre-wrap text-sm text-gray-700">
                    {EMAIL_RECAP}
                  </div>
                </Card>
                <Button className="mt-4 w-full">
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Email Text
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* BENCHMARKS TAB */}
        {activeTab === 'benchmarks' && (
          <div className="space-y-8">
            {/* Benchmark Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {Object.entries(BENCHMARKS).map(([key, benchmark]) => {
                const improvement = benchmark.inverse
                  ? benchmark.average - benchmark.current
                  : benchmark.current - benchmark.average;
                return (
                  <Card key={key} className="p-4">
                    <p className="text-xs font-medium text-gray-500">
                      {benchmark.label}
                    </p>
                    <p className="mt-2 text-2xl font-bold text-gray-900">
                      {benchmark.current}
                      {benchmark.label.includes('(min)') ? '' : '%'}
                    </p>
                    <p className="mt-1 text-xs text-gray-600">
                      Avg: {benchmark.average}
                      {benchmark.label.includes('(min)') ? '' : '%'}
                    </p>
                    <Badge className="mt-3 bg-green-100 text-green-800">
                      {benchmark.percentile}
                    </Badge>
                  </Card>
                );
              })}
            </div>

            {/* Overall Director Score */}
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-gray-900">
                Overall Director Score
              </h2>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-5xl font-bold text-blue-600">8.4</span>
                <span className="text-2xl text-gray-600">/10</span>
              </div>
              <div className="mt-6 space-y-4">
                <div className="border-l-4 border-green-500 bg-green-50 p-4">
                  <p className="font-semibold text-gray-900">
                    Your strongest area: Schedule Efficiency
                  </p>
                  <p className="mt-1 text-sm text-gray-700">
                    Players loved the minimal downtime.
                  </p>
                </div>
                <div className="border-l-4 border-orange-500 bg-orange-50 p-4">
                  <p className="font-semibold text-gray-900">
                    Area to improve: Beginner-friendly divisions
                  </p>
                  <p className="mt-1 text-sm text-gray-700">
                    Consider adding more beginner divisions — you had 0 players
                    under 3.0 DUPR.
                  </p>
                </div>
              </div>
            </Card>

            {/* Benchmark Comparison Table */}
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="px-6 py-3 text-left font-semibold text-gray-900">
                        Metric
                      </th>
                      <th className="px-6 py-3 text-right font-semibold text-gray-900">
                        Your Tournament
                      </th>
                      <th className="px-6 py-3 text-right font-semibold text-gray-900">
                        Platform Avg
                      </th>
                      <th className="px-6 py-3 text-right font-semibold text-gray-900">
                        Percentile
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(BENCHMARKS).map(([key, benchmark]) => (
                      <tr key={key} className="border-b">
                        <td className="px-6 py-4 text-gray-900">
                          {benchmark.label}
                        </td>
                        <td className="px-6 py-4 text-right font-semibold text-gray-900">
                          {benchmark.current}
                          {benchmark.label.includes('(min)') ? '' : '%'}
                        </td>
                        <td className="px-6 py-4 text-right text-gray-700">
                          {benchmark.average}
                          {benchmark.label.includes('(min)') ? '' : '%'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Badge className="bg-blue-100 text-blue-800">
                            {benchmark.percentile}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
