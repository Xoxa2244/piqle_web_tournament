import { type PropsWithChildren } from 'react'
import { StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'

export function AppBackground({ children }: PropsWithChildren) {
  return (
    <LinearGradient
      colors={['#F6F1E8', '#E7F0E8', '#F8ECE3']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.root}
    >
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />
      {children}
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  glowTop: {
    position: 'absolute',
    top: -90,
    right: -40,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: '#D7E8DB',
    opacity: 0.7,
  },
  glowBottom: {
    position: 'absolute',
    bottom: -80,
    left: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#F7E8DC',
    opacity: 0.85,
  },
})
