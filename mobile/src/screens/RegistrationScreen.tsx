import { useCallback, useEffect, useState } from 'react'
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { type RouteProp, useRoute } from '@react-navigation/native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AppBackground } from '../components/AppBackground'
import { Badge } from '../components/Badge'
import { PrimaryButton } from '../components/PrimaryButton'
import { getTournamentById, isWebOnlyTournament, type Tournament } from '../data/mockData'
import { type RootStackParamList } from '../navigation/types'
import { colors } from '../theme/colors'
import { spacing } from '../theme/spacing'
import {
  cancelTournamentRegistration,
  createRegistrationCheckoutSession,
  fetchRegistrationSummary,
  type RegistrationSummary,
  fetchTournamentDetails,
  leaveTournamentWaitlist,
  submitRegistration,
} from '../api/mobileData'

type RegistrationRoute = RouteProp<RootStackParamList, 'Registration'>

const registrationTypes = [
  { id: 'individual', label: 'Individual Spot', description: 'Join available roster or pair' },
  { id: 'team', label: 'Team Spot', description: 'Register your team with fixed lineup' },
] as const

const defaultRegistrationSummary: RegistrationSummary = {
  entryFeeUsd: 0,
  statusLabel: 'Checking...',
  registrationStatus: 'none',
  waitlistDivisionId: null,
  isPaid: false,
  paymentStatus: null,
  canCheckout: false,
}

