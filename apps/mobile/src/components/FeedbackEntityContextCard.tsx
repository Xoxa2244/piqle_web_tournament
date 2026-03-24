import { Feather } from '@expo/vector-icons'
import { StyleSheet, Text, View } from 'react-native'

import { palette, spacing } from '../lib/theme'
import { EntityImage } from './EntityImage'
import { RemoteUserAvatar } from './RemoteUserAvatar'
import { SurfaceCard } from './ui'

type TournamentProps = {
  entityType: 'TOURNAMENT'
  title: string
  imageUrl?: string | null
  formatLabel?: string | null
  dateLabel?: string | null
  addressLabel?: string | null
}

type ClubProps = {
  entityType: 'CLUB'
  title: string
  imageUrl?: string | null
  addressLabel?: string | null
  membersLabel?: string | null
}

type TdProps = {
  entityType: 'TD'
  name: string
  avatarUrl?: string | null
  tournamentLabel?: string | null
}

type Props = TournamentProps | ClubProps | TdProps

export function FeedbackEntityContextCard(props: Props) {
  if (props.entityType === 'TOURNAMENT') {
    return (
      <SurfaceCard padded={false} style={styles.tournamentCard}>
        <View style={styles.tournamentHero}>
          <EntityImage uri={props.imageUrl} style={styles.tournamentThumb} resizeMode="cover" placeholderResizeMode="contain" />
          <View style={styles.tournamentHeroMain}>
            <Text style={styles.entityTitle} numberOfLines={1}>
              {props.title}
            </Text>
            {props.formatLabel ? (
              <View style={styles.formatRow}>
                <Feather name="award" size={14} color={palette.primary} />
                <Text style={styles.formatText} numberOfLines={1}>
                  {props.formatLabel}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        {(props.dateLabel || props.addressLabel) ? (
          <View style={styles.cardBody}>
            <View style={styles.metaGrid}>
              <View style={styles.metaCell}>
                {props.dateLabel ? (
                  <View style={styles.metaRow}>
                    <Feather name="calendar" size={16} color={palette.primary} />
                    <Text style={styles.metaText}>{props.dateLabel}</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.metaCell}>
                {props.addressLabel ? (
                  <View style={[styles.metaRow, styles.rightAlignRow]}>
                    <Feather name="map-pin" size={16} color={palette.primary} />
                    <Text style={styles.metaText} numberOfLines={1}>
                      {props.addressLabel}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>
        ) : null}
      </SurfaceCard>
    )
  }

  if (props.entityType === 'CLUB') {
    const membersLabel = props.membersLabel?.trim() || '1 member'
    return (
      <SurfaceCard padded={false} style={styles.plainCard}>
        <View style={styles.cardHero}>
          <View style={styles.headerRow}>
            <EntityImage uri={props.imageUrl} style={styles.entityImage} resizeMode="cover" placeholderResizeMode="contain" />
            <Text style={styles.entityTitle} numberOfLines={1}>
              {props.title}
            </Text>
          </View>
        </View>
        {(membersLabel || props.addressLabel) ? (
          <View style={styles.cardBody}>
            <View style={styles.metaGrid}>
              <View style={styles.metaCell}>
                {membersLabel ? (
                  <View style={styles.metaRow}>
                    <Feather name="users" size={16} color={palette.primary} />
                    <Text style={styles.metaText}>{membersLabel}</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.metaCell}>
                {props.addressLabel ? (
                  <View style={[styles.metaRow, styles.rightAlignRow]}>
                    <Feather name="map-pin" size={16} color={palette.primary} />
                    <Text style={styles.metaText} numberOfLines={1}>
                      {props.addressLabel}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>
        ) : null}
      </SurfaceCard>
    )
  }

  return (
    <SurfaceCard padded={false} style={styles.plainCard}>
      <View style={styles.tdRow}>
        <View style={styles.avatarWrap}>
          <RemoteUserAvatar uri={props.avatarUrl ?? null} size={40} fallback="initials" initialsLabel={props.name} />
        </View>
        <View style={styles.tdMain}>
          <Text style={styles.entityTitle}>{props.name}</Text>
          {props.tournamentLabel ? (
            <View style={styles.metaRow}>
              <Feather name="award" size={16} color={palette.primary} />
              <Text style={styles.metaText} numberOfLines={1}>
                {props.tournamentLabel}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </SurfaceCard>
  )
}

const styles = StyleSheet.create({
  tournamentCard: {
    overflow: 'hidden',
  },
  plainCard: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: palette.border,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  tournamentHero: {
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
  cardHero: {
    padding: spacing.md,
    backgroundColor: palette.surface,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  tournamentHeroMain: {
    flex: 1,
    minWidth: 0,
  },
  tournamentThumb: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: palette.surfaceMuted,
  },
  entityImage: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: palette.surfaceMuted,
  },
  cardBody: {
    padding: spacing.md,
  },
  metaGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  metaCell: {
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rightAlignRow: {
    justifyContent: 'flex-end',
  },
  formatRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  formatText: {
    color: palette.textMuted,
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  entityTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
  },
  metaText: {
    color: palette.text,
    fontSize: 14,
    flexShrink: 1,
  },
  tdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  tdMain: {
    flex: 1,
    gap: 4,
  },
  avatarWrap: {
    width: 40,
    height: 40,
    borderRadius: 999,
    overflow: 'hidden',
  },
})
