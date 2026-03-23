'use client'
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
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

/* --- Extract suggested follow-up questions from <suggested> tags --- */
function extractSuggestions(text: string): { cleanText: string; suggestions: string[] } {
  const match = text.match(/<suggested>\s*([\s\S]*?)\s*<\/suggested>/i);
  if (match) {
    const suggestions = match[1]
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0 && s.length < 80);
    const cleanText = text.replace(/<suggested>[\s\S]*?<\/suggested>/gi, '').trimEnd();
    return { cleanText, suggestions };
  }
  // Incomplete block (during streaming): hide partial <suggested> tag
  const lowerText = text.toLowerCase();
  const partialIdx = lowerText.indexOf('<suggested>');
  if (partialIdx !== -1) {
    return { cleanText: text.slice(0, partialIdx).trimEnd(), suggestions: [] };
  }
  return { cleanText: text, suggestions: [] };
}

/* --- Get text content from a message (parts-first, then content fallback) --- */
function getMessageText(message: { parts?: Array<{ type: string; text?: string }>; content?: string }): string {
  if (message.parts && Array.isArray(message.parts)) {
    const fromParts = message.parts
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('');
    if (fromParts) return fromParts;
  }
  if (typeof message.content === 'string') return message.content;
  return '';
}

/* ============================================= */
/*       AI ADVISOR PAGE — useChat() version      */
/* ============================================= */
export function AdvisorIQ({ clubId }: { clubId: string }) {
  const { isDark } = useTheme();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Track conversation ID from API response without re-creating transport mid-stream
  const convIdRef = useRef<string | null>(null);
  const pendingConvIdRef = useRef<string | null>(null);
  const loadFromDbRef = useRef(false);
  convIdRef.current = conversationId;

  // Build transport (memoized on clubId)
  const transport = useMemo(() => {
    return new DefaultChatTransport({
      api: '/api/ai/chat',
      body: { clubId },
      fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
        // Inject current conversationId from ref
        if (init?.body) {
          try {
            const bodyObj = JSON.parse(init.body as string);
            bodyObj.conversationId = convIdRef.current;
            init = { ...init, body: JSON.stringify(bodyObj) };
          } catch { /* keep original body */ }
        }
        const response = await globalThis.fetch(url, init);
        const newConvId = response.headers.get('X-Conversation-Id');
        if (newConvId && !convIdRef.current) {
          pendingConvIdRef.current = newConvId;
        }
        return response;
      },
    });
  }, [clubId]); // eslint-disable-line react-hooks/exhaustive-deps

  const {
    messages,
    sendMessage,
    status,
    error,
    setMessages,
  } = useChat({ transport, maxSteps: 3 });

  const isBusy = status === 'submitted' || status === 'streaming';

  // Apply pending conversation ID after streaming ends
  useEffect(() => {
    if (!isBusy && pendingConvIdRef.current) {
      setConversationId(pendingConvIdRef.current);
      setActiveConvId(pendingConvIdRef.current);
      pendingConvIdRef.current = null;
      // Refresh conversation list
      fetch(`/api/ai/conversations?clubId=${clubId}`)
        .then(r => r.ok ? r.json() : { conversations: [] })
        .then(data => setConversations(data.conversations || []))
        .catch(() => {});
    }
  }, [isBusy, clubId]);

  // Load conversation list on mount
  useEffect(() => {
    fetch(`/api/ai/conversations?clubId=${clubId}`)
      .then(r => r.ok ? r.json() : { conversations: [] })
      .then(data => setConversations(data.conversations || []))
      .catch(() => {});
  }, [clubId]);

  // Load a specific conversation's messages from DB
  const loadConversation = useCallback(async (convId: string) => {
    try {
      const res = await fetch(`/api/ai/conversations/${convId}/messages`);
      if (!res.ok) return;
      const data = await res.json();
      setMessages(
        (data.messages || [])
          .filter((m: any) => m.role !== 'system')
          .map((m: any) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            parts: [{ type: 'text' as const, text: m.content }],
            createdAt: new Date(m.createdAt),
          }))
      );
      setConversationId(convId);
      setActiveConvId(convId);
    } catch { /* ignore */ }
  }, [setMessages]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isBusy]);

  const startNewChat = () => {
    setActiveConvId(null);
    setConversationId(null);
    setMessages([]);
    setInputValue("");
    inputRef.current?.focus();
  };

  const handleSend = useCallback((text?: string) => {
    const msg = text || inputValue.trim();
    if (!msg || isBusy) return;
    sendMessage({ text: msg });
    setInputValue("");
  }, [inputValue, isBusy, sendMessage]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSend();
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
          {messages.length === 0 && !isBusy && (
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
                      onClick={() => handleSend(p.text)}
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
            {messages.map((msg, msgIdx) => {
              const text = getMessageText(msg);
              // Debug: log message structure
              if (typeof window !== 'undefined') {
                console.log(`[AdvisorIQ msg ${msgIdx}]`, msg.role, 'text:', text.slice(0, 100), 'parts:', JSON.stringify((msg as any).parts?.map((p: any) => ({ type: p.type, hasText: !!p.text })) || 'none'));
              }
              // Skip assistant messages with no text (tool-only steps)
              if (msg.role === 'assistant' && !text.trim()) return null;
              const isLastAssistant = msg.role === 'assistant' && msgIdx === messages.length - 1;
              const { cleanText, suggestions } = msg.role === 'assistant'
                ? extractSuggestions(text)
                : { cleanText: text, suggestions: [] };

              return (
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
                      {cleanText.split("\n").map((line, i) => {
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

                    {/* Suggested follow-up questions */}
                    {suggestions.length > 0 && msg.role === "assistant" && isLastAssistant && !isBusy && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {suggestions.map((q, qi) => (
                          <button
                            key={qi}
                            onClick={() => handleSend(q)}
                            className="px-3 py-1.5 rounded-xl text-xs transition-all hover:scale-[1.02]"
                            style={{
                              background: "rgba(139,92,246,0.08)",
                              border: "1px solid rgba(139,92,246,0.2)",
                              color: "var(--t2)",
                              fontWeight: 500,
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(139,92,246,0.15)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(139,92,246,0.08)"; }}
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Message meta */}
                    {msg.role === "assistant" && (
                      <div className="flex items-center gap-3 mt-2 ml-1">
                        <span className="text-[10px]" style={{ color: "var(--t4)" }}>Just now</span>
                        <div className="flex items-center gap-1">
                          {[ThumbsUp, ThumbsDown, Copy].map((Icon, idx) => (
                            <button
                              key={idx}
                              className="p-1 rounded hover:bg-white/5 transition-colors"
                              onClick={idx === 2 ? () => navigator.clipboard.writeText(text) : undefined}
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
              );
            })}
          </AnimatePresence>

          {/* Loading indicator when waiting for first response chunk */}
          {isBusy && messages[messages.length - 1]?.role === 'user' && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, #8B5CF6, #06B6D4)" }}>
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className="rounded-2xl px-4 py-2" style={{ background: "var(--subtle)", border: "1px solid var(--card-border)" }}>
                <TypingIndicator />
              </div>
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, #8B5CF6, #06B6D4)" }}>
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className="rounded-2xl px-5 py-4 text-sm" style={{ background: "var(--subtle)", border: "1px solid rgba(239,68,68,0.3)", color: "var(--t1)" }}>
                Sorry, I encountered an error. Please try again.
                <br />
                <span style={{ color: "var(--t4)", fontSize: "12px" }}>{error.message}</span>
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
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask about your club data..."
                className="flex-1 bg-transparent border-none outline-none text-sm"
                style={{ color: "var(--t1)" }}
                disabled={isBusy}
              />
            </div>
            <motion.button
              type="submit"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              disabled={!inputValue.trim() || isBusy}
              className="p-3 rounded-xl text-white transition-all"
              style={{
                background: inputValue.trim() ? "linear-gradient(135deg, #8B5CF6, #06B6D4)" : "var(--subtle)",
                opacity: inputValue.trim() ? 1 : 0.5,
                boxShadow: inputValue.trim() ? "0 4px 15px rgba(139, 92, 246, 0.3)" : "none",
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
