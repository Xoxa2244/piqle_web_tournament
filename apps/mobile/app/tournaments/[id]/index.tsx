import { useQuery } from '@tanstack/react-query'
import { Feather } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Image,
  Linking,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'

import { AppBottomSheet, AppConfirmActions, AppInfoFooter } from '../../../src/components/AppBottomSheet'
import { EntityImage } from '../../../src/components/EntityImage'
import { FeedbackEntityContextCard } from '../../../src/components/FeedbackEntityContextCard'
import { FeedbackRatingModal } from '../../../src/components/FeedbackRatingModal'
import { PickleRefreshScrollView } from '../../../src/components/PickleRefreshScrollView'
import { RemoteUserAvatar } from '../../../src/components/RemoteUserAvatar'
import { BackCircleButton } from '../../../src/components/navigation/BackCircleButton'
import {
  ActionButton,
  EmptyState,
  LoadingBlock,
  SectionTitle,
  SurfaceCard,
} from '../../../src/components/ui'
import { TopBar } from '../../../src/components/navigation/TopBar'
import { OptionalLinearGradient } from '../../../src/components/OptionalLinearGradient'
import { RatingStarIcon } from '../../../src/components/icons/RatingStarIcon'
import { fetchWithTimeout } from '../../../src/lib/apiFetch'
import { buildApiUrl, buildWebUrl, FEEDBACK_API_ENABLED } from '../../../src/lib/config'
import { formatLocation, formatMoney } from '../../../src/lib/formatters'
import { getDivisionSlotMetrics, getPlayersPerTeam, getTournamentSlotMetrics } from '../../../src/lib/tournamentSlots'
import { trpc } from '../../../src/lib/trpc'
import { radius, spacing, type ThemePalette } from '../../../src/lib/theme'
import { useAuth } from '../../../src/providers/AuthProvider'
import { useAppTheme } from '../../../src/providers/ThemeProvider'
import { usePullToRefresh } from '../../../src/hooks/usePullToRefresh'
import { useTournamentAccessInfo } from '../../../src/hooks/useTournamentAccessInfo'

const longDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
})

