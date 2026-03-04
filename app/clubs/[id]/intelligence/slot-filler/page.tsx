'use client';

import { useState } from 'react';
import { ChevronLeft, Send, Sparkles, Eye, EyeOff, Users, Mail, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

type PlayerPersona = 'COMPETITIVE' | 'SOCIAL' | 'IMPROVER' | 'CASUAL' | 'TEAM_PLAYER';

interface Member {
  id: string;
  name: string;
  dupr: number;
  score: number;
  likelihood: 'high' | 'medium' | 'low';
  persona: PlayerPersona;
  reasons: string[];
  avatar: string;
}

interface InvitePreview {
  subject: string;
  headline: string;
  body: string;
  cta: string;
  tone: string;
}

// Mock session data
const mockSession = {
  id: 'session-1',
  title: 'Morning Open Play',
  date: 'Wednesday, March 5, 2025',
  time: '8:00 AM - 10:00 AM',
  format: 'OPEN_PLAY',
  skillLevel: 'Intermediate',
  court: 'Court 3',
  maxPlayers: 8,
  confirmedPlayers: 5,
  confirmedNames: ['Alex Johnson', 'Pat Wilson'],
};

// Mock member recommendations
const mockRecommendations: Member[] = [
  {
    id: 'u1',
    name: 'Maria Santos',
    dupr: 4.2,
    score: 92,
    likelihood: 'high',
    persona: 'COMPETITIVE',
    reasons: ['Prefers Wednesdays in the morning — perfect match', 'Intermediate player — exact match for this session'],
    avatar: 'MS',
  },
  {
    id: 'u2',
    name: 'James Chen',
    dupr: 3.8,
    score: 85,
    likelihood: 'high',
    persona: 'SOCIAL',
    reasons: ['Enjoys morning sessions but Wednesday isn\'t a preferred day', '1/3 sessions this week — 2 more to reach goal'],
    avatar: 'JC',
  },
  {
    id: 'u3',
    name: 'Sarah Kim',
    dupr: 4.0,
    score: 78,
    likelihood: 'medium',
    persona: 'IMPROVER',
    reasons: ['Intermediate player — exact match', 'Last played 5 days ago — very active'],
    avatar: 'SK',
  },
  {
    id: 'u4',
    name: 'David Lopez',
    dupr: 3.5,
    score: 65,
    likelihood: 'medium',
    persona: 'TEAM_PLAYER',
    reasons: ['Close to the intermediate level', 'Enjoys Open Play format'],
    avatar: 'DL',
  },
  {
    id: 'u5',
    name: 'Emma Taylor',
    dupr: 4.5,
    score: 52,
    likelihood: 'low',
    persona: 'CASUAL',
    reasons: ['Advanced player — skill gap with this intermediate session', 'Wednesday morning doesn\'t match usual schedule'],
    avatar: 'ET',
  },
];

function getPersonaStyles(persona: PlayerPersona) {
  const styles: Record<PlayerPersona, { bg: string; text: string; emoji: string; label: string; borderColor: string; accentColor: string }> = {
    COMPETITIVE: {
      bg: 'bg-red-100',
      text: 'text-red-700',
      emoji: '🏆',
      label: 'Competitor',
      borderColor: 'border-l-red-400',
      accentColor: 'text-red-600',
    },
    SOCIAL: {
      bg: 'bg-blue-100',
      text: 'text-blue-700',
      emoji: '🤝',
      label: 'Social Player',
      borderColor: 'border-l-blue-400',
      accentColor: 'text-blue-600',
    },
    IMPROVER: {
      bg: 'bg-green-100',
      text: 'text-green-700',
      emoji: '📈',
      label: 'Skill Builder',
      borderColor: 'border-l-green-400',
      accentColor: 'text-green-600',
    },
    CASUAL: {
      bg: 'bg-amber-100',
      text: 'text-amber-700',
      emoji: '☀️',
      label: 'Casual Player',
      borderColor: 'border-l-amber-400',
      accentColor: 'text-amber-600',
    },
    TEAM_PLAYER: {
      bg: 'bg-purple-100',
      text: 'text-purple-700',
      emoji: '👥',
      label: 'Team Player',
      borderColor: 'border-l-purple-400',
      accentColor: 'text-purple-600',
    },
  };
  return styles[persona];
}

function generatePersonalizedInvite(member: Member): InvitePreview {
  const firstName = member.name.split(' ')[0];
  const spotsRemaining = mockSession.maxPlayers - mockSession.confirmedPlayers;

  switch (member.persona) {
    case 'COMPETITIVE':
      return {
        subject: `${firstName}, competitive spot open — ${mockSession.title}`,
        headline: `Ready for a challenge, ${firstName}?`,
        body: `There's a spot in ${mockSession.title} on ${mockSession.date} at ${mockSession.time}. ${mockSession.confirmedPlayers} players confirmed — ${mockSession.skillLevel} level play. ${spotsRemaining} spot${spotsRemaining > 1 ? 's' : ''} left.`,
        cta: 'Claim Your Spot',
        tone: 'competitive',
      };

    case 'SOCIAL':
      return {
        subject: `${firstName}, the crew is playing ${mockSession.date}!`,
        headline: `Great group coming together, ${firstName}!`,
        body: `${mockSession.title} on ${mockSession.date} at ${mockSession.time} is shaping up nicely — ${mockSession.confirmedPlayers} players already confirmed including ${mockSession.confirmedNames.slice(0, 2).join(' and ')}. Come join the fun! ${spotsRemaining} spot${spotsRemaining > 1 ? 's' : ''} available.`,
        cta: 'Join the Group',
        tone: 'social',
      };

    case 'IMPROVER':
      return {
        subject: `${firstName}, level up at ${mockSession.title}`,
        headline: `Great opportunity to improve, ${firstName}!`,
        body: `${mockSession.title} on ${mockSession.date} (${mockSession.time}) — a solid session to apply what you've been working on. ${mockSession.skillLevel} level play with ${mockSession.confirmedPlayers} players confirmed. ${spotsRemaining} spot${spotsRemaining > 1 ? 's' : ''} left.`,
        cta: 'Book & Improve',
        tone: 'motivational',
      };

    case 'CASUAL':
      return {
        subject: `${firstName}, easy pickup game this Wednesday`,
        headline: `Hey ${firstName}, feel like playing?`,
        body: `${mockSession.title} on ${mockSession.date} at ${mockSession.time}. No pressure, just good pickleball. ${spotsRemaining} spot${spotsRemaining > 1 ? 's' : ''} open on ${mockSession.court}. Drop in if it works for your schedule!`,
        cta: 'I\'m In',
        tone: 'relaxed',
      };

    case 'TEAM_PLAYER':
      return {
        subject: `${firstName}, the team needs you — ${mockSession.date}`,
        headline: `Your group is counting on you, ${firstName}!`,
        body: `${mockSession.title} on ${mockSession.date} at ${mockSession.time}. ${mockSession.confirmedPlayers} of ${mockSession.maxPlayers} spots filled — ${
          spotsRemaining <= 2
            ? `almost there, just need ${spotsRemaining} more to complete the group!`
            : `your spot is waiting. The group plays best when the regulars show up.`
        }`,
        cta: 'Count Me In',
        tone: 'team-oriented',
      };

    default:
      return {
        subject: `${firstName}, session available — ${mockSession.title}`,
        headline: `Hi ${firstName}!`,
        body: `There's a spot in ${mockSession.title} on ${mockSession.date} at ${mockSession.time}. ${spotsRemaining} spots remaining.`,
        cta: 'Book Now',
        tone: 'neutral',
      };
  }
}

export default function SlotFillerPage() {
  const { toast } = useToast();
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const spotsRemaining = mockSession.maxPlayers - mockSession.confirmedPlayers;
  const topThree = mockRecommendations.slice(0, 3);
  const invitedCount = invitedIds.size;

  const handleSendInvite = (memberId: string, memberName: string) => {
    const newInvited = new Set(invitedIds);
    newInvited.add(memberId);
    setInvitedIds(newInvited);
    toast({
      title: 'Invite sent',
      description: `Personalized invite sent to ${memberName}`,
    });
  };

  const handleSendBulk = () => {
    const newInvited = new Set(invitedIds);
    topThree.forEach((member) => newInvited.add(member.id));
    setInvitedIds(newInvited);
    toast({
      title: 'Bulk invites sent',
      description: `Personalized invites sent to ${topThree.length} top members`,
    });
  };

  const toggleExpandPreview = (memberId: string) => {
    const newExpanded = new Set(expandedIds);
    if (newExpanded.has(memberId)) {
      newExpanded.delete(memberId);
    } else {
      newExpanded.add(memberId);
    }
    setExpandedIds(newExpanded);
  };

  const handleCustomize = (memberName: string) => {
    toast({
      title: 'Customize invite',
      description: `Customize invite for ${memberName} (feature coming soon)`,
    });
  };

  const getLikelihoodColor = (likelihood: string) => {
    switch (likelihood) {
      case 'high':
        return 'text-green-600';
      case 'medium':
        return 'text-yellow-600';
      case 'low':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4 mb-4">
            <button className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 transition">
              <ChevronLeft className="w-5 h-5" />
              <span className="text-sm font-medium">Back</span>
            </button>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-1">{mockSession.title}</h1>
            <p className="text-slate-600 text-sm">
              {mockSession.date} • {mockSession.time} • {mockSession.skillLevel} • {mockSession.court}
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Session Info Card */}
        <Card className="mb-8 bg-white">
          <div className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <p className="text-slate-500 text-xs font-semibold uppercase mb-2">Players Confirmed</p>
                <p className="text-2xl font-bold text-slate-900">{mockSession.confirmedPlayers}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs font-semibold uppercase mb-2">Spots Remaining</p>
                <p className="text-2xl font-bold text-blue-600">{spotsRemaining}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs font-semibold uppercase mb-2">Recommendations</p>
                <p className="text-2xl font-bold text-slate-900">{mockRecommendations.length}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs font-semibold uppercase mb-2">Invites Sent</p>
                <p className="text-2xl font-bold text-slate-900">{invitedCount}</p>
              </div>
            </div>
          </div>
        </Card>

        {/* Bulk Action Bar */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 mb-1">Member Recommendations</h2>
            <p className="text-sm text-slate-600">Smart matches based on availability, skill, and play style</p>
          </div>
          <Button
            onClick={handleSendBulk}
            disabled={invitedCount >= 3}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Users className="w-4 h-4 mr-2" />
            Send Personalized Invites to Top 3
          </Button>
        </div>

        {/* Recommendations Grid */}
        <div className="grid grid-cols-1 gap-6">
          {mockRecommendations.map((member) => {
            const personaStyles = getPersonaStyles(member.persona);
            const invite = generatePersonalizedInvite(member);
            const isInvited = invitedIds.has(member.id);
            const isExpanded = expandedIds.has(member.id);

            return (
              <Card key={member.id} className="bg-white overflow-hidden hover:shadow-lg transition">
                {/* Member Card */}
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-start gap-4">
                      {/* Avatar */}
                      <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-slate-300 to-slate-400 flex items-center justify-center text-white font-semibold text-lg">
                        {member.avatar}
                      </div>

                      {/* Member Info */}
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-slate-900">{member.name}</h3>
                          <Badge className={cn(personaStyles.bg, personaStyles.text, 'text-xs font-medium')}>
                            {personaStyles.emoji} {personaStyles.label}
                          </Badge>
                        </div>

                        {/* DUPR & Match Quality */}
                        <div className="flex items-center gap-4 text-sm text-slate-600 mb-3">
                          <span className="font-medium">DUPR: {member.dupr}</span>
                          <span>Match Quality: {member.score}%</span>
                          <span className={cn('font-semibold', getLikelihoodColor(member.likelihood))}>
                            {member.likelihood.charAt(0).toUpperCase() + member.likelihood.slice(1)} Likelihood
                          </span>
                        </div>

                        {/* Reasons */}
                        <ul className="space-y-1">
                          {member.reasons.map((reason, idx) => (
                            <li key={idx} className="text-xs text-slate-500 flex items-center">
                              <span className="w-1 h-1 bg-slate-400 rounded-full mr-2" />
                              {reason}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* Action Button */}
                    <Button
                      onClick={() => handleSendInvite(member.id, member.name)}
                      disabled={isInvited}
                      className={cn(
                        'whitespace-nowrap',
                        isInvited
                          ? 'bg-slate-100 text-slate-500 cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      )}
                    >
                      {isInvited ? (
                        <>
                          <Mail className="w-4 h-4 mr-2" />
                          Invited
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4 mr-2" />
                          Send Invite
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Invite Preview Section */}
                  <div className="mt-4 border-t pt-4">
                    <button
                      onClick={() => toggleExpandPreview(member.id)}
                      className="w-full flex items-center justify-between p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition"
                    >
                      <div className="flex items-center gap-2 text-left">
                        <Sparkles className={cn('w-4 h-4', personaStyles.accentColor)} />
                        <span className="text-sm font-semibold text-slate-900">Personalized Invite Preview</span>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-600" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-600" />
                      )}
                    </button>

                    {/* Expanded Preview */}
                    {isExpanded && (
                      <div
                        className={cn(
                          'mt-3 p-4 rounded-lg border-l-4 bg-slate-50',
                          personaStyles.borderColor
                        )}
                      >
                        <div className="space-y-3">
                          {/* Subject */}
                          <div>
                            <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Subject</p>
                            <p className="text-sm text-slate-900 font-medium">{invite.subject}</p>
                          </div>

                          {/* Headline */}
                          <div>
                            <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Headline</p>
                            <p className={cn('text-sm font-semibold', personaStyles.text)}>
                              {invite.headline}
                            </p>
                          </div>

                          {/* Body */}
                          <div>
                            <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Message Body</p>
                            <p className="text-sm text-slate-700 leading-relaxed">{invite.body}</p>
                          </div>

                          {/* CTA Button Preview */}
                          <div>
                            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Call to Action</p>
                            <div className={cn('inline-block px-4 py-2 rounded font-medium text-sm', personaStyles.bg, personaStyles.text)}>
                              {invite.cta}
                            </div>
                          </div>

                          {/* Customize Button */}
                          <div className="flex gap-2 pt-2 border-t">
                            <Button
                              onClick={() => handleCustomize(member.name)}
                              variant="outline"
                              size="sm"
                              className="flex-1"
                            >
                              Customize
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
