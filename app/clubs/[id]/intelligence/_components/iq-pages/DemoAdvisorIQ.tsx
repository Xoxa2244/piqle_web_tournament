'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  Brain, Send, Sparkles, TrendingUp, Users, CalendarDays,
  DollarSign, Lightbulb, CheckSquare, Activity, PowerOff,
  CheckCircle2, Mail, ArrowRight,
} from 'lucide-react'
import { useTheme } from '../IQThemeProvider'

interface CannedScenario {
  keywords: RegExp
  response: string
  actionCard?: {
    title: string
    description: string
    actionLabel: string
    icon: 'campaign' | 'kill' | 'queue' | 'activity'
  }
}

const SUGGESTED_PROMPTS = [
  { icon: CheckSquare, text: 'What needs my approval right now?' },
  { icon: Activity, text: 'What did the agent do today?' },
  { icon: PowerOff, text: 'Stop all AI sending' },
  { icon: Sparkles, text: 'Draft a first-booking outreach for trial members with no confirmed session' },
  { icon: Users, text: 'Which members are at risk of churning?' },
  { icon: TrendingUp, text: 'Why is Tuesday morning occupancy so low?' },
  { icon: DollarSign, text: 'How can I increase revenue by 20% this quarter?' },
  { icon: Lightbulb, text: 'Give me 3 quick wins to improve this week' },
]

