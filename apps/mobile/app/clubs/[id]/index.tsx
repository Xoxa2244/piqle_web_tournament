import { Feather } from '@expo/vector-icons'
import { useState } from 'react'
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams } from 'expo-router'
import { router } from 'expo-router'

import {
  ActionButton,
  EmptyState,
  InputField,
  LoadingBlock,
  Pill,
  SectionTitle,
  SurfaceCard,
} from '../../../src/components/ui'
import { TopBar } from '../../../src/components/navigation/TopBar'
import { OptionalLinearGradient } from '../../../src/components/OptionalLinearGradient'
import { buildWebUrl } from '../../../src/lib/config'
import { formatDateRange, formatDateTime, formatLocation } from '../../../src/lib/formatters'
import { trpc } from '../../../src/lib/trpc'
import { palette, radius, spacing } from '../../../src/lib/theme'
import { useAuth } from '../../../src/providers/AuthProvider'

const formatTournamentFormat = (format: string) => {
  switch (format) {
    case 'SINGLE_ELIMINATION':
      return 'Single Elimination'
    case 'ROUND_ROBIN':
      return 'Round Robin'
    case 'MLP':
      return 'MLP'
    case 'INDY_LEAGUE':
      return 'Indy League'
    case 'LEAGUE_ROUND_ROBIN':
      return 'League Round Robin'
    case 'ONE_DAY_LADDER':
      return 'One Day Ladder'
    case 'LADDER_LEAGUE':
      return 'Ladder League'
    default:
      return format.replace(/_/g, ' ')
  }
}

