import AsyncStorage from '@react-native-async-storage/async-storage'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { PropsWithChildren } from 'react'
import { useColorScheme } from 'react-native'

import { applyThemePalette, getPalette, type AppTheme } from '../lib/theme'

const THEME_STORAGE_KEY = 'piqle.mobile.theme'
type AppThemeMode = AppTheme | 'system'

type ThemeContextValue = {
  themeMode: AppThemeMode
  theme: AppTheme
  colors: ReturnType<typeof getPalette>
  isReady: boolean
  setTheme: (theme: AppTheme) => void
  setThemeMode: (theme: AppThemeMode) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export const ThemeProvider = ({ children }: PropsWithChildren) => {
  const [themeMode, setThemeModeState] = useState<AppThemeMode>('light')
  const [isReady, setIsReady] = useState(false)
  const systemColorScheme = useColorScheme()
  const resolvedTheme: AppTheme =
    themeMode === 'system' ? (systemColorScheme === 'dark' ? 'dark' : 'light') : themeMode

  useEffect(() => {
    let cancelled = false

    const loadTheme = async () => {
      try {
        const raw = await AsyncStorage.getItem(THEME_STORAGE_KEY)
        if (cancelled) return

        if (raw === 'light' || raw === 'dark' || raw === 'system') {
          const nextResolvedTheme: AppTheme =
            raw === 'system' ? (systemColorScheme === 'dark' ? 'dark' : 'light') : raw
          applyThemePalette(nextResolvedTheme)
          setThemeModeState(raw)
        }
      } finally {
        if (!cancelled) {
          setIsReady(true)
        }
      }
    }

    void loadTheme()

    return () => {
      cancelled = true
    }
  }, [systemColorScheme])

  useEffect(() => {
    if (!isReady) return
    applyThemePalette(resolvedTheme)
    void AsyncStorage.setItem(THEME_STORAGE_KEY, themeMode).catch(() => undefined)
  }, [isReady, resolvedTheme, themeMode])

  const value = useMemo<ThemeContextValue>(
    () => ({
      themeMode,
      theme: resolvedTheme,
      colors: getPalette(resolvedTheme),
      isReady,
      setTheme: (nextTheme) => setThemeModeState(nextTheme),
      setThemeMode: setThemeModeState,
      toggleTheme: () => {
        setThemeModeState((current) => {
          const currentResolved =
            current === 'system' ? (systemColorScheme === 'dark' ? 'dark' : 'light') : current
          return currentResolved === 'dark' ? 'light' : 'dark'
        })
      },
    }),
    [isReady, resolvedTheme, systemColorScheme, themeMode]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export const useAppTheme = () => {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useAppTheme must be used within ThemeProvider')
  }
  return context
}
