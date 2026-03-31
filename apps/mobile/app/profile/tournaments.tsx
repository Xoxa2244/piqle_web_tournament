import { useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'

import { AuthRequiredCard } from '../../src/components/AuthRequiredCard'
import { SubpageHeader } from '../../src/components/navigation/SubpageHeader'
import { TournamentCard } from '../../src/components/TournamentCard'
import { EmptyState, LoadingBlock, SegmentedControl } from '../../src/components/ui'
import { spacing } from '../../src/lib/theme'
import { trpc } from '../../src/lib/trpc'
import { useAuth } from '../../src/providers/AuthProvider'
import { useAppTheme } from '../../src/providers/ThemeProvider'

const statusTone = (statusLabel: string): 'muted' | 'primary' | 'danger' | 'success' | 'warning' => {
  if (statusLabel === 'Admin') return 'primary'
  if (statusLabel === 'Registered') return 'success'
  if (statusLabel === 'Waitlist') return 'warning'
  return 'muted'
}

export default function ProfilePastTournamentsScreen() {
  const params = useLocalSearchParams<{ profileId?: string; filter?: string }>()
  const { colors } = useAppTheme()
  const { token, user } = useAuth()
  const isAuthenticated = Boolean(token)
  const api = trpc as any
  const targetProfileId = String(params.profileId ?? user?.id ?? '').trim()
  const isOwnProfile = Boolean(user?.id && targetProfileId === user.id)

  const tournamentsQuery = api.public.listBoards.useQuery(undefined, { enabled: isAuthenticated || Boolean(targetProfileId) })
  const tournamentIds = useMemo(
    () => ((tournamentsQuery.data ?? []) as any[]).map((item) => item.id),
    [tournamentsQuery.data]
  )
  const registrationStatusesQuery = api.registration.getMyStatuses.useQuery(
    { tournamentIds },
    { enabled: isOwnProfile && isAuthenticated && tournamentIds.length > 0 }
  )
  const accessibleTournamentsQuery = api.tournament.list.useQuery(undefined, {
    enabled: isOwnProfile && isAuthenticated,
  })
  const accessibleTournamentIds = useMemo(
    () => new Set((((accessibleTournamentsQuery.data ?? []) as any[]).map((item) => item.id) as string[])),
    [accessibleTournamentsQuery.data]
  )

  const statuses = (registrationStatusesQuery.data ?? {}) as Record<string, { status?: string }>
  const initialFilter: 'played' | 'hosted' = params.filter === 'hosted' ? 'hosted' : 'played'
  const [filter, setFilter] = useState<'played' | 'hosted'>(initialFilter)
  const autoFilterAppliedRef = useRef(false)
  const profileQuery = api.user.getProfileById.useQuery(
    { id: targetProfileId },
    { enabled: Boolean(targetProfileId) && !isOwnProfile }
  )
  const targetProfileEmail = String(profileQuery.data?.email ?? '').trim().toLowerCase()
  const isUserParticipant = (tournament: any) => {
    if (isOwnProfile) {
      const status = statuses[tournament.id]?.status
      return status === 'active' || status === 'waitlisted'
    }
    const players = Array.isArray(tournament?.players) ? tournament.players : []
    const playerMatch = players.some((player: any) => {
      const directUserId = String(player?.userId ?? player?.user?.id ?? '').trim()
      if (directUserId && directUserId === targetProfileId) return true
      const playerEmail = String(player?.email ?? player?.user?.email ?? '').trim().toLowerCase()
      return Boolean(targetProfileEmail && playerEmail && playerEmail === targetProfileEmail)
    })
    if (playerMatch) return true
    const divisions = Array.isArray(tournament?.divisions) ? tournament.divisions : []
    return divisions.some((division: any) =>
      (division?.teams ?? []).some((team: any) =>
        (team?.teamPlayers ?? []).some((tp: any) => {
          const directUserId = String(tp?.player?.userId ?? tp?.player?.user?.id ?? '').trim()
          if (directUserId && directUserId === targetProfileId) return true
          const playerEmail = String(tp?.player?.email ?? tp?.player?.user?.email ?? '').trim().toLowerCase()
          return Boolean(targetProfileEmail && playerEmail && playerEmail === targetProfileEmail)
        })
      )
    )
  }
  const playedPastTournaments = useMemo(() => {
    const items = (tournamentsQuery.data ?? []) as any[]
    const now = Date.now()
    return items
      .filter((item) => {
        const isPast = new Date(item.endDate ?? item.startDate).getTime() < now
        return isPast && isUserParticipant(item)
      })
      .sort((left, right) => new Date(right.startDate).getTime() - new Date(left.startDate).getTime())
      .map((item) => ({ ...item, myStatus: statuses[item.id]?.status }))
  }, [statuses, tournamentsQuery.data, user?.id, targetProfileId, targetProfileEmail, isOwnProfile])
  const hostedPastTournaments = useMemo(() => {
    const items = (tournamentsQuery.data ?? []) as any[]
    const now = Date.now()
    return items
      .filter((item) => {
        const isHostedByMe = Boolean(item.user?.id && item.user.id === targetProfileId)
        const isPast = new Date(item.endDate ?? item.startDate).getTime() < now
        return isPast && isHostedByMe
      })
      .sort((left, right) => new Date(right.startDate).getTime() - new Date(left.startDate).getTime())
      .map((item) => ({ ...item, myStatus: statuses[item.id]?.status }))
  }, [statuses, tournamentsQuery.data, targetProfileId])
  const pastTournaments = filter === 'played' ? playedPastTournaments : hostedPastTournaments
  const hostedCount = hostedPastTournaments.length
  const playedCount = playedPastTournaments.length
  const isLoading =
    tournamentsQuery.isLoading ||
    (isOwnProfile && isAuthenticated && tournamentIds.length > 0 && registrationStatusesQuery.isLoading)

  useEffect(() => {
    autoFilterAppliedRef.current = false
  }, [targetProfileId])

  useEffect(() => {
    if (isLoading) return
    if (autoFilterAppliedRef.current) return
    // Rule:
    // 1) If one list is empty and the other has tournaments -> select non-empty one
    // 2) If both are empty -> default to "played"
    if (hostedCount === 0 && playedCount > 0) {
      setFilter('played')
      autoFilterAppliedRef.current = true
      return
    }
    if (playedCount === 0 && hostedCount > 0) {
      setFilter('hosted')
      autoFilterAppliedRef.current = true
      return
    }
    if (playedCount === 0 && hostedCount === 0) {
      setFilter('played')
      autoFilterAppliedRef.current = true
    }
  }, [hostedCount, playedCount, isLoading])

  if (!isAuthenticated && isOwnProfile) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <SubpageHeader title="Past tournaments" />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.pageContent}
          showsVerticalScrollIndicator={false}
        >
          <AuthRequiredCard body="Sign in to view your past tournaments." />
        </ScrollView>
      </View>
    )
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <SubpageHeader title="Past tournaments" />
      <View style={styles.filtersWrap}>
        <SegmentedControl
          value={filter}
          onChange={(value) => {
            autoFilterAppliedRef.current = true
            setFilter(value as 'played' | 'hosted')
          }}
          options={[
            { value: 'hosted', label: 'Hosted' },
            { value: 'played', label: 'Played' },
          ]}
        />
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
        {isLoading ? <LoadingBlock label="Loading activity…" /> : null}

        {!isLoading && pastTournaments.length === 0 ? (
          <EmptyState
            title="No past tournaments yet"
            body={
              filter === 'played'
                ? 'Finished events where you participated will appear here.'
                : 'Finished events where you were a host will appear here.'
            }
          />
        ) : null}

        {pastTournaments.map((tournament) => {
          const isOwner = Boolean(targetProfileId && tournament.user?.id === targetProfileId)
          const hasPrivilegedAccess = Boolean(isOwner || accessibleTournamentIds.has(tournament.id))
          const statusLabel = filter === 'hosted'
            ? 'Hosted'
            : isOwnProfile && hasPrivilegedAccess
            ? 'Admin'
            : isOwnProfile && tournament.myStatus === 'active'
            ? 'Registered'
            : isOwnProfile && tournament.myStatus === 'waitlisted'
            ? 'Waitlist'
            : 'Played'

          return (
            <View key={tournament.id}>
              <TournamentCard
                tournament={{
                  ...tournament,
                  image: (tournament as any).image ?? null,
                  startDate: tournament.startDate ?? new Date().toISOString(),
                  endDate: tournament.endDate ?? tournament.startDate ?? new Date().toISOString(),
                  venueName: tournament.venueName ?? null,
                  venueAddress: tournament.venueAddress ?? null,
                  divisions: tournament.divisions ?? [],
                  _count: tournament._count ?? { players: 0 },
                  feedbackSummary: tournament.feedbackSummary ?? null,
                }}
                statusLabel={statusLabel}
                statusTone={filter === 'hosted' ? 'primary' : isOwnProfile ? statusTone(statusLabel) : 'success'}
                onPress={() => router.push(`/tournaments/${tournament.id}`)}
              />
            </View>
          )
        })}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  filtersWrap: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  pageContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
})
