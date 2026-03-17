import { Feather } from '@expo/vector-icons'
import { useState } from 'react'
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams } from 'expo-router'
import { router } from 'expo-router'

import {
  ActionButton,
  EmptyState,
  LoadingBlock,
  Pill,
  SectionTitle,
  SurfaceCard,
} from '../../../src/components/ui'
import { TopBar } from '../../../src/components/navigation/TopBar'
import { OptionalLinearGradient } from '../../../src/components/OptionalLinearGradient'
import { buildWebUrl } from '../../../src/lib/config'
import { formatDateTime, formatLocation } from '../../../src/lib/formatters'
import { trpc } from '../../../src/lib/trpc'
import { palette, spacing } from '../../../src/lib/theme'
import { useAuth } from '../../../src/providers/AuthProvider'

export default function ClubDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>()
  const clubId = params.id
  const { token } = useAuth()
  const isAuthenticated = Boolean(token)
  const utils = trpc.useUtils()
  const [tab, setTab] = useState<'feed' | 'events' | 'members'>('feed')

  const clubQuery = trpc.club.get.useQuery({ id: clubId }, { enabled: Boolean(clubId) })
  const club = clubQuery.data
  const canViewMembers = Boolean(
    club && isAuthenticated && (club.isFollowing || club.isAdmin)
  )
  const membersQuery = trpc.club.listMembers.useQuery(
    { clubId },
    { enabled: Boolean(clubId) && canViewMembers }
  )
  const toggleFollow = trpc.club.toggleFollow.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.club.get.invalidate({ id: clubId }), utils.club.list.invalidate()])
    },
  })
  const cancelJoinRequest = trpc.club.cancelJoinRequest.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.club.get.invalidate({ id: clubId }), utils.club.list.invalidate()])
    },
  })

  if (clubQuery.isLoading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <TopBar />
        <View style={styles.loadingWrap}>
          <LoadingBlock label="Loading club…" />
        </View>
      </SafeAreaView>
    )
  }

  if (!clubQuery.data) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <TopBar />
        <View style={styles.loadingWrap}>
          <EmptyState title="Club not found" body="This club could not be loaded." />
        </View>
      </SafeAreaView>
    )
  }

  const heroSubtitle = `${formatLocation([club.city, club.state])}  ·  ${club.followersCount} members`

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <TopBar />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          {club.logoUrl ? (
            <Image source={{ uri: club.logoUrl }} style={styles.heroImage} />
          ) : (
            <OptionalLinearGradient
              colors={[palette.surfaceMuted, palette.surfaceElevated, 'rgba(10,10,10,0.06)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroImage}
            />
          )}
          <View style={styles.heroOverlay} />

          <View style={styles.heroTopActions}>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [styles.heroIconButton, pressed && styles.heroIconButtonPressed]}
            >
              <Feather name="arrow-left" size={18} color={palette.white} />
            </Pressable>
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={() => Linking.openURL(buildWebUrl(`/clubs/${club.id}`))}
              style={({ pressed }) => [styles.heroIconButton, pressed && styles.heroIconButtonPressed]}
            >
              <Feather name="bell" size={18} color={palette.white} />
            </Pressable>
            <Pressable
              onPress={() => Linking.openURL(buildWebUrl(`/clubs/${club.id}`))}
              style={({ pressed }) => [styles.heroIconButton, pressed && styles.heroIconButtonPressed]}
            >
              <Feather name="share-2" size={18} color={palette.white} />
            </Pressable>
          </View>

          <View style={styles.heroBottom}>
            <Text style={styles.heroTitle}>{club.name}</Text>
            <View style={styles.heroMetaRow}>
              <Feather name="map-pin" size={14} color="rgba(255,255,255,0.82)" />
              <Text style={styles.heroMetaText}>{heroSubtitle}</Text>
            </View>
          </View>
        </View>

        <View style={styles.segment}>
          {([
            { key: 'feed', label: 'Feed' },
            { key: 'events', label: 'Events' },
            { key: 'members', label: 'Members' },
          ] as const).map((item) => {
            const active = tab === item.key
            return (
              <Pressable
                key={item.key}
                onPress={() => setTab(item.key)}
                style={[styles.segmentItem, active && styles.segmentItemActive]}
              >
                <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>
                  {item.label}
                </Text>
              </Pressable>
            )
          })}
        </View>

        {tab === 'feed' ? (
          <View style={styles.tabContent}>
            {club.announcements.length > 0 ? (
              <View style={{ gap: 12 }}>
                {club.announcements.map((announcement) => (
                  <SurfaceCard key={announcement.id} tone="soft" style={styles.card}>
                    {announcement.title ? (
                      <Text style={styles.announcementTitle}>{announcement.title}</Text>
                    ) : null}
                    <Text style={styles.body}>{announcement.body}</Text>
                    <Text style={styles.smallMeta}>
                      Posted {formatDateTime(announcement.createdAt)}
                      {announcement.createdByUser?.name ? ` · ${announcement.createdByUser.name}` : ''}
                    </Text>
                  </SurfaceCard>
                ))}
              </View>
            ) : (
              <SurfaceCard tone="soft" style={styles.emptyShell}>
                <View style={styles.emptyIcon}>
                  <Feather name="calendar" size={28} color={palette.textMuted} />
                </View>
                <Text style={styles.emptyTitle}>Welcome to the Club!</Text>
                <Text style={styles.emptyBody}>Stay updated with announcements and events</Text>
                {(club.isFollowing || club.isAdmin) ? (
                  <View style={{ marginTop: spacing.md }}>
                    <ActionButton
                      label="Join Club Chat"
                      onPress={() =>
                        router.push({
                          pathname: '/chats/club/[clubId]',
                          params: { clubId: club.id, name: club.name },
                        })
                      }
                    />
                  </View>
                ) : null}
              </SurfaceCard>
            )}
          </View>
        ) : null}

        {tab === 'events' ? (
          <View style={styles.tabContent}>
            <SurfaceCard tone="soft" style={styles.card}>
              <SectionTitle
                title="Calendar"
                subtitle="Upcoming club events"
              />
              <View style={styles.calendarStub}>
                <Feather name="calendar" size={20} color={palette.primary} />
                <Text style={styles.calendarStubText}>Calendar view coming next.</Text>
              </View>
            </SurfaceCard>

            <SurfaceCard tone="soft" style={styles.card}>
              <SectionTitle
                title="Upcoming tournaments"
                action={
                  <Pressable onPress={() => router.push(`/clubs/${club.id}/events`)}>
                    <Text style={styles.viewAll}>View all</Text>
                  </Pressable>
                }
              />
              {club.tournaments.length > 0 ? (
                <View style={{ gap: 10, marginTop: spacing.sm }}>
                  {club.tournaments.slice(0, 5).map((tournament) => (
                    <Pressable
                      key={tournament.id}
                      onPress={() => router.push(`/tournaments/${tournament.id}`)}
                      style={({ pressed }) => [styles.eventRow, pressed && styles.eventRowPressed]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.eventTitle} numberOfLines={1}>
                          {tournament.title}
                        </Text>
                        <Text style={styles.smallMeta}>
                          {formatDateTime(tournament.startDate)} · {tournament.format}
                        </Text>
                      </View>
                      <Feather name="chevron-right" size={18} color={palette.textMuted} />
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Text style={styles.smallMeta}>No upcoming events yet.</Text>
              )}
            </SurfaceCard>
          </View>
        ) : null}

        {tab === 'members' ? (
          <View style={styles.tabContent}>
            {!canViewMembers ? (
              <EmptyState
                title="Members are private"
                body="Join this club to view the members list."
              />
            ) : membersQuery.isLoading ? (
              <LoadingBlock label="Loading members…" />
            ) : (
              <SurfaceCard tone="soft" style={styles.card}>
                <SectionTitle title="Members" subtitle={`${club.followersCount} total`} />
                <View style={{ marginTop: spacing.sm, gap: 10 }}>
                  {(membersQuery.data?.members ?? []).map((member: any) => (
                    <View key={member.userId} style={styles.memberRow}>
                      <View style={styles.memberAvatar}>
                        <Text style={styles.memberAvatarText}>
                          {(member.user?.name || member.user?.emailMasked || 'M')
                            .split(/\s+/)
                            .filter(Boolean)
                            .slice(0, 2)
                            .map((p: string) => p[0]?.toUpperCase())
                            .join('')}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.memberName} numberOfLines={1}>
                          {member.user?.name || 'Member'}
                        </Text>
                        {member.user?.emailMasked ? (
                          <Text style={styles.smallMeta} numberOfLines={1}>
                            {member.user.emailMasked}
                          </Text>
                        ) : null}
                      </View>
                      {member.role ? (
                        <View style={styles.adminPill}>
                          <Text style={styles.adminPillText}>Admin</Text>
                        </View>
                      ) : null}
                    </View>
                  ))}
                </View>
              </SurfaceCard>
            )}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.background,
  },
  content: {
    paddingBottom: spacing.xxl,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  hero: {
    height: 240,
    position: 'relative',
    backgroundColor: palette.surfaceMuted,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,10,10,0.35)',
  },
  heroTopActions: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  heroIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10,10,10,0.45)',
  },
  heroIconButtonPressed: {
    opacity: 0.86,
  },
  heroBottom: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
  },
  heroTitle: {
    color: palette.white,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  heroMetaRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroMetaText: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 14,
    fontWeight: '600',
  },
  segment: {
    marginTop: spacing.md,
    marginHorizontal: spacing.lg,
    flexDirection: 'row',
    backgroundColor: palette.surfaceMuted,
    borderRadius: 999,
    padding: 4,
    gap: 4,
  },
  segmentItem: {
    flex: 1,
    minHeight: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentItemActive: {
    backgroundColor: palette.surface,
  },
  segmentLabel: {
    color: palette.textMuted,
    fontWeight: '600',
  },
  segmentLabelActive: {
    color: palette.text,
  },
  tabContent: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: 12,
  },
  card: {
    borderRadius: 16,
    shadowOpacity: 0,
    elevation: 0,
  },
  body: {
    color: palette.text,
    lineHeight: 22,
  },
  announcementTitle: {
    color: palette.text,
    fontWeight: '700',
    fontSize: 16,
  },
  smallMeta: {
    marginTop: spacing.sm,
    color: palette.textMuted,
    fontSize: 12,
  },
  emptyShell: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: palette.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    color: palette.text,
    fontSize: 20,
    fontWeight: '800',
  },
  emptyBody: {
    marginTop: 6,
    color: palette.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  calendarStub: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  calendarStubText: {
    color: palette.textMuted,
    fontWeight: '600',
  },
  viewAll: {
    color: palette.primary,
    fontWeight: '700',
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  eventRowPressed: {
    opacity: 0.85,
  },
  eventTitle: {
    color: palette.text,
    fontWeight: '700',
    fontSize: 15,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarText: {
    color: palette.white,
    fontWeight: '800',
    fontSize: 13,
  },
  memberName: {
    color: palette.text,
    fontWeight: '700',
  },
  adminPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: palette.chip,
  },
  adminPillText: {
    color: palette.chipText,
    fontWeight: '800',
    fontSize: 12,
  },
})
