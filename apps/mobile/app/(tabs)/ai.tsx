import { Feather } from '@expo/vector-icons'
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { AppBottomSheet, AppConfirmActions } from '../../src/components/AppBottomSheet'
import { ChatComposer } from '../../src/components/ChatComposer'
import { ChatThreadRoot } from '../../src/components/ChatThreadRoot'
import { useChatKeyboardVerticalOffset } from '../../src/hooks/useChatKeyboardVerticalOffset'
import { PageLayout } from '../../src/components/navigation/PageLayout'
import { ReloadIcon } from '../../src/components/icons/ReloadIcon'
import { OptionalLinearGradient } from '../../src/components/OptionalLinearGradient'
import { LoadingBlock } from '../../src/components/ui'
import { trpc } from '../../src/lib/trpc'
import { radius, spacing, type ThemePalette } from '../../src/lib/theme'
import { useAuth } from '../../src/providers/AuthProvider'
import { useAppTheme } from '../../src/providers/ThemeProvider'
import { useToast } from '../../src/providers/ToastProvider'

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

type InlineToken =
  | { type: 'text'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'italic'; value: string }

const tokenizeInlineMarkdown = (input: string): InlineToken[] => {
  const tokens: InlineToken[] = []
  let i = 0

  const pushText = (value: string) => {
    if (!value) return
    const last = tokens[tokens.length - 1]
    if (last?.type === 'text') last.value += value
    else tokens.push({ type: 'text', value })
  }

  while (i < input.length) {
    const ch = input[i]
    const next = input[i + 1]

    // Bold: **text**
    if (ch === '*' && next === '*') {
      const end = input.indexOf('**', i + 2)
      if (end !== -1) {
        const value = input.slice(i + 2, end)
        tokens.push({ type: 'bold', value })
        i = end + 2
        continue
      }
    }

    // Italic: *text*
    if (ch === '*') {
      const end = input.indexOf('*', i + 1)
      if (end !== -1) {
        const value = input.slice(i + 1, end)
        tokens.push({ type: 'italic', value })
        i = end + 1
        continue
      }
    }

    pushText(ch)
    i += 1
  }

  return tokens
}

const renderInlineMarkdown = (input: string, keyPrefix: string, styles: ReturnType<typeof createStyles>) => {
  const tokens = tokenizeInlineMarkdown(input)
  return tokens.map((token, idx) => {
    const key = `${keyPrefix}-${idx}`
    if (token.type === 'bold') return <Text key={key} style={styles.inlineBold}>{token.value}</Text>
    if (token.type === 'italic') return <Text key={key} style={styles.inlineItalic}>{token.value}</Text>
    return token.value
  })
}

