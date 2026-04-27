'use client'

import { useRef, useEffect, useCallback, useState, useMemo } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import {
  Send, Plus, Trash2, Loader2,
  Sparkles, MessageSquare, Database, Paperclip, ChevronRight
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { DataStatusBadge } from './DataStatusBadge'
import type { ClubDataStatus } from '../_hooks/useAdvisorState'
import { useSessionsCalendar } from '../../_hooks/use-intelligence'
import { ChatRichText } from '../../_components/shared/ChatRichText'

// ── Extract suggested follow-up questions ──
function extractSuggestions(text: string): { cleanText: string; suggestions: string[] } {
  // Complete block: extract questions and remove from text (case-insensitive)
  const match = text.match(/<suggested>\s*([\s\S]*?)\s*<\/suggested>/i)
  if (match) {
    const suggestions = match[1]
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0 && s.length < 80)
    const cleanText = text.replace(/<suggested>[\s\S]*?<\/suggested>/gi, '').trimEnd()
    return { cleanText, suggestions }
  }
  // Incomplete block (during streaming): hide partial <suggested> tag
  const lowerText = text.toLowerCase()
  const partialIdx = lowerText.indexOf('<suggested>')
  if (partialIdx !== -1) {
    return { cleanText: text.slice(0, partialIdx).trimEnd(), suggestions: [] }
  }
  // Safety: strip any stray tags that might remain
  return { cleanText: text, suggestions: [] }
}

