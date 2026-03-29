import { Feather, MaterialIcons } from '@expo/vector-icons'
import { Redirect, useLocalSearchParams, router } from 'expo-router'
import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { AppBottomSheet } from '../../src/components/AppBottomSheet'
import { FeedbackEntityContextCard } from '../../src/components/FeedbackEntityContextCard'
import { FeedbackRatingModal } from '../../src/components/FeedbackRatingModal'
import { RatingStarIcon } from '../../src/components/icons/RatingStarIcon'
import { TournamentThumbnail } from '../../src/components/TournamentThumbnail'
import { PageLayout } from '../../src/components/navigation/PageLayout'
import { ProfileHeroCard, ProfileStatsDuprSection } from '../../src/components/profile/ProfileIdentityBlock'
import { EmptyState, LoadingBlock, SurfaceCard } from '../../src/components/ui'
import { FEEDBACK_API_ENABLED } from '../../src/lib/config'
import { formatDate, formatGenderLabel, formatLocation } from '../../src/lib/formatters'
import { palette, radius, spacing } from '../../src/lib/theme'
import { trpc } from '../../src/lib/trpc'
import { useAuth } from '../../src/providers/AuthProvider'

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
  const { isReady, token, user } = useAuth()
  const isAuthenticated = Boolean(token)
  const [tdFeedbackOpen, setTdFeedbackOpen] = useState(false)
  const [tdFeedbackInfoOpen, setTdFeedbackInfoOpen] = useState(false)

  const profileQuery = trpc.user.getProfileById.useQuery(
    { id: profileId },
    { enabled: Boolean(profileId) },
  )
  const tdSummaryQuery = trpc.feedback.getEntitySummary.useQuery(
    { entityType: 'TD', entityId: profileId },
    { enabled: FEEDBACK_API_ENABLED && Boolean(profileId) && isAuthenticated, retry: false },
  )
  const hasRatedQuery = trpc.feedback.hasRated.useQuery(
    { targets: [{ entityType: 'TD', entityId: profileId }] },
    { enabled: FEEDBACK_API_ENABLED && Boolean(profileId) && isAuthenticated, retry: false },
  )
  const hasRatedTd = Boolean(hasRatedQuery.data?.map?.[`TD:${profileId}`])
  const ownProfile = Boolean(user?.id && user.id === profileId)
  const tournamentsQuery = (trpc as any).public.listBoards.useQuery(undefined, {
    enabled: Boolean(profileId),
  })

  const tdFallbackSeed = useMemo(
    () =>
      profileId
        .split('')
        .reduce((acc, ch) => acc + ch.charCodeAt(0), 0),
    [profileId],
  )
  const tdAverage = tdSummaryQuery.data?.averageRating
  const tdTotal = tdSummaryQuery.data?.total ?? 0
  const tdCanPublish = Boolean(tdSummaryQuery.data?.canPublish)
  const tdAverageEffective = tdAverage ?? (__DEV__ ? Number((4 + (tdFallbackSeed % 9) / 20).toFixed(1)) : null)
  const tdTotalEffective = tdTotal > 0 ? tdTotal : __DEV__ ? 5 + (tdFallbackSeed % 17) : 0
  const tdCanPublishEffective = tdCanPublish || (__DEV__ && tdTotalEffective >= 5)
  const achievements =
    tdSummaryQuery.data?.achievements?.length || !__DEV__
      ? tdSummaryQuery.data?.achievements ?? []
      : [
          { id: 'dev-td-1', title: 'Fast Resolver' },
          { id: 'dev-td-2', title: 'Clear Communicator' },
          { id: 'dev-td-3', title: 'Conflict Solver' },
        ]
  const profile = profileQuery.data as any
  const createdTournaments = useMemo(() => {
    const rows = ((tournamentsQuery.data ?? []) as any[]).filter((t) => t.user?.id === profileId)
    return rows
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
      .slice(0, 6)
  }, [profileId, tournamentsQuery.data])
  const isTd = Number(profile?.tournamentsCreatedCount ?? 0) > 0 || createdTournaments.length > 0
  const singlesNum = parseNumberish(profile?.duprRatingSingles)
  const doublesNum = parseNumberish(profile?.duprRatingDoubles)
  const singlesRatingLabel = singlesNum !== null ? singlesNum.toFixed(2) : '—'
  const doublesRatingLabel = doublesNum !== null ? doublesNum.toFixed(2) : '—'

  /** Свой профиль всегда через вкладку / стек `profile/index` (редактирование, DUPR Connect и т.д.). */
  if (isReady && token && user?.id && profileId && user.id === profileId) {
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
            <Text style={styles.tdRatingTitle}>Tournament director rating</Text>
            <Pressable
              onPress={() => setTdFeedbackInfoOpen(true)}
              style={({ pressed }) => [styles.tdRatingRowBtn, pressed && styles.tdRatingRowPressed]}
            >
              <View style={styles.tdStarsRow}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <MaterialIcons
                    key={star}
                    name={tdCanPublishEffective && tdAverageEffective && star <= Math.round(tdAverageEffective) ? 'star' : 'star-border'}
                    size={19}
                    color="#F4B000"
                  />
                ))}
              </View>
              {tdCanPublishEffective && tdAverageEffective ? (
                <Text style={styles.tdRatingValue}>{tdAverageEffective.toFixed(1)}</Text>
              ) : (
                <Text style={styles.tdRatingMuted}>No rating yet</Text>
              )}
            </Pressable>
            {achievements.length > 0 ? (
              <View style={styles.tdAchievementsWordsRow}>
                {achievements.map((item: { id: string; title: string }) => (
                  <View key={item.id} style={styles.tdAchievementWordChip}>
                    <Text style={styles.tdAchievementWordText}>{item.title}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {!ownProfile && isAuthenticated && !hasRatedTd ? (
              <Pressable onPress={() => setTdFeedbackOpen(true)} style={styles.feedbackRateBtn}>
                <Text style={styles.feedbackRateBtnText}>Rate TD</Text>
              </Pressable>
            ) : null}
            {!ownProfile && hasRatedTd ? <Text style={styles.feedbackThanksText}>You already rated this tournament director.</Text> : null}
            {!isAuthenticated ? (
              <Pressable onPress={() => router.push('/sign-in')} style={styles.feedbackInfoBtn}>
                <Text style={styles.feedbackInfoBtnText}>Sign in to rate</Text>
              </Pressable>
            ) : null}
          </SurfaceCard>
        ) : null}
      </View>

        <View style={styles.sectionBlock}>
          <Text style={styles.sectionTitle}>Hosted tournaments</Text>
          {createdTournaments.length === 0 ? (
            <SurfaceCard>
              <Text style={styles.emptyText}>No hosted tournaments yet.</Text>
            </SurfaceCard>
          ) : (
            createdTournaments.map((tournament) => (
              <Pressable
                key={tournament.id}
                onPress={() => router.push(`/tournaments/${tournament.id}`)}
                style={({ pressed }) => [pressed && styles.cardPressed]}
              >
                <SurfaceCard style={styles.tournamentCard}>
                  <View style={styles.tournamentCardRow}>
                    <TournamentThumbnail imageUri={(tournament as any).image ?? null} size={48} />
                    <View style={styles.tournamentCardMain}>
                      <Text style={styles.tournamentTitle} numberOfLines={1}>{tournament.title}</Text>
                      <View style={styles.tournamentMetaRow}>
                        <Feather name="calendar" size={14} color={palette.textMuted} />
                        <Text style={styles.tournamentMetaText}>{formatDate(tournament.startDate)}</Text>
                      </View>
                    </View>
                  </View>
                </SurfaceCard>
              </Pressable>
            ))
          )}
        </View>

      <FeedbackRatingModal
        open={tdFeedbackOpen}
        onClose={() => setTdFeedbackOpen(false)}
        entityType="TD"
        entityId={profileId}
        title="Rate tournament director"
        subtitle="Your feedback helps improve director quality."
        contextCard={
          <FeedbackEntityContextCard
            entityType="TD"
            name={profile?.name ?? 'Tournament director'}
            avatarUrl={profile?.image ?? null}
            tournamentLabel={
              createdTournaments[0]
                ? `${createdTournaments[0].title}${createdTournaments[0].startDate ? ` (${formatDate(createdTournaments[0].startDate)})` : ''}`
                : null
            }
          />
        }
        onSubmitted={() => {
          void Promise.all([tdSummaryQuery.refetch(), hasRatedQuery.refetch()])
        }}
      />
      <AppBottomSheet
        open={tdFeedbackInfoOpen}
        onClose={() => setTdFeedbackInfoOpen(false)}
        title="Tournament director rating"
        subtitle={
          tdCanPublishEffective && tdAverageEffective ? '' : 'No public rating yet. Need at least 5 ratings.'
        }
      >
        {tdCanPublishEffective && tdAverageEffective ? (
          <View style={styles.modalStarsRow}>
            {[1, 2, 3, 4, 5].map((star) => {
              const active = star <= Math.round(tdAverageEffective)
              return (
                <RatingStarIcon key={star} size={40} filled={active} color="#F2C94C" inactiveColor="#C7C7CC" />
              )
            })}
            <Text style={styles.modalRatingValueInline}>{tdAverageEffective.toFixed(1)}</Text>
          </View>
        ) : null}
        <View style={styles.feedbackChipsWrap}>
          {(tdSummaryQuery.data?.topChips ?? []).length > 0 || __DEV__ ? (
            (tdSummaryQuery.data?.topChips?.length
              ? tdSummaryQuery.data.topChips
              : [
                  { label: 'Clear communication', count: 10 },
                  { label: 'Fair decisions', count: 8 },
                  { label: 'On-time schedule', count: 7 },
                ]
            ).map((chip: { label: string; count: number }) => (
              <View key={chip.label} style={styles.feedbackChip}>
                <Text style={styles.feedbackChipText}>{chip.label}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.feedbackValueMuted}>Not enough public data yet.</Text>
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
  tdRatingTitle: { color: palette.text, fontSize: 16, fontWeight: '600' },
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
  tdRatingValue: { color: palette.text, fontSize: 16, fontWeight: '800' },
  tdRatingMuted: { color: palette.textMuted, fontSize: 16, fontWeight: '700' },
  feedbackLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  feedbackValue: { color: palette.text, fontSize: 14, fontWeight: '700' },
  feedbackValueMuted: { color: palette.textMuted, fontSize: 16, fontWeight: '700' },
  feedbackCount: { color: palette.textMuted, fontSize: 13, fontWeight: '600' },
  feedbackInfoBtn: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  feedbackInfoBtnText: { color: palette.text, fontSize: 12, fontWeight: '700' },
  feedbackRateBtn: {
    marginTop: spacing.md,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: palette.primary,
  },
  feedbackRateBtnText: { color: palette.white, fontSize: 14, fontWeight: '800' },
  feedbackThanksText: { marginTop: spacing.md, color: palette.textMuted, fontSize: 13, fontWeight: '600' },
  modalStarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: spacing.sm,
  },
  modalRatingValueInline: {
    marginLeft: 8,
    color: palette.text,
    fontSize: 24,
    fontWeight: '800',
  },
  sectionBlock: { gap: spacing.sm },
  sectionTitle: { color: palette.text, fontSize: 16, fontWeight: '600' },
  emptyText: { color: palette.textMuted, fontSize: 13 },
  tournamentCard: { gap: 8 },
  tournamentCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  tournamentCardMain: {
    flex: 1,
    minWidth: 0,
  },
  tournamentTitle: { color: palette.text, fontSize: 15, fontWeight: '700' },
  tournamentMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tournamentMetaText: { color: palette.textMuted, fontSize: 13 },
  cardPressed: { opacity: 0.9 },
  feedbackChipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: spacing.xs },
  feedbackChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#9CD9A3',
    backgroundColor: '#E8F7EB',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  feedbackChipText: { color: '#1E7A32', fontSize: 13, fontWeight: '600' },
  tdAchievementsWordsRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tdAchievementWordChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#9CD9A3',
    backgroundColor: '#E8F7EB',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tdAchievementWordText: {
    color: '#1E7A32',
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
