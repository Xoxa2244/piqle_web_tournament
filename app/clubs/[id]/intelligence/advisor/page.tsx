'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Send, Upload, Database, MessageSquare, Sparkles, FileText, BarChart3, TrendingUp, AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// ── Types ──
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  sources?: string[];
  charts?: ChartData[];
}

interface ChartData {
  label: string;
  value: number;
  color: string;
}

interface DataSource {
  name: string;
  records: number;
  dateRange: string;
  status: 'loaded' | 'processing' | 'error';
  icon: string;
}

// ── Mock Knowledge Base (simulates RAG responses) ──
const mockResponses: Record<string, { answer: string; sources?: string[]; charts?: ChartData[] }> = {
  'weakest day': {
    answer: `Based on your booking data from the last 12 months, **Tuesday** is consistently your weakest day with an average occupancy of **41%**, compared to your overall average of 62%.\n\nBreakdown by day:\n- Monday: 58% occupancy\n- **Tuesday: 41% occupancy** (lowest)\n- Wednesday: 65% occupancy\n- Thursday: 63% occupancy\n- Friday: 71% occupancy\n- Saturday: 82% occupancy (highest)\n- Sunday: 54% occupancy\n\nRecommendation: Consider launching a "Tuesday Special" — discounted drop-in rates or a recurring social event. Our AI Slot Filler could target members who typically play on other weekdays and invite them to try Tuesday sessions.`,
    sources: ['Booking History 2024-2025', 'Court Utilization Report'],
    charts: [
      { label: 'Mon', value: 58, color: '#64748B' },
      { label: 'Tue', value: 41, color: '#EF4444' },
      { label: 'Wed', value: 65, color: '#64748B' },
      { label: 'Thu', value: 63, color: '#64748B' },
      { label: 'Fri', value: 71, color: '#64748B' },
      { label: 'Sat', value: 82, color: '#65A30D' },
      { label: 'Sun', value: 54, color: '#64748B' },
    ]
  },
  'churn': {
    answer: `Your member churn analysis shows a **6.8% monthly churn rate** over the last 12 months, which is above the industry average of 4-5%.\n\nKey patterns I found:\n- **72% of churned members** had fewer than 2 bookings in their last month\n- **Peak churn months**: June (9.2%) and January (8.1%) — summer vacations and post-holiday drop-off\n- **Lowest churn**: October (3.9%) — fall league season keeps engagement high\n- Members who attend **3+ sessions/week** have a churn rate of only **1.2%**\n\nThe #1 predictor of churn is booking frequency decline. Members whose weekly bookings drop by 50%+ are **4.3x more likely** to cancel within 30 days.\n\nOur Reactivation Engine can flag these at-risk members 2-3 weeks before they typically cancel, giving you a window to intervene.`,
    sources: ['Membership Database 2023-2025', 'Cancellation Records', 'Booking Frequency Analysis'],
  },
  'event': {
    answer: `Looking at your event history over the past 2 years (47 events total), here are the top performers:\n\n**Highest Revenue Events:**\n1. Summer Slam Tournament (Aug 2024) — $4,200 revenue, 64 participants\n2. Holiday Mixer & Round Robin (Dec 2024) — $3,800, 48 participants\n3. Spring League Finals (May 2024) — $3,100, 32 participants\n\n**Best for New Member Acquisition:**\n1. "Bring a Friend" Social Nights — avg 6 new signups per event\n2. Beginner Clinics — avg 4 new signups per event\n3. Corporate Team Building — avg 3 new signups per event\n\n**Events with Declining Attendance:**\n- Friday Night Socials: down 23% YoY (oversaturation — you ran them every week)\n- Advanced Drills: down 18% (scheduling conflict with a rival club&apos;s league)\n\nRecommendation: Shift Friday Socials to bi-weekly and add themed variations. Your data shows themed events (80s Night, Glow-in-the-Dark) had **2.4x** the attendance of regular socials.`,
    sources: ['Event History 2023-2025', 'Registration Data', 'Revenue Reports'],
    charts: [
      { label: 'Tournaments', value: 85, color: '#65A30D' },
      { label: 'Socials', value: 72, color: '#3B82F6' },
      { label: 'Clinics', value: 68, color: '#8B5CF6' },
      { label: 'Leagues', value: 91, color: '#F59E0B' },
      { label: 'Corporate', value: 45, color: '#64748B' },
    ]
  },
  'peak': {
    answer: `Based on 14 months of booking data, here are your peak and off-peak patterns:\n\n**Peak Hours (75%+ occupancy):**\n- Weekdays: 6:00-8:00 AM and 5:00-8:00 PM\n- Weekends: 8:00 AM - 12:00 PM\n\n**Dead Zones (under 30% occupancy):**\n- Weekdays: 1:00-3:00 PM (worst: Tue 1-3pm at 18%)\n- Sundays: 4:00-7:00 PM\n\n**Seasonal Trends:**\n- Your busiest months are October-November (fall leagues) and March-April (spring season)\n- Summer drop-off starts mid-June, bottoms in late July at ~45% avg occupancy\n- You lose roughly **$8,400/month** during the summer slump vs peak season\n\nThe Drop-In Marketplace is specifically designed to fill these dead zones by offering discounted rates to casual players and non-members during off-peak hours.`,
    sources: ['Court Booking Logs 2024-2025', 'Hourly Utilization Dashboard'],
  },
  'revenue': {
    answer: `Here&apos;s your revenue breakdown for the last 12 months:\n\n**Total Revenue: $412,800**\n- Membership dues: $309,600 (75%)\n- Court rentals: $52,400 (13%)\n- Events & tournaments: $28,200 (7%)\n- Pro shop & lessons: $14,600 (4%)\n- Guest fees: $8,000 (2%)\n\n**Month-over-Month Trend:**\n- Revenue grew 3.2% overall YoY\n- But membership revenue is flat (+0.8%) — growth came from events\n- Court rental revenue actually declined 5% (lower occupancy)\n\n**Revenue per Member: $129/month**\n- Top 20% of members generate $215/mo (lessons, events, guest passes)\n- Bottom 40% generate only $89/mo (membership only, rarely play)\n\nThe biggest opportunity is converting that bottom 40% into more active members. Even a 15% boost in their engagement could add **$2,800/month** in incremental revenue.`,
    sources: ['Financial Reports 2024-2025', 'Membership Tier Analysis', 'Transaction Logs'],
    charts: [
      { label: 'Memberships', value: 75, color: '#65A30D' },
      { label: 'Court Rental', value: 13, color: '#3B82F6' },
      { label: 'Events', value: 7, color: '#F59E0B' },
      { label: 'Pro Shop', value: 4, color: '#8B5CF6' },
      { label: 'Guest Fees', value: 2, color: '#64748B' },
    ]
  },
  'member': {
    answer: `Analyzing your 247 active members, I&apos;ve identified these segments:\n\n**By Activity Level:**\n- Power Players (4+ sessions/week): 38 members (15%) — your core\n- Regulars (2-3 sessions/week): 71 members (29%) — stable base\n- Casuals (1 session/week): 82 members (33%) — growth potential\n- Ghosts (less than 1/week): 56 members (23%) — churn risk\n\n**By Player Persona:**\n- Competitors: 52 (21%) — motivated by DUPR, tournaments\n- Socializers: 78 (32%) — come for the community\n- Improvers: 63 (25%) — want clinics and drills\n- Casuals: 54 (22%) — price-sensitive, schedule-dependent\n\n**Key Insight:** Your "Ghost" segment of 56 members represents **$7,224/month** in membership revenue at risk. Of these, 23 haven&apos;t booked a session in 3+ weeks. The Reactivation Engine should target them immediately.`,
    sources: ['Member Profiles Database', 'Booking Frequency Analysis', 'Persona Classification Model'],
  },
  'default': {
    answer: `That&apos;s a great question. Based on the data I have access to from your club, let me analyze this...\n\nI can see patterns in your booking history, membership records, event data, and financial reports. To give you the most accurate answer, could you clarify:\n\n- Are you asking about a specific time period?\n- Should I focus on a particular court or membership tier?\n- Would you like me to compare against industry benchmarks?\n\nIn the meantime, here are some quick insights from your data:\n- Your overall court utilization is **62%** (industry avg: 65-70%)\n- Member retention rate is **93.2%** month-over-month\n- Your highest-performing program is the Fall League series\n\nFeel free to ask me anything specific about your club&apos;s performance!`,
    sources: ['Club Analytics Overview'],
  }
};

