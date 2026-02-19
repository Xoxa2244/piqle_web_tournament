import { useEffect, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
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
  fetchRegistrationSummary,
  fetchTournamentDetails,
  submitRegistration,
} from '../api/mobileData'

type RegistrationRoute = RouteProp<RootStackParamList, 'Registration'>

const registrationTypes = [
  { id: 'individual', label: 'Individual Spot', description: 'Join available roster or pair' },
  { id: 'team', label: 'Team Spot', description: 'Register your team with fixed lineup' },
] as const

export function RegistrationScreen() {
  const route = useRoute<RegistrationRoute>()
  const [tournament, setTournament] = useState<Tournament | null>(getTournamentById(route.params.tournamentId))
  const [selectedType, setSelectedType] = useState<(typeof registrationTypes)[number]['id']>('individual')
  const [dataSource, setDataSource] = useState<'live' | 'fallback'>('fallback')
  const [entryFeeUsd, setEntryFeeUsd] = useState<number>(tournament?.entryFeeUsd ?? 0)
  const [statusLabel, setStatusLabel] = useState<string>('Checking...')

  useEffect(() => {
    let mounted = true
    Promise.all([
      fetchTournamentDetails(route.params.tournamentId),
      fetchRegistrationSummary(route.params.tournamentId),
    ]).then(([detailsResult, summaryResult]) => {
      if (!mounted) return
      setTournament(detailsResult.data)
      setDataSource(detailsResult.source)
      setEntryFeeUsd(summaryResult.data.entryFeeUsd)
      setStatusLabel(summaryResult.data.statusLabel)
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
            <Text style={styles.emptyTitle}>Tournament not found</Text>
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
          <Text style={styles.title}>Registration</Text>
          <Text style={styles.subtitle}>{tournament.title}</Text>
          <View style={styles.badgeRow}>
            <Badge label={dataSource === 'live' ? 'Live data' : 'Demo data'} tone={dataSource === 'live' ? 'success' : 'warning'} />
            <Badge label={statusLabel} tone="neutral" />
          </View>

          <View style={styles.panel}>
            <Text style={styles.sectionTitle}>Choose registration type</Text>
            <View style={styles.choiceList}>
              {registrationTypes.map((item) => {
                const selected = item.id === selectedType
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => setSelectedType(item.id)}
                    style={[styles.choiceRow, selected ? styles.choiceSelected : null]}
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
          </View>

          <View style={styles.panel}>
            <Text style={styles.sectionTitle}>Payment</Text>
            <Text style={styles.price}>
              {entryFeeUsd > 0 ? `$${entryFeeUsd}` : 'No entry fee'}
            </Text>
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

          <PrimaryButton
            label="Confirm Registration"
            onPress={async () => {
              const result = await submitRegistration(route.params.tournamentId, selectedType)
              Alert.alert(
                result.source === 'live' ? 'Registration update' : 'Registration',
                result.data
              )
              if (result.source === 'live') {
                const summary = await fetchRegistrationSummary(route.params.tournamentId)
                setEntryFeeUsd(summary.data.entryFeeUsd)
                setStatusLabel(summary.data.statusLabel)
                setDataSource(summary.source)
              }
            }}
          />
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
  price: {
    fontSize: 30,
    fontWeight: '900',
    color: colors.ink,
  },
  hint: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
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
