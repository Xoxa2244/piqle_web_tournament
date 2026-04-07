import { Feather, MaterialIcons } from '@expo/vector-icons'
import { Redirect, useLocalSearchParams, router } from 'expo-router'
import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { AppBottomSheet } from '../../src/components/AppBottomSheet'
import { FeedbackEntityContextCard } from '../../src/components/FeedbackEntityContextCard'
import { FeedbackRatingModal } from '../../src/components/FeedbackRatingModal'
import { RatingStarIcon } from '../../src/components/icons/RatingStarIcon'
import { TournamentCard } from '../../src/components/TournamentCard'
import { PageLayout } from '../../src/components/navigation/PageLayout'
import { ProfileHeroCard, ProfileStatsDuprSection } from '../../src/components/profile/ProfileIdentityBlock'
import { ActionButton, EmptyState, LoadingBlock, SurfaceCard } from '../../src/components/ui'
import { FEEDBACK_API_ENABLED } from '../../src/lib/config'
import { formatDate, formatGenderLabel, formatLocation } from '../../src/lib/formatters'
import { radius, spacing } from '../../src/lib/theme'
import { trpc } from '../../src/lib/trpc'
import { useToastWhenEntityMissing } from '../../src/hooks/useToastWhenEntityMissing'
import { useAuth } from '../../src/providers/AuthProvider'
import { useAppTheme } from '../../src/providers/ThemeProvider'
import { useToast } from '../../src/providers/ToastProvider'

