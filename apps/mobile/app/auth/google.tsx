import { useEffect } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'

import { palette } from '../../src/lib/theme'

export default function GoogleAuthCallbackScreen() {
  useEffect(() => {
    const timeout = setTimeout(() => {
      router.replace('/sign-in')
    }, 600)

    return () => clearTimeout(timeout)
  }, [])

  return (
    <View style={styles.screen}>
      <ActivityIndicator color={palette.primary} />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.authBackground,
  },
})
