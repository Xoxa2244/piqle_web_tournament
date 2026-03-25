import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'

type TabRepeatContextValue = {
  /** Увеличивается при повторном тапе по Home — главная поднимает topBarRefreshPulseKey для анимации лого */
  homeReselectSignal: number
  /** Версия покачивания по имени экрана вкладки (index, tournaments, …) */
  tabShakeVersion: Record<string, number>
  bumpHomeTabReselect: () => void
  bumpTabShake: (routeName: string) => void
}

const TabRepeatContext = createContext<TabRepeatContextValue | null>(null)

export function TabRepeatProvider({ children }: { children: React.ReactNode }) {
  const [homeReselectSignal, setHomeReselectSignal] = useState(0)
  const [tabShakeVersion, setTabShakeVersion] = useState<Record<string, number>>({})

  const bumpHomeTabReselect = useCallback(() => {
    setHomeReselectSignal((s) => s + 1)
  }, [])

  const bumpTabShake = useCallback((routeName: string) => {
    setTabShakeVersion((prev) => ({
      ...prev,
      [routeName]: (prev[routeName] ?? 0) + 1,
    }))
  }, [])

  const value = useMemo(
    () => ({
      homeReselectSignal,
      tabShakeVersion,
      bumpHomeTabReselect,
      bumpTabShake,
    }),
    [homeReselectSignal, tabShakeVersion, bumpHomeTabReselect, bumpTabShake],
  )

  return <TabRepeatContext.Provider value={value}>{children}</TabRepeatContext.Provider>
}

export function useTabRepeat() {
  const ctx = useContext(TabRepeatContext)
  if (!ctx) {
    throw new Error('useTabRepeat must be used within TabRepeatProvider')
  }
  return ctx
}
