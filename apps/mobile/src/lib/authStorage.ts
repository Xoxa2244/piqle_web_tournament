import type { QueryClient } from '@tanstack/react-query'

import AsyncStorage from '@react-native-async-storage/async-storage'

export type MobileUser = {
  id: string
  email: string
  name: string | null
  image: string | null
}

export type StoredAuthSession = {
  token: string
  user: MobileUser
}

const AUTH_STORAGE_KEY = 'piqle.mobile.auth'

let currentAuthToken: string | null = null

export const getClientAuthToken = () => currentAuthToken

export const setClientAuthToken = (token: string | null) => {
  currentAuthToken = token
}

export const authStorage = {
  async load(): Promise<StoredAuthSession | null> {
    const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) {
      currentAuthToken = null
      return null
    }

    try {
      const session = JSON.parse(raw) as StoredAuthSession
      currentAuthToken = session.token
      return session
    } catch {
      currentAuthToken = null
      await AsyncStorage.removeItem(AUTH_STORAGE_KEY)
      return null
    }
  },

  async save(session: StoredAuthSession) {
    currentAuthToken = session.token
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
  },

  async clear(queryClient?: QueryClient) {
    currentAuthToken = null
    await AsyncStorage.removeItem(AUTH_STORAGE_KEY)
    queryClient?.clear()
  },
}