// Safety net: remove any residual suggested tags before rendering
function stripSuggestedTags(text: string): string {
  return text
    .replace(/<\/?suggested>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function linkifySessionTitles(
  text: string,
  sessions: Array<{ id: string; title?: string | null; court?: string | null }>,
  clubId: string
): string {
  if (!text || sessions.length === 0) return text

  const candidates = sessions
    .flatMap((session) => {
      const title = (session.title || '').trim()
      const court = (session.court || '').trim()
      if (!title) return []

      const variants = new Set<string>([title])
      if (court && !title.toLowerCase().includes(court.toLowerCase())) {
        variants.add(`${title} — ${court}`)
        variants.add(`${title} - ${court}`)
        variants.add(`${title} – ${court}`)
      }

      const url = `/clubs/${clubId}/intelligence/slot-filler?session=${encodeURIComponent(session.id)}`
      return Array.from(variants).map((variant) => ({ variant, url }))
    })
    .sort((a, b) => b.variant.length - a.variant.length)

  const lines = text.split('\n')

  return lines
    .map((line) => {
      if (!line || line.includes('](')) return line

      let linkedLine = line
      for (const candidate of candidates) {
        const boldVariant = `**${candidate.variant}**`
        if (linkedLine.includes(boldVariant)) {
          linkedLine = linkedLine.replace(boldVariant, `[${boldVariant}](${candidate.url})`)
          break
        }

        const pattern = new RegExp(`(^|\\s|\\d+\\.\\s|[-*]\\s)(${escapeRegExp(candidate.variant)})(?=$|\\s|[:|])`)
        if (pattern.test(linkedLine)) {
          linkedLine = linkedLine.replace(pattern, (match, prefix, title) => `${prefix}[${title}](${candidate.url})`)
          break
        }
      }

      return linkedLine
    })
    .join('\n')
}

function getMessageText(message: { parts?: Array<{ type: string; text?: string }>; content?: string }): string {
  // Try parts first (AI SDK UIMessage format)
  if (message.parts && Array.isArray(message.parts)) {
    const fromParts = message.parts
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('')
    if (fromParts) return fromParts
  }
  // Fallback: content property (DB-loaded or legacy format)
  if (typeof message.content === 'string') return message.content
  return ''
}

const suggestedQuestions = [
  // Analytics
  { icon: '📊', text: 'What is my weakest day of the week?' },
  { icon: '🏆', text: 'Which sessions fill the fastest?' },
  { icon: '👥', text: 'Who are my most active members?' },
  // Platform support
  { icon: '🔧', text: 'How do I create a targeted cohort?' },
  { icon: '📈', text: 'What insights are on the Analytics page?' },
  { icon: '💡', text: 'How can I fill empty session slots?' },
]

type ChatViewProps = {
  clubId: string
  dataStatus: ClubDataStatus | null
  onUploadData: () => void
}

export function ChatView({ clubId, dataStatus, onUploadData }: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { data: sessionsCalendarData } = useSessionsCalendar(clubId)

  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [inputValue, setInputValue] = useState('')

  // Track conversation ID from API response without triggering transport re-creation mid-stream
  const convIdRef = useRef<string | null>(null)
  const pendingConvIdRef = useRef<string | null>(null)
  // Skip DB load right after streaming (onFinish might not have persisted yet)
  const justStreamedRef = useRef(false)
  // Track if user explicitly switched conversation (vs got ID from streaming)
  const loadFromDbRef = useRef(false)
  convIdRef.current = activeConversationId

  const conversationsQuery = trpc.intelligence.listConversations.useQuery(
    { clubId, limit: 20 },
    { enabled: !!clubId }
  )

  const deleteConversation = trpc.intelligence.deleteConversation.useMutation({
    onSuccess: () => {
      conversationsQuery.refetch()
      if (activeConversationId) {
        setActiveConversationId(null)
      }
    },
  })

  const deleteAllConversations = trpc.intelligence.deleteAllConversations.useMutation({
    onSuccess: () => {
      conversationsQuery.refetch()
      setActiveConversationId(null)
      setMessages([])
    },
  })

  const transport = useMemo(() => {
    return new DefaultChatTransport({
      api: '/api/ai/chat',
      body: { clubId },
      fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
        // Inject current conversationId from ref (avoids transport re-creation on ID change)
        if (init?.body) {
          try {
            const bodyObj = JSON.parse(init.body as string)
            bodyObj.conversationId = convIdRef.current
            init = { ...init, body: JSON.stringify(bodyObj) }
          } catch { /* keep original body */ }
        }
        const response = await globalThis.fetch(url, init)
        const newConvId = response.headers.get('X-Conversation-Id')
        if (newConvId && !convIdRef.current) {
          pendingConvIdRef.current = newConvId
        }
        // Log RAG debug info from response headers
        console.log('[AI Chat] RAG status:', response.headers.get('X-RAG-Status'),
          'chunks:', response.headers.get('X-RAG-Chunks'),
          'contextLen:', response.headers.get('X-RAG-Context-Length'),
          'query:', response.headers.get('X-RAG-Query'))
        return response
      },
    })
  }, [clubId]) // eslint-disable-line react-hooks/exhaustive-deps

  const {
    messages,
    sendMessage,
    status,
    error,
    setMessages,
  } = useChat({ transport })

  const linkableSessions = useMemo(() => {
    const sessions = (sessionsCalendarData?.sessions ?? []) as Array<{ id: string; title?: string | null; court?: string | null }>
    return sessions.filter((session) => Boolean(session?.id && session?.title))
  }, [sessionsCalendarData])

  const isBusy = status === 'submitted' || status === 'streaming'

  // Apply pending conversation ID after streaming ends
  useEffect(() => {
    if (!isBusy && pendingConvIdRef.current) {
      justStreamedRef.current = true
      setActiveConversationId(pendingConvIdRef.current)
      pendingConvIdRef.current = null
      conversationsQuery.refetch()
    }
  }, [isBusy]) // eslint-disable-line react-hooks/exhaustive-deps

  const conversationQuery = trpc.intelligence.getConversation.useQuery(
    { conversationId: activeConversationId! },
    { enabled: !!activeConversationId && loadFromDbRef.current }
  )

  // Load messages from DB only when user explicitly switches conversation (sidebar click)
  useEffect(() => {
    if (conversationQuery.data?.messages && !isBusy && loadFromDbRef.current) {
      loadFromDbRef.current = false
      setMessages(
        conversationQuery.data.messages
          .filter((m: { role: string }) => m.role !== 'system')
          .map((m: { id: string; role: string; content: string }) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            parts: [{ type: 'text' as const, text: m.content }],
            createdAt: new Date(),
          }))
      )
    }
  }, [conversationQuery.data, setMessages, isBusy])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleNewConversation = () => {
    setActiveConversationId(null)
    setMessages([])
    setInputValue('')
    inputRef.current?.focus()
  }

  const handleSelectConversation = (convId: string) => {
    loadFromDbRef.current = true
    setActiveConversationId(convId)
  }

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

  return (
    <div className="flex h-[calc(100vh-220px)] gap-4">
      {/* Sidebar */}
      <div className="w-64 flex-shrink-0 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-muted-foreground">Conversations</h3>
          <div className="flex items-center gap-1">
            {(conversationsQuery.data?.length ?? 0) > 1 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (confirm('Delete all conversations?')) {
                    deleteAllConversations.mutate({ clubId })
                  }
                }}
                className="h-7 gap-1 text-xs text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
                Clear
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNewConversation}
              className="h-7 gap-1 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              New
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1">
          {conversationsQuery.data?.map((conv) => (
            <button
              key={conv.id}
              onClick={() => handleSelectConversation(conv.id)}
              className={cn(
                'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors group',
                'hover:bg-muted/60',
                activeConversationId === conv.id
                  ? 'bg-lime-50 dark:bg-lime-950/20 text-foreground border border-lime-200 dark:border-lime-800'
                  : 'text-muted-foreground'
              )}
            >
              <div className="flex items-center justify-between">
                <span className="truncate flex-1">{conv.title || 'New conversation'}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteConversation.mutate({ conversationId: conv.id })
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-destructive transition-opacity"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="text-xs text-muted-foreground/60 mt-0.5">
                {(conv as any)._count?.messages || 0} messages
              </div>
            </button>
          ))}

          {conversationsQuery.data?.length === 0 && (
            <p className="text-xs text-muted-foreground/60 text-center py-4">
              No conversations yet
            </p>
          )}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-lime-500 to-green-600 flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold leading-none">AI Club Advisor</h2>
              <p className="text-xs text-muted-foreground">Powered by your club data</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <DataStatusBadge status={dataStatus} />
            <Button variant="outline" size="sm" onClick={onUploadData} className="gap-1 text-xs">
              <Paperclip className="w-3.5 h-3.5" />
              {dataStatus?.hasData ? 'Update Data' : 'Upload Data'}
            </Button>
          </div>
        </div>

        {/* Chat card */}
        <div className="flex-1 flex flex-col overflow-hidden bg-card border rounded-xl">
          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-6">
            {messages.length === 0 && !isBusy ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-lime-500 to-green-600 flex items-center justify-center mb-6 shadow-lg shadow-lime-500/20">
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-xl font-bold mb-2">AI Club Advisor</h2>
                <p className="text-sm text-muted-foreground max-w-md mb-8">
                  {dataStatus?.hasData
                    ? 'I can help with your club analytics and the IQSport platform — ask about members, sessions, fill rates, or how to use any feature.'
                    : 'I can help you get started with IQSport — ask about connecting data, setting up integrations, or any platform feature.'}
                </p>

                <div className="w-full max-w-xl">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    Suggested Questions
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {suggestedQuestions.map((q, i) => (
                      <button
                        key={i}
                        onClick={() => handleSend(q.text)}
                        className="flex items-center gap-3 p-3 rounded-xl border bg-card hover:bg-accent hover:border-lime-300 dark:hover:border-lime-700 transition-colors text-left group"
                      >
                        <span className="text-lg">{q.icon}</span>
                        <span className="text-sm font-medium text-foreground group-hover:text-lime-700 dark:group-hover:text-lime-400">
                          {q.text}
                        </span>
                      </button>
                    ))}
                  </div>
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
                  // Safety net: strip any residual <suggested> tags before rendering
                  const cleanText = message.role === 'assistant'
                    ? linkifySessionTitles(stripSuggestedTags(rawClean), linkableSessions, clubId)
                    : rawClean
                  return (
                    <div key={message.id} className={cn('mb-2', message.role === 'user' && 'flex justify-end')}>
                      {message.role === 'user' ? (
                        <div className="bg-primary text-primary-foreground px-4 py-3 rounded-2xl rounded-tr-md max-w-[80%] text-sm">
                          {text}
                        </div>
                      ) : (
                        <div className="max-w-[90%]">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-lime-500 to-green-600 flex items-center justify-center">
                              <Sparkles className="w-3 h-3 text-white" />
                            </div>
                            <span className="text-xs font-semibold text-muted-foreground">Piqle AI</span>
                          </div>
                          <div className="bg-muted/50 border rounded-2xl rounded-tl-md px-5 py-4">
                            <div className="text-sm leading-relaxed">
                              <ChatRichText
                                text={cleanText}
                                className="space-y-1.5"
                                lineClassName="whitespace-pre-wrap"
                                linkClassName="text-lime-600 hover:underline font-medium"
                                strongClassName="font-semibold"
                              />
                            </div>
                          </div>
                          {isLastAssistant && suggestions.length > 0 && !isBusy && (
                            <div className="flex flex-wrap gap-2 mt-3">
                              {suggestions.slice(0, 3).map((q, i) => (
                                <button
                                  key={i}
                                  onClick={() => handleSend(q)}
                                  className="text-xs px-3 py-1.5 rounded-full border bg-background hover:bg-accent hover:border-lime-300 dark:hover:border-lime-700 transition-colors text-muted-foreground hover:text-foreground flex items-center gap-1"
                                >
                                  {q}
                                  <ChevronRight className="w-3 h-3" />
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
                  <div className="mb-2">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 rounded-md bg-destructive/20 flex items-center justify-center">
                        <Sparkles className="w-3 h-3 text-destructive" />
                      </div>
                      <span className="text-xs font-semibold text-destructive">Error</span>
                    </div>
                    <div className="bg-destructive/10 border border-destructive/20 rounded-2xl rounded-tl-md px-5 py-4">
                      <p className="text-sm text-destructive">{error.message || 'Failed to get a response. Please try again.'}</p>
                    </div>
                  </div>
                )}

                {isBusy && messages[messages.length - 1]?.role === 'user' && (
                  <div className="mb-2">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 rounded-md bg-gradient-to-br from-lime-500 to-green-600 flex items-center justify-center">
                        <Sparkles className="w-3 h-3 text-white" />
                      </div>
                      <span className="text-xs font-semibold text-muted-foreground">Piqle AI</span>
                    </div>
                    <div className="bg-muted/50 border rounded-2xl rounded-tl-md px-5 py-4 inline-block">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin text-lime-600" />
                        Analyzing your data...
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Input Bar */}
          <div className="border-t bg-background/80 backdrop-blur-sm p-4">
            <div className="flex items-center gap-2 bg-card border rounded-xl px-4 py-2 focus-within:border-lime-400 focus-within:ring-2 focus-within:ring-lime-400/20 transition-all">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything about your club..."
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                disabled={isBusy}
                autoFocus
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleSend()}
                disabled={!inputValue.trim() || isBusy}
                className={cn(
                  'h-8 w-8 p-0 rounded-lg transition-colors',
                  inputValue.trim() && !isBusy
                    ? 'bg-lime-600 text-white hover:bg-lime-700'
                    : 'text-muted-foreground'
                )}
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-center text-xs text-muted-foreground mt-2">
              AI responses are based on your club data and may not always be accurate
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
