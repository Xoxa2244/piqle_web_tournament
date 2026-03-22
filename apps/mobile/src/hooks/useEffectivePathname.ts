import { useNavigationState } from '@react-navigation/native'
import { useNavigationContainerRef, usePathname } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'

import { getRouteInfoFromState } from 'expo-router/build/global-state/routeInfo'

/**
 * Pathname активной вкладки из tab navigator (не глобальный URL).
 * Нужен, когда поверх табов открыт search/notifications и глобальный pathname = `/search`,
 * а шапка вкладки в «полоске» при swipe должна показывать Events / Home и т.д.
 */
function tabRouteNameToPathname(routeName: string): string {
  if (routeName === 'index') return '/'
  if (routeName === 'tournaments') return '/tournaments'
  if (routeName === 'clubs') return '/clubs'
  if (routeName === 'chats') return '/chats'
  if (routeName === 'ai') return '/ai'
  return '/'
}

function useTabPathnameIfInsideTabs(): string | null {
  const state = useNavigationState((s) => s)
  if (!state || state.type !== 'tab' || typeof state.index !== 'number') {
    return null
  }
  const r = state.routes[state.index]
  const name = r?.name
  if (typeof name !== 'string') return null
  return tabRouteNameToPathname(name)
}

/**
 * Стабильный pathname для TopBar: синхронизация с контейнером + для экранов внутри (tabs)
 * — pathname активной вкладки, а не глобальный leaf (поверх табов).
 */
export function useEffectivePathname(): string {
  const fallback = usePathname()
  const ref = useNavigationContainerRef()
  const tabPathname = useTabPathnameIfInsideTabs()

  const [basePathname, setBasePathname] = useState(fallback)

  useEffect(() => {
    const apply = (state: Parameters<typeof getRouteInfoFromState>[0]) => {
      try {
        if (state) {
          setBasePathname(getRouteInfoFromState(state).pathname)
        }
      } catch {
        setBasePathname(fallback)
      }
    }

    const st = ref.getRootState()
    if (st) {
      apply(st)
    } else {
      setBasePathname(fallback)
    }

    return ref.addListener('state', (e) => {
      if (e.data?.state) apply(e.data.state)
    })
  }, [ref, fallback])

  return useMemo(() => {
    if (tabPathname != null) {
      return tabPathname
    }
    return basePathname
  }, [basePathname, tabPathname])
}
