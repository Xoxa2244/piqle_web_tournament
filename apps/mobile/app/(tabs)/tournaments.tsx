import { Feather } from '@expo/vector-icons'
import { useCallback, useMemo, useState } from 'react'
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'

import { AppBottomSheet } from '../../src/components/AppBottomSheet'
import { PickleRefreshScrollView } from '../../src/components/PickleRefreshScrollView'
import { PageLayout } from '../../src/components/navigation/PageLayout'
import { TournamentCard } from '../../src/components/TournamentCard'
import {
  ActionButton,
  EmptyState,
  LoadingBlock,
  SearchField,
  SectionTitle,
  SegmentedControl,
  SurfaceCard,
} from '../../src/components/ui'
import { getTournamentSlotMetrics } from '../../src/lib/tournamentSlots'
import { FEEDBACK_API_ENABLED } from '../../src/lib/config'
import { radius, spacing, type ThemePalette } from '../../src/lib/theme'
import { trpc } from '../../src/lib/trpc'
import { useAuth } from '../../src/providers/AuthProvider'
import { useAppTheme } from '../../src/providers/ThemeProvider'
import { usePullToRefresh } from '../../src/hooks/usePullToRefresh'

type CardTone = 'muted' | 'primary' | 'danger' | 'success' | 'warning'

const formatLabel = (format?: string | null) => {
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

const getFeeValue = (tournament: any) => {
  if (typeof tournament.entryFeeCents === 'number') {
    return tournament.entryFeeCents / 100
  }
  if (tournament.entryFee != null && Number(tournament.entryFee) > 0) {
    return Number(tournament.entryFee)
  }
  return 0
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

const TournamentListCard = ({
  tournament,
  myStatus,
  hasPrivilegedAccess,
  feeCents,
  isUnpaid,
  feedbackSummary,
}: {
  tournament: any
  myStatus?: string | null
  hasPrivilegedAccess: boolean
  feeCents?: number | null
  isUnpaid?: boolean
  feedbackSummary?: { total: number; averageRating: number | null; canPublish: boolean } | null
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
      feedbackSummary: feedbackSummary ?? null,
    }),
    [detailQuery.data, feeCents, feedbackSummary, tournament]
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

const FilterChip = ({
  label,
  icon,
  active = false,
  onPress,
  disabled = false,
}: {
  label: string
  icon: keyof typeof Feather.glyphMap
  active?: boolean
  onPress?: () => void
  disabled?: boolean
}) => {
  const { colors, styles } = useTournamentsTheme()
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterChip,
        active && styles.filterChipActive,
        disabled && styles.filterChipDisabled,
        pressed && !disabled && styles.filterChipPressed,
      ]}
    >
      <Feather
        name={icon}
        size={14}
        color={active ? colors.white : disabled ? colors.textMuted : colors.text}
      />
      <Text style={[styles.filterChipLabel, active && styles.filterChipLabelActive]}>
        {label}
      </Text>
    </Pressable>
  )
}

const useTournamentsTheme = () => {
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])

  return { colors, styles }
}

