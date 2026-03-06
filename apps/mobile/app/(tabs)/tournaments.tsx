import { Feather } from '@expo/vector-icons'
import { useMemo, useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'

import { PageLayout } from '../../src/components/navigation/PageLayout'
import { TournamentCard } from '../../src/components/TournamentCard'
import {
  ActionButton,
  EmptyState,
  LoadingBlock,
  SearchField,
  SectionTitle,
  SurfaceCard,
} from '../../src/components/ui'
import { palette, radius, spacing } from '../../src/lib/theme'
import { trpc } from '../../src/lib/trpc'
import { useAuth } from '../../src/providers/AuthProvider'

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

const getTeamMetrics = (tournament: any) => {
  const filledTeams = ((tournament.divisions ?? []) as any[]).reduce(
    (sum, division) => sum + Number(division?._count?.teams ?? 0),
    0
  )
  const maxTeams = ((tournament.divisions ?? []) as any[]).reduce(
    (sum, division) => sum + Number(division?.maxTeams ?? 0),
    0
  )

  return { filledTeams, maxTeams }
}

const getCardStatus = (tournament: any, status?: string | null): { label: string; tone: CardTone } => {
  if (status === 'active') return { label: 'Registered', tone: 'primary' }
  if (status === 'waitlisted') return { label: 'Waitlist', tone: 'warning' }

  if (new Date(tournament.endDate).getTime() < Date.now()) {
    return { label: 'Closed', tone: 'muted' }
  }

  const { filledTeams, maxTeams } = getTeamMetrics(tournament)
  if (maxTeams > 0 && filledTeams >= maxTeams) {
    return { label: 'Waitlist', tone: 'warning' }
  }
  if (maxTeams > 0 && filledTeams / maxTeams >= 0.75) {
    return { label: 'Filling Fast', tone: 'warning' }
  }

  return { label: 'Open', tone: 'success' }
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
        color={active ? palette.white : disabled ? palette.textMuted : palette.text}
      />
      <Text style={[styles.filterChipLabel, active && styles.filterChipLabelActive]}>
        {label}
      </Text>
    </Pressable>
  )
}

