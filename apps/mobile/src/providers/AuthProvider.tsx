import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { PropsWithChildren } from 'react'

import { authApi, type SignUpInput } from '../lib/authApi'
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

let googleSignInModulePromise: Promise<GoogleSignInModule> | null = null
let googleSignInConfigPromise: Promise<GoogleSignInRuntimeConfig> | null = null
let isGoogleSigninConfigured = false

const loadGoogleSignInModule = () => {
  if (!googleSignInModulePromise) {
    googleSignInModulePromise = Promise.resolve(
      require('@react-native-google-signin/google-signin') as GoogleSignInModule
    )
  }

  return googleSignInModulePromise
}

const loadGoogleSignInConfig = () => {
  if (GOOGLE_WEB_CLIENT_ID) {
    return Promise.resolve({
      webClientId: GOOGLE_WEB_CLIENT_ID,
      iosClientId: GOOGLE_IOS_CLIENT_ID || null,
    })
  }

  if (!googleSignInConfigPromise) {
    googleSignInConfigPromise = authApi.getGoogleSignInConfig().then((config) => ({
      webClientId: config.webClientId,
      iosClientId: GOOGLE_IOS_CLIENT_ID || config.iosClientId,
    }))
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

  GoogleSignin.configure({
    webClientId: config.webClientId,
    ...(config.iosClientId ? { iosClientId: config.iosClientId } : {}),
  })

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
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const [isReady, setIsReady] = useState(false)
  const [session, setSession] = useState<StoredAuthSession | null>(null)

  useEffect(() => {
    let isMounted = true
    authStorage.load()
      .then((stored) => {
        if (!isMounted) return
        setSession(stored)
        setIsReady(true)
      })
      .catch(() => {
        if (!isMounted) return
        setSession(null)
        setIsReady(true)
      })

    return () => {
      isMounted = false
    }
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    isReady,
    token: session?.token ?? null,
    user: session?.user ?? null,
    async signIn(email: string, password: string) {
      const nextSession = await authApi.signIn(email, password)
      await authStorage.save(nextSession)
      setSession(nextSession)
    },
    async signUp(input: SignUpInput) {
      const nextSession = await authApi.signUp(input)
      await authStorage.save(nextSession)
      setSession(nextSession)
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
      await authStorage.save(nextSession)
      setSession(nextSession)
    },
    async signInWithGoogle() {
      const googleSignIn = await loadGoogleSignInModule().catch((error) => {
        throw normalizeGoogleSignInError(error)
      })
      const { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } = googleSignIn

      try {
        await configureGoogleSignin(GoogleSignin)
        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })

        const response = await GoogleSignin.signIn()
        if (!isSuccessResponse(response)) {
          throw new Error('Google sign-in was cancelled.')
        }

        const idToken = response.data.idToken?.trim()
        if (!idToken) {
          throw new Error('Google sign-in did not return an identity token.')
        }

        const nextSession = await authApi.signInWithGoogle({ idToken })
        await authStorage.save(nextSession)
        setSession(nextSession)
      } catch (error) {
        if (isErrorWithCode(error)) {
          const nextMessage = getGoogleErrorMessage(error.code, statusCodes)
          if (nextMessage) {
            throw new Error(nextMessage)
          }
        }

        throw normalizeGoogleSignInError(error)
      }
    },
    async signOut() {
      const googleSignIn = await loadGoogleSignInModule().catch(() => null)

      if (googleSignIn) {
        try {
          await googleSignIn.GoogleSignin.signOut()
        } catch {
          // Ignore Google session cleanup errors and always clear local auth state.
        }
      }

      await authStorage.clear()
      setSession(null)
    },
  }), [isReady, session])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
