'use client'

import { useRef, useEffect, useCallback, useState, useMemo } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'motion/react'
import {
  Send, Upload, MessageSquare, Sparkles, Loader2,
  FileSpreadsheet, PartyPopper, ArrowRight,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { useTheme } from '../IQThemeProvider'
import { IQFileDropZone } from './IQFileDropZone'
import { OnboardingProgress, type OnboardingFields } from './OnboardingProgress'

// ── Helpers ──

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

function hasToolAction(message: any, action: string): boolean {
  if (!message.parts) return false
  return message.parts.some((p: any) =>
    p.type === 'tool-invocation' &&
    p.toolInvocation?.result?.action === action
  )
}

function isOnboardingComplete(message: any): boolean {
  if (!message.parts) return false
  return message.parts.some((p: any) =>
    p.type === 'tool-invocation' &&
    p.toolInvocation?.result?.completed === true
  )
}

function extractProgressFromMessages(messages: any[]): OnboardingFields {
  const fields: OnboardingFields = {
    timezoneAndSports: false,
    courts: false,
    schedule: false,
    pricingAndComms: false,
    goals: false,
    address: false,
  }

  for (const msg of messages) {
    if (!msg.parts) continue
    for (const part of msg.parts) {
      if (part.type !== 'tool-invocation' || !part.toolInvocation?.result?.saved) continue
      const toolName = part.toolInvocation.toolName
      if (toolName === 'saveTimezoneAndSports') fields.timezoneAndSports = true
      if (toolName === 'saveCourtInfo') fields.courts = true
      if (toolName === 'saveSchedule') fields.schedule = true
      if (toolName === 'savePricingAndComms') fields.pricingAndComms = true
      if (toolName === 'saveGoals') fields.goals = true
      if (toolName === 'saveAddress') fields.address = true

      // Also check getOnboardingProgress results
      if (toolName === 'getOnboardingProgress' && part.toolInvocation.result?.progress) {
        const p = part.toolInvocation.result.progress
        if (p.timezoneAndSports) fields.timezoneAndSports = true
        if (p.courts) fields.courts = true
        if (p.schedule) fields.schedule = true
        if (p.pricingAndComms) fields.pricingAndComms = true
        if (p.goals) fields.goals = true
        if (p.address) fields.address = true
      }
    }
  }
  return fields
}

// ── Types ──

type OnboardingState = 'welcome' | 'chat' | 'done'

type OnboardingChatIQProps = {
  clubId: string
  onComplete?: () => void
}

// ── Component ──

export function OnboardingChatIQ({ clubId, onComplete }: OnboardingChatIQProps) {
  const { isDark } = useTheme()
  const searchParams = useSearchParams()
  const isDemo = searchParams.get('demo') === 'true'

  const [state, setState] = useState<OnboardingState>('welcome')
  const [showFileUpload, setShowFileUpload] = useState(false)
  const [fileLoading, setFileLoading] = useState(false)
  const [loadedFileName, setLoadedFileName] = useState<string | null>(null)
  const [inputValue, setInputValue] = useState('')

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const convIdRef = useRef<string | null>(null)

  // ── Chat setup ──
  const transport = useMemo(() => {
    return new DefaultChatTransport({
      api: '/api/ai/onboarding',
      body: { clubId },
      fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
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
          convIdRef.current = newConvId
        }
        return response
      },
    })
  }, [clubId])

  const {
    messages, setMessages, sendMessage, status, error,
  } = useChat({ transport })

  const isLoading = status === 'streaming' || status === 'submitted'

  // ── Auto-scroll ──
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // ── Focus input on chat start ──
  useEffect(() => {
    if (state === 'chat') inputRef.current?.focus()
  }, [state])

  // ── Track progress from messages ──
  const progressFields = extractProgressFromMessages(messages)

  // ── Detect file upload requests and completion ──
  useEffect(() => {
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant')
    if (lastAssistant) {
      if (hasToolAction(lastAssistant, 'show_file_upload')) {
        setShowFileUpload(true)
      }
      if (isOnboardingComplete(lastAssistant)) {
        setState('done')
      }
    }
  }, [messages])

  // ── File upload handler ──
  const handleFileUpload = useCallback(async (file: File) => {
    setFileLoading(true)
    setLoadedFileName(null)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase()
      const { parseCSV, parseXLSX } = await import('../../advisor/_hooks/useFileParser')
      const { analyzeSchedule } = await import('@/lib/ai/csv-schedule-analyzer')

      let sessions: Awaited<ReturnType<typeof parseCSV>> = []

      if (ext === 'xlsx' || ext === 'xls') {
        const buffer = await file.arrayBuffer()
        const { csvText } = await parseXLSX(buffer, 0)
        sessions = parseCSV(csvText)
      } else {
        const text = await file.text()
        sessions = parseCSV(text)
      }

      if (sessions.length === 0) {
        console.error('[Onboarding] No sessions parsed from file')
        setFileLoading(false)
        return
      }

      setLoadedFileName(file.name)
      setShowFileUpload(false)

      const analysis = analyzeSchedule(sessions)

      // Count unique courts
      const courtSet = new Set(sessions.map(s => s.court).filter(Boolean))

      const summaryText = [
        `I uploaded my schedule file: "${file.name}"`,
        `Parsed ${sessions.length} sessions.`,
        analysis?.operatingDays?.length ? `Operating days: ${analysis.operatingDays.join(', ')}` : '',
        analysis?.operatingHours ? `Hours: ${analysis.operatingHours.open} - ${analysis.operatingHours.close}` : '',
        analysis?.peakHours ? `Peak hours: ${analysis.peakHours.start} - ${analysis.peakHours.end}` : '',
        analysis?.typicalSessionDurationMinutes ? `Typical session: ${analysis.typicalSessionDurationMinutes} minutes` : '',
        courtSet.size > 0 ? `Courts found: ${courtSet.size} (${Array.from(courtSet).join(', ')})` : '',
        analysis?.formats?.length ? `Formats: ${analysis.formats.join(', ')}` : '',
      ].filter(Boolean).join('\n')

      // Send as user message to trigger AI response
      sendMessage({ text: summaryText })
    } catch (err) {
      console.error('[Onboarding] File parse failed:', err)
      setLoadedFileName(null)
    } finally {
      setFileLoading(false)
    }
  }, [])

  // ── Start chat (path A or B) ──
  const startWithFile = useCallback(() => {
    setState('chat')
    setShowFileUpload(true)
  }, [])

  const startManual = useCallback(() => {
    setState('chat')
    // Send initial greeting to trigger AI
    sendMessage({ text: "Hi! I'd like to set up my club." })
  }, [sendMessage])

  // ── Send message ──
  const onSend = useCallback((e?: React.FormEvent) => {
    e?.preventDefault()
    if (!inputValue.trim() || isLoading) return
    sendMessage({ text: inputValue })
    setInputValue('')
  }, [inputValue, isLoading, sendMessage])

  // ── Demo mode ──
  if (isDemo) {
    return <DemoOnboarding isDark={isDark} />
  }

  // ── Welcome screen ──
  if (state === 'welcome') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center justify-center min-h-[70vh]"
      >
        <div className="max-w-lg w-full space-y-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(6, 182, 212, 0.1))' }}
            >
              <Sparkles className="w-8 h-8" style={{ color: '#A78BFA' }} />
            </div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--heading)' }}>
              Let&apos;s set up your club
            </h1>
            <p className="text-sm mt-2" style={{ color: 'var(--t3)' }}>
              Choose how you&apos;d like to get started. Takes about 2 minutes.
            </p>
          </motion.div>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Path A: Upload file */}
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              onClick={startWithFile}
              className="group rounded-2xl p-6 text-left transition-all"
              style={{
                background: 'var(--card-bg)',
                border: '1px solid var(--card-border)',
                backdropFilter: 'var(--glass-blur)',
              }}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                style={{ background: isDark ? 'rgba(139, 92, 246, 0.12)' : 'rgba(139, 92, 246, 0.08)' }}
              >
                <Upload className="w-5 h-5" style={{ color: '#A78BFA' }} />
              </div>
              <p className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>Upload Schedule</p>
              <p className="text-xs mt-1" style={{ color: 'var(--t4)' }}>
                Import CSV/XLSX — we&apos;ll extract everything automatically
              </p>
              <div className="flex items-center gap-1 mt-3 text-xs font-medium" style={{ color: '#A78BFA' }}>
                Fastest way
                <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
              </div>
            </motion.button>

            {/* Path B: Manual */}
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              onClick={startManual}
              className="group rounded-2xl p-6 text-left transition-all"
              style={{
                background: 'var(--card-bg)',
                border: '1px solid var(--card-border)',
                backdropFilter: 'var(--glass-blur)',
              }}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                style={{ background: isDark ? 'rgba(6, 182, 212, 0.12)' : 'rgba(6, 182, 212, 0.08)' }}
              >
                <MessageSquare className="w-5 h-5" style={{ color: '#67E8F9' }} />
              </div>
              <p className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>Set Up Manually</p>
              <p className="text-xs mt-1" style={{ color: 'var(--t4)' }}>
                Chat with AI — it&apos;ll guide you through everything
              </p>
              <div className="flex items-center gap-1 mt-3 text-xs font-medium" style={{ color: '#67E8F9' }}>
                Step by step
                <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
              </div>
            </motion.button>
          </div>
        </div>
      </motion.div>
    )
  }

  // ── Done screen ──
  if (state === 'done') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex items-center justify-center min-h-[70vh]"
      >
        <div className="max-w-md w-full text-center space-y-6">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
          >
            <div className="mx-auto w-20 h-20 rounded-full flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)' }}
            >
              <PartyPopper className="w-10 h-10 text-white" />
            </div>
          </motion.div>
          <div>
            <h2 className="text-2xl font-bold" style={{ color: 'var(--heading)' }}>You&apos;re all set!</h2>
            <p className="text-sm mt-2" style={{ color: 'var(--t3)' }}>
              Your club is configured and ready. Let&apos;s see your dashboard.
            </p>
          </div>
          <button
            onClick={() => {
              if (onComplete) onComplete()
              else window.location.reload()
            }}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all"
            style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)' }}
          >
            Go to Dashboard
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    )
  }

  // ── Chat screen ──
  return (
    <div className="flex gap-6 h-[calc(100vh-8rem)]">
      {/* Chat area */}
      <div className="flex-1 flex flex-col rounded-2xl overflow-hidden" style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        backdropFilter: 'var(--glass-blur)',
      }}>
        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((msg) => {
            const text = getMessageText(msg)
            if (!text && msg.role === 'user') return null

            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className="max-w-[80%] rounded-2xl px-4 py-3 text-sm"
                  style={
                    msg.role === 'user'
                      ? {
                          background: 'linear-gradient(135deg, #8B5CF6, #7C3AED)',
                          color: '#fff',
                        }
                      : {
                          background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                          color: 'var(--t1)',
                          border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
                        }
                  }
                >
                  {msg.role === 'assistant' ? (
                    <div className="prose prose-sm max-w-none" style={{ color: 'inherit' }}>
                      <ReactMarkdown>{text}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{text}</p>
                  )}
                </div>
              </motion.div>
            )
          })}

          {/* File upload inline */}
          <AnimatePresence>
            {showFileUpload && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="max-w-md"
              >
                <IQFileDropZone
                  onFile={handleFileUpload}
                  isLoading={fileLoading}
                  loadedFileName={loadedFileName}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#A78BFA' }} />
              <span className="text-xs" style={{ color: 'var(--t4)' }}>Thinking...</span>
            </div>
          )}
        </div>

        {/* Input */}
        <form onSubmit={onSend} className="shrink-0 p-4" style={{ borderTop: '1px solid var(--divider)' }}>
          <div className="flex items-center gap-3">
            <input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Type your answer..."
              disabled={isLoading}
              className="flex-1 bg-transparent border-none outline-none text-sm"
              style={{ color: 'var(--t1)' }}
            />
            <button
              type="submit"
              disabled={isLoading || !inputValue.trim()}
              className="p-2 rounded-xl transition-all disabled:opacity-30"
              style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)' }}
            >
              <Send className="w-4 h-4 text-white" />
            </button>
          </div>
        </form>
      </div>

      {/* Progress sidebar */}
      <div className="hidden lg:block w-64 shrink-0">
        <OnboardingProgress fields={progressFields} />
      </div>
    </div>
  )
}

// ── Demo mode placeholder ──

function DemoOnboarding({ isDark }: { isDark: boolean }) {
  return (
    <div className="flex items-center justify-center min-h-[70vh]">
      <div className="max-w-md text-center space-y-4">
        <div className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(6, 182, 212, 0.1))' }}
        >
          <Sparkles className="w-8 h-8" style={{ color: '#A78BFA' }} />
        </div>
        <h2 className="text-xl font-bold" style={{ color: 'var(--heading)' }}>AI Onboarding</h2>
        <p className="text-sm" style={{ color: 'var(--t3)' }}>
          In the live version, an AI assistant will guide you through setting up your club
          via a natural conversation. Upload your schedule CSV and the AI will extract
          everything automatically.
        </p>
        <div className="rounded-xl p-4 text-xs" style={{
          background: isDark ? 'rgba(139, 92, 246, 0.08)' : 'rgba(139, 92, 246, 0.04)',
          color: 'var(--t3)',
          border: '1px solid rgba(139, 92, 246, 0.15)',
        }}>
          Demo mode — onboarding is already complete
        </div>
      </div>
    </div>
  )
}
