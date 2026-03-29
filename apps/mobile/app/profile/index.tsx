import { Feather, MaterialIcons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useMemo, useState } from 'react'
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { WebView } from 'react-native-webview'

import { AppBottomSheet, AppInfoFooter } from '../../src/components/AppBottomSheet'
import { ProfileHeroCard, ProfileStatsDuprSection } from '../../src/components/profile/ProfileIdentityBlock'
import { PageLayout } from '../../src/components/navigation/PageLayout'
import { TournamentCard } from '../../src/components/TournamentCard'
import { RatingStarIcon } from '../../src/components/icons/RatingStarIcon'
import { ActionButton, EmptyState, LoadingBlock, SurfaceCard } from '../../src/components/ui'
import { formatGenderLabel, formatLocation } from '../../src/lib/formatters'
import { DUPR_CLIENT_KEY, FEEDBACK_API_ENABLED } from '../../src/lib/config'
import { palette, radius, spacing } from '../../src/lib/theme'
import { trpc } from '../../src/lib/trpc'
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

const toBase64 = (value: string) => {
  try {
    // @ts-ignore - btoa exists in many JS runtimes
    if (typeof btoa === 'function') return btoa(value)
  } catch {}

  // Fallback base64 encoder for ASCII-ish keys.
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let out = ''
  let i = 0
  while (i < value.length) {
    const c1 = value.charCodeAt(i++) & 0xff
    const c2 = i < value.length ? value.charCodeAt(i++) & 0xff : NaN
    const c3 = i < value.length ? value.charCodeAt(i++) & 0xff : NaN

    out += chars[c1 >> 2]
    out += chars[((c1 & 3) << 4) | (Number.isNaN(c2) ? 0 : (c2 as number) >> 4)]
    out += Number.isNaN(c2) ? '=' : chars[(((c2 as number) & 15) << 2) | (Number.isNaN(c3) ? 0 : (c3 as number) >> 6)]
    out += Number.isNaN(c3) ? '=' : chars[(c3 as number) & 63]
  }
  return out
}

const statusMeta = (status?: string | null, hasPrivilegedAccess = false) => {
  if (hasPrivilegedAccess) {
    return { label: 'Admin', backgroundColor: 'rgba(40, 205, 65, 0.12)', textColor: palette.primary }
  }

  if (status === 'waitlisted') {
    return { label: 'Waitlist', backgroundColor: 'rgba(255, 214, 10, 0.14)', textColor: '#8a6b00' }
  }

  if (status === 'active') {
    return { label: 'Registered', backgroundColor: 'rgba(40, 205, 65, 0.12)', textColor: palette.primary }
  }

  return { label: 'Open', backgroundColor: palette.surfaceMuted, textColor: palette.text }
}

const statusTone = (statusLabel: string): 'muted' | 'primary' | 'danger' | 'success' | 'warning' => {
  if (statusLabel === 'Admin') return 'primary'
  if (statusLabel === 'Registered') return 'success'
  if (statusLabel === 'Waitlist') return 'warning'
  return 'muted'
}

function ProfileTopBarActions() {
  const { colors } = useAppTheme()
  return (
    <View style={styles.profileTopBarActions}>
      <Pressable
        onPress={() => router.push('/profile/edit')}
        accessibilityRole="button"
        accessibilityLabel="Edit profile"
        style={({ pressed }) => [
          styles.profileTopBarIconBtn,
          { backgroundColor: colors.surface, borderColor: colors.border },
          pressed && { opacity: 0.88, backgroundColor: colors.surfaceMuted },
        ]}
      >
        <Feather name="edit-2" size={18} color={colors.text} />
      </Pressable>
      <Pressable
        onPress={() => router.push('/profile/settings')}
        accessibilityRole="button"
        accessibilityLabel="Settings"
        style={({ pressed }) => [
          styles.profileTopBarIconBtn,
          { backgroundColor: colors.surface, borderColor: colors.border },
          pressed && { opacity: 0.88, backgroundColor: colors.surfaceMuted },
        ]}
      >
        <Feather name="settings" size={18} color={colors.text} />
      </Pressable>
    </View>
  )
}

