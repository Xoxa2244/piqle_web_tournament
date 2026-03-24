import { Feather } from '@expo/vector-icons'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'

import { PageLayout } from '../../src/components/navigation/PageLayout'
import { PickleRefreshScrollView } from '../../src/components/PickleRefreshScrollView'
import { OptionalLinearGradient } from '../../src/components/OptionalLinearGradient'
import { TournamentCard } from '../../src/components/TournamentCard'
import { ActionButton, EmptyState, LoadingBlock, SectionTitle, SurfaceCard } from '../../src/components/ui'
import { getTournamentSlotMetrics } from '../../src/lib/tournamentSlots'
import { trpc } from '../../src/lib/trpc'
import { radius, spacing, type ThemePalette } from '../../src/lib/theme'
import { useAuth } from '../../src/providers/AuthProvider'
import { useAppTheme } from '../../src/providers/ThemeProvider'
import { usePullToRefresh } from '../../src/hooks/usePullToRefresh'

type CardTone = 'muted' | 'primary' | 'danger' | 'success' | 'warning'

const getEntryFeeCents = (tournament: { entryFee?: string | number | null; entryFeeCents?: number | null }) => {
  if (typeof tournament.entryFeeCents === 'number') return tournament.entryFeeCents
  if (tournament.entryFee != null && Number(tournament.entryFee) > 0) {
    return Math.round(Number(tournament.entryFee) * 100)
  }
  return 0
}

const getTournamentPhase = (tournament: {
  startDate: string | Date
  endDate: string | Date
}) => {
  const now = new Date()
  const start = new Date(tournament.startDate)
  const end = new Date(tournament.endDate)
  const endWithGrace = new Date(end)
  endWithGrace.setHours(endWithGrace.getHours() + 12)
  const nextDay = new Date(now)
  nextDay.setDate(nextDay.getDate() + 1)
  nextDay.setHours(0, 0, 0, 0)

  if (endWithGrace < nextDay) return 'past' as const
  if (start > now) return 'upcoming' as const
  return 'in_progress' as const
}

const isTournamentInCurrentMonth = (tournament: {
  startDate: string | Date
  endDate: string | Date
}) => {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const start = new Date(tournament.startDate)
  const end = new Date(tournament.endDate)

  return end >= monthStart && start < nextMonthStart
}

const getInvolvementMeta = (
  tournament: any,
  currentUserId: string | undefined,
  status: string | null | undefined,
  accessibleTournamentIds: Set<string>
) => {
  const isParticipant = status === 'active' || status === 'waitlisted'
  const isOwner = Boolean(currentUserId && tournament.user?.id === currentUserId)
  const hasPrivilegedAccess = Boolean(isOwner || accessibleTournamentIds.has(tournament.id))

  return { isParticipant, hasPrivilegedAccess }
}

const getCardStatus = (
  tournament: any,
  status?: string | null,
  hasPrivilegedAccess = false
): { label: string; tone: CardTone } => {
  if (hasPrivilegedAccess) return { label: 'Admin', tone: 'primary' }
  if (status === 'active') return { label: 'Registered', tone: 'primary' }
  if (status === 'waitlisted') return { label: 'Waitlist', tone: 'warning' }

  if (new Date(tournament.endDate).getTime() < Date.now()) {
    return { label: 'Closed', tone: 'muted' }
  }

  const slotMetrics = getTournamentSlotMetrics(tournament)
  if (slotMetrics.createdSlots !== null && slotMetrics.createdSlots > 0) {
    if (slotMetrics.openSlots === 0) {
      return { label: 'Waitlist', tone: 'warning' }
    }
    if (slotMetrics.fillRatio !== null && slotMetrics.fillRatio >= 0.75) {
      return { label: 'Filling Fast', tone: 'warning' }
    }
  }

  return { label: 'Open', tone: 'success' }
}

