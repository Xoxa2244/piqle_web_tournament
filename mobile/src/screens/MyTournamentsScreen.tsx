import { useEffect, useState } from 'react'
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { type NativeStackNavigationProp } from '@react-navigation/native-stack'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AppBackground } from '../components/AppBackground'
import { Badge } from '../components/Badge'
import { PrimaryButton } from '../components/PrimaryButton'
import { useAuth } from '../auth/AuthContext'
import { organizerTournaments, isWebOnlyTournament, type Tournament } from '../data/mockData'
import { type RootStackParamList } from '../navigation/types'
import { colors } from '../theme/colors'
import { spacing } from '../theme/spacing'
import { fetchMyTournaments } from '../api/mobileData'

type RootNavigation = NativeStackNavigationProp<RootStackParamList>

export function MyTournamentsScreen() {
  const navigation = useNavigation<RootNavigation>()
  const { user, signOut, status } = useAuth()
  const [tournaments, setTournaments] = useState<Tournament[]>(organizerTournaments)
  const [dataSource, setDataSource] = useState<'live' | 'fallback'>('fallback')

  useEffect(() => {
    let mounted = true
    fetchMyTournaments().then((result) => {
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
            <Text style={styles.title}>My Tournaments</Text>
            <Text style={styles.subtitle}>Organizer and assistant workspace for mobile operations</Text>
            <Text style={styles.userLabel}>
              {status === 'signed_in' ? user?.email ?? 'Signed in' : 'Guest mode: sign in to manage tournaments'}
            </Text>
            <View style={styles.sourceRow}>
              <Badge label={dataSource === 'live' ? 'Live data' : 'Demo data'} tone={dataSource === 'live' ? 'success' : 'warning'} />
              {status !== 'signed_in' ? <Badge label="Guest mode" tone="warning" /> : null}
            </View>
            {status === 'signed_in' ? (
              <View style={styles.signOutRow}>
                <PrimaryButton
                  label="Sign out"
                  variant="outline"
                  onPress={async () => {
                    await signOut()
                  }}
                />
              </View>
            ) : (
              <View style={styles.signOutRow}>
                <PrimaryButton label="Sign in" onPress={() => navigation.navigate('Auth')} />
              </View>
            )}
          </View>

          {tournaments.map((tournament) => {
            const webOnly = isWebOnlyTournament(tournament)
            return (
              <View key={tournament.id} style={styles.card}>
                <View style={styles.top}>
                  <Text style={styles.cardTitle}>{tournament.title}</Text>
                  <Badge label={webOnly ? 'Web only' : 'Mobile'} tone={webOnly ? 'warning' : 'success'} />
                </View>
                <Text style={styles.cardMeta}>{tournament.format.replace(/_/g, ' ')}</Text>
                <Text style={styles.cardMeta}>{tournament.startAt}</Text>

                {webOnly ? (
                  <View style={styles.actionWrap}>
                    <PrimaryButton
                      label="Open Web Admin"
                      variant="outline"
                      onPress={() =>
                        Alert.alert(
                          'Web only management',
                          'For MLP and Indy League, admin actions are available only in web admin.'
                        )
                      }
                    />
                  </View>
                ) : (
                  <View style={styles.actionWrap}>
                    <PrimaryButton
                      label={status === 'signed_in' ? 'Manage Tournament' : 'Sign in to Manage'}
                      onPress={() =>
                        status === 'signed_in'
                          ? navigation.navigate('TournamentManager', { tournamentId: tournament.id })
                          : navigation.navigate('Auth')
                      }
                    />
                    <PrimaryButton
                      label={status === 'signed_in' ? 'Score Entry' : 'Sign in for Score Entry'}
                      variant="outline"
                      onPress={() =>
                        status === 'signed_in'
                          ? navigation.navigate('TournamentManager', { tournamentId: tournament.id })
                          : navigation.navigate('Auth')
                      }
                    />
                  </View>
                )}
              </View>
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
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.ink,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 14,
    color: colors.muted,
  },
  sourceRow: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  signOutRow: {
    marginTop: spacing.xs,
    maxWidth: 140,
  },
  userLabel: {
    marginTop: 2,
    fontSize: 12,
    color: colors.muted,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: '#FFFFFFCC',
    padding: spacing.md,
    gap: spacing.xs,
  },
  top: {
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
  actionWrap: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
})
