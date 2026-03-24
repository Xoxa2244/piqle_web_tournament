import { Feather, MaterialIcons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'

import { AppBottomSheet, AppInfoFooter } from '../../src/components/AppBottomSheet'
import { OptionalLinearGradient } from '../../src/components/OptionalLinearGradient'
import { RemoteUserAvatar } from '../../src/components/RemoteUserAvatar'
import { ActionButton, EmptyState, LoadingBlock, SurfaceCard } from '../../src/components/ui'
import { formatDate, formatLocation } from '../../src/lib/formatters'
import { DUPR_CLIENT_KEY, FEEDBACK_API_ENABLED } from '../../src/lib/config'
import { radius, spacing, type ThemePalette } from '../../src/lib/theme'
import { trpc } from '../../src/lib/trpc'
import { useAuth } from '../../src/providers/AuthProvider'
import { useAppTheme } from '../../src/providers/ThemeProvider'

const memberSinceFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
})

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

const statusMeta = (status: string | null | undefined, hasPrivilegedAccess: boolean, colors: ThemePalette) => {
  if (hasPrivilegedAccess) {
    return { label: 'Admin', backgroundColor: colors.brandPrimaryTint, textColor: colors.primary }
  }

  if (status === 'waitlisted') {
    return { label: 'Waitlist', backgroundColor: 'rgba(255, 214, 10, 0.14)', textColor: '#8a6b00' }
  }

  if (status === 'active') {
    return { label: 'Registered', backgroundColor: colors.brandPrimaryTint, textColor: colors.primary }
  }

  return { label: 'Open', backgroundColor: colors.surfaceMuted, textColor: colors.text }
}

const ProfileAvatar = ({
  label,
  image,
  onCameraPress,
  colors,
  styles,
}: {
  label: string
  image?: string | null
  onCameraPress?: () => void
  colors: ThemePalette
  styles: ReturnType<typeof createStyles>
}) => {
  const size = 96

  return (
    <View style={styles.avatarWrap}>
      <RemoteUserAvatar uri={image} size={size} fallback="initials" initialsLabel={label} />

      <Pressable onPress={onCameraPress} style={({ pressed }) => [styles.cameraButton, pressed && styles.cameraButtonPressed]}>
        <Feather name="camera" size={14} color={colors.white} />
      </Pressable>
    </View>
  )
}

const ProfileActionButton = ({
  label,
  icon,
  onPress,
  variant = 'outline',
  colors,
  styles,
}: {
  label: string
  icon?: keyof typeof Feather.glyphMap
  onPress?: () => void
  variant?: 'outline' | 'ghost'
  colors: ThemePalette
  styles: ReturnType<typeof createStyles>
}) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [
      styles.profileActionButton,
      variant === 'outline' ? styles.profileActionButtonOutline : styles.profileActionButtonGhost,
      pressed && styles.profileActionButtonPressed,
    ]}
  >
    {icon ? <Feather name={icon} size={16} color={colors.text} /> : null}
    <Text style={styles.profileActionLabel}>{label}</Text>
  </Pressable>
)

