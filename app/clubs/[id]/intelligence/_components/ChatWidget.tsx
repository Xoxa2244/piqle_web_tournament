'use client'

import { useRef, useEffect, useCallback, useState, useMemo } from 'react'
import { useChat } from '@ai-sdk/react'
import { TextStreamChatTransport } from 'ai'
import { Button } from '@/components/ui/button'
import {
  Send, X, Loader2,
  Sparkles, MessageSquare, ChevronRight, Minus,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import Link from 'next/link'
import { cn } from '@/lib/utils'

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
  pageContext?: string
}

export function ChatWidget({ clubId, pageContext }: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [inputValue, setInputValue] = useState('')
  const convIdRef = useRef<string | null>(null)
  const pendingConvIdRef = useRef<string | null>(null)
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
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-lime-500 to-green-600 text-white shadow-lg shadow-lime-500/30 hover:shadow-xl hover:shadow-lime-500/40 hover:scale-105 transition-all flex items-center justify-center group"
        >
          <MessageSquare className="w-6 h-6 group-hover:scale-110 transition-transform" />
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-[10px] font-bold rounded-full flex items-center justify-center text-primary-foreground">
            AI
          </span>
        </button>
      )}

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 w-[400px] h-[520px] bg-background border rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-lime-500 to-green-600 flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-semibold leading-none">AI Advisor</h3>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">Ask anything about your club</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <Button variant="ghost" size="sm" onClick={handleNewChat} className="h-7 px-2 text-xs text-muted-foreground">
                  New chat
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)} className="h-7 w-7 p-0">
                <Minus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && !isBusy ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-lime-500 to-green-600 flex items-center justify-center mb-4 shadow-md">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <p className="text-sm font-medium mb-1">How can I help?</p>
                <p className="text-xs text-muted-foreground mb-4">
                  Ask about sessions, members, occupancy, or strategies
                </p>
                <div className="space-y-1.5 w-full">
                  {[
                    'What are my underfilled sessions?',
                    'How can I improve occupancy?',
                    'Who are my most active players?',
                  ].map((q, i) => (
                    <button
                      key={i}
                      onClick={() => handleSend(q)}
                      className="w-full text-left text-xs px-3 py-2 rounded-lg border hover:bg-accent hover:border-lime-300 dark:hover:border-lime-700 transition-colors text-muted-foreground hover:text-foreground"
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
                        <div className="bg-primary text-primary-foreground px-3 py-2 rounded-xl rounded-tr-sm max-w-[85%] text-xs">
                          {text}
                        </div>
                      ) : (
                        <div className="max-w-[95%]">
                          <div className="bg-muted/50 border rounded-xl rounded-tl-sm px-3 py-3">
                            <div className="text-xs leading-relaxed prose prose-xs max-w-none dark:prose-invert prose-p:my-1 prose-li:my-0 prose-headings:mb-1 prose-headings:mt-2 first:prose-headings:mt-0">
                              <ReactMarkdown
                                components={{
                                  a: ({ href, children }) => {
                                    if (href?.startsWith('/')) {
                                      return (
                                        <Link href={href} className="text-lime-600 hover:underline font-medium" onClick={() => setIsOpen(false)}>
                                          {children}
                                        </Link>
                                      )
                                    }
                                    return (
                                      <a href={href} target="_blank" rel="noopener noreferrer" className="text-lime-600 hover:underline">
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
                                  className="text-[10px] px-2 py-1 rounded-full border bg-background hover:bg-accent hover:border-lime-300 dark:hover:border-lime-700 transition-colors text-muted-foreground hover:text-foreground flex items-center gap-0.5"
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
                  <div className="bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2">
                    <p className="text-xs text-destructive">{error.message || 'Failed to get a response.'}</p>
                  </div>
                )}

                {isBusy && messages[messages.length - 1]?.role === 'user' && (
                  <div className="bg-muted/50 border rounded-xl rounded-tl-sm px-3 py-3 inline-block">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-lime-600" />
                      Analyzing...
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Input */}
          <div className="border-t bg-background/80 backdrop-blur-sm p-3">
            <div className="flex items-center gap-2 bg-card border rounded-lg px-3 py-1.5 focus-within:border-lime-400 focus-within:ring-1 focus-within:ring-lime-400/20 transition-all">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything..."
                className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                disabled={isBusy}
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleSend()}
                disabled={!inputValue.trim() || isBusy}
                className={cn(
                  'h-7 w-7 p-0 rounded-md transition-colors',
                  inputValue.trim() && !isBusy
                    ? 'bg-lime-600 text-white hover:bg-lime-700'
                    : 'text-muted-foreground'
                )}
              >
                <Send className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
