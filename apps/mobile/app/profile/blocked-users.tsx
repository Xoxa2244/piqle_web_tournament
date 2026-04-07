import { Feather } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useMemo } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'

import { EmptyState, SurfaceCard } from '../../src/components/ui'
import { PageLayout } from '../../src/components/navigation/PageLayout'
import { RemoteUserAvatar } from '../../src/components/RemoteUserAvatar'
import { spacing, type ThemePalette } from '../../src/lib/theme'
import { trpc } from '../../src/lib/trpc'
import { useAppTheme } from '../../src/providers/ThemeProvider'
import { useToast } from '../../src/providers/ToastProvider'

export default function BlockedUsersScreen() {
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const toast = useToast()
  const blockedUsersQuery = trpc.user.listBlockedUsers.useQuery(undefined)
  useFocusEffect(
    useCallback(() => {
        void blockedUsersQuery.refetch()
      return undefined
    }, [blockedUsersQuery])
  )
  const unblockUser = trpc.user.unblockUser.useMutation({
    onSuccess: async () => {
      await blockedUsersQuery.refetch()
      toast.success('User unblocked.')
    },
    onError: (error: any) => toast.error(error?.message || 'Failed to unblock user.'),
  })

  return (
    <PageLayout topBarTitle="Blacklist" topBarRightSlot={null} contentStyle={styles.content}>
      {blockedUsersQuery.isLoading ? (
        <SurfaceCard>
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading blocked users...</Text>
          </View>
        </SurfaceCard>
      ) : null}

      {!blockedUsersQuery.isLoading && !blockedUsersQuery.data?.length ? (
        <EmptyState title="Blacklist is empty" body="Blocked users will appear here." />
      ) : null}

      {(blockedUsersQuery.data ?? []).map((blockedUser: any) => (
        <SurfaceCard key={blockedUser.id}>
          <Pressable
            onPress={() => router.push({ pathname: '/profile/[id]', params: { id: blockedUser.id } })}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <View style={styles.identity}>
              <RemoteUserAvatar
                uri={blockedUser.image}
                size={48}
                fallback="initials"
                initialsLabel={blockedUser.name ?? 'Player'}
              />
              <View style={styles.copy}>
                <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                  {blockedUser.name ?? 'Player'}
                </Text>
                <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
                  {blockedUser.city?.trim() || 'Location hidden'}
                </Text>
              </View>
            </View>

            <Pressable
              hitSlop={8}
              onPress={() => unblockUser.mutate({ userId: blockedUser.id })}
              disabled={unblockUser.isPending}
              style={({ pressed }) => [
                styles.unblockButton,
                { borderColor: colors.border, backgroundColor: colors.surfaceMuted },
                pressed && styles.unblockButtonPressed,
              ]}
            >
              <Feather name="unlock" size={18} color={colors.text} />
            </Pressable>
          </Pressable>
        </SurfaceCard>
      ))}
    </PageLayout>
  )
}

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
    content: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xxl,
      gap: spacing.md,
    },
    loadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    loadingText: {
      fontSize: 14,
      fontWeight: '600',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    rowPressed: {
      opacity: 0.9,
    },
    identity: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minWidth: 0,
    },
    copy: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    name: {
      fontSize: 16,
      fontWeight: '700',
    },
    meta: {
      fontSize: 13,
      fontWeight: '500',
    },
    unblockButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    unblockButtonPressed: {
      opacity: 0.88,
    },
  })
