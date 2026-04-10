'use client';

import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Calendar, DollarSign, Zap, Info } from 'lucide-react';

export default function RecommenderPage() {
  const params = useParams();
  const router = useRouter();
  const clubId = params.id as string;

  // Mock player context
  const playerContext = {
    name: 'Maria Santos',
    dupr: 3.8,
    prefers: 'Doubles, Mixed',
    location: 'Phoenix, AZ',
  };

  // Mock tournaments
  const tournaments = [
    {
      id: 1,
      name: 'Weekend Mixed Doubles Open',
      date: 'Mar 15',
      venue: 'Desert Courts',
      distance: '8 min',
      formats: ['Doubles', 'Mixed'],
      fee: '$35',
      matchScore: 94,
      explanation:
        'Perfect skill match, your preferred format, 3 past opponents registered',
      fillStatus: '32/48 spots filled',
    },
    {
      id: 2,
      name: 'Spring League Finals',
      date: 'Mar 22',
      venue: 'Scottsdale RC',
      distance: '15 min',
      formats: ['Doubles', 'Competitive'],
      fee: '$45',
      matchScore: 87,
      explanation: 'Competitive doubles, rising players at your level',
      fillStatus: '28/40 spots filled',
    },
    {
      id: 3,
      name: 'Intermediate Round Robin',
      date: 'Mar 29',
      venue: 'Mesa Sports',
      distance: '22 min',
      formats: ['Round Robin'],
      fee: '$40',
      matchScore: 82,
      explanation: 'Good practice environment, players rated 3.5-4.0',
      fillStatus: '18/32 spots filled',
    },
    {
      id: 4,
      name: 'Sunset Social Tournament',
      date: 'Apr 5',
      venue: 'Phoenix PC',
      distance: '5 min',
      formats: ['Social', 'Mixed'],
      fee: '$30',
      matchScore: 78,
      explanation:
        'Social format, great for networking, food included',
      fillStatus: '36/50 spots filled',
    },
    {
      id: 5,
      name: 'Advanced Challenge Cup',
      date: 'Apr 12',
      venue: 'Tempe Athletic',
      distance: '18 min',
      formats: ['Doubles', 'Advanced'],
      fee: '$50',
      matchScore: 65,
      explanation:
        'Slightly above your level — good stretch challenge',
      fillStatus: '24/36 spots filled',
    },
    {
      id: 6,
      name: 'Beginner Friendly Mixer',
      date: 'Apr 19',
      venue: 'Gilbert CC',
      distance: '30 min',
      formats: ['Social', 'Beginner'],
      fee: '$25',
      matchScore: 42,
      explanation:
        'Below your skill level — skip unless mentoring',
      fillStatus: '42/60 spots filled',
    },
  ];

  // Score color function
  const getScoreColor = (score: number): string => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-blue-600';
    if (score >= 40) return 'text-amber-600';
    return 'text-red-600';
  };

  const getScoreBgColor = (score: number): string => {
    if (score >= 80) return 'bg-green-50 border-green-100';
    if (score >= 60) return 'bg-blue-50 border-blue-100';
    if (score >= 40) return 'bg-amber-50 border-amber-100';
    return 'bg-red-50 border-red-100';
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-slate-900">
              Recommended Tournaments
            </h1>
            <p className="text-lg text-slate-600">
              AI-picked events matching your profile
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

        {/* Player Context Bar */}
        <Card className="border-slate-200 bg-slate-100 p-4">
          <p className="text-sm text-slate-700">
            <span className="font-semibold">Showing for:</span>{' '}
            <span className="font-bold text-slate-900">
              {playerContext.name}
            </span>{' '}
            | DUPR {playerContext.dupr} | Prefers:{' '}
            <span className="font-semibold">{playerContext.prefers}</span> |
            Location:{' '}
            <span className="font-semibold">{playerContext.location}</span>
          </p>
        </Card>

        {/* Tournaments List */}
        <div className="space-y-4">
          {tournaments.map((tournament) => (
            <Card
              key={tournament.id}
              className={`border-2 p-6 transition-all hover:shadow-lg ${getScoreBgColor(
                tournament.matchScore
              )}`}
            >
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
                {/* Tournament Info */}
                <div className="lg:col-span-2">
                  <h3 className="mb-3 text-lg font-bold text-slate-900">
                    {tournament.name}
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-slate-600">
                      <Calendar className="h-4 w-4" />
                      <span>{tournament.date}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-600">
                      <MapPin className="h-4 w-4" />
                      <span>
                        {tournament.venue} ({tournament.distance})
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-600">
                      <DollarSign className="h-4 w-4" />
                      <span>{tournament.fee}</span>
                    </div>
                  </div>

                  {/* Format Badges */}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {tournament.formats.map((format) => (
                      <Badge key={format} variant="secondary">
                        {format}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Match Score */}
                <div className="flex flex-col items-center justify-center rounded-lg border border-slate-200 bg-white p-4 lg:col-span-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase">
                    Match Score
                  </p>
                  <p
                    className={`mt-2 text-4xl font-bold ${getScoreColor(
                      tournament.matchScore
                    )}`}
                  >
                    {tournament.matchScore}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">/100</p>
                </div>

                {/* Explanation & Action */}
                <div className="lg:col-span-2">
                  <div className="mb-4 flex gap-2 rounded-lg bg-slate-50 p-3">
                    <Info className="h-5 w-5 flex-shrink-0 text-slate-600" />
                    <p className="text-sm text-slate-700">
                      {tournament.explanation}
                    </p>
                  </div>

                  {/* Fill Status */}
                  <div className="mb-4">
                    <p className="text-xs text-slate-600 mb-2">
                      {tournament.fillStatus}
                    </p>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full bg-slate-400 transition-all"
                        style={{
                          width: `${
                            (parseInt(tournament.fillStatus) /
                              parseInt(tournament.fillStatus.split('/')[1])) *
                            100
                          }%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Register Button */}
                  <Button className="w-full" size="sm">
                    Register
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Why These Picks Section */}
        <Card className="border-purple-100 bg-gradient-to-br from-purple-50 to-pink-50 p-6">
          <h3 className="mb-3 flex items-center gap-2 text-lg font-bold text-purple-900">
            <Zap className="h-5 w-5" />
            Why these picks?
          </h3>
          <p className="text-slate-700">
            We analyzed your DUPR (3.8), preferred formats (doubles/mixed),
            location, schedule availability, past tournament history, and which
            registered players give you the most competitive matches.
          </p>
        </Card>
      </div>
    </div>
  );
}
