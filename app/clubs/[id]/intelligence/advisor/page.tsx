'use client'

import { useParams } from 'next/navigation'
import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useChat } from '@ai-sdk/react'
import { TextStreamChatTransport } from 'ai'
import { trpc } from '@/lib/trpc'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Send, Plus, Trash2, Loader2,
  Bot, User, Sparkles, ChevronRight
} from 'lucide-react'
import { cn } from '@/lib/utils'

export default function AIAdvisorPage() {
  const params = useParams()
  const clubId = params.id as string
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [sidebarOpen] = useState(true)
  const [inputValue, setInputValue] = useState('')

  // Use a ref to track conversation ID for the fetch wrapper
  const convIdRef = useRef<string | null>(null)
  convIdRef.current = activeConversationId

  // Fetch conversations
  const conversationsQuery = trpc.intelligence.listConversations.useQuery(
    { clubId, limit: 20 },
    { enabled: !!clubId }
  )

  // Delete conversation
  const deleteConversation = trpc.intelligence.deleteConversation.useMutation({
    onSuccess: () => {
      conversationsQuery.refetch()
      if (activeConversationId) {
        setActiveConversationId(null)
      }
    },
  })

  // Create transport with custom fetch to capture conversation ID header
  const transport = useMemo(() => {
    return new TextStreamChatTransport({
      api: '/api/ai/chat',
      body: { clubId, conversationId: activeConversationId },
      fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
        const response = await globalThis.fetch(url, init)
        const newConvId = response.headers.get('X-Conversation-Id')
        if (newConvId && !convIdRef.current) {
          setActiveConversationId(newConvId)
          conversationsQuery.refetch()
        }
        return response
      },
    })
  }, [clubId, activeConversationId]) // eslint-disable-line react-hooks/exhaustive-deps

  // AI Chat hook (v6 API)
  const {
    messages,
    sendMessage,
    status,
    error,
    setMessages,
  } = useChat({
    transport,
  })

  const isBusy = status === 'submitted' || status === 'streaming'

  // Load conversation messages when switching
  const conversationQuery = trpc.intelligence.getConversation.useQuery(
    { conversationId: activeConversationId! },
    { enabled: !!activeConversationId }
  )

  // Sync loaded conversation messages
  useEffect(() => {
    if (conversationQuery.data?.messages) {
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
  }, [conversationQuery.data, setMessages])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // Start new conversation
  const handleNewConversation = () => {
    setActiveConversationId(null)
    setMessages([])
    setInputValue('')
    inputRef.current?.focus()
  }

  // Select existing conversation
  const handleSelectConversation = (convId: string) => {
    setActiveConversationId(convId)
  }

  // Send message handler
  const handleSend = useCallback((text?: string) => {
    const msg = text || inputValue.trim()
    if (!msg || isBusy) return
    sendMessage({ text: msg })
    setInputValue('')
  }, [inputValue, isBusy, sendMessage])

  // Form submit handler
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    handleSend()
  }, [handleSend])

  // Quick prompts for empty state
  const quickPrompts = [
    'Which sessions are underfilled this week?',
    'Who are my most active members?',
    'How can I improve Tuesday evening attendance?',
    'Show me occupancy trends for the last month',
  ]

  // Get text content from message parts
  const getMessageText = (message: (typeof messages)[number]) => {
    return message.parts
      ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('') || ''
  }

  return (
    <div className="flex h-[calc(100vh-220px)] gap-4">
      {/* Sidebar — conversation list */}
      {sidebarOpen && (
        <div className="w-72 flex-shrink-0 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-muted-foreground">Conversations</h3>
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

          <div className="flex-1 overflow-y-auto space-y-1">
            {conversationsQuery.data?.map((conv) => (
              <button
                key={conv.id}
                onClick={() => handleSelectConversation(conv.id)}
                className={cn(
                  'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors group',
                  'hover:bg-muted/60',
                  activeConversationId === conv.id
                    ? 'bg-muted text-foreground'
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
      )}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Card className="flex-1 flex flex-col overflow-hidden">
          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              /* Empty state */
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                  <Sparkles className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-lg font-semibold mb-1">AI Advisor</h2>
                <p className="text-sm text-muted-foreground mb-6 max-w-md">
                  Ask me anything about your club — sessions, members, occupancy, engagement strategies, and more.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg">
                  {quickPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => handleSend(prompt)}
                      className="text-left px-3 py-2 rounded-lg border text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors flex items-center gap-2"
                    >
                      <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>{prompt}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* Message list */
              messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    'flex gap-3',
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  )}
                >
                  {message.role === 'assistant' && (
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div
                    className={cn(
                      'max-w-[75%] rounded-xl px-4 py-2.5 text-sm leading-relaxed',
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    )}
                  >
                    <div className="whitespace-pre-wrap">{getMessageText(message)}</div>
                  </div>
                  {message.role === 'user' && (
                    <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                      <User className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                </div>
              ))
            )}

            {/* Error display */}
            {error && (
              <div className="flex gap-3">
                <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center flex-shrink-0">
                  <Bot className="h-4 w-4 text-destructive" />
                </div>
                <div className="bg-destructive/10 rounded-xl px-4 py-2.5 max-w-[75%]">
                  <p className="text-sm text-destructive font-medium">Error</p>
                  <p className="text-sm text-destructive/80 mt-1">{error.message || 'Failed to get a response. Please try again.'}</p>
                </div>
              </div>
            )}

            {/* Loading indicator */}
            {isBusy && messages[messages.length - 1]?.role === 'user' && (
              <div className="flex gap-3">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="bg-muted rounded-xl px-4 py-2.5">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Thinking...
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t p-4">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <Input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask about your club..."
                disabled={isBusy}
                className="flex-1"
                autoFocus
              />
              <Button type="submit" size="icon" disabled={isBusy || !inputValue.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
            <p className="text-[10px] text-muted-foreground/50 mt-1.5 text-center">
              AI responses are based on your club data and may not always be accurate.
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}
