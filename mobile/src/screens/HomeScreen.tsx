import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { type BottomTabNavigationProp } from '@react-navigation/bottom-tabs'
import { type CompositeNavigationProp, useNavigation } from '@react-navigation/native'
import { type NativeStackNavigationProp } from '@react-navigation/native-stack'
import { SafeAreaView } from 'react-native-safe-area-context'
import { fetchHomeFeedSections, type DataSource, type HomeFeedSections } from '../api/mobileData'
import { AppBackground } from '../components/AppBackground'
import { Badge } from '../components/Badge'
import { feedTournaments, type Tournament } from '../data/mockData'
import {
  type MainTabParamList,
  type RootStackParamList,
  type TournamentPolicyFilter,
  type TournamentsTabParams,
} from '../navigation/types'
import { colors } from '../theme/colors'
import { spacing } from '../theme/spacing'

type HomeNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Home'>,
  NativeStackNavigationProp<RootStackParamList>
>

const toFormatLabel = (format: string) =>
  format
    .split('_')
    .map((part) => `${part.slice(0, 1)}${part.slice(1).toLowerCase()}`)
    .join(' ')

const getOpenSlots = (tournament: Tournament) => Math.max(0, tournament.capacity - tournament.participants)

const createFallbackSections = (): HomeFeedSections => {
  const mobile = feedTournaments.filter((tournament) => tournament.format !== 'MLP' && tournament.format !== 'INDY_LEAGUE')
  const webOnly = feedTournaments.filter((tournament) => tournament.format === 'MLP' || tournament.format === 'INDY_LEAGUE')
  const openSlots = feedTournaments.reduce((sum, tournament) => sum + getOpenSlots(tournament), 0)
  return {
    stats: {
      total: feedTournaments.length,
      mobileCount: mobile.length,
      webOnlyCount: webOnly.length,
      openSlots,
    },
    startingSoon: feedTournaments.slice(0, 3),
    mobileFriendly: mobile.slice(0, 3),
    webOnly: webOnly.slice(0, 2),
  }
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  )
}

function QuickFilterButton({
  label,
  onPress,
}: {
  label: string
  onPress: () => void
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.quickFilter, pressed ? styles.quickFilterPressed : null]}>
      <Text style={styles.quickFilterText}>{label}</Text>
    </Pressable>
  )
}

