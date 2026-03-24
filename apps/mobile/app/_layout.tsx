import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { ActivityIndicator, LogBox, Text, View } from 'react-native'

/** Отмена fetch (новый refetch, уход с экрана) — не баг API; RN всё равно шумит в логах. */
if (__DEV__) {
  LogBox.ignoreLogs(['TRPCClientError: Aborted'])
}

import { AppProviders } from '../src/providers/AppProviders'
import { useAuth } from '../src/providers/AuthProvider'
import { useAppTheme } from '../src/providers/ThemeProvider'

const RootNavigator = () => {
  const { isReady } = useAuth()
  const { colors, isReady: isThemeReady, theme } = useAppTheme()

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
        <Stack.Screen name="notifications" />
        <Stack.Screen name="profile/index" />
        <Stack.Screen name="profile/edit" />
        <Stack.Screen name="profile/settings" />
        <Stack.Screen name="tournaments/[id]/index" />
        <Stack.Screen name="tournaments/[id]/register" />
        <Stack.Screen name="clubs/[id]/index" />
        <Stack.Screen name="clubs/[id]/events" />
        <Stack.Screen name="chats/club/[clubId]/index" />
        <Stack.Screen name="chats/event/tournament/[tournamentId]/index" />
        <Stack.Screen name="chats/event/division/[divisionId]/index" />
      </Stack>
    </>
  )
}

export default function RootLayout() {
  return (
    <AppProviders>
      <RootNavigator />
    </AppProviders>
  )
}
