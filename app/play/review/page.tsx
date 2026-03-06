'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Star, Zap, MessageSquare, Trophy, Calendar, Clock, Gift, CheckCircle2, ChevronRight, Flame, Target, Users, ThumbsUp, Swords, Award, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// ── Types ──
type ReviewStep = 'match-rating' | 'competitive' | 'play-again' | 'highlight' | 'complete';
type WeeklyStep = 'improving' | 'playtime' | 'social' | 'weekly-complete';
type TournamentStep = 'org-rating' | 'division-fit' | 'change' | 'best-match' | 'return' | 'tournament-complete';
type TabType = 'post-match' | 'weekly' | 'post-tournament';

// ── Mock Data ──
const MOCK_MATCH = {
  opponent: 'Sarah Chen',
  opponentDupr: 3.7,
  format: 'Singles',
  court: 'Court 3',
  date: 'Today, 6:15 PM',
  score: '11-7, 9-11, 11-8',
  result: 'W' as const,
};

const MOCK_TOURNAMENT_MATCHES = [
  { id: '1', opponent: 'Maria Santos', score: '11-5, 11-7', result: 'W' },
  { id: '2', opponent: 'Jake Thompson', score: '8-11, 11-9, 11-6', result: 'W' },
  { id: '3', opponent: 'Chris Park', score: '7-11, 6-11', result: 'L' },
  { id: '4', opponent: 'Alex Rivera', score: '11-9, 11-8', result: 'W' },
];

