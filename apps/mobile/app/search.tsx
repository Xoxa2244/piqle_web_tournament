import AsyncStorage from '@react-native-async-storage/async-storage'
import { Feather } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { EntityImage } from '../src/components/EntityImage'
import { OptionalLinearGradient } from '../src/components/OptionalLinearGradient'
import { RemoteUserAvatar } from '../src/components/RemoteUserAvatar'
import { TournamentThumbnail } from '../src/components/TournamentThumbnail'
import { PageLayout } from '../src/components/navigation/PageLayout'
import { SearchField, SectionTitle, SurfaceCard } from '../src/components/ui'
import { formatDate, formatLocation } from '../src/lib/formatters'
import { radius, spacing, type AppTheme, type ThemePalette } from '../src/lib/theme'
import { trpc } from '../src/lib/trpc'
import { useAuth } from '../src/providers/AuthProvider'
import { useToast } from '../src/providers/ToastProvider'
import { useAppTheme } from '../src/providers/ThemeProvider'

const SEARCH_HISTORY_KEY = 'piqle.mobile.search.history'
const DEFAULT_RECENT_SEARCHES = [
  'Beginner tournaments',
  'Advanced mixed doubles',
  'Weekend leagues',
]
const MAX_RECENT_SEARCHES = 6

type SuggestionVisual =
  | { kind: 'tournament'; imageUri?: string | null }
  | { kind: 'club'; logoUri?: string | null }
  | { kind: 'player'; imageUri?: string | null; initialsLabel: string }
  | { kind: 'location' }

type SearchResultItem = {
  key: string
  title: string
  subtitle: string
  route: string
  visual: Exclude<SuggestionVisual, { kind: 'location' }>
}

type SuggestionCardItem = {
  key: string
  title: string
  subtitle: string
  visual: SuggestionVisual
  /** Есть маршрут — сразу переход (Trending), иначе можно подставить текст в поле */
  route?: string
  queryValue?: string
  onPress?: () => void
}

