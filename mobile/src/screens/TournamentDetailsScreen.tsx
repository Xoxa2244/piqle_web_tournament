import { useEffect, useMemo, useState } from 'react'
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native'
import { type RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { type NativeStackNavigationProp } from '@react-navigation/native-stack'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  fetchTournamentDetails,
  fetchTournamentRegistrationState,
  type TournamentRegistrationState,
} from '../api/mobileData'
import { useAuth } from '../auth/AuthContext'
import { AppBackground } from '../components/AppBackground'
import { Badge } from '../components/Badge'
import { PrimaryButton } from '../components/PrimaryButton'
import { getTournamentById, isWebOnlyTournament, type Tournament } from '../data/mockData'
import { type RootStackParamList } from '../navigation/types'
import { colors } from '../theme/colors'
import { spacing } from '../theme/spacing'

type TournamentDetailsRoute = RouteProp<RootStackParamList, 'TournamentDetails'>
type RootNavigation = NativeStackNavigationProp<RootStackParamList>

const toFormatLabel = (format: string) =>
  format
    .split('_')
    .map((part) => `${part.slice(0, 1)}${part.slice(1).toLowerCase()}`)
    .join(' ')

const formatEntryFee = (entryFeeUsd: number) => (entryFeeUsd > 0 ? `$${entryFeeUsd}` : 'Free')

const clampPercent = (value: number) => {
  if (value < 0) return 0
  if (value > 100) return 100
  return value
}

const defaultRegistrationState: TournamentRegistrationState = {
  status: 'UNAVAILABLE',
  statusLabel: 'Checking status',
  helperText: 'Loading your registration status...',
  ctaLabel: 'Register Now',
  ctaDisabled: false,
}

function CapabilityItem({ label }: { label: string }) {
  return (
    <View style={styles.capabilityRow}>
      <View style={styles.capabilityDot} />
      <Text style={styles.capabilityText}>{label}</Text>
    </View>
  )
}

const toRegistrationBadgeTone = (status: TournamentRegistrationState['status']) => {
  if (status === 'REGISTERED') return 'success' as const
  if (status === 'WAITLIST') return 'warning' as const
  if (status === 'OPEN') return 'info' as const
  return 'neutral' as const
}

export function TournamentDetailsScreen() {
  const route = useRoute<TournamentDetailsRoute>()
  const navigation = useNavigation<RootNavigation>()
  const { status: authStatus } = useAuth()

  const [tournament, setTournament] = useState<Tournament | null>(getTournamentById(route.params.tournamentId))
  const [dataSource, setDataSource] = useState<'live' | 'fallback'>('fallback')
  const [registrationSource, setRegistrationSource] = useState<'live' | 'fallback'>('fallback')
  const [registrationState, setRegistrationState] = useState<TournamentRegistrationState>(defaultRegistrationState)

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

  useEffect(() => {
    let mounted = true
    setRegistrationState(defaultRegistrationState)
    fetchTournamentRegistrationState(route.params.tournamentId).then((result) => {
      if (!mounted) return
      setRegistrationSource(result.source)
      setRegistrationState(result.data)
    })
    return () => {
      mounted = false
    }
  }, [authStatus, route.params.tournamentId])

  const fillRatio = useMemo(() => {
    if (!tournament || tournament.capacity <= 0) return 0
    return clampPercent(Math.round((tournament.participants / tournament.capacity) * 100))
  }, [tournament])

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
              {tournament.club} • {tournament.city}
            </Text>
            <View style={styles.heroBadges}>
              <Badge label={toFormatLabel(tournament.format)} tone="info" />
              <Badge
                label={dataSource === 'live' ? 'Live data' : 'Demo data'}
                tone={dataSource === 'live' ? 'success' : 'warning'}
              />
              <Badge label={webOnly ? 'Web admin only' : 'Mobile admin'} tone={webOnly ? 'warning' : 'success'} />
            </View>
          </View>

          <View style={styles.block}>
            <View style={styles.blockHeader}>
              <Text style={styles.blockTitle}>Capacity</Text>
              <Text style={styles.blockValue}>
                {tournament.participants}/{tournament.capacity}
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${fillRatio}%` }]} />
            </View>
            <Text style={styles.smallMeta}>{fillRatio}% filled</Text>
          </View>

          <View style={styles.block}>
            <Text style={styles.blockTitle}>My Registration</Text>
            <View style={styles.registrationRow}>
              <Badge label={registrationState.statusLabel} tone={toRegistrationBadgeTone(registrationState.status)} />
              <Badge
                label={registrationSource === 'live' ? 'Live status' : 'Guest status'}
                tone={registrationSource === 'live' ? 'success' : 'warning'}
              />
            </View>
            <Text style={styles.blockText}>{registrationState.helperText}</Text>
          </View>

          <View style={styles.block}>
            <Text style={styles.blockTitle}>Schedule</Text>
            <Text style={styles.blockValue}>{tournament.startAt}</Text>
            <Text style={styles.blockValue}>{tournament.endAt}</Text>
          </View>

          <View style={styles.block}>
            <Text style={styles.blockTitle}>Entry Fee</Text>
            <Text style={styles.blockValue}>{formatEntryFee(tournament.entryFeeUsd)}</Text>
          </View>

          <View style={styles.block}>
            <Text style={styles.blockTitle}>Description</Text>
            <Text style={styles.blockText}>{tournament.description}</Text>
          </View>

          <View style={styles.block}>
            <Text style={styles.blockTitle}>Mobile Capabilities</Text>
            <CapabilityItem label="Registration and payment" />
            <CapabilityItem label="Tournament chat and event communication" />
            {webOnly ? (
              <CapabilityItem label="Advanced admin actions stay in web for this format" />
            ) : (
              <CapabilityItem label="Organizer management is allowed in mobile for this format" />
            )}
          </View>

          <View style={styles.actions}>
            <PrimaryButton
              label={registrationState.ctaLabel}
              disabled={registrationState.ctaDisabled}
              onPress={() => navigation.navigate('Registration', { tournamentId: tournament.id })}
            />
            <PrimaryButton
              label={webOnly ? 'Open Web Admin Info' : 'Open Mobile Manager'}
              variant="outline"
              onPress={() =>
                Alert.alert(
                  webOnly ? 'Web Admin Required' : 'Mobile Manager',
                  webOnly
                    ? 'For MLP and Indy League, advanced management is available only in web admin.'
                    : 'Small tournament management flow is available in mobile.'
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
    backgroundColor: '#FFFFFFCC',
    borderWidth: 1,
    borderColor: colors.outline,
    gap: spacing.xs,
  },
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  blockTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.muted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  blockValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  registrationRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  smallMeta: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '600',
  },
  progressTrack: {
    marginTop: 2,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#E7E0D2',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  blockText: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.ink,
  },
  capabilityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  capabilityDot: {
    marginTop: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  capabilityText: {
    flex: 1,
    fontSize: 14,
    color: colors.ink,
    lineHeight: 20,
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
