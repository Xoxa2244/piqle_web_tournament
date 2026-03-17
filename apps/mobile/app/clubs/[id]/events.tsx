import { Feather } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { EmptyState, LoadingBlock, SurfaceCard } from '../../../src/components/ui'
import { TopBar } from '../../../src/components/navigation/TopBar'
import { formatDateTime } from '../../../src/lib/formatters'
import { trpc } from '../../../src/lib/trpc'
import { palette, spacing } from '../../../src/lib/theme'

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
              <SurfaceCard key={tournament.id} tone="soft" style={styles.card}>
                <Pressable
                  onPress={() => router.push(`/tournaments/${tournament.id}`)}
                  style={({ pressed }) => [styles.eventRow, pressed && styles.eventRowPressed]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eventTitle} numberOfLines={2}>
                      {tournament.title}
                    </Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {formatDateTime(tournament.startDate)} · {tournament.format}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={palette.textMuted} />
                </Pressable>
              </SurfaceCard>
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
    borderRadius: 16,
    shadowOpacity: 0,
    elevation: 0,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  eventRowPressed: {
    opacity: 0.86,
  },
  eventTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '800',
  },
  meta: {
    marginTop: 6,
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
})

