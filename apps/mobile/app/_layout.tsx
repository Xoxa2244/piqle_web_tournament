import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { ActivityIndicator, LogBox, Text, View } from 'react-native'

/** Отмена fetch (новый refetch, уход с экрана) — не баг API; RN всё равно шумит в логах. */
if (__DEV__) {
  LogBox.ignoreLogs(['TRPCClientError: Aborted'])
}

import { palette } from '../src/lib/theme'
import { AppProviders } from '../src/providers/AppProviders'
import { useAuth } from '../src/providers/AuthProvider'

const RootNavigator = () => {
  const { isReady } = useAuth()

  if (!isReady) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.background, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <ActivityIndicator color={palette.primary} />
        <Text style={{ color: palette.textMuted }}>Loading Piqle Player…</Text>
      </View>
    )
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.background },
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
