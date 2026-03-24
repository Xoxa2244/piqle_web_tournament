import { useMemo } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { type ThemePalette } from '../lib/theme'
import { useAppTheme } from '../providers/ThemeProvider'

export type SegmentedOption<T extends string> = { value: T; label: string }

type SegmentedControlProps<T extends string> = {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  /** Высота сегментов (по умолчанию 36). */
  minHeight?: number
  /** Стили контейнера (трек): отступы, ширина и т.д. */
  trackStyle?: StyleProp<ViewStyle>
}

/**
 * Единый переключатель режимов: круглый трек и круглые сегменты (pill / 999).
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  minHeight = 36,
  trackStyle,
}: SegmentedControlProps<T>) {
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])

  return (
    <View style={[styles.track, trackStyle]}>
      {options.map((item) => {
        const active = value === item.value
        return (
          <Pressable
            key={item.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(item.value)}
            style={({ pressed }) => [
              styles.segment,
              { minHeight },
              active && styles.segmentActive,
              pressed && !active && styles.segmentPressed,
            ]}
          >
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {item.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const createStyles = (colors: ThemePalette) => StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    paddingHorizontal: 6,
  },
  segmentActive: {
    backgroundColor: colors.surface,
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  segmentPressed: {
    opacity: 0.92,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
  },
  labelActive: {
    color: colors.text,
  },
})
