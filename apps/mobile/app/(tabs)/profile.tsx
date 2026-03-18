import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useMemo, useState } from 'react'
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'

import { OptionalLinearGradient } from '../../src/components/OptionalLinearGradient'
import { ActionButton, EmptyState, LoadingBlock, SurfaceCard } from '../../src/components/ui'
import { formatDate, formatLocation } from '../../src/lib/formatters'
import { DUPR_CLIENT_KEY } from '../../src/lib/config'
import { palette, radius, spacing } from '../../src/lib/theme'
import { trpc } from '../../src/lib/trpc'
import { useAuth } from '../../src/providers/AuthProvider'

const memberSinceFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
})

const getInitials = (label: string) =>
  label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'P'

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

const ProfileAvatar = ({
  label,
  image,
  onCameraPress,
}: {
  label: string
  image?: string | null
  onCameraPress?: () => void
}) => {
  const size = 96
  const borderRadius = size / 2

  return (
    <View style={styles.avatarWrap}>
      {image ? (
        <Image source={{ uri: image }} style={[styles.avatarImage, { width: size, height: size, borderRadius }]} />
      ) : (
        <OptionalLinearGradient
          colors={[palette.purple, palette.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.avatarFallback, { width: size, height: size, borderRadius }]}
        >
          <Text style={styles.avatarInitials}>{getInitials(label)}</Text>
        </OptionalLinearGradient>
      )}

      <Pressable onPress={onCameraPress} style={({ pressed }) => [styles.cameraButton, pressed && styles.cameraButtonPressed]}>
        <Feather name="camera" size={14} color={palette.white} />
      </Pressable>
    </View>
  )
}

const ProfileActionButton = ({
  label,
  icon,
  onPress,
  variant = 'outline',
}: {
  label: string
  icon?: keyof typeof Feather.glyphMap
  onPress?: () => void
  variant?: 'outline' | 'ghost'
}) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [
      styles.profileActionButton,
      variant === 'outline' ? styles.profileActionButtonOutline : styles.profileActionButtonGhost,
      pressed && styles.profileActionButtonPressed,
    ]}
  >
    {icon ? <Feather name={icon} size={16} color={palette.text} /> : null}
    <Text style={styles.profileActionLabel}>{label}</Text>
  </Pressable>
)

