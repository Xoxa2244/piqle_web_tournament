import { Feather } from '@expo/vector-icons'
import { useEffect, useMemo, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { PageLayout } from '../../src/components/navigation/PageLayout'
import { OptionalLinearGradient } from '../../src/components/OptionalLinearGradient'
import { trpc } from '../../src/lib/trpc'
import { palette, radius, spacing } from '../../src/lib/theme'
import { useAuth } from '../../src/providers/AuthProvider'

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  time: string
}

const WELCOME_MESSAGE =
  "Hi! I'm your Piqle AI Coach for pickleball.\n\nWhat's your main goal right now? For example: getting fit, improving your DUPR rating, finding tournaments, or just having more fun on the court. Tell me and we'll make a plan."

const suggestedQuestions = [
  { icon: 'help-circle' as const, text: 'How do I register for a tournament?' },
  { icon: 'info' as const, text: 'What are pickleball scoring rules?' },
  { icon: 'zap' as const, text: 'Tips for improving my game' },
]

const formatClock = (dateLike?: string | Date) => {
  const date = dateLike ? new Date(dateLike) : new Date()
  try {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return 'now'
  }
}

export default function AITab() {
  const { token } = useAuth()
  const isAuthenticated = Boolean(token)
  const historyQuery = trpc.aiCoach.history.useQuery(undefined, { enabled: isAuthenticated })
  const insets = useSafeAreaInsets()
  const initialMessages = useMemo(() => {
    const history = (historyQuery.data ?? []) as Array<{
      id: string
      role: 'user' | 'assistant'
      content: string
      createdAt?: string | Date
    }>
    if (!history.length) {
      return [
        {
          id: 'welcome',
          role: 'assistant' as const,
          content: WELCOME_MESSAGE,
          time: 'now',
        },
      ] as Message[]
    }

    return history.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      time: formatClock(m.createdAt),
    })) as Message[]
  }, [historyQuery.data])

  const [messages, setMessages] = useState<Message[]>(() => [
    {
      id: 'welcome',
      role: 'assistant',
      content: WELCOME_MESSAGE,
      time: 'now',
    },
  ])
  const [input, setInput] = useState('')
  const chatMutation = trpc.aiCoach.chat.useMutation({
    onError: (err) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `Sorry, something went wrong: ${err.message}. Please try again.`,
          time: 'now',
        },
      ])
    },
  })

  useEffect(() => {
    if (!isAuthenticated) return
    if (historyQuery.isLoading) return
    setMessages(initialMessages)
  }, [historyQuery.isLoading, initialMessages, isAuthenticated])

  const send = async () => {
    if (!input.trim() || chatMutation.isPending) return
    if (!isAuthenticated) {
      router.push('/sign-in')
      return
    }

    const userContent = input.trim()
    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: 'user', content: userContent, time: formatClock() },
    ])
    setInput('')

    try {
      const { content } = await chatMutation.mutateAsync({
        message: userContent,
      })
      setMessages((prev) => [
        ...prev,
        { id: `assistant-${Date.now()}`, role: 'assistant', content, time: formatClock() },
      ])
    } catch {
      // Error already handled in onError
    }
  }

  const typing = chatMutation.isPending

  if (!isAuthenticated) {
    return (
      <PageLayout>
        <View style={styles.unauthWrap}>
          <Text style={styles.unauthTitle}>AI Assistant</Text>
          <Text style={styles.unauthBody}>
            Sign in to chat with your pickleball AI coach.
          </Text>
          <Pressable onPress={() => router.push('/sign-in')} style={({ pressed }) => [styles.signInBtn, pressed && { opacity: 0.9 }]}>
            <Text style={styles.signInText}>Sign in</Text>
          </Pressable>
        </View>
      </PageLayout>
    )
  }

  return (
    <PageLayout scroll={false} contentStyle={styles.screen}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.messages}>
            {messages.map((msg) => (
              <View key={msg.id} style={[styles.messageLine, msg.role === 'user' && styles.messageLineMine]}>
                {msg.role === 'assistant' ? (
                  <OptionalLinearGradient
                    colors={['#a855f7', '#7c3aed', '#4f46e5']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.assistantAvatar}
                  >
                    <Feather name="zap" size={16} color={palette.white} />
                  </OptionalLinearGradient>
                ) : null}

                <View style={[styles.messageCol, msg.role === 'user' && styles.messageColMine]}>
                  <OptionalLinearGradient
                    colors={
                      msg.role === 'user'
                        ? [palette.primary, palette.purple]
                        : ['rgba(168, 85, 247, 0.10)', 'rgba(124, 58, 237, 0.08)', 'rgba(79, 70, 229, 0.06)']
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    fallbackColor={msg.role === 'user' ? palette.primary : palette.surfaceElevated}
                    style={[
                      styles.bubble,
                      msg.role === 'user' ? styles.bubbleMine : styles.bubbleAssistant,
                    ]}
                  >
                    <Text style={[styles.bubbleText, msg.role === 'user' && styles.bubbleTextMine]}>
                      {msg.content}
                    </Text>
                  </OptionalLinearGradient>
                  <Text style={styles.time}>{msg.time}</Text>
                </View>
              </View>
            ))}

            {typing ? (
              <View style={styles.messageLine}>
                <OptionalLinearGradient
                  colors={['#a855f7', '#7c3aed', '#4f46e5']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.assistantAvatar}
                >
                  <Feather name="zap" size={16} color={palette.white} />
                </OptionalLinearGradient>
                <View style={styles.messageCol}>
                  <View style={[styles.bubble, styles.bubbleAssistant, styles.typingBubble]}>
                    <View style={styles.typingDots}>
                      <View style={[styles.dot, { opacity: 0.6 }]} />
                      <View style={[styles.dot, { opacity: 0.45 }]} />
                      <View style={[styles.dot, { opacity: 0.3 }]} />
                    </View>
                  </View>
                </View>
              </View>
            ) : null}
          </View>

          {messages.length === 1 ? (
            <View style={styles.suggestions}>
              <Text style={styles.suggestionsLabel}>Suggested questions:</Text>
              <View style={{ gap: 10 }}>
                {suggestedQuestions.map((q) => (
                  <Pressable
                    key={q.text}
                    onPress={() => setInput(q.text)}
                    style={({ pressed }) => [styles.suggestionCard, pressed && { opacity: 0.9 }]}
                  >
                    <OptionalLinearGradient
                      colors={['#a855f7', '#7c3aed']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.suggestionIcon}
                    >
                      <Feather name={q.icon} size={16} color={palette.white} />
                    </OptionalLinearGradient>
                    <Text style={styles.suggestionText}>{q.text}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        </ScrollView>

        <View style={[styles.composerWrap, { paddingBottom: Math.max(spacing.md, insets.bottom + 10) }]}>
          <View style={styles.composerRow}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Ask me anything..."
              placeholderTextColor={palette.textMuted}
              style={styles.composerInput}
              returnKeyType="send"
              onSubmitEditing={() => void send()}
            />
            <Pressable
              onPress={() => void send()}
              disabled={!input.trim() || typing}
              style={({ pressed }) => [
                styles.sendBtn,
                (!input.trim() || typing) && styles.sendBtnDisabled,
                pressed && input.trim() && !typing && { opacity: 0.92 },
              ]}
            >
              <OptionalLinearGradient
                colors={['#a855f7', '#7c3aed', '#4f46e5']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.sendGradient}
              >
                <Feather name="send" size={18} color={palette.white} />
              </OptionalLinearGradient>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </PageLayout>
  )
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    gap: 0,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: 120,
    gap: spacing.lg,
  },
  messages: {
    gap: 14,
  },
  messageLine: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  messageLineMine: {
    flexDirection: 'row-reverse',
  },
  assistantAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(0,0,0,0.12)',
    shadowOpacity: 1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  messageCol: {
    flex: 1,
    maxWidth: '82%',
    gap: 6,
  },
  messageColMine: {
    alignItems: 'flex-end',
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  bubbleMine: {
    borderTopRightRadius: 8,
  },
  bubbleAssistant: {
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.18)',
    backgroundColor: 'rgba(168, 85, 247, 0.06)',
  },
  bubbleText: {
    color: palette.text,
    fontSize: 14,
    lineHeight: 20,
  },
  bubbleTextMine: {
    color: palette.white,
    fontWeight: '600',
  },
  time: {
    color: palette.textMuted,
    fontSize: 12,
    paddingHorizontal: 2,
  },
  typingBubble: {
    paddingVertical: 14,
  },
  typingDots: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#7c3aed',
  },
  suggestions: {
    paddingTop: 6,
    gap: 12,
  },
  suggestionsLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.textMuted,
  },
  suggestionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.16)',
    backgroundColor: 'rgba(168, 85, 247, 0.06)',
  },
  suggestionIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionText: {
    flex: 1,
    color: palette.text,
    fontSize: 14,
    fontWeight: '600',
  },
  composerWrap: {
    borderTopWidth: 1,
    borderTopColor: palette.border,
    backgroundColor: palette.surfaceOverlay,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  composerInput: {
    flex: 1,
    height: 44,
    borderRadius: 999,
    paddingHorizontal: 16,
    backgroundColor: palette.surfaceElevated,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    color: palette.text,
    fontSize: 14,
    fontWeight: '600',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
  },
  sendBtnDisabled: {
    opacity: 0.55,
  },
  sendGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unauthWrap: {
    gap: spacing.md,
  },
  unauthTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: palette.primary,
  },
  unauthBody: {
    color: palette.textMuted,
    lineHeight: 20,
  },
  signInBtn: {
    minHeight: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.primary,
  },
  signInText: {
    color: palette.white,
    fontWeight: '800',
  },
})
