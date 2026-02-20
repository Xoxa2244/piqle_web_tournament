import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { type RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { type NativeStackNavigationProp } from '@react-navigation/native-stack'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  createManagerTeam,
  deleteManagerTeam,
  fetchManagerTournament,
  generateManagerRoundRobin,
  saveManagerMatchScore,
  updateManagerDivision,
  updateManagerTeam,
  type ManagerDivision,
  type ManagerTournament,
} from '../api/mobileManager'
import { useAuth } from '../auth/AuthContext'
import { AppBackground } from '../components/AppBackground'
import { Badge } from '../components/Badge'
import { PrimaryButton } from '../components/PrimaryButton'
import { type RootStackParamList } from '../navigation/types'
import { colors } from '../theme/colors'
import { spacing } from '../theme/spacing'

type DivisionManagerRoute = RouteProp<RootStackParamList, 'DivisionManager'>
type RootNavigation = NativeStackNavigationProp<RootStackParamList>
type ScreenErrorCode =
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'WEB_ONLY_MANAGEMENT'
  | 'NOT_FOUND'
  | 'LOAD_FAILED'

type TeamDraft = {
  name: string
  seed: string
  poolId: string
}

type ScoreDraft = {
  scoreA: string
  scoreB: string
}

const getErrorMessage = (error: unknown, fallback: string) => {
  const message = String((error as any)?.message ?? '').trim()
  if (!message) return fallback
  return message
}

const emptyDivisionFallback: ManagerDivision = {
  id: '',
  name: 'Division',
  teamKind: 'DOUBLES_2v2',
  pairingMode: 'FIXED',
  poolCount: 0,
  maxTeams: null,
  pools: [],
  teams: [],
  matches: [],
}

