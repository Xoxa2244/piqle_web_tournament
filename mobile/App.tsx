import 'react-native-gesture-handler'
import { StatusBar } from 'expo-status-bar'
import { DefaultTheme, NavigationContainer, type Theme } from '@react-navigation/native'
import { ActivityIndicator, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { RootNavigator } from './src/navigation/RootNavigator'
import { AuthProvider, useAuth } from './src/auth/AuthContext'
import { AppBackground } from './src/components/AppBackground'
import { colors } from './src/theme/colors'

const navigationTheme: Theme = {
  ...DefaultTheme,
  dark: false,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.accent,
    background: colors.canvas,
    card: colors.surface,
    text: colors.ink,
    border: colors.outline,
    notification: colors.warning,
  },
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer theme={navigationTheme}>
          <AppContent />
        </NavigationContainer>
      </AuthProvider>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  )
}

function AppContent() {
  const { status } = useAuth()

  if (status === 'loading') {
    return (
      <AppBackground>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      </AppBackground>
    )
  }

  return <RootNavigator />
}
