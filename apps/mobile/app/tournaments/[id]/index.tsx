import { useQuery } from '@tanstack/react-query'
import { Feather } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  KeyboardAvoidingView,
  Keyboard,
  Linking,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  ScrollView as RNScrollView,
  Text,
  View,
  useWindowDimensions,
  type ScrollView as RNScrollViewType,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'

import { AppBottomSheet, AppConfirmActions, AppInfoFooter } from '../../../src/components/AppBottomSheet'
import { EntityImage } from '../../../src/components/EntityImage'
import { FeedbackEntityContextCard } from '../../../src/components/FeedbackEntityContextCard'
import { FeedbackRatingModal } from '../../../src/components/FeedbackRatingModal'
import { PickleRefreshScrollView } from '../../../src/components/PickleRefreshScrollView'
import { RemoteUserAvatar } from '../../../src/components/RemoteUserAvatar'
import { ChatComposer } from '../../../src/components/ChatComposer'
import { ChatThreadMessageList } from '../../../src/components/ChatThreadMessageList'
import { BackCircleButton } from '../../../src/components/navigation/BackCircleButton'
import {
  ActionButton,
  EmptyState,
  LoadingBlock,
  SegmentedControl,
  SectionTitle,
  SurfaceCard,
} from '../../../src/components/ui'
import { TopBar } from '../../../src/components/navigation/TopBar'
import { OptionalLinearGradient } from '../../../src/components/OptionalLinearGradient'
import { RatingStarIcon } from '../../../src/components/icons/RatingStarIcon'
import { fetchWithTimeout } from '../../../src/lib/apiFetch'
import { buildApiUrl, buildWebUrl, FEEDBACK_API_ENABLED } from '../../../src/lib/config'
import { formatDateRange, formatLocation, formatMoney } from '../../../src/lib/formatters'
import { getDivisionSlotMetrics, getPlayersPerTeam, getTournamentSlotMetrics } from '../../../src/lib/tournamentSlots'
import { trpc } from '../../../src/lib/trpc'
import { radius, spacing, type ThemePalette } from '../../../src/lib/theme'
/** Как в турнирном чате: `COMPOSER_IDLE_BOTTOM_EXTRA` */
const COMMENTS_COMPOSER_IDLE_BOTTOM_EXTRA = 24
/** Приблизительная высота composer внутри карточки Comments (wrap padding + input). */
const COMMENTS_COMPOSER_ESTIMATED_H = 84

import { useAuth } from '../../../src/providers/AuthProvider'
import { useAppTheme } from '../../../src/providers/ThemeProvider'
import { usePullToRefresh } from '../../../src/hooks/usePullToRefresh'
import { useTournamentAccessInfo } from '../../../src/hooks/useTournamentAccessInfo'

const longDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
})

const formatHeroDateRange = (start?: string | Date | null, end?: string | Date | null) => {
  if (!start) return 'Date TBD'

  const startDate = new Date(start)
  if (!end) {
    return longDateFormatter.format(startDate)
  }

  const endDate = new Date(end)
  const sameMonthAndYear =
    startDate.getFullYear() === endDate.getFullYear() &&
    startDate.getMonth() === endDate.getMonth()

  if (sameMonthAndYear) {
    return `${startDate.toLocaleString('en-US', {
      month: 'long',
    })} ${startDate.getDate()}-${endDate.getDate()}, ${endDate.getFullYear()}`
  }

  return `${longDateFormatter.format(startDate)} - ${longDateFormatter.format(endDate)}`
}

const formatTournamentFormat = (format?: string | null) => {
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
      return 'Tournament'
  }
}

/** Паттерн точек как на карточке ивента (hero на 40% ширины с затуханием). */
const EVENT_PATTERN_EDGE = 2
const EVENT_PATTERN_STEP = 7
const EVENT_PATTERN_DIAG = 3
const EVENT_PATTERN_DOT = 3

function EventHeroDotPattern({
  style,
  dotStyle,
}: {
  style: any
  dotStyle: any
}) {
  const [layout, setLayout] = useState({ w: 0, h: 0 })
  const dots = useMemo(() => {
    const w = layout.w
    const h = layout.h
    if (w < 4 || h < 4) return []
    const EDGE = EVENT_PATTERN_EDGE
    const STEP = EVENT_PATTERN_STEP
    const DIAG = EVENT_PATTERN_DIAG
    const DOT = EVENT_PATTERN_DOT
    const spanX = Math.max(1, w - EDGE * 2)
    const rowMax = Math.max(0, Math.floor((h - EDGE - DOT) / STEP))
    const out: Array<{ key: string; left: number; top: number; opacity: number }> = []
    let index = 0
    for (let row = 0; row <= rowMax; row += 1) {
      const top = EDGE + row * STEP
      if (top + DOT > h) continue
      const colStart = Math.ceil((-EDGE - row * DIAG) / STEP)
      const colEnd = Math.floor((w - DOT - EDGE - row * DIAG) / STEP)
      for (let col = colStart; col <= colEnd; col += 1) {
        const left = EDGE + col * STEP + row * DIAG
        if (left + DOT > w) continue
        const nx = spanX > 0 ? (left - EDGE) / spanX : 0
        const fade = 1 - Math.min(1, nx) ** 0.42
        const opacity = Math.max(0.04, Math.min(0.58, 0.06 + 0.52 * fade))
        out.push({ key: `event-hero-dot-${index}`, left, top, opacity })
        index += 1
      }
    }
    return out
  }, [layout.h, layout.w])

  return (
    <View
      pointerEvents="none"
      style={style}
      collapsable={false}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout
        if (width <= 0 || height <= 0) return
        setLayout((prev) => (prev.w === width && prev.h === height ? prev : { w: width, h: height }))
      }}
    >
      <OptionalLinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
        fallbackColor="rgba(255,255,255,0.08)"
      >
        {dots.map((dot) => (
          <View
            key={dot.key}
            pointerEvents="none"
            style={[dotStyle, { left: dot.left, top: dot.top, opacity: dot.opacity }]}
          />
        ))}
      </OptionalLinearGradient>
    </View>
  )
}

type DetailTab = 'info' | 'divisions' | 'dashboard'

type StatusMeta = {
  label: string
  backgroundColor: string
}

const fetchTournamentBoardById = async (id: string) => {
  const response = await fetchWithTimeout(
    buildApiUrl(`/api/trpc/public.getBoardById?input=${encodeURIComponent(JSON.stringify({ id }))}`)
  )
  const payload = await response.json()

  if (!response.ok || payload?.error) {
    throw new Error(payload?.error?.message || `Failed to load tournament ${id}`)
  }

  return payload?.result?.data ?? null
}

const fetchFullTournamentById = async (id: string) => {
  const response = await fetchWithTimeout(
    buildApiUrl(`/api/trpc/public.getTournamentById?input=${encodeURIComponent(JSON.stringify({ id }))}`)
  )
  const payload = await response.json()

  if (!response.ok || payload?.error) {
    throw new Error(payload?.error?.message || `Failed to load full tournament ${id}`)
  }

  return payload?.result?.data ?? null
}

const normalizeTournamentForDetail = (tournament: any) => ({
  ...tournament,
  prizes: Array.isArray(tournament?.prizes) ? tournament.prizes : [],
  divisions: Array.isArray(tournament?.divisions)
    ? tournament.divisions.map((division: any) => ({
        ...division,
        teamKind: division?.teamKind ?? null,
        teams: Array.isArray(division?.teams) ? division.teams : undefined,
      }))
    : [],
})

const isRegistrationOpen = (tournament: {
  registrationStartDate?: string | Date | null
  registrationEndDate?: string | Date | null
  startDate: string | Date
}) => {
  const start = tournament.registrationStartDate
    ? new Date(tournament.registrationStartDate)
    : new Date(tournament.startDate)
  const end = tournament.registrationEndDate
    ? new Date(tournament.registrationEndDate)
    : new Date(tournament.startDate)
  const now = new Date()
  return now >= start && now <= end
}

const getStatusMeta = (
  tournament: any,
  myStatus?: string | null,
  hasPrivilegedAccess = false
): StatusMeta => {
  if (hasPrivilegedAccess) {
    return { label: 'Admin', backgroundColor: 'rgba(40, 205, 65, 0.92)' }
  }

  if (myStatus === 'active') {
    return { label: 'Registered', backgroundColor: 'rgba(40, 205, 65, 0.92)' }
  }
  if (myStatus === 'waitlisted') {
    return { label: 'Waitlist', backgroundColor: 'rgba(255, 214, 10, 0.88)' }
  }
  if (new Date(tournament.endDate).getTime() < Date.now() || !isRegistrationOpen(tournament)) {
    return { label: 'Closed', backgroundColor: 'rgba(10, 10, 10, 0.58)' }
  }

  const slotMetrics = getTournamentSlotMetrics(tournament)
  if (slotMetrics.createdSlots !== null && slotMetrics.createdSlots > 0 && slotMetrics.openSlots === 0) {
    return { label: 'Waitlist', backgroundColor: 'rgba(255, 214, 10, 0.88)' }
  }
  if (slotMetrics.fillRatio !== null && slotMetrics.fillRatio >= 0.75) {
    return { label: 'Filling Fast', backgroundColor: 'rgba(255, 214, 10, 0.88)' }
  }

  return { label: 'Open', backgroundColor: 'rgba(0, 232, 124, 0.9)' }
}

