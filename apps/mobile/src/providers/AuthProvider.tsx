import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { PropsWithChildren } from 'react'
import * as AppleAuthentication from 'expo-apple-authentication'
import { Platform, TurboModuleRegistry } from 'react-native'

import { authApi, isAuthApiErrorStatus, type SignUpInput } from '../lib/authApi'
import { authStorage, type MobileUser, type StoredAuthSession } from '../lib/authStorage'

type GoogleSignInModule = typeof import('@react-native-google-signin/google-signin')
type GoogleSignInRuntimeConfig = {
  webClientId: string
  iosClientId: string | null
}

const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() ?? ''
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() ?? ''
const GOOGLE_REBUILD_MESSAGE =
  'Google sign-in requires a rebuilt native app. Reinstall the dev build and try again.'
const APPLE_REBUILD_MESSAGE =
  'Apple sign-in requires a rebuilt iOS app with the Apple capability enabled.'

const summarizeGoogleClientId = (clientId?: string | null) => {
  const value = clientId?.trim() ?? ''
  if (!value) return null
  return `${value.slice(0, 24)}...${value.slice(-18)}`
}

const getGoogleErrorCode = (error: unknown) => {
  if (!error || typeof error !== 'object' || !('code' in error)) return null
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : code != null ? String(code) : null
}

const getNativeErrorCode = (error: unknown) => {
  if (!error || typeof error !== 'object' || !('code' in error)) return null
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : code != null ? String(code) : null
}

let googleSignInModulePromise: Promise<GoogleSignInModule | null> | null = null
let googleSignInConfigPromise: Promise<GoogleSignInRuntimeConfig> | null = null
let isGoogleSigninConfigured = false

/** Резолвит `null`, если нативного модуля нет (Expo Go, старая сборка) — без `require` пакета, иначе внутри него падает getEnforcing. */
const loadGoogleSignInModule = (): Promise<GoogleSignInModule | null> => {
  if (!googleSignInModulePromise) {
    googleSignInModulePromise = (async () => {
      if (TurboModuleRegistry.get('RNGoogleSignin') == null) {
        return null
      }
      try {
        return require('@react-native-google-signin/google-signin') as GoogleSignInModule
      } catch {
        return null
      }
    })()
  }
  return googleSignInModulePromise
}

const loadGoogleSignInConfig = () => {
  if (GOOGLE_WEB_CLIENT_ID) {
    const runtimeConfig = {
      webClientId: GOOGLE_WEB_CLIENT_ID,
      iosClientId: GOOGLE_IOS_CLIENT_ID || null,
    }
    console.log('[Google Sign-In] Using env override config', {
      webClientId: summarizeGoogleClientId(runtimeConfig.webClientId),
      iosClientId: summarizeGoogleClientId(runtimeConfig.iosClientId),
    })
    return Promise.resolve(runtimeConfig)
  }

  if (!googleSignInConfigPromise) {
    googleSignInConfigPromise = authApi.getGoogleSignInConfig().then((config) => {
      const runtimeConfig = {
        webClientId: config.webClientId,
        iosClientId: GOOGLE_IOS_CLIENT_ID || config.iosClientId,
      }
      console.log('[Google Sign-In] Loaded backend runtime config', {
        webClientId: summarizeGoogleClientId(runtimeConfig.webClientId),
        iosClientId: summarizeGoogleClientId(runtimeConfig.iosClientId),
      })
      return runtimeConfig
    })
  }

  return googleSignInConfigPromise
}

const configureGoogleSignin = async (GoogleSignin: GoogleSignInModule['GoogleSignin']) => {
  if (isGoogleSigninConfigured) return

  const config = await loadGoogleSignInConfig()
  if (!config.webClientId) {
    throw new Error(
      'Google sign-in is not configured in this app build. Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID or configure GOOGLE_CLIENT_ID on the server, then rebuild the app.'
    )
  }

  console.log('[Google Sign-In] Configuring native SDK', {
    webClientId: summarizeGoogleClientId(config.webClientId),
    iosClientId: summarizeGoogleClientId(config.iosClientId),
  })
  GoogleSignin.configure({
    webClientId: config.webClientId,
    ...(config.iosClientId ? { iosClientId: config.iosClientId } : {}),
  })

  console.log('[Google Sign-In] Native SDK configured')
  isGoogleSigninConfigured = true
}

const getGoogleErrorMessage = (
  code: string,
  statusCodes: GoogleSignInModule['statusCodes']
) => {
  if (code === statusCodes.IN_PROGRESS) {
    return 'Google sign-in is already in progress.'
  }
  if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
    return 'Google Play Services are unavailable on this device.'
  }
  if (code === statusCodes.SIGN_IN_CANCELLED) {
    return 'Google sign-in was cancelled.'
  }
  if (code === statusCodes.SIGN_IN_REQUIRED) {
    return 'Google sign-in requires you to choose an account.'
  }
  return null
}

const normalizeGoogleSignInError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return new Error('Failed to continue with Google.')
  }

  if (/Native module|TurboModule|getEnforcing|RNGoogleSignin/i.test(error.message)) {
    return new Error(GOOGLE_REBUILD_MESSAGE)
  }

  return error
}

const normalizeAppleSignInError = (error: unknown) => {
  const code = getNativeErrorCode(error)
  if (code === 'ERR_REQUEST_CANCELED') {
    return new Error('Apple sign-in was cancelled.')
  }

  if (!(error instanceof Error)) {
    return new Error('Failed to continue with Apple.')
  }

  if (/native module|entitlement|capability|apple authentication/i.test(error.message)) {
    return new Error(APPLE_REBUILD_MESSAGE)
  }

  return error
}

