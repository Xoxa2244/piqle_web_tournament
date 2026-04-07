import { Feather } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native'

import { AppBottomSheet, AppConfirmActions } from '../src/components/AppBottomSheet'
import { AuthRequiredCard } from '../src/components/AuthRequiredCard'
import {
  BellNotificationLeadIcon,
  BELL_NOTIFICATION_ERROR_COLOR,
  isBellErrorLike,
} from '../src/components/BellNotificationLeadIcon'
import { FeedbackRatingModal } from '../src/components/FeedbackRatingModal'
import { FeedbackEntityContextCard } from '../src/components/FeedbackEntityContextCard'
import { NotificationQuotedBody } from '../src/components/NotificationQuotedBody'
import { RatingStarIcon } from '../src/components/icons/RatingStarIcon'
import { PiqleLogo } from '../src/components/navigation/PiqleLogo'
import { PageLayout } from '../src/components/navigation/PageLayout'
import { SwipeDismissNotificationRow } from '../src/components/SwipeDismissNotificationRow'
import { EmptyState, LoadingBlock, SurfaceCard } from '../src/components/ui'
import { formatDateRange, formatLocation } from '../src/lib/formatters'
import { palette, spacing } from '../src/lib/theme'
import { useRealtimeAwareQueryOptions } from '../src/lib/realtimePoll'
import { trpc } from '../src/lib/trpc'
import { useAuth } from '../src/providers/AuthProvider'
import { useNotificationSwipeHidden } from '../src/providers/NotificationSwipeHiddenProvider'
import { useAppTheme } from '../src/providers/ThemeProvider'
import { useToast } from '../src/providers/ToastProvider'

type FeedbackEntityType = 'TOURNAMENT' | 'CLUB' | 'TD' | 'APP'

/** Тап → переход: убрать строку из колокольника (pending club/tournament access обрабатываются на сервере). */
const BELL_DISMISS_ON_NAVIGATE_TYPES = new Set([
  'TOURNAMENT_ACCESS_GRANTED',
  'TOURNAMENT_ACCESS_DENIED',
  'WAITLIST_PROMOTED',
  'REGISTRATION_WAITLIST',
  'MATCH_REMINDER',
  'PAYMENT_STATUS',
])

