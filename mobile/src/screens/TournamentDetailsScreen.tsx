import { useEffect, useState } from 'react'
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native'
import { type RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { type NativeStackNavigationProp } from '@react-navigation/native-stack'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AppBackground } from '../components/AppBackground'
import { Badge } from '../components/Badge'
import { PrimaryButton } from '../components/PrimaryButton'
import { getTournamentById, isWebOnlyTournament, type Tournament } from '../data/mockData'
import { type RootStackParamList } from '../navigation/types'
import { colors } from '../theme/colors'
import { spacing } from '../theme/spacing'
import { fetchTournamentDetails } from '../api/mobileData'

type TournamentDetailsRoute = RouteProp<RootStackParamList, 'TournamentDetails'>
type RootNavigation = NativeStackNavigationProp<RootStackParamList>

export function TournamentDetailsScreen() {
  const route = useRoute<TournamentDetailsRoute>()
  const navigation = useNavigation<RootNavigation>()
  const [tournament, setTournament] = useState<Tournament | null>(getTournamentById(route.params.tournamentId))
  const [dataSource, setDataSource] = useState<'live' | 'fallback'>('fallback')

  useEffect(() => {
    let mounted = true
    fetchTournamentDetails(route.params.tournamentId).then((result) => {
      if (!mounted) return
      setTournament(result.data)
      setDataSource(result.source)
    })
    return () => {
      mounted = false
    }
  }, [route.params.tournamentId])

  if (!tournament) {
    return (
      <AppBackground>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>Tournament not found</Text>
          </View>
        </SafeAreaView>
      </AppBackground>
    )
  }

  const webOnly = isWebOnlyTournament(tournament)

  return (
    <AppBackground>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.heroCard}>
            <Text style={styles.heroTitle}>{tournament.title}</Text>
            <Text style={styles.heroMeta}>
              {tournament.club} - {tournament.city}
            </Text>
            <View style={styles.heroBadges}>
              <Badge label={tournament.format.replace(/_/g, ' ')} tone="info" />
              <Badge label={dataSource === 'live' ? 'Live data' : 'Demo data'} tone={dataSource === 'live' ? 'success' : 'warning'} />
              <Badge
                label={webOnly ? 'Management: web only' : 'Management: mobile allowed'}
                tone={webOnly ? 'warning' : 'success'}
              />
            </View>
          </View>

          <View style={styles.block}>
            <Text style={styles.blockTitle}>Schedule</Text>
            <Text style={styles.blockValue}>
              {tournament.startAt} - {tournament.endAt}
            </Text>
          </View>

          <View style={styles.block}>
            <Text style={styles.blockTitle}>Participants</Text>
            <Text style={styles.blockValue}>
              {tournament.participants}/{tournament.capacity}
            </Text>
          </View>

          <View style={styles.block}>
            <Text style={styles.blockTitle}>Entry Fee</Text>
            <Text style={styles.blockValue}>
              {tournament.entryFeeUsd > 0 ? `$${tournament.entryFeeUsd}` : 'Free'}
            </Text>
          </View>

          <View style={styles.block}>
            <Text style={styles.blockTitle}>About</Text>
            <Text style={styles.blockText}>{tournament.description}</Text>
          </View>

          {webOnly ? (
            <View style={styles.warningBox}>
              <Text style={styles.warningTitle}>Advanced management is available on web only</Text>
              <Text style={styles.warningText}>
                You can still register, pay, and use chat from mobile for this tournament.
              </Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <PrimaryButton
              label="Register Now"
              onPress={() => navigation.navigate('Registration', { tournamentId: tournament.id })}
            />
            <PrimaryButton
              label={webOnly ? 'Open Web Admin' : 'Open Mobile Manager'}
              variant="outline"
              onPress={() =>
                Alert.alert(
                  webOnly ? 'Web Admin' : 'Mobile Manager',
                  webOnly
                    ? 'For MLP and Indy League, admin actions are handled in web.'
                    : 'Small tournament management will be handled inside mobile screens.'
                )
              }
            />
          </View>
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
  heroCard: {
    marginTop: spacing.sm,
    borderRadius: 18,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: '#FFFFFFD9',
    gap: spacing.sm,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.ink,
    lineHeight: 30,
  },
  heroMeta: {
    fontSize: 14,
    color: colors.muted,
  },
  heroBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  block: {
    borderRadius: 16,
    padding: spacing.md,
    backgroundColor: '#FFFFFFC7',
    borderWidth: 1,
    borderColor: colors.outline,
  },
  blockTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.muted,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  blockValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  blockText: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.ink,
  },
  warningBox: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E9C9B5',
    backgroundColor: '#FFF6F0',
    padding: spacing.md,
    gap: spacing.xs,
  },
  warningTitle: {
    color: colors.warning,
    fontSize: 14,
    fontWeight: '800',
  },
  warningText: {
    color: colors.warning,
    fontSize: 13,
    lineHeight: 19,
  },
  actions: {
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
  },
})
