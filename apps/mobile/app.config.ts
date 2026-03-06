import type { ExpoConfig } from 'expo/config'

const config: ExpoConfig = {
  name: 'Piqle Player',
  slug: 'piqle-player',
  scheme: 'piqle',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  plugins: ['expo-router'],
  experiments: {
    typedRoutes: true,
  },
  android: {
    package: 'com.piqle.player',
  },
  ios: {
    bundleIdentifier: 'com.piqle.player',
  },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000',
  },
}

export default config