const TITLE_GRADIENT_IMAGE_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAACACAYAAAA27Cg+AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAF+SURBVFhH1cq7R4ZxGIfxt3O9nc8HHZRSSklJkpIkkiSRRCKRSEQiIiIiIiIiGiIaIhqiIRoaoqGhoSH6U3Ktv4fLM7xLN597+LoSyWQyYSJDKDKEIkMoMoQiQygyhCJDiJdm/k2QblITZJjUBJkmVpBlYgXZJlaQY2IFuYYgz8QK9AjyDUGBiRUUGoIiQ1BsCEoMQakhKDME5YagwhBUGoIqQ1BtCGoMQa0hqDME9YagwRA0GoImQ9BsCFoMQashaDME7YagwxB0GoIuQ9BtCHoMQa8h6DME/YZgwBAMGoIhQzBsCEYMwaghGDME44ZgwhBMGoIpQzBtCGYMwawhmDME84ZgwRAsGoIlQ7BsCFYMwaohWDME64ZgwxBsGoItQ7BtCHYMwa4h2DME+4bgwBAcGoIjQ3BsCE4MwakhODME54bgwhBcGoIrQ3BtCG4Mwa0huDME94bgwRA8GoInQ/BsCF4MwasheDME74bgwxB8GoIvQ/BtCH4Mwa/5A0iMkfgHxZnkAAAAAElFTkSuQmCC'

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

  const [activeTab, setActiveTab] = useState<DetailTab>('info')
  const [isFavorite, setIsFavorite] = useState(false)
  const [leaveTournamentSheetOpen, setLeaveTournamentSheetOpen] = useState(false)
  const [paymentErrorMessage, setPaymentErrorMessage] = useState<string | null>(null)
  const [tournamentFeedbackOpen, setTournamentFeedbackOpen] = useState(false)
  const [tournamentFeedbackInfoOpen, setTournamentFeedbackInfoOpen] = useState(false)
  const [tdFeedbackOpen, setTdFeedbackOpen] = useState(false)
  const [tdFeedbackInfoOpen, setTdFeedbackInfoOpen] = useState(false)

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
    ])
  }, [accessQuery, fullTournamentQuery, myInvitationQuery, myStatusQuery, tournamentQuery])

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
  const feeLabel = entryFeeCents > 0 ? formatMoney(entryFeeCents) : 'Free'
  const quickFeeLabel = entryFeeCents > 0 ? `$${Math.round(entryFeeCents / 100)}+` : 'Free'
  const locationLabel = formatLocation([tournament.venueName, tournament.venueAddress])
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
    ? 'Admin Access'
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
  const shouldShowStickyCta = showPrimaryCta && activeTab === 'info'
  const dashboardRegistrationSummary =
    myStatusQuery.data?.status === 'active' &&
    myStatusQuery.data?.divisionName &&
    myStatusQuery.data?.teamName
      ? `${myStatusQuery.data.divisionName} · ${myStatusQuery.data.teamName}`
      : null
  const statusMeta = getStatusMeta(tournamentAvailabilityData, myStatus, hasPrivilegedAccess)
  const divisionsForDisplay = Array.isArray((fullTournamentQuery.data as any)?.divisions)
    ? (((fullTournamentQuery.data as any)?.divisions ?? []) as any[])
    : ((tournament.divisions ?? []) as any[])

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

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <TopBar />
      <PickleRefreshScrollView
        contentContainerStyle={[styles.scrollContent, !shouldShowStickyCta && styles.scrollContentNoCta]}
        showsVerticalScrollIndicator={false}
        refreshing={pullToRefresh.refreshing}
        onRefresh={pullToRefresh.onRefresh}
        bounces
      >
        <View style={styles.hero}>
          <EntityImage uri={tournament.image} style={styles.heroImage} resizeMode="cover" placeholderResizeMode="contain" />
          <View pointerEvents="none" style={styles.heroOverlay} />

          <View style={styles.heroHeader}>
            <View style={styles.heroActions}>
              <BackCircleButton onPress={() => router.back()} iconSize={18} style={styles.heroActionButton} />
              <View style={styles.heroActionGroup}>
                <Pressable
                  onPress={() => setIsFavorite((current) => !current)}
                  style={({ pressed }) => [styles.heroActionButton, pressed && styles.heroActionPressed]}
                >
                  <Feather
                    name="heart"
                    size={20}
                    color={isFavorite ? '#ff5a6b' : colors.white}
                  />
                </Pressable>
                <Pressable
                  onPress={handleShare}
                  style={({ pressed }) => [styles.heroActionButton, pressed && styles.heroActionPressed]}
                >
                  <Feather name="share-2" size={20} color={colors.white} />
                </Pressable>
              </View>
            </View>
          </View>

          <Image
            pointerEvents="none"
            source={{ uri: TITLE_GRADIENT_IMAGE_URI }}
            resizeMode="stretch"
            style={styles.heroFooterGradient}
          />

          <View style={styles.heroFooter}>
            <View style={[styles.heroStatusBadge, { backgroundColor: statusMeta.backgroundColor }]}>
              <Text style={styles.heroStatusText}>{statusMeta.label}</Text>
            </View>
            <Text style={styles.heroTitle}>{tournament.title}</Text>
            <View style={styles.heroDateRow}>
              <Feather name="calendar" size={14} color="rgba(255,255,255,0.82)" />
              <Text style={styles.heroDateText}>
                {formatHeroDateRange(tournament.startDate, tournament.endDate)}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.statsSection}>
          <View style={styles.quickStats}>
            <SurfaceCard style={styles.statCard}>
              <Feather name="users" size={20} color={colors.primary} />
              <Text style={styles.statValue}>{playerCount || totalTeams}</Text>
              <Text style={styles.statLabel}>{playerCount ? 'Players' : 'Teams'}</Text>
            </SurfaceCard>
            <SurfaceCard style={styles.statCard}>
              <Feather name="award" size={20} color={colors.brandAccent} />
              <Text style={styles.statValue}>{tournament.divisions.length}</Text>
              <Text style={styles.statLabel}>Divisions</Text>
            </SurfaceCard>
            <SurfaceCard style={styles.statCard}>
              <Feather name="dollar-sign" size={20} color={colors.purple} />
              <Text style={styles.statValue}>{quickFeeLabel}</Text>
              <Text style={styles.statLabel}>Entry Fee</Text>
            </SurfaceCard>
          </View>
        </View>

        <View style={styles.contentSection}>
          <View style={styles.tabSwitch}>
            {([
              { key: 'info', label: 'Info' },
              { key: 'divisions', label: 'Divisions' },
              { key: 'dashboard', label: 'Dashboard' },
            ] as const).map((tab) => {
              const active = activeTab === tab.key
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => setActiveTab(tab.key)}
                  style={[styles.tabButton, active && styles.tabButtonActive]}
                >
                  <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                    {tab.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>

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
                <Text style={[styles.cardTitle, styles.cardTitleTight]}>Format</Text>
                <View style={styles.valueRow}>
                  <Feather name="award" size={16} color={colors.primary} />
                  <Text style={styles.valueText}>{formatTournamentFormat(tournament.format)}</Text>
                </View>
              </SurfaceCard>

              <SurfaceCard style={styles.detailCard}>
                <Text style={[styles.cardTitle, styles.cardTitleLoose]}>Location</Text>
                <View style={styles.locationRow}>
                  <Feather name="map-pin" size={20} color={colors.brandAccent} style={styles.locationIcon} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.valueText}>{locationLabel}</Text>
                    <Pressable
                      disabled={locationLabel === 'Location not set'}
                      onPress={handleOpenMaps}
                      style={({ pressed }) => [styles.inlineLinkWrap, pressed && styles.inlineLinkPressed]}
                    >
                      <Text
                        style={[
                          styles.inlineLinkText,
                          locationLabel === 'Location not set' && styles.inlineLinkTextDisabled,
                        ]}
                      >
                        Open in Maps
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </SurfaceCard>

              <SurfaceCard style={styles.detailCard}>
                <Text style={[styles.cardTitle, styles.cardTitleLoose]}>Amenities</Text>
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

              <SurfaceCard style={styles.detailCard}>
                <Text style={[styles.cardTitle, styles.cardTitleLoose]}>Tournament rating</Text>
                <View style={styles.feedbackHeadRow}>
                  <View style={styles.feedbackLeft}>
                    <RatingStarIcon size={18} filled color="#F4B000" />
                    {feedbackCanPublishEffective && feedbackAverageEffective ? (
                      <Text style={styles.feedbackValue}>{feedbackAverageEffective.toFixed(1)}</Text>
                    ) : (
                      <Text style={styles.feedbackValueMuted}>No rating yet</Text>
                    )}
                    {feedbackCanPublishEffective ? null : <Text style={styles.feedbackCount}>min 5 ratings</Text>}
                  </View>
                  <Pressable onPress={() => setTournamentFeedbackInfoOpen(true)} style={styles.feedbackInfoBtn}>
                    <Text style={styles.feedbackInfoBtnText}>Details</Text>
                  </Pressable>
                </View>
                {!hasRatedTournament ? (
                  <Pressable
                    onPress={() => setTournamentFeedbackOpen(true)}
                    style={({ pressed }) => [styles.primaryFeedbackCtaBtn, pressed && styles.primaryFeedbackCtaBtnPressed]}
                  >
                    <Text style={styles.primaryFeedbackCtaText}>Rate this tournament</Text>
                  </Pressable>
                ) : (
                  <Text style={styles.feedbackThanksText}>Thanks, you already rated this tournament.</Text>
                )}
              </SurfaceCard>
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

      {shouldShowStickyCta ? (
        <View style={styles.ctaShell}>
          <OptionalLinearGradient
            colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.94)', colors.background]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.ctaFade}
          />
          <SafeAreaView edges={['bottom']} style={styles.ctaSafeArea}>
            <View style={styles.ctaStack}>
              {canPayNow ? (
                <Pressable
                  onPress={handlePayNow}
                  disabled={createCheckout.isPending}
                  style={({ pressed }) => [
                    styles.ctaButton,
                    pressed && !createCheckout.isPending && styles.ctaButtonPressed,
                  ]}
                >
                  <OptionalLinearGradient
                    colors={[colors.primary, colors.purple]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.ctaGradient, createCheckout.isPending && styles.ctaGradientDisabled]}
                  >
                    <Text style={styles.ctaText}>
                      {createCheckout.isPending ? 'Opening payment...' : `Pay now ${feeLabel}`}
                    </Text>
                  </OptionalLinearGradient>
                </Pressable>
              ) : null}
              <Pressable
                onPress={handlePrimaryAction}
                disabled={acceptInvitation.isPending || cancelRegistration.isPending}
                style={({ pressed }) => [
                  styles.ctaButton,
                  pressed &&
                    !(acceptInvitation.isPending || cancelRegistration.isPending) &&
                    styles.ctaButtonPressed,
                ]}
              >
                <OptionalLinearGradient
                  colors={[colors.primary, colors.purple]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[
                    styles.ctaGradient,
                    (acceptInvitation.isPending || cancelRegistration.isPending) && styles.ctaGradientDisabled,
                  ]}
                >
                  <Text style={styles.ctaText}>{ctaLabel}</Text>
                </OptionalLinearGradient>
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      ) : null}

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
    </SafeAreaView>
  )
}

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
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
  hero: {
    position: 'relative',
    height: 256,
    backgroundColor: colors.surfaceMuted,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 10, 10, 0.18)',
  },
  heroHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  heroActions: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroActionGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  heroActionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10, 10, 10, 0.4)',
  },
  heroActionPressed: {
    opacity: 0.86,
  },
  heroFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  heroFooterGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 300,
  },
  heroStatusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 8,
  },
  heroStatusText: {
    color: colors.white,
    fontWeight: '600',
    fontSize: 12,
  },
  heroTitle: {
    color: colors.white,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.4,
    textShadowColor: 'rgba(0, 0, 0, 0.28)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  heroDateRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroDateText: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 14,
    textShadowColor: 'rgba(0, 0, 0, 0.22)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  statsSection: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  contentSection: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  quickStats: {
    flexDirection: 'row',
    gap: 8,
  },
  statCard: {
    flex: 1,
    minHeight: 84,
    paddingHorizontal: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  statValue: {
    marginTop: 4,
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  statLabel: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 12,
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
    borderRadius: 12,
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