export default function TournamentsTab() {
  const { token } = useAuth()
  const isAuthenticated = Boolean(token)
  const [mode, setMode] = useState<'upcoming' | 'registered' | 'past'>('upcoming')
  const [search, setSearch] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [thisMonthOnly, setThisMonthOnly] = useState(false)
  const [selectedFormats, setSelectedFormats] = useState<string[]>([])
  const [selectedDivisions, setSelectedDivisions] = useState<string[]>([])
  const [maxFee, setMaxFee] = useState<number | null>(null)
  const api = trpc as any
  const utils = trpc.useUtils() as any

  const tournamentsQuery = api.public.listBoards.useQuery()
  const tournamentIds = useMemo(
    () => ((tournamentsQuery.data ?? []) as any[]).map((item) => item.id),
    [tournamentsQuery.data]
  )
  const registrationStatusesQuery = api.registration.getMyStatuses.useQuery(
    { tournamentIds },
    { enabled: isAuthenticated && tournamentIds.length > 0 }
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
      router.push({ pathname: '/tournaments/[id]/register', params: { id: result.tournamentId } })
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
        return myStatus === 'active' || myStatus === 'waitlisted'
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
  }, [maxFee, mode, search, selectedDivisions, selectedFormats, thisMonthOnly, tournamentsQuery.data, registrationStatusesQuery.data])

  const invitationItems = ((notificationsQuery.data?.items ?? []) as any[]).filter(
    (item) => item.type === 'TOURNAMENT_INVITATION'
  )
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

  return (
    <PageLayout scroll={false} contentStyle={styles.layoutContent}>
      <View style={styles.page}>
        <View style={styles.headerPanel}>
          <SearchField
            value={search}
            onChangeText={setSearch}
            placeholder="Search tournaments..."
            containerStyle={styles.searchField}
          />
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
          <View style={styles.modeSwitch}>
            {(['upcoming', 'registered', 'past'] as const).map((value) => {
              const active = mode === value
              return (
                <Pressable
                  key={value}
                  onPress={() => setMode(value)}
                  style={[styles.modeButton, active && styles.modeButtonActive]}
                >
                  <Text style={[styles.modeLabel, active && styles.modeLabelActive]}>
                    {value === 'upcoming' ? 'Upcoming' : value === 'registered' ? 'Registered' : 'Past'}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
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
                      <Feather name="mail" size={18} color={palette.white} />
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

          {tournamentsQuery.isLoading ? <LoadingBlock label="Loading tournaments..." /> : null}

          {!tournamentsQuery.isLoading && filtered.length === 0 ? (
            <EmptyState
              title={mode === 'registered' ? 'No registered tournaments' : 'Nothing matched this search'}
              body={
                mode === 'registered'
                  ? isAuthenticated
                    ? 'Register for a public event and it will appear here.'
                    : 'Sign in to see tournaments where you are registered.'
                  : 'Try another search or clear the active filters.'
              }
            />
          ) : null}

          {filtered.map((tournament) => {
            const myStatus = registrationStatusesQuery.data?.[tournament.id]?.status
            const feeCents =
              typeof tournament.entryFee === 'string' ? Math.round(Number(tournament.entryFee) * 100) : tournament.entryFeeCents
            const cardStatus = getCardStatus(tournament, myStatus)

            return (
              <TournamentCard
                key={tournament.id}
                tournament={{
                  ...tournament,
                  entryFeeCents: feeCents,
                }}
                statusLabel={cardStatus.label}
                statusTone={cardStatus.tone}
                onPress={() =>
                  router.push({ pathname: '/tournaments/[id]', params: { id: tournament.id } })
                }
              />
            )
          })}
        </ScrollView>

        <Modal
          transparent
          visible={showFilters}
          animationType="fade"
          onRequestClose={() => setShowFilters(false)}
        >
          <View style={styles.sheetOverlay}>
            <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setShowFilters(false)} />
            <View style={styles.sheet}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>Filters</Text>
              <ScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
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
              <View style={styles.sheetActions}>
                <View style={{ flex: 1 }}>
                  <ActionButton label="Clear All" variant="secondary" onPress={clearFilters} />
                </View>
                <View style={{ flex: 1 }}>
                  <ActionButton label="Apply Filters" onPress={() => setShowFilters(false)} />
                </View>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </PageLayout>
  )
}

const styles = StyleSheet.create({
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
  searchField: {
    minHeight: 44,
    borderWidth: 0,
    backgroundColor: palette.surfaceElevated,
    paddingHorizontal: 14,
    gap: 8,
  },
  quickFilters: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: spacing.md,
  },
  filterChip: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterChipActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  filterChipDisabled: {
    opacity: 0.55,
  },
  filterChipPressed: {
    opacity: 0.88,
  },
  filterChipLabel: {
    color: palette.text,
    fontWeight: '600',
    fontSize: 13,
  },
  filterChipLabelActive: {
    color: palette.white,
  },
  modeSwitch: {
    flexDirection: 'row',
    gap: 4,
    minHeight: 36,
    backgroundColor: palette.surfaceMuted,
    padding: 3,
    borderRadius: radius.sm,
  },
  modeButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 30,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  modeButtonActive: {
    backgroundColor: palette.surface,
  },
  modeLabel: {
    color: palette.textMuted,
    fontWeight: '600',
    fontSize: 14,
  },
  modeLabelActive: {
    color: palette.text,
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
    backgroundColor: palette.primary,
  },
  inviteTitle: {
    color: palette.text,
    fontWeight: '700',
    fontSize: 17,
  },
  inviteBody: {
    marginTop: 6,
    color: palette.textMuted,
    lineHeight: 20,
  },
  inviteActions: {
    marginTop: spacing.md,
    flexDirection: 'row',
    gap: 10,
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 10, 10, 0.22)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    maxHeight: '80%',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 999,
    backgroundColor: palette.border,
    marginBottom: spacing.md,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: palette.text,
  },
  sheetContent: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.lg,
  },
  sheetSection: {
    gap: spacing.sm,
  },
  sheetSectionTitle: {
    color: palette.text,
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
    borderColor: palette.border,
    backgroundColor: palette.surfaceElevated,
  },
  sheetChipActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  sheetChipLabel: {
    color: palette.text,
    fontWeight: '600',
    fontSize: 13,
  },
  sheetChipLabelActive: {
    color: palette.white,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
})
