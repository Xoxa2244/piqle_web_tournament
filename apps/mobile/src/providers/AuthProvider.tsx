import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { PropsWithChildren } from 'react'

import { authApi, type SignUpInput } from '../lib/authApi'
import { authStorage, type MobileUser, type StoredAuthSession } from '../lib/authStorage'

type AuthContextValue = {
  isReady: boolean
  token: string | null
  user: MobileUser | null
  signIn: (email: string, password: string) => Promise<void>
  signUp: (input: SignUpInput) => Promise<void>
  requestCode: (email: string) => Promise<string | undefined>
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
    async signOut() {
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