function getAIResponse(query: string): { answer: string; sources?: string[]; charts?: ChartData[] } {
  const q = query.toLowerCase();
  if (q.includes('weak') || q.includes('slow') || q.includes('worst day') || q.includes('day of week') || q.includes('tuesday')) {
    return mockResponses['weakest day'];
  }
  if (q.includes('churn') || q.includes('cancel') || q.includes('leav') || q.includes('retention') || q.includes('at risk') || q.includes('at-risk')) {
    return mockResponses['churn'];
  }
  if (q.includes('event') || q.includes('tournament') || q.includes('social') || q.includes('clinic')) {
    return mockResponses['event'];
  }
  if (q.includes('peak') || q.includes('busy') || q.includes('dead') || q.includes('hour') || q.includes('off-peak') || q.includes('season')) {
    return mockResponses['peak'];
  }
  if (q.includes('revenue') || q.includes('money') || q.includes('income') || q.includes('financ') || q.includes('earning')) {
    return mockResponses['revenue'];
  }
  if (q.includes('member') || q.includes('segment') || q.includes('player') || q.includes('persona') || q.includes('active')) {
    return mockResponses['member'];
  }
  return mockResponses['default'];
}

// ── Suggested Questions ──
const suggestedQuestions = [
  { icon: '📊', text: 'What is my weakest day of the week?' },
  { icon: '🚪', text: 'What does my churn look like?' },
  { icon: '🏆', text: 'Which events perform best?' },
  { icon: '⏰', text: 'When are my peak and dead hours?' },
  { icon: '💰', text: 'Break down my revenue sources' },
  { icon: '👥', text: 'Segment my members by activity' },
];

