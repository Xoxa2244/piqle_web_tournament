import { router, Stack, usePathname } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { ActivityIndicator, LogBox, Text, View } from 'react-native'
import { useEffect } from 'react'

/** Отмена fetch (новый refetch, уход с экрана) — не баг API; RN всё равно шумит в логах. */
if (__DEV__) {
  LogBox.ignoreLogs([
    'TRPCClientError: Aborted',
    'TRPCClientError: Duplicate message.',
    'TRPCClientError: Slow down a bit.',
  ])
}

import { AppProviders } from '../src/providers/AppProviders'
import { useAuth } from '../src/providers/AuthProvider'
import { useRealtimeConnection } from '../src/providers/RealtimeProvider'
import { useAppTheme } from '../src/providers/ThemeProvider'

const isAuthOnlyPath = (pathname: string) => {
  if (
    pathname === '/ai' ||
    pathname === '/chats' ||
    pathname === '/notifications' ||
    pathname === '/profile'
  ) {
    return true
  }

  if (pathname.startsWith('/chats/')) return true
  if (pathname.startsWith('/profile/')) return true
  if (/^\/tournaments\/[^/]+\/register$/.test(pathname)) return true

  return false
}

const RootNavigator = () => {
  const { isReady, token } = useAuth()
  const { colors, isReady: isThemeReady, theme } = useAppTheme()
  const pathname = usePathname()

  useEffect(() => {
    if (!isReady) return
    if (token) return
    if (!isAuthOnlyPath(pathname)) return
    if (pathname === '/sign-in') return

    router.replace({
      pathname: '/sign-in',
      params: pathname !== '/sign-in' ? { redirect: pathname } : undefined,
    })
  }, [isReady, pathname, token])

  if (!isReady || !isThemeReady) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <ActivityIndicator color={colors.primary} />
        <Text style={{ color: colors.textMuted }}>Loading Piqle Player…</Text>
      </View>
    )
  }

  return (
    <>
      <ChatRealtimeRouteSync />
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <Stack
        key={theme}
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          /** Иначе при swipe-back подложка без шапки: pathname в expo-router обновляется с задержкой, см. useEffectivePathname */
          detachInactiveScreens: false,
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="search"
          options={{
            gestureEnabled: true,
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="profile/index" />
        <Stack.Screen name="profile/edit" />
        <Stack.Screen name="profile/settings" />
        <Stack.Screen name="profile/blocked-users" />
        <Stack.Screen name="tournaments/[id]/index" />
        <Stack.Screen name="tournaments/[id]/register" />
        <Stack.Screen name="clubs/[id]/index" />
        <Stack.Screen name="clubs/[id]/events" />
        <Stack.Screen name="chats/direct/[threadId]/index" />
        <Stack.Screen name="chats/club/[clubId]/index" />
        <Stack.Screen name="chats/club/[clubId]/thread/[rootMessageId]" />
        <Stack.Screen name="chats/event/tournament/[tournamentId]/index" />
        <Stack.Screen name="chats/event/tournament/[tournamentId]/thread/[rootMessageId]" />
        <Stack.Screen name="chats/event/division/[divisionId]/index" />
        <Stack.Screen name="chats/event/division/[divisionId]/thread/[rootMessageId]" />
      </Stack>
    </>
  )
}

const ChatRealtimeRouteSync = () => {
  const pathname = usePathname()
  const { setChatScopeActive } = useRealtimeConnection()

  useEffect(() => {
    setChatScopeActive(pathname === '/chats' || pathname.startsWith('/chats/'))
  }, [pathname, setChatScopeActive])

  return null
}

export default function RootLayout() {
  return (
    <AppProviders>
      <RootNavigator />
    </AppProviders>
  )
}