function getCompactStatusIcon(label: string): keyof typeof Feather.glyphMap {
  const s = label.trim().toLowerCase()
  if (!s) return 'info'
  if (s.includes('admin')) return 'shield'
  if (s.includes('registered')) return 'check-circle'
  if (s.includes('wait')) return 'clock'
  if (s.includes('filling')) return 'trending-up'
  if (s.includes('closed')) return 'x-circle'
  if (s.includes('open')) return 'unlock'
  return 'info'
}

function isCompactHeroStatus(label: string) {
  const s = label.trim().toLowerCase()
  return s === 'admin' || s === 'registered' || s === 'waitlist'
}

export default function TournamentDetailScreen() {
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const params = useLocalSearchParams<{ id: string; payment?: string }>()
  const tournamentId = String(params.id ?? '')
  const paymentState = typeof params.payment === 'string' ? params.payment : null
  const { token, user } = useAuth()
  const { height: windowHeight } = useWindowDimensions()
  const isAuthenticated = Boolean(token)
  const api = trpc as any
  const utils = trpc.useUtils() as any
  const scrollRef = useRef<RNScrollViewType>(null)
  const commentsThreadRef = useRef<RNScrollViewType>(null)

  const [activeTab, setActiveTab] = useState<DetailTab>('info')
  const [leaveTournamentSheetOpen, setLeaveTournamentSheetOpen] = useState(false)
  const [paymentErrorMessage, setPaymentErrorMessage] = useState<string | null>(null)
  const [tournamentFeedbackOpen, setTournamentFeedbackOpen] = useState(false)
  const [tournamentFeedbackInfoOpen, setTournamentFeedbackInfoOpen] = useState(false)
  const [tdFeedbackOpen, setTdFeedbackOpen] = useState(false)
  const [tdFeedbackInfoOpen, setTdFeedbackInfoOpen] = useState(false)
  const [tournamentDescriptionExpanded, setTournamentDescriptionExpanded] = useState(false)
  const [tournamentDescriptionExpandable, setTournamentDescriptionExpandable] = useState(false)
  const [commentDraft, setCommentDraft] = useState('')
  const [commentsAnchorY, setCommentsAnchorY] = useState<number | null>(null)
  const [pendingScrollToComments, setPendingScrollToComments] = useState(false)
  const [commentsDeleteTargetId, setCommentsDeleteTargetId] = useState<string | null>(null)
  const [commentsKeyboardVisible, setCommentsKeyboardVisible] = useState(false)

  const cachedBoardsQuery = api.public.listBoards.useQuery(undefined, { enabled: false })
  const cachedTournament = useMemo(
    () =>
      (((cachedBoardsQuery.data ?? []) as any[]).find((item) => item.id === tournamentId) as any | undefined) ??
      null,
    [cachedBoardsQuery.data, tournamentId]
  )
  const initialTournamentData = useMemo(
    () => (cachedTournament ? normalizeTournamentForDetail(cachedTournament) : undefined),
    [cachedTournament]
  )

  const tournamentQuery = useQuery({
    queryKey: ['mobile-public-getBoardById', tournamentId],
    enabled: Boolean(tournamentId),
    retry: false,
    initialData: initialTournamentData,
    queryFn: () => fetchTournamentBoardById(tournamentId),
  })
  const fullTournamentQuery = useQuery({
    queryKey: ['mobile-public-getTournamentById', tournamentId],
    enabled: Boolean(tournamentId),
    retry: false,
    queryFn: () => fetchFullTournamentById(tournamentId),
  })
  const protectedQueriesEnabled =
    Boolean(tournamentId) && isAuthenticated && Boolean(tournamentQuery.data)
  const myStatusQuery = api.registration.getMyStatus.useQuery(
    { tournamentId },
    { enabled: protectedQueriesEnabled }
  )
  const accessQuery = useTournamentAccessInfo(tournamentId, protectedQueriesEnabled)
  const myInvitationQuery = api.tournamentInvitation.getMineByTournament.useQuery(
    { tournamentId },
    { enabled: protectedQueriesEnabled }
  )

  const acceptInvitation = api.tournamentInvitation.accept.useMutation({
    onSuccess: async (result: any) => {
      await Promise.all([
        utils.notification.list.invalidate(),
        myInvitationQuery.refetch(),
        myStatusQuery.refetch(),
      ])
      router.push(`/tournaments/${result.tournamentId}/register`)
    },
  })
  const declineInvitation = api.tournamentInvitation.decline.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.notification.list.invalidate(),
        myInvitationQuery.refetch(),
      ])
    },
  })
  const createCheckout = api.payment.createCheckoutSession.useMutation()
  const cancelRegistration = api.registration.cancelRegistration.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.registration.getMyStatus.invalidate({ tournamentId }),
        utils.registration.getMyStatuses.invalidate(),
        myStatusQuery.refetch(),
        tournamentQuery.refetch(),
        fullTournamentQuery.refetch(),
      ])
    },
  })

  const dashboardEmbedUrl = useMemo(() => {
    if (!tournamentId) return null

    const params = new URLSearchParams()
    const divisionId =
      typeof myStatusQuery.data?.divisionId === 'string' ? myStatusQuery.data.divisionId : null
    const teamId = typeof myStatusQuery.data?.teamId === 'string' ? myStatusQuery.data.teamId : null

    if (divisionId) params.set('divisionId', divisionId)
    if (teamId) params.set('teamId', teamId)

    const query = params.toString()
    return buildWebUrl(`/scoreboard/${tournamentId}/embed${query ? `?${query}` : ''}`)
  }, [myStatusQuery.data?.divisionId, myStatusQuery.data?.teamId, tournamentId])

  const dashboardPublicUrl = useMemo(
    () => (tournamentId ? buildWebUrl(`/scoreboard/${tournamentId}`) : null),
    [tournamentId]
  )
  const dashboardHeight = Math.max(Math.round(windowHeight * 0.95), 640)

  useEffect(() => {
    if (!tournamentId || !paymentState) return

    router.replace(`/tournaments/${tournamentId}`)
    void utils.registration.getMyStatuses.invalidate()
    void Promise.all([
      myStatusQuery.refetch(),
      tournamentQuery.refetch(),
      fullTournamentQuery.refetch(),
    ])

    if (paymentState === 'success') {
      const timeoutId = setTimeout(() => {
        void Promise.all([
          myStatusQuery.refetch(),
          tournamentQuery.refetch(),
          fullTournamentQuery.refetch(),
        ])
      }, 1500)

      return () => clearTimeout(timeoutId)
    }
  }, [
    fullTournamentQuery,
    myStatusQuery,
    paymentState,
    tournamentId,
    tournamentQuery,
    utils.registration.getMyStatuses,
  ])

  const onRefreshTournamentDetail = useCallback(async () => {
    await Promise.all([
      tournamentQuery.refetch(),
      fullTournamentQuery.refetch(),
      myStatusQuery.refetch(),
      accessQuery.refetch(),
      myInvitationQuery.refetch(),
      commentsQuery.refetch(),
      commentCountQuery.refetch(),
    ])
  }, [accessQuery, fullTournamentQuery, myInvitationQuery, myStatusQuery, tournamentQuery, commentsQuery, commentCountQuery])

  const pullToRefresh = usePullToRefresh(onRefreshTournamentDetail)

  if (tournamentQuery.isLoading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <TopBar />
        <View style={styles.loadingWrap}>
          <LoadingBlock label="Loading tournament..." />
        </View>
      </SafeAreaView>
    )
  }

  if (tournamentQuery.isError) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <TopBar />
        <View style={[styles.loadingWrap, { gap: 16 }]}>
          <EmptyState
            title="Could not load tournament"
            body="Check your network and EXPO_PUBLIC_API_URL, then try again."
          />
          <ActionButton label="Try again" onPress={() => tournamentQuery.refetch()} />
        </View>
      </SafeAreaView>
    )
  }

  if (!tournamentQuery.data) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <TopBar />
        <View style={styles.loadingWrap}>
          <SurfaceCard>
            <Text style={styles.muted}>Tournament not found.</Text>
          </SurfaceCard>
        </View>
      </SafeAreaView>
    )
  }

  const tournament = tournamentQuery.data as any
  const tdUserId = typeof tournament?.user?.id === 'string' ? tournament.user.id : null

  const commentCountQuery = api.comment.getTournamentCommentCount.useQuery(
    { tournamentId },
    { enabled: Boolean(tournamentId), retry: false },
  )
  const commentsQuery = api.comment.getTournamentComments.useQuery(
    { tournamentId },
    { enabled: Boolean(tournamentId), retry: false },
  )
  const createComment = api.comment.createComment.useMutation({
    onSuccess: async () => {
      setCommentDraft('')
      await Promise.all([commentsQuery.refetch(), commentCountQuery.refetch()])
      requestAnimationFrame(() => {
        commentsThreadRef.current?.scrollToEnd({ animated: true })
      })
    },
  })
  const deleteComment = api.comment.deleteComment.useMutation({
    onSuccess: async () => {
      await Promise.all([commentsQuery.refetch(), commentCountQuery.refetch()])
    },
  })
  const feedbackSummaryQuery = api.feedback.getEntitySummary.useQuery(
    { entityType: 'TOURNAMENT', entityId: tournamentId },
    { enabled: FEEDBACK_API_ENABLED && Boolean(tournamentId) && isAuthenticated, retry: false },
  )
  const hasRatedQuery = api.feedback.hasRated.useQuery(
    { targets: [{ entityType: 'TOURNAMENT', entityId: tournamentId }] },
    { enabled: FEEDBACK_API_ENABLED && Boolean(tournamentId) && isAuthenticated, retry: false },
  )
  const hasRatedTournament = Boolean(hasRatedQuery.data?.map?.[`TOURNAMENT:${tournamentId}`])
  const tdSummaryQuery = api.feedback.getEntitySummary.useQuery(
    { entityType: 'TD', entityId: tdUserId ?? '' },
    { enabled: FEEDBACK_API_ENABLED && Boolean(tdUserId) && isAuthenticated, retry: false },
  )
  const tdHasRatedQuery = api.feedback.hasRated.useQuery(
    { targets: tdUserId ? [{ entityType: 'TD', entityId: tdUserId }] : [] },
    { enabled: FEEDBACK_API_ENABLED && Boolean(tdUserId) && isAuthenticated, retry: false },
  )
  const hasRatedTd = Boolean(tdUserId && tdHasRatedQuery.data?.map?.[`TD:${tdUserId}`])
  const feedbackAverage = feedbackSummaryQuery.data?.averageRating
  const feedbackTotal = feedbackSummaryQuery.data?.total ?? 0
  const feedbackCanPublish = Boolean(feedbackSummaryQuery.data?.canPublish)
  const fallbackSeed = String(tournamentId).split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  const feedbackAverageEffective =
    feedbackAverage ?? (__DEV__ ? Number((3.8 + (fallbackSeed % 13) / 20).toFixed(1)) : null)
  const feedbackTotalEffective = feedbackTotal > 0 ? feedbackTotal : __DEV__ ? 5 + (fallbackSeed % 21) : 0
  const feedbackCanPublishEffective = feedbackCanPublish || (__DEV__ && feedbackTotalEffective >= 5)
  const tdAverage = tdSummaryQuery.data?.averageRating
  const tdTotal = tdSummaryQuery.data?.total ?? 0
  const tdCanPublish = Boolean(tdSummaryQuery.data?.canPublish)
  const tdFallbackSeed = String(tdUserId ?? tournamentId)
    .split('')
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  const tdAverageEffective = tdAverage ?? (__DEV__ ? Number((4 + (tdFallbackSeed % 9) / 20).toFixed(1)) : null)
  const tdTotalEffective = tdTotal > 0 ? tdTotal : __DEV__ ? 5 + (tdFallbackSeed % 17) : 0
  const tdCanPublishEffective = tdCanPublish || (__DEV__ && tdTotalEffective >= 5)
  const myStatus = myStatusQuery.data?.status
  const accessInfo = accessQuery.data?.userAccessInfo
  const isOwner = Boolean(user?.id && tournament.user?.id === user.id)
  const hasPrivilegedAccess = Boolean(isOwner || accessInfo?.isOwner || accessInfo?.accessLevel === 'ADMIN')
  const pendingInvitation = myInvitationQuery.data?.status === 'PENDING' ? myInvitationQuery.data : null
  const entryFeeCents =
    typeof tournament.entryFeeCents === 'number'
      ? tournament.entryFeeCents
      : Number(tournament.entryFee ?? 0) > 0
      ? Math.round(Number(tournament.entryFee) * 100)
      : 0
  const feeLabel = entryFeeCents > 0 ? formatMoney(entryFeeCents) : '$ Free'
  const quickFeeLabel = entryFeeCents > 0 ? `$${Math.round(entryFeeCents / 100)}+` : 'Free'
  const venueNameLabel = String(tournament.venueName ?? '').trim()
  const venueAddressLabel = String(tournament.venueAddress ?? '').trim()
  const locationLabel = venueAddressLabel || 'Location not set'
  const playerCount = Number(tournament._count?.players ?? 0)
  const totalTeams = ((tournament.divisions ?? []) as any[]).reduce(
    (sum, division) => sum + Number(division?._count?.teams ?? 0),
    0
  )
  const tournamentAvailabilityData = ((fullTournamentQuery.data as any | null) ?? tournament) as any
  const registrationOpen = isRegistrationOpen(tournamentAvailabilityData)
  const organizerLabel = tournament.user?.name || tournament.user?.email || 'Piqle'
  const canLeaveTournament = myStatus === 'active'
  const canPayNow = myStatus === 'active' && entryFeeCents > 0 && myStatusQuery.data?.isPaid === false
  const shouldShowRegisterCta =
    registrationOpen &&
    !pendingInvitation &&
    myStatus !== 'active' &&
    myStatus !== 'waitlisted'
  const ctaLabel = pendingInvitation
    ? acceptInvitation.isPending
      ? 'Accepting...'
      : 'Accept Invitation'
    : canLeaveTournament
    ? cancelRegistration.isPending
      ? 'Leaving...'
      : 'Leave Tournament'
    : myStatus === 'waitlisted'
    ? 'View Waitlist Spot'
    : shouldShowRegisterCta
    ? 'Register for Tournament'
    : hasPrivilegedAccess
    ? 'Manage Registration'
    : `Register Now • ${feeLabel}`
  const amenityLabels = [
    locationLabel !== 'Location not set' ? 'Venue Details' : null,
    tournament.publicSlug ? 'Public Scoreboard' : null,
    tournament.registrationEndDate ? 'Online Registration' : null,
    tournament.divisions.length > 1 ? 'Multiple Divisions' : null,
    entryFeeCents > 0 ? 'Paid Entry' : 'Free Entry',
  ].filter(Boolean) as string[]
  const organizerMetaLabel = `${tournament.divisions.length} divisions • ${playerCount || totalTeams} ${
    playerCount ? 'players' : 'teams'
  }`
  const showPrimaryCta =
    Boolean(pendingInvitation) ||
    shouldShowRegisterCta ||
    canLeaveTournament ||
    myStatus === 'waitlisted' ||
    hasPrivilegedAccess
  const shouldShowStickyCta = false
  const dashboardRegistrationSummary =
    myStatusQuery.data?.status === 'active' &&
    myStatusQuery.data?.divisionName &&
    myStatusQuery.data?.teamName
      ? `${myStatusQuery.data.divisionName} · ${myStatusQuery.data.teamName}`
      : null
  const statusMeta = getStatusMeta(tournamentAvailabilityData, myStatus, hasPrivilegedAccess)
  const compactHeroStatusLabel = isCompactHeroStatus(statusMeta.label) ? statusMeta.label : null
  const tournamentDescription = String(tournament.description ?? '').trim()
  const tournamentForClubMeta = (tournamentAvailabilityData ?? tournament) as any
  const linkedClubId = String(
    tournamentForClubMeta.clubId ??
      tournamentForClubMeta.club?.id ??
      tournamentForClubMeta.hostClubId ??
      tournamentForClubMeta.hostClub?.id ??
      ''
  ).trim()
  const linkedClubQuery = api.club.get.useQuery(
    { id: linkedClubId },
    { enabled: Boolean(linkedClubId), retry: false }
  )
  const clubsLookupQuery = api.club.list.useQuery(undefined, {
    enabled: !linkedClubId && Boolean(venueNameLabel),
    retry: false,
  })
  const matchedClubByVenue = useMemo(() => {
    if (linkedClubId || !venueNameLabel) return null
    const clubs = (clubsLookupQuery.data ?? []) as Array<{ id?: string; name?: string }>
    const needle = venueNameLabel.trim().toLowerCase()
    return clubs.find((club) => String(club?.name ?? '').trim().toLowerCase() === needle) ?? null
  }, [clubsLookupQuery.data, linkedClubId, venueNameLabel])
  const resolvedClubId = linkedClubId || String(matchedClubByVenue?.id ?? '').trim()
  const linkedClubName = String(
    linkedClubQuery.data?.name ??
    matchedClubByVenue?.name ??
    tournamentForClubMeta.club?.name ??
      tournamentForClubMeta.hostClub?.name ??
      ''
  ).trim()
  const clubLabel =
    linkedClubName ||
    venueNameLabel ||
    (linkedClubQuery.isLoading && resolvedClubId ? 'Loading club...' : '')
  const hasLinkedClubLabel = Boolean(clubLabel)
  const canOpenLinkedClub = Boolean(resolvedClubId)
  const nowTs = Date.now()
  const tournamentStartTs = tournament.startDate ? new Date(tournament.startDate).getTime() : null
  const tournamentEndTs = tournament.endDate ? new Date(tournament.endDate).getTime() : null
  const timelineStatusLabel =
    tournamentEndTs != null && nowTs > tournamentEndTs
      ? 'Past'
      : tournamentStartTs != null && nowTs < tournamentStartTs
      ? 'Upcoming'
      : 'Ongoing'
  const divisionsForDisplay = Array.isArray((fullTournamentQuery.data as any)?.divisions)
    ? (((fullTournamentQuery.data as any)?.divisions ?? []) as any[])
    : ((tournament.divisions ?? []) as any[])
  const tournamentDateTimeRangeLabel = formatDateRange(tournament.startDate, tournament.endDate)
  const registrationDateTimeRangeLabel =
    tournamentAvailabilityData?.registrationStartDate || tournamentAvailabilityData?.registrationEndDate
      ? formatDateRange(tournamentAvailabilityData?.registrationStartDate, tournamentAvailabilityData?.registrationEndDate)
      : null

  const handlePayNow = async () => {
    try {
      const result = await createCheckout.mutateAsync({
        tournamentId,
        returnPath: `/tournaments/${tournamentId}`,
      })
      if (result.url) {
        await Linking.openURL(result.url)
      }
    } catch (error: any) {
      setPaymentErrorMessage(error?.message || 'Unable to open checkout right now.')
    }
  }

  const handlePrimaryAction = () => {
    if (pendingInvitation) {
      acceptInvitation.mutate({ invitationId: pendingInvitation.id })
      return
    }

    if (!isAuthenticated) {
      router.push('/sign-in')
      return
    }

    if (canLeaveTournament) {
      setLeaveTournamentSheetOpen(true)
      return
    }

    router.push(`/tournaments/${tournament.id}/register`)
  }

  const handleLeaveTournament = () => {
    if (!isAuthenticated) {
      router.push('/sign-in')
      return
    }
    if (cancelRegistration.isPending) return
    setLeaveTournamentSheetOpen(true)
  }

  const handleShare = async () => {
    const url = buildWebUrl(`/scoreboard/${tournament.id}`)
    try {
      await Share.share({
        message: `${tournament.title}\n${url}`,
        url,
      })
    } catch {}
  }

  const handleOpenDashboard = () => {
    if (!dashboardPublicUrl) return
    void Linking.openURL(dashboardPublicUrl)
  }

  const handleOpenMaps = () => {
    if (!locationLabel || locationLabel === 'Location not set') return
    void Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationLabel)}`
    )
  }

  const handleOpenOrganizerProfile = () => {
    if (!tournament.user?.id) return
    router.push({ pathname: '/profile/[id]', params: { id: tournament.user.id } })
  }

  const scrollToComments = useCallback(() => {
    setActiveTab('info')
    if (commentsAnchorY == null) {
      setPendingScrollToComments(true)
      return
    }
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, commentsAnchorY - 12), animated: true })
    })
  }, [commentsAnchorY])

  const scrollToCommentsEnd = useCallback(() => {
    setActiveTab('info')
    if (commentsAnchorY == null) {
      setPendingScrollToComments(true)
      return
    }
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true })
      commentsThreadRef.current?.scrollToEnd({ animated: true })
    })
  }, [commentsAnchorY])

  useEffect(() => {
    if (!pendingScrollToComments) return
    if (activeTab !== 'info') return
    if (commentsAnchorY == null) return
    setPendingScrollToComments(false)
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, commentsAnchorY - 12), animated: true })
    })
  }, [activeTab, commentsAnchorY, pendingScrollToComments])

  useEffect(() => {
    const showEv = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEv = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const s = Keyboard.addListener(showEv, () => setCommentsKeyboardVisible(true))
    const h = Keyboard.addListener(hideEv, () => setCommentsKeyboardVisible(false))
    const didShow = Keyboard.addListener('keyboardDidShow', () => {
      scrollToCommentsEnd()
      setTimeout(() => {
        commentsThreadRef.current?.scrollToEnd({ animated: true })
      }, 60)
    })
    return () => {
      s.remove()
      h.remove()
      didShow.remove()
    }
  }, [scrollToCommentsEnd])

  const commentsLen = (commentsQuery.data ?? []).length
  useEffect(() => {
    if (!commentsLen) return
    requestAnimationFrame(() => {
      commentsThreadRef.current?.scrollToEnd({ animated: true })
    })
  }, [commentsLen])

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={styles.heroWrap}>
          <View style={styles.eventMiniBar}>
            <BackCircleButton onPress={() => router.back()} iconSize={18} style={styles.eventMiniBarButton} />
            <View style={styles.eventMiniBarActions}>
              <Pressable
                onPress={scrollToCommentsEnd}
                style={({ pressed }) => [styles.eventMiniBarButton, pressed && styles.eventMiniBarButtonPressed]}
                accessibilityLabel="Comments"
              >
                <Feather name="message-circle" size={18} color={colors.text} />
                {Number(commentCountQuery.data ?? 0) > 0 ? (
                  <View style={styles.commentBadge}>
                    <Text style={styles.commentBadgeText}>
                      {Number(commentCountQuery.data ?? 0) > 99 ? '99+' : String(commentCountQuery.data)}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
              <Pressable
                onPress={handleShare}
                style={({ pressed }) => [styles.eventMiniBarButton, pressed && styles.eventMiniBarButtonPressed]}
              >
                <Feather name="share-2" size={18} color={colors.text} />
              </Pressable>
              {canLeaveTournament ? (
                <Pressable
                  onPress={() => setLeaveTournamentSheetOpen(true)}
                  style={({ pressed }) => [styles.eventMiniBarButton, pressed && styles.eventMiniBarButtonPressed]}
                  accessibilityLabel="Leave tournament"
                >
                  <Feather name="log-out" size={18} color={colors.text} />
                </Pressable>
              ) : null}
            </View>
          </View>

          <SurfaceCard padded={false} style={styles.eventHeroCard}>
            <View style={styles.eventHeroHeader}>
              <EventHeroDotPattern style={styles.eventHeroPattern} dotStyle={styles.eventHeroPatternDot} />
              <View style={styles.eventHeroRow}>
                <View style={styles.eventHeroAvatarWrap}>
                  <EntityImage
                    uri={tournament.image}
                    style={styles.eventHeroAvatar}
                    resizeMode="cover"
                    placeholderResizeMode="contain"
                  />
                </View>
                <View style={styles.eventHeroMain}>
                  <View style={styles.eventHeroTitleRow}>
                    <Text style={styles.eventHeroTitle} numberOfLines={2}>
                      {tournament.title}
                    </Text>
                    {compactHeroStatusLabel ? (
                      <View style={styles.eventHeroCompactStatusBadge}>
                        <Feather name={getCompactStatusIcon(compactHeroStatusLabel)} size={14} color={colors.white} />
                        <Text style={styles.eventHeroCompactStatusText} numberOfLines={1}>
                          {compactHeroStatusLabel}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.eventHeroMetaRow}>
                    <View style={styles.eventHeroChip}>
                      <Text style={styles.eventHeroChipText} numberOfLines={1}>
                        {formatTournamentFormat(tournament.format)}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => setTournamentFeedbackInfoOpen(true)}
                      style={({ pressed }) => [styles.eventHeroRatingPill, pressed && styles.eventHeroRatingPillPressed]}
                    >
                      <RatingStarIcon size={16} filled color="#F4B000" />
                      {feedbackCanPublishEffective && feedbackAverageEffective ? (
                        <Text style={styles.eventHeroRatingText}>{feedbackAverageEffective.toFixed(1)}</Text>
                      ) : (
                        <Text style={styles.eventHeroRatingMuted}>New</Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              </View>
            </View>
          </SurfaceCard>
        </View>

        <PickleRefreshScrollView
          ref={scrollRef as any}
          style={styles.contentScroll}
          contentContainerStyle={[styles.scrollContent, styles.scrollContentNoCta]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshing={pullToRefresh.refreshing}
          onRefresh={pullToRefresh.onRefresh}
          bounces
        >
        {tournamentDescription ? (
          <View style={styles.descriptionSection}>
            <View style={styles.descriptionBlock}>
              {!tournamentDescriptionExpanded && !tournamentDescriptionExpandable ? (
                <Text
                  style={[styles.descriptionText, styles.descriptionMeasureText]}
                  onTextLayout={(event) => {
                    if (tournamentDescriptionExpanded || tournamentDescriptionExpandable) return
                    if (event.nativeEvent.lines.length > 3) {
                      setTournamentDescriptionExpandable(true)
                    }
                  }}
                >
                  {tournamentDescription}
                </Text>
              ) : null}
              <Text style={styles.descriptionText} numberOfLines={tournamentDescriptionExpanded ? undefined : 3}>
                {tournamentDescription}
              </Text>
              {tournamentDescriptionExpandable ? (
                <Pressable
                  onPress={() => setTournamentDescriptionExpanded((value) => !value)}
                  hitSlop={8}
                  style={({ pressed }) => [styles.descriptionLinkPressable, pressed && styles.descriptionLinkPressed]}
                >
                  <Text style={styles.descriptionLinkText}>
                    {tournamentDescriptionExpanded ? 'Hide description' : 'Show full description'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}

        {showPrimaryCta ? (
          <View style={styles.inlineCtaSection}>
            <View style={styles.inlineCtaStack}>
              {canPayNow ? (
                <Pressable
                  onPress={handlePayNow}
                  disabled={createCheckout.isPending}
                  style={({ pressed }) => [
                    styles.inlineCtaButton,
                    pressed && !createCheckout.isPending && styles.inlineCtaButtonPressed,
                  ]}
                >
                  <OptionalLinearGradient
                    colors={[colors.primary, colors.purple]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.inlineCtaGradient, createCheckout.isPending && styles.inlineCtaGradientDisabled]}
                  >
                    <Text style={styles.inlineCtaText}>
                      {createCheckout.isPending ? 'Opening payment...' : `Pay now ${feeLabel}`}
                    </Text>
                  </OptionalLinearGradient>
                </Pressable>
              ) : null}

              {!canLeaveTournament ? (
                <Pressable
                  onPress={handlePrimaryAction}
                  disabled={acceptInvitation.isPending || cancelRegistration.isPending}
                  style={({ pressed }) => [
                    styles.inlineCtaButton,
                    pressed &&
                      !(acceptInvitation.isPending || cancelRegistration.isPending) &&
                      styles.inlineCtaButtonPressed,
                  ]}
                >
                  <OptionalLinearGradient
                    colors={shouldShowRegisterCta ? [colors.primary, colors.primary] : [colors.primary, colors.purple]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[
                      styles.inlineCtaGradient,
                      (acceptInvitation.isPending || cancelRegistration.isPending) && styles.inlineCtaGradientDisabled,
                    ]}
                  >
                    <Text style={styles.inlineCtaText}>{ctaLabel}</Text>
                  </OptionalLinearGradient>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}

        <View style={styles.contentSection}>
          <SegmentedControl
            value={activeTab}
            onChange={(value) => setActiveTab(value as DetailTab)}
            trackStyle={styles.segmentTrack}
            options={[
              { value: 'info', label: 'Info' },
              { value: 'divisions', label: 'Divisions' },
              { value: 'dashboard', label: 'Dashboard' },
            ]}
          />

          {activeTab === 'info' ? (
            <View style={styles.sectionStack}>
              {pendingInvitation ? (
                <SurfaceCard tone="hero" style={styles.detailCard}>
                  <SectionTitle
                    title="Invitation pending"
                    subtitle="Accept this invite to jump straight into registration."
                  />
                  <View style={styles.invitationActions}>
                    <View style={{ flex: 1 }}>
                      <ActionButton
                        label="Accept"
                        loading={acceptInvitation.isPending}
                        onPress={() => acceptInvitation.mutate({ invitationId: pendingInvitation.id })}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <ActionButton
                        label="Decline"
                        variant="secondary"
                        loading={declineInvitation.isPending}
                        onPress={() => declineInvitation.mutate({ invitationId: pendingInvitation.id })}
                      />
                    </View>
                  </View>
                </SurfaceCard>
              ) : null}

              <SurfaceCard style={styles.detailCard}>
                <Text style={[styles.cardTitle, styles.cardTitleTight]}>About</Text>
                <Text style={styles.paragraph}>
                  {tournament.description || 'Tournament details will appear here once the organizer adds them.'}
                </Text>
              </SurfaceCard>

              <SurfaceCard style={styles.detailCard}>
                <View style={styles.infoHeaderRow}>
                  <Text style={[styles.cardTitle, styles.cardTitleLoose]}>Information</Text>
                  <View style={styles.heroTimelineChip}>
                    <Text style={styles.heroTimelineChipText}>{timelineStatusLabel}</Text>
                  </View>
                </View>
                <View style={styles.infoTopChips}>
                  <OptionalLinearGradient
                    colors={['#FFF3C4', '#F6D77B', '#E8B64B']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.infoPriceChip}
                    fallbackColor="#F6D77B"
                  >
                    <Text style={styles.infoPriceChipText}>{feeLabel}</Text>
                  </OptionalLinearGradient>
                </View>
                <View style={styles.infoDatesBlock}>
                  <View style={styles.infoDateRow}>
                    <Feather name="calendar" size={16} color={colors.textMuted} />
                    <Text style={styles.infoDateText} numberOfLines={1}>
                      {tournamentDateTimeRangeLabel}
                    </Text>
                  </View>
                  {registrationDateTimeRangeLabel ? (
                    <View style={styles.infoDateRow}>
                      <Feather name="clock" size={16} color={colors.textMuted} />
                      <Text style={styles.infoDateText} numberOfLines={1}>
                        {registrationDateTimeRangeLabel}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Pressable
                  disabled={locationLabel === 'Location not set'}
                  onPress={handleOpenMaps}
                  style={({ pressed }) => [styles.infoLocationRow, pressed && locationLabel !== 'Location not set' && styles.inlineLinkPressed]}
                >
                  <Feather
                    name="map-pin"
                    size={14}
                    color={colors.textMuted}
                  />
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.infoLocationText,
                      locationLabel === 'Location not set' && styles.infoLocationTextDisabled,
                    ]}
                  >
                    {locationLabel}
                  </Text>
                </Pressable>

                {hasLinkedClubLabel ? (
                  canOpenLinkedClub ? (
                    <Pressable
                      onPress={() => {
                        if (!resolvedClubId) return
                        router.push({ pathname: '/clubs/[id]', params: { id: resolvedClubId } })
                      }}
                      hitSlop={8}
                      style={({ pressed }) => [styles.infoClubLinkWrap, pressed && styles.inlineLinkPressed]}
                    >
                      <View style={styles.infoClubLinkRow}>
                        <Feather name="flag" size={14} color={colors.textMuted} />
                        <Text numberOfLines={1} style={styles.infoClubLinkText}>
                          {clubLabel}
                        </Text>
                      </View>
                    </Pressable>
                  ) : (
                    <View style={styles.infoClubLinkWrap}>
                      <View style={styles.infoClubLinkRow}>
                        <Feather name="flag" size={14} color={colors.textMuted} />
                        <Text numberOfLines={1} style={styles.infoClubLinkText}>
                          {clubLabel}
                        </Text>
                      </View>
                    </View>
                  )
                ) : null}

                <View style={styles.infoAmenitiesRow}>
                  {amenityLabels.length ? (
                    <View style={styles.badgeWrap}>
                      {amenityLabels.map((label) => (
                        <View key={label} style={styles.secondaryBadge}>
                          <Text style={styles.secondaryBadgeText}>{label}</Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.mutedBodyText}>More venue details will be added by the organizer soon.</Text>
                  )}
                </View>
              </SurfaceCard>

              <SurfaceCard style={styles.detailCard}>
                <Text style={[styles.cardTitle, styles.cardTitleLoose]}>Organizer</Text>
                <View style={styles.organizerRow}>
                  <Pressable
                    disabled={!tournament.user?.id}
                    onPress={handleOpenOrganizerProfile}
                    style={({ pressed }) => [pressed && tournament.user?.id && styles.organizerAvatarPressed]}
                  >
                    <RemoteUserAvatar
                      uri={tournament.user?.image}
                      size={48}
                      fallback="initials"
                      initialsLabel={organizerLabel}
                    />
                  </Pressable>
                  <Pressable
                    disabled={!tournament.user?.id}
                    onPress={handleOpenOrganizerProfile}
                    hitSlop={8}
                    style={({ pressed }) => [styles.organizerInfoTap, pressed && tournament.user?.id && styles.organizerNamePressed]}
                  >
                    <Text style={styles.organizerName}>{organizerLabel}</Text>
                    <Text style={styles.organizerMeta}>{organizerMetaLabel}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setTdFeedbackInfoOpen(true)}
                    style={({ pressed }) => [styles.ratingPillBtn, pressed && styles.ratingPillBtnPressed]}
                  >
                    <RatingStarIcon size={17} filled color="#F4B000" />
                    {tdCanPublishEffective && tdAverageEffective ? (
                      <Text style={styles.feedbackValue}>{tdAverageEffective.toFixed(1)}</Text>
                    ) : (
                      <Text style={styles.feedbackValueMuted}>No rating yet</Text>
                    )}
                  </Pressable>
                </View>
              </SurfaceCard>

              <View
                onLayout={(e) => {
                  setCommentsAnchorY(e.nativeEvent.layout.y)
                }}
              >
                <SurfaceCard style={styles.detailCard}>
                  <View style={styles.commentsHeaderRow}>
                    <Text style={[styles.cardTitle, styles.cardTitleLoose]}>Comments</Text>
                    <Text style={styles.commentsCount}>{String(commentCountQuery.data ?? 0)}</Text>
                  </View>

                  {commentsQuery.isLoading ? (
                    <LoadingBlock label="Loading comments..." />
                  ) : (commentsQuery.data ?? []).length === 0 ? (
                    <Text style={styles.mutedBodyText}>No comments yet.</Text>
                  ) : (
                    <View style={styles.commentsBlock}>
                      <RNScrollView
                        ref={commentsThreadRef}
                        style={[
                          styles.commentsThreadScroll,
                          {
                            maxHeight: Math.max(
                              Math.round(windowHeight * 0.5) - COMMENTS_COMPOSER_ESTIMATED_H,
                              120
                            ),
                          },
                        ]}
                        contentContainerStyle={styles.commentsThreadContent}
                        nestedScrollEnabled
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                      >
                        <ChatThreadMessageList
                          messages={((commentsQuery.data ?? []) as any[])
                            .slice()
                            .reverse()
                            .map((c: any) => ({
                              id: c.id,
                              userId: c.userId,
                              text: c.text,
                              createdAt: c.createdAt,
                              user: {
                                id: c.user?.id,
                                name: c.user?.name ?? c.user?.email ?? 'User',
                                image: c.user?.image ?? null,
                              },
                              isDeleted: false,
                            }))}
                          currentUserId={user?.id}
                          onPressAvatar={(m) => {
                            if (!m.userId) return
                            router.push({ pathname: '/profile/[id]', params: { id: m.userId } })
                          }}
                          canDelete={(m) => Boolean(user?.id && m.userId === user.id && !m.isDeleted)}
                          onRequestDelete={(m) => setCommentsDeleteTargetId(m.id)}
                          deleteDisabled={deleteComment.isPending}
                        />
                      </RNScrollView>

                      <ChatComposer
                        value={commentDraft}
                        onChangeText={setCommentDraft}
                        placeholder={isAuthenticated ? 'Write a comment…' : 'Sign in to comment…'}
                        onSend={() => {
                          if (!isAuthenticated) {
                            router.push('/sign-in')
                            return
                          }
                          const text = commentDraft.trim()
                          if (!text) return
                          createComment.mutate({ tournamentId, text })
                        }}
                        onFocus={() => {
                          scrollToCommentsEnd()
                          setTimeout(() => {
                            commentsThreadRef.current?.scrollToEnd({ animated: true })
                            scrollRef.current?.scrollToEnd({ animated: true })
                          }, 60)
                        }}
                        sendDisabled={!commentDraft.trim() || createComment.isPending}
                        paddingHorizontal={0}
                        paddingBottom={0}
                        safeAreaBottom={false}
                        multiline={false}
                      />
                    </View>
                  )}
                </SurfaceCard>
              </View>

            </View>
          ) : null}

          {activeTab === 'divisions' ? (
            <View style={styles.sectionStack}>
              {divisionsForDisplay.length ? (
                divisionsForDisplay.map((division: any) => {
                  const divisionSlotMetrics = getDivisionSlotMetrics(division, tournament.format)
                  const playersPerTeam = getPlayersPerTeam(division.teamKind, tournament.format, division.name)
                  const maxTeams = Number(division.maxTeams ?? 0)
                  const maxPlayers =
                    maxTeams > 0 && playersPerTeam !== null ? maxTeams * playersPerTeam : 0
                  const createdTeams = divisionSlotMetrics.createdTeams
                  const createdSlots = divisionSlotMetrics.createdSlots
                  const filledSlots = divisionSlotMetrics.filledSlots
                  const spotsLeft = divisionSlotMetrics.openSlots

                  return (
                    <SurfaceCard key={division.id} style={styles.detailCard}>
                      <View style={styles.divisionHeader}>
                        <Text style={styles.divisionTitle}>{division.name}</Text>
                        {spotsLeft !== null ? (
                          <View style={spotsLeft > 10 ? styles.primaryBadge : styles.secondaryBadge}>
                            <Text style={spotsLeft > 10 ? styles.primaryBadgeText : styles.secondaryBadgeText}>
                              {spotsLeft} spots left
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={styles.divisionMetaGrid}>
                        <View style={styles.divisionMetaCell}>
                          <View style={styles.metaRow}>
                            <Feather name="users" size={16} color={colors.textMuted} />
                            <Text style={styles.mutedBodyText}>
                              {createdSlots !== null && filledSlots !== null && createdSlots > 0
                                ? `${filledSlots} / ${createdSlots} spots filled`
                                : createdSlots !== null && createdSlots > 0
                                ? `${createdSlots} created spots`
                                : createdTeams > 0
                                ? `${createdTeams} teams created`
                                : maxPlayers > 0
                                ? `${maxPlayers} max players`
                                : 'No teams created yet'}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.divisionMetaCell}>
                          <View style={styles.metaRow}>
                            <Feather name="dollar-sign" size={16} color={colors.primary} />
                            <Text style={styles.mutedBodyText}>{feeLabel}</Text>
                          </View>
                        </View>
                      </View>
                      {canLeaveTournament ? (
                        <Pressable
                          onPress={handleLeaveTournament}
                          style={({ pressed }) => [styles.smallCtaButton, pressed && styles.smallCtaButtonPressed]}
                        >
                          <OptionalLinearGradient
                            colors={[colors.primary, colors.purple]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.smallCtaGradient}
                          >
                            <Text style={styles.smallCtaText}>
                              {cancelRegistration.isPending ? 'Leaving...' : 'Leave Tournament'}
                            </Text>
                          </OptionalLinearGradient>
                        </Pressable>
                      ) : registrationOpen ? (
                        <Pressable
                          onPress={() =>
                            isAuthenticated
                              ? router.push(`/tournaments/${tournament.id}/register`)
                              : router.push('/sign-in')
                          }
                          style={({ pressed }) => [styles.smallCtaButton, pressed && styles.smallCtaButtonPressed]}
                        >
                          <OptionalLinearGradient
                            colors={[colors.primary, colors.purple]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.smallCtaGradient}
                          >
                            <Text style={styles.smallCtaText}>{`Register for ${division.name}`}</Text>
                          </OptionalLinearGradient>
                        </Pressable>
                      ) : null}
                    </SurfaceCard>
                  )
                })
              ) : (
                <EmptyState
                  title="No divisions yet"
                  body="This tournament will show its divisions here once the organizer publishes them."
                />
              )}
            </View>
          ) : null}

          {activeTab === 'dashboard' ? (
            <View style={styles.sectionStack}>
              {dashboardRegistrationSummary ? (
                <View style={styles.dashboardBanner}>
                  <Text style={styles.dashboardBannerText}>
                    <Text style={styles.dashboardBannerStrong}>You&apos;re registered:</Text>{' '}
                    {dashboardRegistrationSummary}
                  </Text>
                </View>
              ) : null}

              <SurfaceCard padded={false} style={[styles.detailCard, styles.dashboardCard]}>
                <View style={styles.dashboardHeader}>
                  <View style={styles.dashboardHeaderCopy}>
                    <Text style={styles.cardTitle}>Dashboard</Text>
                    <Text style={styles.mutedBodyText}>
                      Standings, brackets and live match results from the tournament scoreboard.
                    </Text>
                  </View>
                  <Pressable
                    onPress={handleOpenDashboard}
                    style={({ pressed }) => [styles.outlineButton, pressed && styles.outlineButtonPressed]}
                  >
                    <Text style={styles.outlineButtonText}>Open full</Text>
                  </Pressable>
                </View>

                {dashboardEmbedUrl ? (
                  <View style={[styles.dashboardFrame, { height: dashboardHeight }]}>
                    <WebView
                      key={dashboardEmbedUrl}
                      source={{ uri: dashboardEmbedUrl }}
                      style={styles.dashboardWebView}
                      originWhitelist={['*']}
                      nestedScrollEnabled
                      setSupportMultipleWindows={false}
                      startInLoadingState
                      renderLoading={() => (
                        <View style={styles.dashboardLoadingState}>
                          <LoadingBlock label="Loading dashboard..." />
                        </View>
                      )}
                    />
                  </View>
                ) : (
                  <View style={styles.dashboardEmptyWrap}>
                    <EmptyState
                      title="Dashboard unavailable"
                      body="The public scoreboard could not be prepared for this tournament yet."
                    />
                  </View>
                )}
              </SurfaceCard>
            </View>
          ) : null}

        </View>
        </PickleRefreshScrollView>

        {/* composer is inside Comments card */}
      </KeyboardAvoidingView>

      {shouldShowStickyCta ? <View /> : null}

      <AppBottomSheet
        open={leaveTournamentSheetOpen}
        onClose={() => setLeaveTournamentSheetOpen(false)}
        title="Leave tournament?"
        subtitle="Your registration will be cancelled and your slot will be released."
        footer={
          <AppConfirmActions
            intent="destructive"
            cancelLabel="Keep spot"
            confirmLabel="Leave Tournament"
            onCancel={() => setLeaveTournamentSheetOpen(false)}
            onConfirm={() => {
              setLeaveTournamentSheetOpen(false)
              cancelRegistration.mutate({ tournamentId })
            }}
            confirmLoading={cancelRegistration.isPending}
          />
        }
      />
      <AppBottomSheet
        open={Boolean(paymentErrorMessage)}
        onClose={() => setPaymentErrorMessage(null)}
        title="Payment unavailable"
        subtitle={paymentErrorMessage ?? ''}
        footer={<AppInfoFooter onPress={() => setPaymentErrorMessage(null)} />}
      />
      <FeedbackRatingModal
        open={tournamentFeedbackOpen}
        onClose={() => setTournamentFeedbackOpen(false)}
        entityType="TOURNAMENT"
        entityId={tournamentId}
        title="Rate this tournament"
        subtitle="Your feedback helps improve tournament quality."
        contextCard={
          <FeedbackEntityContextCard
            entityType="TOURNAMENT"
            title={tournament.title}
            imageUrl={tournament.image}
            formatLabel={formatTournamentFormat(tournament.format)}
            dateLabel={formatHeroDateRange(tournament.startDate, tournament.endDate)}
            addressLabel={locationLabel === 'Location not set' ? null : locationLabel}
          />
        }
        onSubmitted={() => {
          void Promise.all([feedbackSummaryQuery.refetch(), hasRatedQuery.refetch()])
        }}
      />
      <AppBottomSheet
        open={tournamentFeedbackInfoOpen}
        onClose={() => setTournamentFeedbackInfoOpen(false)}
        title="Tournament rating"
        subtitle={
          feedbackCanPublishEffective && feedbackAverageEffective ? '' : 'No public rating yet. Need at least 5 ratings.'
        }
        footer={
          !hasRatedTournament ? (
            <ActionButton
              label="Rate this tournament"
              onPress={() => {
                setTournamentFeedbackInfoOpen(false)
                setTimeout(() => setTournamentFeedbackOpen(true), 280)
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
              ? feedbackSummaryQuery.data.topChips
              : [
                  { label: 'Great organization', count: 9 },
                  { label: 'Clear schedule', count: 8 },
                  { label: 'Strong opponents', count: 6 },
                ]
            ).map((chip: { label: string; count: number }) => (
              <View key={chip.label} style={styles.feedbackChip}>
                <Text style={styles.feedbackChipText}>{chip.label}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.feedbackEmptyText}>Not enough public data yet.</Text>
          )}
        </View>
      </AppBottomSheet>
      <FeedbackRatingModal
        open={tdFeedbackOpen}
        onClose={() => setTdFeedbackOpen(false)}
        entityType="TD"
        entityId={tdUserId ?? ''}
        title="Rate tournament director"
        subtitle="Your feedback helps improve director quality."
        contextCard={
          <FeedbackEntityContextCard
            entityType="TD"
            name={organizerLabel}
            avatarUrl={tournament.user?.image ?? null}
            tournamentLabel={`${tournament.title}${tournament.startDate ? ` (${formatHeroDateRange(tournament.startDate, tournament.endDate)})` : ''}`}
          />
        }
        onSubmitted={() => {
          void Promise.all([tdSummaryQuery.refetch(), tdHasRatedQuery.refetch()])
        }}
      />
      <AppBottomSheet
        open={tdFeedbackInfoOpen}
        onClose={() => setTdFeedbackInfoOpen(false)}
        title="Tournament director rating"
        subtitle={
          tdCanPublishEffective && tdAverageEffective ? '' : 'No public rating yet. Need at least 5 ratings.'
        }
      >
        {tdCanPublishEffective && tdAverageEffective ? (
          <View style={styles.modalStarsRow}>
            {[1, 2, 3, 4, 5].map((star) => {
              const active = star <= Math.round(tdAverageEffective)
              return (
                <RatingStarIcon key={star} size={40} filled={active} color="#F2C94C" inactiveColor="#C7C7CC" />
              )
            })}
            <Text style={styles.modalRatingValueInline}>{tdAverageEffective.toFixed(1)}</Text>
          </View>
        ) : null}
        <View style={styles.feedbackChipsWrap}>
          {(tdSummaryQuery.data?.topChips ?? []).length > 0 || __DEV__ ? (
            (tdSummaryQuery.data?.topChips?.length
              ? tdSummaryQuery.data.topChips
              : [
                  { label: 'Clear communication', count: 10 },
                  { label: 'Fair decisions', count: 8 },
                  { label: 'On-time schedule', count: 7 },
                ]
            ).map((chip: { label: string; count: number }) => (
              <View key={chip.label} style={styles.feedbackChip}>
                <Text style={styles.feedbackChipText}>{chip.label}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.feedbackEmptyText}>Not enough public data yet.</Text>
          )}
        </View>
        {!hasRatedTd ? (
          <Pressable
            disabled={!tdUserId}
            onPress={() => {
              if (!tdUserId) return
              setTdFeedbackInfoOpen(false)
              setTimeout(() => setTdFeedbackOpen(true), 260)
            }}
            style={({ pressed }) => [
              styles.primaryFeedbackCtaBtn,
              pressed && tdUserId && styles.primaryFeedbackCtaBtnPressed,
              !tdUserId && styles.outlineButtonDisabled,
            ]}
          >
            <Text style={styles.primaryFeedbackCtaText}>Rate this organizer</Text>
          </Pressable>
        ) : (
          <Text style={styles.feedbackThanksText}>You already rated this tournament director.</Text>
        )}
      </AppBottomSheet>

      <AppBottomSheet
        open={Boolean(commentsDeleteTargetId)}
        onClose={() => setCommentsDeleteTargetId(null)}
        title="Delete this comment?"
        subtitle="This comment will be permanently removed."
        footer={
          <AppConfirmActions
            intent="destructive"
            cancelLabel="Cancel"
            confirmLabel={deleteComment.isPending ? 'Deleting…' : 'Delete'}
            onCancel={() => setCommentsDeleteTargetId(null)}
            onConfirm={() => {
              if (!commentsDeleteTargetId) return
              const run = deleteComment.mutateAsync({ commentId: commentsDeleteTargetId })
              void run.then(() => setCommentsDeleteTargetId(null)).catch(() => setCommentsDeleteTargetId(null))
            }}
            confirmLoading={deleteComment.isPending}
          />
        }
      />
    </SafeAreaView>
  )
}

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
  kav: {
    flex: 1,
  },
  contentScroll: {
    flex: 1,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  scrollContent: {
    paddingBottom: 136,
  },
  scrollContentNoCta: {
    paddingBottom: spacing.xl,
  },
  heroWrap: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  eventMiniBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eventMiniBarActions: {
    flexDirection: 'row',
    gap: 8,
  },
  eventMiniBarButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  eventMiniBarButtonPressed: {
    opacity: 1,
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.brandPrimaryBorder,
    transform: [{ scale: 0.94 }],
  },
  commentBadge: {
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
  commentBadgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '800',
  },
  eventHeroCard: {
    overflow: 'hidden',
    borderWidth: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
    backgroundColor: colors.primary,
  },
  eventHeroHeader: {
    position: 'relative',
    overflow: 'hidden',
    padding: spacing.md,
    backgroundColor: 'transparent',
  },
  eventHeroPattern: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '40%',
    zIndex: 0,
  },
  eventHeroPatternDot: {
    position: 'absolute',
    width: EVENT_PATTERN_DOT,
    height: EVENT_PATTERN_DOT,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
  },
  eventHeroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    zIndex: 1,
  },
  eventHeroAvatarWrap: {
    width: 56,
    height: 56,
    borderRadius: 14,
    overflow: 'hidden',
    flexShrink: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  eventHeroAvatar: {
    width: 56,
    height: 56,
    borderRadius: 14,
  },
  eventHeroMain: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  eventHeroTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  eventHeroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'nowrap',
  },
  eventHeroTitle: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
    flex: 1,
    minWidth: 0,
  },
  eventHeroChip: {
    alignSelf: 'flex-start',
    minHeight: 28,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: '100%',
  },
  eventHeroChipText: {
    color: colors.white,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '700',
  },
  eventHeroRatingPill: {
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
    maxWidth: 120,
    marginLeft: 'auto',
  },
  eventHeroRatingPillPressed: {
    opacity: 0.85,
  },
  eventHeroRatingText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  eventHeroRatingMuted: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 13,
    fontWeight: '600',
  },
  eventHeroCompactStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    maxWidth: 140,
    flexShrink: 0,
  },
  eventHeroCompactStatusText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  descriptionSection: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  heroTimelineChip: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  heroTimelineChipText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  descriptionBlock: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: 6,
  },
  descriptionText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  descriptionMeasureText: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    top: spacing.md,
    opacity: 0,
    zIndex: -1,
  },
  descriptionLinkPressable: {
    alignSelf: 'flex-start',
  },
  descriptionLinkPressed: {
    opacity: 0.78,
  },
  descriptionLinkText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  inlineCtaSection: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  inlineCtaStack: {
    gap: 10,
  },
  inlineCtaButton: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  inlineCtaButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  inlineCtaGradient: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineCtaGradientDisabled: {
    opacity: 0.7,
  },
  inlineCtaText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  contentSection: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  segmentTrack: {
    marginHorizontal: 0,
  },
  tabSwitch: {
    flexDirection: 'row',
    gap: 4,
    minHeight: 36,
    backgroundColor: colors.surfaceMuted,
    padding: 3,
    borderRadius: radius.sm,
  },
  tabButton: {
    flex: 1,
    minHeight: 30,
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  tabButtonActive: {
    backgroundColor: colors.surface,
  },
  tabLabel: {
    color: colors.textMuted,
    fontWeight: '600',
    fontSize: 14,
  },
  tabLabelActive: {
    color: colors.text,
  },
  sectionStack: {
    marginTop: 16,
    gap: spacing.md,
  },
  invitationActions: {
    marginTop: spacing.md,
    flexDirection: 'row',
    gap: 10,
  },
  muted: {
    color: colors.textMuted,
  },
  paragraph: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 22,
  },
  detailCard: {
    borderRadius: radius.lg,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  cardTitleTight: {
    marginBottom: 8,
  },
  cardTitleLoose: {
    marginBottom: 12,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  valueText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  mutedBodyText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  locationIcon: {
    marginTop: 2,
  },
  infoLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 28,
    marginBottom: 10,
  },
  infoHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  infoTopChips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
    marginBottom: 10,
  },
  infoPriceChip: {
    minHeight: 30,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    justifyContent: 'center',
  },
  infoPriceChipText: {
    color: colors.black,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
  },
  infoDatesBlock: {
    gap: 8,
    marginBottom: 10,
  },
  infoDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoDateText: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '500',
  },
  infoClubLinkWrap: {
    marginBottom: 10,
    alignSelf: 'flex-start',
  },
  infoClubLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
  },
  infoClubLinkText: {
    color: colors.primary,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '700',
  },
  infoLocationText: {
    flex: 1,
    minWidth: 0,
    color: colors.primary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  infoLocationTextDisabled: {
    color: colors.textMuted,
    fontWeight: '500',
  },
  infoAmenitiesRow: {
    marginTop: 12,
  },
  inlineLinkWrap: {
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  inlineLinkPressed: {
    opacity: 0.82,
  },
  inlineLinkText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '500',
  },
  inlineLinkTextDisabled: {
    opacity: 0.45,
  },
  badgeWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  primaryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  primaryBadgeText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '600',
  },
  secondaryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.secondary,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  secondaryBadgeText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '500',
  },
  divisionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  divisionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  divisionMetaGrid: {
    marginTop: 12,
    marginBottom: 12,
    flexDirection: 'row',
    gap: 12,
  },
  divisionMetaCell: {
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  smallCtaButton: {
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  smallCtaButtonPressed: {
    opacity: 0.94,
  },
  smallCtaGradient: {
    minHeight: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  smallCtaText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  organizerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  commentsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  commentsCount: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
  },
  commentsBlock: {
    flexShrink: 1,
    flexDirection: 'column',
  },
  commentsThreadScroll: {
    flexGrow: 0,
  },
  commentsThreadContent: {
    paddingBottom: 8,
  },
  organizerName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  organizerMeta: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 14,
  },
  organizerAvatarPressed: {
    opacity: 0.82,
  },
  organizerInfoTap: {
    flex: 1,
    justifyContent: 'center',
  },
  organizerNamePressed: {
    opacity: 0.84,
  },
  ratingPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: 'rgba(10,10,10,0.08)',
    borderRadius: 9999,
    backgroundColor: 'rgba(10,10,10,0.03)',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  ratingPillBtnPressed: {
    opacity: 0.86,
  },
  feedbackHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  feedbackLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
    fontSize: 14,
    fontWeight: '700',
  },
  feedbackValueMuted: {
    color: colors.textMuted,
    fontSize: 16,
    fontWeight: '700',
  },
  feedbackCount: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  feedbackInfoBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  feedbackInfoBtnText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  primaryFeedbackCtaBtn: {
    marginTop: spacing.md,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: colors.primary,
  },
  primaryFeedbackCtaBtnPressed: {
    opacity: 0.9,
  },
  primaryFeedbackCtaText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '800',
  },
  feedbackThanksText: {
    marginTop: spacing.md,
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  feedbackChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: spacing.xs,
  },
  modalStarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    justifyContent: 'flex-start',
    marginBottom: spacing.md,
  },
  modalRatingValueInline: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
    marginLeft: 8,
  },
  feedbackChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#9CD9A3',
    backgroundColor: '#E8F7EB',
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
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
  achievementDotsRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  achievementDot: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#9CD9A3',
    backgroundColor: '#E8F7EB',
    paddingHorizontal: 10,
    paddingVertical: 7,
    maxWidth: '100%',
  },
  achievementDotText: {
    color: '#1E7A32',
    fontSize: 12,
    fontWeight: '700',
  },
  achievementBadgeWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingBottom: spacing.xs,
  },
  achievementBadgeItem: {
    width: 92,
    alignItems: 'center',
    gap: 6,
  },
  achievementBadgeCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#9CD9A3',
    backgroundColor: '#E8F7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  achievementBadgeText: {
    color: '#1E7A32',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  feedbackEmptyText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  dashboardBanner: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.brandPrimaryBorder,
    backgroundColor: colors.successSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  dashboardBannerText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  dashboardBannerStrong: {
    fontWeight: '700',
  },
  dashboardCard: {
    overflow: 'hidden',
  },
  dashboardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  dashboardHeaderCopy: {
    flex: 1,
    gap: 6,
  },
  dashboardFrame: {
    overflow: 'hidden',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  dashboardWebView: {
    flex: 1,
    backgroundColor: colors.background,
  },
  dashboardLoadingState: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.md,
    backgroundColor: colors.background,
  },
  dashboardEmptyWrap: {
    padding: spacing.md,
  },
  outlineButton: {
    minHeight: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  outlineButtonPressed: {
    backgroundColor: colors.secondary,
  },
  outlineButtonDisabled: {
    opacity: 0.5,
  },
  outlineButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  ctaShell: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  ctaFade: {
    height: 44,
  },
  ctaSafeArea: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
  },
  ctaStack: {
    gap: 10,
  },
  ctaButton: {
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  ctaButtonPressed: {
    opacity: 0.94,
  },
  ctaGradient: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  ctaGradientDisabled: {
    opacity: 0.75,
  },
  ctaText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '700',
  },
  })

