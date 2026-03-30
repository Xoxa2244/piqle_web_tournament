import { router } from 'expo-router'
import type { ReactNode } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { getPalette, spacing, type AppTheme } from '../../lib/theme'
import { useAppTheme } from '../../providers/ThemeProvider'
import { BackCircleButton } from './BackCircleButton'
import { BrandGradientText } from './BrandGradientText'

const HEADER_DIVIDER_WIDTH = StyleSheet.hairlineWidth

export const SubpageHeader = ({
  title,
  onBack,
  right,
  themeMode,
}: {
  title: string
  onBack?: () => void
  right?: ReactNode
  /** Если не задан — берётся активная тема из `ThemeProvider`. */
  themeMode?: AppTheme
}) => {
  const { theme: contextTheme } = useAppTheme()
  const colors = getPalette(themeMode ?? contextTheme)
  const insets = useSafeAreaInsets()

  return (
    <View
      style={[
        styles.safeArea,
        {
          paddingTop: insets.top,
          backgroundColor: colors.surfaceOverlay,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <View style={styles.header}>
        <BackCircleButton onPress={onBack ?? (() => router.back())} style={styles.backButton} />
        <View style={styles.titleWrap}>
          <BrandGradientText numberOfLines={1} style={styles.title}>
            {title}
          </BrandGradientText>
        </View>
        <View style={styles.rightSlot}>{right ?? <View style={styles.placeholder} />}</View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    borderBottomWidth: HEADER_DIVIDER_WIDTH,
  },
  header: {
    minHeight: 64,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
    height: 36,
    justifyContent: 'center',
  },
  title: {
    textAlign: 'left',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
    lineHeight: 36,
    ...(Platform.OS === 'android'
      ? { textAlignVertical: 'center' as const, includeFontPadding: false }
      : {}),
  },
  rightSlot: {
    minWidth: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  placeholder: {
    width: 40,
    height: 40,
  },
})
