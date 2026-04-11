import * as Clipboard from 'expo-clipboard'
import * as Haptics from 'expo-haptics'
import { Feather } from '@expo/vector-icons'
import QRCode from 'react-native-qrcode-svg'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Image, Linking, Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'

import {
  ActionButton,
  EmptyState,
  InputField,
  LoadingBlock,
  Pill,
  SearchField,
  SectionTitle,
  SegmentedControl,
  SegmentedContentFade,
  SurfaceCard,
} from '../../../src/components/ui'
import { AppBottomSheet, AppConfirmActions } from '../../../src/components/AppBottomSheet'
import { ClubTournamentCard } from '../../../src/components/ClubTournamentCard'
import { ClubAnnouncementComposerSheet, type ClubAnnouncementDraft } from '../../../src/components/ClubAnnouncementComposerSheet'
import { ClubAnnouncementPollCard } from '../../../src/components/ClubAnnouncementPollCard'
import { EntityImage } from '../../../src/components/EntityImage'
import { FeedbackEntityContextCard } from '../../../src/components/FeedbackEntityContextCard'
import { FeedbackRatingModal } from '../../../src/components/FeedbackRatingModal'
import { RatingStarIcon } from '../../../src/components/icons/RatingStarIcon'
import { LinkifiedText } from '../../../src/components/LinkifiedText'
import { PickleRefreshScrollView } from '../../../src/components/PickleRefreshScrollView'
import { RemoteUserAvatar } from '../../../src/components/RemoteUserAvatar'
import { BackCircleButton } from '../../../src/components/navigation/BackCircleButton'
import { TopBar } from '../../../src/components/navigation/TopBar'
import { OptionalLinearGradient } from '../../../src/components/OptionalLinearGradient'
import { buildWebUrl, FEEDBACK_API_ENABLED } from '../../../src/lib/config'
import {
  formatEventTimeRange,
  getUpcomingEventDays,
  mapClubTournamentsToCalendarEvents,
  parseYmd,
  buildEventsByDay,
} from '../../../src/lib/clubCalendar'
import { formatFileSize, getExternalLocationUrl } from '../../../src/lib/chatSpecialMessages'
import { formatDateTime, formatLocation } from '../../../src/lib/formatters'
import { authApi } from '../../../src/lib/authApi'
import { trpc } from '../../../src/lib/trpc'
import { radius, spacing, type ThemePalette } from '../../../src/lib/theme'
import { useAuth } from '../../../src/providers/AuthProvider'
import { useAppTheme } from '../../../src/providers/ThemeProvider'
import { useToast } from '../../../src/providers/ToastProvider'
import { usePullToRefresh } from '../../../src/hooks/usePullToRefresh'
import { useToastWhenEntityMissing } from '../../../src/hooks/useToastWhenEntityMissing'

type AnnouncementComposerState =
  | null
  | { mode: 'create'; draft: ClubAnnouncementDraft }
  | { mode: 'edit'; announcementId: string; originalPollId: string | null; draft: ClubAnnouncementDraft }

const EMPTY_ANNOUNCEMENT_DRAFT: ClubAnnouncementDraft = {
  title: '',
  body: '',
  image: null,
  location: null,
  file: null,
  poll: null,
}

const getAnnouncementImageAspectRatio = (width?: number | null, height?: number | null) => {
  const safeWidth = Number(width ?? 0)
  const safeHeight = Number(height ?? 0)
  if (safeWidth > 0 && safeHeight > 0) {
    return Math.min(Math.max(safeWidth / safeHeight, 0.8), 1.8)
  }
  return 1.25
}

const getAnnouncementDraftFromAnnouncement = (announcement: any): ClubAnnouncementDraft => ({
  title: announcement.title ?? '',
  body: announcement.body,
  image: announcement.imageUrl
    ? {
        uri: announcement.imageUrl,
        width: announcement.imageWidth ?? null,
        height: announcement.imageHeight ?? null,
        remoteUrl: announcement.imageUrl,
      }
    : null,
  location:
    announcement.locationLatitude != null && announcement.locationLongitude != null
      ? {
          latitude: Number(announcement.locationLatitude),
          longitude: Number(announcement.locationLongitude),
          title: announcement.locationTitle || 'Pinned location',
          address: announcement.locationAddress || null,
        }
      : null,
  file:
    announcement.fileUrl && announcement.fileName
      ? {
          remoteUrl: announcement.fileUrl,
          fileName: announcement.fileName,
          mimeType: announcement.fileMimeType ?? null,
          size: announcement.fileSize ?? null,
        }
      : null,
  poll: announcement.poll
    ? {
        title: String(announcement.poll.title ?? ''),
        options: (announcement.poll.options ?? []).map((option: any) => ({
          id: String(option.id ?? ''),
          text: String(option.text ?? ''),
        })),
      }
    : null,
})

