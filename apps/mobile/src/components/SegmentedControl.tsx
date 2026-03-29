import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native'

import { type ThemePalette } from '../lib/theme'
import { useAppTheme } from '../providers/ThemeProvider'

export type SegmentedOption<T extends string> = {
  value: T
  label: string
  /** Числовой бейдж (например заявки в клуб); если > 0 — показывается вместо точки. */
  badgeCount?: number
  /** Точка «есть непрочитанное» без числа (чаты и т.п.). */
  showDot?: boolean
}

type SegmentedControlProps<T extends string> = {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  /** Высота сегментов (по умолчанию 36). */
  minHeight?: number
  /** Стили контейнера (трек): отступы, ширина и т.д. */
  trackStyle?: StyleProp<ViewStyle>
}

/** Совпадает с `track.padding` и `track.gap` — для расчёта ширины сегмента и цели translateX. */
const TRACK_PADDING = 4
const TRACK_GAP = 4

const INDICATOR_TIMING_MS = 320
const INDICATOR_EASING = Easing.bezier(0.45, 0, 0.55, 1)

/**
 * Единый переключатель режимов: круглый трек и круглые сегменты (pill / 999).
 * Выбранная плашка — один общий слой, плавно переезжает между вкладками (без смены фона по клику у каждой ячейки).
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

  const [trackWidth, setTrackWidth] = useState(0)
  const translateX = useRef(new Animated.Value(0)).current
  const prevSegmentWidthRef = useRef(0)

  const activeIndex = useMemo(() => {
    const i = options.findIndex((o) => o.value === value)
    return i >= 0 ? i : 0
  }, [options, value])

  const segmentWidth = useMemo(() => {
    if (trackWidth <= 0 || options.length === 0) return 0
    const inner = trackWidth - TRACK_PADDING * 2
    const gapTotal = TRACK_GAP * (options.length - 1)
    return (inner - gapTotal) / options.length
  }, [trackWidth, options.length])

  useLayoutEffect(() => {
    if (segmentWidth <= 0) return
    const targetX = activeIndex * (segmentWidth + TRACK_GAP)
    const segmentWidthChanged = prevSegmentWidthRef.current !== segmentWidth
    prevSegmentWidthRef.current = segmentWidth

    translateX.stopAnimation()

    if (segmentWidthChanged) {
      translateX.setValue(targetX)
      return
    }

    Animated.timing(translateX, {
      toValue: targetX,
      duration: INDICATOR_TIMING_MS,
      easing: INDICATOR_EASING,
      useNativeDriver: true,
    }).start()
  }, [activeIndex, segmentWidth, translateX])

  return (
    <View
      style={[styles.track, trackStyle]}
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
    >
      {segmentWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.slidingPill,
            {
              width: segmentWidth,
              transform: [{ translateX }],
            },
          ]}
        />
      ) : null}

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
              pressed && !active && styles.segmentPressed,
            ]}
          >
            <View style={styles.labelRow}>
              <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
                {item.label}
              </Text>
              {Number(item.badgeCount ?? 0) > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText} numberOfLines={1}>
                    {item.badgeCount! > 99 ? '99+' : String(item.badgeCount)}
                  </Text>
                </View>
              ) : item.showDot ? (
                <View style={styles.segmentDot} />
              ) : null}
            </View>
          </Pressable>
        )
      })}
    </View>
  )
}

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
    track: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceMuted,
      borderRadius: 999,
      padding: TRACK_PADDING,
      gap: TRACK_GAP,
      position: 'relative',
    },
    slidingPill: {
      position: 'absolute',
      left: TRACK_PADDING,
      top: TRACK_PADDING,
      bottom: TRACK_PADDING,
      borderRadius: 999,
      backgroundColor: colors.surface,
      shadowColor: colors.black,
      shadowOpacity: 0.06,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
      zIndex: 0,
    },
    segment: {
      flex: 1,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
      paddingHorizontal: 6,
      zIndex: 1,
    },
    segmentPressed: {
      opacity: 0.92,
    },
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textMuted,
    },
    labelActive: {
      color: colors.text,
    },
    badge: {
      minWidth: 16,
      height: 16,
      paddingHorizontal: 4,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#EF4444',
    },
    badgeText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '700',
    },
    segmentDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#EF4444',
    },
  })
