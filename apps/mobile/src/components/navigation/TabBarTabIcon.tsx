import { Ionicons } from '@expo/vector-icons'
import { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, Text, View } from 'react-native'

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
}: {
  routeName: TabRouteName
  focused: boolean
  tabActive: string
  tabInactive: string
}) {
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
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Ionicons name={iconName} size={22} color={color} />
        </Animated.View>
        <Text style={[styles.tabLabel, { color }]} numberOfLines={2}>
          {label}
        </Text>
      </View>
    </View>
  )
}

export const tabBarIconStyles = StyleSheet.create({
  tabSlot: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
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