const HomeTournamentCard = ({
  tournament,
  myStatus,
  hasPrivilegedAccess,
  feeCents,
  isUnpaid,
}: {
  tournament: any
  myStatus?: string | null
  hasPrivilegedAccess: boolean
  feeCents?: number | null
  isUnpaid?: boolean
}) => {
  const api = trpc as any
  const detailQuery = api.public.getTournamentById.useQuery(
    { id: tournament.id },
    { retry: false, staleTime: 60_000 }
  )
  const tournamentForCard = useMemo(
    () => ({
      ...tournament,
      ...(detailQuery.data ?? {}),
      entryFeeCents: feeCents,
      feedbackSummary: null,
    }),
    [detailQuery.data, feeCents, tournament]
  )
  const cardStatus = getCardStatus(tournamentForCard, myStatus, hasPrivilegedAccess)

  return (
    <TournamentCard
      tournament={tournamentForCard}
      statusLabel={cardStatus.label}
      statusTone={cardStatus.tone}
      secondaryStatusLabel={isUnpaid ? 'Unpaid' : null}
      secondaryStatusTone="danger"
      onPress={() => router.push(`/tournaments/${tournament.id}`)}
    />
  )
}

export default function HomeTab() {
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { token, user } = useAuth()
  const isAuthenticated = Boolean(token)
  const api = trpc as any
  const utils = (trpc as any).useUtils()

  const tournamentsQuery = api.public.listBoards.useQuery()
  /** Стабильный порядок id — иначе меняется ключ getMyStatuses и запросы зацикливаются */
  const tournamentIds = useMemo(() => {
    const ids = ((tournamentsQuery.data ?? []) as any[]).map((item) => item.id as string)
    return [...new Set(ids)].sort()
  }, [tournamentsQuery.data])
  const registrationStatusesQuery = api.registration.getMyStatuses.useQuery(
    { tournamentIds },
    { enabled: isAuthenticated && tournamentIds.length > 0 }
  )
  const accessibleTournamentsQuery = api.tournament.list.useQuery(undefined, {
    enabled: isAuthenticated,
  })
  const accessibleTournamentIds = useMemo(
    () => new Set((((accessibleTournamentsQuery.data ?? []) as any[]).map((item) => item.id) as string[])),
    [accessibleTournamentsQuery.data]
  )
  const statuses = (registrationStatusesQuery.data ?? {}) as Record<
    string,
    { status?: string; isPaid?: boolean; playerId?: string }
  >

  const onRefreshHome = useCallback(async () => {
    const boards = await tournamentsQuery.refetch()
    const freshIds = ((boards.data ?? []) as any[])
      .map((item: any) => item.id as string)
      .sort()
    const tasks: Promise<unknown>[] = [accessibleTournamentsQuery.refetch()]
    if (isAuthenticated && freshIds.length > 0) {
      tasks.push(utils.registration.getMyStatuses.fetch({ tournamentIds: freshIds }))
    }
    await Promise.all(tasks)
  }, [accessibleTournamentsQuery, isAuthenticated, tournamentsQuery, utils])

  const pullToRefresh = usePullToRefresh(onRefreshHome)
  const [topBarRefreshPulseKey, setTopBarRefreshPulseKey] = useState(0)
  const prevRefreshingRef = useRef(false)

  useEffect(() => {
    if (pullToRefresh.refreshing && !prevRefreshingRef.current) {
      setTopBarRefreshPulseKey((k) => k + 1)
    }
    prevRefreshingRef.current = pullToRefresh.refreshing
  }, [pullToRefresh.refreshing])

  const allMyEvents = useMemo(() => {
    const items = (tournamentsQuery.data ?? []) as any[]
    if (!items.length) return []

    if (!isAuthenticated) {
      return []
    }

    return items
      .filter((item) => {
        const phase = getTournamentPhase(item)
        if (phase === 'past') return false

        const status = statuses[item.id]?.status
        const { isParticipant, hasPrivilegedAccess } = getInvolvementMeta(
          item,
          user?.id,
          status,
          accessibleTournamentIds
        )

        return isParticipant || hasPrivilegedAccess
      })
      .sort((left, right) => {
        const leftPhase = getTournamentPhase(left)
        const rightPhase = getTournamentPhase(right)
        const phaseRank = { in_progress: 0, upcoming: 1, past: 2 } as const
        if (phaseRank[leftPhase] !== phaseRank[rightPhase]) {
          return phaseRank[leftPhase] - phaseRank[rightPhase]
        }
        return new Date(left.startDate).getTime() - new Date(right.startDate).getTime()
      })
  }, [accessibleTournamentIds, isAuthenticated, statuses, tournamentsQuery.data, user?.id])

  const monthlyEvents = useMemo(() => {
    const items = (tournamentsQuery.data ?? []) as any[]
    if (!items.length || !isAuthenticated) return []

    return items.filter((item) => {
      if (!isTournamentInCurrentMonth(item)) return false

      const status = statuses[item.id]?.status
      const { isParticipant, hasPrivilegedAccess } = getInvolvementMeta(
        item,
        user?.id,
        status,
        accessibleTournamentIds
      )

      return isParticipant || hasPrivilegedAccess
    })
  }, [accessibleTournamentIds, isAuthenticated, statuses, tournamentsQuery.data, user?.id])

  const myEvents = useMemo(() => allMyEvents.slice(0, 3), [allMyEvents])

  const needRegistrationStatuses = isAuthenticated && tournamentIds.length > 0
  const boardsInitialLoading = tournamentsQuery.isLoading && tournamentsQuery.data === undefined
  const accessibleInitialLoading =
    isAuthenticated && accessibleTournamentsQuery.isLoading && accessibleTournamentsQuery.data === undefined
  const isMyEventsLoading =
    boardsInitialLoading ||
    accessibleInitialLoading ||
    (needRegistrationStatuses && registrationStatusesQuery.isLoading)

  const confirmed = monthlyEvents.filter(
    (item) => statuses[item.id]?.status === 'active'
  ).length
  const adminCount = monthlyEvents.filter((item) => {
    const status = statuses[item.id]?.status
    return getInvolvementMeta(item, user?.id, status, accessibleTournamentIds).hasPrivilegedAccess
  }).length

  const monthlyEventCount = monthlyEvents.length

  const statusData = statuses
  const myEventStatusFor = (eventId: string) => statusData[eventId]?.status

  return (
    <PageLayout
      scroll={false}
      contentStyle={styles.layoutContent}
      topBarRefreshPulseKey={topBarRefreshPulseKey}
    >
      <View style={styles.page}>
        <View style={styles.headerSection}>
          <Text style={styles.welcomeTitle}>Welcome back!</Text>
          <Text style={styles.welcomeSubtitle}>Here&apos;s what&apos;s coming up</Text>
        </View>

        <Pressable onPress={() => router.push('/ai')}>
          <SurfaceCard style={styles.aiBanner}>
            <OptionalLinearGradient
              pointerEvents="none"
              colors={[colors.brandPurpleTint, colors.brandAccentTint, 'rgba(255, 255, 255, 0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.bannerGradient}
            />
            <View style={styles.aiRow}>
              <View style={styles.aiIcon}>
                <Feather name="zap" size={20} color={colors.white} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.aiTitle}>AI Assistant</Text>
                <Text style={styles.aiSubtitle}>Get help with strategies, rules, and more</Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.textMuted} />
            </View>
          </SurfaceCard>
        </Pressable>

        <SectionTitle
          title="My Events"
          action={<ActionButton label="View All" variant="ghost" onPress={() => router.push('/tournaments')} />}
        />

        <PickleRefreshScrollView
          style={styles.listScroll}
          contentContainerStyle={styles.listScrollContent}
          showsVerticalScrollIndicator={false}
          refreshing={pullToRefresh.refreshing}
          onRefresh={pullToRefresh.onRefresh}
          bounces
        >
      {tournamentsQuery.isError ? (
        <EmptyState
          title="Could not load events"
          body="Check your connection and EXPO_PUBLIC_API_URL, then pull down to refresh."
        />
      ) : isMyEventsLoading ? (
        <LoadingBlock label="Loading events…" />
      ) : null}

      {!tournamentsQuery.isError && !isMyEventsLoading && myEvents.length === 0 ? (
        <SurfaceCard tone="soft">
          <Text style={styles.emptyEventsTitle}>No upcoming events right now</Text>
          <Text style={styles.emptyEventsBody}>
            Tournaments where you are registered or have admin access will show up here.{' '}
            <Text style={styles.emptyEventsLink} onPress={() => router.push('/tournaments')}>
              Find events here.
            </Text>
          </Text>
        </SurfaceCard>
      ) : null}

      {!tournamentsQuery.isError &&
        myEvents.map((event) => {
        const status = myEventStatusFor(event.id)
        const isOwner = Boolean(user?.id && event.user?.id === user.id)
        const hasPrivilegedAccess = Boolean(isOwner || accessibleTournamentIds.has(event.id))
        const isUnpaid =
          status === 'active' &&
          Boolean(statuses[event.id]?.playerId) &&
          statuses[event.id]?.isPaid === false &&
          getEntryFeeCents(event) > 0
        return (
          <HomeTournamentCard
            key={event.id}
            tournament={event}
            myStatus={status}
            hasPrivilegedAccess={hasPrivilegedAccess}
            feeCents={getEntryFeeCents(event)}
            isUnpaid={isUnpaid}
          />
        )
      })}

      {!tournamentsQuery.isError ? (
      <SurfaceCard tone="hero" style={styles.monthCard}>
        <Text style={styles.monthTitle}>This Month</Text>
        <View style={styles.statsRow}>
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{monthlyEventCount}</Text>
            <Text style={styles.statLabel}>Events</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{confirmed}</Text>
            <Text style={styles.statLabel}>Confirmed</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{adminCount}</Text>
            <Text style={styles.statLabel}>Admin</Text>
          </View>
        </View>
      </SurfaceCard>
      ) : null}
        </PickleRefreshScrollView>
      </View>
    </PageLayout>
  )
}

