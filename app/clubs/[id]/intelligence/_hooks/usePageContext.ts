'use client'

import { createContext, useContext, useCallback, useRef, useSyncExternalStore } from 'react'

// ── Page Context for AI Chat Widget ──
// Each Intelligence page pushes its current data snapshot here.
// The ChatWidget reads it and sends to the AI as context.

type PageContextStore = {
  pageData: string
  subscribe: (cb: () => void) => () => void
  getSnapshot: () => string
  setPageData: (data: string) => void
}

function createPageContextStore(): PageContextStore {
  let pageData = ''
  const listeners = new Set<() => void>()

  return {
    get pageData() { return pageData },
    subscribe(cb: () => void) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    getSnapshot() { return pageData },
    setPageData(data: string) {
      if (data === pageData) return
      pageData = data
      listeners.forEach(cb => cb())
    },
  }
}

export const PageContextCtx = createContext<PageContextStore | null>(null)

export function createPageContext() {
  return createPageContextStore()
}

export function useSetPageContext() {
  const store = useContext(PageContextCtx)
  return useCallback((data: string) => {
    store?.setPageData(data)
  }, [store])
}

export function usePageContextData(): string {
  const store = useContext(PageContextCtx)
  return useSyncExternalStore(
    store?.subscribe ?? (() => () => {}),
    store?.getSnapshot ?? (() => ''),
    () => '',
  )
}