export default function ClubDetailScreen() {
  const params = useLocalSearchParams<{ id: string; tab?: string }>()
  const clubId = String(
    Array.isArray(params.id) ? params.id[0] : params.id ?? '',
  ).trim()
  const { token, user } = useAuth()
  const { colors, theme } = useAppTheme()
  const toast = useToast()
  const isAuthenticated = Boolean(token)
  const utils = trpc.useUtils()
  const [tab, setTab] = useState<'feed' | 'events' | 'members'>('events')
  const [membersSearch, setMembersSearch] = useState('')

  const styles = useMemo(() => createStyles(colors), [colors])

  const clubHeroGradientColors = useMemo(
    () =>
      [
        'rgba(40, 205, 65, 0.10)',
        'rgba(82, 224, 104, 0.06)',
        theme === 'dark' ? 'rgba(26, 26, 26, 0)' : 'rgba(255, 255, 255, 0)',
      ] as const,
    [theme],
  )

  const clubQuery = trpc.club.get.useQuery({ id: clubId }, { enabled: Boolean(clubId) })
  useToastWhenEntityMissing({
    enabled: Boolean(clubId),
    entityKey: clubId,
    toastMessage: 'This club no longer exists or the link is invalid.',
    isLoading: clubQuery.isLoading,
    hasData: Boolean(clubQuery.data),
    isError: clubQuery.isError,
    errorMessage: clubQuery.error?.message,
  })
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
    onSuccess: (data) => {
      void Promise.all([
        utils.club.get.invalidate({ id: clubId as string }),
        utils.club.list.invalidate(),
        utils.club.listMyChatClubs.invalidate(),
      ])
      if (data.status === 'pending') toast.success('Request sent.')
      else if (data.status === 'joined') toast.success('You joined the club.')
      else if (data.status === 'left') toast.success('You left the club.')
    },
    onError: (e) => toast.error(e.message || 'Something went wrong'),
  })
  const cancelJoinRequest = trpc.club.cancelJoinRequest.useMutation({
    onSuccess: () => {
      void Promise.all([
        utils.club.get.invalidate({ id: clubId as string }),
        utils.club.list.invalidate(),
      ])
      toast.success('Join request cancelled.')
    },
    onError: (e) => toast.error(e.message || 'Something went wrong'),
  })
  const createAnnouncement = trpc.club.createAnnouncement.useMutation({
    onSuccess: async () => {
      await utils.club.get.invalidate({ id: clubId })
      toast.success('Announcement published.')
    },
  })
  const updateAnnouncement = trpc.club.updateAnnouncement.useMutation({
    onSuccess: async () => {
      await utils.club.get.invalidate({ id: clubId })
      toast.success('Announcement updated.')
    },
  })
  const deleteAnnouncement = trpc.club.deleteAnnouncement.useMutation({
    onSuccess: async () => {
      await utils.club.get.invalidate({ id: clubId })
      toast.success('Announcement removed.')
    },
    onError: (e) => toast.error(e.message || 'Failed to delete'),
  })
  const likeAnnouncement = trpc.club.likeAnnouncement.useMutation({
    onMutate: async ({ announcementId }) => {
      const previousClub = utils.club.get.getData({ id: clubId })
      utils.club.get.setData({ id: clubId }, (current) => {
        if (!current) return current
        return {
          ...current,
          announcements: (current.announcements ?? []).map((announcement: any) => {
            if (announcement.id !== announcementId) return announcement
            const previousLikeCount = Number(announcement.likeCount ?? 0)
            const previousViewerHasLiked = Boolean(announcement.viewerHasLiked)
            return {
              ...announcement,
              likeCount: previousViewerHasLiked ? Math.max(0, previousLikeCount - 1) : previousLikeCount + 1,
              viewerHasLiked: !previousViewerHasLiked,
            }
          }),
        }
      })
      return { previousClub }
    },
    onError: (e, _input, context) => {
      if (context?.previousClub) {
        utils.club.get.setData({ id: clubId }, context.previousClub)
      }
      toast.error(e.message || 'Failed to update like')
    },
    onSuccess: (data) => {
      utils.club.get.setData({ id: clubId }, (current) => {
        if (!current) return current
        return {
          ...current,
          announcements: (current.announcements ?? []).map((announcement: any) =>
            announcement.id === data.announcementId
              ? { ...announcement, likeCount: data.likeCount, viewerHasLiked: data.viewerHasLiked }
              : announcement
          ),
        }
      })
    },
  })
  const voteAnnouncementPoll = trpc.club.voteAnnouncementPoll.useMutation({
    onMutate: async ({ announcementId, optionId }) => {
      const previousClub = utils.club.get.getData({ id: clubId })
      utils.club.get.setData({ id: clubId }, (current) => {
        if (!current) return current
        return {
          ...current,
          announcements: (current.announcements ?? []).map((announcement: any) => {
            if (announcement.id !== announcementId || !announcement.poll) return announcement
            const previousOptionId = announcement.poll.viewerOptionId ?? null
            const nextTotalVotes = Number(announcement.poll.totalVotes ?? 0) + (previousOptionId ? 0 : 1)
            const nextOptions = (announcement.poll.options ?? []).map((option: any) => {
              let voteCount = Number(option.voteCount ?? 0)
              if (previousOptionId && option.id === previousOptionId && previousOptionId !== optionId) {
                voteCount = Math.max(0, voteCount - 1)
              }
              if (option.id === optionId && previousOptionId !== optionId) {
                voteCount += 1
              }
              return { ...option, voteCount }
            })
            return {
              ...announcement,
              poll: {
                ...announcement.poll,
                viewerOptionId: optionId,
                totalVotes: nextTotalVotes,
                options: nextOptions,
              },
            }
          }),
        }
      })
      return { previousClub }
    },
    onError: (e, _input, context) => {
      if (context?.previousClub) {
        utils.club.get.setData({ id: clubId }, context.previousClub)
      }
      toast.error(e.message || 'Failed to update vote')
    },
    onSuccess: (data) => {
      utils.club.get.setData({ id: clubId }, (current) => {
        if (!current) return current
        return {
          ...current,
          announcements: (current.announcements ?? []).map((announcement: any) =>
            announcement.id === data.announcementId
              ? {
                  ...announcement,
                  poll: announcement.poll
                    ? {
                        ...announcement.poll,
                        viewerOptionId: data.viewerOptionId,
                        totalVotes: data.totalVotes,
                        options: data.options,
                      }
                    : announcement.poll,
                }
              : announcement,
          ),
        }
      })
    },
  })
  const approveJoinRequest = trpc.club.approveJoinRequest.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.club.get.invalidate({ id: clubId }),
        utils.club.listMembers.invalidate({ clubId }),
      ])
      toast.success('User joined the club.')
    },
    onError: (e) => toast.error(e.message || 'Something went wrong'),
  })
  const rejectJoinRequest = trpc.club.rejectJoinRequest.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.club.get.invalidate({ id: clubId }),
        utils.club.listMembers.invalidate({ clubId }),
      ])
      toast.success('Request rejected.')
    },
    onError: (e) => toast.error(e.message || 'Something went wrong'),
  })
  const kickMember = trpc.club.kickMember.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.club.get.invalidate({ id: clubId }),
        utils.club.listMembers.invalidate({ clubId }),
      ])
      toast.success('Member removed from the club.')
    },
    onError: (e) => toast.error(e.message || 'Something went wrong'),
  })
  const banUser = trpc.club.banUser.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.club.get.invalidate({ id: clubId }),
        utils.club.listMembers.invalidate({ clubId }),
      ])
      toast.success('User banned.')
    },
    onError: (e) => toast.error(e.message || 'Something went wrong'),
  })
  const unbanUser = trpc.club.unbanUser.useMutation({
    onSuccess: async () => {
      await utils.club.listMembers.invalidate({ clubId })
      toast.success('User can join again.')
    },
    onError: (e) => toast.error(e.message || 'Something went wrong'),
  })
  const markClubJoinRequestSeen = trpc.notification.markClubJoinRequestSeen.useMutation({
    onSuccess: async () => {
      await utils.notification.list.invalidate()
    },
  })
  const dismissClubJoinBellRow = trpc.notification.dismiss.useMutation({
    onSuccess: async () => {
      await utils.notification.list.invalidate()
    },
  })

  const [announcementComposer, setAnnouncementComposer] = useState<AnnouncementComposerState>(null)
  const [announcementPreviewImage, setAnnouncementPreviewImage] = useState<string | null>(null)
  const [announcementSubmitBusy, setAnnouncementSubmitBusy] = useState(false)
  const [leaveClubSheetOpen, setLeaveClubSheetOpen] = useState(false)
  const [clubShareSheetOpen, setClubShareSheetOpen] = useState(false)
  const [announcementToDelete, setAnnouncementToDelete] = useState<string | null>(null)
  const [clubFeedbackOpen, setClubFeedbackOpen] = useState(false)
  const [clubFeedbackInfoOpen, setClubFeedbackInfoOpen] = useState(false)
  const [openClubFeedbackAfterInfoClose, setOpenClubFeedbackAfterInfoClose] = useState(false)
  const [memberMenuTarget, setMemberMenuTarget] = useState<{ userId: string; name: string } | null>(null)
  const [bannedMenuTarget, setBannedMenuTarget] = useState<{ userId: string; name: string } | null>(null)
  const [kickTarget, setKickTarget] = useState<{ userId: string; name: string } | null>(null)
  const [banTarget, setBanTarget] = useState<{ userId: string; name: string } | null>(null)
  const [unbanTarget, setUnbanTarget] = useState<{ userId: string; name: string } | null>(null)
  const [banReason, setBanReason] = useState('')
  const [clubDescriptionExpanded, setClubDescriptionExpanded] = useState(false)
  const [clubDescriptionExpandable, setClubDescriptionExpandable] = useState(false)
  const closeAnnouncementComposer = useCallback(() => {
    setAnnouncementComposer(null)
  }, [])
  const handleSubmitAnnouncement = useCallback(async () => {
    const currentComposer = announcementComposer
    if (!currentComposer?.draft.body.trim()) return
    const normalizedTitle = currentComposer.draft.title.trim().slice(0, 120) || undefined
    const originalPollId = currentComposer.mode === 'edit' ? currentComposer.originalPollId : null
    const normalizedPoll =
      currentComposer.draft.poll && currentComposer.draft.poll.title.trim()
        ? {
            title: currentComposer.draft.poll.title.trim().slice(0, 120),
            options: currentComposer.draft.poll.options
              .map((option) => ({
                id: String(option.id ?? '').trim() || undefined,
                text: String(option.text ?? '').trim().slice(0, 120),
              }))
              .filter((option) => Boolean(option.text)),
          }
        : null
    const removePoll = Boolean(originalPollId && !currentComposer.draft.poll)

    try {
      setAnnouncementSubmitBusy(true)
      let imageUrl: string | undefined
      let imageWidth: number | null | undefined
      let imageHeight: number | null | undefined
      let fileUrl: string | undefined
      let fileName: string | null | undefined
      let fileMimeType: string | null | undefined
      let fileSize: number | null | undefined

      if (currentComposer.draft.image) {
        if (currentComposer.draft.image.remoteUrl) {
          imageUrl = currentComposer.draft.image.remoteUrl
          imageWidth = currentComposer.draft.image.width ?? null
          imageHeight = currentComposer.draft.image.height ?? null
        } else {
          if (!token) {
            toast.error('You need to sign in before uploading images.')
            return
          }
          const upload = await authApi.uploadChatAttachment(token, {
            kind: 'image',
            uri: currentComposer.draft.image.uri,
            fileName: currentComposer.draft.image.fileName,
            mimeType: currentComposer.draft.image.mimeType || 'image/jpeg',
          })
          imageUrl = upload.url
          imageWidth = currentComposer.draft.image.width ?? null
          imageHeight = currentComposer.draft.image.height ?? null
        }
      }

      if (currentComposer.draft.file) {
        if (currentComposer.draft.file.remoteUrl) {
          fileUrl = currentComposer.draft.file.remoteUrl
          fileName = currentComposer.draft.file.fileName
          fileMimeType = currentComposer.draft.file.mimeType ?? null
          fileSize = currentComposer.draft.file.size ?? null
        } else {
          if (!token || !currentComposer.draft.file.uri) {
            toast.error('You need to sign in before uploading files.')
            return
          }
          const upload = await authApi.uploadChatAttachment(token, {
            kind: 'file',
            uri: currentComposer.draft.file.uri,
            fileName: currentComposer.draft.file.fileName,
            mimeType: currentComposer.draft.file.mimeType || 'application/octet-stream',
          })
          fileUrl = upload.url
          fileName = upload.fileName
          fileMimeType = upload.mimeType
          fileSize = upload.size
        }
      }

      if (currentComposer.mode === 'edit') {
        await updateAnnouncement.mutateAsync({
          clubId,
          announcementId: currentComposer.announcementId,
          title: normalizedTitle,
          body: currentComposer.draft.body.trim(),
          imageUrl,
          imageWidth,
          imageHeight,
          locationLatitude: currentComposer.draft.location?.latitude ?? null,
          locationLongitude: currentComposer.draft.location?.longitude ?? null,
          locationTitle: currentComposer.draft.location?.title ?? null,
          locationAddress: currentComposer.draft.location?.address ?? null,
          fileUrl,
          fileName,
          fileMimeType,
          fileSize,
          removeImage: !currentComposer.draft.image,
          removeLocation: !currentComposer.draft.location,
          removeFile: !currentComposer.draft.file,
          removePoll,
          poll: normalizedPoll,
        })
      } else {
        await createAnnouncement.mutateAsync({
          clubId,
          title: normalizedTitle,
          body: currentComposer.draft.body.trim(),
          imageUrl,
          imageWidth,
          imageHeight,
          locationLatitude: currentComposer.draft.location?.latitude ?? null,
          locationLongitude: currentComposer.draft.location?.longitude ?? null,
          locationTitle: currentComposer.draft.location?.title ?? null,
          locationAddress: currentComposer.draft.location?.address ?? null,
          fileUrl,
          fileName,
          fileMimeType,
          fileSize,
          poll: normalizedPoll,
        })
      }

      closeAnnouncementComposer()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to save announcement')
    } finally {
      setAnnouncementSubmitBusy(false)
    }
  }, [announcementComposer, clubId, closeAnnouncementComposer, createAnnouncement, toast, token, updateAnnouncement])

  const pendingAfterMemberClose = useRef<
    | { kind: 'kick'; target: { userId: string; name: string } }
    | { kind: 'ban'; target: { userId: string; name: string } }
    | null
  >(null)
  const pendingUnbanAfterBannedMenuClose = useRef<{ userId: string; name: string } | null>(null)
  /** Снимаем строку club-join-request в колокольнике только когда очередь пуста (после принятия/отклонения). */
  const joinRequestBellDismissedRef = useRef(false)

  const onMemberMenuDismissed = useCallback(() => {
    const p = pendingAfterMemberClose.current
    pendingAfterMemberClose.current = null
    if (!p) return
    if (p.kind === 'kick') setKickTarget(p.target)
    else setBanTarget(p.target)
  }, [])

  const onBannedMenuDismissed = useCallback(() => {
    const p = pendingUnbanAfterBannedMenuClose.current
    pendingUnbanAfterBannedMenuClose.current = null
    if (!p) return
    setUnbanTarget(p)
  }, [])

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
  const canRateClub = Boolean(isAuthenticated && club && (club.isFollowing || club.isAdmin))
  const showRateClubAction = Boolean(canRateClub && hasRatedQuery.isFetched && !hasRatedClub)

  const feedbackAverage = feedbackSummaryQuery.data?.averageRating ?? null
  const feedbackCanPublish = Boolean(feedbackSummaryQuery.data?.canPublish)
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
  const handleOpenExternalLink = useCallback((url: string, open: () => Promise<void>) => {
    Alert.alert(
      'Open external link?',
      'This link will open outside Piqle. External websites may be unsafe. Continue only if you trust the source.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open',
          onPress: () => {
            void open().catch(() => {
              Alert.alert('Cannot open link', 'This link could not be opened on this device.')
            })
          },
        },
      ]
    )
  }, [])
  const handleOpenAnnouncementLocation = useCallback(
    (announcement: any) => {
      const latitude = Number(announcement.locationLatitude)
      const longitude = Number(announcement.locationLongitude)
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return
      const next = {
        latitude,
        longitude,
        title: String(announcement.locationTitle ?? '').trim() || 'Pinned location',
        address: String(announcement.locationAddress ?? '').trim() || null,
      }
      Alert.alert(
        next.title,
        next.address || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Open in maps',
            onPress: () => {
              void (async () => {
                try {
                  const externalUrl = getExternalLocationUrl(next)
                  const supported = await Linking.canOpenURL(externalUrl)
                  if (supported) {
                    await Linking.openURL(externalUrl)
                  } else {
                    await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`)
                  }
                } catch {
                  Alert.alert('Cannot open map', 'This location could not be opened on this device.')
                }
              })()
            },
          },
        ]
      )
    },
    []
  )

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
    joinRequestBellDismissedRef.current = false
  }, [clubId])

  useEffect(() => {
    const pending = membersQuery.data?.joinRequests?.length ?? 0
    if (pending > 0) {
      joinRequestBellDismissedRef.current = false
    }
  }, [membersQuery.data?.joinRequests?.length])

  useEffect(() => {
    if (tab !== 'members' || !club?.isAdmin || !clubId) return
    if (!membersQuery.isFetched || !membersQuery.data) return
    const pending = membersQuery.data.joinRequests?.length ?? 0
    if (pending > 0) return
    if (joinRequestBellDismissedRef.current) return
    void dismissClubJoinBellRow
      .mutateAsync({ notificationId: `club-join-request-${clubId}` })
      .then((r) => {
        if (r.persisted) {
          joinRequestBellDismissedRef.current = true
        }
      })
      .catch(() => undefined)
  }, [
    tab,
    club?.isAdmin,
    clubId,
    membersQuery.isFetched,
    membersQuery.data?.joinRequests?.length,
  ])

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
      toast.success('Invite link copied to clipboard.', 'Copied')
    } catch {
      toast.error('Please copy it manually.', 'Copy failed')
    }
  }, [clubInviteUrl, toast])

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

  const membersTabContent = useMemo(() => {
    if (tab !== 'members') return null

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
      <>
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
            <View style={styles.membersWrap}>
              <EmptyState
                title="Members are private"
                body="Join this club to view the members list."
              />
            </View>
          ) : membersQuery.isLoading ? (
            <View style={styles.membersLoadingWrap}>
              <LoadingBlock label="Loading members…" />
            </View>
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
                            <Feather name="more-vertical" size={18} color={colors.textMuted} />
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
                                    <Feather name="slash" size={12} color={colors.danger} />
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
                                <Feather name="more-vertical" size={18} color={colors.textMuted} />
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
      </>
    )
  }, [
    tab,
    membersQuery.data,
    membersQuery.isLoading,
    membersSearch,
    canViewMembers,
    clubId,
    user?.id,
    approveJoinRequest,
    rejectJoinRequest,
  ])

  const calendarEvents = useMemo(
    () => mapClubTournamentsToCalendarEvents(club?.tournaments ?? []),
    [club?.tournaments],
  )
  const eventsByDay = useMemo(() => buildEventsByDay(calendarEvents), [calendarEvents])
  const previewDayKeys = useMemo(() => getUpcomingEventDays(eventsByDay, 3), [eventsByDay])


  if (clubQuery.isLoading) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['top']}>
        <TopBar />
        <View style={styles.loadingWrap}>
          <LoadingBlock label="Loading club…" />
        </View>
      </SafeAreaView>
    )
  }

  if (!clubQuery.data) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['top']}>
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
            <Feather name="message-circle" size={18} color={colors.text} />
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
              <Feather name="external-link" size={18} color={colors.text} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => {
              void runTopBarAction(() => setClubShareSheetOpen(true))
            }}
            style={({ pressed }) => [styles.clubMiniBarButton, pressed && styles.clubMiniBarButtonPressed]}
          >
            <Feather name="share-2" size={18} color={colors.text} />
          </Pressable>
          {canLeaveClub ? (
            <Pressable
              onPress={() => {
                void runTopBarAction(() => setLeaveClubSheetOpen(true))
              }}
              style={({ pressed }) => [styles.clubMiniBarButton, pressed && styles.clubMiniBarButtonPressed]}
              accessibilityLabel="Leave club"
            >
              <Feather name="log-out" size={18} color={colors.text} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <SurfaceCard padded={false} style={styles.clubHeroCard}>
        <View style={styles.clubHeroCardHeader}>
          <OptionalLinearGradient
            pointerEvents="none"
            colors={clubHeroGradientColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.clubHeroGradient}
          />
          <View style={styles.clubHeroRow}>
            <EntityImage uri={club.logoUrl} style={styles.clubHeroLogo} resizeMode="cover" placeholderResizeMode="contain" />
            <View style={styles.clubHeroMain}>
              <Text style={styles.clubHeroTitle} numberOfLines={2}>{club.name}</Text>
              <View style={styles.clubHeroMetaRow}>
                <Feather name="map-pin" size={16} color={colors.primary} />
                <Text style={styles.clubHeroMetaText} numberOfLines={1}>
                  {formatLocation([club.city, club.state])}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={() => setClubFeedbackInfoOpen(true)}
              style={({ pressed }) => [
                styles.clubHeroRatingPill,
                theme === 'light' && styles.clubHeroRatingPillLight,
                pressed && styles.clubHeroRatingPillPressed,
              ]}
            >
              <RatingStarIcon size={16} filled color="#F4B000" />
              {feedbackCanPublish && feedbackAverage ? (
                <Text style={[styles.clubHeroRatingText, theme === 'light' && styles.clubHeroRatingTextLight]}>
                  {feedbackAverage.toFixed(1)}
                </Text>
              ) : (
                <Text style={[styles.clubHeroRatingMuted, theme === 'light' && styles.clubHeroRatingMutedLight]}>
                  New
                </Text>
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

  const announcementComposerMode = announcementComposer?.mode ?? null
  const announcementComposerOpen = tab === 'feed' && club?.isAdmin && Boolean(announcementComposer)

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
        subtitle="Share this link on social media or copy it into a message."
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
              <Feather name="copy" size={18} color={colors.text} />
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
                    if (announcementComposer?.mode === 'edit' && announcementComposer.announcementId === aid) {
                      closeAnnouncementComposer()
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
        onDismissed={onMemberMenuDismissed}
        title={memberMenuTarget?.name ?? 'Member actions'}
      >
        <View style={styles.memberActionSheetBody}>
          <ActionButton
            label="Remove from club"
            variant="outline"
            onPress={() => {
              if (!memberMenuTarget) return
              const nextTarget = memberMenuTarget
              pendingAfterMemberClose.current = { kind: 'kick', target: nextTarget }
              setMemberMenuTarget(null)
            }}
          />
          <ActionButton
            label="Ban from club"
            variant="neutral"
            onPress={() => {
              if (!memberMenuTarget) return
              const nextTarget = memberMenuTarget
              setBanReason('')
              pendingAfterMemberClose.current = { kind: 'ban', target: nextTarget }
              setMemberMenuTarget(null)
            }}
          />
        </View>
      </AppBottomSheet>
      <AppBottomSheet
        open={Boolean(bannedMenuTarget)}
        onClose={() => setBannedMenuTarget(null)}
        onDismissed={onBannedMenuDismissed}
        title={bannedMenuTarget?.name ?? 'Banned user actions'}
      >
        <View style={styles.memberActionSheetBody}>
          <ActionButton
            label="Unban user"
            variant="secondary"
            onPress={() => {
              if (!bannedMenuTarget) return
              const nextTarget = bannedMenuTarget
              pendingUnbanAfterBannedMenuClose.current = nextTarget
              setBannedMenuTarget(null)
            }}
          />
        </View>
      </AppBottomSheet>
      <AppBottomSheet
        open={Boolean(kickTarget)}
        onClose={() => setKickTarget(null)}
        title="Kick member?"
        subtitle={kickTarget?.name ? `Remove ${kickTarget.name} from the club?` : 'This user will be removed from the club.'}
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
        subtitle={banTarget?.name ? `${banTarget.name} will be banned from the club.` : 'This user will be banned from the club.'}
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
        subtitle={unbanTarget?.name ? `Allow ${unbanTarget.name} to join the club again?` : 'This user will be unbanned.'}
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

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['top']}>
      {hero}
      <PickleRefreshScrollView
        style={[styles.contentScroll, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshing={pullToRefresh.refreshing}
        onRefresh={pullToRefresh.onRefresh}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        bounces
      >
        {clubInfoBlock}
        {membershipActions}
        {segmentControl}

        <SegmentedContentFade activeKey={tab} segmentOrder={['events', 'feed', 'members']}>
        {tab === 'feed' ? (
          <View style={styles.tabContent}>
            {club.isAdmin ? (
                <Pressable
                  onPress={() => setAnnouncementComposer({ mode: 'create', draft: { ...EMPTY_ANNOUNCEMENT_DRAFT } })}
                  disabled={announcementComposerOpen}
                  style={({ pressed }) => [styles.createPostButton, pressed && styles.createPostButtonPressed]}
                >
                  <Feather name="plus" size={20} color={colors.primary} />
                  <Text style={styles.createPostButtonText}>Create new post</Text>
                </Pressable>
            ) : null}
            {club.announcements.length > 0 ? (
              <View style={{ gap: 12 }}>
                {club.announcements.map((announcement) => (
                  <SurfaceCard key={announcement.id} tone="soft" style={styles.card}>
                    <>
                      {announcement.title ? (
                        <Text style={styles.announcementTitle}>{announcement.title}</Text>
                      ) : null}
                      <LinkifiedText
                        text={announcement.body}
                        textStyle={styles.body}
                        onBeforeOpen={handleOpenExternalLink}
                        containerStyle={styles.announcementBodyWrap}
                      />
                      {announcement.poll ? (
                        <View style={styles.announcementPollWrap}>
                          <ClubAnnouncementPollCard
                            poll={announcement.poll}
                            onVote={
                              club.isFollowing || club.isAdmin
                                ? (optionId) =>
                                    voteAnnouncementPoll.mutate({
                                      clubId,
                                      announcementId: announcement.id,
                                      optionId,
                                    })
                                : undefined
                            }
                            loading={voteAnnouncementPoll.isPending}
                          />
                        </View>
                      ) : null}
                      {announcement.imageUrl ? (
                        <Pressable
                          onPress={() => setAnnouncementPreviewImage(announcement.imageUrl)}
                          style={({ pressed }) => [styles.announcementImageWrap, pressed && styles.announcementImagePressed]}
                        >
                          <Image
                            source={{ uri: announcement.imageUrl, cache: 'force-cache' }}
                            style={[
                              styles.announcementImage,
                              { aspectRatio: getAnnouncementImageAspectRatio(announcement.imageWidth, announcement.imageHeight) },
                            ]}
                            resizeMode="cover"
                          />
                        </Pressable>
                      ) : null}
                      {announcement.locationLatitude != null && announcement.locationLongitude != null ? (
                        <Pressable
                          onPress={() => handleOpenAnnouncementLocation(announcement)}
                          style={({ pressed }) => [styles.announcementLocationCard, pressed && styles.announcementImagePressed]}
                        >
                          <View style={styles.announcementLocationIconWrap}>
                            <Feather name="map-pin" size={16} color={colors.primary} />
                          </View>
                          <View style={styles.announcementLocationBody}>
                            <Text style={styles.announcementLocationTitle} numberOfLines={1}>
                              {announcement.locationTitle || 'Pinned location'}
                            </Text>
                            <Text style={styles.announcementLocationAddress} numberOfLines={2}>
                              {announcement.locationAddress ||
                                `${Number(announcement.locationLatitude).toFixed(5)}, ${Number(announcement.locationLongitude).toFixed(5)}`}
                            </Text>
                          </View>
                        </Pressable>
                      ) : null}
                      {announcement.fileUrl && announcement.fileName ? (
                        <Pressable
                          onPress={() =>
                            handleOpenExternalLink(String(announcement.fileUrl), () => Linking.openURL(String(announcement.fileUrl)))
                          }
                          style={({ pressed }) => [styles.announcementFileCard, pressed && styles.announcementImagePressed]}
                        >
                          <View style={styles.announcementFileIconWrap}>
                            <Feather name="file-text" size={18} color={colors.primary} />
                          </View>
                          <View style={styles.announcementFileBody}>
                            <Text style={styles.announcementFileName} numberOfLines={1}>
                              {announcement.fileName}
                            </Text>
                            <Text style={styles.announcementFileMeta} numberOfLines={1}>
                              {[announcement.fileMimeType, formatFileSize(announcement.fileSize)].filter(Boolean).join(' · ') || 'File'}
                            </Text>
                          </View>
                        </Pressable>
                      ) : null}
                      <View style={styles.announcementMetaRow}>
                        <View style={styles.announcementMetaLeft}>
                          <Text style={styles.smallMeta}>
                            {formatDateTime(announcement.createdAt)}
                            {announcement.createdByUser?.name ? ` · ${announcement.createdByUser.name}` : ''}
                          </Text>
                        </View>
                        <View style={styles.announcementActions}>
                          {(club.isFollowing || club.isAdmin) ? (
                            <Pressable
                              onPress={() => likeAnnouncement.mutate({ clubId, announcementId: announcement.id })}
                              disabled={likeAnnouncement.isPending}
                              style={({ pressed }) => [
                                styles.announcementLikeBtn,
                                announcement.viewerHasLiked && styles.announcementLikeBtnActive,
                                pressed && styles.announcementActionBtnPressed,
                              ]}
                            >
                              <Feather
                                name={announcement.viewerHasLiked ? 'heart' : 'heart'}
                                size={14}
                                color={announcement.viewerHasLiked ? colors.white : colors.textMuted}
                              />
                              <Text
                                style={[
                                  styles.announcementLikeText,
                                  announcement.viewerHasLiked && styles.announcementLikeTextActive,
                                ]}
                              >
                                {Math.max(0, Number(announcement.likeCount ?? 0))}
                              </Text>
                            </Pressable>
                          ) : null}
                          {club.isAdmin ? (
                            <>
                              <Pressable
                                onPress={() => {
                                  setAnnouncementComposer({
                                    mode: 'edit',
                                    announcementId: announcement.id,
                                    originalPollId: announcement.poll?.id ?? null,
                                    draft: getAnnouncementDraftFromAnnouncement(announcement),
                                  })
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
                            </>
                          ) : null}
                        </View>
                      </View>
                    </>
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
            <Pressable
              onPress={() => router.push(`/clubs/${club.id}/calendar`)}
              style={({ pressed }) => [styles.card, pressed && styles.calendarCardPressed]}
            >
              <SurfaceCard tone="soft" style={styles.cardInner}>
                <View style={styles.calendarHeaderRow}>
                  <View style={styles.calendarHeaderLeft}>
                    <View style={styles.calendarHeaderTextWrap}>
                      <Feather name="calendar" size={16} color={colors.primary} />
                      <View style={styles.calendarHeaderTextColumn}>
                        <Text style={styles.clubSectionTitle}>Calendar</Text>
                        <Text
                          numberOfLines={1}
                          style={[styles.clubSectionSubtitle, styles.calendarHeaderSubtitle]}
                        >
                          Upcoming club events
                        </Text>
                      </View>
                    </View>
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.textMuted} />
                </View>
                <View style={styles.calendarDivider} />
                <View style={styles.calendarPreviewWrap}>
                  {previewDayKeys.length === 0 ? (
                    <Text style={styles.calendarEmptyText}>No upcoming dates yet.</Text>
                  ) : (
                    previewDayKeys.map((dayKey) => {
                      const dayEvents = eventsByDay.get(dayKey) ?? []
                      const date = parseYmd(dayKey)
                      return (
                        <View key={dayKey} style={styles.calendarPreviewDay}>
                          <Text style={styles.calendarPreviewDayTitle}>
                            {date.toLocaleDateString('en-US', {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </Text>
                          {dayEvents.slice(0, 2).map((event) => (
                            <View key={event.id} style={styles.calendarPreviewEvent}>
                              <Text style={styles.calendarPreviewEventTitle} numberOfLines={1}>
                                {event.title}
                              </Text>
                              <Text style={styles.calendarPreviewEventMeta} numberOfLines={1}>
                                {formatEventTimeRange(event.startDate, event.endDate, event.timezone)}
                              </Text>
                            </View>
                          ))}
                          {dayEvents.length > 2 ? (
                            <Text style={styles.calendarPreviewMore}>+{dayEvents.length - 2} more</Text>
                          ) : null}
                        </View>
                      )
                    })
                  )}
                </View>
              </SurfaceCard>
            </Pressable>

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

        {membersTabContent}
        </SegmentedContentFade>
      </PickleRefreshScrollView>
      <ClubAnnouncementComposerSheet
        open={announcementComposerOpen}
        mode={announcementComposerMode === 'edit' ? 'edit' : 'create'}
        draft={announcementComposer?.draft ?? EMPTY_ANNOUNCEMENT_DRAFT}
        onChangeDraft={(updater) => {
          setAnnouncementComposer((current) =>
            current
              ? {
                  ...current,
                  draft: updater(current.draft),
                }
              : current
          )
        }}
        onClose={closeAnnouncementComposer}
        onSubmit={() => {
          void handleSubmitAnnouncement()
        }}
        submitLoading={announcementSubmitBusy || updateAnnouncement.isPending || createAnnouncement.isPending}
        submitDisabled={announcementSubmitBusy || updateAnnouncement.isPending || createAnnouncement.isPending}
      />
      <Modal
        visible={Boolean(announcementPreviewImage)}
        transparent
        animationType="fade"
        onRequestClose={() => setAnnouncementPreviewImage(null)}
      >
        <Pressable style={styles.announcementPreviewBackdrop} onPress={() => setAnnouncementPreviewImage(null)}>
          {announcementPreviewImage ? (
            <Image source={{ uri: announcementPreviewImage, cache: 'force-cache' }} style={styles.announcementPreviewImage} resizeMode="contain" />
          ) : null}
        </Pressable>
      </Modal>
      <FeedbackRatingModal
        open={clubFeedbackOpen}
        onClose={() => setClubFeedbackOpen(false)}
        entityType="CLUB"
        entityId={clubId}
        title="Rate this club"
        subtitle="Your feedback helps improve the club experience."
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
        onDismissed={() => {
          if (!openClubFeedbackAfterInfoClose) return
          setOpenClubFeedbackAfterInfoClose(false)
          if (!showRateClubAction) return
          setClubFeedbackOpen(true)
        }}
        title="Club rating"
        subtitle={
          feedbackCanPublish && feedbackAverage ? '' : `No public rating yet. At least 5 ratings are required.`
        }
        footer={
          showRateClubAction ? (
            <ActionButton
              label="Rate this club"
              onPress={() => {
                setClubFeedbackInfoOpen(false)
                setOpenClubFeedbackAfterInfoClose(true)
              }}
            />
          ) : undefined
        }
      >
        {feedbackCanPublish && feedbackAverage ? (
          <View style={styles.modalStarsRow}>
            {[1, 2, 3, 4, 5].map((star) => {
              const active = star <= Math.round(feedbackAverage)
              return (
                <RatingStarIcon key={star} size={40} filled={active} color="#F2C94C" inactiveColor="#C7C7CC" />
              )
            })}
            <Text style={styles.modalRatingValueInline}>{feedbackAverage.toFixed(1)}</Text>
          </View>
        ) : null}
        <View style={styles.feedbackChipsWrap}>
          {(feedbackSummaryQuery.data?.topChips ?? []).length > 0 ? (
            feedbackSummaryQuery.data!.topChips.map((chip) => (
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

const createStyles = (colors: ThemePalette) => StyleSheet.create({
  /** Фон страницы задаётся через `useAppTheme().colors.background` на корне и скролле. */
  screen: {
    flex: 1,
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
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  feedbackChipText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  feedbackChipCount: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  feedbackEmptyText: {
    color: colors.textMuted,
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
    color: colors.text,
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
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  clubMiniBarButtonPressed: {
    opacity: 1,
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.brandPrimaryBorder,
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
    backgroundColor: colors.primary,
  },
  clubChatUnreadText: {
    color: colors.white,
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
    backgroundColor: colors.surface,
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
    backgroundColor: colors.surfaceMuted,
  },
  clubHeroMain: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 4,
  },
  clubHeroTitle: {
    color: colors.text,
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
    color: colors.textMuted,
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
    borderColor: 'rgba(255, 255, 255, 0.28)',
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginLeft: 'auto',
    maxWidth: 120,
  },
  clubHeroRatingPillPressed: {
    opacity: 0.85,
  },
  clubHeroRatingPillLight: {
    borderColor: 'rgba(10,10,10,0.08)',
    backgroundColor: 'rgba(10,10,10,0.03)',
  },
  clubHeroRatingText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  clubHeroRatingTextLight: {
    color: colors.text,
  },
  clubHeroRatingMuted: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 13,
    fontWeight: '600',
  },
  clubHeroRatingMutedLight: {
    color: colors.textMuted,
  },
  shareSheetBlock: {
    gap: spacing.md,
    paddingTop: spacing.xs,
  },
  shareSheetLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  shareLinkRow: {
    minHeight: 48,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    paddingLeft: spacing.md,
    paddingRight: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  shareLinkText: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
  },
  shareCopyButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  shareCopyButtonPressed: {
    opacity: 1,
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.brandPrimaryBorder,
    transform: [{ scale: 0.94 }],
  },
  shareQrWrap: {
    alignItems: 'center',
  },
  shareQrCard: {
    padding: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
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
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  membershipHint: {
    color: colors.primary,
    fontSize: 14,
    paddingVertical: spacing.sm,
    fontWeight: '700',
  },
  clubInfoWrap: {
    marginTop: 0,
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
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  clubSectionSubtitle: {
    marginTop: 2,
    marginBottom: 8,
    color: colors.textMuted,
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
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  clubDescriptionText: {
    color: colors.textMuted,
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
    color: colors.primary,
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
    fontWeight: '600',
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
    borderColor: 'rgba(220, 38, 38, 0.28)',
  },
  /** Состояние загрузки списка участников — те же поля, что у `membersWrap`, плюс вертикальные отступы у блока. */
  membersLoadingWrap: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
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
  bansWrap: {
    marginTop: spacing.xl,
    gap: 0,
  },
  memberCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: colors.surface,
    shadowOpacity: 0,
    elevation: 0,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  memberCardOwner: {
    borderColor: colors.primary,
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
    borderColor: colors.brandPrimaryBorder,
    backgroundColor: colors.brandPrimaryTint,
  },
  rolePillText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 11,
    textTransform: 'lowercase',
  },
  memberMetaText: {
    marginTop: 2,
    color: colors.textMuted,
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
    borderColor: 'rgba(220, 38, 38, 0.2)',
    backgroundColor: 'rgba(220, 38, 38, 0.08)',
  },
  bannedPillText: {
    color: colors.danger,
    fontWeight: '700',
    fontSize: 11,
    textTransform: 'lowercase',
  },
  bannedReasonText: {
    marginTop: 2,
    color: colors.text,
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
  },
  cardInner: {
    borderRadius: 16,
    shadowOpacity: 0,
    elevation: 0,
  },
  body: {
    color: colors.text,
    lineHeight: 22,
  },
  announcementBodyWrap: {
    marginBottom: spacing.sm,
  },
  announcementPollWrap: {
    marginBottom: spacing.sm,
  },
  announcementTitle: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 20,
    marginBottom: 4,
  },
  announcementImageWrap: {
    marginBottom: spacing.sm,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
  },
  announcementImagePressed: {
    opacity: 0.94,
  },
  announcementImage: {
    width: '100%',
    backgroundColor: colors.surfaceMuted,
  },
  announcementLocationCard: {
    marginBottom: spacing.xs,
    minHeight: 72,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  announcementLocationIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.primaryGhost,
    alignItems: 'center',
    justifyContent: 'center',
  },
  announcementLocationBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  announcementLocationTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  announcementLocationAddress: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  announcementFileCard: {
    marginBottom: spacing.xs,
    minHeight: 72,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  announcementFileIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.primaryGhost,
    alignItems: 'center',
    justifyContent: 'center',
  },
  announcementFileBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  announcementFileName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  announcementFileMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  smallMeta: {
    marginTop: spacing.sm,
    color: colors.textMuted,
    fontSize: 12,
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
  announcementMetaLeft: {
    flex: 1,
    minWidth: 0,
  },
  announcementActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  announcementLikeBtn: {
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  announcementLikeBtnActive: {
    backgroundColor: colors.primary,
  },
  announcementLikeText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  announcementLikeTextActive: {
    color: colors.white,
  },
  announcementActionBtn: {
    padding: 6,
  },
  announcementActionBtnPressed: {
    opacity: 0.8,
  },
  announcementPreviewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  announcementPreviewImage: {
    width: '100%',
    height: '100%',
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
  calendarHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  calendarCardPressed: {
    opacity: 0.86,
  },
  calendarHeaderLeft: {
    flex: 1,
    minWidth: 0,
  },
  calendarHeaderTextWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
  },
  calendarHeaderTextColumn: {
    flex: 1,
    minWidth: 0,
  },
  calendarHeaderSubtitle: {
    marginTop: 4,
    marginBottom: 0,
  },
  calendarDivider: {
    marginTop: spacing.sm,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    opacity: 1,
  },
  calendarPreviewWrap: {
    marginTop: spacing.md,
    gap: 10,
  },
  calendarEmptyText: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
  calendarPreviewDay: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    gap: 6,
  },
  calendarPreviewDayTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  calendarPreviewEvent: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.brandPrimaryBorder,
    backgroundColor: colors.brandPrimaryTint,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  calendarPreviewEventTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  calendarPreviewEventMeta: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 12,
  },
  calendarPreviewMore: {
    color: colors.textMuted,
    fontSize: 12,
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
    color: colors.textMuted,
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
    fontWeight: '600',
    fontSize: 16,
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
