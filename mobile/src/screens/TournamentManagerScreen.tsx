import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import { type RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { type NativeStackNavigationProp } from '@react-navigation/native-stack'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  createManagerDivision,
  deleteManagerDivision,
  fetchManagerTournament,
  updateManagerTournamentSettings,
  type ManagerTournament,
} from '../api/mobileManager'
import { useAuth } from '../auth/AuthContext'
import { AppBackground } from '../components/AppBackground'
import { Badge } from '../components/Badge'
import { PrimaryButton } from '../components/PrimaryButton'
import { getManagerGuardCopy, type ManagerGuardCode } from '../manager/guardCopy'
import { type RootStackParamList } from '../navigation/types'
import { colors } from '../theme/colors'
import { spacing } from '../theme/spacing'

type TournamentManagerRoute = RouteProp<RootStackParamList, 'TournamentManager'>
type RootNavigation = NativeStackNavigationProp<RootStackParamList>
type TeamKind = 'SINGLES_1v1' | 'DOUBLES_2v2' | 'SQUAD_4v4'
type PairingMode = 'FIXED' | 'MIX_AND_MATCH'
type ScreenErrorCode = ManagerGuardCode

const toFormatLabel = (format: string) =>
  format
    .split('_')
    .map((part) => `${part.slice(0, 1)}${part.slice(1).toLowerCase()}`)
    .join(' ')

const getErrorMessage = (error: unknown, fallback: string) => {
  const message = String((error as any)?.message ?? '').trim()
  if (!message) return fallback
  return message
}

