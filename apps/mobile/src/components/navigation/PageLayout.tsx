import type { PropsWithChildren, ReactNode } from 'react'
import React from 'react'
import { useMemo } from 'react'
import { ScrollView, StyleProp, StyleSheet, View, type ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { ChatAmbientBackground } from '../chatAmbient'
import { PickleRefreshScrollView } from '../PickleRefreshScrollView'
import { spacing } from '../../lib/theme'
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
  onTopBarTitlePress,
  topBarRightSlot,
  pullToRefresh,
  chatAmbient = false,
  topBarRefreshPulseKey,
  /** Контент под TopBar, вне скролла (например хиро-карточка профиля / клуба). */
  fixedUnderTopBar,
}: PropsWithChildren<{
  scroll?: boolean
  contentStyle?: StyleProp<ViewStyle>
  topBarTitleAccessory?: React.ReactNode
  topBarTitleAccessoryLeading?: boolean
  /** Переопределение заголовка TopBar (иначе из pathname) */
  topBarTitle?: string
  /** Обработчик тапа по заголовку TopBar. */
  onTopBarTitlePress?: () => void
  /** Заменяет правый блок TopBar (поиск / колокольчик / аватар), например на экране уведомлений */
  topBarRightSlot?: React.ReactNode
  pullToRefresh?: PageLayoutPullToRefresh
  /** Полноэкранный едва заметный градиент (например AI Coach) */
  chatAmbient?: boolean
  /** Триггер анимации лого в TopBar (главная + pull-to-refresh) */
  topBarRefreshPulseKey?: number
  fixedUnderTopBar?: ReactNode
}>) => {
  const { colors } = useAppTheme()
  const insets = useSafeAreaInsets()
  const styles = useMemo(() => createStyles(), [])
  const main = (
    <>
      <View
        style={{
          paddingTop: insets.top,
          backgroundColor: chatAmbient ? 'transparent' : colors.surfaceOverlay,
        }}
      >
        <TopBar
          titleAccessory={topBarTitleAccessory}
          titleAccessoryLeading={topBarTitleAccessoryLeading}
          titleOverride={topBarTitle}
          onTitlePress={onTopBarTitlePress}
          rightSlot={topBarRightSlot}
          ambient={chatAmbient}
          refreshPulseKey={topBarRefreshPulseKey}
        />
      </View>
      {scroll ? (
        pullToRefresh ? (
          <View style={styles.fill}>
            {fixedUnderTopBar}
            <PickleRefreshScrollView
              style={{ flex: 1, backgroundColor: colors.background }}
              contentContainerStyle={[
                styles.content,
                fixedUnderTopBar && styles.contentWithFixedUpper,
                contentStyle,
              ]}
              showsVerticalScrollIndicator={false}
              refreshing={pullToRefresh.refreshing}
              onRefresh={pullToRefresh.onRefresh}
              bounces
            >
              {children}
            </PickleRefreshScrollView>
          </View>
        ) : (
          <View style={styles.fill}>
            {fixedUnderTopBar}
            <ScrollView
              style={{ flex: 1, backgroundColor: colors.background }}
              contentContainerStyle={[styles.content, fixedUnderTopBar && styles.contentWithFixedUpper, contentStyle]}
              showsVerticalScrollIndicator={false}
              bounces
            >
              {children}
            </ScrollView>
          </View>
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
    return <View style={[styles.root, { backgroundColor: colors.background }]}>{main}</View>
  }

  return (
    <View style={[styles.chatAmbientRoot, { backgroundColor: colors.background }]}>
      <ChatAmbientBackground />
      {/* Только top: нижний отступ даёт сам tab bar экрана; bottom + padding дублировали зазор над меню */}
      <View style={styles.safeAreaChatAmbientFill}>
        <View style={styles.chatAmbientForeground}>{main}</View>
      </View>
    </View>
  )
}

const createStyles = () => StyleSheet.create({
  root: {
    flex: 1,
  },
  chatAmbientRoot: {
    flex: 1,
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
  /** Как у клуба: зазор под хиро задаёт сам `heroWrap` (`paddingBottom`), без дублирующего отступа скролла. */
  contentWithFixedUpper: {
    paddingTop: 0,
  },
})
