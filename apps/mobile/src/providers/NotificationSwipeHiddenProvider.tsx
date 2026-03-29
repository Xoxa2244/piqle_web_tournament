import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react'

import { useAuth } from './AuthProvider'

const STORAGE_KEY_PREFIX = 'piqle:bellSwipeHidden:v1:'

export type SwipeSnap = { body: string; createdAt: string }

type NotificationSwipeHiddenContextValue = {
  swipeHiddenIds: Set<string>
  setSwipeHiddenIds: React.Dispatch<React.SetStateAction<Set<string>>>
  swipeHiddenSnapRef: React.MutableRefObject<Map<string, SwipeSnap>>
  swipeHiddenHydrated: boolean
  clearSwipeHidden: () => void
}

const NotificationSwipeHiddenContext = createContext<NotificationSwipeHiddenContextValue | null>(null)

export function NotificationSwipeHiddenProvider({ children }: PropsWithChildren) {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [swipeHiddenIds, setSwipeHiddenIds] = useState<Set<string>>(() => new Set())
  const swipeHiddenSnapRef = useRef<Map<string, SwipeSnap>>(new Map())
  const [swipeHiddenHydrated, setSwipeHiddenHydrated] = useState(false)

  useEffect(() => {
    if (!userId) {
      setSwipeHiddenIds(new Set())
      swipeHiddenSnapRef.current.clear()
      setSwipeHiddenHydrated(false)
      return
    }
    let cancelled = false
    void AsyncStorage.getItem(`${STORAGE_KEY_PREFIX}${userId}`)
      .then((raw) => {
        if (cancelled) return
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as { ids?: string[]; snaps?: Record<string, SwipeSnap> }
            setSwipeHiddenIds(new Set(parsed.ids ?? []))
            swipeHiddenSnapRef.current = new Map(Object.entries(parsed.snaps ?? {}))
          } catch {
            setSwipeHiddenIds(new Set())
            swipeHiddenSnapRef.current.clear()
          }
        } else {
          setSwipeHiddenIds(new Set())
          swipeHiddenSnapRef.current.clear()
        }
        setSwipeHiddenHydrated(true)
      })
      .catch(() => {
        if (!cancelled) setSwipeHiddenHydrated(true)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    if (!userId || !swipeHiddenHydrated) return
    const snaps = Object.fromEntries(swipeHiddenSnapRef.current)
    void AsyncStorage.setItem(
      `${STORAGE_KEY_PREFIX}${userId}`,
      JSON.stringify({ ids: [...swipeHiddenIds], snaps }),
    )
  }, [userId, swipeHiddenHydrated, swipeHiddenIds])

  const clearSwipeHidden = useCallback(() => {
    setSwipeHiddenIds(new Set())
    swipeHiddenSnapRef.current.clear()
  }, [])

  const value = useMemo<NotificationSwipeHiddenContextValue>(
    () => ({
      swipeHiddenIds,
      setSwipeHiddenIds,
      swipeHiddenSnapRef,
      swipeHiddenHydrated,
      clearSwipeHidden,
    }),
    [swipeHiddenIds, swipeHiddenHydrated, clearSwipeHidden],
  )

  return (
    <NotificationSwipeHiddenContext.Provider value={value}>{children}</NotificationSwipeHiddenContext.Provider>
  )
}

export function useNotificationSwipeHidden() {
  const ctx = useContext(NotificationSwipeHiddenContext)
  if (!ctx) {
    throw new Error('useNotificationSwipeHidden must be used within NotificationSwipeHiddenProvider')
  }
  return ctx
}
