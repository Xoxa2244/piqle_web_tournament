import { router } from 'expo-router'
import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { getPalette, spacing, type AppTheme } from '../../lib/theme'
import { BackCircleButton } from './BackCircleButton'

const HEADER_DIVIDER_COLOR = 'rgba(0,0,0,0.06)'
const HEADER_DIVIDER_WIDTH = StyleSheet.hairlineWidth

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
        { backgroundColor: colors.surfaceOverlay, borderBottomColor: HEADER_DIVIDER_COLOR },
      ]}
      edges={['top']}
    >
      <View style={styles.header}>
        <BackCircleButton onPress={onBack ?? (() => router.back())} style={styles.backButton} />
        <Text numberOfLines={1} style={[styles.title, { color: colors.primary }]}>
          {title}
        </Text>
        <View style={styles.rightSlot}>{right ?? <View style={styles.placeholder} />}</View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderBottomWidth: HEADER_DIVIDER_WIDTH,
    borderBottomColor: HEADER_DIVIDER_COLOR,
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
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
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
