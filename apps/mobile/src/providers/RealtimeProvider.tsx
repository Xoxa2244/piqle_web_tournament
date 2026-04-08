import type { Dispatch, PropsWithChildren, SetStateAction } from 'react'
import { createContext, useContext } from 'react'

type RealtimeConnectionState = {
  enabled: boolean
  connected: boolean
  chatScopeActive: boolean
  setChatScopeActive: Dispatch<SetStateAction<boolean>>
}

const RealtimeConnectionContext = createContext<RealtimeConnectionState>({
  enabled: false,
  connected: false,
  chatScopeActive: false,
  setChatScopeActive: () => undefined,
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
