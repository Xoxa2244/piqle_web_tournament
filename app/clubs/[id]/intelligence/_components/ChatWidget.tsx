'use client'

import { useRef, useEffect, useCallback, useState, useMemo } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import {
  Send, Loader2,
  Sparkles, MessageSquare, ChevronRight, Minus, Plus,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { usePageContextData } from '../_hooks/usePageContext'
// Mock responses kept as fallback for unauthenticated demo sessions

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

// ── Mock AI responses for IQ demo (EN + RU) ──
function isRussian(text: string): boolean {
  return /[а-яё]/i.test(text)
}

type MockEntry = { keywords: string[]; en: string; ru: string }

const mockResponses: MockEntry[] = [
  { keywords: ['привет', 'hello', 'hi', 'hey', 'дела', 'как дел', 'здравствуй', 'добрый', 'yo', 'sup'],
    en: `Hey! 👋 Your club is looking strong this week:\n\n- **127 active members** (up 8% MoM)\n- **82% avg occupancy** across all courts\n- **$12.4K revenue** this month so far\n- **5 members reactivated** in the last 30 days\n\nWhat would you like to dive into?\n\n<suggested>\nWhich members are at risk of churning?\nHow can I increase Tuesday morning occupancy?\nWhat were my best sessions this week?\n</suggested>`,
    ru: `Привет! 👋 Дела в клубе отлично на этой неделе:\n\n- **127 активных участников** (рост 8% MoM)\n- **82% заполняемость** кортов в среднем\n- **$12.4K выручка** за этот месяц\n- **5 участников** вернулись за последние 30 дней\n\nЧто хочешь посмотреть подробнее?\n\n<suggested>\nКакие участники под угрозой ухода?\nКак увеличить утреннюю заполняемость?\nКакие сессии лучше всего работают?\n</suggested>` },
  { keywords: ['risk', 'churn', 'at risk', 'риск', 'уход', 'churning', 'угроз', 'потер'],
    en: `Currently tracking **12 at-risk members** (down from 14 last month):\n\n🔴 **3 High Risk** — inactive 28+ days\n- Maria Santos (42d inactive, health 18)\n- Tom Chen (35d inactive, health 22)\n- David Park (28d inactive, health 25)\n\n🟡 **3 Medium Risk** — declining frequency\n- Jennifer Liu, Alex Rivera, Priya Sharma\n\n🟢 **2 Low Risk** — seasonal dip\n\n**Recommended:** Launch a personalized win-back campaign for the 3 high-risk members.\n\n<suggested>\nWhat's the best approach for Maria Santos?\nShow me the reactivation campaign results\nHow is our retention trending?\n</suggested>`,
    ru: `Отслеживаем **12 участников под угрозой** (было 14 в прошлом месяце):\n\n🔴 **3 Высокий риск** — неактивны 28+ дней\n- Maria Santos (42 дня, health 18)\n- Tom Chen (35 дней, health 22)\n- David Park (28 дней, health 25)\n\n🟡 **3 Средний риск** — частота снижается\n- Jennifer Liu, Alex Rivera, Priya Sharma\n\n🟢 **2 Низкий риск** — сезонное снижение\n\n**Рекомендация:** Запустить персональную win-back кампанию для 3 высокорисковых.\n\n<suggested>\nКак лучше вернуть Maria Santos?\nПокажи результаты кампаний реактивации\nКак идёт retention?\n</suggested>` },
  { keywords: ['session', 'best', 'top', 'сессии', 'лучш', 'сесси', 'занят'],
    en: `**Top performing sessions** this week:\n\n1. 🏆 **Thursday Open Play 6PM** — 8/8 players, $320 revenue\n2. 🥈 **Saturday Morning Clinic** — 11/12 players, $550 revenue\n3. 🥉 **Wednesday Competitive** — 7/8 players, $280 revenue\n\n**Worst:** Tuesday 7AM Open Play — only 2/8 spots filled\n\n💡 **AI Suggestion:** Move the Tuesday 7AM session to 8AM — 3x more member availability at that time.\n\n<suggested>\nHow can I fill the Tuesday morning session?\nWhat formats are most popular?\nShow me court utilization\n</suggested>`,
    ru: `**Лучшие сессии** за неделю:\n\n1. 🏆 **Четверг Open Play 18:00** — 8/8 игроков, $320\n2. 🥈 **Суббота утренняя клиника** — 11/12 игроков, $550\n3. 🥉 **Среда Competitive** — 7/8 игроков, $280\n\n**Худшая:** Вторник 7:00 Open Play — только 2/8 мест занято\n\n💡 **AI совет:** Перенести вторник с 7:00 на 8:00 — в 3 раза больше участников доступны.\n\n<suggested>\nКак заполнить утреннюю сессию вторника?\nКакие форматы самые популярные?\nПокажи загрузку кортов\n</suggested>` },
  { keywords: ['occupancy', 'tuesday', 'morning', 'fill', 'заполн', 'вторник', 'утр', 'загрузк'],
    en: `**Tuesday Morning Analysis:**\n\nCurrent occupancy: **25%** (2/8 avg)\nPeak Tuesday slot: **6-8 PM at 94%**\n\n**AI Recommendations:**\n1. 📧 Target 8 members with Tuesday AM availability\n2. ⏰ Shift to 8:30 AM — 23 members available vs. 9 at 7 AM\n3. 🎯 Offer "Morning Warrior" 3-session package discount\n4. 👥 Create beginner-friendly format — 5 members requested this\n\nEstimated impact: **+45% occupancy** within 2 weeks\n\n<suggested>\nLaunch the Morning Warrior campaign\nWho are the 8 target members?\nShow me revenue by time slot\n</suggested>`,
    ru: `**Анализ утра вторника:**\n\nТекущая заполняемость: **25%** (2/8 в среднем)\nПик вторника: **18-20 — 94%**\n\n**AI рекомендации:**\n1. 📧 Таргетировать 8 участников с утренней доступностью\n2. ⏰ Сдвинуть на 8:30 — 23 участника доступны vs 9 в 7:00\n3. 🎯 Предложить пакет "Morning Warrior" со скидкой\n4. 👥 Создать формат для начинающих — 5 участников просили\n\nОжидаемый эффект: **+45% заполняемость** за 2 недели\n\n<suggested>\nЗапустить кампанию Morning Warrior\nКто эти 8 целевых участников?\nПокажи выручку по слотам\n</suggested>` },
  { keywords: ['revenue', 'money', 'доход', 'выручк', 'деньг', 'прибыл'],
    en: `**Revenue — March 2025:**\n\n💰 **Total: $12,400** (target: $15,000)\n- Open Play: $5,200 (42%)\n- Clinics: $3,800 (31%)\n- Leagues: $2,100 (17%)\n- Events: $1,300 (10%)\n\n📈 **Trends:**\n- MoM growth: +18%\n- Per-member avg: $97.60\n- Best day: Saturday ($2,800/week)\n- Revenue at risk: $1,840 (from at-risk members)\n\n**AI Insight:** Reactivating top 3 high-risk members could recover ~$420/month.\n\n<suggested>\nHow can I hit the $15K target?\nWhat's my most profitable format?\nShow member lifetime value\n</suggested>`,
    ru: `**Выручка — Март 2025:**\n\n💰 **Итого: $12,400** (план: $15,000)\n- Open Play: $5,200 (42%)\n- Клиники: $3,800 (31%)\n- Лиги: $2,100 (17%)\n- Ивенты: $1,300 (10%)\n\n📈 **Тренды:**\n- Рост MoM: +18%\n- На участника: $97.60\n- Лучший день: суббота ($2,800/нед)\n- Выручка под угрозой: $1,840 (от at-risk участников)\n\n**AI инсайт:** Реактивация топ-3 рисковых вернёт ~$420/мес.\n\n<suggested>\nКак выйти на $15K?\nКакой формат самый прибыльный?\nПокажи LTV участников\n</suggested>` },
  { keywords: ['member', 'player', 'участник', 'игрок', 'членов', 'юзер', 'польз'],
    en: `**Member Overview:**\n\n👥 **127 total members**\n- 🟢 72 Healthy (57%)\n- 🟡 25 Watch (20%)\n- 🟠 18 At Risk (14%)\n- 🔴 12 Critical (9%)\n\n📊 **Segments:**\n- Power Players (4+/week): 15 members\n- Regular (2-3/week): 42 members\n- Casual (1/week): 38 members\n- Occasional (<1/week): 32 members\n\n**New this month:** 8 members joined\n\n<suggested>\nWho are my power players?\nShow me the newest members\nWhat's the retention rate?\n</suggested>`,
    ru: `**Обзор участников:**\n\n👥 **127 всего**\n- 🟢 72 Здоровых (57%)\n- 🟡 25 Под наблюдением (20%)\n- 🟠 18 Под угрозой (14%)\n- 🔴 12 Критических (9%)\n\n📊 **Сегменты:**\n- Power Players (4+/нед): 15\n- Регулярные (2-3/нед): 42\n- Casual (1/нед): 38\n- Редкие (<1/нед): 32\n\n**Новых в этом месяце:** 8\n\n<suggested>\nКто мои power players?\nПокажи новых участников\nКакой retention rate?\n</suggested>` },
  { keywords: ['русск', 'язык', 'говор', 'понима'],
    en: `Of course! I speak both English and Russian. Feel free to ask in either language. 🌍\n\n<suggested>\nHow is my club doing?\nWhich members are at risk?\nShow me revenue\n</suggested>`,
    ru: `Конечно, я говорю по-русски! 🇷🇺 Спрашивай на любом языке.\n\nВот чем могу помочь:\n- 📊 **Метрики клуба** — выручка, заполняемость, здоровье участников\n- 👥 **Аналитика участников** — риск ухода, сегменты, вовлечённость\n- 📅 **Анализ сессий** — лучшие/худшие, оптимизация\n- 🎯 **AI рекомендации** — заполнение слотов, реактивация\n\n<suggested>\nКак дела в клубе?\nКакие участники под угрозой ухода?\nПокажи выручку\n</suggested>` },
]

const defaultResponse = {
  en: `Great question! Here's what I can help with:\n\n- 📊 **Club metrics** — revenue, occupancy, member health\n- 👥 **Member insights** — at-risk detection, segments, engagement\n- 📅 **Session analysis** — best/worst performing, optimization\n- 🎯 **AI recommendations** — slot filling, reactivation campaigns\n\nTry asking something specific!\n\n<suggested>\nHow is my club doing this week?\nWhich members are at risk?\nShow me revenue breakdown\n</suggested>`,
  ru: `Отличный вопрос! Вот чем могу помочь:\n\n- 📊 **Метрики клуба** — выручка, заполняемость, здоровье участников\n- 👥 **Аналитика участников** — риск ухода, сегменты, вовлечённость\n- 📅 **Анализ сессий** — лучшие/худшие, оптимизация\n- 🎯 **AI рекомендации** — заполнение слотов, реактивация\n\nПопробуй спросить что-нибудь конкретное!\n\n<suggested>\nКак дела в клубе на этой неделе?\nКакие участники под угрозой ухода?\nПокажи выручку\n</suggested>`,
}

function getMockResponse(query: string): string {
  const q = query.toLowerCase()
  const ru = isRussian(query)
  for (const mock of mockResponses) {
    if (mock.keywords.some(k => q.includes(k))) {
      return ru ? mock.ru : mock.en
    }
  }
  return ru ? defaultResponse.ru : defaultResponse.en
}

type MockMessage = {
  id: string
  role: 'user' | 'assistant'
  parts: Array<{ type: 'text'; text: string }>
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

  // ── Mock fallback state (activates if real API fails with auth error) ──
  const [useMock, setUseMock] = useState(false)
  const [mockMessages, setMockMessages] = useState<MockMessage[]>([])
  const [mockLoading, setMockLoading] = useState(false)

  const mockSendMessage = useCallback(async (text: string) => {
    const userMsg: MockMessage = { id: `u-${Date.now()}`, role: 'user', parts: [{ type: 'text', text }] }
    setMockMessages(prev => [...prev, userMsg])
    setMockLoading(true)
    await new Promise(r => setTimeout(r, 600 + Math.random() * 800))
    const response = getMockResponse(text)
    const aiMsg: MockMessage = { id: `a-${Date.now()}`, role: 'assistant', parts: [{ type: 'text', text: response }] }
    setMockMessages(prev => [...prev, aiMsg])
    setMockLoading(false)
  }, [])

  // ── Real transport (always used first, same as before redesign) ──
  const transport = useMemo(() => {
    return new DefaultChatTransport({
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
        // If auth fails, switch to mock mode silently
        if (response.status === 401 || response.status === 403) {
          setUseMock(true)
        }
        const newConvId = response.headers.get('X-Conversation-Id')
        if (newConvId && !convIdRef.current) {
          pendingConvIdRef.current = newConvId
        }
        return response
      },
    })
  }, [clubId])

  const {
    messages: realMessages,
    sendMessage: realSendMessage,
    status: realStatus,
    error: realError,
    setMessages: realSetMessages,
  } = useChat({ transport })

  // If real API returns auth error on first message, switch to mock
  useEffect(() => {
    if (realError && !useMock) {
      const msg = realError.message || ''
      if (msg.includes('Unauthorized') || msg.includes('401') || msg.includes('403')) {
        setUseMock(true)
        // Replay the last user message in mock mode
        const lastUser = realMessages.filter(m => m.role === 'user').pop()
        if (lastUser) {
          const text = getMessageText(lastUser)
          if (text) mockSendMessage(text)
        }
      }
    }
  }, [realError, useMock, realMessages, mockSendMessage])

  // ── Unified interface ──
  const messages = useMock ? mockMessages : realMessages
  const status = useMock ? (mockLoading ? 'streaming' : 'ready') : realStatus
  const error = useMock ? null : realError

  const isBusy = status === 'submitted' || status === 'streaming'

  const handleSend = useCallback((text?: string) => {
    const msg = text || inputValue.trim()
    if (!msg || isBusy) return
    if (useMock) {
      mockSendMessage(msg)
    } else {
      realSendMessage({ text: msg })
    }
    setInputValue('')
  }, [inputValue, isBusy, useMock, mockSendMessage, realSendMessage])

  const handleNewChat = () => {
    if (useMock) {
      setMockMessages([])
    } else {
      convIdRef.current = null
      realSetMessages([])
    }
    setInputValue('')
    inputRef.current?.focus()
  }

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
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
