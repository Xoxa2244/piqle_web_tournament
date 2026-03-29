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

const DISMISS_VELOCITY = 1.15

type Props = {
  children: ReactNode
  /** Вызов после анимации ухода влево (запрос на сервер). */
  onDismiss: () => void
  /** Не перехватывать жест (например идёт открытие). */
  disabled?: boolean
  style?: StyleProp<ViewStyle>
}

/**
 * Свайп влево: красная плашка справа, при отпускании после ~50% ширины — догон анимацией и `onDismiss`.
 */
export function SwipeDismissNotificationRow({ children, onDismiss, disabled, style }: Props) {
  const { colors } = useAppTheme()
  const widthRef = useRef(0)
  const translateX = useRef(new Animated.Value(0)).current
  const startOffsetRef = useRef(0)
  const posRef = useRef(0)

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width
  }, [])

  const runDismiss = useCallback(() => {
    const w = widthRef.current
    if (w <= 0) {
      onDismiss()
      return
    }
    Animated.timing(translateX, {
      toValue: -w,
      duration: 220,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onDismiss()
    })
  }, [onDismiss, translateX])

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
          const next = Math.min(0, Math.max(-w, startOffsetRef.current + g.dx))
          posRef.current = next
          translateX.setValue(next)
        },
        onPanResponderRelease: (_, g) => {
          const w = widthRef.current
          if (w <= 0) return
          const pos = posRef.current
          const pastHalf = pos < -w * 0.5
          const flingLeft = g.vx < -DISMISS_VELOCITY
          if (pastHalf || flingLeft) {
            runDismiss()
          } else {
            Animated.spring(translateX, {
              toValue: 0,
              useNativeDriver: true,
              friction: 9,
              tension: 80,
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
    <View style={[styles.root, style]} onLayout={onLayout}>
      <View
        style={[styles.deleteUnderlay, { backgroundColor: colors.danger }]}
        pointerEvents="none"
      >
        <View style={styles.deleteUnderlayContent}>
          <Feather name="trash-2" size={22} color="rgba(255,255,255,0.96)" />
          <View>
            <Text style={styles.deleteTitle}>Удалить</Text>
            <Text style={styles.deleteSubtitle}>уведомление</Text>
          </View>
        </View>
      </View>
      <Animated.View
        style={[styles.foreground, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
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
  deleteTitle: {
    color: 'rgba(255,255,255,0.98)',
    fontSize: 15,
    fontWeight: '800',
  },
  deleteSubtitle: {
    marginTop: 1,
    color: 'rgba(255,255,255,0.78)',
    fontSize: 12,
    fontWeight: '600',
  },
  foreground: {
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: 'transparent',
  },
})