export default function AITab() {
  const { token } = useAuth()
  const toast = useToast()
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const isAuthenticated = Boolean(token)
  const keyboardVerticalOffset = useChatKeyboardVerticalOffset('tabPageLayout')
  const tabBarHeight = useBottomTabBarHeight()
  const historyQuery = trpc.aiCoach.history.useQuery(undefined, { enabled: isAuthenticated })
  const scrollRef = useRef<ScrollView | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const chatFade = useRef(new Animated.Value(0)).current
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

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)
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
  const resetMutation = trpc.aiCoach.reset.useMutation()

  useEffect(() => {
    if (!isAuthenticated) return
    if (historyQuery.isLoading) return
    setMessages(initialMessages)
    setHydrated(true)
    chatFade.stopAnimation()
    chatFade.setValue(0)
    Animated.timing(chatFade, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start()
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
  const resetPending = resetMutation.isPending

  const scrollToBottom = (animated = true) => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated })
    })
  }

  useEffect(() => {
    if (!isAuthenticated) return
    // Auto-follow new messages and typing indicator.
    scrollToBottom(true)
  }, [isAuthenticated, messages.length, typing])

  useEffect(() => {
    const didShow = Keyboard.addListener('keyboardDidShow', () => {
      scrollToBottom(true)
    })
    return () => {
      didShow.remove()
    }
  }, [])

  const resetChat = () => {
    if (resetPending) return
    setResetConfirmOpen(true)
  }

  const performResetChat = async () => {
    try {
      await resetMutation.mutateAsync()
      setResetConfirmOpen(false)
      setInput('')
      const next = [
        {
          id: 'welcome',
          role: 'assistant' as const,
          content: WELCOME_MESSAGE,
          time: 'now',
        },
      ]
      setMessages(next)
      setHydrated(true)
      chatFade.stopAnimation()
      chatFade.setValue(0)
      Animated.timing(chatFade, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }).start()
      try {
        await historyQuery.refetch()
      } catch (refetchErr: any) {
        toast.error(refetchErr?.message || 'Failed to refresh chat history.', 'Update failed')
        scrollToBottom(false)
        return
      }
      toast.success('AI Coach chat was reset.')
      scrollToBottom(false)
    } catch (err: any) {
      setResetConfirmOpen(false)
      toast.error(err?.message || 'Unable to reset right now. Please try again.', 'Reset failed')
    }
  }

  if (!isAuthenticated) {
    return (
      <PageLayout chatAmbient>
        <View style={styles.unauthWrap}>
          <Text style={styles.unauthBody}>Sign in to chat with your pickleball AI coach.</Text>
          <Pressable
            onPress={() => router.push('/sign-in')}
            style={({ pressed }) => [styles.signInBtn, pressed && { opacity: 0.9 }]}
          >
            <Text style={styles.signInText}>Sign in</Text>
          </Pressable>
        </View>
      </PageLayout>
    )
  }

  return (
    <PageLayout
      chatAmbient
      scroll={false}
      contentStyle={styles.screen}
      topBarTitleAccessory={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reset AI chat"
          onPress={resetChat}
          disabled={resetPending}
          hitSlop={10}
          style={({ pressed }) => [
            styles.resetIconBtn,
            resetPending && { opacity: 0.55 },
            pressed && !resetPending && { opacity: 0.8 },
          ]}
        >
          <ReloadIcon size={20} color={colors.textMuted} />
        </Pressable>
      }
    >
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: 'transparent' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        <ChatThreadRoot
          ref={scrollRef}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollToBottom(false)}
        >
          {!hydrated ? (
            <View style={styles.hydrateLoader}>
              <LoadingBlock label="Loading your chat…" />
            </View>
          ) : (
            <Animated.View style={{ opacity: chatFade }}>
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
                        <Feather name="zap" size={16} color={colors.white} />
                      </OptionalLinearGradient>
                    ) : null}

                    <View style={[styles.messageCol, msg.role === 'user' && styles.messageColMine]}>
                      <OptionalLinearGradient
                        colors={
                          msg.role === 'user'
                            ? [colors.primary, colors.purple]
                            : ['rgba(168, 85, 247, 0.10)', 'rgba(124, 58, 237, 0.08)', 'rgba(79, 70, 229, 0.06)']
                        }
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        fallbackColor={msg.role === 'user' ? colors.primary : colors.surfaceElevated}
                        style={[
                          styles.bubble,
                          msg.role === 'user' ? styles.bubbleMine : styles.bubbleAssistant,
                        ]}
                      >
                        <Text
                          style={[styles.bubbleText, msg.role === 'user' && styles.bubbleTextMine]}
                        >
                          {renderInlineMarkdown(msg.content, msg.id, styles)}
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
                      <Feather name="zap" size={16} color={colors.white} />
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
            </Animated.View>
          )}

            {hydrated && messages.length === 1 ? (
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
                        <Feather name={q.icon} size={16} color={colors.white} />
                      </OptionalLinearGradient>
                      <Text style={styles.suggestionText}>{q.text}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
          </ChatThreadRoot>
        <ChatComposer
          value={input}
          onChangeText={setInput}
          placeholder="Ask me anything..."
          onSend={() => void send()}
          sendDisabled={!hydrated || !input.trim() || typing}
          paddingHorizontal={16}
          androidKeyboardInset={Platform.OS === 'android' ? tabBarHeight : 0}
          returnKeyType="send"
          onSubmitEditing={() => void send()}
        />
      </KeyboardAvoidingView>

      <AppBottomSheet
        open={resetConfirmOpen}
        onClose={() => setResetConfirmOpen(false)}
        title="Reset AI Coach?"
        subtitle="This will delete your AI Coach chat history and saved memory for onboarding questions. This cannot be undone."
        footer={
          <AppConfirmActions
            intent="destructive"
            cancelLabel="Cancel"
            confirmLabel={resetPending ? 'Resetting...' : 'Reset'}
            onCancel={() => setResetConfirmOpen(false)}
            onConfirm={() => void performResetChat()}
            confirmLoading={resetPending}
          />
        }
      />
   </PageLayout>
  )
}

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
  screen: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    gap: 0,
  },
  resetIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.lg,
  },
  messages: {
    gap: 14,
  },
  hydrateLoader: {
    flex: 1,
    minHeight: 220,
    justifyContent: 'center',
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
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  bubbleTextMine: {
    color: colors.white,
    fontWeight: '600',
  },
  inlineBold: {
    fontWeight: '800',
  },
  inlineItalic: {
    fontStyle: 'italic',
  },
  time: {
    color: colors.textMuted,
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
    color: colors.textMuted,
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
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  unauthWrap: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  unauthBody: {
    color: colors.textMuted,
    lineHeight: 20,
  },
  signInBtn: {
    minHeight: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  signInText: {
    color: colors.white,
    fontWeight: '800',
  },
  })
