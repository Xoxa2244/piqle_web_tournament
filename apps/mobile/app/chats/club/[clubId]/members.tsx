import { router, useLocalSearchParams } from 'expo-router'
import { useMemo } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'

import { PageLayout } from '../../../../src/components/navigation/PageLayout'
import { RemoteUserAvatar } from '../../../../src/components/RemoteUserAvatar'
import { EmptyState, SurfaceCard } from '../../../../src/components/ui'
import { spacing, type ThemePalette } from '../../../../src/lib/theme'
import { trpc } from '../../../../src/lib/trpc'
import { useAppTheme } from '../../../../src/providers/ThemeProvider'

export default function ClubChatMembersScreen() {
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const params = useLocalSearchParams<{ clubId: string; name?: string }>()
  const clubId = params.clubId
  const title = params.name || 'Chat members'
  const membersQuery = trpc.club.listMembers.useQuery({ clubId }, { enabled: Boolean(clubId) })

  const members = useMemo(() => ((membersQuery.data?.members ?? []) as any[]), [membersQuery.data?.members])

  return (
    <PageLayout topBarTitle={title} topBarRightSlot={null} contentStyle={styles.content}>
      {membersQuery.isLoading ? (
        <SurfaceCard>
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading members...</Text>
          </View>
        </SurfaceCard>
      ) : null}

      {!membersQuery.isLoading && members.length === 0 ? (
        <EmptyState title="No members found" body="Chat members will appear here." />
      ) : null}

      {members.map((member: any) => (
        <SurfaceCard key={String(member.userId)}>
          <Pressable
            onPress={() => router.push({ pathname: '/profile/[id]', params: { id: member.userId } })}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <View style={styles.identity}>
              <RemoteUserAvatar
                uri={member.user?.image}
                size={48}
                fallback="initials"
                initialsLabel={member.user?.name ?? 'Member'}
              />
              <View style={styles.copy}>
                <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                  {member.user?.name || 'Member'}
                </Text>
                <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
                  {String(member.role ?? '').trim() ? String(member.role).toUpperCase() : 'Club member'}
                </Text>
              </View>
            </View>
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
      opacity: 0.92,
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
      gap: 3,
    },
    name: {
      fontSize: 16,
      fontWeight: '700',
    },
    meta: {
      fontSize: 13,
      fontWeight: '500',
    },
  })
