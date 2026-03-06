import { Feather } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { Image, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import {
  ActionButton,
  AvatarBadge,
  EmptyState,
  LoadingBlock,
  SectionTitle,
  SurfaceCard,
} from '../../../src/components/ui'
import { TopBar } from '../../../src/components/navigation/TopBar'
import { OptionalLinearGradient } from '../../../src/components/OptionalLinearGradient'
import { buildWebUrl } from '../../../src/lib/config'
import { formatLocation, formatMoney } from '../../../src/lib/formatters'
import { trpc } from '../../../src/lib/trpc'
import { palette, radius, spacing } from '../../../src/lib/theme'
import { useAuth } from '../../../src/providers/AuthProvider'

const longDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
})

const TITLE_GRADIENT_IMAGE_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAACACAYAAAA27Cg+AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAF+SURBVFhH1cq7R4ZxGIfxt3O9nc8HHZRSSklJkpIkkiSRRCKRSEQiIiIiIiIiGiIaIhqiIRoaoqGhoSH6U3Ktv4fLM7xLN597+LoSyWQyYSJDKDKEIkMoMoQiQygyhCJDiJdm/k2QblITZJjUBJkmVpBlYgXZJlaQY2IFuYYgz8QK9AjyDUGBiRUUGoIiQ1BsCEoMQakhKDME5YagwhBUGoIqQ1BtCGoMQa0hqDME9YagwRA0GoImQ9BsCFoMQashaDME7YagwxB0GoIuQ9BtCHoMQa8h6DME/YZgwBAMGoIhQzBsCEYMwaghGDME44ZgwhBMGoIpQzBtCGYMwawhmDME84ZgwRAsGoIlQ7BsCFYMwaohWDME64ZgwxBsGoItQ7BtCHYMwa4h2DME+4bgwBAcGoIjQ3BsCE4MwakhODME54bgwhBcGoIrQ3BtCG4Mwa0huDME94bgwRA8GoInQ/BsCF4MwasheDME74bgwxB8GoIvQ/BtCH4Mwa/5A0iMkfgHxZnkAAAAAElFTkSuQmCC'

const formatHeroDateRange = (start?: string | Date | null, end?: string | Date | null) => {
  if (!start) return 'Date TBD'

  const startDate = new Date(start)
  if (!end) {
    return longDateFormatter.format(startDate)
  }

  const endDate = new Date(end)
  const sameMonthAndYear =
    startDate.getFullYear() === endDate.getFullYear() &&
    startDate.getMonth() === endDate.getMonth()

  if (sameMonthAndYear) {
    return `${startDate.toLocaleString('en-US', {
      month: 'long',
    })} ${startDate.getDate()}-${endDate.getDate()}, ${endDate.getFullYear()}`
  }

  return `${longDateFormatter.format(startDate)} - ${longDateFormatter.format(endDate)}`
}

const formatTournamentFormat = (format?: string | null) => {
  switch (format) {
    case 'SINGLE_ELIMINATION':
      return 'Single Elimination'
    case 'ROUND_ROBIN':
      return 'Round Robin'
    case 'MLP':
      return 'MLP'
    case 'INDY_LEAGUE':
      return 'Indy League'
    case 'LEAGUE_ROUND_ROBIN':
      return 'League Round Robin'
    case 'ONE_DAY_LADDER':
      return 'One Day Ladder'
    case 'LADDER_LEAGUE':
      return 'Ladder League'
    default:
      return 'Tournament'
  }
}

const getPlayersPerTeam = (teamKind?: string | null, tournamentFormat?: string | null) => {
  if (tournamentFormat === 'INDY_LEAGUE' && teamKind === 'SQUAD_4v4') {
    return 32
  }

  switch (teamKind) {
    case 'SINGLES_1v1':
      return 1
    case 'SQUAD_4v4':
      return 4
    case 'DOUBLES_2v2':
    default:
      return 2
  }
}

type DetailTab = 'info' | 'divisions'

type StatusMeta = {
  label: string
  backgroundColor: string
}

