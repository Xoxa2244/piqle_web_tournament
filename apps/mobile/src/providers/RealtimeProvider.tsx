import type { PropsWithChildren } from 'react'
import { createContext, useContext } from 'react'

type RealtimeConnectionState = {
  enabled: boolean
  connected: boolean
}

const RealtimeConnectionContext = createContext<RealtimeConnectionState>({
  enabled: false,
  connected: false,
})

export function RealtimeConnectionProvider({
  children,
  value,
}: PropsWithChildren<{ value: RealtimeConnectionState }>) {
  return <RealtimeConnectionContext.Provider value={value}>{children}</RealtimeConnectionContext.Provider>
}

export function useRealtimeConnection() {
  return useContext(RealtimeConnectionContext)
}
