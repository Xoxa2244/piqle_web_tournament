import { router } from 'expo-router'
import type { ReactNode } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

<<<<<<< Updated upstream
import { getPalette, spacing, type AppTheme } from '../../lib/theme'
=======
import { palette, spacing } from '../../lib/theme'
import { BackCircleButton } from './BackCircleButton'
import { BrandGradientText } from './BrandGradientText'

const HEADER_DIVIDER_COLOR = 'rgba(0,0,0,0.06)'
const HEADER_DIVIDER_WIDTH = StyleSheet.hairlineWidth
>>>>>>> Stashed changes

export const SubpageHeader = ({
  title,
  onBack,
  right,
  themeMode = 'light',
}: {
  title: string
  onBack?: () => void
  right?: ReactNode
  themeMode?: AppTheme
}) => {
  const colors = getPalette(themeMode)

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        { backgroundColor: colors.surfaceOverlay, borderBottomColor: colors.border },
      ]}
      edges={['top']}
    >
      <View style={styles.header}>
<<<<<<< Updated upstream
        <Pressable
          onPress={onBack ?? (() => router.back())}
          style={({ pressed }) => [
            styles.backButton,
            pressed && { backgroundColor: colors.surfaceMuted },
          ]}
        >
          <Feather name="chevron-left" size={20} color={colors.text} />
        </Pressable>

        <Text numberOfLines={1} style={[styles.title, { color: colors.primary }]}>
=======
        <BackCircleButton onPress={onBack ?? (() => router.back())} style={styles.backButton} />

        <BrandGradientText numberOfLines={1} style={styles.title}>
>>>>>>> Stashed changes
          {title}
        </BrandGradientText>

        <View style={styles.rightSlot}>{right ?? <View style={styles.placeholder} />}</View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
<<<<<<< Updated upstream
    borderBottomWidth: 1,
=======
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderBottomWidth: HEADER_DIVIDER_WIDTH,
    borderBottomColor: HEADER_DIVIDER_COLOR,
>>>>>>> Stashed changes
  },
  header: {
    minHeight: 64,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
  },
  backButton: {
    width: 40,
    height: 40,
<<<<<<< Updated upstream
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
=======
>>>>>>> Stashed changes
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
    lineHeight: 36,
    ...(Platform.OS === 'android' ? { textAlignVertical: 'center' as const, includeFontPadding: false } : {}),
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
