import { useMemo } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'

import { AuthRequiredCard } from '../../src/components/AuthRequiredCard'
import { SubpageHeader } from '../../src/components/navigation/SubpageHeader'
import { TournamentCard } from '../../src/components/TournamentCard'
import { EmptyState, LoadingBlock } from '../../src/components/ui'
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
  const { colors } = useAppTheme()
  const { token, user } = useAuth()
  const isAuthenticated = Boolean(token)
  const api = trpc as any

  const tournamentsQuery = api.public.listBoards.useQuery(undefined, { enabled: isAuthenticated })
  const tournamentIds = useMemo(
    () => ((tournamentsQuery.data ?? []) as any[]).map((item) => item.id),
    [tournamentsQuery.data]
  )
  const registrationStatusesQuery = api.registration.getMyStatuses.useQuery(
    { tournamentIds },
    { enabled: isAuthenticated && tournamentIds.length > 0 }
  )
  const accessibleTournamentsQuery = api.tournament.list.useQuery(undefined, {
    enabled: isAuthenticated,
  })
  const accessibleTournamentIds = useMemo(
    () => new Set((((accessibleTournamentsQuery.data ?? []) as any[]).map((item) => item.id) as string[])),
    [accessibleTournamentsQuery.data]
  )

  const statuses = (registrationStatusesQuery.data ?? {}) as Record<string, { status?: string }>
  const pastTournaments = useMemo(() => {
    const items = (tournamentsQuery.data ?? []) as any[]
    const now = Date.now()
    return items
      .filter((item) => {
        const status = statuses[item.id]?.status
        const isHostedByMe = Boolean(user?.id && item.user?.id === user.id)
        const isPast = new Date(item.endDate ?? item.startDate).getTime() < now
        return isPast && (status === 'active' || status === 'waitlisted' || isHostedByMe)
      })
      .sort((left, right) => new Date(right.startDate).getTime() - new Date(left.startDate).getTime())
      .map((item) => ({ ...item, myStatus: statuses[item.id]?.status }))
  }, [statuses, tournamentsQuery.data, user?.id])

  const isLoading =
    tournamentsQuery.isLoading ||
    (isAuthenticated && tournamentIds.length > 0 && registrationStatusesQuery.isLoading)

  if (!isAuthenticated) {
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
      <ScrollView style={styles.scroll} contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
        {isLoading ? <LoadingBlock label="Loading activity…" /> : null}

        {!isLoading && pastTournaments.length === 0 ? (
          <EmptyState
            title="No past tournaments yet"
            body="Finished events where you played or had admin access will appear here."
          />
        ) : null}

        {pastTournaments.map((tournament) => {
          const isOwner = Boolean(user?.id && tournament.user?.id === user.id)
          const hasPrivilegedAccess = Boolean(isOwner || accessibleTournamentIds.has(tournament.id))
          const statusLabel =
            hasPrivilegedAccess
              ? 'Admin'
              : tournament.myStatus === 'active'
              ? 'Registered'
              : tournament.myStatus === 'waitlisted'
              ? 'Waitlist'
              : 'Open'

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
                statusTone={statusTone(statusLabel)}
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
  pageContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
})