const CANNED_SCENARIOS: CannedScenario[] = [
  {
    keywords: /(approval|approve|pending|queue|нужн.*апрув|очередь)/i,
    response: `**You have 8 pending approvals right now:**

• **5 reactivation drafts** — for at-risk members who haven't played in 14+ days. Sample: Sarah Chen (DUPR 4.2, last seen 12 days ago).
• **2 slot-filler campaigns** — Tuesday 7am Open Play (3/8 spots) and Wednesday 12pm Drill (2/6).
• **1 weekly summary** — auto-generated for last week, ready to publish to your members.

Tap any card below to review or approve in bulk.`,
    actionCard: {
      title: '8 items need your approval',
      description: '5 reactivation • 2 slot-filler • 1 weekly summary',
      actionLabel: 'Review queue',
      icon: 'queue',
    },
  },
  {
    keywords: /(today|did.*today|activity|recent.*activ|сделал.*сегодня)/i,
    response: `**Agent activity today (since 6am):**

• Sent **47 reactivation emails** to at-risk members — 12 opened, 4 clicked, 2 booked
• Filled **3 underbooked sessions** automatically via slot-filler — recovered $189 in revenue
• Skipped **6 members** who already had upcoming bookings (avoided over-contact)
• Generated **4 new draft campaigns** based on this week's booking patterns
• Detected **2 new at-risk members** (Tom Bradley, Diana Ross) and added to monitoring

**Total revenue impact today: +$340** from filled slots and reactivated members.`,
  },
  {
    keywords: /(stop|kill|pause|halt|disable.*ai|останови|стоп)/i,
    response: `**Are you sure you want to stop all AI sending?**

This will immediately:
• Pause all scheduled outreach for the next 24h
• Block any auto-approved drafts from being sent
• Keep you in control until you manually re-enable

Background analysis (member health scoring, revenue tracking) will continue — only outbound messaging stops.`,
    actionCard: {
      title: 'Stop all AI sending',
      description: 'Pauses outbound messaging for 24h. Re-enable anytime.',
      actionLabel: 'Confirm kill switch',
      icon: 'kill',
    },
  },
  {
    keywords: /(churn|risk|at.risk|at-risk|leaving|losing|отт[ое]к|риск)/i,
    response: `**32 members are at-risk of churning** (out of 1,500 total).

**Critical (4 members)** — already inactive 30+ days:
• Tom Bradley (DUPR 3.6, M, 23 days inactive)
• Diana Ross (DUPR 2.8, F, 32 days inactive)
• Pete Johnson (DUPR 4.1, M, 18 days inactive)
• Nicole Park (DUPR 3.2, F, 7 days inactive but down 60%)

**At-risk (5 members)** — visit frequency dropped 30-45% in last 14 days. Sample: Sarah Chen, Mike Rodriguez, Emily Park.

**Watch (23 members)** — slight decline, worth monitoring next week.

**Suggested action:** Launch a personalized win-back campaign for the 9 critical+at-risk members. I can draft this in 30 seconds.`,
    actionCard: {
      title: 'Draft win-back campaign for 9 members',
      description: 'Personalized email + SMS with their preferred session type',
      actionLabel: 'Draft campaign',
      icon: 'campaign',
    },
  },
  {
    keywords: /(tuesday|вторник|tuesday.*morning|morning.*tuesday)/i,
    response: `**Tuesday morning occupancy is 38%** vs your weekly average of 64%. Here's what I found:

**Root cause:** 3 of your 4 Tuesday 7-9am sessions are **Drill** format with **Beginner** skill level.

**The data says:**
• Only **48 of 1,500 members** are tagged as Beginner — that's 3.2% of your base
• Drill format has the lowest demand on Tuesday mornings (commuter timing — your players prefer Open Play before work)
• Your **Tuesday 6:30am Open Play (Intermediate)** runs at 92% occupancy — that's the format your members actually want

**Recommendation:** Convert 2 of the 4 Tuesday morning Drill slots to Intermediate Open Play. Projected lift: +35 bookings/month, +$1,260/month revenue.`,
    actionCard: {
      title: 'Reformat Tuesday morning sessions',
      description: 'Convert 2 Drill slots → Open Play (Intermediate)',
      actionLabel: 'Apply to Programming IQ',
      icon: 'campaign',
    },
  },
  {
    keywords: /(revenue|income|money|increase.*\d+%|20%|quarter)/i,
    response: `**To increase revenue by 20% this quarter ($14,820 → $17,800/month), here's the path:**

**1. Fill the gap (worth +$8,400/qtr)** — You currently lose $14,820/month to empty slots. Cutting that by 50% via better scheduling is the single biggest lever.

**2. Reactivate at-risk (worth +$2,700/qtr)** — 32 at-risk members × $99 avg monthly value × 30% recovery rate = $950/month.

**3. New member acquisition (worth +$3,900/qtr)** — Your current 94 new/month → push to 130/month via referral campaign. Each new member = avg $340 first-year revenue.

**4. Premium tier upsell (worth +$3,200/qtr)** — 1,050 active members × 8% upgrade rate × $30 monthly diff = $2,520/month.

**Total: +$18,200/quarter (24% lift).**

Which lever do you want me to start with?`,
  },
  {
    keywords: /(quick.*win|3.*win|quick.win|быстр.*улучш|улучшен)/i,
    response: `**3 quick wins for this week:**

**1. Fill 6 underbooked sessions** (worth +$540 this week)
   Tuesday 7am Open Play (3/8), Wednesday 12pm Drill (2/6), Thursday 6am Open Play (4/8), and 3 more. I have invite drafts ready for the 47 members whose preferences match these slots.

**2. Win back 9 critical/at-risk members** (worth +$891 this month)
   Personalized email + SMS sequence. Average win-back rate from this approach: 32%. Expected: 3 members reactivated.

**3. Convert 2 Tuesday Drill slots → Open Play** (worth +$1,260/month)
   Your Beginner Drill demand is 38% occupancy; Intermediate Open Play runs at 92%. Programming IQ has the new schedule pre-built.

**Total weekly upside: ~$2,690 with 3 actions.** Want me to draft and queue all three?`,
  },
  {
    keywords: /(first.booking|first.session|trial|new.member.*outreach|guest|onboarding)/i,
    response: `**Drafting first-booking outreach for trial members:**

**Audience:** 23 trial/guest members signed up in the last 14 days but haven't booked their first session.

**Why they haven't booked:**
• 14 are unsure which format suits their level (haven't filled DUPR)
• 6 booked sessions but cancelled
• 3 viewed sessions but didn't complete checkout

**Draft message (Email + SMS):**
> Hi [Name], welcome to the club! Based on your DUPR (or our quick skill quiz if you haven't taken it), I'd recommend **[matched session]** as your first booking. Here's a 50% off code: WELCOME50 (expires Sunday).

**Personalization:** Each message picks the closest session by skill level, day-of-week preference, and time-of-day from sign-up time.

**Projected booking rate: 35%** (vs 12% for generic welcome).`,
    actionCard: {
      title: 'Send first-booking outreach to 23 trial members',
      description: '50% discount code, personalized session match',
      actionLabel: 'Send outreach',
      icon: 'campaign',
    },
  },
  {
    keywords: /(active.*member|how many|сколько.*мембер|сколько.*активн|total.*member)/i,
    response: `**Membership snapshot:**

• **Total members:** 1,500
• **Active in last 30 days:** 1,050 (70%)
• **Inactive 30-90 days:** 318 (21%)
• **Inactive 90+ days:** 132 (9%)
• **New this month:** 94

**By skill level:**
• Beginner: 255 (17%)
• Intermediate: 690 (46%)
• Advanced: 360 (24%)
• Unrated: 195 (13%)

**By format preference (top format = top format played in last 30d):**
• Open Play: 1,148 (35%)
• League: 820 (25%)
• Social: 656 (20%)

You can drill into any segment in the Members page.`,
  },
  {
    keywords: /(occupancy|занят|filled|sessions)/i,
    response: `**Occupancy snapshot (last 30 days):**

• **Average:** 64% across 418 sessions
• **Best day:** Saturday (82% avg, 8 sessions/day)
• **Worst day:** Friday (48% avg, 4 sessions/day — too few options)

**By time of day:**
• Morning (6-12am): 58%
• Afternoon (12-6pm): 61%
• Evening (6-10pm): 78% ← strongest

**By format:**
• League Play: 88% ← highest
• Social: 72%
• Open Play: 65%
• Drill: 55%
• Clinic: 42% ← lowest

**Underfilled this week:** 18 sessions, $4,820 in lost revenue. Programming IQ has reformat suggestions ready.`,
  },
  {
    keywords: /(programming|schedule|расписан|программ)/i,
    response: `Programming IQ has analyzed your last 30 days of bookings and built an optimized weekly schedule.

**What it changed (proposed):**
• Moved 2 Tuesday morning Drill slots → Open Play Intermediate
• Added 1 Friday evening League slot (high demand, currently no offering)
• Removed 1 Sunday afternoon Clinic (consistently <30% occupancy)
• Reformatted 3 weekday Beginner sessions → Mixed Skill (broader audience)

**Projected impact:**
• +47 bookings/week
• +$1,830/week revenue
• +12% avg occupancy

Open the **Programming IQ** page to review and approve.`,
  },
  {
    keywords: /(.*)/i, // fallback
    response: `That's a great question. In a live deployment, I'd analyze your member data, booking patterns, and historical trends to give you a specific answer.

**Try one of the suggested prompts** above or ask about:
• Member health and churn risk
• Occupancy and revenue optimization
• Programming and schedule changes
• Pending approvals and recent agent activity
• Specific time slots, formats, or days

I'm wired to your CourtReserve, Mailchimp, and Twilio integrations and can take action on your behalf — drafting campaigns, filling sessions, or pausing outreach.`,
  },
]

