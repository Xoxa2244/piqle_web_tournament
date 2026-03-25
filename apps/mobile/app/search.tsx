import AsyncStorage from '@react-native-async-storage/async-storage'
import { Feather } from '@expo/vector-icons'
import { useLocalSearchParams, router } from 'expo-router'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import { OptionalLinearGradient } from '../src/components/OptionalLinearGradient'
import { PageLayout } from '../src/components/navigation/PageLayout'
import { SurfaceCard } from '../src/components/ui'
import { formatDate, formatLocation } from '../src/lib/formatters'
import { radius, spacing, type ThemePalette } from '../src/lib/theme'
import { trpc } from '../src/lib/trpc'
import { useAuth } from '../src/providers/AuthProvider'
import { useAppTheme } from '../src/providers/ThemeProvider'

const SEARCH_HISTORY_KEY = 'piqle.mobile.search.history'
const DEFAULT_RECENT_SEARCHES = [
  'Beginner tournaments',
  'Advanced mixed doubles',
  'Weekend leagues',
]
const MAX_RECENT_SEARCHES = 6

type SearchResultType = 'tournament' | 'club' | 'player'

type SearchResultItem = {
  key: string
  type: SearchResultType
  title: string
  subtitle: string
  route: string
}

type SuggestionCardItem = {
  key: string
  title: string
  subtitle: string
  icon: keyof typeof Feather.glyphMap
  queryValue?: string
  onPress?: () => void
}

const useSearchTheme = () => {
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])

  return { colors, styles }
}

const normalizeSearchTerm = (value: string) => value.replace(/\s+/g, ' ').trim()

const sanitizeSearchHistory = (value: unknown) => {
  if (!Array.isArray(value)) return DEFAULT_RECENT_SEARCHES

  const deduped: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const normalized = normalizeSearchTerm(item)
    if (!normalized) continue
    if (deduped.some((existing) => existing.toLowerCase() === normalized.toLowerCase())) continue
    deduped.push(normalized)
    if (deduped.length >= MAX_RECENT_SEARCHES) break
  }

  return deduped
}

const includesQuery = (query: string, values: Array<string | null | undefined>) =>
  values.some((value) => String(value ?? '').toLowerCase().includes(query))

const compactLocation = (parts: Array<string | null | undefined>) => {
  const value = formatLocation(parts)
  return value === 'Location not set' ? null : value
}

const joinMeta = (parts: Array<string | null | undefined>) =>
  parts.map((part) => String(part ?? '').trim()).filter(Boolean).join(' • ')

const SearchSectionHeader = ({
  icon,
  title,
  actionLabel,
  onActionPress,
}: {
  icon: keyof typeof Feather.glyphMap
  title: string
  actionLabel?: string
  onActionPress?: () => void
}) => {
  const { colors, styles } = useSearchTheme()
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleWrap}>
        <Feather name={icon} size={16} color={icon === 'trending-up' ? colors.primary : colors.textMuted} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {actionLabel && onActionPress ? (
        <Pressable onPress={onActionPress} style={({ pressed }) => [styles.sectionAction, pressed && styles.pressed]}>
          <Text style={styles.sectionActionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const SuggestionCard = ({
  item,
  onPress,
}: {
  item: SuggestionCardItem
  onPress: () => void
}) => {
  const { colors, styles } = useSearchTheme()
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.cardPressable, pressed && styles.pressed]}>
      <View style={styles.suggestionCard}>
        <OptionalLinearGradient
          pointerEvents="none"
          colors={[colors.brandPrimaryTint, colors.brandPurpleTint, 'rgba(255, 255, 255, 0.02)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.8 }}
          style={styles.suggestionGradient}
        />
        <View style={styles.suggestionIcon}>
          <Feather name={item.icon} size={20} color={colors.white} />
        </View>
        <View style={styles.cardCopy}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.cardSubtitle} numberOfLines={1}>
            {item.subtitle}
          </Text>
        </View>
      </View>
    </Pressable>
  )
}

const SearchResultRow = ({
  item,
  onPress,
}: {
  item: SearchResultItem
  onPress: () => void
}) => {
  const { colors, styles } = useSearchTheme()
  const iconByType: Record<SearchResultType, keyof typeof Feather.glyphMap> = {
    tournament: 'award',
    club: 'users',
    player: 'user',
  }

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.cardPressable, pressed && styles.pressed]}>
      <View style={styles.resultRow}>
        <View style={styles.resultIcon}>
          <Feather name={iconByType[item.type]} size={18} color={colors.white} />
        </View>
        <View style={styles.cardCopy}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.cardSubtitle} numberOfLines={1}>
            {item.subtitle}
          </Text>
        </View>
      </View>
    </Pressable>
  )
}

