import { Feather } from '@expo/vector-icons'
import { Tabs } from 'expo-router'
import { StyleSheet, View } from 'react-native'

import { palette } from '../../src/lib/theme'

const iconByRoute = {
  index: 'home',
  tournaments: 'award',
  clubs: 'users',
  chats: 'message-circle',
  ai: 'zap',
  profile: 'user',
  search: 'search',
  notifications: 'bell',
} as const

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: palette.text,
        tabBarInactiveTintColor: palette.textMuted,
        tabBarStyle: {
          backgroundColor: palette.surfaceOverlay,
          borderTopColor: palette.border,
          height: 82,
          paddingBottom: 12,
          paddingTop: 8,
          shadowColor: palette.shadowStrong,
          shadowOpacity: 0.15,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: -8 },
          elevation: 12,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 2,
        },
        tabBarIcon: ({ color, focused }) => (
          <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
            <Feather
              name={iconByRoute[route.name as keyof typeof iconByRoute]}
              size={19}
              color={focused ? palette.white : color}
            />
          </View>
        ),
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="tournaments" options={{ title: 'Tournaments' }} />
      <Tabs.Screen name="clubs" options={{ title: 'Clubs' }} />
      <Tabs.Screen name="chats" options={{ title: 'Chats' }} />
      <Tabs.Screen name="ai" options={{ title: 'AI' }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
      <Tabs.Screen name="search" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: palette.primary,
  },
})
