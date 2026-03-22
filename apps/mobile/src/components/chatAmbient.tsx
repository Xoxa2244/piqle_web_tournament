import { useId } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import Svg, { Circle, Defs, Pattern, Rect } from 'react-native-svg'

import { OptionalLinearGradient } from './OptionalLinearGradient'

/**
 * Запасной цвет под слоем. Почти белый — отличие от #fff минимальное.
 */
export const CHAT_AMBIENT_FALLBACK = '#fafafa'

/** Почти белый: едва различимый переход */
const GRADIENT = ['#ffffff', '#fafafa', '#fcfcfc'] as const

const TILE = 44

/**
 * Полноэкранный фон чата: под статус-бар (время/батарея), под шапку, ленту и инпут.
 * Слой absolute на весь экран — SafeArea только отступает контент, не режет фон.
 * Поверх градиента — едва заметный повторяющийся SVG (точки + микро «пузырьки», в духе Telegram).
 */
export function ChatAmbientBackground() {
  const { width, height } = useWindowDimensions()
  const rawId = useId()
  const patternId = `chatbg_${rawId.replace(/[^a-zA-Z0-9]/g, '_')}`

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <OptionalLinearGradient
        colors={GRADIENT}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.92, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        fallbackColor={CHAT_AMBIENT_FALLBACK}
      >
        <View style={{ flex: 1 }} />
      </OptionalLinearGradient>
      <Svg width={width} height={height} pointerEvents="none">
        <Defs>
          <Pattern id={patternId} x={0} y={0} width={TILE} height={TILE} patternUnits="userSpaceOnUse">
            <Circle cx={7} cy={9} r={0.7} fill="rgba(120,128,140,0.028)" />
            <Circle cx={24} cy={20} r={0.55} fill="rgba(120,128,140,0.022)" />
            <Circle cx={38} cy={36} r={0.6} fill="rgba(120,128,140,0.024)" />
            <Circle cx={16} cy={34} r={0.45} fill="rgba(120,128,140,0.02)" />
            <Rect x={28} y={5} width={11} height={8} rx={2} fill="rgba(120,128,140,0.018)" />
            <Circle cx={33} cy={28} r={0.5} fill="rgba(120,128,140,0.02)" />
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill={`url(#${patternId})`} />
      </Svg>
    </View>
  )
}
