import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { type NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useNavigation } from '@react-navigation/native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { fetchFeedTournaments } from '../api/mobileData'
import { AppBackground } from '../components/AppBackground'
import { Badge } from '../components/Badge'
import { feedTournaments, isWebOnlyTournament, type Tournament, type TournamentFormat } from '../data/mockData'
import { type RootStackParamList } from '../navigation/types'
import { colors } from '../theme/colors'
import { spacing } from '../theme/spacing'

type RootNavigation = NativeStackNavigationProp<RootStackParamList>
type PolicyFilter = 'ALL' | 'MOBILE' | 'WEB_ONLY'
type FormatFilter = 'ALL' | TournamentFormat

const policyFilters: Array<{ id: PolicyFilter; label: string }> = [
  { id: 'ALL', label: 'All' },
  { id: 'MOBILE', label: 'Mobile allowed' },
  { id: 'WEB_ONLY', label: 'Web only admin' },
]

const toFormatLabel = (format: string) =>
  format
    .split('_')
    .map((part) => `${part.slice(0, 1)}${part.slice(1).toLowerCase()}`)
    .join(' ')

const parseStartDate = (value: string) => {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER
}

const formatEntryFee = (entryFeeUsd: number) => (entryFeeUsd > 0 ? `$${entryFeeUsd}` : 'Free')

const getOpenSlots = (tournament: Tournament) => Math.max(0, tournament.capacity - tournament.participants)

function isMatchByPolicy(tournament: Tournament, policyFilter: PolicyFilter) {
  if (policyFilter === 'ALL') return true
  const webOnly = isWebOnlyTournament(tournament)
  return policyFilter === 'WEB_ONLY' ? webOnly : !webOnly
}

function isMatchBySearch(tournament: Tournament, searchQuery: string) {
  const query = searchQuery.trim().toLowerCase()
  if (!query) return true
  return [tournament.title, tournament.club, tournament.city, toFormatLabel(tournament.format)]
    .join(' ')
    .toLowerCase()
    .includes(query)
}

function isMatchByFormat(tournament: Tournament, formatFilter: FormatFilter) {
  if (formatFilter === 'ALL') return true
  return tournament.format === formatFilter
}

export function TournamentsScreen() {
  const navigation = useNavigation<RootNavigation>()
  const [tournaments, setTournaments] = useState<Tournament[]>(feedTournaments)
  const [dataSource, setDataSource] = useState<'live' | 'fallback'>('fallback')
  const [searchQuery, setSearchQuery] = useState('')
  const [policyFilter, setPolicyFilter] = useState<PolicyFilter>('ALL')
  const [formatFilter, setFormatFilter] = useState<FormatFilter>('ALL')

  useEffect(() => {
    let mounted = true
    fetchFeedTournaments().then((result) => {
      if (!mounted) return
      setTournaments(result.data)
      setDataSource(result.source)
    })
    return () => {
      mounted = false
    }
  }, [])

  const formatFilters = useMemo(() => {
    const formats = new Set<TournamentFormat>()
    tournaments.forEach((tournament) => formats.add(tournament.format))
    return ['ALL', ...Array.from(formats).sort()] as FormatFilter[]
  }, [tournaments])

  const filteredTournaments = useMemo(
    () =>
      tournaments
        .filter((tournament) => isMatchByPolicy(tournament, policyFilter))
        .filter((tournament) => isMatchByFormat(tournament, formatFilter))
        .filter((tournament) => isMatchBySearch(tournament, searchQuery))
        .sort((a, b) => parseStartDate(a.startAt) - parseStartDate(b.startAt)),
    [formatFilter, policyFilter, searchQuery, tournaments]
  )

  return (
    <AppBackground>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.title}>Tournaments</Text>
            <Text style={styles.subtitle}>Find events, filter by access policy, and jump into registration.</Text>
            <View style={styles.metaRow}>
              <Badge label={`${filteredTournaments.length} shown`} tone="neutral" />
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

          {filteredTournaments.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No tournaments found</Text>
              <Text style={styles.emptyText}>Adjust search or filters to expand results.</Text>
            </View>
          ) : null}

          {filteredTournaments.map((tournament) => {
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
})