export default function TournamentsTab() {
  const { colors, styles } = useTournamentsTheme()
  const { token, user } = useAuth()
  const isAuthenticated = Boolean(token)
  const [mode, setMode] = useState<'upcoming' | 'registered' | 'past'>('upcoming')
  const [search, setSearch] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [thisMonthOnly, setThisMonthOnly] = useState(false)
  const [selectedFormats, setSelectedFormats] = useState<string[]>([])
  const [selectedDivisions, setSelectedDivisions] = useState<string[]>([])
  const [maxFee, setMaxFee] = useState<number | null>(null)
  const api = trpc as any
  const utils = (trpc as any).useUtils()

  const tournamentsQuery = api.public.listBoards.useQuery()
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
  const eventChatsQuery = api.tournamentChat.listMyEventChats.useQuery(undefined, {
    enabled: isAuthenticated,
  })
  const accessibleTournamentIds = useMemo(
    () => new Set((((accessibleTournamentsQuery.data ?? []) as any[]).map((item) => item.id) as string[])),
    [accessibleTournamentsQuery.data]
  )
  const eventPermissions = useMemo(
    () =>
      Object.fromEntries(
        (((eventChatsQuery.data ?? []) as any[]).map((item) => [item.id, item.permission]) as Array<
          [string, { canModerate?: boolean; isOwner?: boolean; isTournamentAdmin?: boolean; isClubAdmin?: boolean } | undefined]
        >)
      ) as Record<
        string,
        { canModerate?: boolean; isOwner?: boolean; isTournamentAdmin?: boolean; isClubAdmin?: boolean } | undefined
      >,
    [eventChatsQuery.data]
  )
  const notificationsQuery = api.notification.list.useQuery(
    { limit: 8 },
    { enabled: isAuthenticated }
  )

  const acceptInvitation = api.tournamentInvitation.accept.useMutation({
    onSuccess: async (result) => {
      await Promise.all([
        utils.notification.list.invalidate(),
        utils.registration.getMyStatuses.invalidate({ tournamentIds }),
      ])
      router.push(`/tournaments/${result.tournamentId}/register`)
    },
  })
  const declineInvitation = api.tournamentInvitation.decline.useMutation({
    onSuccess: async () => {
      await utils.notification.list.invalidate()
    },
  })

  const availableFormats = useMemo(
    () =>
      Array.from(
        new Set(
          ((tournamentsQuery.data ?? []) as any[])
            .map((item) => formatLabel(item.format))
            .filter(Boolean)
        )
      ),
    [tournamentsQuery.data]
  )
  const availableDivisions = useMemo(
    () =>
      Array.from(
        new Set(
          ((tournamentsQuery.data ?? []) as any[]).flatMap((item) =>
            ((item.divisions ?? []) as any[]).map((division) => division.name)
          )
        )
      ),
    [tournamentsQuery.data]
  )

  const filtered = useMemo(() => {
    const source = (tournamentsQuery.data ?? []) as any[]
    const searchTerm = search.trim().toLowerCase()
    let searched = searchTerm
      ? source.filter((item) => {
          const location = [item.venueName, item.venueAddress].filter(Boolean).join(' ').toLowerCase()
          const divisions = ((item.divisions ?? []) as any[]).map((division) => division.name.toLowerCase())
          return (
            item.title.toLowerCase().includes(searchTerm) ||
            location.includes(searchTerm) ||
            divisions.some((division) => division.includes(searchTerm))
          )
        })
      : source

    if (mode === 'registered') {
      searched = searched.filter((item) => {
        const myStatus = registrationStatusesQuery.data?.[item.id]?.status
        const permission = eventPermissions[item.id]
        const isOwner = Boolean(user?.id && item.user?.id === user.id)
        const hasPrivilegedAccess = Boolean(
          isOwner ||
            accessibleTournamentIds.has(item.id) ||
            permission?.canModerate ||
            permission?.isOwner ||
            permission?.isTournamentAdmin ||
            permission?.isClubAdmin
        )
        return myStatus === 'active' || myStatus === 'waitlisted' || hasPrivilegedAccess
      })
    }

    if (mode === 'past') {
      searched = searched.filter((item) => new Date(item.endDate).getTime() < Date.now())
    } else {
      searched = searched.filter((item) => new Date(item.endDate).getTime() >= Date.now())
    }

    if (thisMonthOnly) {
      const now = new Date()
      searched = searched.filter((item) => {
        const startDate = new Date(item.startDate)
        return (
          startDate.getMonth() === now.getMonth() && startDate.getFullYear() === now.getFullYear()
        )
      })
    }

    if (selectedFormats.length > 0) {
      searched = searched.filter((item) => selectedFormats.includes(formatLabel(item.format)))
    }

    if (selectedDivisions.length > 0) {
      searched = searched.filter((item) =>
        ((item.divisions ?? []) as any[]).some((division) => selectedDivisions.includes(division.name))
      )
    }

    if (maxFee !== null) {
      searched = searched.filter((item) => getFeeValue(item) <= maxFee)
    }

    return searched
  }, [
    maxFee,
    mode,
    search,
    selectedDivisions,
    selectedFormats,
    thisMonthOnly,
    tournamentsQuery.data,
    registrationStatusesQuery.data,
    accessibleTournamentIds,
    eventPermissions,
    user?.id,
  ])

  const visibleTournamentIds = useMemo(() => filtered.map((t) => t.id).slice(0, 200), [filtered])
  const tournamentFeedbackSummariesQuery = api.feedback.getBatchSummaries.useQuery(
    { entityType: 'TOURNAMENT', entityIds: visibleTournamentIds },
    { enabled: FEEDBACK_API_ENABLED && visibleTournamentIds.length > 0 && isAuthenticated },
  )
  const feedbackByTournamentId = (tournamentFeedbackSummariesQuery.data?.map ?? {}) as Record<
    string,
    { total: number; averageRating: number | null; canPublish: boolean }
  >
  const feedbackByTournamentWithDevFallback = useMemo(() => {
    const map = { ...feedbackByTournamentId }
    if (!__DEV__) return map
    for (const id of visibleTournamentIds) {
      if (map[id]) continue
      const seed = id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
      const total = 5 + (seed % 24)
      const avg = 3.7 + (seed % 14) / 20
      map[id] = { total, averageRating: Number(avg.toFixed(1)), canPublish: true }
    }
    return map
  }, [feedbackByTournamentId, visibleTournamentIds])

  const invitationItems = ((notificationsQuery.data?.items ?? []) as any[]).filter(
    (item) => item.type === 'TOURNAMENT_INVITATION'
  )
  const tournamentsInitialLoading = tournamentsQuery.isLoading && tournamentsQuery.data === undefined
  const isStatusContextLoading =
    mode === 'registered' &&
    isAuthenticated &&
    tournamentIds.length > 0 &&
    registrationStatusesQuery.isLoading
  const activeFilterCount =
    (thisMonthOnly ? 1 : 0) +
    selectedFormats.length +
    selectedDivisions.length +
    (maxFee !== null ? 1 : 0)

  const toggleFormat = (value: string) => {
    setSelectedFormats((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    )
  }

  const toggleDivision = (value: string) => {
    setSelectedDivisions((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    )
  }

  const clearFilters = () => {
    setThisMonthOnly(false)
    setSelectedFormats([])
    setSelectedDivisions([])
    setMaxFee(null)
  }

  const onRefreshTournaments = useCallback(async () => {
    const boards = await tournamentsQuery.refetch()
    const freshIds = ((boards.data ?? []) as any[]).map((item: any) => item.id as string).sort()
    const parallel: Promise<unknown>[] = [
      accessibleTournamentsQuery.refetch(),
      eventChatsQuery.refetch(),
      isAuthenticated ? notificationsQuery.refetch() : Promise.resolve(),
    ]
    if (isAuthenticated && freshIds.length > 0) {
      parallel.push(utils.registration.getMyStatuses.fetch({ tournamentIds: freshIds }))
    }
    await Promise.all(parallel)
  }, [accessibleTournamentsQuery, eventChatsQuery, isAuthenticated, notificationsQuery, tournamentsQuery, utils])

  const pullToRefresh = usePullToRefresh(onRefreshTournaments)

  return (
    <PageLayout scroll={false} contentStyle={styles.layoutContent}>
      <View style={styles.page}>
        <View style={styles.headerPanel}>
          <SearchField value={search} onChangeText={setSearch} placeholder="Search tournaments..." />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickFilters}
          >
            <FilterChip
              label={activeFilterCount > 0 ? `Filters (${activeFilterCount})` : 'Filters'}
              icon="filter"
              active={activeFilterCount > 0}
              onPress={() => setShowFilters(true)}
            />
            <FilterChip label="Near Me" icon="map-pin" disabled />
            <FilterChip
              label="This Month"
              icon="calendar"
              active={thisMonthOnly}
              onPress={() => setThisMonthOnly((current) => !current)}
            />
          </ScrollView>
          <SegmentedControl
            value={mode}
            onChange={setMode}
            options={[
              { value: 'upcoming', label: 'Upcoming' },
              { value: 'registered', label: 'Registered' },
              { value: 'past', label: 'Past' },
            ]}
          />
        </View>

        <PickleRefreshScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshing={pullToRefresh.refreshing}
          onRefresh={pullToRefresh.onRefresh}
          refreshMaskColor={colors.background}
          bounces
        >
          {isAuthenticated && invitationItems.length > 0 ? (
            <View style={styles.invitationSection}>
              <SectionTitle
                title="Pending invitations"
                subtitle="Accept an invite and jump straight into registration."
              />
              {invitationItems.map((item) => (
                <SurfaceCard key={item.id} tone="hero">
                  <View style={styles.inviteHeader}>
                    <View style={styles.inviteIcon}>
                      <Feather name="mail" size={18} color={colors.white} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.inviteTitle}>{item.title}</Text>
                      <Text style={styles.inviteBody}>{item.body}</Text>
                    </View>
                  </View>
                  <View style={styles.inviteActions}>
                    <View style={{ flex: 1 }}>
                      <ActionButton
                        label="Accept"
                        loading={acceptInvitation.isPending}
                        onPress={() => acceptInvitation.mutate({ invitationId: item.invitationId })}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <ActionButton
                        label="Decline"
                        variant="secondary"
                        loading={declineInvitation.isPending}
                        onPress={() => declineInvitation.mutate({ invitationId: item.invitationId })}
                      />
                    </View>
                  </View>
                </SurfaceCard>
              ))}
            </View>
          ) : null}

          {tournamentsQuery.isError ? (
            <EmptyState
              title="Could not load tournaments"
              body="Check your connection and EXPO_PUBLIC_API_URL, then pull down to refresh."
            />
          ) : tournamentsInitialLoading || isStatusContextLoading ? (
            <LoadingBlock label="Loading tournaments..." />
          ) : null}

          {!tournamentsQuery.isError && !tournamentsInitialLoading && !isStatusContextLoading && filtered.length === 0 ? (
            <EmptyState
              title={mode === 'registered' ? 'No tournaments yet' : 'Nothing matched this search'}
              body={
                mode === 'registered'
                  ? isAuthenticated
                    ? 'Tournaments where you are registered or have admin access will appear here.'
                    : 'Sign in to see tournaments where you are registered or admin.'
                  : 'Try another search or clear the active filters.'
              }
            />
          ) : null}

          {!tournamentsQuery.isError &&
            filtered.map((tournament) => {
            const myStatusInfo = registrationStatusesQuery.data?.[tournament.id]
            const myStatus = myStatusInfo?.status
            const permission = eventPermissions[tournament.id]
            const isOwner = Boolean(user?.id && tournament.user?.id === user.id)
            const hasPrivilegedAccess = Boolean(
              isOwner ||
                accessibleTournamentIds.has(tournament.id) ||
                permission?.canModerate ||
                permission?.isOwner ||
                permission?.isTournamentAdmin ||
                permission?.isClubAdmin
            )
            const feeCents =
              typeof tournament.entryFee === 'string' ? Math.round(Number(tournament.entryFee) * 100) : tournament.entryFeeCents
            const isUnpaid =
              myStatus === 'active' &&
              Boolean(myStatusInfo?.playerId) &&
              myStatusInfo?.isPaid === false &&
              Number(feeCents ?? 0) > 0

            return (
              <TournamentListCard
                key={tournament.id}
                tournament={tournament}
                myStatus={myStatus}
                hasPrivilegedAccess={hasPrivilegedAccess}
                feeCents={feeCents}
                isUnpaid={isUnpaid}
                feedbackSummary={feedbackByTournamentWithDevFallback[tournament.id] ?? null}
              />
            )
          })}
        </PickleRefreshScrollView>

        <AppBottomSheet
          open={showFilters}
          onClose={() => setShowFilters(false)}
          title="Filters"
          footer={
            <View style={styles.sheetActions}>
              <View style={{ flex: 1 }}>
                <ActionButton label="Clear All" variant="outline" onPress={clearFilters} />
              </View>
              <View style={{ flex: 1 }}>
                <ActionButton label="Apply Filters" variant="primary" onPress={() => setShowFilters(false)} />
              </View>
            </View>
          }
        >
          <ScrollView
            style={{ maxHeight: Math.round(Dimensions.get('window').height * 0.5) }}
            contentContainerStyle={styles.sheetContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.sheetSection}>
              <Text style={styles.sheetSectionTitle}>Entry fee</Text>
              <View style={styles.sheetChipWrap}>
                {[
                  { label: 'Any', value: null as number | null },
                  { label: 'Free', value: 0 },
                  { label: 'Under $50', value: 50 },
                  { label: 'Under $100', value: 100 },
                ].map((option) => {
                  const active = maxFee === option.value
                  return (
                    <Pressable
                      key={option.label}
                      onPress={() => setMaxFee(option.value)}
                      style={[styles.sheetChip, active && styles.sheetChipActive]}
                    >
                      <Text style={[styles.sheetChipLabel, active && styles.sheetChipLabelActive]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>

            <View style={styles.sheetSection}>
              <Text style={styles.sheetSectionTitle}>Format</Text>
              <View style={styles.sheetChipWrap}>
                {availableFormats.map((value) => {
                  const active = selectedFormats.includes(value)
                  return (
                    <Pressable
                      key={value}
                      onPress={() => toggleFormat(value)}
                      style={[styles.sheetChip, active && styles.sheetChipActive]}
                    >
                      <Text style={[styles.sheetChipLabel, active && styles.sheetChipLabelActive]}>
                        {value}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>

            <View style={styles.sheetSection}>
              <Text style={styles.sheetSectionTitle}>Divisions</Text>
              <View style={styles.sheetChipWrap}>
                {availableDivisions.map((value) => {
                  const active = selectedDivisions.includes(value)
                  return (
                    <Pressable
                      key={value}
                      onPress={() => toggleDivision(value)}
                      style={[styles.sheetChip, active && styles.sheetChipActive]}
                    >
                      <Text style={[styles.sheetChipLabel, active && styles.sheetChipLabelActive]}>
                        {value}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>
          </ScrollView>
        </AppBottomSheet>
      </View>
    </PageLayout>
  )
}

const createStyles = (colors: ThemePalette) => StyleSheet.create({
  page: {
    flex: 1,
    gap: spacing.md,
  },
  layoutContent: {
    paddingBottom: 0,
  },
  headerPanel: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
    borderRadius: 0,
    padding: 0,
    gap: spacing.md,
  },
  quickFilters: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: spacing.md,
  },
  filterChip: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipDisabled: {
    opacity: 0.55,
  },
  filterChipPressed: {
    opacity: 0.88,
  },
  filterChipLabel: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 13,
  },
  filterChipLabelActive: {
    color: colors.white,
  },
  listContent: {
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  invitationSection: {
    gap: spacing.md,
  },
  inviteHeader: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  inviteIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  inviteTitle: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 17,
  },
  inviteBody: {
    marginTop: 6,
    color: colors.textMuted,
    lineHeight: 20,
  },
  inviteActions: {
    marginTop: spacing.md,
    flexDirection: 'row',
    gap: 10,
  },
  sheetContent: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    gap: spacing.lg,
  },
  sheetSection: {
    gap: spacing.sm,
  },
  sheetSectionTitle: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 15,
  },
  sheetChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sheetChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  sheetChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  sheetChipLabel: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 13,
  },
  sheetChipLabelActive: {
    color: colors.white,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
})
