import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { FeedbackRatingModal } from '../src/components/FeedbackRatingModal'
import { PageLayout } from '../src/components/navigation/PageLayout'
import { EmptyState, LoadingBlock, SurfaceCard } from '../src/components/ui'
import { spacing, type ThemePalette } from '../src/lib/theme'
import { trpc } from '../src/lib/trpc'
import { useAuth } from '../src/providers/AuthProvider'
import { useAppTheme } from '../src/providers/ThemeProvider'

type FeedbackEntityType = 'TOURNAMENT' | 'CLUB' | 'TD' | 'APP'

export default function NotificationsScreen() {
  const { token } = useAuth()
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const isAuthenticated = Boolean(token)
  const [activePrompt, setActivePrompt] = useState<{
    entityType: FeedbackEntityType
    entityId: string
    title: string
    subtitle: string
  } | null>(null)
  const notificationsQuery = trpc.notification.list.useQuery({ limit: 40 }, { enabled: isAuthenticated })

  const items = useMemo(() => (notificationsQuery.data?.items ?? []) as any[], [notificationsQuery.data?.items])

  const openTarget = (targetUrl?: string) => {
    if (!targetUrl) return
    if (targetUrl.startsWith('/')) {
      router.push(targetUrl as never)
    }
  }

  const onNotificationPress = (item: any) => {
    if (item.type === 'FEEDBACK_PROMPT') {
      setActivePrompt({
        entityType: item.entityType,
        entityId: item.entityId,
        title:
          item.entityType === 'TOURNAMENT'
            ? 'Rate this tournament'
            : item.entityType === 'CLUB'
            ? 'Rate this club'
            : item.entityType === 'TD'
            ? 'Rate tournament director'
            : 'Rate app experience',
        subtitle: item.body || 'Your feedback helps improve the experience.',
      })
      return
    }
    openTarget(item.targetUrl)
  }

  return (
    <PageLayout>
      <View style={styles.page}>
        {!isAuthenticated ? <EmptyState title="Sign in required" body="Sign in to view your notifications." /> : null}
        {isAuthenticated && notificationsQuery.isLoading ? <LoadingBlock label="Loading notifications..." /> : null}
        {isAuthenticated && !notificationsQuery.isLoading && items.length === 0 ? (
          <EmptyState title="No notifications yet" body="New invitations and feedback prompts will appear here." />
        ) : null}

        {items.map((item) => (
          <Pressable key={item.id} onPress={() => onNotificationPress(item)}>
            <SurfaceCard style={styles.itemCard}>
              <View style={styles.itemHead}>
                <View style={styles.itemIcon}>
                  <Feather
                    name={item.type === 'FEEDBACK_PROMPT' ? 'star' : item.type === 'TOURNAMENT_INVITATION' ? 'mail' : 'bell'}
                    size={16}
                    color={colors.white}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  <Text style={styles.itemBody}>{item.body}</Text>
                </View>
              </View>
            </SurfaceCard>
          </Pressable>
        ))}
      </View>

      <FeedbackRatingModal
        open={Boolean(activePrompt)}
        onClose={() => setActivePrompt(null)}
        entityType={(activePrompt?.entityType ?? 'APP') as FeedbackEntityType}
        entityId={activePrompt?.entityId ?? 'GLOBAL'}
        title={activePrompt?.title ?? 'Rate'}
        subtitle={activePrompt?.subtitle ?? ''}
        onSubmitted={() => {
          void notificationsQuery.refetch()
        }}
      />
    </PageLayout>
  )
}

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
  page: { gap: spacing.md },
  itemCard: { padding: spacing.md },
  itemHead: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  itemIcon: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  itemBody: { marginTop: 4, color: colors.textMuted, fontSize: 13, lineHeight: 18 },
})
