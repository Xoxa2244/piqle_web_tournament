import { Feather, MaterialIcons } from '@expo/vector-icons'
import { useCallback, useMemo, useState } from 'react'
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native'
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
  SegmentedControl,
  SurfaceCard,
} from '../../../src/components/ui'
import { AppBottomSheet, AppConfirmActions } from '../../../src/components/AppBottomSheet'
import { FeedbackRatingModal } from '../../../src/components/FeedbackRatingModal'
import { PickleRefreshScrollView } from '../../../src/components/PickleRefreshScrollView'
import { RemoteUserAvatar } from '../../../src/components/RemoteUserAvatar'
import { TopBar } from '../../../src/components/navigation/TopBar'
import { OptionalLinearGradient } from '../../../src/components/OptionalLinearGradient'
import { buildWebUrl, FEEDBACK_API_ENABLED } from '../../../src/lib/config'
import { formatDateRange, formatDateTime, formatLocation } from '../../../src/lib/formatters'
import { trpc } from '../../../src/lib/trpc'
import { radius, spacing, type ThemePalette } from '../../../src/lib/theme'
import { useAuth } from '../../../src/providers/AuthProvider'
import { useAppTheme } from '../../../src/providers/ThemeProvider'
import { usePullToRefresh } from '../../../src/hooks/usePullToRefresh'

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
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
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
    onSuccess: () => {
      void Promise.all([
        utils.club.get.invalidate({ id: clubId as string }),
        utils.club.list.invalidate(),
        utils.club.listMyChatClubs.invalidate(),
      ])
    },
  })
  const cancelJoinRequest = trpc.club.cancelJoinRequest.useMutation({
    onSuccess: () => {
      void Promise.all([
        utils.club.get.invalidate({ id: clubId as string }),
        utils.club.list.invalidate(),
      ])
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
  const [leaveClubSheetOpen, setLeaveClubSheetOpen] = useState(false)
  const [announcementToDelete, setAnnouncementToDelete] = useState<string | null>(null)
  const [clubFeedbackOpen, setClubFeedbackOpen] = useState(false)
  const [clubFeedbackInfoOpen, setClubFeedbackInfoOpen] = useState(false)

  const onRefreshClubDetail = useCallback(async () => {
    const tasks: Array<Promise<unknown>> = [clubQuery.refetch()]
    if (canViewMembers) {
      tasks.push(membersQuery.refetch())
    }
    await Promise.all(tasks)
  }, [clubQuery, membersQuery, canViewMembers])

  const pullToRefresh = usePullToRefresh(onRefreshClubDetail)
  const feedbackSummaryQuery = trpc.feedback.getEntitySummary.useQuery(
    { entityType: 'CLUB', entityId: clubId },
    { enabled: FEEDBACK_API_ENABLED && Boolean(clubId) && isAuthenticated, retry: false },
  )
  const hasRatedQuery = trpc.feedback.hasRated.useQuery(
    { targets: [{ entityType: 'CLUB', entityId: clubId }] },
    { enabled: FEEDBACK_API_ENABLED && Boolean(clubId) && isAuthenticated, retry: false },
  )
  const hasRatedClub = Boolean(hasRatedQuery.data?.map?.[`CLUB:${clubId}`])

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
  const feedbackAverage = feedbackSummaryQuery.data?.averageRating
  const feedbackTotal = feedbackSummaryQuery.data?.total ?? 0
  const feedbackCanPublish = Boolean(feedbackSummaryQuery.data?.canPublish)
  const fallbackSeed = String(clubId)
    .split('')
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  const feedbackAverageEffective =
    feedbackAverage ??
    (__DEV__ ? Number((3.8 + (fallbackSeed % 13) / 20).toFixed(1)) : null)
  const feedbackTotalEffective =
    feedbackTotal > 0
      ? feedbackTotal
      : __DEV__
      ? 5 + (fallbackSeed % 21)
      : 0
  const feedbackCanPublishEffective = feedbackCanPublish || (__DEV__ && feedbackTotalEffective >= 5)

  const Segment = () => (
    <SegmentedControl
      value={tab}
      onChange={setTab}
      trackStyle={styles.segmentTrack}
      options={[
        { value: 'feed', label: 'Feed' },
        { value: 'events', label: 'Events' },
        { value: 'members', label: 'Members' },
      ]}
    />
  )

  const Hero = () => (
    <View style={styles.hero}>
      {club.logoUrl ? (
        <Image source={{ uri: club.logoUrl }} style={styles.heroImage} />
      ) : (
        <OptionalLinearGradient
          colors={[colors.surfaceMuted, colors.surfaceElevated, 'rgba(10,10,10,0.06)']}
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
          <Feather name="arrow-left" size={18} color={colors.white} />
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
              <Feather name="message-circle" size={18} color={colors.white} />
        </Pressable>
        <Pressable
          onPress={() => Linking.openURL(buildWebUrl(`/clubs/${club.id}`))}
          style={({ pressed }) => [styles.heroIconButton, pressed && styles.heroIconButtonPressed]}
        >
          <Feather name="share-2" size={18} color={colors.white} />
        </Pressable>
        {isAuthenticated && club.isFollowing && !club.isAdmin ? (
          <Pressable
            onPress={() => setLeaveClubSheetOpen(true)}
            style={({ pressed }) => [styles.heroIconButton, pressed && styles.heroIconButtonPressed]}
            accessibilityLabel="Leave club"
          >
            <Feather name="log-out" size={18} color={colors.white} />
          </Pressable>
        ) : null}
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

  const MembershipActions = () => {
    const id = String(clubId ?? '')
    if (!id) return null
    if (isAuthenticated && club.isFollowing && !club.isAdmin) {
      return null
    }
    return (
      <View style={styles.membershipRow}>
        {!isAuthenticated ? (
          <ActionButton label="Sign in to join" variant="secondary" onPress={() => router.push('/sign-in')} />
        ) : club.isAdmin ? (
          <Text style={styles.membershipHint}>You manage this club</Text>
        ) : club.isJoinPending ? (
          <ActionButton
            label="Cancel join request"
            variant="secondary"
            loading={cancelJoinRequest.isPending}
            onPress={() => cancelJoinRequest.mutate({ clubId: id })}
          />
        ) : (
          <ActionButton
            label={club.joinPolicy === 'APPROVAL' ? 'Request to join' : 'Join club'}
            loading={toggleFollow.isPending}
            onPress={() => toggleFollow.mutate({ clubId: id })}
          />
        )}
      </View>
    )
  }

  const FeedbackBlock = () => (
    <SurfaceCard tone="soft" style={styles.feedbackCard}>
      <View style={styles.feedbackHeadRow}>
        <View style={styles.feedbackLeft}>
          <MaterialIcons name="star" size={18} color="#F4B000" />
          {feedbackCanPublishEffective && feedbackAverageEffective ? (
            <Text style={styles.feedbackValue}>{feedbackAverageEffective.toFixed(1)}</Text>
          ) : (
            <Text style={styles.feedbackValueMuted}>No rating yet</Text>
          )}
          {feedbackCanPublishEffective ? null : <Text style={styles.feedbackCount}>min 5 ratings</Text>}
        </View>
        <Pressable onPress={() => setClubFeedbackInfoOpen(true)} style={({ pressed }) => [styles.feedbackInfoBtn, pressed && styles.feedbackInfoBtnPressed]}>
          <Text style={styles.feedbackInfoBtnText}>Details</Text>
        </Pressable>
      </View>
      {!hasRatedClub ? (
        <Pressable onPress={() => setClubFeedbackOpen(true)} style={({ pressed }) => [styles.feedbackRateBtn, pressed && styles.feedbackRateBtnPressed]}>
          <Text style={styles.feedbackRateBtnText}>Rate this club</Text>
        </Pressable>
      ) : (
        <Text style={styles.feedbackThanksText}>Thanks, you already rated this club.</Text>
      )}
    </SurfaceCard>
  )

  const clubSheets = (
    <>
      <AppBottomSheet
        open={leaveClubSheetOpen}
        onClose={() => setLeaveClubSheetOpen(false)}
        title="Leave club?"
        subtitle="You will lose access to club chat and members-only content until you join again."
        footer={
          <AppConfirmActions
            intent="destructive"
            cancelLabel="Cancel"
            confirmLabel="Leave club"
            onCancel={() => setLeaveClubSheetOpen(false)}
            onConfirm={() => {
              const cid = String(clubId ?? '')
              if (!cid) return
              toggleFollow.mutate(
                { clubId: cid },
                {
                  onSuccess: () => setLeaveClubSheetOpen(false),
                }
              )
            }}
            confirmLoading={toggleFollow.isPending}
          />
        }
      />
      <AppBottomSheet
        open={Boolean(announcementToDelete)}
        onClose={() => setAnnouncementToDelete(null)}
        title="Delete announcement?"
        subtitle="This announcement will be permanently removed."
        footer={
          <AppConfirmActions
            intent="destructive"
            cancelLabel="Cancel"
            confirmLabel="Delete"
            onCancel={() => setAnnouncementToDelete(null)}
            onConfirm={() => {
              const aid = announcementToDelete
              if (!aid) return
              deleteAnnouncement.mutate(
                { clubId, announcementId: aid },
                {
                  onSuccess: () => {
                    setAnnouncementToDelete(null)
                    if (editingAnnouncementId === aid) {
                      setEditingAnnouncementId(null)
                      setEditingAnnouncementForm({ title: '', body: '' })
                    }
                  },
                }
              )
            }}
            confirmLoading={deleteAnnouncement.isPending}
          />
        }
      />
    </>
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
        <PickleRefreshScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshing={pullToRefresh.refreshing}
          onRefresh={pullToRefresh.onRefresh}
          bounces
        >
          <Hero />
          <Segment />
          <MembershipActions />
          <FeedbackBlock />
          <View style={styles.membersSearchWrap}>
            <InputField
              value={membersSearch}
              onChangeText={setMembersSearch}
              placeholder="Search members..."
              autoCapitalize="none"
              containerStyle={styles.membersSearch}
              left={<Feather name="search" size={18} color={colors.textMuted} />}
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
                          <Pressable
                            disabled={!req.userId}
                            onPress={() => {
                              if (!req.userId) return
                              router.push({ pathname: '/profile/[id]', params: { id: req.userId } })
                            }}
                            style={({ pressed }) => [pressed && req.userId && styles.avatarPress]}
                          >
                            <RemoteUserAvatar uri={req.user?.image} size={52} />
                          </Pressable>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Pressable
                              disabled={!req.userId}
                              onPress={() => {
                                if (!req.userId) return
                                router.push({ pathname: '/profile/[id]', params: { id: req.userId } })
                              }}
                              hitSlop={8}
                              style={({ pressed }) => [pressed && req.userId && styles.namePress]}
                            >
                              <Text style={styles.pendingName} numberOfLines={1}>
                                {req.user?.name || 'User'}
                              </Text>
                            </Pressable>
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
                            <Feather name="check" size={18} color={colors.white} />
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
                            <Feather name="x" size={18} color={colors.danger} />
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
                        <Pressable
                          disabled={!member.userId}
                          onPress={() => {
                            if (!member.userId) return
                            router.push({ pathname: '/profile/[id]', params: { id: member.userId } })
                          }}
                          style={({ pressed }) => [pressed && member.userId && styles.avatarPress]}
                        >
                          <RemoteUserAvatar uri={member.user?.image} size={56} />
                        </Pressable>

                        <View style={styles.memberMain}>
                          <View style={styles.memberTopRow}>
                            <Pressable
                              disabled={!member.userId}
                              onPress={() => {
                                if (!member.userId) return
                                router.push({ pathname: '/profile/[id]', params: { id: member.userId } })
                              }}
                              hitSlop={8}
                              style={({ pressed }) => [pressed && member.userId && styles.namePress]}
                            >
                              <Text style={styles.memberName} numberOfLines={1}>
                                {member.user?.name || 'Member'}
                              </Text>
                            </Pressable>
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
                          <Feather name="more-vertical" size={18} color={colors.textMuted} />
                        </Pressable>
                      </View>
                    </SurfaceCard>
                  )
                })}
              </View>
            </View>
          )}
        </PickleRefreshScrollView>
        {clubSheets}
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <TopBar />
      <PickleRefreshScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshing={pullToRefresh.refreshing}
        onRefresh={pullToRefresh.onRefresh}
        bounces
      >
        <Hero />

        <Segment />
        <MembershipActions />
        <FeedbackBlock />

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
                  <Feather name="plus" size={20} color={colors.primary} />
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
                                <Feather name="edit-2" size={16} color={colors.primary} />
                              </Pressable>
                              <Pressable
                                onPress={() => setAnnouncementToDelete(announcement.id)}
                                disabled={deleteAnnouncement.isPending}
                                style={({ pressed }) => [styles.announcementActionBtn, pressed && styles.announcementActionBtnPressed]}
                              >
                                <Feather name="trash-2" size={16} color={colors.danger} />
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
                  <Feather name="calendar" size={28} color={colors.textMuted} />
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
                <Feather name="calendar" size={20} color={colors.primary} />
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
                          <Feather name="award" size={20} color={colors.primary} />
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
                            <Feather name="calendar" size={14} color={colors.textMuted} />
                            <Text style={styles.eventMeta}>
                              {formatDateRange(tournament.startDate, tournament.endDate)}
                            </Text>
                          </View>
                          <View style={styles.eventMetaRow}>
                            <Feather name="map-pin" size={14} color={colors.textMuted} />
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
      </PickleRefreshScrollView>
      <FeedbackRatingModal
        open={clubFeedbackOpen}
        onClose={() => setClubFeedbackOpen(false)}
        entityType="CLUB"
        entityId={clubId}
        title="Rate this club"
        subtitle="Your feedback helps improve club experience."
        onSubmitted={() => {
          void Promise.all([feedbackSummaryQuery.refetch(), hasRatedQuery.refetch()])
        }}
      />
      <AppBottomSheet
        open={clubFeedbackInfoOpen}
        onClose={() => setClubFeedbackInfoOpen(false)}
        title="Club rating"
        subtitle={
          feedbackCanPublishEffective && feedbackAverageEffective
            ? `Average ${feedbackAverageEffective.toFixed(1)}`
            : `No public rating yet. Need at least 5 ratings.`
        }
      >
        <View style={styles.feedbackChipsWrap}>
          {(feedbackSummaryQuery.data?.topChips ?? []).length > 0 || __DEV__ ? (
            (feedbackSummaryQuery.data?.topChips?.length
              ? feedbackSummaryQuery.data!.topChips
              : [
                  { label: 'Great atmosphere', count: 9 },
                  { label: 'Regular events', count: 8 },
                  { label: 'Helpful support', count: 6 },
                ]
            ).map((chip) => (
              <View key={chip.label} style={styles.feedbackChip}>
                <Text style={styles.feedbackChipText}>{chip.label}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.feedbackEmptyText}>Not enough public data yet.</Text>
          )}
        </View>
      </AppBottomSheet>
      {clubSheets}
    </SafeAreaView>
  )
}

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: spacing.xxl,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  feedbackCard: {
    marginTop: spacing.sm,
    marginHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  feedbackHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  feedbackLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(10,10,10,0.08)',
    borderRadius: 9999,
    backgroundColor: 'rgba(10,10,10,0.03)',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  feedbackValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  feedbackValueMuted: {
    color: colors.textMuted,
    fontSize: 16,
    fontWeight: '600',
  },
  feedbackCount: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  feedbackInfoBtn: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  feedbackInfoBtnPressed: {
    opacity: 0.85,
  },
  feedbackInfoBtnText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 13,
  },
  feedbackRateBtn: {
    minHeight: 42,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  feedbackRateBtnPressed: {
    opacity: 0.9,
  },
  feedbackRateBtnText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  feedbackThanksText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  feedbackChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: spacing.xs,
  },
  feedbackChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: '#9CD9A3',
    backgroundColor: '#E8F7EB',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  feedbackChipText: {
    color: '#1E7A32',
    fontSize: 13,
    fontWeight: '600',
  },
  feedbackChipCount: {
    color: '#2E8B42',
    fontSize: 12,
    fontWeight: '700',
  },
  feedbackEmptyText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  hero: {
    height: 240,
    position: 'relative',
    backgroundColor: colors.surfaceMuted,
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
    color: colors.white,
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
  segmentTrack: {
    marginTop: spacing.md,
    marginHorizontal: spacing.lg,
  },
  membershipRow: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  membershipHint: {
    color: colors.textMuted,
    fontSize: 14,
    paddingVertical: spacing.sm,
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
    backgroundColor: colors.surfaceElevated,
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
    color: colors.text,
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
    backgroundColor: colors.chip,
  },
  pendingCountText: {
    color: colors.chipText,
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
    backgroundColor: colors.surface,
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
  pendingName: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 16,
  },
  pendingWhen: {
    marginTop: 4,
    color: colors.textMuted,
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
    backgroundColor: colors.primary,
  },
  pendingIconBtnReject: {
    backgroundColor: colors.surface,
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
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  membersHeaderCount: {
    color: colors.textMuted,
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
    backgroundColor: colors.surface,
    shadowOpacity: 0,
    elevation: 0,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  memberCardOwner: {
    borderColor: colors.primary,
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
    borderColor: colors.brandPrimaryBorder,
    backgroundColor: colors.brandPrimaryTint,
  },
  rolePillText: {
    color: colors.primary,
    fontWeight: '800',
    fontSize: 12,
    textTransform: 'lowercase',
  },
  memberMetaText: {
    marginTop: 6,
    color: colors.textMuted,
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
  avatarPress: {
    opacity: 0.82,
  },
  namePress: {
    opacity: 0.84,
  },
  card: {
    borderRadius: 16,
    shadowOpacity: 0,
    elevation: 0,
  },
  body: {
    color: colors.text,
    lineHeight: 22,
  },
  announcementTitle: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 20,
    marginBottom: spacing.sm,
  },
  smallMeta: {
    marginTop: spacing.sm,
    color: colors.textMuted,
    fontSize: 12,
  },
  postFormLabel: {
    color: colors.text,
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
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  postFormButtonSecondary: {
    backgroundColor: colors.surfaceMuted,
  },
  postFormButtonPressed: {
    opacity: 0.9,
  },
  postFormButtonText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 15,
  },
  postFormButtonSecondaryText: {
    color: colors.text,
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
    borderColor: colors.brandPrimaryBorder,
    backgroundColor: colors.brandPrimaryTint,
  },
  createPostButtonPressed: {
    opacity: 0.9,
  },
  createPostButtonText: {
    color: colors.primary,
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
    backgroundColor: colors.surfaceMuted,
  },
  editFormBtnSave: {
    backgroundColor: colors.primary,
  },
  editFormBtnPressed: {
    opacity: 0.9,
  },
  editFormBtnCancelText: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 14,
  },
  editFormBtnSaveText: {
    color: colors.white,
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
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  emptyBody: {
    marginTop: 6,
    color: colors.textMuted,
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
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  calendarStubText: {
    color: colors.textMuted,
    fontWeight: '600',
  },
  viewAll: {
    color: colors.primary,
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
    backgroundColor: colors.brandPrimaryTint,
    borderWidth: 1,
    borderColor: colors.brandPrimaryBorder,
  },
  eventTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  eventTitle: {
    color: colors.text,
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
    color: colors.textMuted,
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
  memberName: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 17,
  },
  adminPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.chip,
  },
  adminPillText: {
    color: colors.chipText,
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
    backgroundColor: colors.primary,
  },
  actionBtnSecondary: {
    backgroundColor: colors.surfaceMuted,
  },
  actionBtnDanger: {
    backgroundColor: colors.dangerSoft,
  },
  actionBtnPressed: {
    opacity: 0.9,
  },
  actionBtnPrimaryText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 13,
  },
  actionBtnSecondaryText: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 13,
  },
  actionBtnDangerText: {
    color: colors.danger,
    fontWeight: '700',
    fontSize: 13,
  },
  banReason: {
    marginTop: 4,
    fontSize: 12,
    color: colors.textMuted,
  },
  })

