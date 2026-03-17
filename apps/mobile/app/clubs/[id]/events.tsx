import { Feather } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { EmptyState, LoadingBlock, SurfaceCard } from '../../../src/components/ui'
import { TopBar } from '../../../src/components/navigation/TopBar'
import { formatDateRange, formatLocation } from '../../../src/lib/formatters'
import { trpc } from '../../../src/lib/trpc'
import { palette, radius, spacing } from '../../../src/lib/theme'

const formatTournamentFormat = (format: string) => {
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
      return format.replace(/_/g, ' ')
  }
}

export default function ClubEventsScreen() {
  const params = useLocalSearchParams<{ id: string }>()
  const clubId = String(params.id ?? '')

  const clubQuery = trpc.club.get.useQuery({ id: clubId }, { enabled: Boolean(clubId) })

  if (clubQuery.isLoading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <TopBar />
        <View style={styles.loadingWrap}>
          <LoadingBlock label="Loading events…" />
        </View>
      </SafeAreaView>
    )
  }

  if (!clubQuery.data) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <TopBar />
        <View style={styles.loadingWrap}>
          <EmptyState title="Club not found" body="This club could not be loaded." />
        </View>
      </SafeAreaView>
    )
  }

  const club = clubQuery.data
  const tournaments = Array.isArray(club.tournaments) ? club.tournaments : []

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <TopBar />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
          >
            <Feather name="arrow-left" size={18} color={palette.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Events</Text>
            <Text style={styles.subtitle}>{club.name}</Text>
          </View>
        </View>

        {tournaments.length === 0 ? (
          <EmptyState title="No upcoming events" body="This club has no published upcoming events yet." />
        ) : (
          <View style={{ gap: 12 }}>
            {tournaments.map((tournament: any) => (
              <Pressable
                key={tournament.id}
                onPress={() => router.push(`/tournaments/${tournament.id}`)}
                style={({ pressed }) => [pressed && { opacity: 0.9 }]}
              >
                <SurfaceCard style={styles.card}>
                  <View style={styles.eventRow}>
                    <View style={styles.eventIcon}>
                      <Feather name="award" size={20} color={palette.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.eventTopRow}>
                        <Text style={styles.eventTitle} numberOfLines={1}>
                          {tournament.title}
                        </Text>
                        <View style={styles.eventStatusBadges}>
                          <SurfaceCard tone="soft" style={styles.statusPill}>
                            <Text style={styles.statusPillText}>Open</Text>
                          </SurfaceCard>
                        </View>
                      </View>
                      <View style={styles.eventMetaRow}>
                        <Feather name="calendar" size={14} color={palette.textMuted} />
                        <Text style={styles.eventMeta}>
                          {formatDateRange(tournament.startDate, tournament.endDate)}
                        </Text>
                      </View>
                      <View style={styles.eventMetaRow}>
                        <Feather name="map-pin" size={14} color={palette.textMuted} />
                        <Text numberOfLines={1} style={styles.eventMeta}>
                          {formatLocation([club.city, club.state]) || 'Location not set'}
                        </Text>
                      </View>
                      {tournament.format ? (
                        <View style={styles.badgeRow}>
                          <SurfaceCard tone="soft" style={styles.formatPill}>
                            <Text style={styles.formatPillText}>
                              {formatTournamentFormat(tournament.format)}
                            </Text>
                          </SurfaceCard>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </SurfaceCard>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
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
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceMuted,
  },
  backButtonPressed: {
    opacity: 0.85,
  },
  title: {
    color: palette.text,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  subtitle: {
    marginTop: 2,
    color: palette.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  card: {
    borderRadius: radius.lg,
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
  eventTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  eventTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '800',
    flex: 1,
  },
  eventStatusBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 8,
  },
  statusPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.brandPrimaryBorder,
    backgroundColor: palette.brandPrimaryTint,
  },
  statusPillText: {
    color: palette.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  eventMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    color: palette.textMuted,
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
  formatPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceElevated,
  },
  formatPillText: {
    color: palette.text,
    fontSize: 12,
    fontWeight: '700',
  },
})

