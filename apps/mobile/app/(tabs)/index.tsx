import { Feather } from '@expo/vector-icons'
import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'

import { PageLayout } from '../../src/components/navigation/PageLayout'
import { OptionalLinearGradient } from '../../src/components/OptionalLinearGradient'
import { ActionButton, LoadingBlock, Pill, SectionTitle, SurfaceCard } from '../../src/components/ui'
import { formatDateRange, formatLocation } from '../../src/lib/formatters'
import { trpc } from '../../src/lib/trpc'
import { palette, radius, spacing } from '../../src/lib/theme'
import { useAuth } from '../../src/providers/AuthProvider'

const statusLabel = (status?: string | null, hasPrivilegedAccess = false) => {
  if (hasPrivilegedAccess) return 'Admin'
  if (status === 'active') return 'Confirmed'
  if (status === 'waitlisted') return 'Pending'
  return 'Open'
}

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

export default function HomeTab() {
  const { token, user } = useAuth()
  const isAuthenticated = Boolean(token)
  const api = trpc as any

  const tournamentsQuery = api.public.listBoards.useQuery()
  const tournamentIds = useMemo(
    () => ((tournamentsQuery.data ?? []) as any[]).map((item) => item.id),
    [tournamentsQuery.data]
  )
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

  const isMyEventsLoading =
    tournamentsQuery.isLoading ||
    (myEvents.length === 0 &&
      isAuthenticated &&
      tournamentIds.length > 0 &&
      registrationStatusesQuery.isLoading)

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
    <PageLayout>
      <View style={styles.headerSection}>
        <Text style={styles.welcomeTitle}>Welcome back!</Text>
        <Text style={styles.welcomeSubtitle}>Here&apos;s what&apos;s coming up</Text>
      </View>

      <Pressable onPress={() => router.push('/ai')}>
        <SurfaceCard style={styles.aiBanner}>
          <OptionalLinearGradient
            pointerEvents="none"
            colors={['rgba(82, 224, 104, 0.20)', 'rgba(31, 160, 53, 0.14)', 'rgba(255, 255, 255, 0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.bannerGradient}
          />
          <View style={styles.aiRow}>
            <View style={styles.aiIcon}>
              <Feather name="zap" size={20} color={palette.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.aiTitle}>AI Assistant</Text>
              <Text style={styles.aiSubtitle}>Get help with strategies, rules, and more</Text>
            </View>
            <Feather name="chevron-right" size={18} color={palette.textMuted} />
          </View>
        </SurfaceCard>
      </Pressable>

      <SectionTitle
        title="My Events"
        action={<ActionButton label="View All" variant="ghost" onPress={() => router.push('/tournaments')} />}
      />

      {isMyEventsLoading ? <LoadingBlock label="Loading events…" /> : null}

      {!isMyEventsLoading && myEvents.length === 0 ? (
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

      {myEvents.map((event) => {
        const status = myEventStatusFor(event.id)
        const isOwner = Boolean(user?.id && event.user?.id === user.id)
        const hasPrivilegedAccess = Boolean(isOwner || accessibleTournamentIds.has(event.id))
        const isUnpaid =
          status === 'active' &&
          Boolean(statuses[event.id]?.playerId) &&
          statuses[event.id]?.isPaid === false &&
          getEntryFeeCents(event) > 0
        return (
          <Pressable
            key={event.id}
            onPress={() => router.push(`/tournaments/${event.id}`)}
          >
            <SurfaceCard>
              <View style={styles.eventRow}>
                <View style={styles.eventIcon}>
                  <Feather name="award" size={20} color={palette.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.eventTopRow}>
                    <Text style={styles.eventTitle}>{event.title}</Text>
                    <View style={styles.eventStatusBadges}>
                      <Pill
                        label={statusLabel(status, hasPrivilegedAccess)}
                        tone={hasPrivilegedAccess ? 'primary' : status === 'waitlisted' ? 'warning' : 'success'}
                      />
                      {isUnpaid ? <Pill label="Unpaid" tone="danger" /> : null}
                    </View>
                  </View>
                  <View style={styles.eventMetaRow}>
                    <Feather name="calendar" size={14} color={palette.textMuted} />
                    <Text style={styles.eventMeta}>{formatDateRange(event.startDate, event.endDate)}</Text>
                  </View>
                  <View style={styles.eventMetaRow}>
                    <Feather name="map-pin" size={14} color={palette.textMuted} />
                    <Text numberOfLines={1} style={styles.eventMeta}>
                      {formatLocation([event.venueName, event.venueAddress])}
                    </Text>
                  </View>
                  {event.divisions?.length ? (
                    <View style={styles.badgeRow}>
                      <Pill label={event.divisions[0].name} />
                      {event.divisions[1] ? <Pill label={event.divisions[1].name} /> : null}
                    </View>
                  ) : null}
                </View>
              </View>
            </SurfaceCard>
          </Pressable>
        )
      })}

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
    </PageLayout>
  )
}

const styles = StyleSheet.create({
  headerSection: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  welcomeTitle: {
    fontSize: 30,
    fontWeight: '700',
    color: palette.text,
    letterSpacing: -0.8,
  },
  welcomeSubtitle: {
    marginTop: 6,
    color: palette.textMuted,
    fontSize: 15,
  },
  aiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  aiBanner: {
    position: 'relative',
    backgroundColor: palette.surface,
    borderColor: palette.brandPurpleBorder,
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
    backgroundColor: palette.brandAccent,
  },
  aiTitle: {
    color: palette.text,
    fontWeight: '700',
    fontSize: 17,
  },
  aiSubtitle: {
    marginTop: 4,
    color: palette.textMuted,
    fontSize: 13,
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
    color: palette.text,
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
  emptyEventsTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '700',
  },
  emptyEventsBody: {
    marginTop: 8,
    color: palette.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  emptyEventsLink: {
    color: palette.primary,
    fontWeight: '700',
  },
  monthTitle: {
    color: palette.text,
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
    color: palette.primary,
  },
  statLabel: {
    marginTop: 4,
    fontSize: 12,
    color: palette.textMuted,
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: palette.border,
  },
})


