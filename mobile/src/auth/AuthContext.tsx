import {
  type PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { setRuntimeSessionToken } from '../api/trpcClient'
import { fetchMobileSession, signInWithPassword, signOutMobileSession } from './mobileAuthApi'
import { clearSessionToken, loadSessionToken, saveSessionToken } from './tokenStore'

type AuthUser = {
  id: string
  email: string
  name: string | null
  image: string | null
}

type AuthStatus = 'loading' | 'signed_out' | 'signed_in'

type AuthContextValue = {
  status: AuthStatus
  user: AuthUser | null
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<AuthUser | null>(null)
  const [sessionToken, setSessionToken] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const token = await loadSessionToken()
      if (!mounted) return

      if (!token) {
        setRuntimeSessionToken(null)
        setStatus('signed_out')
        return
      }

      try {
        const session = await fetchMobileSession(token)
        if (!mounted) return

        if (session.authenticated) {
          setRuntimeSessionToken(token)
          setSessionToken(token)
          setUser(session.user)
          setStatus('signed_in')
          return
        }
      } catch {
        // fall through to signed out
      }

      await clearSessionToken()
      if (!mounted) return
      setRuntimeSessionToken(null)
      setSessionToken(null)
      setUser(null)
      setStatus('signed_out')
    })()

    return () => {
      mounted = false
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await signInWithPassword(email, password)
    await saveSessionToken(result.sessionToken)
    setRuntimeSessionToken(result.sessionToken)
    setSessionToken(result.sessionToken)
    setUser(result.user)
    setStatus('signed_in')
  }, [])

  const signOut = useCallback(async () => {
    const token = sessionToken
    if (token) {
      try {
        await signOutMobileSession(token)
      } catch {
        // ignore network errors on sign out
      }
    }
    await clearSessionToken()
    setRuntimeSessionToken(null)
    setSessionToken(null)
    setUser(null)
    setStatus('signed_out')
  }, [sessionToken])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      signIn,
      signOut,
    }),
    [signIn, signOut, status, user]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
