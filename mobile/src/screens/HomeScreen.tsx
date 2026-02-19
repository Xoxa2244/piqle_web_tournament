import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import { type NativeStackNavigationProp } from '@react-navigation/native-stack'
import { AppBackground } from '../components/AppBackground'
import { Badge } from '../components/Badge'
import { colors } from '../theme/colors'
import { spacing } from '../theme/spacing'
import { feedTournaments, getManagementPolicy, type Tournament, isWebOnlyTournament } from '../data/mockData'
import { type RootStackParamList } from '../navigation/types'
import { fetchFeedTournaments } from '../api/mobileData'

type RootNavigation = NativeStackNavigationProp<RootStackParamList>

function formatFill(tournament: Tournament) {
  return `${tournament.participants}/${tournament.capacity} players`
}

export function HomeScreen() {
  const navigation = useNavigation<RootNavigation>()
  const [tournaments, setTournaments] = useState<Tournament[]>(feedTournaments)
  const [dataSource, setDataSource] = useState<'live' | 'fallback'>('fallback')

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

  return (
    <AppBackground>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.kicker}>Piqle Mobile</Text>
            <Text style={styles.title}>Play everything from one pocket app</Text>
            <Text style={styles.subtitle}>
              Register, pay, and chat in any tournament. Manage small events right from mobile.
            </Text>
          </View>

          <Text style={styles.sectionTitle}>Upcoming Events</Text>
          <View style={styles.sourceRow}>
            <Badge label={dataSource === 'live' ? 'Live data' : 'Demo data'} tone={dataSource === 'live' ? 'success' : 'warning'} />
          </View>

          {tournaments.map((tournament) => {
            const managementPolicy = getManagementPolicy(tournament.format)
            const webOnly = isWebOnlyTournament(tournament)

            return (
              <Pressable
                key={tournament.id}
                style={({ pressed }) => [styles.card, pressed ? styles.cardPressed : null]}
                onPress={() =>
                  navigation.navigate('TournamentDetails', {
                    tournamentId: tournament.id,
                  })
                }
              >
                <View style={styles.cardTopRow}>
                  <Text style={styles.cardTitle}>{tournament.title}</Text>
                  <Badge label={tournament.format.replace(/_/g, ' ')} tone="info" />
                </View>

                <Text style={styles.cardMeta}>
                  {tournament.club} - {tournament.city}
                </Text>
                <Text style={styles.cardMeta}>
                  {tournament.startAt} - {tournament.endAt}
                </Text>
                <Text style={styles.cardDescription}>{tournament.description}</Text>

                <View style={styles.badgeRow}>
                  <Badge label={formatFill(tournament)} tone="neutral" />
                  <Badge
                    label={managementPolicy === 'WEB_ONLY' ? 'Managed on web' : 'Mobile management'}
                    tone={webOnly ? 'warning' : 'success'}
                  />
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
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  kicker: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.accent,
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.ink,
    lineHeight: 34,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
  },
  sectionTitle: {
    marginTop: spacing.md,
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: 0.2,
  },
  sourceRow: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  card: {
    backgroundColor: '#FFFFFFCC',
    borderRadius: 18,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.outline,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 2,
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
    fontSize: 17,
    fontWeight: '800',
    color: colors.ink,
  },
  cardMeta: {
    color: colors.muted,
    fontSize: 13,
  },
  cardDescription: {
    marginTop: spacing.xs,
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20,
  },
  badgeRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
})
