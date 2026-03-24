import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native'

import { EntityImage } from '../src/components/EntityImage'
import { FeedbackRatingModal } from '../src/components/FeedbackRatingModal'
import { FeedbackEntityContextCard } from '../src/components/FeedbackEntityContextCard'
import { RatingStarIcon } from '../src/components/icons/RatingStarIcon'
import { RemoteUserAvatar } from '../src/components/RemoteUserAvatar'
import { PiqleLogo } from '../src/components/navigation/PiqleLogo'
import { PageLayout } from '../src/components/navigation/PageLayout'
import { EmptyState, LoadingBlock, SurfaceCard } from '../src/components/ui'
import { formatDateRange, formatLocation } from '../src/lib/formatters'
import { palette, spacing } from '../src/lib/theme'
import { trpc } from '../src/lib/trpc'
import { useAuth } from '../src/providers/AuthProvider'

type FeedbackEntityType = 'TOURNAMENT' | 'CLUB' | 'TD' | 'APP'

export default function NotificationsScreen() {
  const { token } = useAuth()
  const isAuthenticated = Boolean(token)
  const [devFeedbackPromptsEnabled, setDevFeedbackPromptsEnabled] = useState(false)
  const [activePrompt, setActivePrompt] = useState<{
    entityType: FeedbackEntityType
    entityId: string
    title: string
    subtitle: string
    context?: {
      title?: string
      date?: string
      format?: string
      address?: string
      imageUrl?: string | null
      membersCount?: number
      city?: string
      name?: string
      avatarUrl?: string | null
      tournamentTitle?: string
      tournamentDate?: string
    }
  } | null>(null)
  const api = trpc as any
  const notificationsQuery = trpc.notification.list.useQuery({ limit: 40 }, { enabled: isAuthenticated })
  const markClubJoinRequestSeen = trpc.notification.markClubJoinRequestSeen.useMutation({
    onSuccess: async () => {
      await notificationsQuery.refetch()
    },
  })
  const isDevEntity = Boolean(activePrompt?.entityId && String(activePrompt.entityId).startsWith('dev-'))
  const tournamentPreviewQuery = api.public.getTournamentById.useQuery(
    { id: activePrompt?.entityId ?? '' },
    { enabled: Boolean(activePrompt?.entityType === 'TOURNAMENT' && activePrompt?.entityId && !isDevEntity), retry: false },
  )
  const clubPreviewQuery = api.club.get.useQuery(
    { id: activePrompt?.entityId ?? '' },
    { enabled: Boolean(activePrompt?.entityType === 'CLUB' && activePrompt?.entityId && !isDevEntity), retry: false },
  )
  const tdPreviewQuery = api.user.getProfileById.useQuery(
    { id: activePrompt?.entityId ?? '' },
    { enabled: Boolean(activePrompt?.entityType === 'TD' && activePrompt?.entityId && !isDevEntity), retry: false },
  )

  const items = useMemo(() => {
    const serverItems = (notificationsQuery.data?.items ?? []) as any[]
    if (!devFeedbackPromptsEnabled) return serverItems

    const nowIso = new Date().toISOString()
    const devItems = [
      {
        id: 'dev-feedback-prompt-tournament',
        type: 'FEEDBACK_PROMPT' as const,
        title: 'Rate tournament',
        body: '"Spring Open" (Mar 24, 2026).\nHelp us improve tournament quality and player experience.',
        createdAt: nowIso,
        readAt: null,
        targetUrl: '/tournaments/dev-tournament-id',
        entityType: 'TOURNAMENT' as const,
        entityId: 'dev-tournament-id',
        avatarUrl: null,
        context: {
          title: 'Spring Open',
          date: 'Mar 24, 2026',
          format: 'Round Robin',
          address: 'Seattle, WA',
          imageUrl: null,
        },
      },
      {
        id: 'dev-feedback-prompt-td',
        type: 'FEEDBACK_PROMPT' as const,
        title: 'Rate tournament director',
        body: '"Alex Carter" (Mar 24, 2026, "Spring Open").\nHelp us improve director quality, communication, and event experience.',
        createdAt: nowIso,
        readAt: null,
        targetUrl: '/tournaments/dev-tournament-id',
        entityType: 'TD' as const,
        entityId: 'dev-td-id',
        avatarUrl: null,
        context: {
          name: 'Alex Carter',
          city: 'Seattle',
          avatarUrl: null,
          tournamentTitle: 'Spring Open',
          tournamentDate: 'Mar 24, 2026',
        },
      },
      {
        id: 'dev-feedback-prompt-club',
        type: 'FEEDBACK_PROMPT' as const,
        title: 'Rate club',
        body: '"Downtown Pickle Club" (Mar 20, 2026).\nHelp us improve club quality, events, and member experience.',
        createdAt: nowIso,
        readAt: null,
        targetUrl: '/clubs/dev-club-id',
        entityType: 'CLUB' as const,
        entityId: 'dev-club-id',
        avatarUrl: null,
        context: {
          title: 'Downtown Pickle Club',
          address: 'Seattle, WA',
          membersCount: 124,
          imageUrl: null,
        },
      },
      {
        id: 'dev-feedback-prompt-app',
        type: 'FEEDBACK_PROMPT' as const,
        title: 'Rate app experience',
        body: 'Your opinion is very important to us. We are working to improve usability, your overall experience, and the speed and quality of our service.',
        createdAt: nowIso,
        readAt: null,
        targetUrl: '/profile',
        entityType: 'APP' as const,
        entityId: 'GLOBAL',
        avatarUrl: null,
      },
    ]
    return [...devItems, ...serverItems]
  }, [notificationsQuery.data?.items, devFeedbackPromptsEnabled])

  const openTarget = (targetUrl?: string) => {
    if (!targetUrl) return
    if (targetUrl.startsWith('/')) {
      router.push(targetUrl as never)
    }
  }

  const onNotificationPress = async (item: any) => {
    if (item.type === 'FEEDBACK_PROMPT') {
      setActivePrompt({
        entityType: item.entityType,
        entityId: item.entityId,
        title:
          item.entityType === 'TOURNAMENT'
            ? 'Rate this tournament'
            : item.entityType === 'CLUB'
            ? 'Rate this club'
            : item.entityType === 'TD'
            ? 'Rate tournament director'
            : 'Rate app experience',
        subtitle: item.body || 'Your feedback helps improve the experience.',
        context: item.context,
      })
      return
    }
    if (item.type === 'CLUB_JOIN_REQUEST' && item.clubId) {
      try {
        await markClubJoinRequestSeen.mutateAsync({ clubId: item.clubId })
      } catch {}
    }
    openTarget(item.targetUrl)
  }

  const renderItemIcon = (item: any) => {
    if (item.type === 'FEEDBACK_PROMPT') {
      if (item.entityType === 'APP') {
        return (
          <View style={[styles.itemIcon, styles.appIcon]}>
            <Feather name="smartphone" size={16} color={palette.white} />
          </View>
        )
      }
      if (item.entityType === 'TD') {
        const tdName =
          item.context?.name ??
          (String(item.body || '').match(/"([^"]+)"/)?.[1] ?? 'Tournament director')
        return (
          <View style={styles.avatarWrap}>
            <RemoteUserAvatar
              uri={item.avatarUrl ?? item.context?.avatarUrl ?? null}
              size={32}
              fallback="initials"
              initialsLabel={tdName}
            />
          </View>
        )
      }
      return (
        <EntityImage
          uri={item.avatarUrl ?? item.context?.imageUrl ?? null}
          style={styles.entityImage}
          resizeMode="cover"
          placeholderResizeMode="contain"
        />
      )
    }

    if (item.type === 'CLUB_JOIN_REQUEST') {
      return (
        <View style={styles.itemIcon}>
          <Feather name="users" size={16} color={palette.white} />
        </View>
      )
    }

    return (
      <View style={styles.itemIcon}>
        <Feather name={item.type === 'TOURNAMENT_INVITATION' ? 'mail' : 'bell'} size={16} color={palette.white} />
      </View>
    )
  }

  const renderFeedbackBody = (text: string) => {
    const safe = String(text ?? '')
    const parts = safe.split(/(".*?")/g)
    return (
      <Text style={styles.itemBody}>
        {parts.map((part, idx) => {
          const quoted = part.startsWith('"') && part.endsWith('"')
          if (!quoted) return <Text key={`${idx}-${part}`}>{part}</Text>
          return (
            <Text key={`${idx}-${part}`} style={styles.itemBodyStrong}>
              {part.slice(1, -1)}
            </Text>
          )
        })}
      </Text>
    )
  }

  const promptContextCard = useMemo(() => {
    if (!activePrompt) return null
    if (activePrompt.entityType === 'TOURNAMENT') {
      const t = tournamentPreviewQuery.data as any
      const title =
        t?.title ??
        activePrompt.context?.title ??
        (String(activePrompt.subtitle || '').match(/"([^"]+)"/)?.[1] ?? 'Tournament')
      const dateLabel =
        t?.startDate || t?.endDate
          ? formatDateRange(t?.startDate, t?.endDate)
          : activePrompt.context?.date ?? 'Date TBD'
      const formatMap: Record<string, string> = {
        SINGLE_ELIMINATION: 'Single Elimination',
        ROUND_ROBIN: 'Round Robin',
        MLP: 'MLP',
        INDY_LEAGUE: 'Indy League',
        LEAGUE_ROUND_ROBIN: 'League Round Robin',
        ONE_DAY_LADDER: 'One Day Ladder',
        LADDER_LEAGUE: 'Ladder League',
      }
      const formatLabel = t?.format
        ? formatMap[String(t.format)] ?? String(t.format).replace(/_/g, ' ')
        : activePrompt.context?.format ?? 'Tournament'
      const addressLabel = formatLocation([t?.venueName, t?.venueAddress]) || activePrompt.context?.address || 'Address TBD'
      return (
        <FeedbackEntityContextCard
          entityType="TOURNAMENT"
          title={title}
          imageUrl={t?.image ?? activePrompt.context?.imageUrl ?? null}
          formatLabel={formatLabel && formatLabel !== 'Tournament' ? formatLabel : null}
          dateLabel={dateLabel && dateLabel !== 'Date TBD' ? dateLabel : null}
          addressLabel={addressLabel && addressLabel !== 'Address TBD' ? addressLabel : null}
        />
      )
    }
    if (activePrompt.entityType === 'CLUB') {
      const c = clubPreviewQuery.data as any
      const title = c?.name ?? activePrompt.context?.title ?? 'Club'
      const addressLabel = formatLocation([c?.city, c?.state]) || activePrompt.context?.address || 'Address TBD'
      const rawMembers = Number(c?.followersCount ?? activePrompt.context?.membersCount ?? 0)
      const members = Number.isFinite(rawMembers) ? Math.max(1, rawMembers) : 1
      return (
        <FeedbackEntityContextCard
          entityType="CLUB"
          title={title}
          imageUrl={c?.logoUrl ?? activePrompt.context?.imageUrl ?? null}
          membersLabel={`${members} members`}
          addressLabel={addressLabel && addressLabel !== 'Address TBD' ? addressLabel : null}
        />
      )
    }
    if (activePrompt.entityType === 'TD') {
      const p = tdPreviewQuery.data as any
      const name = p?.name || activePrompt.context?.name || 'Tournament director'
      const tournamentTitle =
        activePrompt.context?.tournamentTitle ??
        (String(activePrompt.subtitle || '').match(/"([^"]+)"/g)?.[1]?.replace(/"/g, '') ?? null)
      const tournamentDate = activePrompt.context?.tournamentDate ?? null
      return (
        <FeedbackEntityContextCard
          entityType="TD"
          name={name}
          avatarUrl={p?.image ?? activePrompt.context?.avatarUrl ?? null}
          tournamentLabel={tournamentTitle ? `${tournamentTitle}${tournamentDate ? ` (${tournamentDate})` : ''}` : null}
        />
      )
    }
    return null
  }, [activePrompt, tournamentPreviewQuery.data, clubPreviewQuery.data, tdPreviewQuery.data])

  return (
    <PageLayout>
      <View style={styles.page}>
        <SurfaceCard style={styles.devCard}>
          <View style={styles.devRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.devTitle}>Test: feedback prompts in bell</Text>
              <Text style={styles.devBody}>Toggle test FEEDBACK_PROMPT notifications.</Text>
            </View>
            <Switch
              value={devFeedbackPromptsEnabled}
              onValueChange={setDevFeedbackPromptsEnabled}
              trackColor={{ false: '#D8D8DC', true: '#9CD9A3' }}
              thumbColor={devFeedbackPromptsEnabled ? '#1E7A32' : '#F4F4F5'}
            />
          </View>
        </SurfaceCard>
        {!isAuthenticated ? <EmptyState title="Sign in required" body="Sign in to view your notifications." /> : null}
        {isAuthenticated && notificationsQuery.isLoading ? <LoadingBlock label="Loading notifications..." /> : null}
        {isAuthenticated && !notificationsQuery.isLoading && items.length === 0 ? (
          <EmptyState title="No notifications yet" body="New invitations and feedback prompts will appear here." />
        ) : null}

        {items.map((item) => (
          <Pressable key={item.id} onPress={() => void onNotificationPress(item)}>
            <SurfaceCard style={styles.itemCard}>
              <View style={styles.itemHead}>
                {renderItemIcon(item)}
                <View style={{ flex: 1 }}>
                  <View style={styles.itemTitleRow}>
                    <Text style={styles.itemTitle}>{item.title}</Text>
                    {item.type === 'FEEDBACK_PROMPT' ? (
                      <RatingStarIcon size={15} filled color="#F2C94C" />
                    ) : null}
                  </View>
                  {item.type === 'FEEDBACK_PROMPT' || item.type === 'CLUB_JOIN_REQUEST' ? (
                    renderFeedbackBody(item.body)
                  ) : (
                    <Text style={styles.itemBody}>{item.body}</Text>
                  )}
                </View>
              </View>
            </SurfaceCard>
          </Pressable>
        ))}
      </View>

      <FeedbackRatingModal
        open={Boolean(activePrompt)}
        onClose={() => setActivePrompt(null)}
        entityType={(activePrompt?.entityType ?? 'APP') as FeedbackEntityType}
        entityId={activePrompt?.entityId ?? 'GLOBAL'}
        title={activePrompt?.title ?? 'Rate'}
        titleBelow={
          activePrompt?.entityType === 'APP' ? (
            <View style={styles.appModalLogoWrap}>
              <PiqleLogo height={28} />
            </View>
          ) : undefined
        }
        subtitle={activePrompt?.entityType === 'APP' ? activePrompt?.subtitle ?? '' : ''}
        contextCard={activePrompt?.entityType === 'APP' ? undefined : promptContextCard}
        onSubmitted={() => {
          void notificationsQuery.refetch()
        }}
      />
    </PageLayout>
  )
}