interface DemoMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  actionCard?: CannedScenario['actionCard']
}

function pickResponse(input: string): CannedScenario {
  for (const sc of CANNED_SCENARIOS) {
    if (sc.keywords.test(input)) return sc
  }
  return CANNED_SCENARIOS[CANNED_SCENARIOS.length - 1]
}

function ActionCardDemo({ card, onAction }: { card: NonNullable<CannedScenario['actionCard']>; onAction: (label: string) => void }) {
  const [done, setDone] = useState(false)
  const Icon = card.icon === 'kill' ? PowerOff : card.icon === 'queue' ? CheckSquare : card.icon === 'activity' ? Activity : Sparkles
  const accent = card.icon === 'kill' ? '#EF4444' : '#7C3AED'

  return (
    <div
      className="mt-3 rounded-xl p-4 border"
      style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${accent}1A` }}
        >
          <Icon className="w-5 h-5" style={{ color: accent }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm" style={{ color: 'var(--heading)' }}>{card.title}</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--t2)' }}>{card.description}</div>
        </div>
      </div>
      {!done ? (
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => { setDone(true); onAction(card.actionLabel) }}
            className="flex-1 px-3 py-2 rounded-lg text-sm font-medium transition"
            style={{ background: accent, color: 'white' }}
          >
            {card.actionLabel}
          </button>
          <button
            onClick={() => setDone(true)}
            className="px-3 py-2 rounded-lg text-sm font-medium border transition"
            style={{ borderColor: 'var(--card-border)', color: 'var(--t2)' }}
          >
            Skip
          </button>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2 text-sm" style={{ color: '#10B981' }}>
          <CheckCircle2 className="w-4 h-4" />
          Action queued for approval (demo — no real send)
        </div>
      )}
    </div>
  )
}

function MessageBubble({ msg }: { msg: DemoMessage }) {
  const isUser = msg.role === 'user'
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex gap-3 mb-4 ${isUser ? 'justify-end' : ''}`}
    >
      {!isUser && (
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #A78BFA 100%)' }}
        >
          <Brain className="w-4 h-4 text-white" />
        </div>
      )}
      <div className={`max-w-[80%] ${isUser ? 'order-1' : ''}`}>
        <div
          className="rounded-2xl px-4 py-3"
          style={{
            background: isUser ? '#7C3AED' : 'var(--card-bg)',
            color: isUser ? 'white' : 'var(--heading)',
            border: isUser ? 'none' : '1px solid var(--card-border)',
          }}
        >
          <div className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</div>
        </div>
        {msg.actionCard && <ActionCardDemo card={msg.actionCard} onAction={() => {}} />}
      </div>
    </motion.div>
  )
}

