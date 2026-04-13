import { Asset } from 'expo-asset'
import * as FileSystem from 'expo-file-system/legacy'
import { useEffect, useMemo, useState } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import { SvgXml } from 'react-native-svg'

import { useAppTheme } from '../providers/ThemeProvider'

import { OptionalLinearGradient } from './OptionalLinearGradient'

/**
 * Запасной цвет под слоем (светлая тема). Для тёмной см. `colors.background` в `ChatAmbientBackground`.
 */
export const CHAT_AMBIENT_FALLBACK = '#fafafa'

const LIGHT_CHAT_PATTERN = require('../assets/chat-backgrounds/chat-pattern-light.svg')
const DARK_CHAT_PATTERN = require('../assets/chat-backgrounds/chat-pattern-dark.svg')

/**
 * Полноэкранный фон чата: под статус-бар (время/батарея), под шапку, ленту и инпут.
 * Слой absolute на весь экран — SafeArea только отступает контент, не режет фон.
 * Поверх градиента — едва заметный повторяющийся SVG (точки + микро «пузырьки», в духе Telegram).
 */
export function ChatAmbientBackground() {
  const { theme, colors } = useAppTheme()
  const { width, height } = useWindowDimensions()
  const [patternXml, setPatternXml] = useState<string | null>(null)
  const lightThemeOpacity = theme === 'light' ? 0.35 : 1

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const asset = Asset.fromModule(theme === 'dark' ? DARK_CHAT_PATTERN : LIGHT_CHAT_PATTERN)
        await asset.downloadAsync()
        const uri = asset.localUri || asset.uri
        if (!uri) return
        const xml = await FileSystem.readAsStringAsync(uri)
        if (!cancelled) {
          setPatternXml(xml)
        }
      } catch {
        if (!cancelled) {
          setPatternXml(null)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [theme])

  const { gradientColors, fallbackColor, gradientEnd } = useMemo(() => {
    if (theme === 'dark') {
      return {
        gradientColors: [colors.background, '#121212', colors.surfaceElevated] as const,
        fallbackColor: colors.background,
        gradientEnd: { x: 0.92, y: 1 } as const,
      }
    }
    return {
      gradientColors: ['#7BFF8F', '#FCD240'] as const,
      fallbackColor: CHAT_AMBIENT_FALLBACK,
      gradientEnd: { x: 1, y: 1 } as const,
    }
  }, [theme, colors.background, colors.surfaceElevated])

  return (
    <View style={[StyleSheet.absoluteFill, { opacity: lightThemeOpacity }]} pointerEvents="none">
      <OptionalLinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={gradientEnd}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        fallbackColor={fallbackColor}
      >
        <View style={{ flex: 1 }} />
      </OptionalLinearGradient>
      {patternXml ? (
        <View style={styles.patternLayer}>
          <SvgXml xml={patternXml} width={width} height={height} />
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  patternLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
})
