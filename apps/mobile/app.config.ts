import type { ExpoConfig } from 'expo/config'

const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() ?? ''
const GOOGLE_IOS_URL_SCHEME =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME?.trim() ??
  (GOOGLE_IOS_CLIENT_ID.endsWith('.apps.googleusercontent.com')
    ? `com.googleusercontent.apps.${GOOGLE_IOS_CLIENT_ID.replace('.apps.googleusercontent.com', '')}`
    : '')

const plugins: NonNullable<ExpoConfig['plugins']> = [
  'expo-router',
  [
    'expo-build-properties',
    {
      android: {
        kotlinVersion: '1.9.25',
      },
    },
  ],
  GOOGLE_IOS_URL_SCHEME
    ? [
        '@react-native-google-signin/google-signin',
        {
          iosUrlScheme: GOOGLE_IOS_URL_SCHEME,
        },
      ]
    : '@react-native-google-signin/google-signin',
]

const config: ExpoConfig = {
  name: 'Piqle Player',
  slug: 'piqle-player',
  scheme: 'piqle',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  plugins,
  experiments: {
    typedRoutes: true,
  },
  android: {
    package: 'com.piqle.player',
    /** Чат и формы: окно подстраивается под клавиатуру, а не перекрывает инпут. */
    softwareKeyboardLayoutMode: 'resize',
  },
  ios: {
    bundleIdentifier: 'com.piqle.player',
  },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000',
    eas: {
      projectId: 'e2ceb0ec-cbc2-4497-9c29-4ad79e930362',
    },
  },
}

export default config