function TypingDots() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3 mb-4">
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
        style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #A78BFA 100%)' }}
      >
        <Brain className="w-4 h-4 text-white" />
      </div>
      <div
        className="rounded-2xl px-4 py-3 flex items-center gap-1"
        style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
      >
        {[0, 1, 2].map(i => (
          <motion.div
            key={i}
            className="w-2 h-2 rounded-full"
            style={{ background: 'var(--t2)' }}
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </div>
    </motion.div>
  )
}

export function DemoAdvisorIQ({ clubId: _clubId }: { clubId: string }) {
  const { isDark: _isDark } = useTheme()
  const [messages, setMessages] = useState<DemoMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy])

  const submit = useCallback((text: string) => {
    if (!text.trim() || busy) return
    const userMsg: DemoMessage = { id: `u-${Date.now()}`, role: 'user', text: text.trim() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setBusy(true)
    const scenario = pickResponse(text)
    const delay = 800 + Math.min(2200, scenario.response.length * 8)
    setTimeout(() => {
      const aiMsg: DemoMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: scenario.response,
        actionCard: scenario.actionCard,
      }
      setMessages(prev => [...prev, aiMsg])
      setBusy(false)
    }, delay)
  }, [busy])

  const reset = () => {
    setMessages([])
    setInput('')
    inputRef.current?.focus()
  }

  return (
    <div className="flex flex-col h-full max-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--card-border)' }}>
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #A78BFA 100%)' }}
          >
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-semibold text-base" style={{ color: 'var(--heading)' }}>AI Advisor</div>
            <div className="text-xs" style={{ color: 'var(--t2)' }}>
              Live data — 1,500 members, 8 courts, 418 sessions/30d
            </div>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={reset}
            className="text-xs px-3 py-1.5 rounded-md border transition"
            style={{ borderColor: 'var(--card-border)', color: 'var(--t2)' }}
          >
            New chat
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-4xl mx-auto">
          {messages.length === 0 && (
            <div className="text-center py-8">
              <div
                className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #A78BFA 100%)' }}
              >
                <Brain className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--heading)' }}>
                Ask me anything about your club
              </h2>
              <p className="text-sm mb-8 max-w-md mx-auto" style={{ color: 'var(--t2)' }}>
                I have access to your member data, schedule, revenue, and integrations. I can analyze, draft campaigns, and take action.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-w-2xl mx-auto">
                {SUGGESTED_PROMPTS.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => submit(p.text)}
                    className="text-left p-3 rounded-xl border transition hover:scale-[1.01]"
                    style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
                  >
                    <div className="flex items-start gap-2">
                      <p.icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#7C3AED' }} />
                      <span className="text-sm" style={{ color: 'var(--heading)' }}>{p.text}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <AnimatePresence>
            {messages.map(m => <MessageBubble key={m.id} msg={m} />)}
          </AnimatePresence>
          {busy && <TypingDots />}
          <div ref={endRef} />
        </div>
      </div>

      {/* Composer */}
      <div className="border-t px-6 py-4" style={{ borderColor: 'var(--card-border)' }}>
        <div className="max-w-4xl mx-auto">
          <div
            className="flex items-center gap-2 rounded-xl border px-3 py-2"
            style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(input) } }}
              placeholder="Ask about churn, occupancy, revenue, programming…"
              disabled={busy}
              className="flex-1 bg-transparent outline-none text-sm"
              style={{ color: 'var(--heading)' }}
            />
            <button
              onClick={() => submit(input)}
              disabled={busy || !input.trim()}
              className="p-2 rounded-lg transition"
              style={{
                background: busy || !input.trim() ? 'var(--card-border)' : '#7C3AED',
                color: 'white',
                opacity: busy || !input.trim() ? 0.5 : 1,
              }}
              aria-label="Send"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <div className="text-[10px] mt-2 text-center" style={{ color: 'var(--t3)' }}>
            Demo mode — responses are pre-scripted; live deployment uses real-time AI on your data.
          </div>
        </div>
      </div>
    </div>
  )
}
