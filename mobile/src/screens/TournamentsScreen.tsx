import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { type BottomTabNavigationProp } from '@react-navigation/bottom-tabs'
import { type CompositeNavigationProp, type RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { type NativeStackNavigationProp } from '@react-navigation/native-stack'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  fetchTournamentFeedPage,
  type TournamentFeedFormat,
  type TournamentFeedPolicy,
} from '../api/mobileData'
import { AppBackground } from '../components/AppBackground'
import { Badge } from '../components/Badge'
import { isWebOnlyTournament, type Tournament } from '../data/mockData'
import {
  type MainTabParamList,
  type RootStackParamList,
  type TournamentFormatFilter,
  type TournamentPolicyFilter,
} from '../navigation/types'
import { colors } from '../theme/colors'
import { spacing } from '../theme/spacing'

type PolicyFilter = TournamentPolicyFilter
type FormatFilter = TournamentFormatFilter

type TournamentsNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Tournaments'>,
  NativeStackNavigationProp<RootStackParamList>
>
type TournamentsRoute = RouteProp<MainTabParamList, 'Tournaments'>

const PAGE_SIZE = 12
const SEARCH_DEBOUNCE_MS = 350
const SCROLL_END_THRESHOLD = 160

const policyFilters: Array<{ id: PolicyFilter; label: string }> = [
  { id: 'ALL', label: 'All' },
  { id: 'MOBILE', label: 'Mobile allowed' },
  { id: 'WEB_ONLY', label: 'Web only admin' },
]

const formatFilters: FormatFilter[] = [
  'ALL',
  'SINGLE_ELIMINATION',
  'ROUND_ROBIN',
  'MLP',
  'INDY_LEAGUE',
  'LEAGUE_ROUND_ROBIN',
  'ONE_DAY_LADDER',
  'LADDER_LEAGUE',
]

const toFormatLabel = (format: string) =>
  format
    .split('_')
    .map((part) => `${part.slice(0, 1)}${part.slice(1).toLowerCase()}`)
    .join(' ')

const formatEntryFee = (entryFeeUsd: number) => (entryFeeUsd > 0 ? `$${entryFeeUsd}` : 'Free')

const getOpenSlots = (tournament: Tournament) => Math.max(0, tournament.capacity - tournament.participants)