export function TournamentManagerScreen() {
  const route = useRoute<TournamentManagerRoute>()
  const navigation = useNavigation<RootNavigation>()
  const { status } = useAuth()

  const [tournament, setTournament] = useState<ManagerTournament | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingSettings, setSavingSettings] = useState(false)
  const [creatingDivision, setCreatingDivision] = useState(false)
  const [screenErrorCode, setScreenErrorCode] = useState<ScreenErrorCode | null>(null)
  const [screenErrorMessage, setScreenErrorMessage] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [venueName, setVenueName] = useState('')
  const [venueAddress, setVenueAddress] = useState('')
  const [startDateIso, setStartDateIso] = useState('')
  const [endDateIso, setEndDateIso] = useState('')
  const [entryFeeUsdInput, setEntryFeeUsdInput] = useState('0')
  const [isPublicBoardEnabled, setIsPublicBoardEnabled] = useState(false)
  const [allowDuprSubmission, setAllowDuprSubmission] = useState(false)

  const [newDivisionName, setNewDivisionName] = useState('')
  const [newDivisionTeamKind, setNewDivisionTeamKind] = useState<TeamKind>('DOUBLES_2v2')
  const [newDivisionPairingMode, setNewDivisionPairingMode] = useState<PairingMode>('FIXED')
  const [newDivisionPoolCount, setNewDivisionPoolCount] = useState('1')
  const [newDivisionMaxTeams, setNewDivisionMaxTeams] = useState('')

  const loadTournament = useCallback(async () => {
    setLoading(true)
    setScreenErrorCode(null)
    setScreenErrorMessage(null)

    if (status !== 'signed_in') {
      setTournament(null)
      setScreenErrorCode('AUTH_REQUIRED')
      setScreenErrorMessage('Sign in to use tournament management from mobile.')
      setLoading(false)
      return
    }

    const result = await fetchManagerTournament(route.params.tournamentId)
    if (!result.data) {
      setTournament(null)
      switch (result.errorCode) {
        case 'UNAUTHORIZED':
          setScreenErrorCode('AUTH_REQUIRED')
          break
        case 'FORBIDDEN':
          setScreenErrorCode('FORBIDDEN')
          break
        case 'WEB_ONLY_MANAGEMENT':
          setScreenErrorCode('WEB_ONLY_MANAGEMENT')
          break
        case 'NOT_FOUND':
          setScreenErrorCode('NOT_FOUND')
          break
        default:
          setScreenErrorCode('LOAD_FAILED')
      }
      setScreenErrorMessage(result.errorMessage || 'Could not load tournament manager.')
      setLoading(false)
      return
    }

    const current = result.data
    if (current.access.accessLevel === 'NONE') {
      setTournament(null)
      setScreenErrorCode('FORBIDDEN')
      setScreenErrorMessage('You do not have tournament management access.')
      setLoading(false)
      return
    }

    setTournament(current)
    setTitle(current.title)
    setDescription(current.description)
    setVenueName(current.venueName)
    setVenueAddress(current.venueAddress)
    setStartDateIso(current.startDateIso)
    setEndDateIso(current.endDateIso)
    setEntryFeeUsdInput((Math.max(0, current.entryFeeCents) / 100).toString())
    setIsPublicBoardEnabled(current.isPublicBoardEnabled)
    setAllowDuprSubmission(current.allowDuprSubmission)
    setLoading(false)
  }, [route.params.tournamentId, status])

  useEffect(() => {
    void loadTournament()
  }, [loadTournament])

  const webOnly = useMemo(
    () => tournament?.format === 'MLP' || tournament?.format === 'INDY_LEAGUE',
    [tournament?.format]
  )
  const canAdminTournament = tournament?.access.accessLevel === 'ADMIN'
  const canScoreTournament =
    tournament?.access.accessLevel === 'ADMIN' || tournament?.access.accessLevel === 'SCORE_ONLY'
  const adminActionsDisabled = webOnly || !canAdminTournament

  const divisionCount = tournament?.divisions.length ?? 0

  if (loading) {
    return (
      <AppBackground>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.loadingText}>Loading manager...</Text>
          </View>
        </SafeAreaView>
      </AppBackground>
    )
  }

  if (!tournament) {
    const guardCopy = getManagerGuardCopy({
      code: screenErrorCode,
      entityLabel: 'tournament',
      fallbackMessage: screenErrorMessage,
    })

    return (
      <AppBackground>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.loadingWrap}>
            <Text style={styles.errorTitle}>{guardCopy.title}</Text>
            <Text style={styles.errorText}>{guardCopy.text}</Text>
            <View style={styles.blockedActions}>
              {guardCopy.showSignIn ? (
                <PrimaryButton label="Sign in" onPress={() => navigation.navigate('Auth')} />
              ) : null}
              <PrimaryButton
                label="Back to My Tournaments"
                variant="outline"
                onPress={() => navigation.navigate('MainTabs', { screen: 'MyTournaments' })}
              />
              <PrimaryButton label="Retry" onPress={() => void loadTournament()} />
            </View>
          </View>
        </SafeAreaView>
      </AppBackground>
    )
  }

  return (
    <AppBackground>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.headerCard}>
            <Text style={styles.title}>{tournament.title}</Text>
            <View style={styles.badgesRow}>
              <Badge label={toFormatLabel(tournament.format)} tone="info" />
              <Badge label={webOnly ? 'Web only admin' : 'Mobile admin'} tone={webOnly ? 'warning' : 'success'} />
              <Badge
                label={canAdminTournament ? 'Admin access' : 'Score-only access'}
                tone={canAdminTournament ? 'success' : 'info'}
              />
              <Badge label={`${divisionCount} divisions`} tone="neutral" />
            </View>
            {webOnly ? (
              <Text style={styles.warningText}>
                This format is web-only for management. Mobile manager is available for small tournament formats.
              </Text>
            ) : null}
            {!webOnly && !canAdminTournament ? (
              <Text style={styles.warningText}>
                Score-only access: tournament settings and division structure are read-only.
              </Text>
            ) : null}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tournament Settings</Text>

            <View style={styles.field}>
              <Text style={styles.label}>Title</Text>
              <TextInput style={styles.input} value={title} onChangeText={setTitle} />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Description</Text>
              <TextInput style={[styles.input, styles.multiline]} value={description} onChangeText={setDescription} multiline />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Venue Name</Text>
              <TextInput style={styles.input} value={venueName} onChangeText={setVenueName} />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Venue Address</Text>
              <TextInput style={styles.input} value={venueAddress} onChangeText={setVenueAddress} />
            </View>

            <View style={styles.fieldRow}>
              <View style={styles.halfField}>
                <Text style={styles.label}>Start ISO</Text>
                <TextInput
                  style={styles.input}
                  value={startDateIso}
                  onChangeText={setStartDateIso}
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.label}>End ISO</Text>
                <TextInput style={styles.input} value={endDateIso} onChangeText={setEndDateIso} autoCapitalize="none" />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Entry Fee (USD)</Text>
              <TextInput
                style={styles.input}
                value={entryFeeUsdInput}
                onChangeText={setEntryFeeUsdInput}
                keyboardType="decimal-pad"
              />
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Public board enabled</Text>
              <Switch value={isPublicBoardEnabled} onValueChange={setIsPublicBoardEnabled} />
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>DUPR submission enabled</Text>
              <Switch value={allowDuprSubmission} onValueChange={setAllowDuprSubmission} />
            </View>

            <PrimaryButton
              label={savingSettings ? 'Saving...' : 'Save Settings'}
              disabled={savingSettings || adminActionsDisabled}
              onPress={async () => {
                if (!title.trim()) {
                  Alert.alert('Validation', 'Title is required.')
                  return
                }

                const fee = Number(entryFeeUsdInput.replace(',', '.'))
                const entryFeeCents = Number.isFinite(fee) ? Math.max(0, Math.round(fee * 100)) : 0

                try {
                  setSavingSettings(true)
                  await updateManagerTournamentSettings({
                    id: tournament.id,
                    title: title.trim(),
                    description: description.trim(),
                    venueName: venueName.trim(),
                    venueAddress: venueAddress.trim(),
                    startDateIso: startDateIso.trim(),
                    endDateIso: endDateIso.trim(),
                    entryFeeCents,
                    isPublicBoardEnabled,
                    allowDuprSubmission,
                  })
                  await loadTournament()
                  Alert.alert('Saved', 'Tournament settings updated.')
                } catch (error) {
                  Alert.alert('Save failed', getErrorMessage(error, 'Could not update tournament settings.'))
                } finally {
                  setSavingSettings(false)
                }
              }}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Create Division</Text>

            <View style={styles.field}>
              <Text style={styles.label}>Division Name</Text>
              <TextInput style={styles.input} value={newDivisionName} onChangeText={setNewDivisionName} />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Team Kind</Text>
              <View style={styles.chipsRow}>
                {(['SINGLES_1v1', 'DOUBLES_2v2', 'SQUAD_4v4'] as TeamKind[]).map((kind) => {
                  const active = newDivisionTeamKind === kind
                  return (
                    <Pressable
                      key={kind}
                      onPress={() => setNewDivisionTeamKind(kind)}
                      style={[styles.chip, active ? styles.chipActive : null]}
                    >
                      <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>
                        {kind.replace(/_/g, ' ')}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Pairing Mode</Text>
              <View style={styles.chipsRow}>
                {(['FIXED', 'MIX_AND_MATCH'] as PairingMode[]).map((mode) => {
                  const active = newDivisionPairingMode === mode
                  return (
                    <Pressable
                      key={mode}
                      onPress={() => setNewDivisionPairingMode(mode)}
                      style={[styles.chip, active ? styles.chipActive : null]}
                    >
                      <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>
                        {mode.replace(/_/g, ' ')}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>

            <View style={styles.fieldRow}>
              <View style={styles.halfField}>
                <Text style={styles.label}>Pool Count</Text>
                <TextInput
                  style={styles.input}
                  value={newDivisionPoolCount}
                  onChangeText={setNewDivisionPoolCount}
                  keyboardType="number-pad"
                />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.label}>Max Teams (optional)</Text>
                <TextInput
                  style={styles.input}
                  value={newDivisionMaxTeams}
                  onChangeText={setNewDivisionMaxTeams}
                  keyboardType="number-pad"
                />
              </View>
            </View>

            <PrimaryButton
              label={creatingDivision ? 'Creating...' : 'Create Division'}
              disabled={creatingDivision || adminActionsDisabled}
              onPress={async () => {
                if (!newDivisionName.trim()) {
                  Alert.alert('Validation', 'Division name is required.')
                  return
                }

                const poolCount = Math.max(0, Math.floor(Number(newDivisionPoolCount || 1)))
                const maxTeamsRaw = newDivisionMaxTeams.trim()
                const maxTeams = maxTeamsRaw ? Number(maxTeamsRaw) : null

                try {
                  setCreatingDivision(true)
                  await createManagerDivision({
                    tournamentId: tournament.id,
                    name: newDivisionName.trim(),
                    teamKind: newDivisionTeamKind,
                    pairingMode: newDivisionPairingMode,
                    poolCount,
                    maxTeams: Number.isFinite(maxTeams as number) ? (maxTeams as number) : null,
                  })
                  setNewDivisionName('')
                  setNewDivisionPoolCount('1')
                  setNewDivisionMaxTeams('')
                  await loadTournament()
                  Alert.alert('Created', 'Division created.')
                } catch (error) {
                  Alert.alert('Create failed', getErrorMessage(error, 'Could not create division.'))
                } finally {
                  setCreatingDivision(false)
                }
              }}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Divisions</Text>

            {tournament.divisions.map((division) => (
              <View key={division.id} style={styles.divisionCard}>
                <View style={styles.divisionHeader}>
                  <Text style={styles.divisionTitle}>{division.name}</Text>
                  <Badge label={`${division.teams.length} teams`} tone="neutral" />
                </View>
                <Text style={styles.divisionMeta}>
                  {division.teamKind.replace(/_/g, ' ')} • {division.poolCount} pools • {division.matches.length} matches
                </Text>
                <View style={styles.divisionActions}>
                  <PrimaryButton
                    label="Open Division Manager"
                    disabled={!canScoreTournament || webOnly}
                    onPress={() =>
                      navigation.navigate('DivisionManager', {
                        tournamentId: tournament.id,
                        divisionId: division.id,
                      })
                    }
                  />
                  <PrimaryButton
                    label="Delete Division"
                    variant="outline"
                    disabled={adminActionsDisabled}
                    onPress={() => {
                      Alert.alert('Delete division', `Delete "${division.name}"?`, [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Delete',
                          style: 'destructive',
                          onPress: async () => {
                            try {
                              await deleteManagerDivision(division.id)
                              await loadTournament()
                            } catch (error) {
                              Alert.alert('Delete failed', getErrorMessage(error, 'Could not delete division.'))
                            }
                          },
                        },
                      ])
                    }}
                  />
                </View>
              </View>
            ))}
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
  headerCard: {
    marginTop: spacing.sm,
    borderRadius: 18,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: '#FFFFFFD9',
    gap: spacing.sm,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.ink,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  warningText: {
    color: colors.warning,
    fontSize: 13,
    lineHeight: 18,
  },
  section: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: '#FFFFFFCC',
    padding: spacing.md,
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  field: {
    gap: 6,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  halfField: {
    flex: 1,
    gap: 6,
  },
  label: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    color: colors.ink,
    fontSize: 14,
  },
  multiline: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchLabel: {
    color: colors.ink,
    fontWeight: '600',
    fontSize: 14,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: '#FFFFFFCC',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  chipText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  chipTextActive: {
    color: colors.accent,
  },
  divisionCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: '#FFFFFF',
    padding: spacing.sm,
    gap: spacing.xs,
  },
  divisionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  divisionTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
  },
  divisionMeta: {
    fontSize: 12,
    color: colors.muted,
  },
  divisionActions: {
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  loadingText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
  },
  errorTitle: {
    color: colors.warning,
    fontSize: 18,
    fontWeight: '800',
  },
  errorText: {
    color: colors.warning,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  blockedActions: {
    width: '100%',
    gap: spacing.xs,
  },
})
