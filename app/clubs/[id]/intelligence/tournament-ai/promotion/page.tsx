'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  CheckCircle,
  Users,
  Mail,
  Bell,
  Globe,
  ChevronDown,
  Send,
  TrendingUp,
  Zap,
  Target,
} from 'lucide-react';

interface Player {
  id: string;
  name: string;
  duprRating: number;
  persona: 'Competitive' | 'Social' | 'Improver';
  matchScore: number;
  reasons: string[];
  personalizedMessage: string;
  inviteSent?: boolean;
}

interface PromotionChannel {
  id: string;
  name: string;
  icon: React.ReactNode;
  reach: number;
  predictedRegistrations: number;
  active: boolean;
}

interface Insight {
  id: string;
  text: string;
  icon: React.ReactNode;
}

export default function TournamentAIPromotionPage() {
  const router = useRouter();
  const params = useParams();
  const clubId = params?.id as string;

  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);
  const [sentInvites, setSentInvites] = useState<Set<string>>(new Set());
  const [channels, setChannels] = useState<PromotionChannel[]>([
    {
      id: 'email',
      name: 'Email Blast',
      icon: <Mail className="w-5 h-5" />,
      reach: 180,
      predictedRegistrations: 12,
      active: false,
    },
    {
      id: 'push',
      name: 'Push Notification',
      icon: <Bell className="w-5 h-5" />,
      reach: 95,
      predictedRegistrations: 8,
      active: false,
    },
    {
      id: 'marketplace',
      name: 'Marketplace Listing',
      icon: <Globe className="w-5 h-5" />,
      reach: 2400,
      predictedRegistrations: 18,
      active: false,
    },
  ]);

  const mockPlayers: Player[] = [
    {
      id: 'p1',
      name: 'Sarah Chen',
      duprRating: 3.7,
      persona: 'Competitive',
      matchScore: 94,
      reasons: [
        'Plays mixed doubles weekly',
        'DUPR 3.7 matches division range',
        'Lives 8 min from venue',
        'Played 3 tournaments this year',
      ],
      personalizedMessage:
        "Hi Sarah! We&apos;re hosting a Weekend Mixed Doubles tournament on March 15 that we think you&apos;d love. Your skill level and experience make you a perfect fit. Hope to see you there!",
    },
    {
      id: 'p2',
      name: 'Marcus Johnson',
      duprRating: 3.6,
      persona: 'Competitive',
      matchScore: 91,
      reasons: [
        'Attended last year&apos;s mixed doubles event',
        'DUPR 3.6 perfectly aligned',
        'Lives 12 min from venue',
        'High tournament engagement',
      ],
      personalizedMessage:
        "Marcus, you&apos;re invited to our Weekend Mixed Doubles tournament - March 15. Based on your tournament history and skill level, we think this will be a great fit for you!",
    },
    {
      id: 'p3',
      name: 'Jennifer Lee',
      duprRating: 3.8,
      persona: 'Competitive',
      matchScore: 89,
      reasons: [
        'Top performer in women&apos;s brackets',
        'DUPR 3.8 - slightly advanced',
        'Played 2 tournaments recently',
        'High match completion rate',
      ],
      personalizedMessage:
        "Jennifer! We&apos;d love to have you in our Weekend Mixed Doubles tournament on March 15. You&apos;re exactly the caliber of player who makes these events special.",
    },
    {
      id: 'p4',
      name: 'David Park',
      duprRating: 3.5,
      persona: 'Social',
      matchScore: 87,
      reasons: [
        'Active in social events',
        'DUPR 3.5 matches division',
        'Lives 5 min from venue',
        'Friends registered for this tournament',
      ],
      personalizedMessage:
        "David, we&apos;re running a Mixed Doubles tournament on March 15 and several of your tennis friends are already signed up. Would love to have you join!",
    },
    {
      id: 'p5',
      name: 'Alex Rodriguez',
      duprRating: 3.6,
      persona: 'Competitive',
      matchScore: 85,
      reasons: [
        'Consistent tournament participant',
        'DUPR 3.6 excellent fit',
        'Lives 10 min from venue',
        'Played mixed doubles doubles last month',
      ],
      personalizedMessage:
        "Alex, you&apos;re invited to our Weekend Mixed Doubles tournament on March 15. Based on your recent activity, this looks like a great event for you!",
    },
    {
      id: 'p6',
      name: 'Emily Watson',
      duprRating: 3.7,
      persona: 'Competitive',
      matchScore: 84,
      reasons: [
        'High win rate in tournaments',
        'DUPR 3.7 perfect level',
        'Lives 9 min from venue',
        'Attended 4 tournaments this year',
      ],
      personalizedMessage:
        "Emily, we&apos;re hosting a Weekend Mixed Doubles tournament on March 15 that we think matches your level perfectly. We hope you&apos;ll consider joining!",
    },
    {
      id: 'p7',
      name: 'Thomas Clark',
      duprRating: 3.4,
      persona: 'Improver',
      matchScore: 82,
      reasons: [
        'Actively improving over last 6 months',
        'DUPR 3.4 matches lower bracket',
        'Lives 7 min from venue',
        'Interested in competitive environments',
      ],
      personalizedMessage:
        "Thomas, you&apos;ve been showing great progress! Our Weekend Mixed Doubles tournament on March 15 would be a perfect opportunity to challenge yourself against competitive players.",
    },
    {
      id: 'p8',
      name: 'Sophia Martinez',
      duprRating: 3.8,
      persona: 'Competitive',
      matchScore: 80,
      reasons: [
        'Ranked player in mixed doubles',
        'DUPR 3.8 advanced level',
        'Lives 15 min from venue',
        'Plays 2-3 tournaments per month',
      ],
      personalizedMessage:
        "Sophia, we&apos;d be honored to have you compete in our Weekend Mixed Doubles tournament on March 15. Your skill level would elevate the entire event!",
    },
    {
      id: 'p9',
      name: 'Christopher Blake',
      duprRating: 3.5,
      persona: 'Social',
      matchScore: 78,
      reasons: [
        'Enjoys social mixed doubles play',
        'DUPR 3.5 matches division',
        'Lives 11 min from venue',
        'Previous positive event feedback',
      ],
      personalizedMessage:
        "Christopher, you&apos;re invited to our Weekend Mixed Doubles tournament on March 15. It&apos;s a great event for fun competitive play and meeting other players!",
    },
    {
      id: 'p10',
      name: 'Nicole Thompson',
      duprRating: 3.6,
      persona: 'Competitive',
      matchScore: 76,
      reasons: [
        'Consistent tournament participation',
        'DUPR 3.6 excellent fit',
        'Lives 13 min from venue',
        'Strong mixed doubles track record',
      ],
      personalizedMessage:
        "Nicole, we&apos;re hosting a Weekend Mixed Doubles tournament on March 15 and think you&apos;d be a great addition. Hope you can make it!",
    },
    {
      id: 'p11',
      name: 'Ryan Sullivan',
      duprRating: 3.4,
      persona: 'Improver',
      matchScore: 74,
      reasons: [
        'Recently joined competitive play',
        'DUPR 3.4 appropriate level',
        'Lives 9 min from venue',
        'Showed improvement in last event',
      ],
      personalizedMessage:
        "Ryan, our Weekend Mixed Doubles tournament on March 15 would be a great chance to continue your improvement journey. We&apos;d love to have you!",
    },
    {
      id: 'p12',
      name: 'Vanessa Ortiz',
      duprRating: 3.7,
      persona: 'Competitive',
      matchScore: 72,
      reasons: [
        'Strong tournament performer',
        'DUPR 3.7 matches advanced bracket',
        'Lives 10 min from venue',
        'High engagement in past events',
      ],
      personalizedMessage:
        "Vanessa, you&apos;re invited to our Weekend Mixed Doubles tournament on March 15. Your skill and experience would make this a great event for you!",
    },
    {
      id: 'p13',
      name: 'James Mitchell',
      duprRating: 3.5,
      persona: 'Social',
      matchScore: 70,
      reasons: [
        'Active in club social events',
        'DUPR 3.5 matches division',
        'Lives 6 min from venue',
        'Enjoys mixed doubles format',
      ],
      personalizedMessage:
        "James, we&apos;re running a Mixed Doubles tournament on March 15 and it looks like your kind of event. Would love to have you participate!",
    },
    {
      id: 'p14',
      name: 'Amanda Foster',
      duprRating: 3.6,
      persona: 'Competitive',
      matchScore: 68,
      reasons: [
        'Reliable tournament participant',
        'DUPR 3.6 good fit',
        'Lives 14 min from venue',
        'Previous event winner',
      ],
      personalizedMessage:
        "Amanda, we&apos;re hosting a Weekend Mixed Doubles tournament on March 15 and think you&apos;d be a fantastic competitor. Join us!",
    },
    {
      id: 'p15',
      name: 'Kevin Grant',
      duprRating: 3.4,
      persona: 'Improver',
      matchScore: 66,
      reasons: [
        'Progressing in skill level',
        'DUPR 3.4 matches progression',
        'Lives 12 min from venue',
        'Interested in tournament experience',
      ],
      personalizedMessage:
        "Kevin, our Weekend Mixed Doubles tournament on March 15 would be a great opportunity for you. Come challenge yourself and have fun!",
    },
  ];

  const insights: Insight[] = [
    {
      id: 'i1',
      text: '67% of your tournament signups happen in the last 5 days',
      icon: <TrendingUp className="w-5 h-5" />,
    },
    {
      id: 'i2',
      text: 'Mixed doubles events fill 23% faster when you add a social element (food/drinks)',
      icon: <Users className="w-5 h-5" />,
    },
    {
      id: 'i3',
      text: 'Players who played your last 2 tournaments have 82% chance of registering if invited personally',
      icon: <Target className="w-5 h-5" />,
    },
  ];

  const toggleChannel = (channelId: string) => {
    setChannels(
      channels.map((ch) =>
        ch.id === channelId ? { ...ch, active: !ch.active } : ch
      )
    );
  };

  const handleSendInvite = (playerId: string) => {
    const newSent = new Set(sentInvites);
    newSent.add(playerId);
    setSentInvites(newSent);
  };

  const handleSendAllTop10 = () => {
    const top10Ids = mockPlayers.slice(0, 10).map((p) => p.id);
    const newSent = new Set(sentInvites);
    top10Ids.forEach((id) => newSent.add(id));
    setSentInvites(newSent);
  };

  const getPersonaColor = (persona: string) => {
    switch (persona) {
      case 'Competitive':
        return 'bg-blue-100 text-blue-800';
      case 'Social':
        return 'bg-green-100 text-green-800';
      case 'Improver':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const fillPercentage = (28 / 48) * 100;
  const sentCount = sentInvites.size;
  const topTenSent = Array.from(sentInvites).filter(
    (id) => mockPlayers.findIndex((p) => p.id === id) < 10
  ).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  router.push(`/clubs/${clubId}/intelligence/tournament-ai`)
                }
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">
                  Weekend Mixed Doubles - March 15
                </h1>
                <p className="text-sm text-slate-600">AI Tournament Promotion</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-slate-600">
                Invites Sent: {sentCount}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Section 1: Tournament Status */}
        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
            <CheckCircle className="w-6 h-6 text-blue-600" />
            Tournament Status
          </h2>
          <Card className="p-6 bg-white">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
              <div>
                <p className="text-sm text-slate-600 font-medium">
                  Registered Players
                </p>
                <p className="text-3xl font-bold text-slate-900">
                  28<span className="text-lg text-slate-600">/48</span>
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-600 font-medium">
                  Spots Remaining
                </p>
                <p className="text-3xl font-bold text-orange-600">20</p>
              </div>
              <div>
                <p className="text-sm text-slate-600 font-medium">
                  Days Until Close
                </p>
                <p className="text-3xl font-bold text-slate-900">9</p>
              </div>
              <div>
                <p className="text-sm text-slate-600 font-medium">Entry Fee</p>
                <p className="text-3xl font-bold text-green-600">$35</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700">
                  Registration Progress
                </p>
                <p className="text-sm text-slate-600">{fillPercentage.toFixed(0)}%</p>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-3">
                <div
                  className="bg-gradient-to-r from-blue-600 to-blue-500 h-3 rounded-full transition-all duration-500"
                  style={{ width: `${fillPercentage}%` }}
                />
              </div>
            </div>
          </Card>
        </section>

        {/* Section 2: AI-Recommended Players */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-6 h-6 text-blue-600" />
              AI-Recommended Players
            </h2>
            <Button
              onClick={handleSendAllTop10}
              disabled={topTenSent === 10}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Send className="w-4 h-4 mr-2" />
              Send All Top 10
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {mockPlayers.map((player, index) => (
              <Card
                key={player.id}
                className="p-4 bg-white hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div>
                        <h3 className="font-semibold text-slate-900">
                          {index + 1}. {player.name}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge className="bg-slate-100 text-slate-800">
                            DUPR {player.duprRating}
                          </Badge>
                          <Badge className={getPersonaColor(player.persona)}>
                            {player.persona}
                          </Badge>
                          <div className="text-sm font-medium text-slate-600">
                            Match Score:{' '}
                            <span className="text-blue-600 font-bold">
                              {player.matchScore}
                            </span>
                            /100
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 mb-3">
                      <p className="text-sm font-medium text-slate-700 mb-2">
                        Why AI picked them:
                      </p>
                      <ul className="text-sm text-slate-600 space-y-1">
                        {player.reasons.map((reason, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-blue-600 mt-0.5">•</span>
                            <span>{reason}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {expandedPlayerId === player.id && (
                      <div className="bg-slate-50 rounded-lg p-4 mb-3 border border-slate-200">
                        <p className="text-sm font-medium text-slate-700 mb-2">
                          Personalized Invite Message:
                        </p>
                        <p className="text-sm text-slate-600 italic">
                          &quot;{player.personalizedMessage}&quot;
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setExpandedPlayerId(
                          expandedPlayerId === player.id ? null : player.id
                        )
                      }
                      className="whitespace-nowrap"
                    >
                      <ChevronDown
                        className={cn(
                          'w-4 h-4 transition-transform',
                          expandedPlayerId === player.id && 'rotate-180'
                        )}
                      />
                      Preview
                    </Button>
                    <Button
                      onClick={() => handleSendInvite(player.id)}
                      disabled={sentInvites.has(player.id)}
                      className={cn(
                        'whitespace-nowrap',
                        sentInvites.has(player.id)
                          ? 'bg-green-600 hover:bg-green-700'
                          : 'bg-blue-600 hover:bg-blue-700'
                      )}
                    >
                      {sentInvites.has(player.id) ? (
                        <>
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Sent
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4 mr-1" />
                          Send
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>

        {/* Section 3: Promotion Channels */}
        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Zap className="w-6 h-6 text-blue-600" />
            Promotion Channels
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {channels.map((channel) => (
              <Card key={channel.id} className="p-6 bg-white">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="text-blue-600">{channel.icon}</div>
                    <h3 className="font-semibold text-slate-900">
                      {channel.name}
                    </h3>
                  </div>
                  <button
                    onClick={() => toggleChannel(channel.id)}
                    className={cn(
                      'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                      channel.active ? 'bg-green-600' : 'bg-slate-300'
                    )}
                  >
                    <span
                      className={cn(
                        'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                        channel.active ? 'translate-x-6' : 'translate-x-1'
                      )}
                    />
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-slate-600 font-medium">
                      Reach
                    </p>
                    <p className="text-2xl font-bold text-slate-900">
                      {channel.reach.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600 font-medium">
                      Predicted Registrations
                    </p>
                    <p className="text-lg font-bold text-green-600">
                      +{channel.predictedRegistrations}
                    </p>
                  </div>
                  {channel.active && (
                    <Badge className="w-full justify-center bg-green-100 text-green-800">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Active
                    </Badge>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </section>

        {/* Section 4: AI Insights */}
        <section>
          <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-blue-600" />
            AI Insights
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {insights.map((insight) => (
              <Card
                key={insight.id}
                className="p-6 bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200"
              >
                <div className="flex items-start gap-4">
                  <div className="text-blue-600 flex-shrink-0">
                    {insight.icon}
                  </div>
                  <p className="text-sm text-slate-700 font-medium leading-relaxed">
                    {insight.text}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
