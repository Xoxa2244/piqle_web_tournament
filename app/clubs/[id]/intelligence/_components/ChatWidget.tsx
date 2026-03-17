'use client'

import { useRef, useEffect, useCallback, useState, useMemo } from 'react'
import { useChat } from '@ai-sdk/react'
import { TextStreamChatTransport } from 'ai'
import {
  Send, Loader2,
  Sparkles, MessageSquare, ChevronRight, Minus, Plus,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { usePageContextData } from '../_hooks/usePageContext'

// ── Extract suggested follow-up questions ──
function extractSuggestions(text: string): { cleanText: string; suggestions: string[] } {
  const match = text.match(/<suggested>\s*([\s\S]*?)\s*<\/suggested>/i)
  if (match) {
    const suggestions = match[1]
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0 && s.length < 80)
    const cleanText = text.replace(/<suggested>[\s\S]*?<\/suggested>/gi, '').trimEnd()
    return { cleanText, suggestions }
  }
  const lowerText = text.toLowerCase()
  const partialIdx = lowerText.indexOf('<suggested>')
  if (partialIdx !== -1) {
    return { cleanText: text.slice(0, partialIdx).trimEnd(), suggestions: [] }
  }
  return { cleanText: text, suggestions: [] }
}

function stripSuggestedTags(text: string): string {
  return text
    .replace(/<\/?suggested>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()
}

function getMessageText(message: { parts?: Array<{ type: string; text?: string }>; content?: string }): string {
  if (message.parts && Array.isArray(message.parts)) {
    const fromParts = message.parts
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('')
    if (fromParts) return fromParts
  }
  if (typeof message.content === 'string') return message.content
  return ''
}

type ChatWidgetProps = {
  clubId: string
}

export function ChatWidget({ clubId }: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [inputValue, setInputValue] = useState('')
  const convIdRef = useRef<string | null>(null)
  const pendingConvIdRef = useRef<string | null>(null)
  const pageContext = usePageContextData()
  const pageContextRef = useRef(pageContext)
  pageContextRef.current = pageContext

  const transport = useMemo(() => {
    return new TextStreamChatTransport({
      api: '/api/ai/chat',
      body: { clubId },
      fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
        if (init?.body) {
          try {
            const bodyObj = JSON.parse(init.body as string)
            bodyObj.conversationId = convIdRef.current
            bodyObj.pageContext = pageContextRef.current
            init = { ...init, body: JSON.stringify(bodyObj) }
          } catch { /* keep original body */ }
        }
        const response = await globalThis.fetch(url, init)
        const newConvId = response.headers.get('X-Conversation-Id')
        if (newConvId && !convIdRef.current) {
          pendingConvIdRef.current = newConvId
        }
        return response
      },
    })
  }, [clubId])

  const {
    messages,
    sendMessage,
    status,
    error,
    setMessages,
  } = useChat({ transport })

  const isBusy = status === 'submitted' || status === 'streaming'

  // Apply pending conversation ID after streaming ends
  useEffect(() => {
    if (!isBusy && pendingConvIdRef.current) {
      convIdRef.current = pendingConvIdRef.current
      pendingConvIdRef.current = null
    }
  }, [isBusy])

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) setIsOpen(false)
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen])

  const handleSend = useCallback((text?: string) => {
    const msg = text || inputValue.trim()
    if (!msg || isBusy) return
    sendMessage({ text: msg })
    setInputValue('')
  }, [inputValue, isBusy, sendMessage])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleNewChat = () => {
    convIdRef.current = null
    setMessages([])
    setInputValue('')
    inputRef.current?.focus()
  }

  return (
    <>
      {/* Floating button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-2xl shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center group"
          style={{ background: "linear-gradient(135deg, #8B5CF6, #06B6D4)", boxShadow: "0 8px 24px rgba(139,92,246,0.35)" }}
        >
          <MessageSquare className="w-6 h-6 text-white group-hover:scale-110 transition-transform" />
          <span
            className="absolute -top-1.5 -right-1.5 w-5 h-5 text-[9px] font-bold rounded-full flex items-center justify-center text-white"
            style={{ background: "linear-gradient(135deg, #06B6D4, #10B981)" }}
          >
            AI
          </span>
        </button>
      )}

      {/* Chat panel */}
      {isOpen && (
        <div
          className="fixed bottom-6 right-6 z-50 w-[400px] h-[520px] rounded-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-200"
          style={{
            background: "var(--chat-bg, #1a1a2e)", backdropFilter: "blur(20px)",
            border: "1px solid var(--card-border, rgba(139,92,246,0.15))",
            boxShadow: "0 20px 60px rgba(0,0,0,0.5), 0 0 30px rgba(139,92,246,0.1)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 shrink-0"
            style={{ borderBottom: "1px solid var(--card-border, rgba(255,255,255,0.06))" }}
          >
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #8B5CF6, #06B6D4)" }}
              >
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 style={{ fontSize: "13px", fontWeight: 700, color: "var(--heading, #fff)" }}>AI Advisor</h3>
                <p style={{ fontSize: "10px", color: "var(--t3, #888)", marginTop: "1px" }}>Ask anything about your club</p>
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              {messages.length > 0 && (
                <button
                  onClick={handleNewChat}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                  style={{ color: "var(--t3, #888)" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--subtle, rgba(255,255,255,0.05))")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <Plus className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                style={{ color: "var(--t3, #888)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--subtle, rgba(255,255,255,0.05))")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <Minus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && !isBusy ? (
              <div className="flex flex-col h-full">
                {/* Welcome message */}
                <div
                  className="rounded-2xl rounded-tl-sm px-4 py-3 mb-4"
                  style={{ background: "var(--subtle, rgba(255,255,255,0.04))", border: "1px solid var(--card-border, rgba(255,255,255,0.06))" }}
                >
                  <p style={{ fontSize: "13px", color: "var(--heading, #fff)", fontWeight: 500 }}>How can I help you today?</p>
                </div>

                <p style={{ fontSize: "11px", color: "var(--t4, #666)", marginBottom: "8px", fontWeight: 500 }}>Try asking:</p>

                <div className="space-y-2">
                  {[
                    'What were my best performing sessions this week?',
                    'Which members are at risk of churning?',
                    'How can I increase occupancy on Tuesday mornings?',
                  ].map((q, i) => (
                    <button
                      key={i}
                      onClick={() => handleSend(q)}
                      className="w-full text-left text-xs px-4 py-3 rounded-xl transition-all"
                      style={{
                        background: "var(--subtle, rgba(255,255,255,0.04))",
                        border: "1px solid var(--card-border, rgba(255,255,255,0.06))",
                        color: "var(--t2, #ccc)",
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.borderColor = "rgba(139,92,246,0.3)"
                        e.currentTarget.style.background = "rgba(139,92,246,0.05)"
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.borderColor = "var(--card-border, rgba(255,255,255,0.06))"
                        e.currentTarget.style.background = "var(--subtle, rgba(255,255,255,0.04))"
                      }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((message, msgIdx) => {
                  const text = getMessageText(message)
                  const isLastAssistant = message.role === 'assistant' && msgIdx === messages.length - 1
                  const { cleanText: rawClean, suggestions } = message.role === 'assistant'
                    ? extractSuggestions(text)
                    : { cleanText: text, suggestions: [] }
                  const cleanText = message.role === 'assistant' ? stripSuggestedTags(rawClean) : rawClean
                  return (
                    <div key={message.id} className={cn('mb-1', message.role === 'user' && 'flex justify-end')}>
                      {message.role === 'user' ? (
                        <div
                          className="px-3 py-2 rounded-xl rounded-tr-sm max-w-[85%] text-xs"
                          style={{ background: "linear-gradient(135deg, #8B5CF6, #7C3AED)", color: "#fff" }}
                        >
                          {text}
                        </div>
                      ) : (
                        <div className="max-w-[95%]">
                          <div
                            className="rounded-xl rounded-tl-sm px-3 py-3"
                            style={{ background: "var(--subtle, rgba(255,255,255,0.04))", border: "1px solid var(--card-border, rgba(255,255,255,0.06))" }}
                          >
                            <div className="text-xs leading-relaxed prose prose-xs max-w-none dark:prose-invert prose-p:my-1 prose-li:my-0 prose-headings:mb-1 prose-headings:mt-2 first:prose-headings:mt-0" style={{ color: "var(--t2, #ccc)" }}>
                              <ReactMarkdown
                                components={{
                                  a: ({ href, children }) => {
                                    if (href?.startsWith('/')) {
                                      return (
                                        <Link href={href} className="hover:underline font-medium" style={{ color: "#06B6D4" }} onClick={() => setIsOpen(false)}>
                                          {children}
                                        </Link>
                                      )
                                    }
                                    return (
                                      <a href={href} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: "#06B6D4" }}>
                                        {children}
                                      </a>
                                    )
                                  },
                                }}
                              >
                                {cleanText}
                              </ReactMarkdown>
                            </div>
                          </div>
                          {isLastAssistant && suggestions.length > 0 && !isBusy && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {suggestions.slice(0, 3).map((q, i) => (
                                <button
                                  key={i}
                                  onClick={() => handleSend(q)}
                                  className="text-[10px] px-2 py-1 rounded-full flex items-center gap-0.5 transition-colors"
                                  style={{
                                    background: "var(--subtle, rgba(255,255,255,0.04))",
                                    border: "1px solid var(--card-border, rgba(255,255,255,0.06))",
                                    color: "var(--t3, #888)",
                                  }}
                                  onMouseEnter={e => {
                                    e.currentTarget.style.borderColor = "rgba(139,92,246,0.3)"
                                    e.currentTarget.style.color = "var(--heading, #fff)"
                                  }}
                                  onMouseLeave={e => {
                                    e.currentTarget.style.borderColor = "var(--card-border, rgba(255,255,255,0.06))"
                                    e.currentTarget.style.color = "var(--t3, #888)"
                                  }}
                                >
                                  {q}
                                  <ChevronRight className="w-2.5 h-2.5" />
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}

                {error && (
                  <div className="rounded-xl px-3 py-2" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
                    <p className="text-xs" style={{ color: "#F87171" }}>{error.message || 'Failed to get a response.'}</p>
                  </div>
                )}

                {isBusy && messages[messages.length - 1]?.role === 'user' && (
                  <div
                    className="rounded-xl rounded-tl-sm px-3 py-3 inline-block"
                    style={{ background: "var(--subtle, rgba(255,255,255,0.04))", border: "1px solid var(--card-border, rgba(255,255,255,0.06))" }}
                  >
                    <div className="flex items-center gap-2 text-xs" style={{ color: "var(--t3, #888)" }}>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "#8B5CF6" }} />
                      Analyzing...
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Input */}
          <div className="shrink-0 p-3" style={{ borderTop: "1px solid var(--card-border, rgba(255,255,255,0.06))" }}>
            <div
              className="flex items-center gap-2 rounded-xl px-3 py-2"
              style={{
                background: "var(--subtle, rgba(255,255,255,0.04))",
                border: "1px solid var(--card-border, rgba(255,255,255,0.06))",
              }}
            >
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question..."
                className="flex-1 bg-transparent text-xs outline-none"
                style={{ color: "var(--t1, #eee)" }}
                disabled={isBusy}
              />
              <button
                onClick={() => handleSend()}
                disabled={!inputValue.trim() || isBusy}
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all"
                style={{
                  background: inputValue.trim() && !isBusy
                    ? "linear-gradient(135deg, #06B6D4, #8B5CF6)"
                    : "var(--subtle, rgba(255,255,255,0.04))",
                  opacity: inputValue.trim() && !isBusy ? 1 : 0.4,
                  cursor: inputValue.trim() && !isBusy ? "pointer" : "default",
                }}
              >
                <Send className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
