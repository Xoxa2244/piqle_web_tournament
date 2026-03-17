'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'

interface ThemeContextType {
  isDark: boolean
  theme: 'dark' | 'light'
  toggle: () => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType>({ isDark: true, theme: 'dark', toggle: () => {}, toggleTheme: () => {} })

export function useTheme() {
  return useContext(ThemeContext)
}

export function IQThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem('iq-theme')
    if (saved === 'light') setIsDark(false)
  }, [])

  const toggle = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev
      localStorage.setItem('iq-theme', next ? 'dark' : 'light')
      return next
    })
  }, [])

  return (
    <ThemeContext.Provider value={{ isDark, theme: isDark ? 'dark' : 'light', toggle, toggleTheme: toggle }}>
      <div className="iq-intelligence" data-theme={isDark ? 'dark' : 'light'}>
        {children}
      </div>
    </ThemeContext.Provider>
  )
}
