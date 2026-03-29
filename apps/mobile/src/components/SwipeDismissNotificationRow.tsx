import { Feather } from '@expo/vector-icons'
import { useCallback, useMemo, useRef, type ReactNode } from 'react'
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native'

import { radius } from '../lib/theme'
import { useAppTheme } from '../providers/ThemeProvider'

/** Порог скорости влево (px/с) — быстрый «флик» дотягивает до удаления. */
const FLING_DISMISS_V_PX_PER_SEC = -450
/** Минимальная доля ширины для dismiss при медленном отпускании. */
const DISMISS_POSITION_FRACTION = 0.28

/** PanResponder даёт `vx` в px/мс; Animated.spring — в px/с. */
function vxToPxPerSec(vx: number): number {
  return vx * 1000
}

/** Сопротивление при перетягивании левее полного открытия (как rubber-band в iOS). */
function rubberLeftOverscroll(overshoot: number): number {
  if (overshoot <= 0) return 0
  return (1 - Math.exp(-overshoot / 42)) * 22
}

type Props = {
  children: ReactNode
  /** Вызов после анимации ухода влево (запрос на сервер). */
  onDismiss: () => void
  /** Не перехватывать жест (например идёт открытие). */
  disabled?: boolean
  style?: StyleProp<ViewStyle>
}

/**
 * Свайп влево: красная плашка справа; жест с инерцией (spring + velocity), как в системных списках iOS / чатах.
 */
export function SwipeDismissNotificationRow({ children, onDismiss, disabled, style }: Props) {
  const { colors } = useAppTheme()
  const widthRef = useRef(0)
  const translateX = useRef(new Animated.Value(0)).current
  const rowOpacity = useRef(new Animated.Value(1)).current
  const startOffsetRef = useRef(0)
  const posRef = useRef(0)

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width
  }, [])

  const runDismiss = useCallback(
    (releaseVelocityPxPerSec: number = 0) => {
      const w = widthRef.current
      if (w <= 0) {
        onDismiss()
        return
      }
      Animated.spring(translateX, {
        toValue: -w,
        useNativeDriver: true,
        friction: 9,
        tension: 118,
        velocity: releaseVelocityPxPerSec,
        overshootClamping: true,
        restDisplacementThreshold: 0.5,
        restSpeedThreshold: 0.5,
      }).start(({ finished }) => {
        if (!finished) return
        Animated.timing(rowOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start(({ finished: faded }) => {
          if (faded) onDismiss()
        })
      })
    },
    [onDismiss, rowOpacity, translateX],
  )

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2,
        onPanResponderGrant: () => {
          translateX.stopAnimation((v) => {
            const x = typeof v === 'number' && !Number.isNaN(v) ? v : 0
            startOffsetRef.current = x
            posRef.current = x
          })
        },
        onPanResponderMove: (_, g) => {
          const w = widthRef.current
          if (w <= 0) return
          let next = startOffsetRef.current + g.dx
          if (next > 0) next = 0
          else if (next < -w) {
            const overshoot = -(next + w)
            next = -w - rubberLeftOverscroll(overshoot)
          }
          posRef.current = next
          translateX.setValue(next)
        },
        onPanResponderRelease: (_, g) => {
          const w = widthRef.current
          if (w <= 0) return
          const pos = posRef.current
          const vxPxPerSec = vxToPxPerSec(g.vx)
          const pastReveal = pos < -w * DISMISS_POSITION_FRACTION
          const flingDismiss = vxPxPerSec < FLING_DISMISS_V_PX_PER_SEC
          if (pastReveal || flingDismiss) {
            runDismiss(vxPxPerSec)
          } else {
            Animated.spring(translateX, {
              toValue: 0,
              useNativeDriver: true,
              friction: 8,
              tension: 210,
              velocity: vxPxPerSec,
              overshootClamping: true,
              restDisplacementThreshold: 0.5,
              restSpeedThreshold: 0.5,
            }).start(() => {
              posRef.current = 0
              startOffsetRef.current = 0
            })
          }
        },
      }),
    [runDismiss, translateX],
  )

  if (disabled) {
    return <View style={style}>{children}</View>
  }

  return (
    <Animated.View style={[styles.root, style, { opacity: rowOpacity }]} onLayout={onLayout}>
      <View
        style={[styles.deleteUnderlay, { backgroundColor: colors.danger }]}
        pointerEvents="none"
      >
        <View style={styles.deleteUnderlayContent}>
          <Feather name="trash-2" size={22} color="rgba(255,255,255,0.96)" />
          <Text style={styles.deleteLabel}>Delete</Text>
        </View>
      </View>
      <Animated.View
        style={[styles.foreground, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        {children}
      </Animated.View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  root: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: radius.lg,
  },
  deleteUnderlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'stretch',
    paddingRight: 18,
  },
  deleteUnderlayContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    maxWidth: '46%',
    justifyContent: 'flex-end',
  },
  deleteLabel: {
    color: 'rgba(255,255,255,0.98)',
    fontSize: 15,
    fontWeight: '400',
  },
  foreground: {
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: 'transparent',
  },
})
