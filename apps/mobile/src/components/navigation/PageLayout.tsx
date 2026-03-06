import type { PropsWithChildren } from 'react'
import { ScrollView, StyleProp, StyleSheet, View, type ViewStyle } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { palette, spacing } from '../../lib/theme'
import { TopBar } from './TopBar'

export const PageLayout = ({
  children,
  scroll = true,
  contentStyle,
}: PropsWithChildren<{ scroll?: boolean; contentStyle?: StyleProp<ViewStyle> }>) => {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <TopBar />
      {scroll ? (
        <ScrollView contentContainerStyle={[styles.content, contentStyle]} showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.fill, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  fill: {
    flex: 1,
  },
})