// ── Post-Match Review ──
function PostMatchReview() {
  const [step, setStep] = useState<ReviewStep>('match-rating');
  const [matchRating, setMatchRating] = useState(0);
  const [competitive, setCompetitive] = useState<string | null>(null);
  const [playAgain, setPlayAgain] = useState<string | null>(null);
  const [highlights, setHighlights] = useState<string[]>([]);
  const [xp, setXp] = useState(0);

  const addXp = (points: number) => setXp(prev => prev + points);

  const nextStep = () => {
    const steps: ReviewStep[] = ['match-rating', 'competitive', 'play-again', 'highlight', 'complete'];
    const idx = steps.indexOf(step);
    if (idx < steps.length - 1) setStep(steps[idx + 1]);
  };

  if (step === 'complete') {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-20 h-20 rounded-full bg-lime-100 flex items-center justify-center mb-6">
          <CheckCircle2 className="w-10 h-10 text-lime-600" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Review Complete!</h2>
        <p className="text-muted-foreground mb-6">Thanks for helping improve your matchmaking</p>
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 mb-8">
          <Flame className="w-5 h-5 text-amber-500" />
          <span className="font-bold text-amber-700">+{xp} XP earned</span>
        </div>
        <Card className="p-5 w-full max-w-sm text-left">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">AI Update</p>
          <p className="text-sm text-foreground leading-relaxed">
            Your feedback has been processed. Your matchmaking profile is now more accurate —
            future recommendations will factor in your competitive preference and play style insights.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      {/* Match Info */}
      <Card className="p-4 mb-6 bg-gradient-to-r from-lime-50 to-emerald-50 border-lime-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase">Just Played</p>
            <p className="font-bold text-lg">{MOCK_MATCH.opponent}</p>
            <p className="text-sm text-muted-foreground">{MOCK_MATCH.format} &middot; {MOCK_MATCH.court} &middot; {MOCK_MATCH.date}</p>
          </div>
          <div className="text-right">
            <Badge className={cn('text-lg px-3 py-1', MOCK_MATCH.result === 'W' ? 'bg-lime-600' : 'bg-red-500')}>
              {MOCK_MATCH.result}
            </Badge>
            <p className="text-sm font-mono mt-1">{MOCK_MATCH.score}</p>
          </div>
        </div>
      </Card>

      {/* Progress */}
      <div className="flex items-center gap-1 mb-6">
        {['match-rating', 'competitive', 'play-again', 'highlight'].map((s, i) => (
          <div key={s} className={cn(
            'h-1.5 flex-1 rounded-full transition-colors',
            ['match-rating', 'competitive', 'play-again', 'highlight'].indexOf(step) >= i
              ? 'bg-lime-500' : 'bg-gray-200'
          )} />
        ))}
        <div className="ml-2 flex items-center gap-1 text-xs font-semibold text-amber-600">
          <Flame className="w-3 h-3" />
          {xp} XP
        </div>
      </div>

      {/* Step 1: Match Rating */}
      {step === 'match-rating' && (
        <div className="text-center">
          <h2 className="text-xl font-bold mb-2">Rate this match</h2>
          <p className="text-muted-foreground text-sm mb-8">How was the overall experience?</p>
          <div className="flex justify-center gap-3 mb-8">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setMatchRating(n)}
                className={cn(
                  'w-14 h-14 rounded-xl border-2 flex items-center justify-center transition-all',
                  matchRating >= n
                    ? 'border-amber-400 bg-amber-50 scale-110'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                )}
              >
                <Star className={cn('w-7 h-7', matchRating >= n ? 'text-amber-400 fill-amber-400' : 'text-gray-300')} />
              </button>
            ))}
          </div>
          <Button
            className="w-full bg-lime-600 hover:bg-lime-700"
            disabled={matchRating === 0}
            onClick={() => { addXp(10); nextStep(); }}
          >
            Continue
          </Button>
        </div>
      )}

      {/* Step 2: Competitiveness */}
      {step === 'competitive' && (
        <div className="text-center">
          <h2 className="text-xl font-bold mb-2">How competitive was it?</h2>
          <p className="text-muted-foreground text-sm mb-6">This helps us find better matches for you</p>
          <div className="space-y-3 mb-8">
            {[
              { value: 'too-easy', emoji: '😴', label: 'Too easy', desc: 'I won without much effort' },
              { value: 'just-right', emoji: '🎯', label: 'Just right', desc: 'Competitive and fun' },
              { value: 'too-hard', emoji: '😤', label: 'Too challenging', desc: 'I was outmatched' },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setCompetitive(opt.value)}
                className={cn(
                  'w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all',
                  competitive === opt.value
                    ? 'border-lime-400 bg-lime-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                )}
              >
                <span className="text-2xl">{opt.emoji}</span>
                <div>
                  <p className="font-semibold">{opt.label}</p>
                  <p className="text-sm text-muted-foreground">{opt.desc}</p>
                </div>
              </button>
            ))}
          </div>
          <Button
            className="w-full bg-lime-600 hover:bg-lime-700"
            disabled={!competitive}
            onClick={() => { addXp(10); nextStep(); }}
          >
            Continue
          </Button>
        </div>
      )}

      {/* Step 3: Play Again */}
      {step === 'play-again' && (
        <div className="text-center">
          <h2 className="text-xl font-bold mb-2">Play {MOCK_MATCH.opponent} again?</h2>
          <p className="text-muted-foreground text-sm mb-6">We&apos;ll use this for future matchmaking</p>
          <div className="space-y-3 mb-8">
            {[
              { value: 'yes', emoji: '👍', label: 'Yes, definitely', desc: 'Great opponent' },
              { value: 'different-format', emoji: '🔄', label: 'Yes, but different format', desc: 'Would try doubles instead' },
              { value: 'no', emoji: '👎', label: 'Prefer not to', desc: 'Not the best match for me' },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPlayAgain(opt.value)}
                className={cn(
                  'w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all',
                  playAgain === opt.value
                    ? 'border-lime-400 bg-lime-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                )}
              >
                <span className="text-2xl">{opt.emoji}</span>
                <div>
                  <p className="font-semibold">{opt.label}</p>
                  <p className="text-sm text-muted-foreground">{opt.desc}</p>
                </div>
              </button>
            ))}
          </div>
          <Button
            className="w-full bg-lime-600 hover:bg-lime-700"
            disabled={!playAgain}
            onClick={() => { addXp(10); nextStep(); }}
          >
            Continue
          </Button>
        </div>
      )}

      {/* Step 4: Highlights (multi-select) */}
      {step === 'highlight' && (
        <div className="text-center">
          <h2 className="text-xl font-bold mb-2">Match highlights?</h2>
          <p className="text-muted-foreground text-sm mb-6">Optional — select all that stood out</p>
          <div className="grid grid-cols-2 gap-3 mb-8">
            {[
              { value: 'rally', emoji: '🔥', label: 'Epic rallies' },
              { value: 'serve', emoji: '💨', label: 'Great serves' },
              { value: 'comeback', emoji: '🔄', label: 'Big comeback' },
              { value: 'net-play', emoji: '🏐', label: 'Net play battles' },
              { value: 'strategy', emoji: '🧠', label: 'Strategic play' },
              { value: 'sportsmanship', emoji: '🤝', label: 'Great sportsmanship' },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setHighlights(prev =>
                  prev.includes(opt.value) ? prev.filter(v => v !== opt.value) : [...prev, opt.value]
                )}
                className={cn(
                  'flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all',
                  highlights.includes(opt.value)
                    ? 'border-lime-400 bg-lime-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                )}
              >
                <span className="text-2xl">{opt.emoji}</span>
                <span className="text-sm font-medium">{opt.label}</span>
              </button>
            ))}
          </div>
          <Button
            className="w-full bg-lime-600 hover:bg-lime-700"
            onClick={() => { addXp(highlights.length > 0 ? 15 : 5); nextStep(); }}
          >
            {highlights.length > 0 ? `Submit Review (${highlights.length} selected)` : 'Skip & Finish'}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Weekly Check-In ──
function WeeklyCheckIn() {
  const [step, setStep] = useState<WeeklyStep>('improving');
  const [improving, setImproving] = useState<string[]>([]);
  const [playtime, setPlaytime] = useState<string | null>(null);
  const [social, setSocial] = useState<string | null>(null);

  const toggleImproving = (val: string) => {
    setImproving(prev =>
      prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
    );
  };

  const nextStep = () => {
    const steps: WeeklyStep[] = ['improving', 'playtime', 'social', 'weekly-complete'];
    const idx = steps.indexOf(step);
    if (idx < steps.length - 1) setStep(steps[idx + 1]);
  };

  if (step === 'weekly-complete') {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center mb-6">
          <CheckCircle2 className="w-10 h-10 text-blue-600" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Weekly Check-In Done!</h2>
        <p className="text-muted-foreground mb-6">AI will optimize your recommendations this week</p>
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 mb-8">
          <Flame className="w-5 h-5 text-amber-500" />
          <span className="font-bold text-amber-700">+25 XP earned</span>
        </div>
        <Card className="p-5 w-full max-w-sm text-left">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">This Week&apos;s Focus</p>
          <p className="text-sm leading-relaxed">
            Based on your goals, we&apos;ll prioritize <strong>sessions with net play drills</strong> and
            match you with players who challenge your weak areas. Expect 2-3 personalized invites this week.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <Card className="p-4 mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-blue-600" />
          <div>
            <p className="font-bold">Weekly Check-In</p>
            <p className="text-sm text-muted-foreground">Quick 3 questions to personalize your week</p>
          </div>
        </div>
      </Card>

      <div className="flex items-center gap-1 mb-6">
        {['improving', 'playtime', 'social'].map((s, i) => (
          <div key={s} className={cn(
            'h-1.5 flex-1 rounded-full transition-colors',
            ['improving', 'playtime', 'social'].indexOf(step) >= i ? 'bg-blue-500' : 'bg-gray-200'
          )} />
        ))}
      </div>

      {step === 'improving' && (
        <div>
          <h2 className="text-xl font-bold mb-2 text-center">What are you working on?</h2>
          <p className="text-muted-foreground text-sm mb-6 text-center">Select all that apply</p>
          <div className="grid grid-cols-2 gap-3 mb-8">
            {[
              { value: 'serve', emoji: '💨', label: 'Serve' },
              { value: 'return', emoji: '↩️', label: 'Return' },
              { value: 'net-play', emoji: '🏐', label: 'Net play' },
              { value: 'consistency', emoji: '🎯', label: 'Consistency' },
              { value: 'strategy', emoji: '🧠', label: 'Strategy' },
              { value: 'fitness', emoji: '💪', label: 'Fitness' },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => toggleImproving(opt.value)}
                className={cn(
                  'flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all',
                  improving.includes(opt.value)
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                )}
              >
                <span className="text-2xl">{opt.emoji}</span>
                <span className="text-sm font-medium">{opt.label}</span>
              </button>
            ))}
          </div>
          <Button
            className="w-full bg-blue-600 hover:bg-blue-700"
            disabled={improving.length === 0}
            onClick={nextStep}
          >
            Continue
          </Button>
        </div>
      )}

      {step === 'playtime' && (
        <div className="text-center">
          <h2 className="text-xl font-bold mb-2">When do you want to play this week?</h2>
          <p className="text-muted-foreground text-sm mb-6">We&apos;ll send invites at the right time</p>
          <div className="space-y-3 mb-8">
            {[
              { value: 'morning', emoji: '🌅', label: 'Mornings', desc: 'Before 10am' },
              { value: 'midday', emoji: '☀️', label: 'Midday', desc: '10am - 2pm' },
              { value: 'evening', emoji: '🌆', label: 'Evenings', desc: 'After 5pm' },
              { value: 'weekend', emoji: '📅', label: 'Weekends only', desc: 'Saturday & Sunday' },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPlaytime(opt.value)}
                className={cn(
                  'w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all',
                  playtime === opt.value
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                )}
              >
                <span className="text-2xl">{opt.emoji}</span>
                <div>
                  <p className="font-semibold">{opt.label}</p>
                  <p className="text-sm text-muted-foreground">{opt.desc}</p>
                </div>
              </button>
            ))}
          </div>
          <Button
            className="w-full bg-blue-600 hover:bg-blue-700"
            disabled={!playtime}
            onClick={nextStep}
          >
            Continue
          </Button>
        </div>
      )}

      {step === 'social' && (
        <div className="text-center">
          <h2 className="text-xl font-bold mb-2">Open to new opponents?</h2>
          <p className="text-muted-foreground text-sm mb-6">Helps us diversify your matches</p>
          <div className="space-y-3 mb-8">
            {[
              { value: 'yes', emoji: '🤝', label: 'Yes, love meeting new people', desc: 'Match me with anyone at my level' },
              { value: 'some', emoji: '👥', label: 'Mix of both', desc: 'Some familiar, some new' },
              { value: 'familiar', emoji: '🏠', label: 'Prefer my regulars', desc: 'Stick with people I know' },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSocial(opt.value)}
                className={cn(
                  'w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all',
                  social === opt.value
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                )}
              >
                <span className="text-2xl">{opt.emoji}</span>
                <div>
                  <p className="font-semibold">{opt.label}</p>
                  <p className="text-sm text-muted-foreground">{opt.desc}</p>
                </div>
              </button>
            ))}
          </div>
          <Button
            className="w-full bg-blue-600 hover:bg-blue-700"
            disabled={!social}
            onClick={nextStep}
          >
            Submit Check-In
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Post-Tournament Survey ──
function PostTournamentSurvey() {
  const [step, setStep] = useState<TournamentStep>('org-rating');
  const [orgRating, setOrgRating] = useState(0);
  const [divisionFit, setDivisionFit] = useState<string | null>(null);
  const [change, setChange] = useState<string | null>(null);
  const [bestMatch, setBestMatch] = useState<string | null>(null);
  const [returnIntent, setReturnIntent] = useState<string | null>(null);

  const nextStep = () => {
    const steps: TournamentStep[] = ['org-rating', 'division-fit', 'change', 'best-match', 'return', 'tournament-complete'];
    const idx = steps.indexOf(step);
    if (idx < steps.length - 1) setStep(steps[idx + 1]);
  };

  if (step === 'tournament-complete') {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-20 h-20 rounded-full bg-purple-100 flex items-center justify-center mb-6">
          <Trophy className="w-10 h-10 text-purple-600" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Thanks for your feedback!</h2>
        <p className="text-muted-foreground mb-6">Your input helps directors run better tournaments</p>
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 mb-8">
          <Flame className="w-5 h-5 text-amber-500" />
          <span className="font-bold text-amber-700">+50 XP earned</span>
        </div>
        <Card className="p-5 w-full max-w-sm text-left">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">What Happens Next</p>
          <p className="text-sm leading-relaxed">
            Your feedback feeds into Director Benchmarks and improves division matching for future events.
            We found <strong>3 upcoming tournaments</strong> that match your level — check the Recommender!
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <Card className="p-4 mb-6 bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200">
        <div className="flex items-center gap-3">
          <Trophy className="w-5 h-5 text-purple-600" />
          <div>
            <p className="font-bold">Spring Championship 2025</p>
            <p className="text-sm text-muted-foreground">3rd Place &middot; Intermediate Doubles &middot; 4 matches played</p>
          </div>
        </div>
      </Card>

      <div className="flex items-center gap-1 mb-6">
        {['org-rating', 'division-fit', 'change', 'best-match', 'return'].map((s, i) => (
          <div key={s} className={cn(
            'h-1.5 flex-1 rounded-full transition-colors',
            ['org-rating', 'division-fit', 'change', 'best-match', 'return'].indexOf(step) >= i
              ? 'bg-purple-500' : 'bg-gray-200'
          )} />
        ))}
      </div>

      {step === 'org-rating' && (
        <div className="text-center">
          <h2 className="text-xl font-bold mb-2">Rate the tournament</h2>
          <p className="text-muted-foreground text-sm mb-8">Overall organization and experience</p>
          <div className="flex justify-center gap-3 mb-8">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setOrgRating(n)}
                className={cn(
                  'w-14 h-14 rounded-xl border-2 flex items-center justify-center transition-all',
                  orgRating >= n ? 'border-purple-400 bg-purple-50 scale-110' : 'border-gray-200 bg-white hover:border-gray-300'
                )}
              >
                <Star className={cn('w-7 h-7', orgRating >= n ? 'text-purple-400 fill-purple-400' : 'text-gray-300')} />
              </button>
            ))}
          </div>
          <Button className="w-full bg-purple-600 hover:bg-purple-700" disabled={orgRating === 0} onClick={nextStep}>
            Continue
          </Button>
        </div>
      )}

      {step === 'division-fit' && (
        <div className="text-center">
          <h2 className="text-xl font-bold mb-2">Was the skill level well-matched?</h2>
          <p className="text-muted-foreground text-sm mb-6">In your division</p>
          <div className="space-y-3 mb-8">
            {[
              { value: 'perfect', emoji: '✅', label: 'Perfect', desc: 'Everyone was at a similar level' },
              { value: 'mostly', emoji: '👌', label: 'Mostly good', desc: '1-2 mismatches but overall fine' },
              { value: 'too-wide', emoji: '📊', label: 'Too wide a range', desc: 'Big skill gaps in my division' },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setDivisionFit(opt.value)}
                className={cn(
                  'w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all',
                  divisionFit === opt.value ? 'border-purple-400 bg-purple-50' : 'border-gray-200 bg-white hover:border-gray-300'
                )}
              >
                <span className="text-2xl">{opt.emoji}</span>
                <div>
                  <p className="font-semibold">{opt.label}</p>
                  <p className="text-sm text-muted-foreground">{opt.desc}</p>
                </div>
              </button>
            ))}
          </div>
          <Button className="w-full bg-purple-600 hover:bg-purple-700" disabled={!divisionFit} onClick={nextStep}>
            Continue
          </Button>
        </div>
      )}

      {step === 'change' && (
        <div className="text-center">
          <h2 className="text-xl font-bold mb-2">One thing to improve?</h2>
          <p className="text-muted-foreground text-sm mb-6">What would make the next one better?</p>
          <div className="grid grid-cols-2 gap-3 mb-8">
            {[
              { value: 'scheduling', emoji: '📅', label: 'Scheduling' },
              { value: 'divisions', emoji: '📊', label: 'Divisions' },
              { value: 'format', emoji: '🔄', label: 'Format' },
              { value: 'venue', emoji: '🏟️', label: 'Venue' },
              { value: 'communication', emoji: '📢', label: 'Communication' },
              { value: 'nothing', emoji: '👌', label: 'Nothing!' },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setChange(opt.value)}
                className={cn(
                  'flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all',
                  change === opt.value ? 'border-purple-400 bg-purple-50' : 'border-gray-200 bg-white hover:border-gray-300'
                )}
              >
                <span className="text-2xl">{opt.emoji}</span>
                <span className="text-sm font-medium">{opt.label}</span>
              </button>
            ))}
          </div>
          <Button className="w-full bg-purple-600 hover:bg-purple-700" disabled={!change} onClick={nextStep}>
            Continue
          </Button>
        </div>
      )}

      {step === 'best-match' && (
        <div className="text-center">
          <h2 className="text-xl font-bold mb-2">Best match of the day?</h2>
          <p className="text-muted-foreground text-sm mb-6">Which game stood out?</p>
          <div className="space-y-3 mb-8">
            {MOCK_TOURNAMENT_MATCHES.map((m) => (
              <button
                key={m.id}
                onClick={() => setBestMatch(m.id)}
                className={cn(
                  'w-full flex items-center justify-between p-4 rounded-xl border-2 text-left transition-all',
                  bestMatch === m.id ? 'border-purple-400 bg-purple-50' : 'border-gray-200 bg-white hover:border-gray-300'
                )}
              >
                <div className="flex items-center gap-3">
                  <Badge className={cn('text-xs', m.result === 'W' ? 'bg-lime-600' : 'bg-red-500')}>
                    {m.result}
                  </Badge>
                  <span className="font-semibold">vs {m.opponent}</span>
                </div>
                <span className="text-sm font-mono text-muted-foreground">{m.score}</span>
              </button>
            ))}
          </div>
          <Button className="w-full bg-purple-600 hover:bg-purple-700" disabled={!bestMatch} onClick={nextStep}>
            Continue
          </Button>
        </div>
      )}

      {step === 'return' && (
        <div className="text-center">
          <h2 className="text-xl font-bold mb-2">Would you sign up for the next one?</h2>
          <p className="text-muted-foreground text-sm mb-6">From the same organizer</p>
          <div className="space-y-3 mb-8">
            {[
              { value: 'definitely', emoji: '🔥', label: 'Definitely', desc: 'Sign me up right now' },
              { value: 'maybe', emoji: '🤔', label: 'Maybe', desc: 'Depends on schedule and format' },
              { value: 'no', emoji: '👋', label: 'Probably not', desc: 'Not the right fit for me' },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setReturnIntent(opt.value)}
                className={cn(
                  'w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all',
                  returnIntent === opt.value ? 'border-purple-400 bg-purple-50' : 'border-gray-200 bg-white hover:border-gray-300'
                )}
              >
                <span className="text-2xl">{opt.emoji}</span>
                <div>
                  <p className="font-semibold">{opt.label}</p>
                  <p className="text-sm text-muted-foreground">{opt.desc}</p>
                </div>
              </button>
            ))}
          </div>
          <Button className="w-full bg-purple-600 hover:bg-purple-700" disabled={!returnIntent} onClick={nextStep}>
            Submit Feedback
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──
export default function ReviewPage() {
  const [activeTab, setActiveTab] = useState<TabType>('post-match');

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <Link href="/play">
              <Button variant="ghost" size="sm" className="gap-1">
                <ChevronLeft className="w-4 h-4" />
                Back
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1">
                <Flame className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-xs font-bold text-amber-700">Level 12</span>
              </div>
              <div className="flex items-center gap-1 bg-lime-50 border border-lime-200 rounded-lg px-3 py-1">
                <Award className="w-3.5 h-3.5 text-lime-600" />
                <span className="text-xs font-bold text-lime-700">847 XP</span>
              </div>
            </div>
          </div>

          {/* Tab Switcher */}
          <div className="flex gap-1 bg-muted rounded-lg p-1">
            {[
              { key: 'post-match' as TabType, label: 'Post-Match', icon: Swords },
              { key: 'weekly' as TabType, label: 'Weekly', icon: Calendar },
              { key: 'post-tournament' as TabType, label: 'Tournament', icon: Trophy },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-semibold transition-all',
                  activeTab === tab.key
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-lg mx-auto px-4 py-6">
        {activeTab === 'post-match' && <PostMatchReview />}
        {activeTab === 'weekly' && <WeeklyCheckIn />}
        {activeTab === 'post-tournament' && <PostTournamentSurvey />}
      </div>
    </div>
  );
}
