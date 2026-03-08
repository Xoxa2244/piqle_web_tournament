'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw, CheckCircle2, AlertTriangle, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type Tab = 'schedule' | 'rebalancing';

interface ScheduleMatch {
  matchId: string;
  teamA: string;
  teamB: string;
  division: 'A' | 'B' | 'C';
}

const DIVISION_COLORS: Record<string, string> = {
  A: 'bg-blue-100 text-blue-800',
  B: 'bg-purple-100 text-purple-800',
  C: 'bg-green-100 text-green-800',
};

// Mock schedule data: 6 courts x 6 time slots
const MOCK_SCHEDULE: Record<string, Record<string, ScheduleMatch | null>> = {
  '9:00': {
    Court1: { matchId: 'M01', teamA: 'Lightning', teamB: 'Thunder', division: 'A' },
    Court2: { matchId: 'M02', teamA: 'Phoenix', teamB: 'Eagles', division: 'A' },
    Court3: { matchId: 'M03', teamA: 'Wolves', teamB: 'Bears', division: 'B' },
    Court4: { matchId: 'M04', teamA: 'Tigers', teamB: 'Lions', division: 'B' },
    Court5: { matchId: 'M05', teamA: 'Hawks', teamB: 'Falcons', division: 'C' },
    Court6: { matchId: 'M06', teamA: 'Owls', teamB: 'Crows', division: 'C' },
  },
  '9:45': {
    Court1: { matchId: 'M07', teamA: 'Stallions', teamB: 'Horses', division: 'A' },
    Court2: { matchId: 'M08', teamA: 'Vipers', teamB: 'Cobras', division: 'A' },
    Court3: null,
    Court4: { matchId: 'M09', teamA: 'Sharks', teamB: 'Rays', division: 'B' },
    Court5: { matchId: 'M10', teamA: 'Dolphins', teamB: 'Whales', division: 'C' },
    Court6: null,
  },
  '10:30': {
    Court1: { matchId: 'M11', teamA: 'Dragons', teamB: 'Phoenixes', division: 'A' },
    Court2: { matchId: 'M12', teamA: 'Titans', teamB: 'Giants', division: 'B' },
    Court3: { matchId: 'M13', teamA: 'Cyclones', teamB: 'Tornadoes', division: 'B' },
    Court4: null,
    Court5: { matchId: 'M14', teamA: 'Meteors', teamB: 'Comets', division: 'C' },
    Court6: { matchId: 'M15', teamA: 'Stars', teamB: 'Moons', division: 'C' },
  },
  '11:15': {
    Court1: { matchId: 'M16', teamA: 'Kings', teamB: 'Queens', division: 'A' },
    Court2: null,
    Court3: { matchId: 'M17', teamA: 'Princes', teamB: 'Dukes', division: 'B' },
    Court4: { matchId: 'M18', teamA: 'Counts', teamB: 'Earls', division: 'B' },
    Court5: null,
    Court6: { matchId: 'M19', teamA: 'Barons', teamB: 'Viscounts', division: 'C' },
  },
  '12:00': {
    Court1: { matchId: 'M20', teamA: 'Shadows', teamB: 'Ghosts', division: 'A' },
    Court2: { matchId: 'M21', teamA: 'Specters', teamB: 'Phantoms', division: 'A' },
    Court3: { matchId: 'M22', teamA: 'Spirits', teamB: 'Wraiths', division: 'B' },
    Court4: { matchId: 'M23', teamA: 'Demons', teamB: 'Devils', division: 'B' },
    Court5: { matchId: 'M24', teamA: 'Angels', teamB: 'Cherubs', division: 'C' },
    Court6: null,
  },
  '12:45': {
    Court1: { matchId: 'M25', teamA: 'Legends', teamB: 'Myths', division: 'A' },
    Court2: null,
    Court3: null,
    Court4: { matchId: 'M26', teamA: 'Epics', teamB: 'Tales', division: 'B' },
    Court5: { matchId: 'M27', teamA: 'Sagas', teamB: 'Chronicles', division: 'C' },
    Court6: null,
  },
};

const TIME_SLOTS = ['9:00', '9:45', '10:30', '11:15', '12:00', '12:45'];
const COURTS = ['Court1', 'Court2', 'Court3', 'Court4', 'Court5', 'Court6'];

