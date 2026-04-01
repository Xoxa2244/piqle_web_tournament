import type { PropsWithChildren } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'
import { requireOptionalNativeModule } from 'expo-modules-core'

type GradientPoint = {
  x: number
  y: number
}

type OptionalLinearGradientProps = PropsWithChildren<{
  colors: readonly [string, string, ...string[]]
  start?: GradientPoint
  end?: GradientPoint
  style?: StyleProp<ViewStyle>
  pointerEvents?: 'box-none' | 'none' | 'box-only' | 'auto'
  fallbackColor?: string
}>

const hasNativeLinearGradient = Boolean(requireOptionalNativeModule('ExpoLinearGradient'))

export const OptionalLinearGradient = ({
  children,
  colors,
  style,
  start,
  end,
  pointerEvents,
  fallbackColor,
}: OptionalLinearGradientProps) => {
  if (!hasNativeLinearGradient) {
    return (
      <View
        pointerEvents={pointerEvents}
        style={[style, { backgroundColor: fallbackColor ?? colors[0] }]}
      >
        {children}
      </View>
    )
  }

  const { LinearGradient } = require('expo-linear-gradient') as typeof import('expo-linear-gradient')

  return (
    <LinearGradient
      colors={colors}
      start={start}
      end={end}
      style={style}
      pointerEvents={pointerEvents}
    >
      {children}
    </LinearGradient>
  )
}
