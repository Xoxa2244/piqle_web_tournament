import type { PropsWithChildren } from 'react'
import React from 'react'
import { ScrollView, StyleProp, StyleSheet, View, type ViewStyle } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { CHAT_AMBIENT_FALLBACK, ChatAmbientBackground } from '../chatAmbient'
import { PickleRefreshScrollView } from '../PickleRefreshScrollView'
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
  topBarTitle,
  pullToRefresh,
  chatAmbient = false,
}: PropsWithChildren<{
  scroll?: boolean
  contentStyle?: StyleProp<ViewStyle>
  topBarTitleAccessory?: React.ReactNode
  /** Переопределение заголовка TopBar (иначе из pathname) */
  topBarTitle?: string
  pullToRefresh?: PageLayoutPullToRefresh
  /** Полноэкранный едва заметный градиент (например AI Coach) */
  chatAmbient?: boolean
}>) => {
  const main = (
    <>
      <TopBar titleAccessory={topBarTitleAccessory} titleOverride={topBarTitle} ambient={chatAmbient} />
      {scroll ? (
        pullToRefresh ? (
          <View style={styles.fill}>
            <PickleRefreshScrollView
              style={{ flex: 1 }}
              contentContainerStyle={[styles.content, contentStyle]}
              showsVerticalScrollIndicator={false}
              refreshing={pullToRefresh.refreshing}
              onRefresh={pullToRefresh.onRefresh}
              bounces
            >
              {children}
            </PickleRefreshScrollView>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={[styles.content, contentStyle]}
            showsVerticalScrollIndicator={false}
            bounces
          >
            {children}
          </ScrollView>
        )
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
