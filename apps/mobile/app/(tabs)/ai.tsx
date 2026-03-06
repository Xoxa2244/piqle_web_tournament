import { Feather } from '@expo/vector-icons'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { ChatMessageBubble } from '../../src/components/ChatPreviewCard'
import { PageLayout } from '../../src/components/navigation/PageLayout'
import { ActionButton, InputField, SurfaceCard } from '../../src/components/ui'
import { palette, spacing } from '../../src/lib/theme'

type Message = {
  id: number
  role: 'user' | 'assistant'
  content: string
  time: string
}

const suggestedQuestions = [
  'How do I register for a tournament?',
  'What are pickleball scoring rules?',
  'Tips for improving my game',
]

const getAIResponse = (question: string) => {
  const lowerQ = question.toLowerCase()

  if (lowerQ.includes('register')) {
    return 'Open a tournament, tap Register, choose a division, and complete payment if the event is paid.'
  }

  if (lowerQ.includes('rule') || lowerQ.includes('score')) {
    return 'Games usually go to 11, win by 2. Only the serving side scores, and the two-bounce rule applies before volleys.'
  }

  if (lowerQ.includes('tip') || lowerQ.includes('improv')) {
    return 'Focus on placement over power, get comfortable at the kitchen line, and build consistency on your third shot drops.'
  }

  return 'I can help with tournaments, clubs, chats, registration flow, and basic pickleball questions. Ask me anything.'
}

export default function AITab() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      role: 'assistant',
      content:
        "Hi! I'm your Piqle AI Assistant.\n\nI can help with tournaments, clubs, rules, and registration flow.",
      time: 'now',
    },
  ])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)

  const send = () => {
    if (!input.trim()) return

    const question = input.trim()
    setMessages((prev) => [
      ...prev,
      { id: prev.length + 1, role: 'user', content: question, time: 'now' },
    ])
    setInput('')
    setTyping(true)

    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { id: prev.length + 1, role: 'assistant', content: getAIResponse(question), time: 'now' },
      ])
      setTyping(false)
    }, 700)
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
              author={message.role === 'assistant' ? 'Piqle AI' : 'You'}
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
              <Text style={styles.typing}>Piqle AI is typing…</Text>
            </SurfaceCard>
          </View>
        ) : null}
      </View>

      {messages.length === 1 ? (
        <View style={{ gap: 10 }}>
          <Text style={styles.suggestionsLabel}>Suggested questions</Text>
          {suggestedQuestions.map((question) => (
            <SurfaceCard key={question} tone="soft">
              <ActionButton label={question} variant="ghost" onPress={() => setInput(question)} />
            </SurfaceCard>
          ))}
        </View>
      ) : null}

      <SurfaceCard tone="soft">
        <InputField value={input} onChangeText={setInput} placeholder="Ask me anything…" />
        <View style={{ marginTop: spacing.md }}>
          <ActionButton label="Send" onPress={send} />
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
})
