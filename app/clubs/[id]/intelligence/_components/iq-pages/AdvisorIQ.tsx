'use client'
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Brain, Send, Sparkles, TrendingUp, Users, CalendarDays,
  DollarSign, Target, Lightbulb, BarChart3, Clock, Zap,
  MessageSquare, ChevronRight, Mic, Paperclip, RotateCcw,
  ThumbsUp, ThumbsDown, Copy, BookOpen, Plus, Trash2,
} from "lucide-react";
import { useTheme } from "../IQThemeProvider";

/* --- Suggested Prompts --- */
const suggestedPrompts = [
  { icon: TrendingUp, text: "Why is Tuesday morning occupancy so low?", category: "Occupancy" },
  { icon: DollarSign, text: "How can I increase revenue by 20% this quarter?", category: "Revenue" },
  { icon: Users, text: "Which members are at risk of churning?", category: "Members" },
  { icon: CalendarDays, text: "What's the best time to schedule a beginner clinic?", category: "Sessions" },
  { icon: Target, text: "Compare this month's performance to last month", category: "Analytics" },
  { icon: Lightbulb, text: "Give me 3 quick wins to improve this week", category: "Strategy" },
];

/* --- Mock Chat History --- */
const mockChatHistory = [
  { id: "conv-1", title: "Tuesday occupancy analysis", messages: 4, date: "Today" },
  { id: "conv-2", title: "Churn risk members", messages: 6, date: "Today" },
  { id: "conv-3", title: "Revenue growth strategy", messages: 8, date: "Yesterday" },
  { id: "conv-4", title: "Weekend slot optimization", messages: 3, date: "Yesterday" },
  { id: "conv-5", title: "New member onboarding ideas", messages: 5, date: "Mar 15" },
  { id: "conv-6", title: "Campaign performance review", messages: 7, date: "Mar 14" },
  { id: "conv-7", title: "Court utilization report", messages: 4, date: "Mar 13" },
];

/* --- Pre-built Conversation --- */
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  charts?: { type: string; data: any[] }[];
  actions?: { label: string; icon: any }[];
}

const initialMessages: Message[] = [
  {
    id: "1",
    role: "assistant",
    content: "Hey John! \u{1F44B} I'm your AI Advisor. I've analyzed your club's data and I'm ready to help. Here's what I'm seeing today:\n\n**Quick snapshot:**\n\u2022 Occupancy is at **62%** this week \u2014 up 3% from last week\n\u2022 **3 members** are showing early churn signals\n\u2022 Weekend slots are nearly full, but **Tuesday AM has 62% empty courts**\n\nWhat would you like to dive into?",
    timestamp: "Just now",
  },
];