export default function ClubDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>()
  const clubId = params.id
  const { token } = useAuth()
  const isAuthenticated = Boolean(token)
  const utils = trpc.useUtils()
  const [tab, setTab] = useState<'feed' | 'events' | 'members'>('feed')
  const [membersSearch, setMembersSearch] = useState('')

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
  const createAnnouncement = trpc.club.createAnnouncement.useMutation({
    onSuccess: async () => {
      await utils.club.get.invalidate({ id: clubId })
    },
  })
  const updateAnnouncement = trpc.club.updateAnnouncement.useMutation({
    onSuccess: async () => {
      await utils.club.get.invalidate({ id: clubId })
    },
  })
  const deleteAnnouncement = trpc.club.deleteAnnouncement.useMutation({
    onSuccess: async () => {
      await utils.club.get.invalidate({ id: clubId })
    },
  })
  const approveJoinRequest = trpc.club.approveJoinRequest.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.club.get.invalidate({ id: clubId }),
        utils.club.listMembers.invalidate({ clubId }),
      ])
    },
  })
  const rejectJoinRequest = trpc.club.rejectJoinRequest.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.club.get.invalidate({ id: clubId }),
        utils.club.listMembers.invalidate({ clubId }),
      ])
    },
  })

  const [showNewPostForm, setShowNewPostForm] = useState(false)
  const [announcementForm, setAnnouncementForm] = useState({ title: '', body: '' })
  const [editingAnnouncementId, setEditingAnnouncementId] = useState<string | null>(null)
  const [editingAnnouncementForm, setEditingAnnouncementForm] = useState({ title: '', body: '' })

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

  const Segment = () => (
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
  )

  const Hero = () => (
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
              onPress={() =>
                router.push({
                  pathname: '/chats/club/[clubId]',
                  params: { clubId: club.id, name: club.name },
                })
              }
          style={({ pressed }) => [styles.heroIconButton, pressed && styles.heroIconButtonPressed]}
        >
              <Feather name="message-circle" size={18} color={palette.white} />
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
  )

  if (tab === 'members') {
    const allMembers = (membersQuery.data?.members ?? []) as any[]
    const joinRequests = (membersQuery.data?.joinRequests ?? []) as any[]
    const canModerate = Boolean(membersQuery.data?.canModerate)
    const q = membersSearch.trim().toLowerCase()
    const members = q
      ? allMembers.filter((m) => {
          const name = String(m?.user?.name ?? '').toLowerCase()
          const email = String(m?.user?.emailMasked ?? '').toLowerCase()
          return name.includes(q) || email.includes(q)
        })
      : allMembers

    const formatJoined = (joinedAt: any) => {
      try {
        const d = new Date(joinedAt)
        if (Number.isNaN(d.getTime())) return null
        return `Joined ${d.toLocaleString('en-US', { month: 'short', year: 'numeric' })}`
      } catch {
        return null
      }
    }
    const formatRelative = (dateLike: any) => {
      try {
        const d = new Date(dateLike)
        if (Number.isNaN(d.getTime())) return null
        const diffMs = Date.now() - d.getTime()
        const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
        if (days <= 0) return 'today'
        if (days === 1) return '1 day ago'
        return `${days} days ago`
      } catch {
        return null
      }
    }

    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <TopBar />
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Hero />
          <Segment />
          <View style={styles.membersSearchWrap}>
            <InputField
              value={membersSearch}
              onChangeText={setMembersSearch}
              placeholder="Search members..."
              autoCapitalize="none"
              containerStyle={styles.membersSearch}
              left={<Feather name="search" size={18} color={palette.textMuted} />}
            />
          </View>

          {canModerate && joinRequests.length > 0 ? (
            <View style={styles.pendingWrap}>
              <View style={styles.pendingHeaderRow}>
                <Text style={styles.pendingHeaderTitle}>Pending Requests</Text>
                <View style={styles.pendingCountPill}>
                  <Text style={styles.pendingCountText}>{joinRequests.length}</Text>
                </View>
              </View>

              <View style={styles.pendingList}>
                {joinRequests.map((req: any) => {
                  const when = formatRelative(req.requestedAt) ?? ''
                  return (
                    <SurfaceCard key={req.userId} padded={false} style={styles.pendingCard}>
                      <View style={styles.pendingCardTopRow}>
                        <View style={styles.pendingLeftRow}>
                          <View style={styles.pendingAvatar}>
                            {req.user?.image ? (
                              <Image source={{ uri: req.user.image }} style={styles.pendingAvatarImage} />
                            ) : (
                              <Text style={styles.pendingAvatarText}>
                                {(req.user?.name || req.user?.emailMasked || '?')
                                  .split(/\s+/)
                                  .filter(Boolean)
                                  .slice(0, 2)
                                  .map((p: string) => p[0]?.toUpperCase())
                                  .join('')}
                              </Text>
                            )}
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.pendingName} numberOfLines={1}>
                              {req.user?.name || 'User'}
                            </Text>
                            {when ? (
                              <Text style={styles.pendingWhen} numberOfLines={1}>
                                {when}
                              </Text>
                            ) : null}
                          </View>
                        </View>

                        <View style={styles.pendingActionsInline}>
                          <Pressable
                            onPress={() => approveJoinRequest.mutate({ clubId, userId: req.userId })}
                            disabled={approveJoinRequest.isPending}
                            style={({ pressed }) => [
                              styles.pendingIconBtn,
                              styles.pendingIconBtnApprove,
                              pressed && styles.pendingBtnPressed,
                            ]}
                            hitSlop={10}
                          >
                            <Feather name="check" size={18} color={palette.white} />
                          </Pressable>
                          <Pressable
                            onPress={() => rejectJoinRequest.mutate({ clubId, userId: req.userId })}
                            disabled={rejectJoinRequest.isPending}
                            style={({ pressed }) => [
                              styles.pendingIconBtn,
                              styles.pendingIconBtnReject,
                              pressed && styles.pendingBtnPressed,
                            ]}
                            hitSlop={10}
                          >
                            <Feather name="x" size={18} color={palette.danger} />
                          </Pressable>
                        </View>
                      </View>
                    </SurfaceCard>
                  )
                })}
              </View>
            </View>
          ) : null}

          {!canViewMembers ? (
            <EmptyState
              title="Members are private"
              body="Join this club to view the members list."
            />
          ) : membersQuery.isLoading ? (
            <LoadingBlock label="Loading members…" />
          ) : (
            <View style={styles.membersWrap}>
              <View style={styles.membersHeaderRow}>
                <Text style={styles.membersHeaderTitle}>Members</Text>
                <Text style={styles.membersHeaderCount}>{`${allMembers.length} total`}</Text>
              </View>

              <View style={styles.membersList}>
                {members.map((member: any) => {
                  const joined = formatJoined(member.joinedAt)
                  const secondary = joined || null
                  const role = String(member.role ?? '').toUpperCase()
                  const isOwner = role === 'OWNER'
                  const roleBadge =
                    role === 'OWNER'
                      ? { label: 'owner', icon: 'crown' as const, bg: 'rgba(255, 193, 7, 0.16)', border: 'rgba(255, 193, 7, 0.28)', fg: '#a06b00' }
                      : role
                      ? { label: 'admin', icon: 'shield' as const, bg: 'rgba(47, 107, 255, 0.12)', border: 'rgba(47, 107, 255, 0.22)', fg: '#2F6BFF' }
                      : null
                  return (
                    <SurfaceCard
                      key={member.userId}
                      padded={false}
                      style={[styles.memberCard, isOwner && styles.memberCardOwner]}
                    >
                      <View style={styles.memberCardRow}>
                        <View style={styles.memberAvatar}>
                          {member.user?.image ? (
                            <Image source={{ uri: member.user.image }} style={styles.memberAvatarImage} />
                          ) : (
                            <Text style={styles.memberAvatarText}>
                              {(member.user?.name || member.user?.emailMasked || 'M')
                                .split(/\s+/)
                                .filter(Boolean)
                                .slice(0, 2)
                                .map((p: string) => p[0]?.toUpperCase())
                                .join('')}
                            </Text>
                          )}
                        </View>

                        <View style={styles.memberMain}>
                          <View style={styles.memberTopRow}>
                            <Text style={styles.memberName} numberOfLines={1}>
                              {member.user?.name || 'Member'}
                            </Text>
                            {roleBadge ? (
                              <View style={[styles.rolePill, { backgroundColor: roleBadge.bg, borderColor: roleBadge.border }]}>
                                <Feather name={roleBadge.icon} size={14} color={roleBadge.fg} />
                                <Text style={[styles.rolePillText, { color: roleBadge.fg }]}>{roleBadge.label}</Text>
                              </View>
                            ) : null}
                          </View>
                          {secondary ? (
                            <Text style={styles.memberMetaText} numberOfLines={1}>
                              {secondary}
                            </Text>
                          ) : null}
                        </View>

                        <Pressable
                          onPress={() => {}}
                          hitSlop={10}
                          style={({ pressed }) => [styles.kebabBtn, pressed && styles.kebabBtnPressed]}
                        >
                          <Feather name="more-vertical" size={18} color={palette.textMuted} />
                        </Pressable>
                      </View>
                    </SurfaceCard>
                  )
                })}
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <TopBar />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Hero />

        <Segment />

        {tab === 'feed' ? (
          <View style={styles.tabContent}>
            {club.isAdmin ? (
              showNewPostForm ? (
                <SurfaceCard tone="soft" style={styles.card}>
                  <Text style={styles.postFormLabel}>Post announcement</Text>
                  <InputField
                    value={announcementForm.title}
                    onChangeText={(v) => setAnnouncementForm((p) => ({ ...p, title: v }))}
                    placeholder="Title (optional)"
                    containerStyle={styles.postFormField}
                  />
                  <InputField
                    value={announcementForm.body}
                    onChangeText={(v) => setAnnouncementForm((p) => ({ ...p, body: v }))}
                    placeholder="Message *"
                    multiline
                    containerStyle={styles.postFormField}
                  />
                  <View style={styles.postFormActions}>
                    <Pressable
                      onPress={() => {
                        setShowNewPostForm(false)
                        setAnnouncementForm({ title: '', body: '' })
                      }}
                      style={({ pressed }) => [styles.postFormButton, styles.postFormButtonSecondary, pressed && styles.postFormButtonPressed]}
                    >
                      <Text style={styles.postFormButtonSecondaryText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        if (!announcementForm.body.trim()) return
                        createAnnouncement.mutate(
                          { clubId, title: announcementForm.title.trim() || undefined, body: announcementForm.body.trim() },
                          {
                            onSuccess: () => {
                              setAnnouncementForm({ title: '', body: '' })
                              setShowNewPostForm(false)
                            },
                          }
                        )
                      }}
                      disabled={createAnnouncement.isPending || !announcementForm.body.trim()}
                      style={({ pressed }) => [styles.postFormButton, pressed && styles.postFormButtonPressed]}
                    >
                      <Text style={styles.postFormButtonText}>
                        {createAnnouncement.isPending ? 'Posting…' : 'Post'}
                      </Text>
                    </Pressable>
                  </View>
                </SurfaceCard>
              ) : (
                <Pressable
                  onPress={() => setShowNewPostForm(true)}
                  style={({ pressed }) => [styles.createPostButton, pressed && styles.createPostButtonPressed]}
                >
                  <Feather name="plus" size={20} color={palette.primary} />
                  <Text style={styles.createPostButtonText}>Create new post</Text>
                </Pressable>
              )
            ) : null}
            {club.announcements.length > 0 ? (
              <View style={{ gap: 12 }}>
                {club.announcements.map((announcement) => (
                  <SurfaceCard key={announcement.id} tone="soft" style={styles.card}>
                    {editingAnnouncementId === announcement.id && club.isAdmin ? (
                      <View style={styles.editForm}>
                        <InputField
                          value={editingAnnouncementForm.title}
                          onChangeText={(v) => setEditingAnnouncementForm((p) => ({ ...p, title: v }))}
                          placeholder="Title (optional)"
                          containerStyle={styles.postFormField}
                        />
                        <InputField
                          value={editingAnnouncementForm.body}
                          onChangeText={(v) => setEditingAnnouncementForm((p) => ({ ...p, body: v }))}
                          placeholder="Message *"
                          multiline
                          containerStyle={styles.postFormField}
                        />
                        <View style={styles.editFormActions}>
                          <Pressable
                            onPress={() => {
                              setEditingAnnouncementId(null)
                              setEditingAnnouncementForm({ title: '', body: '' })
                            }}
                            style={({ pressed }) => [styles.editFormBtn, styles.editFormBtnCancel, pressed && styles.editFormBtnPressed]}
                          >
                            <Text style={styles.editFormBtnCancelText}>Cancel</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => {
                              if (!editingAnnouncementForm.body.trim()) return
                              updateAnnouncement.mutate(
                                {
                                  clubId,
                                  announcementId: announcement.id,
                                  title: editingAnnouncementForm.title.trim() || undefined,
                                  body: editingAnnouncementForm.body.trim(),
                                },
                                {
                                  onSuccess: () => {
                                    setEditingAnnouncementId(null)
                                    setEditingAnnouncementForm({ title: '', body: '' })
                                  },
                                }
                              )
                            }}
                            disabled={updateAnnouncement.isPending || !editingAnnouncementForm.body.trim()}
                            style={({ pressed }) => [styles.editFormBtn, styles.editFormBtnSave, pressed && styles.editFormBtnPressed]}
                          >
                            <Text style={styles.editFormBtnSaveText}>
                              {updateAnnouncement.isPending ? 'Saving…' : 'Save'}
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      <>
                        {announcement.title ? (
                          <Text style={styles.announcementTitle}>{announcement.title}</Text>
                        ) : null}
                        <Text style={styles.body}>{announcement.body}</Text>
                        <View style={styles.announcementMetaRow}>
                          <Text style={styles.smallMeta}>
                            Posted {formatDateTime(announcement.createdAt)}
                            {announcement.createdByUser?.name ? ` · ${announcement.createdByUser.name}` : ''}
                          </Text>
                          {club.isAdmin ? (
                            <View style={styles.announcementActions}>
                              <Pressable
                                onPress={() => {
                                  setEditingAnnouncementId(announcement.id)
                                  setEditingAnnouncementForm({ title: announcement.title ?? '', body: announcement.body })
                                }}
                                style={({ pressed }) => [styles.announcementActionBtn, pressed && styles.announcementActionBtnPressed]}
                              >
                                <Feather name="edit-2" size={16} color={palette.primary} />
                              </Pressable>
                              <Pressable
                                onPress={() => {
                                  Alert.alert(
                                    'Delete announcement?',
                                    'This announcement will be permanently removed.',
                                    [
                                      { text: 'Cancel', style: 'cancel' },
                                      {
                                        text: 'Delete',
                                        style: 'destructive',
                                        onPress: () => {
                                          deleteAnnouncement.mutate(
                                            { clubId, announcementId: announcement.id },
                                            {
                                              onSuccess: () => {
                                                if (editingAnnouncementId === announcement.id) {
                                                  setEditingAnnouncementId(null)
                                                  setEditingAnnouncementForm({ title: '', body: '' })
                                                }
                                              },
                                            }
                                          )
                                        },
                                      },
                                    ]
                                  )
                                }}
                                disabled={deleteAnnouncement.isPending}
                                style={({ pressed }) => [styles.announcementActionBtn, pressed && styles.announcementActionBtnPressed]}
                              >
                                <Feather name="trash-2" size={16} color={palette.danger} />
                              </Pressable>
                            </View>
                          ) : null}
                        </View>
                      </>
                    )}
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

            <View style={{ gap: 12 }}>
              <SectionTitle
                title="Upcoming tournaments"
                action={
                  <Pressable onPress={() => router.push(`/clubs/${club.id}/events`)}>
                    <Text style={styles.viewAll}>View all</Text>
                  </Pressable>
                }
              />
              {club.tournaments.length > 0 ? (
                club.tournaments.slice(0, 5).map((tournament) => (
                  <Pressable
                    key={tournament.id}
                    onPress={() => router.push(`/tournaments/${tournament.id}`)}
                    style={({ pressed }) => [pressed && { opacity: 0.9 }]}
                  >
                    <SurfaceCard style={styles.eventCard}>
                      <View style={styles.eventRow}>
                        <View style={styles.eventIcon}>
                          <Feather name="award" size={20} color={palette.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={styles.eventTopRow}>
                            <Text style={styles.eventTitle} numberOfLines={1}>
                              {tournament.title}
                            </Text>
                            <View style={styles.eventStatusBadges}>
                              <Pill label="Open" tone="success" />
                            </View>
                          </View>
                          <View style={styles.eventMetaRow}>
                            <Feather name="calendar" size={14} color={palette.textMuted} />
                            <Text style={styles.eventMeta}>
                              {formatDateRange(tournament.startDate, tournament.endDate)}
                            </Text>
                          </View>
                          <View style={styles.eventMetaRow}>
                            <Feather name="map-pin" size={14} color={palette.textMuted} />
                            <Text numberOfLines={1} style={styles.eventMeta}>
                              {formatLocation([club.city, club.state]) || 'Location not set'}
                            </Text>
                          </View>
                          {tournament.format ? (
                            <View style={styles.badgeRow}>
                              <Pill label={formatTournamentFormat(tournament.format)} />
                            </View>
                          ) : null}
                        </View>
                      </View>
                    </SurfaceCard>
                  </Pressable>
                ))
              ) : (
                <SurfaceCard tone="soft" style={styles.card}>
                  <Text style={styles.smallMeta}>No upcoming events yet.</Text>
                </SurfaceCard>
              )}
            </View>
          </View>
        ) : null}

        {tab === 'members' ? null : null}
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
  membersSearch: {
    borderRadius: 999,
    minHeight: 56,
    paddingHorizontal: 18,
    borderColor: 'transparent',
    backgroundColor: palette.surfaceElevated,
  },
  membersSearchWrap: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  pendingWrap: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: 12,
  },
  pendingHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pendingHeaderTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  pendingCountPill: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.chip,
  },
  pendingCountText: {
    color: palette.chipText,
    fontWeight: '800',
    fontSize: 12,
  },
  pendingList: {
    gap: 12,
  },
  pendingCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: palette.surface,
    shadowOpacity: 0,
    elevation: 0,
    padding: spacing.md,
  },
  pendingCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  pendingLeftRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  pendingAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: palette.surfaceMuted,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingAvatarImage: {
    width: '100%',
    height: '100%',
  },
  pendingAvatarText: {
    color: palette.text,
    fontWeight: '800',
    fontSize: 14,
  },
  pendingName: {
    color: palette.text,
    fontWeight: '800',
    fontSize: 16,
  },
  pendingWhen: {
    marginTop: 4,
    color: palette.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  pendingActionsInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pendingIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingBtnPressed: {
    opacity: 0.9,
  },
  pendingIconBtnApprove: {
    backgroundColor: palette.primary,
  },
  pendingIconBtnReject: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: 'rgba(255, 0, 110, 0.28)',
  },
  membersWrap: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: 12,
  },
  membersHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  membersHeaderTitle: {
    color: palette.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  membersHeaderCount: {
    color: palette.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  membersList: {
    gap: 10,
  },
  memberCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: palette.surface,
    shadowOpacity: 0,
    elevation: 0,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  memberCardOwner: {
    borderColor: palette.primary,
  },
  memberCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  memberMain: {
    flex: 1,
    minWidth: 0,
  },
  memberTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.brandPrimaryBorder,
    backgroundColor: palette.brandPrimaryTint,
  },
  rolePillText: {
    color: palette.primary,
    fontWeight: '800',
    fontSize: 12,
    textTransform: 'lowercase',
  },
  memberMetaText: {
    marginTop: 6,
    color: palette.textMuted,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  kebabBtn: {
    padding: 6,
    borderRadius: 10,
  },
  kebabBtnPressed: {
    opacity: 0.85,
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
    fontSize: 20,
    marginBottom: spacing.sm,
  },
  smallMeta: {
    marginTop: spacing.sm,
    color: palette.textMuted,
    fontSize: 12,
  },
  postFormLabel: {
    color: palette.text,
    fontWeight: '700',
    fontSize: 15,
    marginBottom: spacing.sm,
  },
  postFormField: {
    marginBottom: spacing.sm,
  },
  postFormActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: spacing.sm,
  },
  postFormButton: {
    flex: 1,
    backgroundColor: palette.primary,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  postFormButtonSecondary: {
    backgroundColor: palette.surfaceMuted,
  },
  postFormButtonPressed: {
    opacity: 0.9,
  },
  postFormButtonText: {
    color: palette.white,
    fontWeight: '700',
    fontSize: 15,
  },
  postFormButtonSecondaryText: {
    color: palette.text,
    fontWeight: '600',
    fontSize: 15,
  },
  createPostButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.brandPrimaryBorder,
    backgroundColor: palette.brandPrimaryTint,
  },
  createPostButtonPressed: {
    opacity: 0.9,
  },
  createPostButtonText: {
    color: palette.primary,
    fontWeight: '700',
    fontSize: 15,
  },
  editForm: {
    gap: 0,
  },
  editFormActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: spacing.sm,
  },
  editFormBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  editFormBtnCancel: {
    backgroundColor: palette.surfaceMuted,
  },
  editFormBtnSave: {
    backgroundColor: palette.primary,
  },
  editFormBtnPressed: {
    opacity: 0.9,
  },
  editFormBtnCancelText: {
    color: palette.text,
    fontWeight: '600',
    fontSize: 14,
  },
  editFormBtnSaveText: {
    color: palette.white,
    fontWeight: '700',
    fontSize: 14,
  },
  announcementMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    gap: 8,
  },
  announcementActions: {
    flexDirection: 'row',
    gap: 6,
  },
  announcementActionBtn: {
    padding: 6,
  },
  announcementActionBtnPressed: {
    opacity: 0.8,
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
  eventCard: {
    marginBottom: 0,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  eventIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.brandPrimaryTint,
    borderWidth: 1,
    borderColor: palette.brandPrimaryBorder,
  },
  eventTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  eventTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  eventStatusBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 8,
  },
  eventMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  eventMeta: {
    color: palette.textMuted,
    fontSize: 13,
    flex: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: spacing.sm,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  memberAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  memberAvatarImage: {
    width: '100%',
    height: '100%',
  },
  memberAvatarText: {
    color: palette.white,
    fontWeight: '800',
    fontSize: 14,
  },
  memberName: {
    color: palette.text,
    fontWeight: '800',
    fontSize: 17,
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
  memberActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  actionBtnPrimary: {
    backgroundColor: palette.primary,
  },
  actionBtnSecondary: {
    backgroundColor: palette.surfaceMuted,
  },
  actionBtnDanger: {
    backgroundColor: palette.dangerSoft,
  },
  actionBtnPressed: {
    opacity: 0.9,
  },
  actionBtnPrimaryText: {
    color: palette.white,
    fontWeight: '700',
    fontSize: 13,
  },
  actionBtnSecondaryText: {
    color: palette.text,
    fontWeight: '600',
    fontSize: 13,
  },
  actionBtnDangerText: {
    color: palette.danger,
    fontWeight: '700',
    fontSize: 13,
  },
  banReason: {
    marginTop: 4,
    fontSize: 12,
    color: palette.textMuted,
  },
})
