import { useEffect } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'

import { useAppTheme } from '../../src/providers/ThemeProvider'

export default function GoogleAuthCallbackScreen() {
  const { colors } = useAppTheme()

  useEffect(() => {
    const timeout = setTimeout(() => {
      router.replace('/sign-in')
    }, 600)

    return () => clearTimeout(timeout)
  }, [])

  return (
    <View style={[styles.screen, { backgroundColor: colors.authBackground }]}>
      <ActivityIndicator color={colors.primary} />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
