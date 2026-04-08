import { Feather } from '@expo/vector-icons'
import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'

import { EntityImage } from './EntityImage'
import { RemoteUserAvatar } from './RemoteUserAvatar'
import { TournamentThumbnail } from './TournamentThumbnail'
import { palette } from '../lib/theme'

const LEAD_SIZE = 48

/** Единый красный для заголовков ошибок в колокольчике (см. `notifications.tsx`). */
export const BELL_NOTIFICATION_ERROR_COLOR = '#DC2626'

export function isBellErrorLike(item: any): boolean {
  if (item?.type === 'TOURNAMENT_ACCESS_DENIED') return true
  if (item?.type === 'PAYMENT_STATUS') {
    const s = item?.paymentStatus
    return s === 'FAILED' || s === 'CANCELED'
  }
  return false
}

function usesTournamentThumbnail(item: any): boolean {
  if (!item?.tournamentId) return false
  const t = item.type
  return (
    t === 'TOURNAMENT_INVITATION' ||
    t === 'TOURNAMENT_ACCESS_GRANTED' ||
    t === 'TOURNAMENT_ACCESS_DENIED' ||
    t === 'WAITLIST_PROMOTED' ||
    t === 'REGISTRATION_WAITLIST' ||
    t === 'MATCH_REMINDER'
  )
}

/**
 * Левая колонка в списке уведомлений: аватар / лого турнира / иконка оплаты и т.д.
 */
export function BellNotificationLeadIcon({ item }: { item: any }) {
  const styles = useMemo(() => createStyles(), [])

  if (item.type === 'FEEDBACK_PROMPT') {
    if (item.entityType === 'APP') {
      return (
        <View style={[styles.iconCircle, styles.appIcon]}>
          <Feather name="smartphone" size={18} color={palette.white} />
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
            size={LEAD_SIZE}
            fallback="initials"
            initialsLabel={tdName}
          />
        </View>
      )
    }
    if (item.entityType === 'TOURNAMENT') {
      return (
        <TournamentThumbnail
          imageUri={item.avatarUrl ?? item.context?.imageUrl ?? null}
          size={LEAD_SIZE}
        />
      )
    }
    return (
      <EntityImage
        uri={item.avatarUrl ?? item.context?.imageUrl ?? null}
        style={styles.entitySquare}
        resizeMode="cover"
        placeholderResizeMode="contain"
      />
    )
  }

  if (
    item.type === 'CHAT_MENTION' ||
    item.type === 'CLUB_JOIN_REQUEST' ||
    item.type === 'CLUB_MEMBER_LEFT' ||
    item.type === 'CLUB_MEMBER_JOINED'
  ) {
    return (
      <View style={styles.avatarWrap}>
        <RemoteUserAvatar
          uri={item.userAvatarUrl ?? null}
          size={LEAD_SIZE}
          fallback="initials"
          initialsLabel={item.requesterName ?? item.clubName ?? 'Member'}
        />
      </View>
    )
  }

  if (item.type === 'TOURNAMENT_ACCESS_PENDING') {
    return (
      <View style={styles.avatarWrap}>
        <RemoteUserAvatar
          uri={item.userAvatarUrl ?? null}
          size={LEAD_SIZE}
          fallback="initials"
          initialsLabel={item.requesterName ?? 'Request'}
        />
      </View>
    )
  }

  if (item.type === 'PAYMENT_STATUS') {
    return (
      <View style={styles.iconCircle}>
        <Feather name="credit-card" size={18} color={palette.white} />
      </View>
    )
  }

  if (usesTournamentThumbnail(item)) {
    const uri = item.tournamentImage ?? item.tournamentImageUrl ?? null
    return <TournamentThumbnail imageUri={uri} size={LEAD_SIZE} />
  }

  const iconName = item.type === 'TOURNAMENT_INVITATION' ? 'mail' : 'bell'
  return (
    <View style={styles.iconCircle}>
      <Feather name={iconName} size={18} color={palette.white} />
    </View>
  )
}

const createStyles = () =>
  StyleSheet.create({
    iconCircle: {
      width: LEAD_SIZE,
      height: LEAD_SIZE,
      borderRadius: LEAD_SIZE / 2,
      backgroundColor: palette.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    appIcon: {
      backgroundColor: '#111827',
    },
    avatarWrap: {
      width: LEAD_SIZE,
      height: LEAD_SIZE,
      borderRadius: LEAD_SIZE / 2,
      overflow: 'hidden',
    },
    entitySquare: {
      width: LEAD_SIZE,
      height: LEAD_SIZE,
      borderRadius: LEAD_SIZE / 2,
      backgroundColor: palette.surfaceMuted,
    },
  })
