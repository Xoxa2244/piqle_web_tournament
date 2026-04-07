import { Feather } from '@expo/vector-icons'
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native'

import { radius } from '../lib/theme'
import { useAppTheme } from '../providers/ThemeProvider'

/** Как в iOS Mail: отпускание левее ~50% ширины — удаление; правее — возврат. */
const DISMISS_POSITION_FRACTION = 0.5

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
  /** После анимации скрытия; при ошибке можно бросить исключение — строка откатится. */
  onDismiss: () => void | Promise<void>
  /** Не перехватывать жест (например идёт открытие). */
  disabled?: boolean
  style?: StyleProp<ViewStyle>
  onSwipeActiveChange?: (active: boolean) => void
}

/**
 * Свайп влево: красная плашка справа; жест с инерцией (spring + velocity), как в системных списках iOS / чатах.
 */
export function SwipeDismissNotificationRow({
  children,
  onDismiss,
  disabled,
  style,
  onSwipeActiveChange,
}: Props) {
  const { colors } = useAppTheme()
  const widthRef = useRef(0)
  const translateX = useRef(new Animated.Value(0)).current
  const rowOpacity = useRef(new Animated.Value(1)).current
  const startOffsetRef = useRef(0)
  const posRef = useRef(0)
  const dismissingRef = useRef(false)
  /** Один settle на один touch (редко и terminate, и release подряд). */
  const touchSettledRef = useRef(false)
  /** Ширина открытой красной зоны справа — для hit-area тапа «Delete». */
  const [revealPx, setRevealPx] = useState(0)

  const [rowWidth, setRowWidth] = useState(0)
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const lw = e.nativeEvent.layout.width
    widthRef.current = lw
    setRowWidth(lw)
  }, [])

  const resetRow = useCallback(() => {
    dismissingRef.current = false
    translateX.setValue(0)
    rowOpacity.setValue(1)
    posRef.current = 0
    startOffsetRef.current = 0
    setRevealPx(0)
    onSwipeActiveChange?.(false)
  }, [onSwipeActiveChange, rowOpacity, translateX])

  const runDismiss = useCallback(
    (releaseVelocityPxPerSec: number = 0) => {
      if (dismissingRef.current) return
      const w = widthRef.current
      if (w <= 0) {
        void Promise.resolve(onDismiss()).catch(() => undefined)
        return
      }
      dismissingRef.current = true
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
        if (!finished) {
          dismissingRef.current = false
          return
        }
        Animated.timing(rowOpacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }).start(({ finished: faded }) => {
          if (!faded) {
            dismissingRef.current = false
            return
          }
          Promise.resolve(onDismiss())
            .catch(() => {
              resetRow()
            })
            .finally(() => {
              dismissingRef.current = false
            })
        })
      })
    },
    [onDismiss, resetRow, rowOpacity, translateX],
  )

  const settleAfterPan = useCallback(
    (vxPxPerSec: number) => {
      if (dismissingRef.current) return
      if (touchSettledRef.current) return
      const w = widthRef.current
      if (w <= 0) return
      touchSettledRef.current = true
      const pos = posRef.current
      const pastHalf = pos <= -w * DISMISS_POSITION_FRACTION
      if (pastHalf) {
        runDismiss(vxPxPerSec)
      } else {
        setRevealPx(0)
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
          setRevealPx(0)
        })
      }
    },
    [runDismiss, translateX],
  )

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2,
        /** Не отдавать жест родительскому ScrollView, пока палец ушёл за границы строки. */
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: () => {
          touchSettledRef.current = false
          onSwipeActiveChange?.(true)
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
          setRevealPx(Math.min(-next, w))
        },
        onPanResponderRelease: (_, g) => {
          onSwipeActiveChange?.(false)
          settleAfterPan(vxToPxPerSec(g.vx))
        },
        /** Система отняла responder (например конфликт со скроллом) — доводим до 0 или удаления. */
        onPanResponderTerminate: () => {
          onSwipeActiveChange?.(false)
          settleAfterPan(0)
        },
      }),
    [onSwipeActiveChange, settleAfterPan, translateX],
  )

  const onDeleteStripPress = useCallback(() => {
    if (dismissingRef.current || disabled) return
    const w = widthRef.current
    if (w <= 0) return
    if (revealPx < w * DISMISS_POSITION_FRACTION) return
    runDismiss(0)
  }, [disabled, revealPx, runDismiss])

  if (disabled) {
    return <View style={style}>{children}</View>
  }

  const tapStripWidth = rowWidth > 0 ? Math.min(Math.max(revealPx, 0), rowWidth) : Math.max(revealPx, 0)
  const showDeleteTap = tapStripWidth > 12 && rowWidth > 0

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
        style={[styles.foreground, { zIndex: 1, transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        {children}
      </Animated.View>
      {showDeleteTap ? (
        <Pressable
          accessibilityLabel="Delete notification"
          onPress={onDeleteStripPress}
          style={[styles.deleteHitStrip, { width: tapStripWidth }]}
        />
      ) : null}
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
  /** Тап по открытой красной зоне (поверх карточки, z-index). */
  deleteHitStrip: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 2,
  },
})
