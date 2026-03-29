import { Ionicons } from '@expo/vector-icons'
import { useEffect, useMemo, useRef } from 'react'
import { Animated, Easing, StyleSheet, Text, View } from 'react-native'

import { trpc } from '../../lib/trpc'
import { useAuth } from '../../providers/AuthProvider'
import { useAppTheme } from '../../providers/ThemeProvider'
import { useTabRepeat } from '../../contexts/TabRepeatContext'

export const tabIcons = {
  index: { outline: 'home-outline' as const, filled: 'home' as const },
  tournaments: { outline: 'trophy-outline' as const, filled: 'trophy' as const },
  clubs: { outline: 'people-outline' as const, filled: 'people' as const },
  chats: { outline: 'chatbubbles-outline' as const, filled: 'chatbubbles' as const },
  ai: { outline: 'flash-outline' as const, filled: 'flash' as const },
}

export const labelByRoute: Record<keyof typeof tabIcons, string> = {
  index: 'Home',
  tournaments: 'Events',
  clubs: 'Clubs',
  chats: 'Chats',
  ai: 'AI',
}

type TabRouteName = keyof typeof tabIcons

export function TabBarTabIcon({
  routeName,
  focused,
  tabActive,
  tabInactive,
  showUnreadDot,
}: {
  routeName: TabRouteName
  focused: boolean
  tabActive: string
  tabInactive: string
  /** Только для `chats`: точка при непрочитанных в клубных/ивентных чатах. */
  showUnreadDot?: boolean
}) {
  const { colors } = useAppTheme()
  const { tabShakeVersion } = useTabRepeat()
  const shakeGen = tabShakeVersion[routeName] ?? 0
  const wobble = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (shakeGen === 0) return
    wobble.setValue(0)
    Animated.sequence([
      Animated.timing(wobble, {
        toValue: 1,
        duration: 70,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(wobble, {
        toValue: -1,
        duration: 90,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(wobble, {
        toValue: 0.45,
        duration: 70,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(wobble, {
        toValue: 0,
        duration: 80,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start()
  }, [shakeGen, wobble])

  const rotate = wobble.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-7deg', '0deg', '7deg'],
  })

  const pair = tabIcons[routeName] ?? tabIcons.index
  const iconName = focused ? pair.filled : pair.outline
  const color = focused ? tabActive : tabInactive
  const label = labelByRoute[routeName] ?? ''

  return (
    <View style={styles.tabSlot}>
      <View style={styles.tabItem}>
        <View style={styles.iconWrap}>
          <Animated.View style={{ transform: [{ rotate }] }}>
            <Ionicons name={iconName} size={22} color={color} />
          </Animated.View>
          {showUnreadDot ? (
            <View
              style={[styles.unreadTabDot, { borderColor: colors.surfaceOverlay }]}
              accessibilityLabel="Unread messages"
            />
          ) : null}
        </View>
        <Text style={[styles.tabLabel, { color }]} numberOfLines={2}>
          {label}
        </Text>
      </View>
    </View>
  )
}

/** Иконка вкладки Chats с точкой, если есть непрочитанные в списках клубов/ивентов. */
export function ChatsTabBarIcon({ focused }: { focused: boolean }) {
  const { colors } = useAppTheme()
  const { token } = useAuth()
  const clubChatsQuery = trpc.club.listMyChatClubs.useQuery(undefined, { enabled: Boolean(token) })
  const eventChatsQuery = trpc.tournamentChat.listMyEventChats.useQuery(undefined, { enabled: Boolean(token) })
  const showUnreadDot = useMemo(() => {
    if (!token) return false
    const clubs = clubChatsQuery.data ?? []
    if (clubs.some((c: { unreadCount?: number }) => (c.unreadCount ?? 0) > 0)) return true
    const events = (eventChatsQuery.data ?? []) as {
      unreadCount?: number
      divisions?: { unreadCount?: number }[]
    }[]
    return events.some((e) => {
      const divSum = (e.divisions ?? []).reduce((s, d) => s + (d.unreadCount ?? 0), 0)
      return (e.unreadCount ?? 0) + divSum > 0
    })
  }, [token, clubChatsQuery.data, eventChatsQuery.data])

  return (
    <TabBarTabIcon
      routeName="chats"
      focused={focused}
      tabActive={colors.primary}
      tabInactive={colors.textMuted}
      showUnreadDot={showUnreadDot}
    />
  )
}

export const tabBarIconStyles = StyleSheet.create({
  tabSlot: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadTabDot: {
    position: 'absolute',
    top: -2,
    right: -6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 2,
  },
  tabItem: {
    width: '100%',
    maxWidth: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 0,
    gap: 2,
  },
  tabLabel: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '600',
    textAlign: 'center',
    width: '100%',
    paddingHorizontal: 1,
  },
})

const styles = tabBarIconStyles