const getStatusMeta = (tournament: any, myStatus?: string | null): StatusMeta => {
  if (myStatus === 'active') {
    return { label: 'Registered', backgroundColor: 'rgba(40, 205, 65, 0.92)' }
  }
  if (myStatus === 'waitlisted') {
    return { label: 'Waitlist', backgroundColor: 'rgba(255, 214, 10, 0.88)' }
  }
  if (new Date(tournament.endDate).getTime() < Date.now()) {
    return { label: 'Closed', backgroundColor: 'rgba(10, 10, 10, 0.58)' }
  }

  const filledTeams = ((tournament.divisions ?? []) as any[]).reduce(
    (sum, division) => sum + Number(division?._count?.teams ?? 0),
    0
  )
  const maxTeams = ((tournament.divisions ?? []) as any[]).reduce(
    (sum, division) => sum + Number(division?.maxTeams ?? 0),
    0
  )

  if (maxTeams > 0 && filledTeams >= maxTeams) {
    return { label: 'Waitlist', backgroundColor: 'rgba(255, 214, 10, 0.88)' }
  }
  if (maxTeams > 0 && filledTeams / maxTeams >= 0.75) {
    return { label: 'Filling Fast', backgroundColor: 'rgba(255, 214, 10, 0.88)' }
  }

  return { label: 'Open', backgroundColor: 'rgba(0, 232, 124, 0.9)' }
}