export default function NotificationsScreen() {
  const { token } = useAuth()
  const toast = useToast()
  const { colors } = useAppTheme()
  const isAuthenticated = Boolean(token)
  const realtimeAwareQueryOptions = useRealtimeAwareQueryOptions()
  const [openingNotificationId, setOpeningNotificationId] = useState<string | null>(null)
  const [clearAllSheetOpen, setClearAllSheetOpen] = useState(false)
  const navigationLock = useRef<{ id: string; at: number } | null>(null)
  /** Сервер не хранит dismiss для club/staff pending — скрываем строку локально до новой активности (AsyncStorage в провайдере). */
  const { swipeHiddenIds, setSwipeHiddenIds, swipeHiddenSnapRef, clearSwipeHidden } = useNotificationSwipeHidden()
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
  const utils = trpc.useUtils()
  const notificationsQuery = trpc.notification.list.useQuery(
    { limit: 40 },
    { enabled: isAuthenticated, ...realtimeAwareQueryOptions }
  )
  const clearAllMutation = trpc.notification.clearAll.useMutation({
    onSuccess: async () => {
      clearSwipeHidden()
      await utils.notification.list.invalidate()
      toast.success('All notifications cleared.')
    },
    onError: (e: any) => toast.error(e?.message || 'Could not clear notifications.'),
  })
  const dismissNotification = trpc.notification.dismiss.useMutation({
    onSuccess: async () => {
      await utils.notification.list.invalidate()
    },
    onError: (e: any) => toast.error(e?.message || 'Could not remove this notification.'),
  })

  const notifyNotificationListReflow = useCallback(() => {
    LayoutAnimation.configureNext({
      duration: 320,
      update: {
        type: LayoutAnimation.Types.spring,
        springDamping: 0.82,
      },
      delete: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
    })
  }, [])

  const removeNotificationFromListCache = useCallback(
    (notificationId: string) => {
      utils.notification.list.setData({ limit: 40 }, (old) => {
        if (!old?.items) return old
        const items = old.items as { id?: string; readAt?: string | null }[]
        const removed = items.find((x) => String(x.id ?? '') === notificationId)
        const nextItems = items.filter((x) => String(x.id ?? '') !== notificationId)
        const wasUnread = Boolean(removed && !(removed.readAt ?? null))
        return {
          ...old,
          items: nextItems,
          unreadCount: Math.max(0, (old.unreadCount ?? 0) - (wasUnread ? 1 : 0)),
        }
      })
    },
    [utils.notification.list],
  )

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true)
    }
  }, [])

  useEffect(() => {
    const list = (notificationsQuery.data?.items ?? []) as Array<{ id?: string; body?: string; createdAt?: string }>
    setSwipeHiddenIds((prev) => {
      if (prev.size === 0) return prev
      const next = new Set(prev)
      for (const id of prev) {
        const cur = list.find((x) => String(x.id) === id)
        const snap = swipeHiddenSnapRef.current.get(id)
        if (!cur) {
          next.delete(id)
          swipeHiddenSnapRef.current.delete(id)
          continue
        }
        if (
          snap &&
          (cur.body !== snap.body || String(cur.createdAt ?? '') !== String(snap.createdAt ?? ''))
        ) {
          next.delete(id)
          swipeHiddenSnapRef.current.delete(id)
        }
      }
      return next.size === prev.size ? prev : next
    })
  }, [notificationsQuery.data?.items])
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
    const merged = serverItems

    const hideSwipe = (rows: any[]) =>
      rows.filter((x) => !swipeHiddenIds.has(String(x.id ?? '')))
    return hideSwipe(merged)
  }, [notificationsQuery.data?.items, swipeHiddenIds])

  const notificationTextStyles = useMemo(
    () => ({
      base: [styles.itemBody, { color: colors.textMuted }] as const,
      strong: [styles.itemBodyStrong, { color: colors.text }] as const,
    }),
    [colors.text, colors.textMuted],
  )

  const onClearAllPress = useCallback(() => {
    setClearAllSheetOpen(true)
  }, [])

  const headerCircleStyles = useMemo(
    () =>
      StyleSheet.create({
        headerActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
        headerIconCircle: {
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
        },
        headerIconCirclePressed: {
          backgroundColor: colors.surfaceMuted,
          borderColor: colors.brandPrimaryBorder,
          transform: [{ scale: 0.94 }],
        },
      }),
    [colors],
  )

  const notificationsTopBarRight = useMemo(() => {
    if (!isAuthenticated) return null
    const busy = clearAllMutation.isPending
    return (
      <View style={headerCircleStyles.headerActionsRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear all notifications from the list"
          disabled={busy}
          onPress={onClearAllPress}
          style={({ pressed }) => [
            headerCircleStyles.headerIconCircle,
            pressed && !busy && headerCircleStyles.headerIconCirclePressed,
          ]}
        >
          {clearAllMutation.isPending ? (
            <ActivityIndicator size="small" color={colors.text} />
          ) : (
            <Feather name="trash-2" size={18} color={colors.text} />
          )}
        </Pressable>
      </View>
    )
  }, [isAuthenticated, headerCircleStyles, colors.text, clearAllMutation.isPending, onClearAllPress])

  const openTarget = (targetUrl?: string) => {
    if (!targetUrl) return
    if (targetUrl.startsWith('/')) {
      router.push(targetUrl as never)
    }
  }

  const onNotificationPress = async (item: any) => {
    const now = Date.now()
    const locked = navigationLock.current
    if (locked && locked.id === String(item?.id ?? '') && now - locked.at < 1200) return
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
    const targetUrl = String(item?.targetUrl ?? '')
    if (!targetUrl.startsWith('/')) return

    // Лочим повторные тапы на этой нотификации: иначе можно поставить несколько переходов в очередь.
    navigationLock.current = { id: String(item?.id ?? ''), at: now }
    setOpeningNotificationId(String(item?.id ?? ''))

    // Club join request: не dismiss здесь — на экране клуба при пустой очереди (clubs/[id]).
    // markClubJoinRequestSeen — на экране клуба при tab=members.
    const idStr = String(item.id ?? '')
    const isDevBell = idStr.startsWith('dev-')
    const tp = String(item.type ?? '')
    const dismissBellOnNavigate =
      !isDevBell &&
      (tp === 'CLUB_MEMBER_LEFT' ||
        tp === 'TOURNAMENT_ACCESS_PENDING' ||
        BELL_DISMISS_ON_NAVIGATE_TYPES.has(tp))
    if (dismissBellOnNavigate) {
      void dismissNotification
        .mutateAsync({ notificationId: idStr })
        .then(() => utils.notification.list.invalidate())
        .catch(() => {})
    }

    // Участники / join requests: иначе после тапа виден старый кэш до pull-to-refresh.
    const clubBellRefreshTypes = new Set(['CLUB_MEMBER_LEFT', 'CLUB_JOIN_REQUEST', 'CLUB_MEMBER_JOINED'])
    const clubIdFromBell = item.clubId != null ? String(item.clubId).trim() : ''
    if (clubIdFromBell && !isDevBell && clubBellRefreshTypes.has(tp)) {
      void Promise.all([
        utils.club.get.invalidate({ id: clubIdFromBell }),
        utils.club.listMembers.invalidate({ clubId: clubIdFromBell }),
      ]).catch(() => undefined)
    }

    openTarget(targetUrl)
    setTimeout(() => {
      setOpeningNotificationId((prev) => (prev === String(item?.id ?? '') ? null : prev))
    }, 1200)
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
    <PageLayout topBarTitle="Notifications" topBarRightSlot={notificationsTopBarRight}>
      <View style={styles.page}>
        {!isAuthenticated ? <AuthRequiredCard title="Sign in required" body="Sign in to view your notifications." /> : null}
        {isAuthenticated && notificationsQuery.isLoading ? <LoadingBlock label="Loading notifications..." /> : null}
        {isAuthenticated && !notificationsQuery.isLoading && items.length === 0 ? (
          <EmptyState title="No notifications yet" body="New invitations and feedback prompts will appear here." />
        ) : null}

        {items.map((item) => {
          const errorLike = isBellErrorLike(item)
          return (
            <SwipeDismissNotificationRow
              key={item.id}
              disabled={openingNotificationId === String(item.id)}
              onDismiss={async () => {
                const id = String(item.id)
                const localHide =
                  item.type === 'CLUB_JOIN_REQUEST' || item.type === 'TOURNAMENT_ACCESS_PENDING'
                notifyNotificationListReflow()
                if (localHide) {
                  swipeHiddenSnapRef.current.set(id, {
                    body: String(item.body ?? ''),
                    createdAt: String(item.createdAt ?? ''),
                  })
                  setSwipeHiddenIds((prev) => new Set(prev).add(id))
                } else {
                  removeNotificationFromListCache(id)
                }
                try {
                  await dismissNotification.mutateAsync({ notificationId: id })
                  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
                  toast.success('Notification removed.')
                } catch (e: any) {
                  if (localHide) {
                    swipeHiddenSnapRef.current.delete(id)
                    setSwipeHiddenIds((prev) => {
                      const n = new Set(prev)
                      n.delete(id)
                      return n
                    })
                  } else {
                    void utils.notification.list.invalidate()
                  }
                  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
                  toast.error(e?.message ?? 'Could not remove notification.')
                }
              }}
            >
              <Pressable
                disabled={openingNotificationId === String(item.id)}
                onPress={() => void onNotificationPress(item)}
                style={({ pressed }) => [
                  pressed ? { opacity: 0.92 } : null,
                  openingNotificationId === String(item.id) ? { opacity: 0.72 } : null,
                ]}
              >
                <SurfaceCard style={styles.itemCard}>
                  <View style={styles.itemHead}>
                    <BellNotificationLeadIcon item={item} />
                    <View style={{ flex: 1 }}>
                      <View style={styles.itemTitleRow}>
                        <Text
                          style={[
                            styles.itemTitle,
                            { color: errorLike ? BELL_NOTIFICATION_ERROR_COLOR : colors.text },
                          ]}
                        >
                          {item.title}
                        </Text>
                        {item.type === 'FEEDBACK_PROMPT' ? (
                          <RatingStarIcon size={15} filled color="#F2C94C" />
                        ) : null}
                      </View>
                      <NotificationQuotedBody
                        text={item.body}
                        baseStyle={notificationTextStyles.base}
                        strongStyle={notificationTextStyles.strong}
                      />
                    </View>
                    {openingNotificationId === String(item.id) ? (
                      <View style={styles.openingSpinner} pointerEvents="none">
                        <ActivityIndicator size="small" color={colors.textMuted} />
                      </View>
                    ) : null}
                  </View>
                </SurfaceCard>
              </Pressable>
            </SwipeDismissNotificationRow>
          )
        })}
      </View>

      <AppBottomSheet
        open={clearAllSheetOpen}
        onClose={() => setClearAllSheetOpen(false)}
        title="Clear all notifications?"
        subtitle="They will disappear from this list. New invitations and reminders will show again when available."
        footer={
          <AppConfirmActions
            intent="destructive"
            cancelLabel="Cancel"
            confirmLabel="Clear all"
            onCancel={() => setClearAllSheetOpen(false)}
            onConfirm={() => {
              void clearAllMutation
                .mutateAsync()
                .then(() => setClearAllSheetOpen(false))
                .catch(() => {})
            }}
            confirmLoading={clearAllMutation.isPending}
          />
        }
      />

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
  itemCard: { padding: spacing.md },
  itemHead: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  itemTitle: { fontSize: 15, fontWeight: '700' },
  itemTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemBody: { marginTop: 4, color: palette.textMuted, fontSize: 13, lineHeight: 18 },
  itemBodyStrong: { color: palette.text, fontWeight: '700' },
  openingSpinner: {
    width: 28,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
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
