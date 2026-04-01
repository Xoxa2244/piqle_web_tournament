import { View } from 'react-native'

/** Единый стиль «есть непрочитанное» (как красный бейдж на сегменте Members). */
const UNREAD_DOT = '#EF4444'

export function UnreadIndicatorDot({ size = 8 }: { size?: number }) {
  const r = size / 2
  return <View style={{ width: size, height: size, borderRadius: r, backgroundColor: UNREAD_DOT }} />
}