export default function ProfileTab() {
  const { token, user } = useAuth()
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const isAuthenticated = Boolean(token)
  const api = trpc as any
  const utils = trpc.useUtils() as any
  const [showDuprConnect, setShowDuprConnect] = useState(false)
  const [duprInfoMessage, setDuprInfoMessage] = useState<{ title: string; body: string } | null>(null)
  const [tdFeedbackInfoOpen, setTdFeedbackInfoOpen] = useState(false)
  const linkDupr = api.user.linkDupr.useMutation({
    onSuccess: async () => {
      await utils.user.getProfile.invalidate()
      setShowDuprConnect(false)
      setDuprInfoMessage({ title: 'DUPR connected', body: 'Your DUPR account is now linked.' })
    },
    onError: (err: any) => {
      setShowDuprConnect(false)
      setDuprInfoMessage({
        title: 'DUPR connect failed',
        body: err?.message || 'Unable to connect DUPR right now.',
      })
    },
  })

  const startDuprConnect = () => {
    if (!DUPR_CLIENT_KEY) {
      setDuprInfoMessage({
        title: 'DUPR not configured',
        body:
          'Missing DUPR_CLIENT_KEY (or EXPO_PUBLIC_DUPR_CLIENT_KEY) in the mobile app environment. Add it and rebuild the app.',
      })
      return
    }
    setShowDuprConnect(true)
  }

  const duprLoginUrl = useMemo(() => {
    if (!DUPR_CLIENT_KEY) return null
    const base64 = toBase64(DUPR_CLIENT_KEY)
    return `https://dashboard.dupr.com/login-external-app/${base64}`
  }, [DUPR_CLIENT_KEY])

  const duprBridgeJs = `
    (function () {
      try {
        window.addEventListener('message', function (event) {
          try {
            var data = event && event.data ? event.data : event;
            window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
              origin: event && event.origin ? event.origin : null,
              data: data
            }));
          } catch (e) {}
        });
      } catch (e) {}
      true;
    })();
  `

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
      <SafeAreaView style={styles.screen} edges={['top']}>
        <OptionalLinearGradient colors={[colors.background, colors.surfaceElevated]} style={styles.fill}>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <SurfaceCard tone="hero" style={styles.guestCard}>
              <View style={styles.guestIconWrap}>
                <Feather name="user" size={22} color={colors.primary} />
              </View>
              <Text style={styles.guestTitle}>You are browsing as a guest</Text>
              <Text style={styles.guestBody}>
                Sign in to unlock your profile, connected DUPR stats, account settings, and tournament activity.
              </Text>
              <ActionButton label="Sign in" onPress={() => router.push('/sign-in')} />
            </SurfaceCard>
          </ScrollView>
        </OptionalLinearGradient>
      </SafeAreaView>
    )
  }

  const isActivityLoading =
    tournamentsQuery.isLoading ||
    (isAuthenticated && tournamentIds.length > 0 && registrationStatusesQuery.isLoading)

  if (profileQuery.isLoading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <OptionalLinearGradient colors={[colors.background, colors.surfaceElevated]} style={styles.fill}>
          <View style={styles.loadingWrap}>
            <LoadingBlock label="Loading profile…" />
          </View>
        </OptionalLinearGradient>
      </SafeAreaView>
    )
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <OptionalLinearGradient colors={[colors.background, colors.surfaceElevated]} style={styles.fill}>
          <View style={styles.loadingWrap}>
            <EmptyState title="Profile unavailable" body="We could not load your player profile right now." />
          </View>
        </OptionalLinearGradient>
      </SafeAreaView>
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
  const handleLabel = `@${String(profile.email || '').split('@')[0] || 'piqle'}`
  const memberSinceLabel = profile.createdAt ? memberSinceFormatter.format(new Date(profile.createdAt)) : 'Recently'
  const locationLabel = formatLocation([profile.city])

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <OptionalLinearGradient colors={[colors.background, colors.surfaceElevated]} style={styles.fill}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.headerCard}>
            <View style={styles.headerTopRow}>
              <ProfileAvatar
                label={profile.name || profile.email}
                image={profile.image}
                onCameraPress={() => router.push('/profile/edit')}
                colors={colors}
                styles={styles}
              />

              <View style={styles.headerActions}>
                <ProfileActionButton label="Edit Profile" onPress={() => router.push('/profile/edit')} colors={colors} styles={styles} />
                <ProfileActionButton
                  label="Settings"
                  icon="settings"
                  variant="ghost"
                  onPress={() => router.push('/profile/settings')}
                  colors={colors}
                  styles={styles}
                />
              </View>
            </View>

            <View style={styles.userInfoBlock}>
              <Text style={styles.userName}>{profile.name || profile.email}</Text>
              <Text style={styles.userHandle}>{handleLabel}</Text>

              <View style={styles.userMetaRow}>
                <Text style={styles.userMetaText}>{`📍 ${locationLabel}`}</Text>
                <Text style={styles.userMetaSeparator}>•</Text>
                <Text style={styles.userMetaText}>{`Member since ${memberSinceLabel}`}</Text>
              </View>
            </View>

            <SurfaceCard>
              <View style={styles.statsGrid}>
                <View style={styles.statsItem}>
                  <Text style={styles.statsValue}>{profile?.clubsJoinedCount ?? 0}</Text>
                  <Text style={styles.statsLabel}>Clubs</Text>
                </View>
                <View style={styles.statsItem}>
                  <Text style={styles.statsValue}>{profile?.tournamentsPlayedCount ?? 0}</Text>
                  <Text style={styles.statsLabel}>Played</Text>
                </View>
                <View style={styles.statsItem}>
                  <Text style={styles.statsValue}>{profile?.tournamentsCreatedCount ?? 0}</Text>
                  <Text style={styles.statsLabel}>Hosted</Text>
                </View>
              </View>

              <View style={styles.profileDuprRow}>
                <View style={styles.profileDuprPill}>
                  <Text style={styles.profileDuprPillLabel}>Singles</Text>
                  <Text style={styles.profileDuprPillValue}>{singlesRatingLabel}</Text>
                </View>
                <View style={styles.profileDuprPill}>
                  <Text style={styles.profileDuprPillLabel}>Doubles</Text>
                  <Text style={styles.profileDuprPillValue}>{doublesRatingLabel}</Text>
                </View>
              </View>
            </SurfaceCard>

            <View style={styles.duprCardOuter}>
              <View style={styles.duprHeaderRow}>
                <View style={styles.duprCircleIcon}>
                  <Feather name="trending-up" size={20} color={colors.white} />
                </View>
                <Text style={styles.duprRatingTitle}>DUPR Rating</Text>
              </View>

              <View style={styles.duprPillsRow}>
                <View style={styles.duprPill}>
                  <Text style={styles.duprPillLabel}>Singles</Text>
                  <Text style={styles.duprPillValue}>{singlesRatingLabel}</Text>
                </View>
                <View style={styles.duprPill}>
                  <Text style={styles.duprPillLabel}>Doubles</Text>
                  <Text style={styles.duprPillValue}>{doublesRatingLabel}</Text>
                </View>
              </View>

              {!profile.duprLinked ? (
                <ProfileActionButton
                  label={linkDupr.isPending ? 'Connecting...' : 'Connect DUPR'}
                  icon="link"
                  onPress={startDuprConnect}
                  colors={colors}
                  styles={styles}
                />
              ) : null}
            </View>

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
            titleAccessory={
              <Pressable onPress={() => setShowDuprConnect(false)} hitSlop={12}>
                <Feather name="x" size={20} color={colors.textMuted} />
              </Pressable>
            }
          >
            {duprLoginUrl ? (
              <WebView
                style={{ height: 420 }}
                source={{ uri: duprLoginUrl }}
                originWhitelist={['*']}
                injectedJavaScript={duprBridgeJs}
                onMessage={(event) => {
                  try {
                    const payload = JSON.parse(event.nativeEvent.data)
                    const data = payload?.data ?? {}
                    const numericId = data.id || data.userId
                    const duprId = data.duprId || data.dupr_id
                    const accessToken = data.userToken || data.accessToken || data.access_token
                    const refreshToken = data.refreshToken || data.refresh_token
                    const stats = data.stats || {
                      rating: data.rating,
                      singlesRating: data.singlesRating || data.singles_rating,
                      doublesRating: data.doublesRating || data.doubles_rating,
                      name: data.name,
                    }

                    if ((duprId || numericId) && accessToken && refreshToken) {
                      linkDupr.mutate({
                        duprId: duprId ? String(duprId) : undefined,
                        numericId: numericId ? Number(numericId) : undefined,
                        accessToken: String(accessToken),
                        refreshToken: String(refreshToken),
                        stats,
                      })
                    }
                  } catch {}
                }}
              />
            ) : (
              <View style={{ paddingVertical: spacing.md }}>
                <Text style={{ color: colors.textMuted }}>DUPR client key is missing.</Text>
              </View>
            )}
          </AppBottomSheet>

          <AppBottomSheet
            open={Boolean(duprInfoMessage)}
            onClose={() => setDuprInfoMessage(null)}
            title={duprInfoMessage?.title}
            subtitle={duprInfoMessage?.body}
            footer={<AppInfoFooter onPress={() => setDuprInfoMessage(null)} />}
          />
          <AppBottomSheet
            open={tdFeedbackInfoOpen}
            onClose={() => setTdFeedbackInfoOpen(false)}
            title="Tournament director rating"
            subtitle={
              tdCanPublishEffective && tdAverageEffective
                ? `Average ${tdAverageEffective.toFixed(1)}`
                : 'No public rating yet. Need at least 5 ratings.'
            }
          >
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
              const status = statusMeta(tournament.myStatus, hasPrivilegedAccess, colors)
              const divisionLabel =
                tournament.divisions?.[0]?.name ||
                `${Math.max(Number(tournament.divisions?.length ?? 0), 1)} division${Number(tournament.divisions?.length ?? 0) === 1 ? '' : 's'}`

              return (
                <Pressable
                  key={tournament.id}
                  onPress={() => router.push(`/tournaments/${tournament.id}`)}
                  style={({ pressed }) => [pressed && styles.cardPressed]}
                >
                  <SurfaceCard style={styles.activityCard}>
                    <View style={styles.activityTopRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.activityTitle}>{tournament.title}</Text>
                        <Text style={styles.activitySubtitle}>{divisionLabel}</Text>
                      </View>

                      <View style={[styles.activityStatusBadge, { backgroundColor: status.backgroundColor }]}>
                        <Text style={[styles.activityStatusText, { color: status.textColor }]}>{status.label}</Text>
                      </View>
                    </View>

                    <View style={styles.activityMetaRow}>
                      <Feather name="calendar" size={14} color={colors.textMuted} />
                      <Text style={styles.activityMetaText}>{formatDate(tournament.startDate)}</Text>
                    </View>
                  </SurfaceCard>
                </Pressable>
              )
            })}
          </View>

          <View style={styles.footerSpace} />
        </ScrollView>
      </OptionalLinearGradient>
    </SafeAreaView>
  )
}

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  fill: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: 120,
    gap: spacing.lg,
  },
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
    backgroundColor: colors.brandPrimaryTint,
  },
  guestTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  guestBody: {
    color: colors.textMuted,
    lineHeight: 21,
  },
  headerCard: {
    gap: spacing.md,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  avatarWrap: {
    position: 'relative',
  },
  cameraButton: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: colors.surface,
  },
  cameraButtonPressed: {
    opacity: 0.88,
  },
  headerActions: {
    flex: 1,
    gap: 10,
    paddingTop: 6,
  },
  profileActionButton: {
    minHeight: 44,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  profileActionButtonOutline: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  profileActionButtonGhost: {
    backgroundColor: 'transparent',
  },
  profileActionButtonPressed: {
    opacity: 0.85,
  },
  profileActionLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  userInfoBlock: {
    gap: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statsItem: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: 10,
    alignItems: 'center',
  },
  statsValue: { color: colors.text, fontSize: 18, fontWeight: '800' },
  statsLabel: { marginTop: 2, color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  profileDuprRow: { marginTop: spacing.md, flexDirection: 'row', gap: spacing.sm },
  profileDuprPill: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  profileDuprPillLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  profileDuprPillValue: { marginTop: 3, color: colors.text, fontSize: 22, fontWeight: '800' },
  userName: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.9,
  },
  userHandle: {
    color: colors.textMuted,
    fontSize: 15,
  },
  userMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  userMetaText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  userMetaSeparator: {
    color: colors.textMuted,
    fontSize: 13,
  },
  /** DUPR card — match design spec (mint container, white rating pills) */
  duprCardOuter: {
    backgroundColor: colors.hero,
    borderWidth: 1,
    borderColor: colors.brandPrimaryBorder,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  duprHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  duprCircleIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  duprRatingTitle: {
    color: colors.textMuted,
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  duprPillsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  duprPill: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingTop: 14,
    paddingBottom: 18,
  },
  duprPillLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 10,
  },
  duprPillValue: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.8,
    textAlign: 'left',
    alignSelf: 'flex-start',
    fontVariant: ['tabular-nums'],
  },
  tdRatingTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
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
  tdRatingValue: { color: colors.text, fontSize: 16, fontWeight: '800' },
  tdRatingMuted: { color: colors.textMuted, fontSize: 16, fontWeight: '700' },
  tdAchievementsWordsRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tdAchievementWordChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.brandPrimaryBorder,
    backgroundColor: colors.brandPrimaryTint,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tdAchievementWordText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  feedbackChipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: spacing.xs },
  feedbackChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.brandPrimaryBorder,
    backgroundColor: colors.brandPrimaryTint,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  feedbackChipText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  sectionBlock: {
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  emptyCard: {
    gap: 8,
  },
  emptyCardTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  emptyCardBody: {
    color: colors.textMuted,
    lineHeight: 21,
  },
  activityCard: {
    gap: 10,
  },
  activityTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  activityTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  activitySubtitle: {
    marginTop: 4,
    color: colors.textMuted,
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
    color: colors.textMuted,
    fontSize: 13,
  },
  cardPressed: {
    opacity: 0.92,
  },
  footerSpace: {
    height: 16,
  },
  })