const mockResponses: Record<string, Message> = {
  "why is tuesday morning occupancy so low?": {
    id: "resp-1",
    role: "assistant",
    content: "Great question! Let me break down **Tuesday mornings** for you:\n\n\u{1F4CA} **The data says:**\n\u2022 Average occupancy Tue 6AM-12PM: **38%** (vs 65% club average)\n\u2022 Only **12 unique players** booked Tuesdays this month\n\u2022 Your Tuesday regulars skew **advanced** (3.5+ rating) \u2014 smaller pool\n\n\u{1F50D} **Why it's happening:**\n1. No recurring programs on Tuesday AM (Mon/Wed/Fri have clinics)\n2. Most beginners (2.0-2.5) aren't aware of open court availability\n3. The 9AM slot overlaps with a popular gym class nearby\n\n\u{1F4A1} **My recommendation:**\nLaunch a **\"Tuesday Starter\"** beginner clinic at 9:30AM. I've identified **23 members** rated 2.0-2.5 who are free Tuesday mornings and haven't played in the last 2 weeks.\n\nEstimated impact: **+$680/mo revenue**, occupancy boost to ~55%.",
    timestamp: "Just now",
    charts: [
      {
        type: "bar",
        data: [
          { day: "Mon", occ: 52 }, { day: "Tue", occ: 38 }, { day: "Wed", occ: 65 },
          { day: "Thu", occ: 58 }, { day: "Fri", occ: 78 }, { day: "Sat", occ: 92 }, { day: "Sun", occ: 85 },
        ],
      },
    ],
    actions: [
      { label: "Create Tuesday Clinic", icon: CalendarDays },
      { label: "View 23 Members", icon: Users },
      { label: "Draft Campaign", icon: Zap },
    ],
  },
  "which members are at risk of churning?": {
    id: "resp-2",
    role: "assistant",
    content: "I've analyzed activity patterns and identified **12 members** showing churn signals:\n\n\u{1F534} **High Risk (3 members):**\n\u2022 **Maria Santos** \u2014 Last played 42 days ago, was weekly regular. Health score: 18/100\n\u2022 **Tom Chen** \u2014 Cancelled 3 sessions in a row. Health score: 22/100\n\u2022 **David Park** \u2014 Membership renewal in 14 days, activity dropped 80%. Health score: 25/100\n\n\u{1F7E1} **Medium Risk (5 members):**\n\u2022 Activity dropped 40-60% over last 30 days\n\u2022 Average days since last session: 21\n\n\u{1F7E2} **Early Warning (4 members):**\n\u2022 Subtle changes detected \u2014 booking less frequently\n\u2022 Still within normal variance but trending down\n\n\u{1F4A1} **Recommended Actions:**\nI've prepared personalized reactivation messages for each segment. The high-risk group responds best to **direct outreach + incentive** (historically 34% reactivation rate).",
    timestamp: "Just now",
    actions: [
      { label: "Launch Reactivation", icon: Users },
      { label: "View All At-Risk", icon: Target },
      { label: "Schedule Check-ins", icon: CalendarDays },
    ],
  },
  default: {
    id: "resp-default",
    role: "assistant",
    content: "That's a great question! Let me analyze your club data...\n\n\u{1F4CA} Based on the patterns I'm seeing:\n\n\u2022 Your club is performing **above average** in most metrics\n\u2022 There are **3 quick-win opportunities** that could add ~$2,400/mo\n\u2022 Member engagement is **trending positive** overall\n\nWould you like me to dig deeper into any specific area? I can look at occupancy patterns, revenue trends, member behavior, or campaign performance.",
    timestamp: "Just now",
    actions: [
      { label: "Show Quick Wins", icon: Lightbulb },
      { label: "Revenue Deep Dive", icon: DollarSign },
      { label: "Member Analysis", icon: Users },
    ],
  },
};

/* --- Typing Indicator --- */
function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-2 h-2 rounded-full"
          style={{ background: "var(--t4)" }}
          animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}
    </div>
  );
}