export default function ProfileTab() {
  const { token, user } = useAuth()
  const isAuthenticated = Boolean(token)
  const api = trpc as any
  const utils = trpc.useUtils() as any
  const [showDuprConnect, setShowDuprConnect] = useState(false)
  const linkDupr = api.user.linkDupr.useMutation({
    onSuccess: async () => {
      await utils.user.getProfile.invalidate()
      setShowDuprConnect(false)
      Alert.alert('DUPR connected', 'Your DUPR account is now linked.')
    },
    onError: (err: any) => {
      Alert.alert('DUPR connect failed', err?.message || 'Unable to connect DUPR right now.')
    },
  })

  const startDuprConnect = () => {
    if (!DUPR_CLIENT_KEY) {
      Alert.alert(
        'DUPR not configured',
        'Missing DUPR_CLIENT_KEY (or EXPO_PUBLIC_DUPR_CLIENT_KEY) in the mobile app environment. Add it and rebuild the app.'
      )
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
        return status === 'active' || status === 'waitlisted'
      })
      .sort((left, right) => new Date(right.startDate).getTime() - new Date(left.startDate).getTime())
      .slice(0, 3)
      .map((item) => ({ ...item, myStatus: statuses[item.id]?.status }))
  }, [statuses, tournamentsQuery.data])

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <OptionalLinearGradient colors={[palette.background, palette.surfaceElevated]} style={styles.fill}>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
        <OptionalLinearGradient colors={[palette.background, palette.surfaceElevated]} style={styles.fill}>
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
        <OptionalLinearGradient colors={[palette.background, palette.surfaceElevated]} style={styles.fill}>
          <View style={styles.loadingWrap}>
            <EmptyState title="Profile unavailable" body="We could not load your player profile right now." />
          </View>
        </OptionalLinearGradient>
      </SafeAreaView>
    )
  }

  const bestRating = [parseNumberish(profile.duprRatingSingles), parseNumberish(profile.duprRatingDoubles)]
    .filter((value): value is number => value !== null)
    .sort((left, right) => right - left)[0]
  const bestRatingLabel = bestRating === undefined ? '—' : bestRating.toFixed(2)
  const handleLabel = `@${String(profile.email || '').split('@')[0] || 'piqle'}`
  const memberSinceLabel = profile.createdAt ? memberSinceFormatter.format(new Date(profile.createdAt)) : 'Recently'
  const locationLabel = formatLocation([profile.city])

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <OptionalLinearGradient colors={[palette.background, palette.surfaceElevated]} style={styles.fill}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.headerCard}>
            <View style={styles.headerTopRow}>
              <ProfileAvatar
                label={profile.name || profile.email}
                image={profile.image}
                onCameraPress={() => router.push('/profile/edit')}
              />

              <View style={styles.headerActions}>
                <ProfileActionButton label="Edit Profile" onPress={() => router.push('/profile/edit')} />
                <ProfileActionButton
                  label="Settings"
                  icon="settings"
                  variant="ghost"
                  onPress={() => router.push('/profile/settings')}
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

            <SurfaceCard style={styles.duprCard}>
              <View style={styles.duprTopRow}>
                <View style={styles.duprBadgeIcon}>
                  <Feather name="trending-up" size={20} color={palette.white} />
                </View>

                <View style={styles.duprRatingBlock}>
                  <Text style={styles.duprLabel}>DUPR Rating</Text>
                  <Text style={styles.duprValue}>{bestRatingLabel}</Text>
                </View>

                <View style={styles.duprStatusBadge}>
                  <Text style={styles.duprStatusText}>
                    {profile.duprLinked ? 'Connected' : 'Connect to sync'}
                  </Text>
                </View>
              </View>

              {!profile.duprLinked ? (
                <ProfileActionButton
                  label={linkDupr.isPending ? 'Connecting...' : 'Connect DUPR'}
                  icon="link"
                  onPress={startDuprConnect}
                />
              ) : null}
            </SurfaceCard>
          </View>

          <Modal
            animationType="slide"
            transparent
            visible={showDuprConnect}
            onRequestClose={() => setShowDuprConnect(false)}
          >
            <View style={styles.duprModalOverlay}>
              <View style={styles.duprModal}>
                <View style={styles.duprModalHeader}>
                  <Text style={styles.duprModalTitle}>Connect DUPR</Text>
                  <Pressable
                    onPress={() => setShowDuprConnect(false)}
                    style={({ pressed }) => [styles.duprModalClose, pressed && { opacity: 0.85 }]}
                  >
                    <Feather name="x" size={18} color={palette.textMuted} />
                  </Pressable>
                </View>

                {duprLoginUrl ? (
                  <WebView
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
                  <View style={{ padding: spacing.lg }}>
                    <Text style={{ color: palette.textMuted }}>
                      DUPR client key is missing.
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </Modal>

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
                      <Feather name="calendar" size={14} color={palette.textMuted} />
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.background,
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
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatarImage: {
    backgroundColor: palette.surfaceMuted,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: palette.white,
    fontSize: 26,
    fontWeight: '700',
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
    backgroundColor: palette.primary,
    borderWidth: 3,
    borderColor: palette.surface,
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
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  profileActionButtonGhost: {
    backgroundColor: 'transparent',
  },
  profileActionButtonPressed: {
    opacity: 0.85,
  },
  profileActionLabel: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '600',
  },
  userInfoBlock: {
    gap: 4,
  },
  userName: {
    color: palette.text,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.9,
  },
  userHandle: {
    color: palette.textMuted,
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
    color: palette.textMuted,
    fontSize: 13,
  },
  userMetaSeparator: {
    color: palette.textMuted,
    fontSize: 13,
  },
  duprCard: {
    gap: spacing.md,
    backgroundColor: 'rgba(40, 205, 65, 0.05)',
    borderColor: palette.brandPrimaryBorder,
  },
  duprTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  duprBadgeIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.primary,
  },
  duprRatingBlock: {
    flex: 1,
  },
  duprLabel: {
    color: palette.textMuted,
    fontSize: 13,
  },
  duprValue: {
    color: palette.text,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.7,
    marginTop: 2,
  },
  duprStatusBadge: {
    maxWidth: 120,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.brandPrimaryBorder,
  },
  duprStatusText: {
    color: palette.primary,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  duprModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 10, 10, 0.28)',
    justifyContent: 'flex-end',
  },
  duprModal: {
    height: '85%',
    backgroundColor: palette.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
  },
  duprModalHeader: {
    height: 54,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
    backgroundColor: palette.surfaceOverlay,
  },
  duprModalTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '800',
  },
  duprModalClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
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
  footerSpace: {
    height: 16,
  },
})