const styles = StyleSheet.create({
  page: { gap: spacing.md },
  devCard: { padding: spacing.md },
  devRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  devTitle: { color: palette.text, fontSize: 14, fontWeight: '700' },
  devBody: { marginTop: 4, color: palette.textMuted, fontSize: 12 },
  itemCard: { padding: spacing.md },
  itemHead: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  itemIcon: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appIcon: {
    backgroundColor: '#111827',
  },
  avatarWrap: {
    width: 32,
    height: 32,
    borderRadius: 999,
    overflow: 'hidden',
  },
  entityImage: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: palette.surfaceMuted,
  },
  itemTitle: { color: palette.text, fontSize: 15, fontWeight: '700' },
  itemTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemBody: { marginTop: 4, color: palette.textMuted, fontSize: 13, lineHeight: 18 },
  itemBodyStrong: { color: palette.text, fontWeight: '700' },
  contextCard: {
    padding: spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  clubContextCard: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: palette.border,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  tdContextCard: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: palette.border,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  clubContextHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  clubContextHero: {
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
    backgroundColor: palette.surface,
  },
  clubContextBody: {
    padding: spacing.md,
  },
  entityContextTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '700',
  },
  clubContextMetaGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  clubLocationRow: {
    justifyContent: 'flex-end',
  },
  tournamentContextCard: {
    overflow: 'hidden',
  },
  tournamentContextHero: {
    position: 'relative',
    overflow: 'hidden',
    padding: spacing.md,
    minHeight: 88,
    justifyContent: 'center',
    backgroundColor: palette.surface,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  tournamentContextHeroMain: {
    flex: 1,
    minWidth: 0,
  },
  tournamentContextFormatRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tournamentContextFormatText: {
    color: palette.textMuted,
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  tournamentContextThumb: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: palette.surfaceMuted,
  },
  tournamentContextBody: {
    padding: spacing.md,
    gap: 8,
  },
  tournamentContextMetaGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  tournamentContextMetaCell: {
    flex: 1,
  },
  tournamentContextMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tournamentContextMetaText: {
    color: palette.text,
    fontSize: 14,
  },
  contextMain: {
    flex: 1,
    gap: 4,
    paddingTop: 1,
  },
  contextImage: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: palette.surfaceMuted,
  },
  contextAvatarWrap: {
    width: 40,
    height: 40,
    borderRadius: 999,
    overflow: 'hidden',
  },
  contextMeta: {
    color: palette.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  appModalLogoWrap: {
    alignItems: 'flex-start',
    paddingVertical: spacing.xs,
  },
})
