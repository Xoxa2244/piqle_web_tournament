import { router, useLocalSearchParams } from 'expo-router'
import { Platform, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { EmptyState, LoadingBlock } from '../../../src/components/ui'
import { ClubTournamentCard } from '../../../src/components/ClubTournamentCard'
import { BackCircleButton } from '../../../src/components/navigation/BackCircleButton'
import { BrandGradientText } from '../../../src/components/navigation/BrandGradientText'
import { trpc } from '../../../src/lib/trpc'
import { palette, spacing } from '../../../src/lib/theme'

export default function ClubEventsScreen() {
  const params = useLocalSearchParams<{ id: string }>()
  const clubId = String(params.id ?? '')

  const clubQuery = trpc.club.get.useQuery({ id: clubId }, { enabled: Boolean(clubId) })

  if (clubQuery.isLoading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.loadingWrap}>
          <LoadingBlock label="Loading events…" />
        </View>
      </SafeAreaView>
    )
  }

  if (!clubQuery.data) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
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
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.backRow}>
          <BackCircleButton onPress={() => router.back()} style={styles.backButton} />
          <BrandGradientText style={styles.title}>Upcoming tournaments</BrandGradientText>
        </View>
        {tournaments.length === 0 ? (
          <EmptyState title="No upcoming events" body="This club has no published upcoming events yet." />
        ) : (
          <View style={{ gap: 12 }}>
            {tournaments.map((tournament: any) => (
              <ClubTournamentCard
                key={tournament.id}
                tournament={tournament}
                fallbackVenueName={club.city}
                fallbackVenueAddress={club.state}
                onPress={() => router.push(`/tournaments/${tournament.id}`)}
              />
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
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
    gap: 16,
  },
  backButton: {
    width: 36,
    height: 36,
  },
  title: {
    color: palette.primary,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
    lineHeight: 36,
    ...(Platform.OS === 'android' ? { textAlignVertical: 'center' as const, includeFontPadding: false } : {}),
  },
})