export default function LiveTournamentPage() {
  const params = useParams();
  const router = useRouter();
  const clubId = params.id as string;
  
  const [activeTab, setActiveTab] = useState<Tab>('schedule');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [selectedRebalancings, setSelectedRebalancings] = useState<Set<number>>(new Set([0, 1, 2]));

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    setIsRegenerating(false);
  };

  const toggleRebalancing = (index: number) => {
    const newSet = new Set(selectedRebalancings);
    if (newSet.has(index)) {
      newSet.delete(index);
    } else {
      newSet.add(index);
    }
    setSelectedRebalancings(newSet);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push(`/clubs/${clubId}/intelligence/tournament-ai`)}
              className="rounded-lg p-2 hover:bg-slate-100 transition-colors"
            >
              <ArrowLeft className="h-5 w-5 text-slate-600" />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Smart Schedule &amp; Live Rebalancing</h1>
              <p className="text-sm text-slate-600 mt-1">Spring Championship - AI-Powered Tournament Management</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex gap-8">
            <button
              onClick={() => setActiveTab('schedule')}
              className={cn(
                'px-4 py-4 font-medium text-sm border-b-2 transition-colors',
                activeTab === 'schedule'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              )}
            >
              Smart Schedule
            </button>
            <button
              onClick={() => setActiveTab('rebalancing')}
              className={cn(
                'px-4 py-4 font-medium text-sm border-b-2 transition-colors',
                activeTab === 'rebalancing'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              )}
            >
              Live Rebalancing
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'schedule' && (
          <div className="space-y-8">
            {/* Schedule Grid */}
            <Card className="overflow-hidden border-slate-200">
              <div className="bg-white p-6">
                <h2 className="text-xl font-bold text-slate-900 mb-6">Tournament Schedule</h2>
                
                {/* Responsive schedule table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="text-left font-semibold text-slate-600 py-3 px-4 w-20">Time</th>
                        {COURTS.map(court => (
                          <th
                            key={court}
                            className="text-center font-semibold text-slate-600 py-3 px-2"
                          >
                            {court.replace('Court', 'Court ')}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {TIME_SLOTS.map(time => (
                        <tr key={time} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="font-medium text-slate-900 py-4 px-4">{time}</td>
                          {COURTS.map(court => {
                            const match = MOCK_SCHEDULE[time][court];
                            return (
                              <td key={`${time}-${court}`} className="py-4 px-2">
                                {match ? (
                                  <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-lg p-2 border border-slate-200 hover:border-slate-300 transition-colors">
                                    <div className="text-xs font-mono text-slate-600 mb-1">{match.matchId}</div>
                                    <div className="text-xs font-semibold text-slate-900 mb-2 line-clamp-2">
                                      {match.teamA} vs {match.teamB}
                                    </div>
                                    <Badge className={cn('text-xs', DIVISION_COLORS[match.division])}>
                                      Division {match.division}
                                    </Badge>
                                  </div>
                                ) : (
                                  <div className="text-center text-xs text-slate-400 py-3">—</div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>

            {/* Optimization Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="border-slate-200">
                <div className="p-6">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-sm font-semibold text-slate-600">Avg Rest Between Matches</h3>
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  </div>
                  <p className="text-2xl font-bold text-slate-900">38 min</p>
                  <p className="text-xs text-slate-500 mt-1">Target: 30 min &apos;s</p>
                </div>
              </Card>

              <Card className="border-slate-200">
                <div className="p-6">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-sm font-semibold text-slate-600">Court Conflicts</h3>
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  </div>
                  <p className="text-2xl font-bold text-slate-900">0</p>
                  <p className="text-xs text-slate-500 mt-1">No scheduling conflicts</p>
                </div>
              </Card>

              <Card className="border-slate-200">
                <div className="p-6">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-sm font-semibold text-slate-600">Tournament Duration</h3>
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  </div>
                  <p className="text-2xl font-bold text-slate-900">4.5h</p>
                  <p className="text-xs text-slate-500 mt-1">Manual estimate: 6 hours</p>
                </div>
              </Card>

              <Card className="border-slate-200">
                <div className="p-6">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-sm font-semibold text-slate-600">VIP Matches on Court 1</h3>
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  </div>
                  <p className="text-2xl font-bold text-slate-900">4/4</p>
                  <p className="text-xs text-slate-500 mt-1">All scheduled</p>
                </div>
              </Card>
            </div>

            {/* Action Button */}
            <div className="flex justify-end">
              <Button
                onClick={handleRegenerate}
                disabled={isRegenerating}
                className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white"
              >
                <RefreshCw className={cn('h-4 w-4 mr-2', isRegenerating && 'animate-spin')} />
                {isRegenerating ? 'Regenerating...' : 'Regenerate Schedule'}
              </Button>
            </div>
          </div>
        )}

        {activeTab === 'rebalancing' && (
          <div className="space-y-6">
            {/* Alert */}
            <Card className="border-orange-200 bg-orange-50">
              <div className="p-6 flex items-start gap-4">
                <AlertTriangle className="h-6 w-6 text-orange-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-orange-900 mb-1">2 Players Dropped</h3>
                  <p className="text-sm text-orange-800">
                    Alex Johnson (Division A) and Pat Wilson (Division B) have withdrawn from the tournament.
                  </p>
                </div>
              </div>
            </Card>

            {/* AI Recommendations */}
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-4">AI Rebalancing Proposals</h2>
              <div className="space-y-4">
                {/* Card 1: Pool Rebalancing */}
                <Card
                  className={cn(
                    'border-2 transition-colors cursor-pointer',
                    selectedRebalancings.has(0)
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300'
                  )}
                  onClick={() => toggleRebalancing(0)}
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={selectedRebalancings.has(0)}
                          onChange={() => toggleRebalancing(0)}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <div>
                          <h3 className="font-semibold text-slate-900">Pool Rebalancing</h3>
                          <p className="text-sm text-slate-600 mt-1">
                            Move Team B4 from Pool 2 → Pool 1 to replace gap
                          </p>
                        </div>
                      </div>
                      <Badge className="bg-green-100 text-green-800">Recommended</Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-200">
                      <div>
                        <p className="text-xs font-semibold text-slate-600 mb-2">BEFORE</p>
                        <div className="space-y-1 text-xs">
                          <div className="bg-slate-100 rounded px-2 py-1">Pool 1: 8 teams</div>
                          <div className="bg-slate-100 rounded px-2 py-1">Pool 2: 9 teams</div>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-600 mb-2">AFTER</p>
                        <div className="space-y-1 text-xs">
                          <div className="bg-green-100 rounded px-2 py-1">Pool 1: 9 teams</div>
                          <div className="bg-green-100 rounded px-2 py-1">Pool 2: 8 teams</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Card 2: Bye Assignment */}
                <Card
                  className={cn(
                    'border-2 transition-colors cursor-pointer',
                    selectedRebalancings.has(1)
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300'
                  )}
                  onClick={() => toggleRebalancing(1)}
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={selectedRebalancings.has(1)}
                          onChange={() => toggleRebalancing(1)}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <div>
                          <h3 className="font-semibold text-slate-900">Bye Assignment</h3>
                          <p className="text-sm text-slate-600 mt-1">
                            Give bye to Team A3 in Round 3 (least impact on standings)
                          </p>
                        </div>
                      </div>
                      <Badge className="bg-green-100 text-green-800">Recommended</Badge>
                    </div>
                    
                    <div className="mt-4 pt-4 border-t border-slate-200">
                      <p className="text-xs text-slate-600 mb-2">Impact on Team A3:</p>
                      <div className="bg-slate-50 rounded px-3 py-2 text-xs">
                        <p className="text-slate-700">Standings Impact: +0 (bye treated as draw)</p>
                        <p className="text-slate-700 mt-1">Current Record: 2W-0L-1D</p>
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Card 3: Schedule Adjustment */}
                <Card
                  className={cn(
                    'border-2 transition-colors cursor-pointer',
                    selectedRebalancings.has(2)
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300'
                  )}
                  onClick={() => toggleRebalancing(2)}
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={selectedRebalancings.has(2)}
                          onChange={() => toggleRebalancing(2)}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <div>
                          <h3 className="font-semibold text-slate-900">Schedule Adjustment</h3>
                          <p className="text-sm text-slate-600 mt-1">
                            Reschedule Match #14 from Court 3 → Court 5 (available 15 min earlier)
                          </p>
                        </div>
                      </div>
                      <Badge className="bg-green-100 text-green-800">Recommended</Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-200">
                      <div>
                        <p className="text-xs font-semibold text-slate-600 mb-2">CURRENT</p>
                        <div className="space-y-1 text-xs">
                          <div className="bg-slate-100 rounded px-2 py-1">Court 3 at 12:00</div>
                          <div className="bg-slate-100 rounded px-2 py-1">Status: Scheduled</div>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-600 mb-2">NEW</p>
                        <div className="space-y-1 text-xs">
                          <div className="bg-green-100 rounded px-2 py-1">Court 5 at 11:45</div>
                          <div className="bg-green-100 rounded px-2 py-1">Saves 15 minutes</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            </div>

            {/* Impact Analysis */}
            <Card className="border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100">
              <div className="p-6">
                <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Zap className="h-5 w-5 text-amber-600" />
                  Impact Analysis
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white rounded-lg p-4 border border-slate-200">
                    <p className="text-sm text-slate-600 mb-2">Standings Impact</p>
                    <p className="text-lg font-semibold text-slate-900">
                      Minimal <span className="text-green-600">(0 matches affected)</span>
                    </p>
                    <p className="text-xs text-slate-500 mt-2">in completed rounds</p>
                  </div>
                  <div className="bg-white rounded-lg p-4 border border-slate-200">
                    <p className="text-sm text-slate-600 mb-2">Schedule Impact</p>
                    <p className="text-lg font-semibold text-slate-900">
                      Tournament ends <span className="text-green-600">20 min earlier</span>
                    </p>
                    <p className="text-xs text-slate-500 mt-2">Total duration: 4.5 hours</p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Action Buttons */}
            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                className="border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                Apply Individually
              </Button>
              <Button
                disabled={Array.from(selectedRebalancings).length === 0}
                className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Apply All Changes ({Array.from(selectedRebalancings).length})
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
