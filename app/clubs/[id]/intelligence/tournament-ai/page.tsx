'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Brain, Shuffle, Megaphone, CalendarClock, BarChart3, User, Compass, Zap, TrendingUp, Users, Trophy, Swords, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const features = [
  {
    category: 'Before Tournament',
    color: 'from-blue-500 to-blue-600',
    items: [
      {
        href: 'tournament-ai/setup',
        icon: Shuffle,
        iconBg: 'bg-blue-50 text-blue-600',
        title: 'Smart Seeding & Divisions',
        description: 'AI auto-seeds players by DUPR, h2h history, and club affiliation. Builds optimal divisions with balanced skill levels.',
        badge: 'Pre-Tournament',
        badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
      },
      {
        href: 'tournament-ai/promotion',
        icon: Megaphone,
        iconBg: 'bg-purple-50 text-purple-600',
        title: 'AI Promotion & Fill Prediction',
        description: 'Predict fill rate before registration closes. AI finds and invites the best-match players to hit your target.',
        badge: 'Pre-Tournament',
        badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
      },
    ],
  },
  {
    category: 'During Tournament',
    color: 'from-amber-500 to-orange-500',
    items: [
      {
        href: 'tournament-ai/live',
        icon: CalendarClock,
        iconBg: 'bg-amber-50 text-amber-600',
        title: 'Smart Schedule & Live Rebalancing',
        description: 'Optimal match scheduling with rest time, court conflicts, and VIP placement. Instant re-balancing when players drop.',
        badge: 'Live',
        badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
      },
      {
        href: 'tournament-ai/predictions',
        icon: Target,
        iconBg: 'bg-red-50 text-red-600',
        title: 'Real-Time Match Predictions',
        description: 'Live win probabilities based on DUPR, form, and h2h. Updates after each set. Drives spectator engagement.',
        badge: 'Live',
        badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
      },
    ],
  },
  {
    category: 'After Tournament',
    color: 'from-lime-500 to-green-600',
    items: [
      {
        href: 'tournament-ai/analytics',
        icon: BarChart3,
        iconBg: 'bg-lime-50 text-lime-600',
        title: 'Post-Tournament Analytics & Recap',
        description: 'Auto-generated report: competitiveness scores, highlights, social media recap, and director benchmarks vs platform average.',
        badge: 'Post-Tournament',
        badgeColor: 'bg-lime-50 text-lime-700 border-lime-200',
      },
      {
        href: 'tournament-ai/player-insights',
        icon: User,
        iconBg: 'bg-teal-50 text-teal-600',
        title: 'Player Insights & Rivalry Graph',
        description: 'Personal performance breakdown for every participant. Win rates, strengths, h2h rivalry tracker with rematch suggestions.',
        badge: 'Post-Tournament',
        badgeColor: 'bg-lime-50 text-lime-700 border-lime-200',
      },
    ],
  },
  {
    category: 'Discovery',
    color: 'from-violet-500 to-purple-600',
    items: [
      {
        href: 'tournament-ai/recommender',
        icon: Compass,
        iconBg: 'bg-violet-50 text-violet-600',
        title: 'Tournament Recommender',
        description: 'Netflix for tournaments. AI matches players to upcoming events by skill level, location, format preference, and schedule.',
        badge: 'Cross-Tournament',
        badgeColor: 'bg-violet-50 text-violet-700 border-violet-200',
      },
    ],
  },
];

export default function TournamentAIPage() {
  const { id: clubId } = useParams();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-gradient-to-r from-background to-muted/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center gap-3 mb-4">
            <Link href={`/clubs/${clubId}/intelligence`}>
              <Button variant="ghost" size="sm" className="gap-1">
                <ChevronLeft className="w-4 h-4" />
                Intelligence
              </Button>
            </Link>
          </div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl shadow-lg shadow-amber-500/20">
              <Trophy className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Tournament AI</h1>
              <p className="text-muted-foreground">AI-powered features for every stage of your tournament</p>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-4">
            <Badge variant="outline" className="gap-1 text-amber-700 border-amber-300 bg-amber-50">
              <Zap className="w-3 h-3" />
              13 AI Features
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Brain className="w-3 h-3" />
              Works with existing tournament data
            </Badge>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
        {features.map((section) => (
          <div key={section.category}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`h-1 w-8 rounded-full bg-gradient-to-r ${section.color}`} />
              <h2 className="text-lg font-bold text-foreground">{section.category}</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {section.items.map((item) => (
                <Link
                  key={item.href}
                  href={`/clubs/${clubId}/intelligence/${item.href}`}
                >
                  <Card className="p-6 h-full hover:shadow-lg hover:border-primary/30 transition-all duration-200 cursor-pointer group">
                    <div className="flex items-start gap-4">
                      <div className={`p-2.5 rounded-xl ${item.iconBg} group-hover:scale-110 transition-transform`}>
                        <item.icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-bold text-foreground group-hover:text-primary transition-colors">{item.title}</h3>
                        </div>
                        <Badge variant="outline" className={`text-xs mb-2 ${item.badgeColor}`}>
                          {item.badge}
                        </Badge>
                        <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
