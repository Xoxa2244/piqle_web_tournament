import * as Clipboard from 'expo-clipboard'
import * as Haptics from 'expo-haptics'
import { Feather } from '@expo/vector-icons'
import QRCode from 'react-native-qrcode-svg'
import { useCallback, useEffect, useState } from 'react'
import { Alert, Linking, Pressable, Share, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams } from 'expo-router'
import { router } from 'expo-router'

import {
  ActionButton,
  EmptyState,
  InputField,
  LoadingBlock,
  Pill,
  SearchField,
  SectionTitle,
  SegmentedControl,
  SurfaceCard,
} from '../../../src/components/ui'
import { AppBottomSheet, AppConfirmActions } from '../../../src/components/AppBottomSheet'
import { ClubTournamentCard } from '../../../src/components/ClubTournamentCard'
import { EntityImage } from '../../../src/components/EntityImage'
import { FeedbackEntityContextCard } from '../../../src/components/FeedbackEntityContextCard'
import { FeedbackRatingModal } from '../../../src/components/FeedbackRatingModal'
import { RatingStarIcon } from '../../../src/components/icons/RatingStarIcon'
import { PickleRefreshScrollView } from '../../../src/components/PickleRefreshScrollView'
import { RemoteUserAvatar } from '../../../src/components/RemoteUserAvatar'
import { BackCircleButton } from '../../../src/components/navigation/BackCircleButton'
import { TopBar } from '../../../src/components/navigation/TopBar'
import { OptionalLinearGradient } from '../../../src/components/OptionalLinearGradient'
import { buildWebUrl, FEEDBACK_API_ENABLED } from '../../../src/lib/config'
import { formatDateTime, formatLocation } from '../../../src/lib/formatters'
import { trpc } from '../../../src/lib/trpc'
import { palette, radius, spacing } from '../../../src/lib/theme'
import { useAuth } from '../../../src/providers/AuthProvider'
import { usePullToRefresh } from '../../../src/hooks/usePullToRefresh'

