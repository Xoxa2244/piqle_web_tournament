import { useMemo, useState } from 'react'
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { router } from 'expo-router'

import { ActionButton, InputField, LoadingBlock, Pill, Screen, SectionTitle, SurfaceCard } from '../../../src/components/ui'
import { buildWebUrl } from '../../../src/lib/config'
import { formatDateRange, formatLocation, formatMoney, formatPlayerName } from '../../../src/lib/formatters'
import { trpc } from '../../../src/lib/trpc'
import { palette, spacing } from '../../../src/lib/theme'
import { useAuth } from '../../../src/providers/AuthProvider'

export default function TournamentDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>()
  const tournamentId = params.id
  const { token, user } = useAuth()
  const isAuthenticated = Boolean(token)
  const utils = trpc.useUtils()

  const [commentText, setCommentText] = useState('')

  const tournamentQuery = trpc.public.getBoardById.useQuery({ id: tournamentId }, { enabled: Boolean(tournamentId) })
  const ratingQuery = trpc.rating.getTournamentRating.useQuery(
    { tournamentId },
    { enabled: Boolean(tournamentId) }
  )
  const commentsQuery = trpc.comment.getTournamentComments.useQuery(
    { tournamentId },
    { enabled: Boolean(tournamentId) }
  )
  const myStatusQuery = trpc.registration.getMyStatus.useQuery(
    { tournamentId },
    { enabled: Boolean(tournamentId) && isAuthenticated }
  )
  const myInvitationQuery = trpc.tournamentInvitation.getMineByTournament.useQuery(
    { tournamentId },
    { enabled: Boolean(tournamentId) && isAuthenticated }
  )

  const toggleRating = trpc.rating.toggleRating.useMutation({
    onSuccess: async () => {
      await ratingQuery.refetch()
    },
  })
  const createComment = trpc.comment.createComment.useMutation({
    onSuccess: async () => {
      setCommentText('')
      await commentsQuery.refetch()
    },
  })
  const deleteComment = trpc.comment.deleteComment.useMutation({
    onSuccess: async () => {
      await commentsQuery.refetch()
    },
  })
  const acceptInvitation = trpc.tournamentInvitation.accept.useMutation({
    onSuccess: async (result) => {
      await Promise.all([
        utils.notification.list.invalidate(),
        myInvitationQuery.refetch(),
      ])
      router.push({ pathname: '/tournaments/[id]/register', params: { id: result.tournamentId } })
    },
  })
  const declineInvitation = trpc.tournamentInvitation.decline.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.notification.list.invalidate(),
        myInvitationQuery.refetch(),
      ])
    },
  })

  const comments = useMemo(
    () => [...(commentsQuery.data ?? [])].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [commentsQuery.data]
  )

  if (tournamentQuery.isLoading) {
    return <Screen title="Tournament"><LoadingBlock label="Loading tournament…" /></Screen>
  }

  if (!tournamentQuery.data) {
    return <Screen title="Tournament"><SurfaceCard><Text style={styles.muted}>Tournament not found.</Text></SurfaceCard></Screen>
  }

  const tournament = tournamentQuery.data
  const myStatus = myStatusQuery.data?.status
  const pendingInvitation = myInvitationQuery.data?.status === 'PENDING' ? myInvitationQuery.data : null
  const feeLabel = Number(tournament.entryFee ?? 0) > 0 ? formatMoney(Math.round(Number(tournament.entryFee) * 100)) : 'Free'

  return (
    <Screen title={tournament.title} subtitle={formatDateRange(tournament.startDate, tournament.endDate)}>
      <SurfaceCard>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Pill label={feeLabel} tone={feeLabel === 'Free' ? 'success' : 'muted'} />
          <Pill label={`${tournament.divisions.length} divisions`} />
          <Pill label={formatLocation([tournament.venueName, tournament.venueAddress])} />
        </View>

        {tournament.description ? <Text style={styles.description}>{tournament.description}</Text> : null}

        <View style={styles.actionStack}>
          {pendingInvitation ? (
            <>
              <ActionButton label="Accept invitation" loading={acceptInvitation.isPending} onPress={() => acceptInvitation.mutate({ invitationId: pendingInvitation.id })} />
              <ActionButton label="Decline invitation" variant="secondary" loading={declineInvitation.isPending} onPress={() => declineInvitation.mutate({ invitationId: pendingInvitation.id })} />
            </>
          ) : (
            <ActionButton
              label={myStatus === 'active' ? 'Manage registration' : myStatus === 'waitlisted' ? 'View waitlist spot' : 'Register'}
              onPress={() => (isAuthenticated ? router.push({ pathname: '/tournaments/[id]/register', params: { id: tournament.id } }) : router.push('/sign-in'))}
            />
          )}
          <ActionButton label="Open full scoreboard in browser" variant="secondary" onPress={() => Linking.openURL(buildWebUrl(`/scoreboard/${tournament.id}`))} />
        </View>
      </SurfaceCard>

      <SurfaceCard>
        <SectionTitle title="Community pulse" subtitle="Ratings and comments stay in sync with web." />
        <View style={styles.socialRow}>
          <ActionButton
            label={`Like ${ratingQuery.data?.likes ?? 0}`}
            variant={ratingQuery.data?.userRating === 'LIKE' ? 'primary' : 'secondary'}
            onPress={() => (isAuthenticated ? toggleRating.mutate({ tournamentId, rating: 'LIKE' }) : router.push('/sign-in'))}
          />
          <ActionButton
            label={`Dislike ${ratingQuery.data?.dislikes ?? 0}`}
            variant={ratingQuery.data?.userRating === 'DISLIKE' ? 'danger' : 'secondary'}
            onPress={() => (isAuthenticated ? toggleRating.mutate({ tournamentId, rating: 'DISLIKE' }) : router.push('/sign-in'))}
          />
        </View>
      </SurfaceCard>

      <SurfaceCard>
        <SectionTitle title="Comments" subtitle={comments.length ? `${comments.length} total` : 'No comments yet'} />
        {comments.map((comment) => {
          const mine = comment.user.id === user?.id
          return (
            <View key={comment.id} style={styles.commentRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.commentAuthor}>{formatPlayerName(comment.user)}</Text>
                <Text style={styles.commentText}>{comment.text}</Text>
              </View>
              {mine ? (
                <Pressable onPress={() => deleteComment.mutate({ commentId: comment.id })}>
                  <Text style={styles.deleteText}>Delete</Text>
                </Pressable>
              ) : null}
            </View>
          )
        })}

        {isAuthenticated ? (
          <View style={{ gap: 10, marginTop: spacing.md }}>
            <InputField value={commentText} onChangeText={setCommentText} placeholder="Add a comment" multiline />
            <ActionButton label="Post comment" loading={createComment.isPending} onPress={() => createComment.mutate({ tournamentId, text: commentText.trim() })} />
          </View>
        ) : (
          <ActionButton label="Sign in to comment" onPress={() => router.push('/sign-in')} />
        )}
      </SurfaceCard>

      <SurfaceCard>
        <SectionTitle title="Divisions" subtitle="Registration and scoreboards are driven by the same event structure as web." />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {tournament.divisions.map((division) => (
            <Pill key={division.id} label={division.name} />
          ))}
        </View>
      </SurfaceCard>
    </Screen>
  )
}

const styles = StyleSheet.create({
  muted: {
    color: palette.textMuted,
  },
  description: {
    marginTop: spacing.md,
    color: palette.text,
    lineHeight: 22,
  },
  actionStack: {
    marginTop: spacing.md,
    gap: 10,
  },
  socialRow: {
    marginTop: spacing.md,
    gap: 10,
  },
  commentRow: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    flexDirection: 'row',
    gap: spacing.md,
  },
  commentAuthor: {
    color: palette.text,
    fontWeight: '700',
  },
  commentText: {
    marginTop: 4,
    color: palette.textMuted,
    lineHeight: 20,
  },
  deleteText: {
    color: palette.danger,
    fontWeight: '700',
  },
})
