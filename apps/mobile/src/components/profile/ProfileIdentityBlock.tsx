import { Feather } from '@expo/vector-icons'
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native'

import { OptionalLinearGradient } from '../OptionalLinearGradient'
import { RemoteUserAvatar } from '../RemoteUserAvatar'
import { SurfaceCard } from '../ui'
import { buildWebUrl } from '../../lib/config'
import { palette, radius, spacing } from '../../lib/theme'
import { useAppTheme } from '../../providers/ThemeProvider'

type DuprConnectButtonProps = {
  label: string
  icon: keyof typeof Feather.glyphMap
  onPress?: () => void
}

const DuprConnectButton = ({ label, icon, onPress }: DuprConnectButtonProps) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [styles.duprConnectBtn, pressed && styles.duprConnectBtnPressed]}
  >
    <Feather name={icon} size={16} color="#FFFFFF" />
    <Text style={styles.duprConnectLabel}>{label}</Text>
  </Pressable>
)

export type ProfileHeroCardProps = {
  displayName: string
  /** Male / Female / Other / Gender not specified */
  genderLabel: string
  imageUri: string | null | undefined
  initialsLabel: string
  locationLabel: string
}

/** Хиро в карточке с градиентом (как экран клуба), для слота под TopBar. */
export function ProfileHeroCard({
  displayName,
  genderLabel,
  imageUri,
  initialsLabel,
  locationLabel,
}: ProfileHeroCardProps) {
  const { colors } = useAppTheme()
  const locationLine = locationLabel || 'Location not set'
  const canOpenMaps = Boolean(locationLine && locationLine !== 'Location not set')

  const handleOpenMaps = () => {
    if (!canOpenMaps) return
    void Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationLine)}`,
    )
  }

  return (
    <View style={styles.heroWrap}>
      <SurfaceCard padded={false} style={styles.profileHeroCard}>
        <View style={[styles.profileHeroCardHeader, { backgroundColor: colors.surface }]}>
          <OptionalLinearGradient
            pointerEvents="none"
            colors={['rgba(40, 205, 65, 0.10)', 'rgba(82, 224, 104, 0.06)', 'rgba(255, 255, 255, 0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.profileHeroGradient}
          />
          <View style={styles.profileHeroRow}>
            <RemoteUserAvatar uri={imageUri} size={72} fallback="initials" initialsLabel={initialsLabel} />
            <View style={styles.profileHeroTextCol}>
              <Text style={[styles.userName, { color: colors.text }]} numberOfLines={2}>
                {displayName}
              </Text>
              <Text style={[styles.profileGenderLine, { color: colors.textMuted }]} numberOfLines={1}>
                {genderLabel}
              </Text>
              <Pressable
                disabled={!canOpenMaps}
                onPress={handleOpenMaps}
                style={({ pressed }) => [
                  styles.userLocationRow,
                  pressed && canOpenMaps && styles.userLocationRowPressed,
                ]}
              >
                <Feather name="map-pin" size={14} color={canOpenMaps ? colors.primary : colors.textMuted} />
                <Text
                  style={[
                    styles.userLocationLine,
                    { color: canOpenMaps ? colors.primary : colors.textMuted },
                    !canOpenMaps && styles.userLocationLineDisabled,
                  ]}
                  numberOfLines={2}
                >
                  {locationLine}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </SurfaceCard>
    </View>
  )
}

export type ProfileStatsDuprSectionProps = {
  clubsJoinedCount: number
  tournamentsPlayedCount: number
  tournamentsCreatedCount: number
  singlesRatingLabel: string
  doublesRatingLabel: string
  /** Показывать «Connect DUPR» только на своём профиле, если аккаунт не привязан */
  showDuprConnect?: boolean
  onDuprConnect?: () => void
  duprConnectPending?: boolean
}

export function ProfileStatsDuprSection({
  clubsJoinedCount,
  tournamentsPlayedCount,
  tournamentsCreatedCount,
  singlesRatingLabel,
  doublesRatingLabel,
  showDuprConnect = false,
  onDuprConnect,
  duprConnectPending = false,
}: ProfileStatsDuprSectionProps) {
  return (
    <View style={styles.statsDuprRoot}>
      <View style={styles.statsGridWrap}>
        <View style={styles.statsGrid}>
          <View style={styles.statsItem}>
            <Text style={styles.statsValue}>{clubsJoinedCount}</Text>
            <Text style={styles.statsLabel}>Clubs</Text>
          </View>
          <View style={styles.statsItem}>
            <Text style={styles.statsValue}>{tournamentsPlayedCount}</Text>
            <Text style={styles.statsLabel}>Played</Text>
          </View>
          <View style={styles.statsItem}>
            <Text style={styles.statsValue}>{tournamentsCreatedCount}</Text>
            <Text style={styles.statsLabel}>Hosted</Text>
          </View>
        </View>
      </View>

      <OptionalLinearGradient
        colors={['#3977DD', '#061660']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        fallbackColor="#3977DD"
        style={styles.duprCardOuter}
      >
        <View style={styles.duprHeaderRow}>
          <Image
            source={{ uri: buildWebUrl('/logodupr.png') }}
            style={styles.duprLogoImage}
            resizeMode="contain"
            accessibilityLabel="DUPR"
          />
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

        {showDuprConnect ? (
          <DuprConnectButton
            label={duprConnectPending ? 'Connecting...' : 'Connect DUPR'}
            icon="link"
            onPress={onDuprConnect}
          />
        ) : null}
      </OptionalLinearGradient>
    </View>
  )
}

const styles = StyleSheet.create({
  /** Как `heroWrap` у экрана клуба (`app/clubs/[id]/index.tsx`). */
  heroWrap: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  profileHeroCard: {
    overflow: 'hidden',
  },
  profileHeroCardHeader: {
    position: 'relative',
    overflow: 'hidden',
    padding: spacing.md,
  },
  profileHeroGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  profileHeroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  profileHeroTextCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 4,
  },
  userName: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.35,
  },
  profileGenderLine: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
  },
  userLocationRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
  },
  userLocationRowPressed: {
    opacity: 0.82,
  },
  userLocationLine: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  userLocationLineDisabled: {
    fontWeight: '500',
  },
  statsDuprRoot: {
    gap: spacing.md,
  },
  statsGridWrap: {},
  statsGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statsItem: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingVertical: 10,
    alignItems: 'center',
  },
  statsValue: { color: palette.text, fontSize: 18, fontWeight: '800' },
  statsLabel: { marginTop: 2, color: palette.textMuted, fontSize: 12, fontWeight: '600' },
  duprCardOuter: {
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
    overflow: 'hidden',
  },
  duprHeaderRow: {
    alignSelf: 'flex-start',
  },
  duprLogoImage: {
    width: 55,
    height: 16,
  },
  duprPillsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  duprPill: {
    flex: 1,
    minWidth: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    alignItems: 'center',
  },
  duprPillLabel: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  duprPillValue: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
    alignSelf: 'center',
    fontVariant: ['tabular-nums'],
  },
  duprConnectBtn: {
    minHeight: 44,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  duprConnectBtnPressed: {
    opacity: 0.85,
  },
  duprConnectLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
})
