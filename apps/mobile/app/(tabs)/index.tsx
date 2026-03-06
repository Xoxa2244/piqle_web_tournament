import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'

import { TournamentCard } from '../../src/components/TournamentCard'
import { ActionButton, EmptyState, InputField, LoadingBlock, Screen, SectionTitle, SurfaceCard } from '../../src/components/ui'
import { trpc } from '../../src/lib/trpc'
import { palette, radius, spacing } from '../../src/lib/theme'
import { useAuth } from '../../src/providers/AuthProvider'

const statusLabel = (status?: string | null) => {
  if (status === 'active') return 'Registered'
  if (status === 'waitlisted') return 'Waitlist'
  return null
}

export default function HomeTab() {
  const { token, user } = useAuth()
  const isAuthenticated = Boolean(token)
  const [mode, setMode] = useState<'discover' | 'mine'>('discover')
  const [search, setSearch] = useState('')
  const utils = trpc.useUtils()

  const tournamentsQuery = trpc.public.listBoards.useQuery()
  const tournamentIds = useMemo(
    () => tournamentsQuery.data?.map((item) => item.id) ?? [],
    [tournamentsQuery.data]
  )
  const ratingsQuery = trpc.rating.getTournamentRatings.useQuery(
    { tournamentIds },
    { enabled: tournamentIds.length > 0 }
  )
  const commentCountsQuery = trpc.comment.getTournamentCommentCounts.useQuery(
    { tournamentIds },
    { enabled: tournamentIds.length > 0 }
  )
  const registrationStatusesQuery = trpc.registration.getMyStatuses.useQuery(
    { tournamentIds },
    { enabled: isAuthenticated && tournamentIds.length > 0 }
  )
  const notificationsQuery = trpc.notification.list.useQuery(
    { limit: 8 },
    { enabled: isAuthenticated }
  )

  const acceptInvitation = trpc.tournamentInvitation.accept.useMutation({
    onSuccess: async (result) => {
      await Promise.all([
        utils.notification.list.invalidate(),
        utils.registration.getMyStatuses.invalidate({ tournamentIds }),
      ])
      router.push({ pathname: '/tournaments/[id]/register', params: { id: result.tournamentId } })
    },
  })
  const declineInvitation = trpc.tournamentInvitation.decline.useMutation({
    onSuccess: async () => {
      await utils.notification.list.invalidate()
    },
  })

  const filtered = useMemo(() => {
    const source = tournamentsQuery.data ?? []
    const searchTerm = search.trim().toLowerCase()
    const searched = searchTerm
      ? source.filter((item) => item.title.toLowerCase().includes(searchTerm))
      : source

    if (mode === 'discover') return searched
    if (!isAuthenticated || !user) return []

    return searched.filter((item) => {
      const myStatus = registrationStatusesQuery.data?.[item.id]?.status
      const isOwner = item.user?.id === user.id
      return Boolean(isOwner || myStatus === 'active' || myStatus === 'waitlisted')
    })
  }, [mode, search, tournamentsQuery.data, registrationStatusesQuery.data, isAuthenticated, user])

  const invitationItems = (notificationsQuery.data?.items ?? []).filter(
    (item) => item.type === 'TOURNAMENT_INVITATION'
  )

  return (
    <Screen
      title="Tournaments"
      subtitle={
        isAuthenticated
          ? 'Your player dashboard for public events, invitations, and registration status.'
          : 'Browse public tournaments. Sign in to register, comment, and join chats.'
      }
      right={
        isAuthenticated ? (
          <ActionButton label={user?.name?.split(' ')[0] || 'Profile'} variant="secondary" onPress={() => router.push('/(tabs)/profile')} />
        ) : (
          <ActionButton label="Sign in" onPress={() => router.push('/sign-in')} />
        )
      }
    >
      <SurfaceCard>
        <InputField value={search} onChangeText={setSearch} placeholder="Search tournaments" />
        <View style={styles.modeSwitch}>
          {(['discover', 'mine'] as const).map((value) => {
            const active = mode === value
            return (
              <Pressable
                key={value}
                onPress={() => setMode(value)}
                style={[styles.modeButton, active && styles.modeButtonActive]}
              >
                <Text style={[styles.modeLabel, active && styles.modeLabelActive]}>{value === 'discover' ? 'Discover' : 'My events'}</Text>
              </Pressable>
            )
          })}
        </View>
      </SurfaceCard>

      {isAuthenticated && invitationItems.length > 0 ? (
        <View style={{ gap: spacing.md }}>
          <SectionTitle title="Pending invitations" subtitle="Accept to jump straight into registration." />
          {invitationItems.map((item) => (
            <SurfaceCard key={item.id}>
              <Text style={styles.inviteTitle}>{item.title}</Text>
              <Text style={styles.inviteBody}>{item.body}</Text>
              <View style={styles.inviteActions}>
                <ActionButton
                  label="Accept"
                  loading={acceptInvitation.isPending}
                  onPress={() => acceptInvitation.mutate({ invitationId: item.invitationId })}
                />
                <ActionButton
                  label="Decline"
                  variant="secondary"
                  loading={declineInvitation.isPending}
                  onPress={() => declineInvitation.mutate({ invitationId: item.invitationId })}
                />
              </View>
            </SurfaceCard>
          ))}
        </View>
      ) : null}

      {tournamentsQuery.isLoading ? <LoadingBlock label="Loading tournaments…" /> : null}

      {!tournamentsQuery.isLoading && filtered.length === 0 ? (
        <EmptyState
          title={mode === 'mine' ? 'No tournaments yet' : 'Nothing matched this search'}
          body={
            mode === 'mine'
              ? isAuthenticated
                ? 'Register for a public event and it will appear here.'
                : 'Sign in to see tournaments where you are registered.'
              : 'Try another name or remove the filter.'
          }
        />
      ) : null}

      {filtered.map((tournament) => {
        const rating = ratingsQuery.data?.[tournament.id]
        const comments = commentCountsQuery.data?.[tournament.id] ?? 0
        const myStatus = registrationStatusesQuery.data?.[tournament.id]
        const feeCents = typeof tournament.entryFee === 'string' ? Math.round(Number(tournament.entryFee) * 100) : null
        const social = `${rating?.likes ?? tournament.likes ?? 0} likes · ${comments} comments`

        return (
          <TournamentCard
            key={tournament.id}
            tournament={{
              ...tournament,
              entryFeeCents: feeCents,
            }}
            statusLabel={statusLabel(myStatus?.status)}
            secondaryStatus={social}
            onPress={() => router.push({ pathname: '/tournaments/[id]', params: { id: tournament.id } })}
          />
        )
      })}

      {isAuthenticated ? (
        <SurfaceCard>
          <Text style={styles.metaHeadline}>Quick snapshot</Text>
          <Text style={styles.metaBody}>
            {registrationStatusesQuery.data
              ? Object.values(registrationStatusesQuery.data).filter((value) => value.status === 'active').length
              : 0}{' '}
            registered events ·{' '}
            {Object.values(registrationStatusesQuery.data ?? {}).filter((value) => value.status === 'waitlisted').length} waitlists
          </Text>
          <Text style={styles.metaSubtle}>
            Fees are handled via the same web backend. Paid events open Stripe checkout from the app.
          </Text>
        </SurfaceCard>
      ) : (
        <SurfaceCard>
          <Text style={styles.metaHeadline}>Guest mode</Text>
          <Text style={styles.metaBody}>You can browse public events now and sign in when you want to register or chat.</Text>
          <Text style={styles.metaSubtle}>Email/password is wired for mobile. Google mobile sign-in still needs native OAuth client setup.</Text>
        </SurfaceCard>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  modeSwitch: {
    marginTop: spacing.md,
    flexDirection: 'row',
    gap: 8,
    backgroundColor: palette.surfaceMuted,
    padding: 6,
    borderRadius: radius.pill,
  },
  modeButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  modeButtonActive: {
    backgroundColor: palette.surface,
  },
  modeLabel: {
    color: palette.textMuted,
    fontWeight: '700',
  },
  modeLabelActive: {
    color: palette.text,
  },
  inviteTitle: {
    color: palette.text,
    fontWeight: '700',
    fontSize: 17,
  },
  inviteBody: {
    marginTop: 8,
    color: palette.textMuted,
    lineHeight: 20,
  },
  inviteActions: {
    marginTop: spacing.md,
    gap: 10,
  },
  metaHeadline: {
    color: palette.text,
    fontWeight: '700',
    fontSize: 17,
  },
  metaBody: {
    marginTop: 8,
    color: palette.text,
    lineHeight: 22,
  },
  metaSubtle: {
    marginTop: 8,
    color: palette.textMuted,
    lineHeight: 20,
  },
})