const EmptySearchCard = ({ query }: { query: string }) => {
  const { colors, styles } = useSearchTheme()
  return (
    <SurfaceCard tone="soft" style={styles.emptyCard}>
      <View style={styles.emptyIcon}>
        <Feather name="search" size={20} color={colors.primary} />
      </View>
      <Text style={styles.emptyTitle}>{`Nothing found for "${query}"`}</Text>
      <Text style={styles.emptyBody}>Try another keyword or browse trending suggestions.</Text>
    </SurfaceCard>
  )
}

export default function SearchScreen() {
  const { colors, styles } = useSearchTheme()
  const params = useLocalSearchParams<{ returnTo?: string }>()
  const { token } = useAuth()
  const isAuthenticated = Boolean(token)
  const api = trpc as any
  const [query, setQuery] = useState('')
  const [recentSearches, setRecentSearches] = useState<string[] | null>(null)
  const deferredQuery = useDeferredValue(query)
  const normalizedQuery = normalizeSearchTerm(deferredQuery).toLowerCase()
  const rawQuery = normalizeSearchTerm(query)
  const returnToParam = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo

  const tournamentsQuery = api.public.listBoards.useQuery()
  const clubsQuery = api.club.list.useQuery(undefined)
  const profileQuery = api.user.getProfile.useQuery(undefined, { enabled: isAuthenticated })
  const playersQuery = api.user.directory.useQuery(
    { query: normalizedQuery, limit: 8 },
    { enabled: isAuthenticated && normalizedQuery.length >= 2 }
  )

  useEffect(() => {
    let cancelled = false

    const loadRecentSearches = async () => {
      try {
        const raw = await AsyncStorage.getItem(SEARCH_HISTORY_KEY)
        if (cancelled) return

        if (!raw) {
          setRecentSearches(DEFAULT_RECENT_SEARCHES)
          return
        }

        const parsed = JSON.parse(raw) as unknown
        setRecentSearches(sanitizeSearchHistory(parsed))
      } catch {
        if (!cancelled) {
          setRecentSearches(DEFAULT_RECENT_SEARCHES)
        }
      }
    }

    void loadRecentSearches()

    return () => {
      cancelled = true
    }
  }, [])

  const persistRecentSearches = (next: string[]) => {
    setRecentSearches(next)
    void AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next)).catch(() => undefined)
  }

  const rememberSearch = (value: string) => {
    const normalized = normalizeSearchTerm(value)
    if (normalized.length < 2) return

    const current = recentSearches ?? DEFAULT_RECENT_SEARCHES
    const next = [
      normalized,
      ...current.filter((item) => item.toLowerCase() !== normalized.toLowerCase()),
    ].slice(0, MAX_RECENT_SEARCHES)

    persistRecentSearches(next)
  }

  const tournaments = useMemo(() => ((tournamentsQuery.data ?? []) as any[]), [tournamentsQuery.data])
  const clubs = useMemo(() => ((clubsQuery.data ?? []) as any[]), [clubsQuery.data])
  const players = useMemo(() => ((playersQuery.data ?? []) as any[]), [playersQuery.data])
  const visibleRecentSearches = recentSearches ?? DEFAULT_RECENT_SEARCHES
  const userCity = normalizeSearchTerm(String(profileQuery.data?.city ?? ''))

  const tournamentResults = useMemo<SearchResultItem[]>(() => {
    if (!normalizedQuery) return []

    return tournaments
      .filter((item) =>
        includesQuery(normalizedQuery, [item.title, item.description, item.venueName, item.venueAddress])
      )
      .slice(0, 8)
      .map((item) => ({
        key: `tournament-${item.id}`,
        type: 'tournament',
        title: item.title || 'Tournament',
        subtitle:
          joinMeta([
            'Tournament',
            compactLocation([item.venueName, item.venueAddress]),
            item.startDate ? formatDate(item.startDate) : null,
          ]) || 'Tournament',
        route: `/tournaments/${item.id}`,
      }))
  }, [normalizedQuery, tournaments])

  const clubResults = useMemo<SearchResultItem[]>(() => {
    if (!normalizedQuery) return []

    return clubs
      .filter((item) =>
        includesQuery(normalizedQuery, [
          item.name,
          item.city,
          item.state,
          item.address,
          item.kind === 'VENUE' ? 'venue' : 'community',
        ])
      )
      .slice(0, 8)
      .map((item) => ({
        key: `club-${item.id}`,
        type: 'club',
        title: item.name || 'Club',
        subtitle:
          joinMeta([
            'Club',
            compactLocation([item.city, item.state]),
            item.isVerified ? 'Verified' : null,
          ]) || 'Club',
        route: `/clubs/${item.id}`,
      }))
  }, [clubs, normalizedQuery])

  const playerResults = useMemo<SearchResultItem[]>(() => {
    return players.map((item) => ({
      key: `player-${item.id}`,
      type: 'player',
      title: item.name || 'Player',
      subtitle:
        joinMeta([
          'Player',
          normalizeSearchTerm(String(item.city ?? '')) || null,
          item.hasDupr && typeof item.duprRatingDoubles === 'number'
            ? `DUPR ${item.duprRatingDoubles.toFixed(2)}`
            : item.hasDupr
            ? 'DUPR linked'
            : null,
        ]) || 'Player',
      route: `/profile/${item.id}`,
    }))
  }, [players])

  const resultSections = useMemo(
    () =>
      [
        { key: 'events', title: 'Events', items: tournamentResults },
        { key: 'clubs', title: 'Clubs', items: clubResults },
        { key: 'players', title: 'Players', items: playerResults },
      ].filter((section) => section.items.length > 0),
    [clubResults, playerResults, tournamentResults]
  )

  const suggestionCards = useMemo<SuggestionCardItem[]>(() => {
    const trendingTournament = tournaments[0]
    const trendingClub = clubs.find((club) => club.isVerified) ?? clubs[0]

    return [
      {
        key: 'trending-tournament',
        title: trendingTournament?.title || 'Summer Championship 2026',
        subtitle: 'Tournament',
        icon: 'award',
        queryValue: trendingTournament?.title || 'Summer Championship 2026',
      },
      {
        key: 'trending-club',
        title: trendingClub?.name || 'Downtown Pickleball Club',
        subtitle: 'Club',
        icon: 'users',
        queryValue: trendingClub?.name || 'Downtown Pickleball Club',
      },
      {
        key: 'trending-nearby',
        title: 'Tournaments near me',
        subtitle: userCity || 'Location',
        icon: 'map-pin',
        queryValue: userCity || undefined,
        onPress: userCity ? undefined : () => router.replace('/tournaments'),
      },
    ]
  }, [clubs, tournaments, userCity])

  const isSearching =
    Boolean(rawQuery) &&
    (tournamentsQuery.isLoading ||
      clubsQuery.isLoading ||
      (isAuthenticated && normalizedQuery.length >= 2 && playersQuery.isFetching))

  const closeSearch = () => {
    if (returnToParam && returnToParam.startsWith('/')) {
      router.replace(returnToParam as never)
      return
    }
    router.replace('/' as never)
  }

  const openResult = (item: SearchResultItem) => {
    rememberSearch(rawQuery || item.title)
    router.push(item.route as never)
  }

  const applyQuery = (value: string) => {
    setQuery(value)
  }

  const showDiscovery = !rawQuery

  return (
    <PageLayout scroll={false} contentStyle={styles.layoutContent}>
      <View style={styles.page}>
        <View style={styles.searchRow}>
          <Pressable onPress={closeSearch} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
            <Feather name="x" size={22} color={colors.text} />
          </Pressable>

          <View style={styles.searchInputShell}>
            <Feather name="search" size={20} color={colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search tournaments, clubs, players..."
              placeholderTextColor={colors.textMuted}
              selectionColor={colors.primary}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              returnKeyType="search"
              onSubmitEditing={() => rememberSearch(query)}
              style={styles.searchInput}
            />
          </View>
        </View>

        <ScrollView
          style={styles.contentScroll}
          contentContainerStyle={styles.contentScrollBody}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onScrollBeginDrag={() => Keyboard.dismiss()}
          bounces
        >
          {showDiscovery ? (
            <>
              <View style={styles.sectionBlock}>
                <SearchSectionHeader icon="trending-up" title="Trending" />
                <View style={styles.cardsColumn}>
                  {suggestionCards.map((item) => (
                    <SuggestionCard
                      key={item.key}
                      item={item}
                      onPress={() => {
                        if (item.onPress) {
                          item.onPress()
                          return
                        }
                        if (item.queryValue) {
                          applyQuery(item.queryValue)
                        }
                      }}
                    />
                  ))}
                </View>
              </View>

              {visibleRecentSearches.length > 0 ? (
                <View style={styles.sectionBlock}>
                  <SearchSectionHeader
                    icon="clock"
                    title="Recent"
                    actionLabel="Clear all"
                    onActionPress={() => persistRecentSearches([])}
                  />
                  <View style={styles.cardsColumn}>
                    {visibleRecentSearches.map((item) => (
                      <Pressable
                        key={item}
                        onPress={() => applyQuery(item)}
                        style={({ pressed }) => [styles.cardPressable, pressed && styles.pressed]}
                      >
                        <View style={styles.recentRow}>
                          <Feather name="clock" size={18} color={colors.textMuted} />
                          <Text style={styles.recentText}>{item}</Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}
            </>
          ) : (
            <View style={styles.sectionBlock}>
              {isSearching && resultSections.length === 0 ? (
                <SurfaceCard tone="soft" style={styles.loadingCard}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={styles.loadingText}>Searching the app...</Text>
                </SurfaceCard>
              ) : null}

              {resultSections.map((section) => (
                <View key={section.key} style={styles.sectionBlock}>
                  <SearchSectionHeader
                    icon={
                      section.key === 'events'
                        ? 'award'
                        : section.key === 'clubs'
                        ? 'users'
                        : 'user'
                    }
                    title={section.title}
                  />
                  <View style={styles.cardsColumn}>
                    {section.items.map((item) => (
                      <SearchResultRow key={item.key} item={item} onPress={() => openResult(item)} />
                    ))}
                  </View>
                </View>
              ))}

              {!isAuthenticated ? (
                <SurfaceCard tone="soft" style={styles.helperCard}>
                  <Feather name="lock" size={18} color={colors.primary} />
                  <Text style={styles.helperText}>Sign in to include players in search results.</Text>
                </SurfaceCard>
              ) : null}

              {!isSearching && resultSections.length === 0 ? <EmptySearchCard query={rawQuery} /> : null}
            </View>
          )}
        </ScrollView>
      </View>
    </PageLayout>
  )
}

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
    layoutContent: {
      paddingTop: 0,
      paddingBottom: 0,
      paddingHorizontal: 0,
      gap: 0,
    },
    page: {
      flex: 1,
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    closeButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    searchInputShell: {
      flex: 1,
      height: 44,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceElevated,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    searchInput: {
      flex: 1,
      color: colors.text,
      fontSize: 15,
      paddingVertical: 0,
    },
    contentScroll: {
      flex: 1,
    },
    contentScrollBody: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: 124,
      gap: 30,
    },
    sectionBlock: {
      gap: 14,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    sectionTitleWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 19,
      fontWeight: '800',
      letterSpacing: -0.3,
    },
    sectionAction: {
      borderRadius: 999,
      paddingHorizontal: 4,
      paddingVertical: 2,
    },
    sectionActionText: {
      color: '#56708b',
      fontSize: 13,
      fontWeight: '600',
    },
    cardsColumn: {
      gap: 10,
    },
    cardPressable: {
      borderRadius: radius.lg,
    },
    suggestionCard: {
      minHeight: 84,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: 'rgba(31, 160, 53, 0.14)',
      backgroundColor: colors.surface,
      overflow: 'hidden',
      paddingHorizontal: 14,
      paddingVertical: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    suggestionGradient: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: radius.lg,
    },
    suggestionIcon: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    resultRow: {
      minHeight: 78,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 14,
      paddingVertical: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    recentRow: {
      minHeight: 62,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    resultIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    cardCopy: {
      flex: 1,
      gap: 4,
    },
    cardTitle: {
      color: colors.text,
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: -0.2,
    },
    cardSubtitle: {
      color: colors.textMuted,
      fontSize: 13,
    },
    recentText: {
      flex: 1,
      color: colors.text,
      fontSize: 16,
      fontWeight: '600',
    },
    loadingCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      minHeight: 72,
    },
    loadingText: {
      color: colors.textMuted,
      fontSize: 15,
      fontWeight: '600',
    },
    helperCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    helperText: {
      flex: 1,
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
    },
    emptyCard: {
      alignItems: 'center',
      paddingVertical: 26,
    },
    emptyIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.brandPrimaryTint,
    },
    emptyTitle: {
      marginTop: 14,
      color: colors.text,
      fontSize: 17,
      fontWeight: '700',
      textAlign: 'center',
    },
    emptyBody: {
      marginTop: 6,
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
      textAlign: 'center',
    },
    pressed: {
      opacity: 0.9,
    },
  })
