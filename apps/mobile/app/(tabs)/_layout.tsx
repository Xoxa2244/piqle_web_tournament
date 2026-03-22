import { Ionicons } from '@expo/vector-icons'
import { Tabs } from 'expo-router'
import { Fragment } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { TabDataWarmup } from '../../src/components/TabDataWarmup'
import { palette } from '../../src/lib/theme'

const tabInactive = palette.textMuted
const tabActive = palette.primary

const tabIcons = {
  index: { outline: 'home-outline' as const, filled: 'home' as const },
  tournaments: { outline: 'trophy-outline' as const, filled: 'trophy' as const },
  clubs: { outline: 'people-outline' as const, filled: 'people' as const },
  chats: { outline: 'chatbubbles-outline' as const, filled: 'chatbubbles' as const },
  ai: { outline: 'flash-outline' as const, filled: 'flash' as const },
}

const labelByRoute: Record<keyof typeof tabIcons, string> = {
  index: 'Home',
  tournaments: 'Events',
  clubs: 'Clubs',
  chats: 'Chats',
  ai: 'AI',
}

export default function TabsLayout() {
  return (
    <Fragment>
      <TabDataWarmup />
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: tabActive,
        tabBarInactiveTintColor: tabInactive,
        tabBarItemStyle: {
          flex: 1,
          paddingHorizontal: 0,
        },
        tabBarIconStyle: {
          width: '100%',
        },
        tabBarStyle: {
          backgroundColor: palette.surfaceOverlay,
          borderTopColor: palette.border,
          height: 92,
          paddingHorizontal: 0,
          paddingBottom: 10,
          paddingTop: 6,
          shadowColor: palette.shadowStrong,
          shadowOpacity: 0.15,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: -8 },
          elevation: 12,
        },
        tabBarIcon: ({ focused }) => {
          const name = route.name as keyof typeof tabIcons
          const label = labelByRoute[name] ?? ''
          const pair = tabIcons[name]
          const iconName = focused ? pair.filled : pair.outline
          const color = focused ? tabActive : tabInactive
          return (
            <View style={styles.tabSlot}>
              <View style={styles.tabItem}>
                <Ionicons name={iconName} size={22} color={color} />
                <Text style={[styles.tabLabel, { color }]} numberOfLines={2}>
                  {label}
                </Text>
              </View>
            </View>
          )
        },
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="tournaments" options={{ title: 'Events' }} />
      <Tabs.Screen name="clubs" options={{ title: 'Clubs' }} />
      <Tabs.Screen name="chats" options={{ title: 'Chats' }} />
      <Tabs.Screen name="ai" options={{ title: 'AI' }} />
    </Tabs>
    </Fragment>
  )
}

const styles = StyleSheet.create({
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