export function RegistrationScreen() {
  const route = useRoute<RegistrationRoute>()
  const tournamentId = route.params.tournamentId
  const [tournament, setTournament] = useState<Tournament | null>(getTournamentById(tournamentId))
  const [selectedType, setSelectedType] = useState<(typeof registrationTypes)[number]['id']>('individual')
  const [dataSource, setDataSource] = useState<'live' | 'fallback'>('fallback')
  const [registrationSummary, setRegistrationSummary] = useState<RegistrationSummary>({
    ...defaultRegistrationSummary,
    entryFeeUsd: tournament?.entryFeeUsd ?? 0,
  })
  const [isBusy, setIsBusy] = useState(false)

  const refreshRegistrationSummary = useCallback(async () => {
    const summaryResult = await fetchRegistrationSummary(tournamentId)
    setRegistrationSummary(summaryResult.data)
    setDataSource((currentSource) =>
      currentSource === 'live' || summaryResult.source === 'live' ? 'live' : 'fallback'
    )
    return summaryResult
  }, [tournamentId])

  useEffect(() => {
    let mounted = true
    Promise.all([
      fetchTournamentDetails(tournamentId),
      fetchRegistrationSummary(tournamentId),
    ]).then(([detailsResult, summaryResult]) => {
      if (!mounted) return
      setTournament(detailsResult.data)
      setRegistrationSummary(summaryResult.data)
      setDataSource(
        detailsResult.source === 'live' || summaryResult.source === 'live' ? 'live' : 'fallback'
      )
    })
    return () => {
      mounted = false
    }
  }, [tournamentId])

  const runAction = useCallback(
    async (work: () => Promise<void>) => {
      if (isBusy) return
      setIsBusy(true)
      try {
        await work()
      } finally {
        setIsBusy(false)
      }
    },
    [isBusy]
  )

  const handleSubmitRegistration = useCallback(() => {
    void runAction(async () => {
      const result = await submitRegistration(tournamentId, selectedType)
      Alert.alert(result.source === 'live' ? 'Registration update' : 'Registration', result.data)
      await refreshRegistrationSummary()
    })
  }, [refreshRegistrationSummary, runAction, selectedType, tournamentId])

  const handleOpenCheckout = useCallback(() => {
    void runAction(async () => {
      const checkoutResult = await createRegistrationCheckoutSession(tournamentId)
      const checkoutUrl = checkoutResult.data.checkoutUrl
      if (!checkoutUrl) {
        Alert.alert(checkoutResult.source === 'live' ? 'Checkout' : 'Payment', checkoutResult.data.message)
        return
      }

      const canOpen = await Linking.canOpenURL(checkoutUrl)
      if (!canOpen) {
        Alert.alert('Checkout', 'Could not open checkout on this device.')
        return
      }

      await Linking.openURL(checkoutUrl)
      Alert.alert('Checkout', 'Secure checkout opened in your browser.')
      await refreshRegistrationSummary()
    })
  }, [refreshRegistrationSummary, runAction, tournamentId])

  const handleCancelRegistration = useCallback(() => {
    void runAction(async () => {
      const result = await cancelTournamentRegistration(tournamentId)
      Alert.alert(result.source === 'live' ? 'Registration update' : 'Registration', result.data)
      await refreshRegistrationSummary()
    })
  }, [refreshRegistrationSummary, runAction, tournamentId])

  const handleLeaveWaitlist = useCallback(() => {
    void runAction(async () => {
      const result = await leaveTournamentWaitlist(tournamentId)
      Alert.alert(result.source === 'live' ? 'Waitlist update' : 'Waitlist', result.data)
      await refreshRegistrationSummary()
    })
  }, [refreshRegistrationSummary, runAction, tournamentId])

  if (!tournament) {
    return (
      <AppBackground>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Tournament not found</Text>
          </View>
        </SafeAreaView>
      </AppBackground>
    )
  }

  const webOnly = isWebOnlyTournament(tournament)
  const registrationLocked = registrationSummary.registrationStatus !== 'none'
  const paymentLabel =
    registrationSummary.entryFeeUsd <= 0
      ? 'No payment needed'
      : registrationSummary.registrationStatus !== 'active'
        ? 'Pay after slot reservation'
        : registrationSummary.isPaid || registrationSummary.paymentStatus === 'PAID'
          ? 'Paid'
          : registrationSummary.paymentStatus === 'FAILED'
            ? 'Payment failed'
            : registrationSummary.paymentStatus === 'CANCELED'
              ? 'Payment canceled'
              : 'Payment required'
  const statusHint =
    registrationSummary.registrationStatus === 'active'
      ? 'You can pay now (if needed) or cancel your registration.'
      : registrationSummary.registrationStatus === 'waitlisted'
        ? 'You can leave the waitlist at any time.'
        : 'Choose a registration type and reserve a slot.'

  return (
    <AppBackground>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>Registration</Text>
          <Text style={styles.subtitle}>{tournament.title}</Text>
          <View style={styles.badgeRow}>
            <Badge label={dataSource === 'live' ? 'Live data' : 'Demo data'} tone={dataSource === 'live' ? 'success' : 'warning'} />
            <Badge label={registrationSummary.statusLabel} tone="neutral" />
          </View>

          <View style={styles.panel}>
            <Text style={styles.sectionTitle}>Choose registration type</Text>
            <View style={styles.choiceList}>
              {registrationTypes.map((item) => {
                const selected = item.id === selectedType
                return (
                  <Pressable
                    key={item.id}
                    disabled={registrationLocked || isBusy}
                    onPress={() => setSelectedType(item.id)}
                    style={[
                      styles.choiceRow,
                      selected ? styles.choiceSelected : null,
                      registrationLocked ? styles.choiceDisabled : null,
                    ]}
                  >
                    <View style={styles.choiceTextWrap}>
                      <Text style={[styles.choiceLabel, selected ? styles.choiceLabelSelected : null]}>
                        {item.label}
                      </Text>
                      <Text style={styles.choiceHint}>{item.description}</Text>
                    </View>
                    {selected ? <Badge label="Selected" tone="success" /> : null}
                  </Pressable>
                )
              })}
            </View>
            <Text style={styles.statusHint}>{statusHint}</Text>
          </View>

          <View style={styles.panel}>
            <Text style={styles.sectionTitle}>Payment</Text>
            <Text style={styles.price}>
              {registrationSummary.entryFeeUsd > 0 ? `$${registrationSummary.entryFeeUsd}` : 'No entry fee'}
            </Text>
            <Text style={styles.paymentStatus}>{paymentLabel}</Text>
            <Text style={styles.hint}>
              You will be redirected to secure checkout if payment is required.
            </Text>
          </View>

          {webOnly ? (
            <View style={styles.webOnlyBox}>
              <Text style={styles.webOnlyTitle}>Tournament management stays in web</Text>
              <Text style={styles.webOnlyText}>
                Mobile supports player actions: registration, payment, and chat.
              </Text>
            </View>
          ) : (
            <View style={styles.mobileBox}>
              <Text style={styles.mobileTitle}>Mobile management enabled</Text>
              <Text style={styles.mobileText}>
                Organizers can also manage teams, brackets, and score entry from mobile.
              </Text>
            </View>
          )}

          <View style={styles.actionStack}>
            {registrationSummary.registrationStatus === 'none' ? (
              <PrimaryButton
                label={isBusy ? 'Processing...' : 'Confirm Registration'}
                disabled={isBusy}
                onPress={handleSubmitRegistration}
              />
            ) : null}

            {registrationSummary.registrationStatus === 'active' && registrationSummary.canCheckout ? (
              <PrimaryButton
                label={isBusy ? 'Opening Checkout...' : 'Pay Entry Fee'}
                disabled={isBusy}
                onPress={handleOpenCheckout}
              />
            ) : null}

            {registrationSummary.registrationStatus === 'active' ? (
              <PrimaryButton
                label={isBusy ? 'Processing...' : 'Cancel Registration'}
                variant="outline"
                disabled={isBusy}
                onPress={handleCancelRegistration}
              />
            ) : null}

            {registrationSummary.registrationStatus === 'waitlisted' ? (
              <PrimaryButton
                label={isBusy ? 'Processing...' : 'Leave Waitlist'}
                variant="outline"
                disabled={isBusy}
                onPress={handleLeaveWaitlist}
              />
            ) : null}
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
  title: {
    marginTop: spacing.md,
    fontSize: 28,
    fontWeight: '800',
    color: colors.ink,
  },
  subtitle: {
    fontSize: 15,
    color: colors.muted,
    marginTop: -spacing.xs,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  panel: {
    backgroundColor: '#FFFFFFCC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.outline,
    padding: spacing.md,
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.muted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  choiceList: {
    gap: spacing.sm,
  },
  choiceRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E6DED0',
    padding: spacing.sm,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  choiceSelected: {
    borderColor: colors.accent,
    backgroundColor: '#F4FBF6',
  },
  choiceDisabled: {
    opacity: 0.55,
  },
  choiceTextWrap: {
    flex: 1,
  },
  choiceLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  choiceLabelSelected: {
    color: colors.accent,
  },
  choiceHint: {
    marginTop: 2,
    fontSize: 12,
    color: colors.muted,
  },
  statusHint: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 18,
  },
  price: {
    fontSize: 30,
    fontWeight: '900',
    color: colors.ink,
  },
  paymentStatus: {
    fontSize: 14,
    color: colors.ink,
    fontWeight: '700',
  },
  hint: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
  },
  actionStack: {
    gap: spacing.sm,
  },
  webOnlyBox: {
    borderRadius: 14,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#ECCDBB',
    backgroundColor: '#FFF6EF',
    gap: spacing.xs,
  },
  webOnlyTitle: {
    color: colors.warning,
    fontWeight: '800',
    fontSize: 14,
  },
  webOnlyText: {
    color: colors.warning,
    fontSize: 13,
    lineHeight: 19,
  },
  mobileBox: {
    borderRadius: 14,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#CDE5D2',
    backgroundColor: '#F3FBF5',
    gap: spacing.xs,
  },
  mobileTitle: {
    color: colors.accent,
    fontWeight: '800',
    fontSize: 14,
  },
  mobileText: {
    color: colors.accent,
    fontSize: 13,
    lineHeight: 19,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
  },
})