const parseNumberish = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  if (value && typeof value === 'object' && 'toString' in value) {
    const parsed = Number(String(value))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export default function PublicProfileScreen() {
  const params = useLocalSearchParams<{ id: string }>()
  const profileId = String(params.id ?? '').trim()
  const { colors } = useAppTheme()
  const { isReady, token, user } = useAuth()
  const toast = useToast()
  const isAuthenticated = Boolean(token)
  const ownProfile = Boolean(user?.id && user.id === profileId)
  const [tdFeedbackOpen, setTdFeedbackOpen] = useState(false)
  const [tdFeedbackInfoOpen, setTdFeedbackInfoOpen] = useState(false)
  const [tdRatedLocally, setTdRatedLocally] = useState(false)
  const utils = trpc.useUtils()
  const openDirectChat = trpc.directChat.getOrCreate.useMutation()

  const profileQuery = trpc.user.getProfileById.useQuery(
    { id: profileId },
    { enabled: Boolean(profileId) },
  )
  useToastWhenEntityMissing({
    enabled:
      Boolean(profileId) &&
      !(isReady && token && user?.id && profileId && user.id === profileId),
    entityKey: profileId,
    toastMessage: 'This profile is unavailable or the link is invalid.',
    isLoading: profileQuery.isLoading,
    hasData: Boolean(profileQuery.data),
    isError: profileQuery.isError,
    errorMessage: profileQuery.error?.message,
  })
  const tdSummaryQuery = trpc.feedback.getEntitySummary.useQuery(
    { entityType: 'TD', entityId: profileId },
    { enabled: FEEDBACK_API_ENABLED && Boolean(profileId) && isAuthenticated, retry: false },
  )
  const hasRatedQuery = trpc.feedback.hasRated.useQuery(
    { targets: [{ entityType: 'TD', entityId: profileId }] },
    { enabled: FEEDBACK_API_ENABLED && Boolean(profileId) && isAuthenticated, retry: false },
  )
  const tdEligibilityQuery = trpc.feedback.getEligibility.useQuery(
    { entityType: 'TD', entityId: profileId },
    { enabled: FEEDBACK_API_ENABLED && Boolean(profileId) && isAuthenticated && !ownProfile, retry: false },
  )
  const hasRatedTd = Boolean(hasRatedQuery.data?.map?.[`TD:${profileId}`])
  const hasRatedTdEffective = hasRatedTd || tdRatedLocally
  const canRateTd = (() => {
    if (ownProfile) return false
    if (!FEEDBACK_API_ENABLED) return false
    if (!isAuthenticated || !profileId) return false
    if (!tdEligibilityQuery.isFetched) return false
    return Boolean(tdEligibilityQuery.data?.canRate) && !hasRatedTdEffective
  })()
  const tournamentsQuery = (trpc as any).public.listBoards.useQuery(undefined, {
    enabled: Boolean(profileId),
  })

  const tdAverage = tdSummaryQuery.data?.averageRating ?? null
  const tdCanPublish = Boolean(tdSummaryQuery.data?.canPublish)
  const achievements = tdSummaryQuery.data?.achievements ?? []
  const profile = profileQuery.data as any
  const isUserParticipant = (tournament: any) => {
    const targetEmail = String(profile?.email ?? '').trim().toLowerCase()
    const players = Array.isArray(tournament?.players) ? tournament.players : []
    const playerMatch = players.some((player: any) => {
      const directUserId = String(player?.userId ?? player?.user?.id ?? '').trim()
      if (directUserId && directUserId === profileId) return true
      const playerEmail = String(player?.email ?? player?.user?.email ?? '').trim().toLowerCase()
      return Boolean(targetEmail && playerEmail && playerEmail === targetEmail)
    })
    if (playerMatch) return true

    const divisions = Array.isArray(tournament?.divisions) ? tournament.divisions : []
    return divisions.some((division: any) =>
      (division?.teams ?? []).some((team: any) =>
        (team?.teamPlayers ?? []).some((tp: any) => {
          const directUserId = String(tp?.player?.userId ?? tp?.player?.user?.id ?? '').trim()
          if (directUserId && directUserId === profileId) return true
          const playerEmail = String(tp?.player?.email ?? tp?.player?.user?.email ?? '').trim().toLowerCase()
          return Boolean(targetEmail && playerEmail && playerEmail === targetEmail)
        })
      )
    )
  }

  const hostedPastTournaments = useMemo(() => {
    const rows = ((tournamentsQuery.data ?? []) as any[]).filter((t) => t.user?.id === profileId)
    return rows
      .filter((t) => new Date(t.endDate ?? t.startDate).getTime() < Date.now())
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
  }, [profileId, tournamentsQuery.data])
  const playedPastTournaments = useMemo(() => {
    const rows = (tournamentsQuery.data ?? []) as any[]
    return rows
      .filter((t) => new Date(t.endDate ?? t.startDate).getTime() < Date.now())
      .filter((t) => isUserParticipant(t))
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
  }, [tournamentsQuery.data, profile?.email, profileId])
  const allPastTournaments = useMemo(() => {
    const byId = new Map<string, any>()
    for (const tournament of [...hostedPastTournaments, ...playedPastTournaments]) {
      if (!byId.has(tournament.id)) {
        byId.set(tournament.id, tournament)
      }
    }
    return Array.from(byId.values()).sort(
      (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
    )
  }, [hostedPastTournaments, playedPastTournaments])
  const previewPastTournaments = useMemo(() => allPastTournaments.slice(0, 3), [allPastTournaments])
  const isTd = Number(profile?.tournamentsCreatedCount ?? 0) > 0 || hostedPastTournaments.length > 0
  const singlesNum = parseNumberish(profile?.duprRatingSingles)
  const doublesNum = parseNumberish(profile?.duprRatingDoubles)
  const singlesRatingLabel = singlesNum !== null ? singlesNum.toFixed(2) : '—'
  const doublesRatingLabel = doublesNum !== null ? doublesNum.toFixed(2) : '—'

  /** Свой профиль всегда через вкладку / стек `profile/index` (редактирование, DUPR Connect и т.д.). */
  if (isReady && token && user?.id && profileId && ownProfile) {
    return <Redirect href="/profile" />
  }

  if (profileQuery.isLoading) {
    return (
      <PageLayout topBarTitle="Profile">
        <View style={styles.loadingWrap}>
          <LoadingBlock label="Loading profile..." />
        </View>
      </PageLayout>
    )
  }
  if (!profile) {
    return (
      <PageLayout topBarTitle="Profile">
        <View style={styles.loadingWrap}>
          <EmptyState title="Profile unavailable" body="Could not load this player profile." />
        </View>
      </PageLayout>
    )
  }

  const locationLabel = formatLocation([profile.city])
  const genderLabel = formatGenderLabel(profile?.gender)
  const canMessage = Boolean(profileId && !ownProfile)

  return (
    <PageLayout
      topBarTitle="Profile"
      fixedUnderTopBar={
        <ProfileHeroCard
          displayName={profile?.name ?? 'Player'}
          genderLabel={genderLabel}
          imageUri={profile?.image}
          initialsLabel={profile?.name ?? 'Player'}
          locationLabel={locationLabel}
        />
      }
    >
      <View style={styles.headerCard}>
        {canMessage ? (
          <ActionButton
            label={openDirectChat.isPending ? 'Opening chat...' : 'Message'}
            icon={<Feather name="message-circle" size={16} color={colors.white} />}
            onPress={() => {
              if (!isAuthenticated) {
                router.push('/sign-in')
                return
              }
              void openDirectChat
                .mutateAsync({ otherUserId: profileId })
                .then((result) => {
                  router.push({
                    pathname: '/chats/direct/[threadId]',
                    params: {
                      threadId: result.threadId,
                      title: result.otherUser?.name ?? profile?.name ?? 'Chat',
                      userId: profileId,
                    },
                  })
                })
                .catch((error: any) => {
                  toast.error(error?.message || 'Failed to open chat')
                })
            }}
            loading={openDirectChat.isPending}
            disabled={openDirectChat.isPending}
          />
        ) : null}

        <ProfileStatsDuprSection
          clubsJoinedCount={profile?.clubsJoinedCount ?? 0}
          tournamentsPlayedCount={profile?.tournamentsPlayedCount ?? 0}
          tournamentsCreatedCount={profile?.tournamentsCreatedCount ?? 0}
          singlesRatingLabel={singlesRatingLabel}
          doublesRatingLabel={doublesRatingLabel}
          showDuprConnect={false}
        />

        {isTd ? (
          <SurfaceCard>
            <Text style={[styles.tdRatingTitle, { color: colors.text }]}>Tournament director rating</Text>
            <Pressable
              onPress={() => setTdFeedbackInfoOpen(true)}
              style={({ pressed }) => [styles.tdRatingRowBtn, pressed && styles.tdRatingRowPressed]}
            >
              <View style={styles.tdStarsRow}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <MaterialIcons
                    key={star}
                      name={tdCanPublish && tdAverage && star <= Math.round(tdAverage) ? 'star' : 'star-border'}
                    size={19}
                    color="#F4B000"
                  />
                ))}
              </View>
              {tdCanPublish && tdAverage ? (
                <Text style={[styles.tdRatingValue, { color: colors.text }]}>{tdAverage.toFixed(1)}</Text>
              ) : (
                <Text style={[styles.tdRatingMuted, { color: colors.textMuted }]}>New</Text>
              )}
            </Pressable>
            {achievements.length > 0 ? (
              <View style={styles.tdAchievementsWordsRow}>
                {achievements.map((item: { id: string; title: string }) => (
                  <View
                    key={item.id}
                    style={[
                      styles.tdAchievementWordChip,
                      { borderColor: colors.brandPrimaryBorder, backgroundColor: colors.chip },
                    ]}
                  >
                    <Text style={[styles.tdAchievementWordText, { color: colors.chipText }]}>{item.title}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {canRateTd ? (
              <Pressable
                onPress={() => setTdFeedbackOpen(true)}
                style={[styles.feedbackRateBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={[styles.feedbackRateBtnText, { color: colors.white }]}>Rate TD</Text>
              </Pressable>
            ) : null}
            {!ownProfile && hasRatedTdEffective ? (
              <Text style={[styles.feedbackThanksText, { color: colors.textMuted }]}>
                You already rated this tournament director.
              </Text>
            ) : null}
            {!isAuthenticated ? (
              <Pressable
                onPress={() => router.push('/sign-in')}
                style={[styles.feedbackInfoBtn, { borderColor: colors.border }]}
              >
                <Text style={[styles.feedbackInfoBtnText, { color: colors.text }]}>Sign in to rate</Text>
              </Pressable>
            ) : null}
          </SurfaceCard>
        ) : null}
      </View>

        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Past tournaments</Text>
            {allPastTournaments.length > 0 ? (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/profile/tournaments',
                    params: { profileId },
                  })
                }
                style={({ pressed }) => [styles.sectionActionBtn, pressed && styles.sectionActionBtnPressed]}
              >
                <Text style={[styles.sectionActionText, { color: colors.primary }]}>View all</Text>
              </Pressable>
            ) : null}
          </View>
          {previewPastTournaments.length === 0 ? (
            <SurfaceCard>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>No past tournaments yet.</Text>
            </SurfaceCard>
          ) : (
            previewPastTournaments.map((tournament) => (
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
                  statusLabel={tournament.user?.id === profileId ? 'Hosted' : 'Played'}
                  statusTone={tournament.user?.id === profileId ? 'primary' : 'success'}
                  onPress={() => router.push(`/tournaments/${tournament.id}`)}
                />
              </View>
            ))
          )}
        </View>

      <FeedbackRatingModal
        open={tdFeedbackOpen && canRateTd}
        onClose={() => setTdFeedbackOpen(false)}
        entityType="TD"
        entityId={profileId}
        title="Rate tournament director"
        subtitle="Your feedback helps improve tournament director quality."
        contextCard={
          <FeedbackEntityContextCard
            entityType="TD"
            name={profile?.name ?? 'Tournament director'}
            avatarUrl={profile?.image ?? null}
            tournamentLabel={
              hostedPastTournaments[0]
                ? `${hostedPastTournaments[0].title}${hostedPastTournaments[0].startDate ? ` (${formatDate(hostedPastTournaments[0].startDate)})` : ''}`
                : null
            }
          />
        }
        onSubmitted={() => {
          setTdRatedLocally(true)
          utils.feedback.hasRated.setData(
            { targets: [{ entityType: 'TD', entityId: profileId }] },
            (old: any) => ({
              map: {
                ...(old?.map ?? {}),
                [`TD:${profileId}`]: true,
              },
            }),
          )
          void Promise.all([
            tdSummaryQuery.refetch(),
            hasRatedQuery.refetch(),
            utils.feedback.getEntitySummary.invalidate({ entityType: 'TD', entityId: profileId }),
          ])
        }}
      />
      <AppBottomSheet
        open={tdFeedbackInfoOpen}
        onClose={() => setTdFeedbackInfoOpen(false)}
        title="Tournament director rating"
        subtitle={
          tdCanPublish && tdAverage ? '' : 'No public rating yet. At least 5 ratings are required.'
        }
      >
        {tdCanPublish && tdAverage ? (
          <View style={styles.modalStarsRow}>
            {[1, 2, 3, 4, 5].map((star) => {
              const active = star <= Math.round(tdAverage)
              return (
                <RatingStarIcon
                  key={star}
                  size={40}
                  filled={active}
                  color="#F2C94C"
                  inactiveColor={colors.textMuted}
                />
              )
            })}
            <Text style={[styles.modalRatingValueInline, { color: colors.text }]}>{tdAverage.toFixed(1)}</Text>
          </View>
        ) : null}
        <View style={styles.feedbackChipsWrap}>
          {(tdSummaryQuery.data?.topChips ?? []).length > 0 ? (
            tdSummaryQuery.data!.topChips.map((chip: { label: string; count: number }) => (
              <View
                key={chip.label}
                style={[
                  styles.feedbackChip,
                  { borderColor: colors.brandPrimaryBorder, backgroundColor: colors.chip },
                ]}
              >
                <Text style={[styles.feedbackChipText, { color: colors.chipText }]}>{chip.label}</Text>
              </View>
            ))
          ) : (
            <Text style={[styles.feedbackValueMuted, { color: colors.textMuted }]}>Not enough public data yet.</Text>
          )}
        </View>
      </AppBottomSheet>
    </PageLayout>
  )
}

const styles = StyleSheet.create({
  loadingWrap: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  headerCard: {
    gap: spacing.md,
  },
  tdRatingTitle: { fontSize: 16, fontWeight: '600' },
  tdRatingRowBtn: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'flex-start',
  },
  tdRatingRowPressed: {
    opacity: 0.85,
  },
  tdStarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  tdRatingValue: { fontSize: 16, fontWeight: '800' },
  tdRatingMuted: { fontSize: 16, fontWeight: '700' },
  feedbackLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  feedbackValue: { fontSize: 14, fontWeight: '700' },
  feedbackValueMuted: { fontSize: 16, fontWeight: '700' },
  feedbackCount: { fontSize: 13, fontWeight: '600' },
  feedbackInfoBtn: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  feedbackInfoBtnText: { fontSize: 12, fontWeight: '700' },
  feedbackRateBtn: {
    marginTop: spacing.md,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    alignItems: 'center',
  },
  feedbackRateBtnText: { fontSize: 14, fontWeight: '800' },
  feedbackThanksText: { marginTop: spacing.md, fontSize: 13, fontWeight: '600' },
  modalStarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: spacing.sm,
  },
  modalRatingValueInline: {
    marginLeft: 8,
    fontSize: 24,
    fontWeight: '800',
  },
  sectionBlock: { gap: spacing.md },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  sectionActionBtn: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  sectionActionBtnPressed: {
    opacity: 0.8,
  },
  sectionActionText: {
    fontSize: 14,
    fontWeight: '700',
  },
  emptyText: { fontSize: 13 },
  feedbackChipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: spacing.xs },
  feedbackChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  feedbackChipText: { fontSize: 13, fontWeight: '600' },
  tdAchievementsWordsRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tdAchievementWordChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tdAchievementWordText: {
    fontSize: 12,
    fontWeight: '700',
  },
  achievementBadgeWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingBottom: spacing.xs,
  },
  achievementBadgeItem: {
    width: 92,
    alignItems: 'center',
    gap: 6,
  },
  achievementBadgeCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#9CD9A3',
    backgroundColor: '#E8F7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  achievementBadgeText: {
    color: '#1E7A32',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
})
