'use client'
import { useState, useRef, useEffect, useCallback } from "react";
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

/* --- Types --- */
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
}

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

/* --- Relative date formatter --- */
function formatRelative(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffMs / 86400000);
  if (diffH < 1) return 'Just now';
  if (diffH < 24) return `${diffH}h ago`;
  if (diffD === 1) return 'Yesterday';
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* ============================================= */
/*             AI ADVISOR PAGE — REAL API         */
/* ============================================= */
export function AdvisorIQ({ clubId }: { clubId: string }) {
  const { isDark } = useTheme();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Load conversation list
  useEffect(() => {
    fetch(`/api/ai/conversations?clubId=${clubId}`)
      .then(r => r.ok ? r.json() : { conversations: [] })
      .then(data => setConversations(data.conversations || []))
      .catch(() => {});
  }, [clubId]);

  // Load a specific conversation's messages
  const loadConversation = useCallback(async (convId: string) => {
    try {
      const res = await fetch(`/api/ai/conversations/${convId}/messages`);
      if (!res.ok) return;
      const data = await res.json();
      setMessages((data.messages || []).map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: formatRelative(m.createdAt),
      })));
      setConversationId(convId);
      setActiveConvId(convId);
    } catch { /* ignore */ }
  }, []);

  // Send message to real API
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isTyping) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: "Just now",
    };

    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clubId,
          messages: [...messages.map(m => ({ role: m.role as string, content: m.content, parts: [{ type: 'text', text: m.content }] })), { role: 'user', content: text, parts: [{ type: 'text', text }] }],
          conversationId,
        }),
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      // Handle streaming response
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';
      const assistantId = `resp-${Date.now()}`;

      // Add empty assistant message that we'll stream into
      setMessages(prev => [...prev, {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: 'Just now',
      }]);
      setIsTyping(false);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          console.log('[AdvisorIQ stream chunk]', JSON.stringify(chunk).slice(0, 500));
          const lines = chunk.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            // AI SDK v6 UI Message Stream format: 0:"text" (text delta)
            if (trimmed.startsWith('0:')) {
              try {
                const textChunk = JSON.parse(trimmed.slice(2));
                if (typeof textChunk === 'string') {
                  assistantContent += textChunk;
                  setMessages(prev => prev.map(m =>
                    m.id === assistantId ? { ...m, content: assistantContent } : m
                  ));
                }
              } catch { /* skip */ }
            }
            // AI SDK v6 data stream format: data: {"type":"text-delta","textDelta":"..."}
            else if (trimmed.startsWith('data:')) {
              try {
                const json = JSON.parse(trimmed.slice(5).trim());
                if (json.type === 'text-delta' && json.textDelta) {
                  assistantContent += json.textDelta;
                  setMessages(prev => prev.map(m =>
                    m.id === assistantId ? { ...m, content: assistantContent } : m
                  ));
                }
              } catch { /* skip */ }
            }
            // Vercel AI SDK format: f: (finish), e: (error), d: (data)
            else if (trimmed.startsWith('2:')) {
              // 2: = data message, may contain tool results
              try {
                const data = JSON.parse(trimmed.slice(2));
                if (Array.isArray(data)) {
                  for (const item of data) {
                    if (item.type === 'text-delta' && item.textDelta) {
                      assistantContent += item.textDelta;
                    }
                  }
                  setMessages(prev => prev.map(m =>
                    m.id === assistantId ? { ...m, content: assistantContent } : m
                  ));
                }
              } catch { /* skip */ }
            }
          }
        }
      }

      // Extract conversation ID from response headers
      const newConvId = res.headers.get('x-conversation-id');
      if (newConvId && !conversationId) {
        setConversationId(newConvId);
        setActiveConvId(newConvId);
        // Refresh conversation list
        fetch(`/api/ai/conversations?clubId=${clubId}`)
          .then(r => r.ok ? r.json() : { conversations: [] })
          .then(data => setConversations(data.conversations || []))
          .catch(() => {});
      }

    } catch (err) {
      setIsTyping(false);
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `Sorry, I encountered an error. Please try again.\n\n_${(err as Error).message}_`,
        timestamp: 'Just now',
      }]);
    }
  }, [clubId, conversationId, isTyping]);

  const startNewChat = () => {
    setActiveConvId(null);
    setConversationId(null);
    setMessages([]);
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
            onClick={startNewChat}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] transition-colors"
            style={{ background: "var(--subtle)", color: "var(--t3)", fontWeight: 500 }}
          >
            <Plus className="w-3 h-3" /> New
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.length === 0 && (
            <div className="text-center py-8 text-[11px]" style={{ color: "var(--t4)" }}>
              No conversations yet
            </div>
          )}
          {conversations.map((conv) => {
            const isActive = activeConvId === conv.id;
            return (
              <button
                key={conv.id}
                onClick={() => loadConversation(conv.id)}
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
                    {conv.title || 'New conversation'}
                  </span>
                </div>
                <div className="text-[10px] mt-0.5" style={{ color: "var(--t4)" }}>{formatRelative(conv.updatedAt)}</div>
              </button>
            );
          })}
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
            onClick={startNewChat}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors"
            style={{ background: "var(--subtle)", color: "var(--t3)", fontWeight: 500 }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            New Chat
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* Empty state */}
          {messages.length === 0 && !isTyping && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.15), rgba(6,182,212,0.1))", border: "1px solid rgba(139,92,246,0.2)" }}>
                <Sparkles className="w-8 h-8" style={{ color: isDark ? "#A78BFA" : "#7C3AED" }} />
              </div>
              <h3 className="text-lg font-semibold mb-2" style={{ color: "var(--heading)" }}>Ask me anything about your club</h3>
              <p className="text-sm mb-6 max-w-md" style={{ color: "var(--t3)" }}>
                I have access to your sessions, members, bookings, and revenue data. Ask me to analyze trends, identify opportunities, or suggest strategies.
              </p>
              <div className="grid grid-cols-2 gap-2 max-w-lg">
                {suggestedPrompts.map((p) => {
                  const Icon = p.icon;
                  return (
                    <button
                      key={p.text}
                      onClick={() => sendMessage(p.text)}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs text-left transition-all hover:scale-[1.02]"
                      style={{
                        background: "var(--subtle)",
                        border: "1px solid var(--card-border)",
                        color: "var(--t2)",
                        fontWeight: 500,
                      }}
                    >
                      <Icon className="w-4 h-4 shrink-0" style={{ color: isDark ? "#A78BFA" : "#7C3AED" }} />
                      <span>{p.text}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

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
                  </div>

                  {/* Message meta */}
                  {msg.role === "assistant" && (
                    <div className="flex items-center gap-3 mt-2 ml-1">
                      <span className="text-[10px]" style={{ color: "var(--t4)" }}>{msg.timestamp}</span>
                      <div className="flex items-center gap-1">
                        {[ThumbsUp, ThumbsDown, Copy].map((Icon, idx) => (
                          <button
                            key={idx}
                            className="p-1 rounded hover:bg-white/5 transition-colors"
                            onClick={idx === 2 ? () => navigator.clipboard.writeText(msg.content) : undefined}
                          >
                            <Icon className="w-3 h-3" style={{ color: "var(--t4)" }} />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {msg.role === "user" && (
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs text-white" style={{ background: "linear-gradient(135deg, #8B5CF6, #06B6D4)", fontWeight: 700 }}>
                    You
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