/* --- Mini Bar Chart in chat --- */
function MiniBarChart({ data }: { data: { day: string; occ: number }[] }) {
  const { isDark } = useTheme();
  const max = Math.max(...data.map((d) => d.occ));
  return (
    <div className="flex items-end gap-2 p-4 rounded-xl mt-3" style={{ background: "var(--subtle)", height: 120 }}>
      {data.map((d) => {
        const h = (d.occ / max) * 80;
        const isTue = d.day === "Tue";
        return (
          <div key={d.day} className="flex-1 flex flex-col items-center justify-end" style={{ height: "100%" }}>
            <motion.div
              className="w-full rounded-t-md"
              style={{
                background: isTue
                  ? "linear-gradient(180deg, #EF4444, #DC2626)"
                  : "linear-gradient(180deg, #8B5CF6, #6D28D9)",
                opacity: isTue ? 1 : 0.6,
              }}
              initial={{ height: 0 }}
              animate={{ height: h }}
              transition={{ duration: 0.6, delay: 0.1 }}
            />
            <span className="text-[9px] mt-1" style={{ color: isTue ? "#EF4444" : "var(--t4)", fontWeight: isTue ? 700 : 400 }}>
              {d.day}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ============================================= */
/*             AI ADVISOR PAGE                    */
/* ============================================= */
export function AdvisorIQ() {
  const { isDark } = useTheme();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const sendMessage = (text: string) => {
    if (!text.trim()) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: "Just now",
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    setTimeout(() => {
      const key = text.toLowerCase().trim().replace(/[?!.,]/g, "").trim();
      const response =
        mockResponses[key] ||
        mockResponses[Object.keys(mockResponses).find((k) => key.includes(k.split(" ").slice(0, 3).join(" "))) || ""] ||
        mockResponses.default;

      const newMsg: Message = {
        ...response,
        id: `resp-${Date.now()}`,
        timestamp: "Just now",
      };

      setIsTyping(false);
      setMessages((prev) => [...prev, newMsg]);
    }, 1500 + Math.random() * 1000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <div className="flex gap-6 max-w-[1400px] mx-auto" style={{ height: "calc(100vh - 112px)" }}>
      {/* Left Sidebar — Chat History */}
      <div className="hidden lg:flex flex-col w-64 shrink-0 rounded-2xl overflow-hidden" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", backdropFilter: "var(--glass-blur)" }}>
        <div className="flex items-center justify-between px-4 py-4 shrink-0" style={{ borderBottom: "1px solid var(--divider)" }}>
          <h3 style={{ fontSize: "13px", fontWeight: 700, color: "var(--heading)" }}>Conversations</h3>
          <button
            onClick={() => { setActiveChat(null); setMessages(initialMessages); }}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] transition-colors"
            style={{ background: "var(--subtle)", color: "var(--t3)", fontWeight: 500 }}
          >
            <Plus className="w-3 h-3" /> New
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {mockChatHistory.map((conv, i) => {
            const isActive = activeChat === conv.id;
            let prevDate: string | null = null;
            if (i > 0) prevDate = mockChatHistory[i - 1].date;
            const showDateLabel = conv.date !== prevDate;
            return (
              <div key={conv.id}>
                {showDateLabel && (
                  <div className="text-[10px] uppercase tracking-wider px-3 pt-3 pb-1" style={{ color: "var(--t4)", fontWeight: 600 }}>{conv.date}</div>
                )}
                <button
                  onClick={() => setActiveChat(conv.id)}
                  className="w-full text-left px-3 py-2.5 rounded-xl transition-all group"
                  style={{
                    background: isActive ? (isDark ? "rgba(139,92,246,0.08)" : "rgba(139,92,246,0.04)") : "transparent",
                    border: isActive ? "1px solid rgba(139,92,246,0.2)" : "1px solid transparent",
                  }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "var(--hover)"; }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs truncate flex-1" style={{ fontWeight: isActive ? 600 : 500, color: isActive ? "var(--heading)" : "var(--t2)" }}>
                      {conv.title}
                    </span>
                    <Trash2 className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2" style={{ color: "var(--t4)" }} />
                  </div>
                  <div className="text-[10px] mt-0.5" style={{ color: "var(--t4)" }}>{conv.messages} messages</div>
                </button>
              </div>
            );
          })}
        </div>

        {/* Connected Data */}
        <div className="p-4 shrink-0" style={{ borderTop: "1px solid var(--divider)" }}>
          <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: "var(--t4)", fontWeight: 600 }}>Connected Data</div>
          <div className="space-y-1.5">
            {[
              { label: "Member Database", count: "127 records" },
              { label: "Booking History", count: "2,847 sessions" },
              { label: "Revenue Data", count: "12 months" },
              { label: "Campaign Results", count: "18 campaigns" },
            ].map((d) => (
              <div key={d.label} className="flex items-center justify-between text-[11px]">
                <span style={{ color: "var(--t3)" }}>{d.label}</span>
                <span style={{ color: "var(--t4)", fontWeight: 500 }}>{d.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Chat */}
      <div className="flex-1 flex flex-col rounded-2xl overflow-hidden" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", backdropFilter: "var(--glass-blur)" }}>
        {/* Chat Header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: "1px solid var(--divider)" }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #8B5CF6, #06B6D4)", boxShadow: "0 4px 15px rgba(139, 92, 246, 0.3)" }}>
              <Brain className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--heading)" }}>AI Advisor</h2>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-[11px]" style={{ color: "var(--t3)" }}>Analyzing your club data in real-time</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => { setActiveChat(null); setMessages(initialMessages); }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors"
            style={{ background: "var(--subtle)", color: "var(--t3)", fontWeight: 500 }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            New Chat
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          <AnimatePresence>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}
              >
                {msg.role === "assistant" && (
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, #8B5CF6, #06B6D4)" }}>
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                )}
                <div className={`max-w-[75%] ${msg.role === "user" ? "order-first" : ""}`}>
                  <div
                    className="rounded-2xl px-5 py-4 text-sm"
                    style={{
                      background: msg.role === "user"
                        ? "linear-gradient(135deg, rgba(139,92,246,0.2), rgba(6,182,212,0.15))"
                        : "var(--subtle)",
                      border: `1px solid ${msg.role === "user" ? "rgba(139,92,246,0.2)" : "var(--card-border)"}`,
                      color: "var(--t1)",
                      lineHeight: 1.7,
                    }}
                  >
                    {msg.content.split("\n").map((line, i) => {
                      const boldRegex = /\*\*(.*?)\*\*/g;
                      const parts = line.split(boldRegex);
                      return (
                        <p key={i} className={line === "" ? "h-2" : ""}>
                          {parts.map((part, j) =>
                            j % 2 === 1 ? (
                              <strong key={j} style={{ fontWeight: 700, color: "var(--heading)" }}>{part}</strong>
                            ) : (
                              <span key={j}>{part}</span>
                            )
                          )}
                        </p>
                      );
                    })}

                    {/* Inline chart */}
                    {msg.charts?.map((chart, ci) =>
                      chart.type === "bar" ? <MiniBarChart key={ci} data={chart.data} /> : null
                    )}
                  </div>

                  {/* Actions */}
                  {msg.actions && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {msg.actions.map((action) => {
                        const Icon = action.icon;
                        return (
                          <motion.button
                            key={action.label}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] transition-all"
                            style={{
                              background: "rgba(139,92,246,0.1)",
                              border: "1px solid rgba(139,92,246,0.15)",
                              color: isDark ? "#C4B5FD" : "#7C3AED",
                              fontWeight: 600,
                            }}
                          >
                            <Icon className="w-3.5 h-3.5" />
                            {action.label}
                          </motion.button>
                        );
                      })}
                    </div>
                  )}

                  {/* Message meta */}
                  {msg.role === "assistant" && (
                    <div className="flex items-center gap-3 mt-2 ml-1">
                      <span className="text-[10px]" style={{ color: "var(--t4)" }}>{msg.timestamp}</span>
                      <div className="flex items-center gap-1">
                        {[ThumbsUp, ThumbsDown, Copy].map((Icon, idx) => (
                          <button key={idx} className="p-1 rounded hover:bg-white/5 transition-colors">
                            <Icon className="w-3 h-3" style={{ color: "var(--t4)" }} />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {msg.role === "user" && (
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs text-white" style={{ background: "linear-gradient(135deg, #8B5CF6, #06B6D4)", fontWeight: 700 }}>
                    JD
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {isTyping && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, #8B5CF6, #06B6D4)" }}>
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className="rounded-2xl px-4 py-2" style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}>
                <TypingIndicator />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-6 pb-4 pt-2 shrink-0" style={{ borderTop: "1px solid var(--divider)" }}>
          {/* Quick Prompts if few messages */}
          {messages.length <= 1 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {suggestedPrompts.slice(0, 4).map((p) => {
                const Icon = p.icon;
                return (
                  <button
                    key={p.text}
                    onClick={() => sendMessage(p.text)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs transition-all hover:scale-105"
                    style={{
                      background: "var(--subtle)",
                      border: "1px solid var(--card-border)",
                      color: "var(--t2)",
                      fontWeight: 500,
                    }}
                  >
                    <Icon className="w-3.5 h-3.5" style={{ color: isDark ? "#A78BFA" : "#7C3AED" }} />
                    {p.text}
                  </button>
                );
              })}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex items-center gap-3">
            <div
              className="flex-1 flex items-center gap-2 px-4 py-3 rounded-xl"
              style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}
            >
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about your club data..."
                className="flex-1 bg-transparent border-none outline-none text-sm"
                style={{ color: "var(--t1)" }}
                disabled={isTyping}
              />
              <button type="button" className="p-1 rounded transition-colors" style={{ color: "var(--t4)" }}>
                <Paperclip className="w-4 h-4" />
              </button>
            </div>
            <motion.button
              type="submit"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              disabled={!input.trim() || isTyping}
              className="p-3 rounded-xl text-white transition-all"
              style={{
                background: input.trim() ? "linear-gradient(135deg, #8B5CF6, #06B6D4)" : "var(--subtle)",
                opacity: input.trim() ? 1 : 0.5,
                boxShadow: input.trim() ? "0 4px 15px rgba(139, 92, 246, 0.3)" : "none",
              }}
            >
              <Send className="w-5 h-5" />
            </motion.button>
          </form>
        </div>
      </div>

    </div>
  );
}
