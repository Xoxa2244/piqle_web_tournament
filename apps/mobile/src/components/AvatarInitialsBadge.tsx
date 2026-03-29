import React, { useMemo } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'

import type { ThemePalette } from '../lib/theme'
import { useAppTheme } from '../providers/ThemeProvider'

/** Без внешнего «кольца» — иначе выглядит как серая/лишняя обводка. */
const INSET = 0

export type AvatarInitialsBadgeProps = {
  label: string
  size?: number
}

function computeInitials(label: string): string {
  return label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

function hslFromLabel(label: string): { inner: string; outer: string } {
  const hash = hashString(String(label ?? ''))
  const hue = 118 + (hash % 38)
  const sat = 62 + (Math.floor(hash / 37) % 18)
  const light = 40 + (Math.floor(hash / 997) % 14)
  const inner = `hsl(${hue} ${sat}% ${light}%)`
  const outer = `hsla(${hue} ${sat}% ${Math.min(92, light + 35)}% / 0.40)`
  return { inner, outer }
}

/**
 * Круг с инициалами пользователя: цвет от хэша имени, размер шрифта от `size`.
 * Внутренний круг с фиксированными width/height + lineHeight = диаметр — стабильное центрирование на iOS/Android.
 */
export function AvatarInitialsBadge({ label, size = 48 }: AvatarInitialsBadgeProps) {
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])

  const initials = computeInitials(label)
  const display = initials || 'P'
  const { inner, outer } = hslFromLabel(String(label ?? ''))

  const innerDiameter = Math.max(0, size - INSET * 2)
  const innerRadius = innerDiameter / 2
  const twoLetters = display.length >= 2

  const rawFont = Math.round(innerDiameter * (twoLetters ? 0.4 : 0.46))
  const fontSize = Math.max(
    9,
    Math.min(rawFont, Math.floor(innerDiameter * 0.56)),
  )
  /** Высота строки = высота внутреннего круга — глиф центрируется в «линии» на обеих платформах. */
  const lineHeight = innerDiameter

  const textStyle = useMemo(
    () => [
      styles.text,
      {
        fontSize,
        lineHeight,
        width: innerDiameter,
        ...(Platform.OS === 'android'
          ? { includeFontPadding: false, textAlignVertical: 'center' as const }
          : {}),
      },
    ],
    [styles.text, fontSize, lineHeight, innerDiameter],
  )

  return (
    <View
      style={[
        styles.outer,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: outer,
          padding: INSET,
        },
      ]}
    >
      <View
        style={[
          styles.inner,
          {
            width: innerDiameter,
            height: innerDiameter,
            borderRadius: innerRadius,
            backgroundColor: inner,
          },
        ]}
      >
        <Text style={textStyle} numberOfLines={1} maxFontSizeMultiplier={1.35}>
          {display}
        </Text>
      </View>
    </View>
  )
}

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
    outer: {
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: colors.shadowStrong,
      shadowOpacity: 0.25,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 10 },
      elevation: 4,
    },
    inner: {
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    text: {
      color: colors.white,
      fontWeight: '700',
      textAlign: 'center',
    },
  })