export default function TournamentDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>()
  const tournamentId = String(params.id ?? '')
  const { token } = useAuth()
  const isAuthenticated = Boolean(token)
  const api = trpc as any
  const utils = trpc.useUtils() as any

  const [activeTab, setActiveTab] = useState<DetailTab>('info')
  const [isFavorite, setIsFavorite] = useState(false)

  const tournamentQuery = api.public.getBoardById.useQuery(
    { id: tournamentId },
    { enabled: Boolean(tournamentId) }
  )
  const myStatusQuery = api.registration.getMyStatus.useQuery(
    { tournamentId },
    { enabled: Boolean(tournamentId) && isAuthenticated }
  )
  const myInvitationQuery = api.tournamentInvitation.getMineByTournament.useQuery(
    { tournamentId },
    { enabled: Boolean(tournamentId) && isAuthenticated }
  )

  const acceptInvitation = api.tournamentInvitation.accept.useMutation({
    onSuccess: async (result: any) => {
      await Promise.all([
        utils.notification.list.invalidate(),
        myInvitationQuery.refetch(),
        myStatusQuery.refetch(),
      ])
      router.push({ pathname: '/tournaments/[id]/register', params: { id: result.tournamentId } })
    },
  })
  const declineInvitation = api.tournamentInvitation.decline.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.notification.list.invalidate(),
        myInvitationQuery.refetch(),
      ])
    },
  })

  if (tournamentQuery.isLoading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <TopBar />
        <View style={styles.loadingWrap}>
          <LoadingBlock label="Loading tournament..." />
        </View>
      </SafeAreaView>
    )
  }

  if (!tournamentQuery.data) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <TopBar />
        <View style={styles.loadingWrap}>
          <SurfaceCard>
            <Text style={styles.muted}>Tournament not found.</Text>
          </SurfaceCard>
        </View>
      </SafeAreaView>
    )
  }

  const tournament = tournamentQuery.data as any
  const myStatus = myStatusQuery.data?.status
  const pendingInvitation = myInvitationQuery.data?.status === 'PENDING' ? myInvitationQuery.data : null
  const entryFeeCents =
    typeof tournament.entryFeeCents === 'number'
      ? tournament.entryFeeCents
      : Number(tournament.entryFee ?? 0) > 0
      ? Math.round(Number(tournament.entryFee) * 100)
      : 0
  const feeLabel = entryFeeCents > 0 ? formatMoney(entryFeeCents) : 'Free'
  const quickFeeLabel = entryFeeCents > 0 ? `$${Math.round(entryFeeCents / 100)}+` : 'Free'
  const locationLabel = formatLocation([tournament.venueName, tournament.venueAddress])
  const playerCount = Number(tournament._count?.players ?? 0)
  const totalTeams = ((tournament.divisions ?? []) as any[]).reduce(
    (sum, division) => sum + Number(division?._count?.teams ?? 0),
    0
  )
  const statusMeta = getStatusMeta(tournament, myStatus)
  const organizerLabel = tournament.user?.name || tournament.user?.email || 'Piqle'
  const ctaLabel = pendingInvitation
    ? acceptInvitation.isPending
      ? 'Accepting...'
      : 'Accept Invitation'
    : myStatus === 'active'
    ? 'Manage Registration'
    : myStatus === 'waitlisted'
    ? 'View Waitlist Spot'
    : `Register Now • ${feeLabel}`
  const amenityLabels = [
    locationLabel !== 'Location not set' ? 'Venue Details' : null,
    tournament.publicSlug ? 'Public Scoreboard' : null,
    tournament.registrationEndDate ? 'Online Registration' : null,
    tournament.divisions.length > 1 ? 'Multiple Divisions' : null,
    entryFeeCents > 0 ? 'Paid Entry' : 'Free Entry',
  ].filter(Boolean) as string[]
  const organizerMetaLabel = `${tournament.divisions.length} divisions • ${playerCount || totalTeams} ${
    playerCount ? 'players' : 'teams'
  }`

  const handlePrimaryAction = () => {
    if (pendingInvitation) {
      acceptInvitation.mutate({ invitationId: pendingInvitation.id })
      return
    }

    if (!isAuthenticated) {
      router.push('/sign-in')
      return
    }

    router.push({ pathname: '/tournaments/[id]/register', params: { id: tournament.id } })
  }

  const handleShare = async () => {
    const url = buildWebUrl(`/scoreboard/${tournament.id}`)
    try {
      await Share.share({
        message: `${tournament.title}\n${url}`,
        url,
      })
    } catch {}
  }

  const handleOpenMaps = () => {
    if (!locationLabel || locationLabel === 'Location not set') return
    void Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationLabel)}`
    )
  }

  const handleOpenOrganizerProfile = () => {
    if (!tournament.user?.id) return
    void Linking.openURL(buildWebUrl(`/profile/${tournament.user.id}`))
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <TopBar />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          {tournament.image ? (
            <Image source={{ uri: tournament.image }} style={styles.heroImage} />
          ) : (
            <OptionalLinearGradient
              colors={[palette.surfaceMuted, palette.surfaceElevated, palette.hero]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroFallback}
            >
              <Feather name="award" size={42} color={palette.primary} />
            </OptionalLinearGradient>
          )}
          <View pointerEvents="none" style={styles.heroOverlay} />

          <View style={styles.heroHeader}>
            <View style={styles.heroActions}>
              <Pressable
                onPress={() => router.back()}
                style={({ pressed }) => [styles.heroActionButton, pressed && styles.heroActionPressed]}
              >
                <Feather name="arrow-left" size={20} color={palette.white} />
              </Pressable>
              <View style={styles.heroActionGroup}>
                <Pressable
                  onPress={() => setIsFavorite((current) => !current)}
                  style={({ pressed }) => [styles.heroActionButton, pressed && styles.heroActionPressed]}
                >
                  <Feather
                    name="heart"
                    size={20}
                    color={isFavorite ? '#ff5a6b' : palette.white}
                  />
                </Pressable>
                <Pressable
                  onPress={handleShare}
                  style={({ pressed }) => [styles.heroActionButton, pressed && styles.heroActionPressed]}
                >
                  <Feather name="share-2" size={20} color={palette.white} />
                </Pressable>
              </View>
            </View>
          </View>

          <Image
            pointerEvents="none"
            source={{ uri: TITLE_GRADIENT_IMAGE_URI }}
            resizeMode="stretch"
            style={styles.heroFooterGradient}
          />

          <View style={styles.heroFooter}>
            <View style={[styles.heroStatusBadge, { backgroundColor: statusMeta.backgroundColor }]}>
              <Text style={styles.heroStatusText}>{statusMeta.label}</Text>
            </View>
            <Text style={styles.heroTitle}>{tournament.title}</Text>
            <View style={styles.heroDateRow}>
              <Feather name="calendar" size={14} color="rgba(255,255,255,0.82)" />
              <Text style={styles.heroDateText}>
                {formatHeroDateRange(tournament.startDate, tournament.endDate)}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.statsSection}>
          <View style={styles.quickStats}>
            <SurfaceCard style={styles.statCard}>
              <Feather name="users" size={20} color={palette.primary} />
              <Text style={styles.statValue}>{playerCount || totalTeams}</Text>
              <Text style={styles.statLabel}>{playerCount ? 'Players' : 'Teams'}</Text>
            </SurfaceCard>
            <SurfaceCard style={styles.statCard}>
              <Feather name="award" size={20} color={palette.brandAccent} />
              <Text style={styles.statValue}>{tournament.divisions.length}</Text>
              <Text style={styles.statLabel}>Divisions</Text>
            </SurfaceCard>
            <SurfaceCard style={styles.statCard}>
              <Feather name="dollar-sign" size={20} color={palette.purple} />
              <Text style={styles.statValue}>{quickFeeLabel}</Text>
              <Text style={styles.statLabel}>Entry Fee</Text>
            </SurfaceCard>
          </View>
        </View>

        <View style={styles.contentSection}>
          <View style={styles.tabSwitch}>
            {(['info', 'divisions'] as const).map((tab) => {
              const active = activeTab === tab
              return (
                <Pressable
                  key={tab}
                  onPress={() => setActiveTab(tab)}
                  style={[styles.tabButton, active && styles.tabButtonActive]}
                >
                  <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                    {tab === 'info' ? 'Info' : 'Divisions'}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          {activeTab === 'info' ? (
            <View style={styles.sectionStack}>
              {pendingInvitation ? (
                <SurfaceCard tone="hero" style={styles.detailCard}>
                  <SectionTitle
                    title="Invitation pending"
                    subtitle="Accept this invite to jump straight into registration."
                  />
                  <View style={styles.invitationActions}>
                    <View style={{ flex: 1 }}>
                      <ActionButton
                        label="Accept"
                        loading={acceptInvitation.isPending}
                        onPress={() => acceptInvitation.mutate({ invitationId: pendingInvitation.id })}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <ActionButton
                        label="Decline"
                        variant="secondary"
                        loading={declineInvitation.isPending}
                        onPress={() => declineInvitation.mutate({ invitationId: pendingInvitation.id })}
                      />
                    </View>
                  </View>
                </SurfaceCard>
              ) : null}

              <SurfaceCard style={styles.detailCard}>
                <Text style={[styles.cardTitle, styles.cardTitleTight]}>About</Text>
                <Text style={styles.paragraph}>
                  {tournament.description || 'Tournament details will appear here once the organizer adds them.'}
                </Text>
              </SurfaceCard>

              <SurfaceCard style={styles.detailCard}>
                <Text style={[styles.cardTitle, styles.cardTitleTight]}>Format</Text>
                <View style={styles.valueRow}>
                  <Feather name="award" size={16} color={palette.primary} />
                  <Text style={styles.valueText}>{formatTournamentFormat(tournament.format)}</Text>
                </View>
              </SurfaceCard>

              <SurfaceCard style={styles.detailCard}>
                <Text style={[styles.cardTitle, styles.cardTitleLoose]}>Location</Text>
                <View style={styles.locationRow}>
                  <Feather name="map-pin" size={20} color={palette.brandAccent} style={styles.locationIcon} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.valueText}>{locationLabel}</Text>
                    <Pressable
                      disabled={locationLabel === 'Location not set'}
                      onPress={handleOpenMaps}
                      style={({ pressed }) => [styles.inlineLinkWrap, pressed && styles.inlineLinkPressed]}
                    >
                      <Text
                        style={[
                          styles.inlineLinkText,
                          locationLabel === 'Location not set' && styles.inlineLinkTextDisabled,
                        ]}
                      >
                        Open in Maps
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </SurfaceCard>

              <SurfaceCard style={styles.detailCard}>
                <Text style={[styles.cardTitle, styles.cardTitleLoose]}>Amenities</Text>
                {amenityLabels.length ? (
                  <View style={styles.badgeWrap}>
                    {amenityLabels.map((label) => (
                      <View key={label} style={styles.secondaryBadge}>
                        <Text style={styles.secondaryBadgeText}>{label}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.mutedBodyText}>More venue details will be added by the organizer soon.</Text>
                )}
              </SurfaceCard>

              <SurfaceCard style={styles.detailCard}>
                <Text style={[styles.cardTitle, styles.cardTitleLoose]}>Organizer</Text>
                <View style={styles.organizerRow}>
                  <AvatarBadge label={organizerLabel} size={48} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.organizerName}>{organizerLabel}</Text>
                    <Text style={styles.organizerMeta}>{organizerMetaLabel}</Text>
                  </View>
                </View>
                <View style={styles.organizerButtonRow}>
                  <Pressable
                    disabled={!tournament.user?.id}
                    onPress={handleOpenOrganizerProfile}
                    style={({ pressed }) => [
                      styles.outlineButton,
                      pressed && tournament.user?.id && styles.outlineButtonPressed,
                      !tournament.user?.id && styles.outlineButtonDisabled,
                    ]}
                  >
                    <Text style={styles.outlineButtonText}>View Profile</Text>
                  </Pressable>
                </View>
              </SurfaceCard>
            </View>
          ) : null}

          {activeTab === 'divisions' ? (
            <View style={styles.sectionStack}>
              {tournament.divisions.length ? (
                tournament.divisions.map((division: any) => {
                  const maxTeams = Number(division.maxTeams ?? 0)
                  const filledTeams = Number(division._count?.teams ?? 0)
                  const playersPerTeam = getPlayersPerTeam(division.teamKind, tournament.format)
                  const maxPlayers = maxTeams > 0 ? maxTeams * playersPerTeam : 0
                  const spotsLeft = maxTeams > 0 ? Math.max(0, maxTeams - filledTeams) * playersPerTeam : null

                  return (
                    <SurfaceCard key={division.id} style={styles.detailCard}>
                      <View style={styles.divisionHeader}>
                        <Text style={styles.divisionTitle}>{division.name}</Text>
                        {spotsLeft !== null ? (
                          <View style={spotsLeft > 10 ? styles.primaryBadge : styles.secondaryBadge}>
                            <Text style={spotsLeft > 10 ? styles.primaryBadgeText : styles.secondaryBadgeText}>
                              {spotsLeft} spots left
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={styles.divisionMetaGrid}>
                        <View style={styles.divisionMetaCell}>
                          <View style={styles.metaRow}>
                            <Feather name="users" size={16} color={palette.textMuted} />
                            <Text style={styles.mutedBodyText}>
                              {maxPlayers > 0 ? `${maxPlayers} max players` : `${filledTeams} teams joined`}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.divisionMetaCell}>
                          <View style={styles.metaRow}>
                            <Feather name="dollar-sign" size={16} color={palette.primary} />
                            <Text style={styles.mutedBodyText}>{feeLabel}</Text>
                          </View>
                        </View>
                      </View>
                      <Pressable
                        onPress={() =>
                          isAuthenticated
                            ? router.push({ pathname: '/tournaments/[id]/register', params: { id: tournament.id } })
                            : router.push('/sign-in')
                        }
                        style={({ pressed }) => [styles.smallCtaButton, pressed && styles.smallCtaButtonPressed]}
                      >
                        <OptionalLinearGradient
                          colors={[palette.primary, palette.purple]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={styles.smallCtaGradient}
                        >
                          <Text style={styles.smallCtaText}>{`Register for ${division.name}`}</Text>
                        </OptionalLinearGradient>
                      </Pressable>
                    </SurfaceCard>
                  )
                })
              ) : (
                <EmptyState
                  title="No divisions yet"
                  body="This tournament will show its divisions here once the organizer publishes them."
                />
              )}
            </View>
          ) : null}

        </View>
      </ScrollView>

      <View style={styles.ctaShell}>
        <OptionalLinearGradient
          colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.94)', palette.background]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.ctaFade}
        />
        <SafeAreaView edges={['bottom']} style={styles.ctaSafeArea}>
          <Pressable
            onPress={handlePrimaryAction}
            disabled={acceptInvitation.isPending}
            style={({ pressed }) => [styles.ctaButton, pressed && !acceptInvitation.isPending && styles.ctaButtonPressed]}
          >
            <OptionalLinearGradient
              colors={[palette.primary, palette.purple]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.ctaGradient, acceptInvitation.isPending && styles.ctaGradientDisabled]}
            >
              <Text style={styles.ctaText}>{ctaLabel}</Text>
            </OptionalLinearGradient>
          </Pressable>
        </SafeAreaView>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.background,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  scrollContent: {
    paddingBottom: 136,
  },
  hero: {
    position: 'relative',
    height: 256,
    backgroundColor: palette.surfaceMuted,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 10, 10, 0.18)',
  },
  heroHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  heroActions: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroActionGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  heroActionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10, 10, 10, 0.4)',
  },
  heroActionPressed: {
    opacity: 0.86,
  },
  heroFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  heroFooterGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 300,
  },
  heroStatusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 8,
  },
  heroStatusText: {
    color: palette.white,
    fontWeight: '600',
    fontSize: 12,
  },
  heroTitle: {
    color: palette.white,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.4,
    textShadowColor: 'rgba(0, 0, 0, 0.28)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  heroDateRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroDateText: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 14,
    textShadowColor: 'rgba(0, 0, 0, 0.22)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  statsSection: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  contentSection: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  quickStats: {
    flexDirection: 'row',
    gap: 8,
  },
  statCard: {
    flex: 1,
    minHeight: 84,
    paddingHorizontal: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  statValue: {
    marginTop: 4,
    color: palette.text,
    fontSize: 18,
    fontWeight: '700',
  },
  statLabel: {
    marginTop: 2,
    color: palette.textMuted,
    fontSize: 12,
  },
  tabSwitch: {
    flexDirection: 'row',
    gap: 4,
    minHeight: 36,
    backgroundColor: palette.surfaceMuted,
    padding: 3,
    borderRadius: radius.sm,
  },
  tabButton: {
    flex: 1,
    minHeight: 30,
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  tabButtonActive: {
    backgroundColor: palette.surface,
  },
  tabLabel: {
    color: palette.textMuted,
    fontWeight: '600',
    fontSize: 14,
  },
  tabLabelActive: {
    color: palette.text,
  },
  sectionStack: {
    marginTop: 24,
    gap: spacing.md,
  },
  invitationActions: {
    marginTop: spacing.md,
    flexDirection: 'row',
    gap: 10,
  },
  muted: {
    color: palette.textMuted,
  },
  paragraph: {
    color: palette.textMuted,
    fontSize: 14,
    lineHeight: 22,
  },
  detailCard: {
    borderRadius: 12,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  cardTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '600',
  },
  cardTitleTight: {
    marginBottom: 8,
  },
  cardTitleLoose: {
    marginBottom: 12,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  valueText: {
    color: palette.text,
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  mutedBodyText: {
    color: palette.textMuted,
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  locationIcon: {
    marginTop: 2,
  },
  inlineLinkWrap: {
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  inlineLinkPressed: {
    opacity: 0.82,
  },
  inlineLinkText: {
    color: palette.primary,
    fontSize: 14,
    fontWeight: '500',
  },
  inlineLinkTextDisabled: {
    opacity: 0.45,
  },
  badgeWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  primaryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: palette.primary,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  primaryBadgeText: {
    color: palette.white,
    fontSize: 12,
    fontWeight: '600',
  },
  secondaryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: palette.secondary,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  secondaryBadgeText: {
    color: palette.text,
    fontSize: 12,
    fontWeight: '500',
  },
  divisionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  divisionTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  divisionMetaGrid: {
    marginTop: 12,
    marginBottom: 12,
    flexDirection: 'row',
    gap: 12,
  },
  divisionMetaCell: {
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  smallCtaButton: {
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  smallCtaButtonPressed: {
    opacity: 0.94,
  },
  smallCtaGradient: {
    minHeight: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  smallCtaText: {
    color: palette.white,
    fontSize: 14,
    fontWeight: '600',
  },
  organizerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  organizerName: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '600',
  },
  organizerMeta: {
    marginTop: 4,
    color: palette.textMuted,
    fontSize: 14,
  },
  organizerButtonRow: {
    marginTop: spacing.md,
  },
  outlineButton: {
    minHeight: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  outlineButtonPressed: {
    backgroundColor: palette.secondary,
  },
  outlineButtonDisabled: {
    opacity: 0.5,
  },
  outlineButtonText: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '500',
  },
  ctaShell: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  ctaFade: {
    height: 44,
  },
  ctaSafeArea: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: palette.background,
  },
  ctaButton: {
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  ctaButtonPressed: {
    opacity: 0.94,
  },
  ctaGradient: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  ctaGradientDisabled: {
    opacity: 0.75,
  },
  ctaText: {
    color: palette.white,
    fontSize: 18,
    fontWeight: '700',
  },
})