export default function ClubDetailScreen() {
  const params = useLocalSearchParams<{ id: string; tab?: string }>()
  const clubId = params.id
  const { token, user } = useAuth()
  const isAuthenticated = Boolean(token)
  const utils = trpc.useUtils()
  const [tab, setTab] = useState<'feed' | 'events' | 'members'>('events')
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
  const myChatClubsQuery = trpc.club.listMyChatClubs.useQuery(undefined, { enabled: isAuthenticated })
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
  const kickMember = trpc.club.kickMember.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.club.get.invalidate({ id: clubId }),
        utils.club.listMembers.invalidate({ clubId }),
      ])
    },
  })
  const banUser = trpc.club.banUser.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.club.get.invalidate({ id: clubId }),
        utils.club.listMembers.invalidate({ clubId }),
      ])
    },
  })
  const unbanUser = trpc.club.unbanUser.useMutation({
    onSuccess: async () => {
      await utils.club.listMembers.invalidate({ clubId })
    },
  })
  const markClubJoinRequestSeen = trpc.notification.markClubJoinRequestSeen.useMutation({
    onSuccess: async () => {
      await utils.notification.list.invalidate()
    },
  })

  const [showNewPostForm, setShowNewPostForm] = useState(false)
  const [announcementForm, setAnnouncementForm] = useState({ title: '', body: '' })
  const [editingAnnouncementId, setEditingAnnouncementId] = useState<string | null>(null)
  const [editingAnnouncementForm, setEditingAnnouncementForm] = useState({ title: '', body: '' })
  const [leaveClubSheetOpen, setLeaveClubSheetOpen] = useState(false)
  const [clubShareSheetOpen, setClubShareSheetOpen] = useState(false)
  const [announcementToDelete, setAnnouncementToDelete] = useState<string | null>(null)
  const [clubFeedbackOpen, setClubFeedbackOpen] = useState(false)
  const [clubFeedbackInfoOpen, setClubFeedbackInfoOpen] = useState(false)
  const [memberMenuTarget, setMemberMenuTarget] = useState<{ userId: string; name: string } | null>(null)
  const [bannedMenuTarget, setBannedMenuTarget] = useState<{ userId: string; name: string } | null>(null)
  const [kickTarget, setKickTarget] = useState<{ userId: string; name: string } | null>(null)
  const [banTarget, setBanTarget] = useState<{ userId: string; name: string } | null>(null)
  const [unbanTarget, setUnbanTarget] = useState<{ userId: string; name: string } | null>(null)
  const [banReason, setBanReason] = useState('')
  const [clubDescriptionExpanded, setClubDescriptionExpanded] = useState(false)
  const [clubDescriptionExpandable, setClubDescriptionExpandable] = useState(false)

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
  const activeChatClub = myChatClubsQuery.data?.find((item: any) => item.id === club?.id) as any
  const unreadClubChatCount = Number(activeChatClub?.unreadCount ?? 0)
  const pendingJoinRequestCount = Number(membersQuery.data?.joinRequests?.length ?? 0)
  const canLeaveClub = Boolean(isAuthenticated && club?.isFollowing && !club?.isAdmin)
  const clubInviteUrl = buildWebUrl(`/clubs/${String(clubId ?? '')}?ref=invite`)
  const clubDescription = String(club?.description ?? '').trim()
  const bookingUrlRaw = String(club?.courtReserveUrl ?? '').trim()
  const bookingUrl =
    bookingUrlRaw && !/^https?:\/\//i.test(bookingUrlRaw) ? `https://${bookingUrlRaw}` : bookingUrlRaw
  const canBook = Boolean(bookingUrl)

  useEffect(() => {
    const nextTab = params.tab
    if (nextTab === 'members' || nextTab === 'feed' || nextTab === 'events') {
      setTab(nextTab)
    }
  }, [params.tab])

  useEffect(() => {
    if (tab !== 'members' || !club?.isAdmin || !clubId) return
    void markClubJoinRequestSeen.mutateAsync({ clubId }).catch(() => undefined)
  }, [tab, club?.isAdmin, clubId])

  useEffect(() => {
    setClubDescriptionExpanded(false)
    setClubDescriptionExpandable(false)
  }, [clubId, clubDescription])

  const playTopBarTapHaptic = useCallback(async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    } catch {
      // ignore unsupported haptics
    }
  }, [])

  const runTopBarAction = useCallback(
    async (action: () => void | Promise<void>) => {
      await playTopBarTapHaptic()
      await action()
    },
    [playTopBarTapHaptic]
  )

  const handleCopyInviteLink = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(clubInviteUrl)
      try {
        await Haptics.selectionAsync()
      } catch {}
      Alert.alert('Copied', 'Invite link copied to clipboard.')
    } catch {
      Alert.alert('Copy failed', 'Please copy it manually.')
    }
  }, [clubInviteUrl])

  const handleShareInvite = useCallback(async () => {
    try {
      await Share.share({
        title: club?.name ?? 'Club',
        message: `Join ${club?.name ?? 'this club'} on Piqle\n${clubInviteUrl}`,
        url: clubInviteUrl,
      })
    } catch {
      // Share dismissal should stay silent; copy is available as fallback.
    }
  }, [club?.name, clubInviteUrl])

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

  const segmentControl = (
    <SegmentedControl
      value={tab}
      onChange={setTab}
      trackStyle={styles.segmentTrack}
      options={[
        { value: 'events', label: 'Events' },
        { value: 'feed', label: 'News' },
        { value: 'members', label: 'Members', badgeCount: club?.isAdmin ? pendingJoinRequestCount : 0 },
      ]}
    />
  )

  const hero = (
    <View style={styles.heroWrap}>
      <View style={styles.clubMiniBar}>
        <BackCircleButton
          onPress={() => {
            void runTopBarAction(() => router.back())
          }}
          iconSize={18}
          style={styles.clubMiniBarButton}
        />
        <View style={styles.clubMiniBarActions}>
          <Pressable
            onPress={() => {
              void runTopBarAction(() =>
                router.push({
                  pathname: '/chats/club/[clubId]',
                  params: { clubId: club.id, name: club.name },
                })
              )
            }}
            style={({ pressed }) => [styles.clubMiniBarButton, pressed && styles.clubMiniBarButtonPressed]}
          >
            <Feather name="message-circle" size={18} color={palette.text} />
            {unreadClubChatCount > 0 ? (
              <View style={styles.clubChatUnreadBadge}>
                <Text style={styles.clubChatUnreadText}>{unreadClubChatCount > 99 ? '99+' : String(unreadClubChatCount)}</Text>
              </View>
            ) : null}
          </Pressable>
          {canBook ? (
            <Pressable
              onPress={() => {
                void runTopBarAction(async () => {
                  try {
                    await Linking.openURL(bookingUrl)
                  } catch {
                    Alert.alert('Unable to open link', 'Please try again later.')
                  }
                })
              }}
              style={({ pressed }) => [styles.clubMiniBarButton, pressed && styles.clubMiniBarButtonPressed]}
            >
              <Feather name="external-link" size={18} color={palette.text} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => {
              void runTopBarAction(() => setClubShareSheetOpen(true))
            }}
            style={({ pressed }) => [styles.clubMiniBarButton, pressed && styles.clubMiniBarButtonPressed]}
          >
            <Feather name="share-2" size={18} color={palette.text} />
          </Pressable>
          {canLeaveClub ? (
            <Pressable
              onPress={() => {
                void runTopBarAction(() => setLeaveClubSheetOpen(true))
              }}
              style={({ pressed }) => [styles.clubMiniBarButton, pressed && styles.clubMiniBarButtonPressed]}
              accessibilityLabel="Leave club"
            >
              <Feather name="log-out" size={18} color={palette.text} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <SurfaceCard padded={false} style={styles.clubHeroCard}>
        <View style={styles.clubHeroCardHeader}>
          <OptionalLinearGradient
            pointerEvents="none"
            colors={['rgba(40, 205, 65, 0.10)', 'rgba(82, 224, 104, 0.06)', 'rgba(255, 255, 255, 0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.clubHeroGradient}
          />
          <View style={styles.clubHeroRow}>
            <EntityImage uri={club.logoUrl} style={styles.clubHeroLogo} resizeMode="cover" placeholderResizeMode="contain" />
            <View style={styles.clubHeroMain}>
              <Text style={styles.clubHeroTitle} numberOfLines={2}>{club.name}</Text>
              <View style={styles.clubHeroMetaRow}>
                <Feather name="map-pin" size={16} color={palette.primary} />
                <Text style={styles.clubHeroMetaText} numberOfLines={1}>
                  {formatLocation([club.city, club.state])}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={() => setClubFeedbackInfoOpen(true)}
              style={({ pressed }) => [styles.clubHeroRatingPill, pressed && styles.clubHeroRatingPillPressed]}
            >
              <RatingStarIcon size={16} filled color="#F4B000" />
              {feedbackCanPublishEffective && feedbackAverageEffective ? (
                <Text style={styles.clubHeroRatingText}>{feedbackAverageEffective.toFixed(1)}</Text>
              ) : (
                <Text style={styles.clubHeroRatingMuted}>New</Text>
              )}
            </Pressable>
          </View>
        </View>
      </SurfaceCard>
    </View>
  )

  const membershipId = String(clubId ?? '')
  const membershipActions =
    !membershipId || (isAuthenticated && (club.isFollowing || club.isAdmin)) ? null : (
      <View style={styles.membershipRow}>
        {!isAuthenticated ? (
          <ActionButton label="Sign in to join" variant="secondary" onPress={() => router.push('/sign-in')} />
        ) : club.isJoinPending ? (
          <ActionButton
            label="Cancel join request"
            variant="secondary"
            loading={cancelJoinRequest.isPending}
            onPress={() => cancelJoinRequest.mutate({ clubId: membershipId })}
          />
        ) : (
          <ActionButton
            label={club.joinPolicy === 'APPROVAL' ? 'Request to join' : 'Join club'}
            loading={toggleFollow.isPending}
            onPress={() => toggleFollow.mutate({ clubId: membershipId })}
          />
        )}
      </View>
    )

  const clubInfoBlock =
    clubDescription ? (
      <View style={styles.clubInfoWrap}>
        {clubDescription ? (
          <SurfaceCard style={styles.clubAboutCard}>
            <Text style={styles.clubAboutTitle}>About</Text>
            {!clubDescriptionExpanded && !clubDescriptionExpandable ? (
              <Text
                style={[styles.clubDescriptionText, styles.clubDescriptionMeasureText]}
                onTextLayout={(event) => {
                  if (clubDescriptionExpanded || clubDescriptionExpandable) return
                  if (event.nativeEvent.lines.length > 3) {
                    setClubDescriptionExpandable(true)
                  }
                }}
              >
                {clubDescription}
              </Text>
            ) : null}
            <Text
              style={styles.clubDescriptionText}
              numberOfLines={clubDescriptionExpanded ? undefined : 3}
            >
              {clubDescription}
            </Text>
            {clubDescriptionExpandable ? (
              <Pressable
                onPress={() => setClubDescriptionExpanded((value) => !value)}
                hitSlop={8}
                style={({ pressed }) => [styles.clubInfoLinkPressable, pressed && styles.clubInfoLinkPressed]}
              >
                <Text style={styles.clubInfoLinkText}>
                  {clubDescriptionExpanded ? 'Hide description' : 'Show full description'}
                </Text>
              </Pressable>
            ) : null}
          </SurfaceCard>
        ) : null}
      </View>
    ) : null

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
        open={clubShareSheetOpen}
        onClose={() => setClubShareSheetOpen(false)}
        title="Invite to this club"
        subtitle="Share this link in social media or copy it into a message."
      >
        <View style={styles.shareSheetBlock}>
          <Text style={styles.shareSheetLabel}>Invite link</Text>
          <View style={styles.shareLinkRow}>
            <Text style={styles.shareLinkText} numberOfLines={1}>
              {clubInviteUrl}
            </Text>
            <Pressable
              onPress={() => {
                void handleCopyInviteLink()
              }}
              hitSlop={8}
              style={({ pressed }) => [styles.shareCopyButton, pressed && styles.shareCopyButtonPressed]}
            >
              <Feather name="copy" size={18} color={palette.text} />
            </Pressable>
          </View>
          <View style={styles.shareQrWrap}>
            <View style={styles.shareQrCard}>
              <QRCode value={clubInviteUrl} size={168} color="#111827" backgroundColor="#FFFFFF" quietZone={8} />
            </View>
          </View>
          <ActionButton
            label="Share"
            onPress={() => {
              void handleShareInvite()
            }}
          />
        </View>
      </AppBottomSheet>
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
      <AppBottomSheet
        open={Boolean(memberMenuTarget)}
        onClose={() => setMemberMenuTarget(null)}
        title={memberMenuTarget?.name ?? 'Member actions'}
      >
        <View style={styles.memberActionSheetBody}>
          <ActionButton
            label="Kick from club"
            variant="outline"
            onPress={() => {
              if (!memberMenuTarget) return
              const nextTarget = memberMenuTarget
              setMemberMenuTarget(null)
              setTimeout(() => {
                setKickTarget(nextTarget)
              }, 260)
            }}
          />
          <ActionButton
            label="Ban in club"
            variant="neutral"
            onPress={() => {
              if (!memberMenuTarget) return
              const nextTarget = memberMenuTarget
              setBanReason('')
              setMemberMenuTarget(null)
              setTimeout(() => {
                setBanTarget(nextTarget)
              }, 260)
            }}
          />
        </View>
      </AppBottomSheet>
      <AppBottomSheet
        open={Boolean(bannedMenuTarget)}
        onClose={() => setBannedMenuTarget(null)}
        title={bannedMenuTarget?.name ?? 'Banned user actions'}
      >
        <View style={styles.memberActionSheetBody}>
          <ActionButton
            label="Kick from club"
            variant="outline"
            onPress={() => {
              if (!bannedMenuTarget) return
              const nextTarget = bannedMenuTarget
              setBannedMenuTarget(null)
              setTimeout(() => {
                setKickTarget(nextTarget)
              }, 260)
            }}
          />
          <ActionButton
            label="Unban user"
            variant="secondary"
            onPress={() => {
              if (!bannedMenuTarget) return
              const nextTarget = bannedMenuTarget
              setBannedMenuTarget(null)
              setTimeout(() => {
                setUnbanTarget(nextTarget)
              }, 260)
            }}
          />
        </View>
      </AppBottomSheet>
      <AppBottomSheet
        open={Boolean(kickTarget)}
        onClose={() => setKickTarget(null)}
        title="Kick member?"
        subtitle={`Remove ${kickTarget?.name ?? 'this user'} from the club?`}
        footer={
          <AppConfirmActions
            intent="destructive"
            cancelLabel="Cancel"
            confirmLabel={kickMember.isPending ? 'Removing…' : 'Remove'}
            onCancel={() => setKickTarget(null)}
            onConfirm={() => {
              if (!kickTarget) return
              kickMember.mutate(
                { clubId, userId: kickTarget.userId },
                {
                  onSuccess: () => setKickTarget(null),
                  onError: (err: any) => Alert.alert('Failed', err?.message || 'Could not remove this member.'),
                }
              )
            }}
            confirmLoading={kickMember.isPending}
          />
        }
      />
      <AppBottomSheet
        open={Boolean(banTarget)}
        onClose={() => {
          setBanTarget(null)
          setBanReason('')
        }}
        title="Ban user?"
        subtitle={`${banTarget?.name ?? 'This user'} will not be able to re-join the club.`}
        footer={
          <AppConfirmActions
            intent="destructive"
            cancelLabel="Cancel"
            confirmLabel={banUser.isPending ? 'Banning…' : 'Ban'}
            onCancel={() => {
              setBanTarget(null)
              setBanReason('')
            }}
            onConfirm={() => {
              if (!banTarget) return
              banUser.mutate(
                { clubId, userId: banTarget.userId, reason: banReason.trim() || undefined },
                {
                  onSuccess: () => {
                    setBanTarget(null)
                    setBanReason('')
                  },
                  onError: (err: any) => Alert.alert('Failed', err?.message || 'Could not ban this user.'),
                }
              )
            }}
            confirmLoading={banUser.isPending}
          />
        }
      >
        <InputField
          value={banReason}
          onChangeText={setBanReason}
          placeholder="Reason (optional)"
          containerStyle={styles.memberActionReasonInput}
        />
      </AppBottomSheet>
      <AppBottomSheet
        open={Boolean(unbanTarget)}
        onClose={() => setUnbanTarget(null)}
        title="Unban user?"
        subtitle={`Allow ${unbanTarget?.name ?? 'this user'} to join the club again?`}
        footer={
          <AppConfirmActions
            intent="positive"
            cancelLabel="Cancel"
            confirmLabel={unbanUser.isPending ? 'Unbanning…' : 'Unban'}
            onCancel={() => setUnbanTarget(null)}
            onConfirm={() => {
              if (!unbanTarget) return
              unbanUser.mutate(
                { clubId, userId: unbanTarget.userId },
                {
                  onSuccess: () => setUnbanTarget(null),
                  onError: (err: any) => Alert.alert('Failed', err?.message || 'Could not unban this user.'),
                }
              )
            }}
            confirmLoading={unbanUser.isPending}
          />
        }
      />
    </>
  )

  if (tab === 'members') {
    const allMembers = (membersQuery.data?.members ?? []) as any[]
    const joinRequests = (membersQuery.data?.joinRequests ?? []) as any[]
    const allBans = (membersQuery.data?.bans ?? []) as any[]
    const canModerate = Boolean(membersQuery.data?.canModerate)
    const q = membersSearch.trim().toLowerCase()
    const filteredJoinRequests = q
      ? joinRequests.filter((req) => {
          const name = String(req?.user?.name ?? '').toLowerCase()
          const email = String(req?.user?.emailMasked ?? '').toLowerCase()
          return name.includes(q) || email.includes(q)
        })
      : joinRequests
    const members = q
      ? allMembers.filter((m) => {
          const name = String(m?.user?.name ?? '').toLowerCase()
          const email = String(m?.user?.emailMasked ?? '').toLowerCase()
          return name.includes(q) || email.includes(q)
        })
      : allMembers
    const admins = [...members]
      .filter((m: any) => String(m?.role ?? '').trim() !== '')
      .sort((a: any, b: any) => {
        const ra = String(a?.role ?? '').toUpperCase()
        const rb = String(b?.role ?? '').toUpperCase()
        const pa = ra === 'OWNER' ? 0 : 1
        const pb = rb === 'OWNER' ? 0 : 1
        if (pa !== pb) return pa - pb
        return String(a?.user?.name ?? '').localeCompare(String(b?.user?.name ?? ''))
      })
    const regularMembers = members.filter((m: any) => String(m?.role ?? '').trim() === '')
    const bans = q
      ? allBans.filter((b) => {
          const name = String(b?.user?.name ?? '').toLowerCase()
          const email = String(b?.user?.emailMasked ?? '').toLowerCase()
          const reason = String(b?.reason ?? '').toLowerCase()
          return name.includes(q) || email.includes(q) || reason.includes(q)
        })
      : allBans

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
    const formatBanned = (dateLike: any) => {
      try {
        const d = new Date(dateLike)
        if (Number.isNaN(d.getTime())) return null
        return `Banned ${d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
      } catch {
        return null
      }
    }

    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        {hero}
        <PickleRefreshScrollView
          style={styles.contentScroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshing={pullToRefresh.refreshing}
          onRefresh={pullToRefresh.onRefresh}
          bounces
        >
          {clubInfoBlock}
          {membershipActions}
          {segmentControl}
          {canViewMembers ? (
            <View style={styles.membersSearchWrap}>
              <SearchField
                value={membersSearch}
                onChangeText={setMembersSearch}
                placeholder="Search members..."
              />
            </View>
          ) : null}
          {canModerate && filteredJoinRequests.length > 0 ? (
            <View style={styles.pendingWrap}>
              <View style={styles.pendingHeaderRow}>
                <Text style={styles.clubSectionTitle}>Pending Requests</Text>
                <View style={styles.pendingCountPill}>
                  <Text style={styles.pendingCountText}>{filteredJoinRequests.length}</Text>
                </View>
              </View>

              <View style={styles.pendingList}>
                {filteredJoinRequests.map((req: any) => {
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
                            <RemoteUserAvatar
                              uri={req.user?.image}
                              size={52}
                              fallback="initials"
                              initialsLabel={req.user?.name ?? req.user?.email ?? 'User'}
                            />
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
            <View style={styles.membersWrap}>
              <EmptyState
                title="Members are private"
                body="Join this club to view the members list."
              />
            </View>
          ) : membersQuery.isLoading ? (
            <LoadingBlock label="Loading members…" />
          ) : (
            <View style={styles.membersWrap}>
              {admins.length > 0 ? (
                <View style={styles.adminsBlock}>
                  <View style={styles.membersHeaderRow}>
                    <Text style={styles.clubSectionTitle}>Admins</Text>
                    <Text style={styles.membersHeaderCount}>{String(admins.length)}</Text>
                  </View>
                  <View style={styles.sectionHeaderToListSpacer} />
                  <View style={styles.membersList}>
                    {admins.map((member: any) => {
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
                              <RemoteUserAvatar
                                uri={member.user?.image}
                                size={48}
                                fallback="initials"
                                initialsLabel={member.user?.name ?? member.user?.email ?? 'Member'}
                              />
                            </Pressable>

                            <View style={styles.memberMain}>
                              <View style={styles.memberTopRow}>
                                <View style={styles.memberTopMain}>
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
                                </View>
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
                          </View>
                        </SurfaceCard>
                      )
                    })}
                  </View>
                </View>
              ) : null}

              {admins.length > 0 ? <View style={styles.sectionSpacer} /> : null}

              <View style={styles.membersHeaderRow}>
                <Text style={styles.clubSectionTitle}>Members</Text>
                <Text style={styles.membersHeaderCount}>{String(regularMembers.length)}</Text>
              </View>
              <View style={styles.sectionHeaderToListSpacer} />

              <View style={styles.membersList}>
                {regularMembers.map((member: any) => {
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
                          <RemoteUserAvatar
                            uri={member.user?.image}
                            size={48}
                            fallback="initials"
                            initialsLabel={member.user?.name ?? member.user?.email ?? 'Member'}
                          />
                        </Pressable>

                        <View style={styles.memberMain}>
                          <View style={styles.memberTopRow}>
                            <View style={styles.memberTopMain}>
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
                            </View>
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

                        {canModerate && member.userId !== user?.id ? (
                          <Pressable
                            onPress={() => setMemberMenuTarget({ userId: member.userId, name: member.user?.name || 'Member' })}
                            hitSlop={10}
                            style={({ pressed }) => [styles.kebabBtn, pressed && styles.kebabBtnPressed]}
                          >
                            <Feather name="more-vertical" size={18} color={palette.textMuted} />
                          </Pressable>
                        ) : null}
                      </View>
                    </SurfaceCard>
                  )
                })}
              </View>
              {canModerate ? (
                <>
                  <View style={styles.sectionSpacer} />
                  <View style={styles.bansWrap}>
                  <View style={styles.membersHeaderRow}>
                    <Text style={styles.clubSectionTitle}>Banned users</Text>
                    <Text style={styles.membersHeaderCount}>{String(allBans.length)}</Text>
                  </View>
                    <View style={styles.sectionHeaderToListSpacer} />
                  {bans.length === 0 ? (
                    <SurfaceCard padded={false} style={styles.memberCard}>
                      <View style={styles.emptyBansCard}>
                        <Text style={styles.memberMetaText}>No banned users.</Text>
                      </View>
                    </SurfaceCard>
                  ) : (
                    <View style={styles.membersList}>
                      {bans.map((ban: any) => {
                        const bannedMeta = [formatBanned(ban.bannedAt), ban.bannedBy?.name ? `by ${ban.bannedBy.name}` : null]
                          .filter(Boolean)
                          .join(' • ')
                        return (
                          <SurfaceCard key={ban.userId} padded={false} style={styles.memberCard}>
                            <View style={styles.memberCardRow}>
                              <Pressable
                                disabled={!ban.userId}
                                onPress={() => {
                                  if (!ban.userId) return
                                  router.push({ pathname: '/profile/[id]', params: { id: ban.userId } })
                                }}
                                style={({ pressed }) => [pressed && ban.userId && styles.avatarPress]}
                              >
                                <RemoteUserAvatar
                                  uri={ban.user?.image}
                                  size={48}
                                  fallback="initials"
                                  initialsLabel={ban.user?.name ?? ban.user?.emailMasked ?? 'User'}
                                />
                              </Pressable>
                              <View style={styles.memberMain}>
                                <View style={styles.memberTopRow}>
                                  <View style={styles.memberTopMain}>
                                    <Pressable
                                      disabled={!ban.userId}
                                      onPress={() => {
                                        if (!ban.userId) return
                                        router.push({ pathname: '/profile/[id]', params: { id: ban.userId } })
                                      }}
                                      hitSlop={8}
                                      style={({ pressed }) => [pressed && ban.userId && styles.namePress]}
                                    >
                                      <Text style={styles.memberName} numberOfLines={1}>
                                        {ban.user?.name || 'User'}
                                      </Text>
                                    </Pressable>
                                  </View>
                                  <View style={styles.bannedPill}>
                                    <Feather name="slash" size={12} color={palette.danger} />
                                    <Text style={styles.bannedPillText}>banned</Text>
                                  </View>
                                </View>
                                {bannedMeta ? (
                                  <Text style={styles.memberMetaText} numberOfLines={1}>
                                    {bannedMeta}
                                  </Text>
                                ) : null}
                                {ban.reason ? (
                                  <Text style={styles.bannedReasonText} numberOfLines={1}>
                                    Reason: {ban.reason}
                                  </Text>
                                ) : null}
                              </View>
                              <Pressable
                                onPress={() => setBannedMenuTarget({ userId: ban.userId, name: ban.user?.name || 'User' })}
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
                  )}
                  </View>
                </>
              ) : null}
            </View>
          )}
        </PickleRefreshScrollView>
        {clubSheets}
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      {hero}
      <PickleRefreshScrollView
        style={styles.contentScroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshing={pullToRefresh.refreshing}
        onRefresh={pullToRefresh.onRefresh}
        bounces
      >
        {clubInfoBlock}
        {membershipActions}
        {segmentControl}

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
                                onPress={() => setAnnouncementToDelete(announcement.id)}
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
              <Text style={styles.clubSectionTitle}>Calendar</Text>
              <Text style={styles.clubSectionSubtitle}>Upcoming club events</Text>
              <View style={styles.calendarStub}>
                <Feather name="calendar" size={20} color={palette.primary} />
                <Text style={styles.calendarStubText}>Calendar view coming next.</Text>
              </View>
            </SurfaceCard>

            <View style={styles.upcomingSection}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.clubSectionTitle}>Upcoming tournaments</Text>
                {club.tournaments.length > 0 ? (
                  <Pressable
                    onPress={() => router.push(`/clubs/${club.id}/events`)}
                    hitSlop={8}
                    style={({ pressed }) => [styles.clubInfoLinkPressable, pressed && styles.clubInfoLinkPressed]}
                  >
                    <Text style={styles.clubInfoLinkText}>View all</Text>
                  </Pressable>
                ) : null}
              </View>
              {club.tournaments.length > 0 ? (
                club.tournaments.slice(0, 5).map((tournament) => (
                  <View key={tournament.id}>
                    <ClubTournamentCard
                      tournament={tournament as any}
                      fallbackVenueName={club.city}
                      fallbackVenueAddress={club.state}
                      onPress={() => router.push(`/tournaments/${tournament.id}`)}
                    />
                  </View>
                ))
              ) : (
                <SurfaceCard tone="soft" style={styles.emptyUpcomingCard}>
                  <Text style={styles.emptyUpcomingText}>No upcoming events yet.</Text>
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
        contextCard={
          <FeedbackEntityContextCard
            entityType="CLUB"
            title={club.name}
            imageUrl={club.logoUrl}
            addressLabel={formatLocation([club.city, club.state])}
            membersLabel={`${Math.max(1, Number(club.followersCount ?? 0) || 0)} members`}
          />
        }
        onSubmitted={() => {
          void Promise.all([feedbackSummaryQuery.refetch(), hasRatedQuery.refetch()])
        }}
      />
      <AppBottomSheet
        open={clubFeedbackInfoOpen}
        onClose={() => setClubFeedbackInfoOpen(false)}
        title="Club rating"
        subtitle={
          feedbackCanPublishEffective && feedbackAverageEffective ? '' : `No public rating yet. Need at least 5 ratings.`
        }
        footer={
          !hasRatedClub ? (
            <ActionButton
              label="Rate this club"
              onPress={() => {
                setClubFeedbackInfoOpen(false)
                setTimeout(() => setClubFeedbackOpen(true), 280)
              }}
            />
          ) : undefined
        }
      >
        {feedbackCanPublishEffective && feedbackAverageEffective ? (
          <View style={styles.modalStarsRow}>
            {[1, 2, 3, 4, 5].map((star) => {
              const active = star <= Math.round(feedbackAverageEffective)
              return (
                <RatingStarIcon key={star} size={40} filled={active} color="#F2C94C" inactiveColor="#C7C7CC" />
              )
            })}
            <Text style={styles.modalRatingValueInline}>{feedbackAverageEffective.toFixed(1)}</Text>
          </View>
        ) : null}
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.background,
  },
  contentScroll: {
    flex: 1,
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
    color: palette.text,
    fontSize: 16,
    fontWeight: '700',
  },
  feedbackValueMuted: {
    color: palette.textMuted,
    fontSize: 16,
    fontWeight: '600',
  },
  feedbackCount: {
    color: palette.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  feedbackInfoBtn: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  feedbackInfoBtnPressed: {
    opacity: 0.85,
  },
  feedbackInfoBtnText: {
    color: palette.text,
    fontWeight: '700',
    fontSize: 13,
  },
  feedbackRateBtn: {
    minHeight: 42,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.primary,
  },
  feedbackRateBtnPressed: {
    opacity: 0.9,
  },
  feedbackRateBtnText: {
    color: palette.white,
    fontSize: 15,
    fontWeight: '700',
  },
  feedbackThanksText: {
    color: palette.textMuted,
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
    color: palette.textMuted,
    fontSize: 13,
  },
  modalStarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  modalRatingValueInline: {
    marginLeft: 8,
    color: palette.text,
    fontSize: 24,
    fontWeight: '800',
  },
  heroWrap: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  clubMiniBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  clubMiniBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  clubMiniBarButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  clubMiniBarButtonPressed: {
    opacity: 1,
    backgroundColor: palette.surfaceMuted,
    borderColor: palette.brandPrimaryBorder,
    transform: [{ scale: 0.94 }],
  },
  clubChatUnreadBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.primary,
  },
  clubChatUnreadText: {
    color: palette.white,
    fontSize: 10,
    fontWeight: '800',
  },
  clubHeroCard: {
    overflow: 'hidden',
  },
  clubHeroCardHeader: {
    position: 'relative',
    overflow: 'hidden',
    padding: spacing.md,
    backgroundColor: palette.surface,
  },
  clubHeroGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  clubHeroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  clubHeroLogo: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: palette.surfaceMuted,
  },
  clubHeroMain: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 4,
  },
  clubHeroTitle: {
    color: palette.text,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  clubHeroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clubHeroMetaText: {
    color: palette.textMuted,
    fontSize: 13,
    lineHeight: 20,
    flex: 1,
  },
  clubHeroRatingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: 'rgba(10,10,10,0.08)',
    borderRadius: radius.pill,
    backgroundColor: 'rgba(10,10,10,0.03)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginLeft: 8,
    maxWidth: 120,
  },
  clubHeroRatingPillPressed: {
    opacity: 0.85,
  },
  clubHeroRatingText: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '600',
  },
  clubHeroRatingMuted: {
    color: palette.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  shareSheetBlock: {
    gap: spacing.md,
    paddingTop: spacing.xs,
  },
  shareSheetLabel: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '700',
  },
  shareLinkRow: {
    minHeight: 48,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceElevated,
    paddingLeft: spacing.md,
    paddingRight: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  shareLinkText: {
    flex: 1,
    color: palette.text,
    fontSize: 14,
  },
  shareCopyButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  shareCopyButtonPressed: {
    opacity: 1,
    backgroundColor: palette.surfaceMuted,
    borderColor: palette.brandPrimaryBorder,
    transform: [{ scale: 0.94 }],
  },
  shareQrWrap: {
    alignItems: 'center',
  },
  shareQrCard: {
    padding: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.white,
  },
  shareQrImage: {
    width: 168,
    height: 168,
  },
  segmentTrack: {
    marginTop: 0,
    marginHorizontal: spacing.lg,
  },
  membershipRow: {
    marginTop: 0,
    marginBottom: 0,
    paddingHorizontal: spacing.lg,
  },
  membershipHint: {
    color: palette.primary,
    fontSize: 14,
    paddingVertical: spacing.sm,
    fontWeight: '700',
  },
  clubInfoWrap: {
    marginTop: spacing.md,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  clubSectionTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '600',
  },
  clubSectionSubtitle: {
    marginTop: 2,
    marginBottom: 8,
    color: palette.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  clubAboutCard: {
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  clubAboutTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  clubDescriptionText: {
    color: palette.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  clubDescriptionMeasureText: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    top: spacing.md,
    opacity: 0,
    zIndex: -1,
  },
  clubBookingLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
  },
  clubInfoLinkPressable: {
    alignSelf: 'flex-start',
  },
  clubInfoLinkPressed: {
    opacity: 0.78,
  },
  clubInfoLinkText: {
    color: palette.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  tabContent: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: 12,
  },
  membersSearchWrap: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  membersSearchWrapInline: {
    marginTop: 0,
    paddingHorizontal: 0,
  },
  pendingWrap: {
    marginTop: spacing.xl,
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
  pendingName: {
    color: palette.text,
    fontWeight: '600',
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
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
    gap: 0,
  },
  adminsBlock: {
    gap: 0,
  },
  membersHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  /** Между секциями (Pending → Admins → Members → Banned) */
  sectionSpacer: {
    height: spacing.md,
  },
  /** Заголовок секции → список карточек (единый) */
  sectionHeaderToListSpacer: {
    height: 12,
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
  bansWrap: {
    marginTop: spacing.xl,
    gap: 0,
  },
  memberCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: palette.surface,
    shadowOpacity: 0,
    elevation: 0,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  memberCardOwner: {
    borderColor: palette.primary,
  },
  memberCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  memberMain: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  memberTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  memberTopMain: {
    flex: 1,
    minWidth: 0,
  },
  rolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.brandPrimaryBorder,
    backgroundColor: palette.brandPrimaryTint,
  },
  rolePillText: {
    color: palette.primary,
    fontWeight: '700',
    fontSize: 11,
    textTransform: 'lowercase',
  },
  memberMetaText: {
    marginTop: 2,
    color: palette.textMuted,
    fontSize: 14,
    lineHeight: 18,
  },
  bannedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 0, 110, 0.2)',
    backgroundColor: 'rgba(255, 0, 110, 0.08)',
  },
  bannedPillText: {
    color: palette.danger,
    fontWeight: '700',
    fontSize: 11,
    textTransform: 'lowercase',
  },
  bannedReasonText: {
    marginTop: 2,
    color: palette.text,
    fontSize: 13,
    lineHeight: 18,
  },
  emptyBansCard: {
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  kebabBtn: {
    padding: 6,
    borderRadius: 10,
  },
  kebabBtnPressed: {
    opacity: 0.85,
  },
  memberActionSheetBody: {
    gap: 10,
  },
  memberActionReasonInput: {
    marginTop: spacing.xs,
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
  upcomingSection: {
    marginTop: spacing.xl,
    gap: 12,
  },
  emptyUpcomingCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    minHeight: 96,
  },
  emptyUpcomingText: {
    color: palette.textMuted,
    fontSize: 14,
    textAlign: 'center',
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
  memberName: {
    color: palette.text,
    fontWeight: '600',
    fontSize: 16,
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