export function TournamentsScreen() {
  const navigation = useNavigation<TournamentsNavigation>()
  const route = useRoute<TournamentsRoute>()

  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [dataSource, setDataSource] = useState<'live' | 'fallback'>('fallback')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  const [policyFilter, setPolicyFilter] = useState<PolicyFilter>('ALL')
  const [formatFilter, setFormatFilter] = useState<FormatFilter>('ALL')
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [totalCount, setTotalCount] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null)

  const requestVersionRef = useRef(0)
  const loadingMoreRef = useRef(false)

  useEffect(() => {
    if (!route.params) return
    const presetQuery = route.params.initialSearchQuery?.trim() ?? ''
    setSearchQuery(presetQuery)
    setDebouncedSearchQuery(presetQuery)
    setPolicyFilter(route.params.initialPolicyFilter ?? 'ALL')
    setFormatFilter(route.params.initialFormatFilter ?? 'ALL')
  }, [route.params])

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim())
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timeoutId)
  }, [searchQuery])

  const loadFirstPage = useCallback(
    async (mode: 'initial' | 'refresh') => {
      const version = requestVersionRef.current + 1
      requestVersionRef.current = version
      setErrorMessage(null)
      setLoadMoreError(null)

      if (mode === 'refresh') {
        setRefreshing(true)
      } else {
        setIsInitialLoading(true)
      }

      try {
        const result = await fetchTournamentFeedPage({
          limit: PAGE_SIZE,
          cursor: null,
          searchQuery: debouncedSearchQuery,
          policy: policyFilter as TournamentFeedPolicy,
          format: formatFilter as TournamentFeedFormat,
          scope: 'UPCOMING',
        })

        if (requestVersionRef.current !== version) return

        setDataSource(result.source)
        setTournaments(result.data.items)
        setNextCursor(result.data.nextCursor)
        setTotalCount(result.data.totalCount)
      } catch {
        if (requestVersionRef.current !== version) return
        setErrorMessage('Could not load tournaments. Pull to refresh or retry.')
        setTournaments([])
        setNextCursor(null)
        setTotalCount(0)
      } finally {
        if (requestVersionRef.current !== version) return
        setRefreshing(false)
        setIsInitialLoading(false)
      }
    },
    [debouncedSearchQuery, formatFilter, policyFilter]
  )

  useEffect(() => {
    void loadFirstPage('initial')
  }, [loadFirstPage])

  const loadNextPage = useCallback(async () => {
    if (!nextCursor || loadingMoreRef.current || refreshing || isInitialLoading) return

    loadingMoreRef.current = true
    setIsLoadingMore(true)
    setLoadMoreError(null)
    const version = requestVersionRef.current

    try {
      const result = await fetchTournamentFeedPage({
        limit: PAGE_SIZE,
        cursor: nextCursor,
        searchQuery: debouncedSearchQuery,
        policy: policyFilter as TournamentFeedPolicy,
        format: formatFilter as TournamentFeedFormat,
        scope: 'UPCOMING',
      })

      if (requestVersionRef.current !== version) return

      setDataSource(result.source)
      setNextCursor(result.data.nextCursor)
      setTotalCount(result.data.totalCount)
      setTournaments((previous) => {
        const seen = new Set(previous.map((item) => item.id))
        const append = result.data.items.filter((item) => !seen.has(item.id))
        return [...previous, ...append]
      })
    } catch {
      if (requestVersionRef.current !== version) return
      setLoadMoreError('Could not load more tournaments.')
    } finally {
      loadingMoreRef.current = false
      setIsLoadingMore(false)
    }
  }, [debouncedSearchQuery, formatFilter, isInitialLoading, nextCursor, policyFilter, refreshing])

  const onRefresh = useCallback(() => {
    void loadFirstPage('refresh')
  }, [loadFirstPage])

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!nextCursor || isInitialLoading || refreshing || loadingMoreRef.current) return

      const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent
      const nearBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - SCROLL_END_THRESHOLD
      if (!nearBottom) return

      void loadNextPage()
    },
    [isInitialLoading, loadNextPage, nextCursor, refreshing]
  )

  return (
    <AppBackground>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        >
          <View style={styles.header}>
            <Text style={styles.title}>Tournaments</Text>
            <Text style={styles.subtitle}>Find events, filter by access policy, and jump into registration.</Text>
            <View style={styles.metaRow}>
              <Badge label={`${tournaments.length}/${Math.max(totalCount, tournaments.length)} loaded`} tone="neutral" />
              <Badge
                label={dataSource === 'live' ? 'Live data' : 'Demo data'}
                tone={dataSource === 'live' ? 'success' : 'warning'}
              />
            </View>
          </View>

          <View style={styles.searchWrap}>
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search title, club, city"
              placeholderTextColor="#75806F"
              style={styles.searchInput}
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>

          {searchQuery.trim() !== debouncedSearchQuery ? (
            <View style={styles.searchingRow}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={styles.searchingText}>Searching...</Text>
            </View>
          ) : null}

          <View style={styles.filterBlock}>
            <Text style={styles.filterTitle}>Policy</Text>
            <View style={styles.chipRow}>
              {policyFilters.map((option) => {
                const active = policyFilter === option.id
                return (
                  <Pressable
                    key={option.id}
                    onPress={() => setPolicyFilter(option.id)}
                    style={[styles.chip, active ? styles.chipActive : null]}
                  >
                    <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{option.label}</Text>
                  </Pressable>
                )
              })}
            </View>
          </View>

          <View style={styles.filterBlock}>
            <Text style={styles.filterTitle}>Format</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {formatFilters.map((option) => {
                const active = formatFilter === option
                const label = option === 'ALL' ? 'All formats' : toFormatLabel(option)
                return (
                  <Pressable
                    key={option}
                    onPress={() => setFormatFilter(option)}
                    style={[styles.chip, active ? styles.chipActive : null]}
                  >
                    <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{label}</Text>
                  </Pressable>
                )
              })}
            </ScrollView>
          </View>

          {isInitialLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={styles.loadingText}>Loading tournaments...</Text>
            </View>
          ) : null}

          {!isInitialLoading && errorMessage && tournaments.length === 0 ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>Could not load tournaments</Text>
              <Text style={styles.errorText}>{errorMessage}</Text>
              <Pressable style={styles.retryButton} onPress={() => void loadFirstPage('initial')}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </Pressable>
            </View>
          ) : null}

          {!isInitialLoading && !errorMessage && tournaments.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No tournaments found</Text>
              <Text style={styles.emptyText}>Adjust search or filters to expand results.</Text>
            </View>
          ) : null}

          {errorMessage && tournaments.length > 0 ? (
            <View style={styles.inlineWarning}>
              <Text style={styles.inlineWarningText}>{errorMessage}</Text>
            </View>
          ) : null}

          {tournaments.map((tournament) => {
            const webOnly = isWebOnlyTournament(tournament)
            const openSlots = getOpenSlots(tournament)

            return (
              <Pressable
                key={tournament.id}
                style={({ pressed }) => [styles.card, pressed ? styles.cardPressed : null]}
                onPress={() => navigation.navigate('TournamentDetails', { tournamentId: tournament.id })}
              >
                <View style={styles.cardTopRow}>
                  <Text style={styles.cardTitle}>{tournament.title}</Text>
                  <Badge label={toFormatLabel(tournament.format)} tone="info" />
                </View>
                <Text style={styles.cardMeta}>
                  {tournament.club} • {tournament.city}
                </Text>
                <Text style={styles.cardMeta}>
                  {tournament.startAt} - {tournament.endAt}
                </Text>
                <View style={styles.cardBadgeRow}>
                  <Badge label={`${tournament.participants}/${tournament.capacity} players`} tone="neutral" />
                  <Badge label={`${openSlots} open slots`} tone={openSlots > 0 ? 'success' : 'warning'} />
                  <Badge label={formatEntryFee(tournament.entryFeeUsd)} tone="neutral" />
                  <Badge label={webOnly ? 'Web admin only' : 'Mobile admin'} tone={webOnly ? 'warning' : 'success'} />
                </View>
              </Pressable>
            )
          })}

          {isLoadingMore ? (
            <View style={styles.autoLoadingRow}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={styles.autoLoadingText}>Loading more tournaments...</Text>
            </View>
          ) : loadMoreError ? (
            <View style={styles.autoLoadingRow}>
              <Text style={styles.autoLoadingText}>{loadMoreError}</Text>
              <Pressable style={styles.retryInlineButton} onPress={() => void loadNextPage()}>
                <Text style={styles.retryInlineText}>Retry</Text>
              </Pressable>
            </View>
          ) : nextCursor ? (
            <View style={styles.autoLoadingRow}>
              <Text style={styles.autoLoadingText}>Scroll down to load more</Text>
            </View>
          ) : tournaments.length > 0 ? (
            <Text style={styles.endText}>End of results</Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </AppBackground>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  header: {
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  title: {
    fontSize: 30,
    lineHeight: 34,
    color: colors.ink,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  metaRow: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  searchWrap: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: '#FFFFFFD6',
    paddingHorizontal: spacing.sm,
  },
  searchInput: {
    height: 44,
    color: colors.ink,
    fontSize: 15,
    fontWeight: '600',
  },
  searchingRow: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  searchingText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
  },
  filterBlock: {
    gap: spacing.xs,
  },
  filterTitle: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: colors.muted,
    fontWeight: '800',
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingRight: spacing.sm,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: '#FFFFFFC7',
  },
  chipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  chipText: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '700',
  },
  chipTextActive: {
    color: colors.accent,
  },
  loadingRow: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
  },
  errorCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E9C9B5',
    backgroundColor: '#FFF6F0',
    padding: spacing.lg,
    gap: spacing.xs,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.warning,
  },
  errorText: {
    fontSize: 13,
    color: colors.warning,
    lineHeight: 18,
  },
  retryButton: {
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.warning,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#FFFFFFA8',
  },
  retryButtonText: {
    color: colors.warning,
    fontSize: 12,
    fontWeight: '800',
  },
  empty: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: '#FFFFFFBF',
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.xs,
  },
  emptyTitle: {
    fontSize: 17,
    color: colors.ink,
    fontWeight: '800',
  },
  emptyText: {
    fontSize: 13,
    color: colors.muted,
  },
  inlineWarning: {
    borderRadius: 12,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: '#E9C9B5',
    backgroundColor: '#FFF6F0',
  },
  inlineWarningText: {
    color: colors.warning,
    fontSize: 12,
    fontWeight: '700',
  },
  card: {
    borderRadius: 18,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: '#FFFFFFD1',
    gap: spacing.xs,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 2,
  },
  cardPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.995 }],
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardTitle: {
    flex: 1,
    fontSize: 17,
    lineHeight: 22,
    color: colors.ink,
    fontWeight: '800',
  },
  cardMeta: {
    fontSize: 13,
    color: colors.muted,
  },
  cardBadgeRow: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  autoLoadingRow: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  autoLoadingText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
  },
  retryInlineButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: '#FFFFFFD4',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  retryInlineText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '800',
  },
  endText: {
    textAlign: 'center',
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
})
