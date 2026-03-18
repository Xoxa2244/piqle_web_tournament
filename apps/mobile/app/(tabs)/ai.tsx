import { Feather } from '@expo/vector-icons'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'

import { ChatMessageBubble } from '../../src/components/ChatPreviewCard'
import { PageLayout } from '../../src/components/navigation/PageLayout'
import { ActionButton, InputField, SurfaceCard } from '../../src/components/ui'
import { trpc } from '../../src/lib/trpc'
import { palette, spacing } from '../../src/lib/theme'
import { useAuth } from '../../src/providers/AuthProvider'

type Message = {
  id: number
  role: 'user' | 'assistant'
  content: string
  time: string
}

const suggestedGoals = [
  "What's my goal? I want to get started.",
  'I want to lose weight / get fit with pickleball',
  'I want to improve my DUPR rating',
  'Find tournaments or clubs near me',
]

const WELCOME_MESSAGE =
  "Hi! I'm your Piqle AI Coach for pickleball.\n\nWhat's your main goal right now? For example: getting fit, improving your DUPR rating, finding tournaments, or just having more fun on the court. Tell me and we'll make a plan."

export default function AITab() {
  const { token } = useAuth()
  const isAuthenticated = Boolean(token)
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
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
          id: prev.length + 1,
          role: 'assistant',
          content: `Sorry, something went wrong: ${err.message}. Please try again.`,
          time: 'now',
        },
      ])
    },
  })

  const send = async () => {
    if (!input.trim() || chatMutation.isPending) return
    if (!isAuthenticated) {
      router.push('/sign-in')
      return
    }

    const userContent = input.trim()
    setMessages((prev) => [
      ...prev,
      { id: prev.length + 1, role: 'user', content: userContent, time: 'now' },
    ])
    setInput('')

    const history = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content }))
    history.push({ role: 'user' as const, content: userContent })

    try {
      const { content } = await chatMutation.mutateAsync({
        messages: history,
      })
      setMessages((prev) => [
        ...prev,
        { id: prev.length + 1, role: 'assistant', content, time: 'now' },
      ])
    } catch {
      // Error already handled in onError
    }
  }

  const typing = chatMutation.isPending

  if (!isAuthenticated) {
    return (
      <PageLayout>
        <SurfaceCard tone="soft">
          <Text style={styles.welcomeTitle}>Piqle AI Coach</Text>
          <Text style={styles.welcomeBody}>
            Sign in to chat with your pickleball coach. I can help with goals, DUPR, tournaments, and staying healthy on the court.
          </Text>
        </SurfaceCard>
        <ActionButton label="Sign in" onPress={() => router.push('/sign-in')} />
      </PageLayout>
    )
  }

  return (
    <PageLayout>
      <View style={styles.messages}>
        {messages.map((message) => (
          <View key={message.id} style={styles.messageRow}>
            {message.role === 'assistant' ? (
              <View style={styles.botAvatar}>
                <Feather name="zap" size={16} color={palette.white} />
              </View>
            ) : null}
            <ChatMessageBubble
              author={message.role === 'assistant' ? 'Piqle AI Coach' : 'You'}
              text={message.content}
              isMine={message.role === 'user'}
              createdAt={message.time}
            />
          </View>
        ))}

        {typing ? (
          <View style={styles.messageRow}>
            <View style={styles.botAvatar}>
              <Feather name="zap" size={16} color={palette.white} />
            </View>
            <SurfaceCard tone="soft">
              <Text style={styles.typing}>Piqle AI Coach is typing…</Text>
            </SurfaceCard>
          </View>
        ) : null}
      </View>

      {messages.length === 1 ? (
        <View style={{ gap: 10 }}>
          <Text style={styles.suggestionsLabel}>What&apos;s your goal?</Text>
          {suggestedGoals.map((goal) => (
            <SurfaceCard key={goal} tone="soft">
              <ActionButton label={goal} variant="ghost" onPress={() => setInput(goal)} />
            </SurfaceCard>
          ))}
        </View>
      ) : null}

      <SurfaceCard tone="soft">
        <InputField value={input} onChangeText={setInput} placeholder="Ask your coach…" />
        <View style={{ marginTop: spacing.md }}>
          <ActionButton
            label="Send"
            onPress={send}
            disabled={!input.trim() || chatMutation.isPending}
            loading={chatMutation.isPending}
          />
        </View>
      </SurfaceCard>
    </PageLayout>
  )
}

const styles = StyleSheet.create({
  messages: {
    gap: spacing.md,
  },
  messageRow: {
    gap: 8,
  },
  botAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7c3aed',
  },
  typing: {
    color: palette.textMuted,
    fontSize: 14,
  },
  suggestionsLabel: {
    fontSize: 12,
    color: palette.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  welcomeTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: palette.text,
  },
  welcomeBody: {
    marginTop: 8,
    fontSize: 14,
    color: palette.textMuted,
    lineHeight: 20,
  },
})
