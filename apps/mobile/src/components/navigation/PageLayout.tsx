import type { PropsWithChildren } from 'react'
import React from 'react'
import { RefreshControl, ScrollView, StyleProp, StyleSheet, View, type ViewStyle } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { CHAT_AMBIENT_FALLBACK, ChatAmbientBackground } from '../chatAmbient'
import { palette, spacing } from '../../lib/theme'
import { TopBar } from './TopBar'

export type PageLayoutPullToRefresh = {
  refreshing: boolean
  onRefresh: () => void
}

export const PageLayout = ({
  children,
  scroll = true,
  contentStyle,
  topBarTitleAccessory,
  pullToRefresh,
  chatAmbient = false,
}: PropsWithChildren<{
  scroll?: boolean
  contentStyle?: StyleProp<ViewStyle>
  topBarTitleAccessory?: React.ReactNode
  pullToRefresh?: PageLayoutPullToRefresh
  /** Полноэкранный едва заметный градиент (например AI Coach) */
  chatAmbient?: boolean
}>) => {
  const main = (
    <>
      <TopBar titleAccessory={topBarTitleAccessory} ambient={chatAmbient} />
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.content, contentStyle]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            pullToRefresh ? (
              <RefreshControl
                refreshing={pullToRefresh.refreshing}
                onRefresh={pullToRefresh.onRefresh}
                tintColor={palette.primary}
                colors={[palette.primary]}
              />
            ) : undefined
          }
          bounces
        >
          {children}
        </ScrollView>
      ) : (
        <View
          style={[
            styles.fill,
            chatAmbient ? styles.contentChatNoPad : styles.content,
            contentStyle,
          ]}
        >
          {children}
        </View>
      )}
    </>
  )

  if (!chatAmbient) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {main}
      </SafeAreaView>
    )
  }

  return (
    <View style={styles.chatAmbientRoot}>
      <ChatAmbientBackground />
      {/* Только top: нижний отступ даёт сам tab bar экрана; bottom + padding дублировали зазор над меню */}
      <SafeAreaView style={styles.safeAreaChatAmbientFill} edges={['top']}>
        <View style={styles.chatAmbientForeground}>{main}</View>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.background,
  },
  chatAmbientRoot: {
    flex: 1,
    backgroundColor: CHAT_AMBIENT_FALLBACK,
  },
  safeAreaChatAmbientFill: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  chatAmbientForeground: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  /** Чаты / AI: без наследованных отступов — 16px задаётся в composer и scrollContent */
  contentChatNoPad: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    gap: 0,
  },
  fill: {
    flex: 1,
  },
})