const createStyles = (colors: ThemePalette) => StyleSheet.create({
  layoutContent: {
    paddingBottom: 0,
  },
  page: {
    flex: 1,
    gap: spacing.md,
  },
  listScroll: {
    flex: 1,
  },
  listScrollContent: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  headerSection: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  welcomeTitle: {
    fontSize: 30,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.8,
  },
  welcomeSubtitle: {
    marginTop: 6,
    color: colors.textMuted,
    fontSize: 15,
  },
  aiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  aiBanner: {
    position: 'relative',
    backgroundColor: colors.surface,
    borderColor: colors.brandPurpleBorder,
    shadowColor: 'transparent',
    elevation: 0,
  },
  bannerGradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.lg,
  },
  aiIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandAccent,
  },
  aiTitle: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 17,
  },
  aiSubtitle: {
    marginTop: 4,
    color: colors.textMuted,
    fontSize: 13,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  monthCard: {
    position: 'relative',
    shadowColor: 'transparent',
    elevation: 0,
  },
  eventTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  eventStatusBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 8,
  },
  eventTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
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
  emptyEventsTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  emptyEventsBody: {
    marginTop: 8,
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  emptyEventsLink: {
    color: colors.primary,
    fontWeight: '700',
  },
  monthTitle: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 16,
  },
  statsRow: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.primary,
  },
  statLabel: {
    marginTop: 4,
    fontSize: 12,
    color: colors.textMuted,
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: colors.border,
  },
})


