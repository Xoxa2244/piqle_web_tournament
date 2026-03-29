import type { PropsWithChildren } from 'react'
import React from 'react'
import { useMemo } from 'react'
import { ScrollView, StyleProp, StyleSheet, View, type ViewStyle } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { CHAT_AMBIENT_FALLBACK, ChatAmbientBackground } from '../chatAmbient'
import { PickleRefreshScrollView } from '../PickleRefreshScrollView'
import { spacing, type ThemePalette } from '../../lib/theme'
import { useAppTheme } from '../../providers/ThemeProvider'
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
  topBarTitleAccessoryLeading = false,
  topBarTitle,
  topBarRightSlot,
  pullToRefresh,
  chatAmbient = false,
  topBarRefreshPulseKey,
}: PropsWithChildren<{
  scroll?: boolean
  contentStyle?: StyleProp<ViewStyle>
  topBarTitleAccessory?: React.ReactNode
  topBarTitleAccessoryLeading?: boolean
  /** Переопределение заголовка TopBar (иначе из pathname) */
  topBarTitle?: string
  /** Заменяет правый блок TopBar (поиск / колокольчик / аватар), например на экране уведомлений */
  topBarRightSlot?: React.ReactNode
  pullToRefresh?: PageLayoutPullToRefresh
  /** Полноэкранный едва заметный градиент (например AI Coach) */
  chatAmbient?: boolean
  /** Триггер анимации лого в TopBar (главная + pull-to-refresh) */
  topBarRefreshPulseKey?: number
}>) => {
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const main = (
    <>
      <TopBar
        titleAccessory={topBarTitleAccessory}
        titleAccessoryLeading={topBarTitleAccessoryLeading}
        titleOverride={topBarTitle}
        rightSlot={topBarRightSlot}
        ambient={chatAmbient}
        refreshPulseKey={topBarRefreshPulseKey}
      />
      {scroll ? (
        pullToRefresh ? (
          <View style={styles.fill}>
            <PickleRefreshScrollView
              style={{ flex: 1, backgroundColor: colors.background }}
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
            style={{ backgroundColor: colors.background }}
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
            { backgroundColor: colors.background },
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

const createStyles = (colors: ThemePalette) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
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
