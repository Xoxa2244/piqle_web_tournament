import { useId, useMemo } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import Svg, { Circle, Defs, Pattern, Rect } from 'react-native-svg'

import { useAppTheme } from '../providers/ThemeProvider'

import { OptionalLinearGradient } from './OptionalLinearGradient'

/**
 * Запасной цвет под слоем (светлая тема). Для тёмной см. `colors.background` в `ChatAmbientBackground`.
 */
export const CHAT_AMBIENT_FALLBACK = '#fafafa'

const TILE = 44

/**
 * Полноэкранный фон чата: под статус-бар (время/батарея), под шапку, ленту и инпут.
 * Слой absolute на весь экран — SafeArea только отступает контент, не режет фон.
 * Поверх градиента — едва заметный повторяющийся SVG (точки + микро «пузырьки», в духе Telegram).
 */
export function ChatAmbientBackground() {
  const { theme, colors } = useAppTheme()
  const { width, height } = useWindowDimensions()
  const rawId = useId()
  const patternId = `chatbg_${rawId.replace(/[^a-zA-Z0-9]/g, '_')}`

  const { gradientColors, fallbackColor, patternFills } = useMemo(() => {
    if (theme === 'dark') {
      return {
        gradientColors: [colors.background, '#121212', colors.surfaceElevated] as const,
        fallbackColor: colors.background,
        patternFills: {
          c1: 'rgba(255,255,255,0.035)',
          c2: 'rgba(255,255,255,0.028)',
          c3: 'rgba(255,255,255,0.03)',
          c4: 'rgba(255,255,255,0.025)',
          r1: 'rgba(255,255,255,0.022)',
          c5: 'rgba(255,255,255,0.026)',
        },
      }
    }
    return {
      gradientColors: ['#ffffff', '#fafafa', '#fcfcfc'] as const,
      fallbackColor: CHAT_AMBIENT_FALLBACK,
      patternFills: {
        c1: 'rgba(120,128,140,0.028)',
        c2: 'rgba(120,128,140,0.022)',
        c3: 'rgba(120,128,140,0.024)',
        c4: 'rgba(120,128,140,0.02)',
        r1: 'rgba(120,128,140,0.018)',
        c5: 'rgba(120,128,140,0.02)',
      },
    }
  }, [theme, colors.background, colors.surfaceElevated])

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <OptionalLinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.92, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        fallbackColor={fallbackColor}
      >
        <View style={{ flex: 1 }} />
      </OptionalLinearGradient>
      <Svg width={width} height={height} pointerEvents="none">
        <Defs>
          <Pattern id={patternId} x={0} y={0} width={TILE} height={TILE} patternUnits="userSpaceOnUse">
            <Circle cx={7} cy={9} r={0.7} fill={patternFills.c1} />
            <Circle cx={24} cy={20} r={0.55} fill={patternFills.c2} />
            <Circle cx={38} cy={36} r={0.6} fill={patternFills.c3} />
            <Circle cx={16} cy={34} r={0.45} fill={patternFills.c4} />
            <Rect x={28} y={5} width={11} height={8} rx={2} fill={patternFills.r1} />
            <Circle cx={33} cy={28} r={0.5} fill={patternFills.c5} />
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill={`url(#${patternId})`} />
      </Svg>
    </View>
  )
}
