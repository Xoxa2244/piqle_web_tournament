'use client';

import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  Activity,
  TrendingUp,
  Share2,
  AlertCircle,
  Zap,
} from 'lucide-react';

interface Match {
  id: string;
  teamA: string;
  teamB: string;
  court: string;
  division: string;
  winProbabilityA: number;
  score?: string;
  aiReasoning: string;
  isUpset?: boolean;
  teamAColor: string;
  teamBColor: string;
}

interface PredictionStats {
  accuracy: number;
  correct: number;
  total: number;
  seasonAccuracy: number;
  mostSurprising: string;
}

// Mock data for currently playing matches
const currentlyPlayingMatches: Match[] = [
  {
    id: 'match-1',
    teamA: 'Team A1',
    teamB: 'Team B3',
    court: 'Court 2',
    division: 'Men&apos;s',
    winProbabilityA: 62,
    score: 'Set 1: 7-5, Set 2: 3-4',
    aiReasoning:
      'Team A1 has 4-1 h2h advantage and higher recent form rating',
    teamAColor: 'bg-blue-500',
    teamBColor: 'bg-red-500',
  },
  {
    id: 'match-2',
    teamA: 'Team B5',
    teamB: 'Team A2',
    court: 'Court 4',
    division: 'Women&apos;s',
    winProbabilityA: 38,
    score: 'Set 1: 6-3, Set 2: 2-2',
    aiReasoning:
      'Team B5 showing exceptional form with 5 consecutive match wins',
    isUpset: true,
    teamAColor: 'bg-purple-500',
    teamBColor: 'bg-green-500',
  },
  {
    id: 'match-3',
    teamA: 'Team C1',
    teamB: 'Team D2',
    court: 'Court 1',
    division: 'Mixed',
    winProbabilityA: 55,
    score: 'Set 1: 4-4',
    aiReasoning:
      'Evenly matched teams with nearly identical skill ratings',
    teamAColor: 'bg-orange-500',
    teamBColor: 'bg-indigo-500',
  },
];

// Mock data for upcoming matches
const upcomingMatches: Match[] = [
  {
    id: 'match-4',
    teamA: 'Team A3',
    teamB: 'Team C2',
    court: 'Court 3',
    division: 'Men&apos;s',
    winProbabilityA: 71,
    aiReasoning:
      'Based on pool stage results, this semifinal features a 3-0 vs 2-1 team. Historical data shows pool leaders win 71% of semifinals.',
    teamAColor: 'bg-blue-500',
    teamBColor: 'bg-orange-500',
  },
  {
    id: 'match-5',
    teamA: 'Team E1',
    teamB: 'Team F1',
    court: 'Court 5',
    division: 'Women&apos;s',
    winProbabilityA: 58,
    aiReasoning:
      'Strong defensive capabilities on both sides expected in this matchup',
    teamAColor: 'bg-pink-500',
    teamBColor: 'bg-cyan-500',
  },
  {
    id: 'match-6',
    teamA: 'Team G3',
    teamB: 'Team H1',
    court: 'Court 6',
    division: 'Mixed',
    winProbabilityA: 45,
    aiReasoning:
      'Team H1 has slight advantage in recent form metrics',
    teamAColor: 'bg-emerald-500',
    teamBColor: 'bg-yellow-500',
  },
];

// Mock stats
const predictionStats: PredictionStats = {
  accuracy: 78,
  correct: 14,
  total: 18,
  seasonAccuracy: 73,
  mostSurprising:
    'Team B5 upset #1 seed Team A1 (predicted 28% win probability)',
};

function WinProbabilityBar({
  teamA,
  teamB,
  probA,
}: {
  teamA: string;
  teamB: string;
  probA: number;
}) {
  const probB = 100 - probA;

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm font-medium">
        <span>{teamA}: {probA}%</span>
        <span>{probB}%: {teamB}</span>
      </div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className="bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-500"
          style={{ width: `${probA}%` }}
        />
        <div
          className="bg-gradient-to-l from-red-500 to-red-400 transition-all duration-500"
          style={{ width: `${probB}%` }}
        />
      </div>
    </div>
  );
}

function MatchCard({
  match,
  isLive = false,
  isKeyMatchup = false,
}: {
  match: Match;
  isLive?: boolean;
  isKeyMatchup?: boolean;
}) {
  return (
    <Card className="overflow-hidden border-l-4 border-l-blue-500 bg-gradient-to-br from-slate-50 to-slate-100 transition-all hover:shadow-lg">
      <div className="space-y-4 p-5">
        {/* Header with badges */}
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {isLive && (
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-green-500" />
                  <span className="text-xs font-semibold text-green-600">
                    LIVE
                  </span>
                </div>
              )}
            </div>
            <div className="text-lg font-bold text-slate-900">
              {match.teamA} vs {match.teamB}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Badge variant="outline" className="w-fit">
              {match.court}
            </Badge>
            <Badge variant="secondary" className="w-fit">
              {match.division}
            </Badge>
            {isKeyMatchup && (
              <Badge className="w-fit bg-amber-500 hover:bg-amber-600">
                Key Matchup
              </Badge>
            )}
          </div>
        </div>

        {/* Live score if available */}
        {match.score && (
          <div className="rounded-md bg-white p-3 text-sm font-medium text-slate-700">
            {match.score}
          </div>
        )}

        {/* Win probability bar */}
        <WinProbabilityBar
          teamA={match.teamA}
          teamB={match.teamB}
          probA={match.winProbabilityA}
        />

        {/* AI Reasoning */}
        <div className="rounded-md bg-blue-50 p-3 text-sm text-slate-700">
          <p className="leading-relaxed">{match.aiReasoning}</p>
        </div>

        {/* Upset alert if applicable */}
        {match.isUpset && (
          <div className="flex items-center gap-2 rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">
            <AlertCircle className="h-4 w-4" />
            Upset Alert {match.isUpset ? '🔥' : ''}
          </div>
        )}
      </div>
    </Card>
  );
}