const useSearchTheme = () => {
  const { colors, theme } = useAppTheme()
  const styles = useMemo(() => createStyles(colors, theme), [colors, theme])

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

/** Превью сущности в поиске (Trending + результаты): турнир / клуб / игрок — см. правило mobile-search-entity-previews */
const SearchEntityLead = ({ visual }: { visual: SuggestionVisual }) => {
  const { colors, styles } = useSearchTheme()
  if (visual.kind === 'location') {
    return (
      <View style={styles.suggestionIcon}>
        <Feather name="map-pin" size={20} color={colors.white} />
      </View>
    )
  }
  if (visual.kind === 'tournament') {
    return <TournamentThumbnail imageUri={visual.imageUri} size={42} />
  }
  if (visual.kind === 'club') {
    return (
      <View style={styles.suggestionClubThumb}>
        <EntityImage
          uri={visual.logoUri}
          style={styles.suggestionClubImage}
          resizeMode="cover"
          placeholderResizeMode="contain"
        />
      </View>
    )
  }
  return (
    <RemoteUserAvatar
      uri={visual.imageUri}
      size={42}
      fallback="initials"
      initialsLabel={visual.initialsLabel}
    />
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
        <View style={styles.suggestionLead}>
          <SearchEntityLead visual={item.visual} />
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
  const { styles } = useSearchTheme()
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.cardPressable, pressed && styles.pressed]}>
      <View style={styles.resultRow}>
        <View style={styles.suggestionLead}>
          <SearchEntityLead visual={item.visual} />
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
  /** TopBar передаёт `returnTo` при открытии поиска; оставляем для совместимости маршрута */
  useLocalSearchParams<{ returnTo?: string }>()
  const { token } = useAuth()
  const toast = useToast()
  const isAuthenticated = Boolean(token)
  const api = trpc as any
  const [query, setQuery] = useState('')
  const [recentSearches, setRecentSearches] = useState<string[] | null>(null)
  const deferredQuery = useDeferredValue(query)
  const normalizedQuery = normalizeSearchTerm(deferredQuery).toLowerCase()
  const rawQuery = normalizeSearchTerm(query)
  const tournamentsQuery = api.public.listBoards.useQuery()
  const clubsQuery = api.club.list.useQuery(undefined)
  const profileQuery = api.user.getProfile.useQuery(undefined, { enabled: isAuthenticated })
  const playersQuery = api.user.directory.useQuery(
    { query: normalizedQuery, limit: 8 },
    { enabled: isAuthenticated && normalizedQuery.length >= 2 }
  )
  const trendingPlayersQuery = api.user.directory.useQuery(
    { limit: 12 },
    { enabled: isAuthenticated }
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
        title: item.title || 'Tournament',
        subtitle:
          joinMeta([
            'Tournament',
            compactLocation([item.venueName, item.venueAddress]),
            item.startDate ? formatDate(item.startDate) : null,
          ]) || 'Tournament',
        route: `/tournaments/${item.id}`,
        visual: { kind: 'tournament' as const, imageUri: item.image },
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
        title: item.name || 'Club',
        subtitle:
          joinMeta([
            'Club',
            compactLocation([item.city, item.state]),
            item.isVerified ? 'Verified' : null,
          ]) || 'Club',
        route: `/clubs/${item.id}`,
        visual: { kind: 'club' as const, logoUri: item.logoUrl },
      }))
  }, [clubs, normalizedQuery])

  const playerResults = useMemo<SearchResultItem[]>(() => {
    return players.map((item) => ({
      key: `player-${item.id}`,
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
      visual: {
        kind: 'player' as const,
        imageUri: item.image,
        initialsLabel: item.name || 'Player',
      },
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
    const trendingPlayer = ((trendingPlayersQuery.data ?? []) as any[])[0] as
      | { id?: string; name?: string | null; image?: string | null; city?: string | null }
      | undefined

    const rowPlayer: SuggestionCardItem | null =
      isAuthenticated && trendingPlayer
        ? {
            key: 'trending-player',
            title: trendingPlayer.name || 'Player',
            subtitle: joinMeta(['Player', trendingPlayer.city || null]) || 'Player',
            visual: {
              kind: 'player',
              imageUri: trendingPlayer.image,
              initialsLabel: trendingPlayer.name || 'Player',
            },
            ...(trendingPlayer.id
              ? { route: `/profile/${trendingPlayer.id}` }
              : { queryValue: trendingPlayer.name || undefined }),
          }
        : null

    const rowNearby: SuggestionCardItem = {
      key: 'trending-nearby',
      title: 'Tournaments near me',
      subtitle: userCity || 'Location',
      visual: { kind: 'location' },
      queryValue: userCity || undefined,
      onPress: userCity ? undefined : () => router.replace('/tournaments'),
    }

    return [
      {
        key: 'trending-tournament',
        title: trendingTournament?.title || 'Summer Championship 2026',
        subtitle: 'Tournament',
        visual: { kind: 'tournament', imageUri: trendingTournament?.image },
        ...(trendingTournament?.id
          ? { route: `/tournaments/${trendingTournament.id}` }
          : { queryValue: 'Summer Championship 2026' }),
      },
      {
        key: 'trending-club',
        title: trendingClub?.name || 'Downtown Pickleball Club',
        subtitle: 'Club',
        visual: { kind: 'club', logoUri: trendingClub?.logoUrl },
        ...(trendingClub?.id
          ? { route: `/clubs/${trendingClub.id}` }
          : { queryValue: 'Downtown Pickleball Club' }),
      },
      rowPlayer ?? rowNearby,
    ]
  }, [clubs, isAuthenticated, tournaments, trendingPlayersQuery.data, userCity])

  const isSearching =
    Boolean(rawQuery) &&
    (tournamentsQuery.isLoading ||
      clubsQuery.isLoading ||
      (isAuthenticated && normalizedQuery.length >= 2 && playersQuery.isFetching))

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
          <SearchField
            value={query}
            onChangeText={setQuery}
            placeholder="Search tournaments, clubs, players..."
            containerStyle={styles.searchFieldFlex}
            returnKeyType="search"
            onSubmitEditing={() => rememberSearch(query)}
            right={
              query.length > 0 ? (
                <Pressable
                  onPress={() => setQuery('')}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search text"
                  style={({ pressed }) => [styles.clearInInputButton, pressed && styles.pressed]}
                >
                  <Feather name="x" size={18} color={colors.textMuted} />
                </Pressable>
              ) : null
            }
          />
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
                <SectionTitle title="Trending" />
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
                        if (item.route) {
                          rememberSearch(item.title)
                          router.push(item.route as never)
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
                  <SectionTitle
                    title="Recent"
                    actionLabel="Clear all"
                    onActionPress={() => {
                      persistRecentSearches([])
                      toast.show({ message: 'Recent searches cleared.', variant: 'default' })
                    }}
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
                  <SectionTitle title={section.title} />
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

const createStyles = (colors: ThemePalette, theme: AppTheme) =>
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
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: 12,
      borderBottomWidth: 1,
      /** Светлее, чем `colors.border`, чтобы линия под поиском была мягче */
      borderBottomColor:
        theme === 'dark' ? 'rgba(255, 255, 255, 0.06)' : 'rgba(10, 10, 10, 0.05)',
    },
    searchFieldFlex: {
      flex: 1,
    },
    clearInInputButton: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
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
    suggestionLead: {
      flexShrink: 0,
    },
    suggestionClubThumb: {
      width: 42,
      height: 42,
      borderRadius: 14,
      overflow: 'hidden',
      backgroundColor: colors.surfaceMuted,
    },
    suggestionClubImage: {
      width: 42,
      height: 42,
      borderRadius: 14,
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
