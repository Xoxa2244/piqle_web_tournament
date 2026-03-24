import AsyncStorage from '@react-native-async-storage/async-storage'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { PropsWithChildren } from 'react'

import { applyThemePalette, getPalette, type AppTheme } from '../lib/theme'

const THEME_STORAGE_KEY = 'piqle.mobile.theme'

type ThemeContextValue = {
  theme: AppTheme
  colors: ReturnType<typeof getPalette>
  isReady: boolean
  setTheme: (theme: AppTheme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export const ThemeProvider = ({ children }: PropsWithChildren) => {
  const [theme, setThemeState] = useState<AppTheme>('light')
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    const loadTheme = async () => {
      try {
        const raw = await AsyncStorage.getItem(THEME_STORAGE_KEY)
        if (cancelled) return

        if (raw === 'light' || raw === 'dark') {
          applyThemePalette(raw)
          setThemeState(raw)
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
  }, [])

  useEffect(() => {
    if (!isReady) return
    applyThemePalette(theme)
    void AsyncStorage.setItem(THEME_STORAGE_KEY, theme).catch(() => undefined)
  }, [isReady, theme])

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      colors: getPalette(theme),
      isReady,
      setTheme: setThemeState,
      toggleTheme: () => {
        setThemeState((current) => (current === 'dark' ? 'light' : 'dark'))
      },
    }),
    [isReady, theme]
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