export default function ProfileTab() {
  const { token, user } = useAuth()
  const toast = useToast()
  const isAuthenticated = Boolean(token)
  const api = trpc as any
  const utils = trpc.useUtils() as any
  const [showDuprConnect, setShowDuprConnect] = useState(false)
  const [duprWebLoading, setDuprWebLoading] = useState(true)
  const [tdFeedbackInfoOpen, setTdFeedbackInfoOpen] = useState(false)
  const linkDupr = api.user.linkDupr.useMutation({
    onSuccess: async () => {
      await utils.user.getProfile.invalidate()
      setShowDuprConnect(false)
      toast.success('Your DUPR account is now linked.', 'DUPR connected')
    },
    onError: (err: any) => {
      setShowDuprConnect(false)
      toast.error(err?.message || 'Unable to connect DUPR right now.', 'DUPR connect failed')
    },
  })

  const startDuprConnect = () => {
    if (!DUPR_CLIENT_KEY) {
      toast.error(
        'Missing DUPR_CLIENT_KEY (or EXPO_PUBLIC_DUPR_CLIENT_KEY) in the mobile app environment. Add it and rebuild the app.',
        'DUPR not configured',
      )
      return
    }
    setDuprWebLoading(true)
    setShowDuprConnect(true)
  }

  const duprLoginUrl = useMemo(() => {
    if (!DUPR_CLIENT_KEY) return null
    const base64 = toBase64(DUPR_CLIENT_KEY)
    return `https://dashboard.dupr.com/login-external-app/${base64}`
  }, [DUPR_CLIENT_KEY])

  /** Регистрируем до контента — postMessage от DUPR не должен теряться. */
  const duprBridgeJs = `
    (function () {
      try {
        function forward(event) {
          try {
            var raw = event && event.data !== undefined ? event.data : event;
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                origin: event && event.origin ? event.origin : null,
                data: raw
              }));
            }
          } catch (e) {}
        }
        window.addEventListener('message', forward);
      } catch (e) {}
      true;
    })();
  `

  const duprWebUserAgent =
    Platform.OS === 'ios'
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      : 'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'

  const profileQuery = api.user.getProfile.useQuery(undefined, { enabled: isAuthenticated })
  const tdSummaryQuery = api.feedback.getEntitySummary.useQuery(
    { entityType: 'TD', entityId: user?.id ?? '' },
    { enabled: FEEDBACK_API_ENABLED && isAuthenticated && Boolean(user?.id), retry: false },
  )
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

  const profile = profileQuery.data as any
  const statuses = (registrationStatusesQuery.data ?? {}) as Record<string, { status?: string }>

  const recentTournaments = useMemo(() => {
    const items = (tournamentsQuery.data ?? []) as any[]
    return items
      .filter((item) => {
        const status = statuses[item.id]?.status
        const isHostedByMe = Boolean(user?.id && item.user?.id === user.id)
        return status === 'active' || status === 'waitlisted' || isHostedByMe
      })
      .sort((left, right) => new Date(right.startDate).getTime() - new Date(left.startDate).getTime())
      .slice(0, 3)
      .map((item) => ({ ...item, myStatus: statuses[item.id]?.status }))
  }, [statuses, tournamentsQuery.data, user?.id])
  const hostedByMeCount = useMemo(() => {
    const items = (tournamentsQuery.data ?? []) as any[]
    return items.filter((item) => Boolean(user?.id && item.user?.id === user.id)).length
  }, [tournamentsQuery.data, user?.id])

  if (!isAuthenticated) {
    return (
      <PageLayout topBarTitle="Profile">
        <SurfaceCard tone="hero" style={styles.guestCard}>
          <View style={styles.guestIconWrap}>
            <Feather name="user" size={22} color={palette.primary} />
          </View>
          <Text style={styles.guestTitle}>You are browsing as a guest</Text>
          <Text style={styles.guestBody}>
            Sign in to unlock your profile, connected DUPR stats, account settings, and tournament activity.
          </Text>
          <ActionButton label="Sign in" onPress={() => router.push('/sign-in')} />
        </SurfaceCard>
      </PageLayout>
    )
  }

  const isActivityLoading =
    tournamentsQuery.isLoading ||
    (isAuthenticated && tournamentIds.length > 0 && registrationStatusesQuery.isLoading)

  if (profileQuery.isLoading) {
    return (
      <PageLayout topBarTitle="Profile" topBarRightSlot={<ProfileTopBarActions />}>
        <View style={styles.loadingWrap}>
          <LoadingBlock label="Loading profile…" />
        </View>
      </PageLayout>
    )
  }

  if (!profile) {
    return (
      <PageLayout topBarTitle="Profile" topBarRightSlot={<ProfileTopBarActions />}>
        <View style={styles.loadingWrap}>
          <EmptyState title="Profile unavailable" body="We could not load your player profile right now." />
        </View>
      </PageLayout>
    )
  }

  const singlesNum = parseNumberish(profile.duprRatingSingles)
  const doublesNum = parseNumberish(profile.duprRatingDoubles)
  const singlesRatingLabel = singlesNum !== null ? singlesNum.toFixed(2) : '—'
  const doublesRatingLabel = doublesNum !== null ? doublesNum.toFixed(2) : '—'
  const hostedCount = Number(profile?.tournamentsCreatedCount ?? 0)
  const hostedCountEffective = Math.max(hostedCount, hostedByMeCount)
  const isTd = hostedCountEffective > 0
  const tdAverage = tdSummaryQuery.data?.averageRating
  const tdTotal = tdSummaryQuery.data?.total ?? 0
  const tdCanPublish = Boolean(tdSummaryQuery.data?.canPublish)
  const tdFallbackSeed = String(user?.id ?? '')
    .split('')
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  const tdAverageEffective = tdAverage ?? (__DEV__ && isTd ? Number((4 + (tdFallbackSeed % 9) / 20).toFixed(1)) : null)
  const tdTotalEffective = tdTotal > 0 ? tdTotal : __DEV__ && isTd ? 5 + (tdFallbackSeed % 17) : 0
  const tdCanPublishEffective = tdCanPublish || (__DEV__ && tdTotalEffective >= 5)
  const tdAchievements =
    tdSummaryQuery.data?.achievements?.length || !__DEV__
      ? tdSummaryQuery.data?.achievements ?? []
      : isTd
      ? [
          { id: 'dev-td-1', title: 'Fast Resolver' },
          { id: 'dev-td-2', title: 'Clear Communicator' },
          { id: 'dev-td-3', title: 'Conflict Solver' },
        ]
      : []
  const locationLabel = formatLocation([profile.city])
  const genderLabel = formatGenderLabel(profile.gender)

  return (
    <PageLayout
      topBarTitle="Profile"
      topBarRightSlot={<ProfileTopBarActions />}
      fixedUnderTopBar={
        <ProfileHeroCard
          displayName={profile.name || profile.email}
          genderLabel={genderLabel}
          imageUri={profile.image}
          initialsLabel={profile.name || profile.email}
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
          showDuprConnect={!profile.duprLinked}
          onDuprConnect={startDuprConnect}
          duprConnectPending={linkDupr.isPending}
        />

            {isTd ? (
              <SurfaceCard>
                <Text style={styles.tdRatingTitle}>Tournament director rating</Text>
                <Pressable
                  onPress={() => setTdFeedbackInfoOpen(true)}
                  style={({ pressed }) => [styles.tdRatingRowBtn, pressed && styles.profileActionButtonPressed]}
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
                {tdAchievements.length > 0 ? (
                  <View style={styles.tdAchievementsWordsRow}>
                    {tdAchievements.map((item: { id: string; title: string }) => (
                      <View key={item.id} style={styles.tdAchievementWordChip}>
                        <Text style={styles.tdAchievementWordText}>{item.title}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </SurfaceCard>
            ) : null}
      </View>

          <AppBottomSheet
            open={showDuprConnect}
            onClose={() => setShowDuprConnect(false)}
            title="Connect DUPR"
            subtitle="Sign in to DUPR below. When login completes, we link your account automatically."
            footer={<AppInfoFooter label="Close" onPress={() => setShowDuprConnect(false)} />}
          >
            {duprLoginUrl ? (
              <View style={styles.duprWebWrap}>
                <WebView
                  style={styles.duprWebView}
                  source={{ uri: duprLoginUrl }}
                  originWhitelist={['*']}
                  userAgent={duprWebUserAgent}
                  javaScriptEnabled
                  domStorageEnabled
                  sharedCookiesEnabled
                  thirdPartyCookiesEnabled
                  cacheEnabled
                  allowsInlineMediaPlayback
                  mediaPlaybackRequiresUserAction={false}
                  mixedContentMode="compatibility"
                  setSupportMultipleWindows={true}
                  javaScriptCanOpenWindowsAutomatically={true}
                  injectedJavaScriptBeforeContentLoaded={duprBridgeJs}
                  onLoadStart={() => setDuprWebLoading(true)}
                  onLoadEnd={() => setDuprWebLoading(false)}
                  onError={(e) => {
                    setDuprWebLoading(false)
                    const desc = e.nativeEvent.description
                    if (__DEV__) console.warn('[DUPR WebView]', desc)
                    toast.error(desc || 'Could not load DUPR page.', 'DUPR')
                  }}
                  onHttpError={(e) => {
                    if (__DEV__) console.warn('[DUPR WebView HTTP]', e.nativeEvent.statusCode, e.nativeEvent.url)
                  }}
                  onMessage={(event) => {
                    try {
                      const payload = JSON.parse(event.nativeEvent.data) as { data?: unknown }
                      let data = payload?.data as Record<string, unknown> | string | undefined
                      if (typeof data === 'string') {
                        try {
                          data = JSON.parse(data) as Record<string, unknown>
                        } catch {
                          return
                        }
                      }
                      if (!data || typeof data !== 'object') return
                      const d = data as Record<string, unknown>
                      const numericId = d.id ?? d.userId
                      const duprId = d.duprId ?? d.dupr_id
                      const accessToken = d.userToken ?? d.accessToken ?? d.access_token
                      const refreshToken = d.refreshToken ?? d.refresh_token
                      const stats = d.stats ?? {
                        rating: d.rating,
                        singlesRating: d.singlesRating ?? d.singles_rating,
                        doublesRating: d.doublesRating ?? d.doubles_rating,
                        name: d.name,
                      }

                      if ((duprId || numericId) && accessToken && refreshToken) {
                        linkDupr.mutate({
                          duprId: duprId != null ? String(duprId) : undefined,
                          numericId: numericId != null ? Number(numericId) : undefined,
                          accessToken: String(accessToken),
                          refreshToken: String(refreshToken),
                          stats,
                        })
                      }
                    } catch {
                      /* ignore malformed bridge messages */
                    }
                  }}
                />
                {duprWebLoading ? (
                  <View style={styles.duprWebLoading}>
                    <ActivityIndicator size="large" color={palette.primary} />
                    <Text style={styles.duprWebLoadingText}>Loading DUPR…</Text>
                  </View>
                ) : null}
              </View>
            ) : (
              <View style={{ paddingVertical: spacing.md }}>
                <Text style={{ color: palette.textMuted }}>DUPR client key is missing.</Text>
              </View>
            )}
          </AppBottomSheet>

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
              {(tdSummaryQuery.data?.topChips ?? []).length > 0 || (__DEV__ && isTd) ? (
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
                <Text style={styles.emptyCardBody}>Not enough public data yet.</Text>
              )}
            </View>
          </AppBottomSheet>

          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>Recent Tournaments</Text>

            {isActivityLoading ? <LoadingBlock label="Loading activity…" /> : null}

            {!isActivityLoading && recentTournaments.length === 0 ? (
              <SurfaceCard style={styles.emptyCard}>
                <Text style={styles.emptyCardTitle}>No tournaments yet</Text>
                <Text style={styles.emptyCardBody}>
                  Once you register for an event, it will show up here with status and date.
                </Text>
              </SurfaceCard>
            ) : null}

            {recentTournaments.map((tournament) => {
              const isOwner = Boolean(user?.id && tournament.user?.id === user.id)
              const hasPrivilegedAccess = Boolean(isOwner || accessibleTournamentIds.has(tournament.id))
              const status = statusMeta(tournament.myStatus, hasPrivilegedAccess)

              return (
                <View
                  key={tournament.id}
                >
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
                    statusLabel={status.label}
                    statusTone={statusTone(status.label)}
                    onPress={() => router.push(`/tournaments/${tournament.id}`)}
                  />
                </View>
              )
            })}
          </View>

      <View style={styles.footerSpace} />
    </PageLayout>
  )
}

const styles = StyleSheet.create({
  loadingWrap: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
  },
  guestCard: {
    gap: spacing.md,
  },
  guestIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.brandPrimaryTint,
  },
  guestTitle: {
    color: palette.text,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  guestBody: {
    color: palette.textMuted,
    lineHeight: 21,
  },
  headerCard: {
    gap: spacing.md,
  },
  profileTopBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  profileTopBarIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  tdRatingTitle: { color: palette.text, fontSize: 16, fontWeight: '600' },
  tdRatingRowBtn: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'flex-start',
  },
  tdStarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  tdRatingValue: { color: palette.text, fontSize: 16, fontWeight: '800' },
  tdRatingMuted: { color: palette.textMuted, fontSize: 16, fontWeight: '700' },
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
  sectionBlock: {
    gap: spacing.md,
  },
  sectionTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '700',
  },
  emptyCard: {
    gap: 8,
  },
  emptyCardTitle: {
    color: palette.text,
    fontSize: 17,
    fontWeight: '700',
  },
  emptyCardBody: {
    color: palette.textMuted,
    lineHeight: 21,
  },
  activityCard: {
    gap: 10,
  },
  activityTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  activityMain: {
    flex: 1,
    minWidth: 0,
  },
  activityTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '700',
  },
  activitySubtitle: {
    marginTop: 4,
    color: palette.textMuted,
    fontSize: 13,
  },
  activityStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  activityStatusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  activityMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activityMetaText: {
    color: palette.textMuted,
    fontSize: 13,
  },
  cardPressed: {
    opacity: 0.92,
  },
  duprWebWrap: {
    height: 420,
    position: 'relative',
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: palette.surfaceMuted,
  },
  duprWebView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  duprWebLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surface,
    gap: 10,
  },
  duprWebLoadingText: {
    color: palette.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  footerSpace: {
    height: 16,
  },
})



