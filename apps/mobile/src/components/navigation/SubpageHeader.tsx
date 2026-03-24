import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { getPalette, spacing, type AppTheme } from '../../lib/theme'

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
          {title}
        </Text>

        <View style={styles.rightSlot}>{right ?? <View style={styles.placeholder} />}</View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    borderBottomWidth: 1,
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
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
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