// ── Mini Chart Component ──
function MiniBarChart({ data }: { data: ChartData[] }) {
  const max = Math.max(...data.map(d => d.value));
  return (
    <div className="flex items-end gap-2 h-32 mt-4 mb-2 px-2">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <span className="text-xs font-bold" style={{ color: d.color }}>{d.value}%</span>
          <div
            className="w-full rounded-t-md transition-all duration-500"
            style={{
              height: `${(d.value / max) * 80}px`,
              backgroundColor: d.color,
              minHeight: '4px',
            }}
          />
          <span className="text-xs text-muted-foreground font-medium">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main Page ──
export default function AdvisorPage() {
  const { id: clubId } = useParams();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [showUpload, setShowUpload] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Simulate data upload
  const handleUploadDemo = () => {
    setDataSources([
      { name: 'Booking History', records: 12847, dateRange: 'Jan 2023 – Feb 2025', status: 'processing', icon: '📅' },
      { name: 'Member Database', records: 247, dateRange: 'Current', status: 'processing', icon: '👥' },
      { name: 'Event Records', records: 47, dateRange: 'Mar 2023 – Feb 2025', status: 'processing', icon: '🏆' },
      { name: 'Financial Reports', records: 24, dateRange: 'Monthly, 2023-2025', status: 'processing', icon: '💰' },
    ]);

    // Simulate processing
    setTimeout(() => {
      setDataSources(prev => prev.map((d, i) => i === 0 ? { ...d, status: 'loaded' as const } : d));
    }, 800);
    setTimeout(() => {
      setDataSources(prev => prev.map((d, i) => i === 1 ? { ...d, status: 'loaded' as const } : d));
    }, 1400);
    setTimeout(() => {
      setDataSources(prev => prev.map((d, i) => i === 2 ? { ...d, status: 'loaded' as const } : d));
    }, 2000);
    setTimeout(() => {
      setDataSources(prev => prev.map((d, i) => i === 3 ? { ...d, status: 'loaded' as const } : d));

      // Add system message
      setMessages([{
        id: 'sys-1',
        role: 'system',
        content: 'Data loaded successfully. I now have access to 12,847 booking records, 247 member profiles, 47 events, and 24 months of financial data. Ask me anything about your club!',
        timestamp: new Date(),
      }]);
      setShowUpload(false);
    }, 2600);
  };

  const handleSend = (text?: string) => {
    const msgText = text || input.trim();
    if (!msgText || isTyping) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: msgText,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    // Simulate AI response delay
    const delay = 1200 + Math.random() * 1800;
    setTimeout(() => {
      const response = getAIResponse(msgText);
      const aiMsg: ChatMessage = {
        id: `msg-${Date.now()}-ai`,
        role: 'assistant',
        content: response.answer,
        timestamp: new Date(),
        sources: response.sources,
        charts: response.charts,
      };
      setMessages(prev => [...prev, aiMsg]);
      setIsTyping(false);
    }, delay);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const allLoaded = dataSources.length > 0 && dataSources.every(d => d.status === 'loaded');

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href={`/clubs/${clubId}/intelligence`}>
              <Button variant="ghost" size="sm" className="gap-1">
                <ChevronLeft className="w-4 h-4" />
                Back
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-lime-500 to-green-600 flex items-center justify-center">
                <MessageSquare className="w-4 h-4 text-white" />
              </div>
              <div>
                <h1 className="text-sm font-bold leading-none">AI Club Advisor</h1>
                <p className="text-xs text-muted-foreground">Powered by your historical data</p>
              </div>
            </div>
          </div>
          {allLoaded && (
            <Badge variant="outline" className="gap-1 text-lime-700 border-lime-300 bg-lime-50">
              <Database className="w-3 h-3" />
              {dataSources.reduce((sum, d) => sum + d.records, 0).toLocaleString()} records
            </Badge>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-6">

          {/* Upload / Onboarding */}
          {showUpload && (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-lime-500 to-green-600 flex items-center justify-center mb-6 shadow-lg shadow-lime-500/20">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold mb-2">AI Club Advisor</h2>
              <p className="text-muted-foreground max-w-md mb-8">
                Upload your club&apos;s historical data and I&apos;ll analyze booking patterns, member behavior, revenue trends, and give you actionable recommendations.
              </p>

              {dataSources.length === 0 ? (
                <div className="space-y-4 w-full max-w-sm">
                  <Button
                    className="w-full gap-2 h-12 text-base bg-gradient-to-r from-lime-600 to-green-600 hover:from-lime-700 hover:to-green-700"
                    onClick={handleUploadDemo}
                  >
                    <Upload className="w-5 h-5" />
                    Load CourtReserve Export
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Accepts CSV exports from CourtReserve, Club Automation, or any booking system
                  </p>
                </div>
              ) : (
                <div className="w-full max-w-sm space-y-2">
                  {dataSources.map((ds, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-card border text-left">
                      <span className="text-xl">{ds.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold">{ds.name}</div>
                        <div className="text-xs text-muted-foreground">{ds.records.toLocaleString()} records &middot; {ds.dateRange}</div>
                      </div>
                      {ds.status === 'processing' ? (
                        <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-lime-600" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Messages */}
          {messages.map((msg) => (
            <div key={msg.id} className={cn('mb-6', msg.role === 'user' && 'flex justify-end')}>
              {msg.role === 'system' ? (
                <div className="flex items-center gap-2 justify-center py-3">
                  <CheckCircle2 className="w-4 h-4 text-lime-600" />
                  <span className="text-sm text-muted-foreground">{msg.content}</span>
                </div>
              ) : msg.role === 'user' ? (
                <div className="bg-primary text-primary-foreground px-4 py-3 rounded-2xl rounded-tr-md max-w-[80%] text-sm">
                  {msg.content}
                </div>
              ) : (
                <div className="max-w-[90%]">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-md bg-gradient-to-br from-lime-500 to-green-600 flex items-center justify-center">
                      <Sparkles className="w-3 h-3 text-white" />
                    </div>
                    <span className="text-xs font-semibold text-muted-foreground">Piqle AI</span>
                  </div>
                  <div className="bg-card border rounded-2xl rounded-tl-md px-5 py-4">
                    <div className="text-sm leading-relaxed whitespace-pre-wrap prose prose-sm max-w-none">
                      {msg.content.split(/(\*\*[^*]+\*\*)/).map((part, i) => {
                        if (part.startsWith('**') && part.endsWith('**')) {
                          return <strong key={i} className="font-bold text-foreground">{part.slice(2, -2)}</strong>;
                        }
                        return <span key={i}>{part}</span>;
                      })}
                    </div>
                    {msg.charts && msg.charts.length > 0 && (
                      <div className="border-t mt-4 pt-2">
                        <MiniBarChart data={msg.charts} />
                      </div>
                    )}
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="border-t mt-4 pt-3 flex flex-wrap gap-1.5">
                        {msg.sources.map((s, i) => (
                          <Badge key={i} variant="secondary" className="text-xs gap-1 font-normal">
                            <FileText className="w-3 h-3" />
                            {s}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Typing indicator */}
          {isTyping && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-md bg-gradient-to-br from-lime-500 to-green-600 flex items-center justify-center">
                  <Sparkles className="w-3 h-3 text-white" />
                </div>
                <span className="text-xs font-semibold text-muted-foreground">Piqle AI</span>
              </div>
              <div className="bg-card border rounded-2xl rounded-tl-md px-5 py-4 inline-block">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing your data...
                </div>
              </div>
            </div>
          )}

          {/* Suggested Questions */}
          {allLoaded && messages.length <= 1 && !isTyping && (
            <div className="mt-6">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Suggested Questions</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {suggestedQuestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(q.text)}
                    className="flex items-center gap-3 p-3 rounded-xl border bg-card hover:bg-accent hover:border-lime-300 transition-colors text-left group"
                  >
                    <span className="text-lg">{q.icon}</span>
                    <span className="text-sm font-medium text-foreground group-hover:text-lime-700">{q.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Bar */}
      {allLoaded && (
        <div className="border-t bg-background/80 backdrop-blur-sm sticky bottom-0">
          <div className="max-w-4xl mx-auto px-4 py-3">
            <div className="flex items-center gap-2 bg-card border rounded-xl px-4 py-2 focus-within:border-lime-400 focus-within:ring-2 focus-within:ring-lime-400/20 transition-all">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything about your club..."
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                disabled={isTyping}
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleSend()}
                disabled={!input.trim() || isTyping}
                className={cn(
                  'h-8 w-8 p-0 rounded-lg transition-colors',
                  input.trim() && !isTyping
                    ? 'bg-lime-600 text-white hover:bg-lime-700'
                    : 'text-muted-foreground'
                )}
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-center text-xs text-muted-foreground mt-2">
              AI analysis based on your uploaded club data &middot; Responses are generated insights, not financial advice
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
