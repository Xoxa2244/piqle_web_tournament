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
import { PickleRefreshScrollView } from '../../../src/components/PickleRefreshScrollView'
import { RemoteUserAvatar } from '../../../src/components/RemoteUserAvatar'
import {
  ActionButton,
  EmptyState,
  LoadingBlock,
  SectionTitle,
  SurfaceCard,
} from '../../../src/components/ui'
import { TopBar } from '../../../src/components/navigation/TopBar'
import { OptionalLinearGradient } from '../../../src/components/OptionalLinearGradient'
import { tournamentPlaceholder } from '../../../src/constants/images'
import { fetchWithTimeout } from '../../../src/lib/apiFetch'
import { buildApiUrl, buildWebUrl } from '../../../src/lib/config'
import { isRemoteImageUri } from '../../../src/lib/imageUri'
import { formatLocation, formatMoney } from '../../../src/lib/formatters'
import { getDivisionSlotMetrics, getPlayersPerTeam, getTournamentSlotMetrics } from '../../../src/lib/tournamentSlots'
import { trpc } from '../../../src/lib/trpc'
import { palette, radius, spacing } from '../../../src/lib/theme'
import { useAuth } from '../../../src/providers/AuthProvider'
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
    void Linking.openURL(buildWebUrl(`/profile/${tournament.user.id}`))
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
          {tournament.image && isRemoteImageUri(tournament.image) ? (
            <Image source={{ uri: tournament.image }} style={styles.heroImage} />
          ) : (
            <Image source={tournamentPlaceholder} style={styles.heroImage} resizeMode="cover" />
          )}
          <View pointerEvents="none" style={styles.heroOverlay} />

          <View style={styles.heroHeader}>
            <View style={styles.heroActions}>
              <Pressable
                onPress={() => router.back()}
                style={({ pressed }) => [styles.heroActionButton, pressed && styles.heroActionPressed]}
              >
                <Feather name="arrow-left" size={20} color={palette.white} />
              </Pressable>
              <View style={styles.heroActionGroup}>
                <Pressable
                  onPress={() => setIsFavorite((current) => !current)}
                  style={({ pressed }) => [styles.heroActionButton, pressed && styles.heroActionPressed]}
                >
                  <Feather
                    name="heart"
                    size={20}
                    color={isFavorite ? '#ff5a6b' : palette.white}
                  />
                </Pressable>
                <Pressable
                  onPress={handleShare}
                  style={({ pressed }) => [styles.heroActionButton, pressed && styles.heroActionPressed]}
                >
                  <Feather name="share-2" size={20} color={palette.white} />
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
              <Feather name="users" size={20} color={palette.primary} />
              <Text style={styles.statValue}>{playerCount || totalTeams}</Text>
              <Text style={styles.statLabel}>{playerCount ? 'Players' : 'Teams'}</Text>
            </SurfaceCard>
            <SurfaceCard style={styles.statCard}>
              <Feather name="award" size={20} color={palette.brandAccent} />
              <Text style={styles.statValue}>{tournament.divisions.length}</Text>
              <Text style={styles.statLabel}>Divisions</Text>
            </SurfaceCard>
            <SurfaceCard style={styles.statCard}>
              <Feather name="dollar-sign" size={20} color={palette.purple} />
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
                  <Feather name="award" size={16} color={palette.primary} />
                  <Text style={styles.valueText}>{formatTournamentFormat(tournament.format)}</Text>
                </View>
              </SurfaceCard>

              <SurfaceCard style={styles.detailCard}>
                <Text style={[styles.cardTitle, styles.cardTitleLoose]}>Location</Text>
                <View style={styles.locationRow}>
                  <Feather name="map-pin" size={20} color={palette.brandAccent} style={styles.locationIcon} />
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
                  <RemoteUserAvatar uri={tournament.user?.image} size={48} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.organizerName}>{organizerLabel}</Text>
                    <Text style={styles.organizerMeta}>{organizerMetaLabel}</Text>
                  </View>
                </View>
                <View style={styles.organizerButtonRow}>
                  <Pressable
                    disabled={!tournament.user?.id}
                    onPress={handleOpenOrganizerProfile}
                    style={({ pressed }) => [
                      styles.outlineButton,
                      pressed && tournament.user?.id && styles.outlineButtonPressed,
                      !tournament.user?.id && styles.outlineButtonDisabled,
                    ]}
                  >
                    <Text style={styles.outlineButtonText}>View Profile</Text>
                  </Pressable>
                </View>
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
                            <Feather name="users" size={16} color={palette.textMuted} />
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
                            <Feather name="dollar-sign" size={16} color={palette.primary} />
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
                            colors={[palette.primary, palette.purple]}
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
                            colors={[palette.primary, palette.purple]}
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
            colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.94)', palette.background]}
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
                    colors={[palette.primary, palette.purple]}
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
                  colors={[palette.primary, palette.purple]}
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
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.background,
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
    backgroundColor: palette.surfaceMuted,
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
    color: palette.white,
    fontWeight: '600',
    fontSize: 12,
  },
  heroTitle: {
    color: palette.white,
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
    borderBottomColor: palette.border,
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
    color: palette.text,
    fontSize: 18,
    fontWeight: '700',
  },
  statLabel: {
    marginTop: 2,
    color: palette.textMuted,
    fontSize: 12,
  },
  tabSwitch: {
    flexDirection: 'row',
    gap: 4,
    minHeight: 36,
    backgroundColor: palette.surfaceMuted,
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
    backgroundColor: palette.surface,
  },
  tabLabel: {
    color: palette.textMuted,
    fontWeight: '600',
    fontSize: 14,
  },
  tabLabelActive: {
    color: palette.text,
  },
  sectionStack: {
    marginTop: 24,
    gap: spacing.md,
  },
  invitationActions: {
    marginTop: spacing.md,
    flexDirection: 'row',
    gap: 10,
  },
  muted: {
    color: palette.textMuted,
  },
  paragraph: {
    color: palette.textMuted,
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
    color: palette.text,
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
    color: palette.text,
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  mutedBodyText: {
    color: palette.textMuted,
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
    color: palette.primary,
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
    backgroundColor: palette.primary,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  primaryBadgeText: {
    color: palette.white,
    fontSize: 12,
    fontWeight: '600',
  },
  secondaryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: palette.secondary,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  secondaryBadgeText: {
    color: palette.text,
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
    color: palette.text,
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
    color: palette.white,
    fontSize: 14,
    fontWeight: '600',
  },
  organizerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  organizerName: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '600',
  },
  organizerMeta: {
    marginTop: 4,
    color: palette.textMuted,
    fontSize: 14,
  },
  organizerButtonRow: {
    marginTop: spacing.md,
  },
  dashboardBanner: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.brandPrimaryBorder,
    backgroundColor: palette.successSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  dashboardBannerText: {
    color: palette.text,
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
    borderTopColor: palette.border,
    backgroundColor: palette.background,
  },
  dashboardWebView: {
    flex: 1,
    backgroundColor: palette.background,
  },
  dashboardLoadingState: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.md,
    backgroundColor: palette.background,
  },
  dashboardEmptyWrap: {
    padding: spacing.md,
  },
  outlineButton: {
    minHeight: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  outlineButtonPressed: {
    backgroundColor: palette.secondary,
  },
  outlineButtonDisabled: {
    opacity: 0.5,
  },
  outlineButtonText: {
    color: palette.text,
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
    backgroundColor: palette.background,
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
    color: palette.white,
    fontSize: 18,
    fontWeight: '700',
  },
})