export default function PredictionsPage() {
  const params = useParams();
  const router = useRouter();
  const clubId = params.id as string;

  const handleBack = () => {
    router.push(`/clubs/${clubId}/intelligence/tournament-ai`);
  };

  const handleShare = () => {
    // Mock share functionality
    alert('Prediction shared! (Mock functionality)');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="space-y-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="text-slate-300 hover:text-white"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Tournament AI
          </Button>

          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h1 className="text-4xl font-bold text-white">
                Spring Championship
              </h1>
              <div className="flex items-center gap-1.5 rounded-full bg-green-500/20 px-3 py-1">
                <div className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
                <span className="text-sm font-medium text-green-400">
                  Live Predictions
                </span>
              </div>
            </div>
            <p className="text-slate-400">
              Real-time match predictions powered by AI analysis
            </p>
          </div>
        </div>

        {/* Section 1: Currently Playing */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-green-500" />
            <h2 className="text-2xl font-bold text-white">
              Currently Playing
            </h2>
            <Badge className="bg-green-500 hover:bg-green-600">
              {currentlyPlayingMatches.length} matches
            </Badge>
          </div>
          <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-1">
            {currentlyPlayingMatches.map((match) => (
              <MatchCard key={match.id} match={match} isLive={true} />
            ))}
          </div>
        </section>

        {/* Section 2: Up Next */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            <h2 className="text-2xl font-bold text-white">Up Next</h2>
            <Badge variant="outline" className="text-slate-300">
              {upcomingMatches.length} matches
            </Badge>
          </div>
          <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-1">
            {upcomingMatches.map((match, index) => (
              <MatchCard
                key={match.id}
                match={match}
                isLive={false}
                isKeyMatchup={index === 0}
              />
            ))}
          </div>
        </section>

        {/* Section 3: Prediction Accuracy */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-500" />
            <h2 className="text-2xl font-bold text-white">
              Prediction Accuracy
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="border-blue-500/30 bg-gradient-to-br from-blue-500/10 to-blue-600/5 p-6">
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-300">
                  Today&apos;s Accuracy
                </p>
                <p className="text-3xl font-bold text-white">
                  {predictionStats.accuracy}%
                </p>
                <p className="text-sm text-slate-400">
                  {predictionStats.correct}/{predictionStats.total} correct
                </p>
              </div>
            </Card>
            <Card className="border-purple-500/30 bg-gradient-to-br from-purple-500/10 to-purple-600/5 p-6">
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-300">
                  Season Accuracy
                </p>
                <p className="text-3xl font-bold text-white">
                  {predictionStats.seasonAccuracy}%
                </p>
                <p className="text-sm text-slate-400">
                  Across all tournaments
                </p>
              </div>
            </Card>
          </div>

          {/* Most Surprising Result */}
          <Card className="border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-amber-600/5 p-6">
            <p className="text-sm font-medium text-slate-300">
              Most Surprising Result
            </p>
            <p className="mt-2 text-lg font-semibold text-white">
              {predictionStats.mostSurprising}
            </p>
          </Card>
        </section>

        {/* Section 4: Fan Engagement */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-white">
            Fan Engagement
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Share Prediction */}
            <Card className="border-green-500/30 bg-gradient-to-br from-green-500/10 to-green-600/5 p-6">
              <div className="space-y-4">
                <p className="text-sm font-medium text-slate-300">
                  Share Your Predictions
                </p>
                <p className="text-sm text-slate-400">
                  Let other fans know your predictions for today&apos;s matches
                </p>
                <Button
                  onClick={handleShare}
                  className="w-full gap-2 bg-green-600 hover:bg-green-700"
                >
                  <Share2 className="h-4 w-4" />
                  Share Prediction
                </Button>
              </div>
            </Card>

            {/* Spectator Poll */}
            <Card className="border-blue-500/30 bg-gradient-to-br from-blue-500/10 to-blue-600/5 p-6">
              <div className="space-y-4">
                <p className="text-sm font-medium text-slate-300">
                  Spectator Poll
                </p>
                <p className="text-sm font-semibold text-slate-100">
                  Who will win the final?
                </p>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-300">Team A3</span>
                      <span className="font-semibold text-blue-400">
                        62%
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-700">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-all"
                        style={{ width: '62%' }}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-300">Team C2</span>
                      <span className="font-semibold text-red-400">
                        38%
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-700">
                      <div
                        className="h-full rounded-full bg-red-500 transition-all"
                        style={{ width: '38%' }}
                      />
                    </div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="w-full border-slate-600 text-white hover:bg-slate-700"
                >
                  Cast Your Vote
                </Button>
              </div>
            </Card>
          </div>
        </section>

        {/* Footer spacer */}
        <div className="py-8" />
      </div>
    </div>
  );
}