type AuthContextValue = {
  isReady: boolean
  token: string | null
  user: MobileUser | null
  signIn: (email: string, password: string) => Promise<void>
  signUp: (input: SignUpInput) => Promise<void>
  requestCode: (email: string) => Promise<string | undefined>
  requestPasswordReset: (email: string) => Promise<string | undefined>
  resetPassword: (email: string, code: string, password: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signInWithApple: () => Promise<void>
  clearSession: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const [isReady, setIsReady] = useState(false)
  const [session, setSession] = useState<StoredAuthSession | null>(null)

  const applySession = useCallback(async (nextSession: StoredAuthSession) => {
    await authStorage.save(nextSession)
    setSession(nextSession)
  }, [])

  const clearSession = useCallback(async () => {
    await authStorage.clear()
    setSession(null)
  }, [])

  useEffect(() => {
    let isMounted = true

    ;(async () => {
      try {
        const stored = await authStorage.load()
        if (!isMounted) return

        if (!stored?.token) {
          setSession(null)
          setIsReady(true)
          return
        }

        try {
          const validatedSession = await authApi.getMobileSession(stored.token)
          if (!isMounted) return
          await applySession(validatedSession)
        } catch (error) {
          if (!isMounted) return

          if (isAuthApiErrorStatus(error, [401, 403])) {
            await clearSession()
          } else {
            setSession(stored)
          }
        }
      } catch {
        if (!isMounted) return
        setSession(null)
      } finally {
        if (isMounted) {
          setIsReady(true)
        }
      }
    })()

    return () => {
      isMounted = false
    }
  }, [applySession, clearSession])

  const value = useMemo<AuthContextValue>(() => ({
    isReady,
    token: session?.token ?? null,
    user: session?.user ?? null,
    async signIn(email: string, password: string) {
      const nextSession = await authApi.signIn(email, password)
      await applySession(nextSession)
    },
    async signUp(input: SignUpInput) {
      const nextSession = await authApi.signUp(input)
      await applySession(nextSession)
    },
    async requestCode(email: string) {
      const response = await authApi.requestCode(email)
      return response.expiresAt
    },
    async requestPasswordReset(email: string) {
      const response = await authApi.requestPasswordReset(email)
      return response.expiresAt
    },
    async resetPassword(email: string, code: string, password: string) {
      await authApi.resetPassword({ email, code, password })
      const nextSession = await authApi.signIn(email, password)
      await applySession(nextSession)
    },
    async signInWithGoogle() {
      console.log('[Google Sign-In] Starting sign-in flow')
      const googleSignIn = await loadGoogleSignInModule()
      if (!googleSignIn) {
        throw new Error(GOOGLE_REBUILD_MESSAGE)
      }
      const { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } = googleSignIn

      try {
        await configureGoogleSignin(GoogleSignin)
        console.log('[Google Sign-In] Checking Play Services availability')
        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })
        console.log('[Google Sign-In] Play Services available')

        const response = await GoogleSignin.signIn()
        console.log('[Google Sign-In] Native sign-in response received', {
          success: isSuccessResponse(response),
          hasData: 'data' in response,
          hasIdToken: 'data' in response ? Boolean(response.data?.idToken) : false,
          userEmail: 'data' in response ? response.data?.user?.email ?? null : null,
        })
        if (!isSuccessResponse(response)) {
          throw new Error('Google sign-in was cancelled.')
        }

        const idToken = response.data.idToken?.trim()
        if (!idToken) {
          throw new Error('Google sign-in did not return an identity token.')
        }

        console.log('[Google Sign-In] Sending idToken to backend', {
          idTokenLength: idToken.length,
          userEmail: response.data.user?.email ?? null,
        })
        const nextSession = await authApi.signInWithGoogle({ idToken })
        console.log('[Google Sign-In] Backend session created', {
          userId: nextSession.user.id,
          email: nextSession.user.email,
        })
        await applySession(nextSession)
      } catch (error) {
        console.error('[Google Sign-In] Native sign-in failed', {
          code: getGoogleErrorCode(error),
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        })
        console.error('[Google Sign-In] Raw error object', error)
        if (isErrorWithCode(error)) {
          const nextMessage = getGoogleErrorMessage(error.code, statusCodes)
          if (nextMessage) {
            throw new Error(nextMessage)
          }
        }

        throw normalizeGoogleSignInError(error)
      }
    },
    async signInWithApple() {
      if (Platform.OS !== 'ios') {
        throw new Error('Apple sign-in is only available on iOS.')
      }

      try {
        const isAvailable = await AppleAuthentication.isAvailableAsync()
        if (!isAvailable) {
          throw new Error(APPLE_REBUILD_MESSAGE)
        }

        const credential = await AppleAuthentication.signInAsync({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
          ],
        })

        const identityToken = credential.identityToken?.trim()
        if (!identityToken) {
          throw new Error('Apple sign-in did not return an identity token.')
        }

        const nextSession = await authApi.signInWithApple({
          identityToken,
          user: credential.user,
          email: credential.email,
          firstName: credential.fullName?.givenName ?? null,
          lastName: credential.fullName?.familyName ?? null,
        })

        await applySession(nextSession)
      } catch (error) {
        throw normalizeAppleSignInError(error)
      }
    },
    clearSession,
    async signOut() {
      const googleSignIn = await loadGoogleSignInModule()

      if (googleSignIn) {
        try {
          await googleSignIn.GoogleSignin.signOut()
        } catch {
          // Ignore Google session cleanup errors and always clear local auth state.
        }
      }

      await clearSession()
    },
  }), [applySession, clearSession, isReady, session])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
