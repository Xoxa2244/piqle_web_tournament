import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { ActivityIndicator, Text, View } from 'react-native'

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
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.background } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="tournaments/[id]" />
        <Stack.Screen name="tournaments/[id]/register" />
        <Stack.Screen name="clubs/[id]" />
        <Stack.Screen name="chats/club/[clubId]" />
        <Stack.Screen name="chats/event/tournament/[tournamentId]" />
        <Stack.Screen name="chats/event/division/[divisionId]" />
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