export function DivisionManagerScreen() {
  const route = useRoute<DivisionManagerRoute>()
  const navigation = useNavigation<RootNavigation>()
  const { status } = useAuth()
  const [tournament, setTournament] = useState<ManagerTournament | null>(null)
  const [division, setDivision] = useState<ManagerDivision>(emptyDivisionFallback)
  const [loading, setLoading] = useState(true)
  const [screenErrorCode, setScreenErrorCode] = useState<ScreenErrorCode | null>(null)
  const [screenErrorMessage, setScreenErrorMessage] = useState<string | null>(null)
  const [savingDivision, setSavingDivision] = useState(false)
  const [creatingTeam, setCreatingTeam] = useState(false)
  const [busyMatchId, setBusyMatchId] = useState<string | null>(null)
  const [runningScheduler, setRunningScheduler] = useState<'generate' | 'regenerate' | null>(null)

  const [divisionName, setDivisionName] = useState('')
  const [divisionPoolCount, setDivisionPoolCount] = useState('1')
  const [divisionMaxTeams, setDivisionMaxTeams] = useState('')

  const [newTeamName, setNewTeamName] = useState('')
  const [newTeamSeed, setNewTeamSeed] = useState('')
  const [newTeamPoolId, setNewTeamPoolId] = useState('')

  const [teamDrafts, setTeamDrafts] = useState<Record<string, TeamDraft>>({})
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, ScoreDraft>>({})

  const webOnlyFormat = useMemo(
    () => tournament?.format === 'MLP' || tournament?.format === 'INDY_LEAGUE',
    [tournament?.format]
  )

  const hydrateDraftsFromDivision = useCallback((nextDivision: ManagerDivision) => {
    const nextTeamDrafts: Record<string, TeamDraft> = {}
    nextDivision.teams.forEach((team) => {
      nextTeamDrafts[team.id] = {
        name: team.name,
        seed: team.seed == null ? '' : String(team.seed),
        poolId: team.poolId ?? '',
      }
    })
    setTeamDrafts(nextTeamDrafts)

    const nextScoreDrafts: Record<string, ScoreDraft> = {}
    nextDivision.matches.forEach((match) => {
      const firstGame = match.games.find((game) => game.index === 0) ?? match.games[0]
      nextScoreDrafts[match.id] = {
        scoreA: firstGame?.scoreA == null ? '' : String(firstGame.scoreA),
        scoreB: firstGame?.scoreB == null ? '' : String(firstGame.scoreB),
      }
    })
    setScoreDrafts(nextScoreDrafts)
  }, [])

  const loadDivision = useCallback(async () => {
    setLoading(true)
    setScreenErrorCode(null)
    setScreenErrorMessage(null)

    if (status !== 'signed_in') {
      setScreenErrorCode('AUTH_REQUIRED')
      setScreenErrorMessage('Sign in to use division manager from mobile.')
      setLoading(false)
      return
    }

    const result = await fetchManagerTournament(route.params.tournamentId)
    const nextTournament = result.data

    if (!nextTournament) {
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
      setScreenErrorMessage(result.errorMessage || 'Could not load division manager.')
      setLoading(false)
      return
    }

    if (nextTournament.access.accessLevel === 'NONE') {
      setScreenErrorCode('FORBIDDEN')
      setScreenErrorMessage('You do not have access to this tournament.')
      setLoading(false)
      return
    }

    const nextDivision = nextTournament.divisions.find((item) => item.id === route.params.divisionId)
    if (!nextDivision) {
      setTournament(nextTournament)
      setScreenErrorCode('NOT_FOUND')
      setScreenErrorMessage('Division not found or not available for your access level.')
      setLoading(false)
      return
    }

    setTournament(nextTournament)
    setDivision(nextDivision)
    setDivisionName(nextDivision.name)
    setDivisionPoolCount(String(nextDivision.poolCount))
    setDivisionMaxTeams(nextDivision.maxTeams == null ? '' : String(nextDivision.maxTeams))
    setNewTeamPoolId(nextDivision.pools[0]?.id ?? '')
    hydrateDraftsFromDivision(nextDivision)
    setLoading(false)
  }, [hydrateDraftsFromDivision, route.params.divisionId, route.params.tournamentId, status])

  useEffect(() => {
    void loadDivision()
  }, [loadDivision])

  const accessLevel = tournament?.access.accessLevel ?? 'NONE'
  const canAdminDivision = accessLevel === 'ADMIN'
  const canScoreDivision = accessLevel === 'ADMIN' || accessLevel === 'SCORE_ONLY'
  const adminActionsDisabled = webOnlyFormat || !canAdminDivision

  if (loading) {
    return (
      <AppBackground>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.loadingText}>Loading division manager...</Text>
          </View>
        </SafeAreaView>
      </AppBackground>
    )
  }

  if (!tournament || !division.id) {
    const errorTitle =
      screenErrorCode === 'AUTH_REQUIRED'
        ? 'Sign in required'
        : screenErrorCode === 'FORBIDDEN'
          ? 'Access denied'
          : screenErrorCode === 'WEB_ONLY_MANAGEMENT'
            ? 'Web admin only'
            : screenErrorCode === 'NOT_FOUND'
              ? 'Division unavailable'
              : 'Management unavailable'

    const errorText =
      screenErrorCode === 'AUTH_REQUIRED'
        ? 'Sign in to continue with division management on mobile.'
        : screenErrorCode === 'FORBIDDEN'
          ? 'You do not have access to this division.'
          : screenErrorCode === 'WEB_ONLY_MANAGEMENT'
            ? 'MLP and Indy League tournament management is available only in web admin.'
            : screenErrorMessage || 'Could not open division manager.'

    return (
      <AppBackground>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.loadingWrap}>
            <Text style={styles.errorTitle}>{errorTitle}</Text>
            <Text style={styles.errorText}>{errorText}</Text>
            {screenErrorCode === 'AUTH_REQUIRED' ? (
              <PrimaryButton label="Sign in" onPress={() => navigation.navigate('Auth')} />
            ) : null}
            <PrimaryButton label="Retry" onPress={() => void loadDivision()} />
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
            <Text style={styles.title}>{division.name}</Text>
            <View style={styles.badgesRow}>
              <Badge label={division.teamKind.replace(/_/g, ' ')} tone="info" />
              <Badge
                label={canAdminDivision ? 'Admin access' : 'Score-only access'}
                tone={canAdminDivision ? 'success' : 'info'}
              />
              <Badge label={`${division.teams.length} teams`} tone="neutral" />
              <Badge label={`${division.matches.length} matches`} tone="neutral" />
            </View>
            {webOnlyFormat ? (
              <Text style={styles.warningText}>Management for this tournament format is web-only.</Text>
            ) : null}
            {!webOnlyFormat && !canAdminDivision ? (
              <Text style={styles.warningText}>
                Score-only access: settings, team management, and scheduling are read-only.
              </Text>
            ) : null}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Division Settings</Text>
            <View style={styles.field}>
              <Text style={styles.label}>Name</Text>
              <TextInput style={styles.input} value={divisionName} onChangeText={setDivisionName} />
            </View>
            <View style={styles.fieldRow}>
              <View style={styles.halfField}>
                <Text style={styles.label}>Pool Count</Text>
                <TextInput
                  style={styles.input}
                  value={divisionPoolCount}
                  onChangeText={setDivisionPoolCount}
                  keyboardType="number-pad"
                />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.label}>Max Teams (optional)</Text>
                <TextInput
                  style={styles.input}
                  value={divisionMaxTeams}
                  onChangeText={setDivisionMaxTeams}
                  keyboardType="number-pad"
                />
              </View>
            </View>
            <PrimaryButton
              label={savingDivision ? 'Saving...' : 'Save Division'}
              disabled={savingDivision || adminActionsDisabled}
              onPress={async () => {
                if (!divisionName.trim()) {
                  Alert.alert('Validation', 'Division name is required.')
                  return
                }
                const poolCount = Math.max(0, Math.floor(Number(divisionPoolCount || 1)))
                const maxTeamsRaw = divisionMaxTeams.trim()
                const maxTeams = maxTeamsRaw ? Number(maxTeamsRaw) : null
                try {
                  setSavingDivision(true)
                  await updateManagerDivision({
                    id: division.id,
                    name: divisionName.trim(),
                    poolCount,
                    maxTeams: Number.isFinite(maxTeams as number) ? (maxTeams as number) : null,
                  })
                  await loadDivision()
                  Alert.alert('Saved', 'Division settings updated.')
                } catch (error) {
                  Alert.alert('Save failed', getErrorMessage(error, 'Could not update division settings.'))
                } finally {
                  setSavingDivision(false)
                }
              }}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Schedule & Bracket</Text>
            <View style={styles.rowActions}>
              <PrimaryButton
                label={runningScheduler === 'generate' ? 'Generating...' : 'Generate Round Robin'}
                disabled={runningScheduler !== null || adminActionsDisabled}
                onPress={async () => {
                  try {
                    setRunningScheduler('generate')
                    await generateManagerRoundRobin(division.id, 'generate')
                    await loadDivision()
                    Alert.alert('Done', 'Round Robin generated.')
                  } catch (error) {
                    Alert.alert('Generate failed', getErrorMessage(error, 'Could not generate Round Robin.'))
                  } finally {
                    setRunningScheduler(null)
                  }
                }}
              />
              <PrimaryButton
                label={runningScheduler === 'regenerate' ? 'Regenerating...' : 'Regenerate'}
                variant="outline"
                disabled={runningScheduler !== null || adminActionsDisabled}
                onPress={() => {
                  Alert.alert('Regenerate Round Robin', 'This will recreate RR matches for this division. Continue?', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Regenerate',
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          setRunningScheduler('regenerate')
                          await generateManagerRoundRobin(division.id, 'regenerate')
                          await loadDivision()
                          Alert.alert('Done', 'Round Robin regenerated.')
                        } catch (error) {
                          Alert.alert('Regenerate failed', getErrorMessage(error, 'Could not regenerate RR.'))
                        } finally {
                          setRunningScheduler(null)
                        }
                      },
                    },
                  ])
                }}
              />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Create Team</Text>
            <View style={styles.field}>
              <Text style={styles.label}>Team Name</Text>
              <TextInput style={styles.input} value={newTeamName} onChangeText={setNewTeamName} />
            </View>
            <View style={styles.fieldRow}>
              <View style={styles.halfField}>
                <Text style={styles.label}>Seed (optional)</Text>
                <TextInput style={styles.input} value={newTeamSeed} onChangeText={setNewTeamSeed} keyboardType="number-pad" />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.label}>Pool</Text>
                <View style={styles.chipsRow}>
                  <Pressable
                    style={[styles.chip, newTeamPoolId === '' ? styles.chipActive : null]}
                    onPress={() => setNewTeamPoolId('')}
                  >
                    <Text style={[styles.chipText, newTeamPoolId === '' ? styles.chipTextActive : null]}>
                      Waitlist
                    </Text>
                  </Pressable>
                  {division.pools.map((pool) => {
                    const active = newTeamPoolId === pool.id
                    return (
                      <Pressable
                        key={pool.id}
                        style={[styles.chip, active ? styles.chipActive : null]}
                        onPress={() => setNewTeamPoolId(pool.id)}
                      >
                        <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{pool.name}</Text>
                      </Pressable>
                    )
                  })}
                </View>
              </View>
            </View>
            <PrimaryButton
              label={creatingTeam ? 'Creating...' : 'Create Team'}
              disabled={creatingTeam || adminActionsDisabled}
              onPress={async () => {
                if (!newTeamName.trim()) {
                  Alert.alert('Validation', 'Team name is required.')
                  return
                }
                const seedValue = newTeamSeed.trim() ? Number(newTeamSeed.trim()) : null
                try {
                  setCreatingTeam(true)
                  await createManagerTeam({
                    divisionId: division.id,
                    name: newTeamName.trim(),
                    seed: Number.isFinite(seedValue as number) ? (seedValue as number) : null,
                    poolId: newTeamPoolId || null,
                  })
                  setNewTeamName('')
                  setNewTeamSeed('')
                  await loadDivision()
                } catch (error) {
                  Alert.alert('Create failed', getErrorMessage(error, 'Could not create team.'))
                } finally {
                  setCreatingTeam(false)
                }
              }}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Teams</Text>
            {division.teams.map((team) => {
              const draft = teamDrafts[team.id] || { name: team.name, seed: '', poolId: team.poolId || '' }
              return (
                <View key={team.id} style={styles.itemCard}>
                  <View style={styles.field}>
                    <Text style={styles.label}>Team Name</Text>
                    <TextInput
                      style={styles.input}
                      value={draft.name}
                      onChangeText={(value) =>
                        setTeamDrafts((previous) => ({
                          ...previous,
                          [team.id]: {
                            ...(previous[team.id] || draft),
                            name: value,
                          },
                        }))
                      }
                    />
                  </View>

                  <View style={styles.fieldRow}>
                    <View style={styles.halfField}>
                      <Text style={styles.label}>Seed</Text>
                      <TextInput
                        style={styles.input}
                        value={draft.seed}
                        keyboardType="number-pad"
                        onChangeText={(value) =>
                          setTeamDrafts((previous) => ({
                            ...previous,
                            [team.id]: {
                              ...(previous[team.id] || draft),
                              seed: value,
                            },
                          }))
                        }
                      />
                    </View>
                    <View style={styles.halfField}>
                      <Text style={styles.label}>Pool</Text>
                      <View style={styles.chipsRow}>
                        <Pressable
                          style={[styles.chip, draft.poolId === '' ? styles.chipActive : null]}
                          onPress={() =>
                            setTeamDrafts((previous) => ({
                              ...previous,
                              [team.id]: {
                                ...(previous[team.id] || draft),
                                poolId: '',
                              },
                            }))
                          }
                        >
                          <Text style={[styles.chipText, draft.poolId === '' ? styles.chipTextActive : null]}>
                            Waitlist
                          </Text>
                        </Pressable>
                        {division.pools.map((pool) => {
                          const active = draft.poolId === pool.id
                          return (
                            <Pressable
                              key={pool.id}
                              style={[styles.chip, active ? styles.chipActive : null]}
                              onPress={() =>
                                setTeamDrafts((previous) => ({
                                  ...previous,
                                  [team.id]: {
                                    ...(previous[team.id] || draft),
                                    poolId: pool.id,
                                  },
                                }))
                              }
                            >
                              <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>
                                {pool.name}
                              </Text>
                            </Pressable>
                          )
                        })}
                      </View>
                    </View>
                  </View>

                  <View style={styles.rowActions}>
                    <PrimaryButton
                      label="Save Team"
                      disabled={adminActionsDisabled}
                      onPress={async () => {
                        try {
                          const seedValue = draft.seed.trim() ? Number(draft.seed.trim()) : null
                          await updateManagerTeam({
                            id: team.id,
                            name: draft.name.trim() || team.name,
                            seed: Number.isFinite(seedValue as number) ? (seedValue as number) : null,
                            poolId: draft.poolId || null,
                          })
                          await loadDivision()
                        } catch (error) {
                          Alert.alert('Save failed', getErrorMessage(error, 'Could not update team.'))
                        }
                      }}
                    />
                    <PrimaryButton
                      label="Delete Team"
                      variant="outline"
                      disabled={adminActionsDisabled}
                      onPress={() =>
                        Alert.alert('Delete team', `Delete "${team.name}"?`, [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Delete',
                            style: 'destructive',
                            onPress: async () => {
                              try {
                                await deleteManagerTeam(team.id)
                                await loadDivision()
                              } catch (error) {
                                Alert.alert('Delete failed', getErrorMessage(error, 'Could not delete team.'))
                              }
                            },
                          },
                        ])
                      }
                    />
                  </View>
                </View>
              )
            })}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Score Entry</Text>
            {division.matches.map((match) => {
              const draft = scoreDrafts[match.id] || { scoreA: '', scoreB: '' }
              return (
                <View key={match.id} style={styles.itemCard}>
                  <View style={styles.matchTop}>
                    <Text style={styles.matchTitle}>
                      Round {match.roundIndex + 1} • {match.teamAName} vs {match.teamBName}
                    </Text>
                    <Badge label={match.stage.replace(/_/g, ' ')} tone="neutral" />
                  </View>
                  <View style={styles.fieldRow}>
                    <View style={styles.halfField}>
                      <Text style={styles.label}>{match.teamAName}</Text>
                      <TextInput
                        style={styles.input}
                        value={draft.scoreA}
                        keyboardType="number-pad"
                        onChangeText={(value) =>
                          setScoreDrafts((previous) => ({
                            ...previous,
                            [match.id]: { ...(previous[match.id] || draft), scoreA: value },
                          }))
                        }
                      />
                    </View>
                    <View style={styles.halfField}>
                      <Text style={styles.label}>{match.teamBName}</Text>
                      <TextInput
                        style={styles.input}
                        value={draft.scoreB}
                        keyboardType="number-pad"
                        onChangeText={(value) =>
                          setScoreDrafts((previous) => ({
                            ...previous,
                            [match.id]: { ...(previous[match.id] || draft), scoreB: value },
                          }))
                        }
                      />
                    </View>
                  </View>
                  <PrimaryButton
                    label={busyMatchId === match.id ? 'Saving...' : 'Save Score'}
                    disabled={busyMatchId === match.id || webOnlyFormat || !canScoreDivision}
                    onPress={async () => {
                      const scoreA = draft.scoreA.trim() ? Number(draft.scoreA.trim()) : null
                      const scoreB = draft.scoreB.trim() ? Number(draft.scoreB.trim()) : null
                      if (
                        (scoreA !== null && !Number.isFinite(scoreA)) ||
                        (scoreB !== null && !Number.isFinite(scoreB))
                      ) {
                        Alert.alert('Validation', 'Scores must be numeric values.')
                        return
                      }
                      try {
                        setBusyMatchId(match.id)
                        await saveManagerMatchScore({
                          matchId: match.id,
                          scoreA: scoreA == null ? null : Math.max(0, Math.floor(scoreA)),
                          scoreB: scoreB == null ? null : Math.max(0, Math.floor(scoreB)),
                        })
                        await loadDivision()
                      } catch (error) {
                        Alert.alert('Save failed', getErrorMessage(error, 'Could not save score.'))
                      } finally {
                        setBusyMatchId(null)
                      }
                    }}
                  />
                </View>
              )
            })}
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
  rowActions: {
    gap: spacing.xs,
  },
  itemCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: '#FFFFFF',
    padding: spacing.sm,
    gap: spacing.xs,
  },
  matchTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  matchTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
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
})