export function HomeScreen() {
  const navigation = useNavigation<HomeNavigation>()
  const [sections, setSections] = useState<HomeFeedSections>(createFallbackSections)
  const [dataSource, setDataSource] = useState<DataSource>('fallback')
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const openFilteredTournaments = (policyFilter: TournamentPolicyFilter, extra?: Partial<TournamentsTabParams>) => {
    navigation.navigate('Tournaments', {
      initialPolicyFilter: policyFilter,
      initialFormatFilter: extra?.initialFormatFilter ?? 'ALL',
      initialSearchQuery: extra?.initialSearchQuery ?? '',
      presetKey: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    })
  }

  const loadSections = useCallback(async () => {
    setErrorMessage(null)
    setIsLoading(true)
    try {
      const result = await fetchHomeFeedSections()
      setSections(result.data)
      setDataSource(result.source)
    } catch {
      setErrorMessage('Could not load home feed. Please retry.')
      setSections(createFallbackSections())
      setDataSource('fallback')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSections()
  }, [loadSections])

  return (
    <AppBackground>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.kicker}>Piqle Mobile</Text>
            <Text style={styles.title}>Home</Text>
            <Text style={styles.subtitle}>
              Core flow: discover tournaments, open event details, and register in a few taps.
            </Text>
            <View style={styles.sourceRow}>
              <Badge
                label={dataSource === 'live' ? 'Live data' : 'Demo data'}
                tone={dataSource === 'live' ? 'success' : 'warning'}
              />
            </View>
          </View>

          {isLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={styles.loadingText}>Loading home feed...</Text>
            </View>
          ) : null}

          {errorMessage ? (
            <View style={styles.errorRow}>
              <Text style={styles.errorText}>{errorMessage}</Text>
              <Pressable style={styles.retryButton} onPress={() => void loadSections()}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.statRow}>
            <StatCard label="Total events" value={`${sections.stats.total}`} />
            <StatCard label="Open slots" value={`${sections.stats.openSlots}`} />
          </View>
          <View style={styles.statRow}>
            <StatCard label="Mobile admin" value={`${sections.stats.mobileCount}`} />
            <StatCard label="Web-only admin" value={`${sections.stats.webOnlyCount}`} />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Quick Filters</Text>
            <View style={styles.quickFiltersRow}>
              <QuickFilterButton label="All tournaments" onPress={() => openFilteredTournaments('ALL')} />
              <QuickFilterButton label="Mobile allowed" onPress={() => openFilteredTournaments('MOBILE')} />
              <QuickFilterButton label="Web-only admin" onPress={() => openFilteredTournaments('WEB_ONLY')} />
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Starting Soon</Text>
              <Pressable onPress={() => openFilteredTournaments('ALL')} style={styles.sectionAction}>
                <Text style={styles.sectionActionText}>See all</Text>
              </Pressable>
            </View>
            {sections.startingSoon.map((tournament) => (
              <Pressable
                key={tournament.id}
                style={({ pressed }) => [styles.eventRow, pressed ? styles.eventRowPressed : null]}
                onPress={() => navigation.navigate('TournamentDetails', { tournamentId: tournament.id })}
              >
                <View style={styles.eventHeader}>
                  <Text style={styles.eventTitle}>{tournament.title}</Text>
                  <Badge label={toFormatLabel(tournament.format)} tone="info" />
                </View>
                <Text style={styles.eventMeta}>{tournament.startAt}</Text>
                <Text style={styles.eventMeta}>
                  {tournament.club} • {tournament.city}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Mobile-Friendly Tournaments</Text>
              <Pressable onPress={() => openFilteredTournaments('MOBILE')} style={styles.sectionAction}>
                <Text style={styles.sectionActionText}>Open list</Text>
              </Pressable>
            </View>
            {sections.mobileFriendly.map((tournament) => (
              <Pressable
                key={tournament.id}
                style={({ pressed }) => [styles.card, pressed ? styles.cardPressed : null]}
                onPress={() => navigation.navigate('TournamentDetails', { tournamentId: tournament.id })}
              >
                <View style={styles.cardTopRow}>
                  <Text style={styles.cardTitle}>{tournament.title}</Text>
                  <Badge label={`${getOpenSlots(tournament)} open`} tone="success" />
                </View>
                <Text style={styles.cardMeta}>
                  {tournament.participants}/{tournament.capacity} players • ${tournament.entryFeeUsd}
                </Text>
                <Text style={styles.cardDescription}>{tournament.description}</Text>
              </Pressable>
            ))}
          </View>

          {sections.webOnly.length > 0 ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Large Tournaments</Text>
                <Pressable onPress={() => openFilteredTournaments('WEB_ONLY')} style={styles.sectionAction}>
                  <Text style={styles.sectionActionText}>Open list</Text>
                </Pressable>
              </View>
              {sections.webOnly.map((tournament) => (
                <Pressable
                  key={tournament.id}
                  style={({ pressed }) => [styles.warningCard, pressed ? styles.cardPressed : null]}
                  onPress={() => navigation.navigate('TournamentDetails', { tournamentId: tournament.id })}
                >
                  <View style={styles.cardTopRow}>
                    <Text style={styles.cardTitle}>{tournament.title}</Text>
                    <Badge label="Web admin only" tone="warning" />
                  </View>
                  <Text style={styles.cardMeta}>
                    Mobile supports registration and chat. Advanced management remains in web.
                  </Text>
                </Pressable>
              ))}
            </View>
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
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    gap: spacing.xs,
  },
  kicker: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.accent,
  },
  title: {
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '800',
    color: colors.ink,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  sourceRow: {
    flexDirection: 'row',
  },
  loadingRow: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  loadingText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  errorRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E9C9B5',
    backgroundColor: '#FFF6F0',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  errorText: {
    flex: 1,
    color: colors.warning,
    fontSize: 12,
    fontWeight: '700',
  },
  retryButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.warning,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#FFFFFFA8',
  },
  retryButtonText: {
    color: colors.warning,
    fontSize: 12,
    fontWeight: '800',
  },
  statRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: '#FFFFFFCC',
    padding: spacing.md,
    gap: 4,
  },
  statLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  statValue: {
    color: colors.ink,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '800',
  },
  section: {
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
  },
  sectionAction: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.accentSoft,
  },
  sectionActionText: {
    fontSize: 12,
    color: colors.accent,
    fontWeight: '800',
  },
  quickFiltersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  quickFilter: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: '#FFFFFFCC',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  quickFilterPressed: {
    opacity: 0.86,
  },
  quickFilterText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink,
  },
  eventRow: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: '#FFFFFFCC',
    padding: spacing.md,
    gap: 2,
  },
  eventRowPressed: {
    opacity: 0.86,
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  eventTitle: {
    flex: 1,
    fontSize: 16,
    lineHeight: 20,
    color: colors.ink,
    fontWeight: '800',
  },
  eventMeta: {
    color: colors.muted,
    fontSize: 13,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: '#FFFFFFCC',
    padding: spacing.md,
    gap: spacing.xs,
  },
  warningCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E9C9B5',
    backgroundColor: '#FFF6F0',
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.995 }],
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  cardTitle: {
    flex: 1,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '800',
    color: colors.ink,
  },
  cardMeta: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
  },
  cardDescription: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 18,
  },
})
