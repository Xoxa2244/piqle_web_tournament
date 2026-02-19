import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AppBackground } from '../components/AppBackground'
import { Badge } from '../components/Badge'
import { chatThreads, type ChatThread } from '../data/mockData'
import { colors } from '../theme/colors'
import { spacing } from '../theme/spacing'
import { fetchEventChatThreads } from '../api/mobileData'

export function ChatsScreen() {
  const [threads, setThreads] = useState<ChatThread[]>(chatThreads)
  const [dataSource, setDataSource] = useState<'live' | 'fallback'>('fallback')

  useEffect(() => {
    let mounted = true
    fetchEventChatThreads().then((result) => {
      if (!mounted) return
      setThreads(result.data)
      setDataSource(result.source)
    })
    return () => {
      mounted = false
    }
  }, [])

  return (
    <AppBackground>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.title}>Chats</Text>
            <Text style={styles.subtitle}>Clubs and tournaments in one inbox</Text>
            <View style={styles.sourceRow}>
              <Badge label={dataSource === 'live' ? 'Live data' : 'Demo data'} tone={dataSource === 'live' ? 'success' : 'warning'} />
            </View>
          </View>

          {threads.map((thread) => (
            <Pressable key={thread.id} style={({ pressed }) => [styles.threadCard, pressed && styles.pressed]}>
              <View style={styles.threadTop}>
                <Text style={styles.threadTitle}>{thread.title}</Text>
                <Badge label={thread.kind} tone={thread.kind === 'CLUB' ? 'success' : 'info'} />
              </View>
              <Text style={styles.threadMessage}>{thread.lastMessage}</Text>
              <View style={styles.threadBottom}>
                <Text style={styles.threadTime}>{thread.updatedAtLabel}</Text>
                {thread.unread > 0 ? <Badge label={`${thread.unread} unread`} tone="warning" /> : null}
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>
    </AppBackground>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  header: {
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.ink,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 14,
    color: colors.muted,
  },
  sourceRow: {
    marginTop: spacing.xs,
    flexDirection: 'row',
  },
  threadCard: {
    borderRadius: 16,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: '#FFFFFFCC',
    gap: spacing.xs,
  },
  pressed: {
    opacity: 0.86,
  },
  threadTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  threadTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
  },
  threadMessage: {
    fontSize: 14,
    color: colors.ink,
    lineHeight: 20,
  },
  threadBottom: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  threadTime: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
})
