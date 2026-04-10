import { Feather } from '@expo/vector-icons'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react'
import {
  Animated,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { FullWindowOverlay } from 'react-native-screens'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useAppTheme } from './ThemeProvider'

const DEFAULT_DURATION_MS = 2000
const HIDDEN_Y = -200
const SWIPE_DISMISS_THRESHOLD = 48

export type ToastVariant = 'default' | 'success' | 'destructive'

export type ToastPayload = {
  title?: string
  message: string
  variant?: ToastVariant
  durationMs?: number
}

type ToastItem = ToastPayload & { id: number }

type ToastContextValue = {
  show: (payload: ToastPayload) => void
  success: (message: string, title?: string) => void
  error: (message: string, title?: string) => void
  hide: () => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

export function useToastOptional(): ToastContextValue | null {
  return useContext(ToastContext)
}

function ToastView({
  toast,
  dismissSignal,
  onDismissed,
}: {
  toast: ToastItem
  dismissSignal: number
  onDismissed: () => void
}) {
  const { colors } = useAppTheme()
  const insets = useSafeAreaInsets()
  const translateY = useRef(new Animated.Value(HIDDEN_Y)).current
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closingRef = useRef(false)
  /** Панель перехватила жест (свайп) — не вызывать scheduleHide из onPressOut дочернего Pressable. */
  const panGestureActiveRef = useRef(false)
  const styles = useMemo(() => createHostStyles(), [])

  const variant = toast.variant ?? 'default'
  const borderColor =
    variant === 'destructive'
      ? 'rgba(220, 38, 38, 0.35)'
      : variant === 'success'
      ? 'rgba(34, 197, 94, 0.35)'
      : colors.border
  const iconColor =
    variant === 'destructive' ? '#DC2626' : variant === 'success' ? '#16A34A' : colors.primary
  const iconName =
    variant === 'destructive' ? 'alert-circle' : variant === 'success' ? 'check-circle' : 'info'

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const runExitRef = useRef<() => void>(() => {})

  const runExit = useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true
    clearTimer()
    Animated.timing(translateY, {
      toValue: HIDDEN_Y,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      closingRef.current = false
      onDismissed()
    })
  }, [clearTimer, onDismissed, translateY])

  runExitRef.current = runExit

  const scheduleHide = useCallback(
    (ms: number) => {
      clearTimer()
      timerRef.current = setTimeout(() => {
        runExitRef.current()
      }, ms)
    },
    [clearTimer],
  )

  useEffect(() => {
    closingRef.current = false
    translateY.setValue(HIDDEN_Y)
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      damping: 18,
      stiffness: 220,
      mass: 0.85,
    }).start()
    scheduleHide(toast.durationMs ?? DEFAULT_DURATION_MS)
    return () => {
      clearTimer()
    }
  }, [toast.id, toast.durationMs, clearTimer, scheduleHide, translateY])

  useEffect(() => {
    if (dismissSignal === 0) return
    runExit()
  }, [dismissSignal, runExit])

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx) * 0.55,
        onPanResponderGrant: () => {
          panGestureActiveRef.current = true
          clearTimer()
        },
        onPanResponderMove: (_, g) => {
          translateY.setValue(Math.min(0, g.dy))
        },
        onPanResponderRelease: (_, g) => {
          panGestureActiveRef.current = false
          if (g.dy < -SWIPE_DISMISS_THRESHOLD || g.vy < -0.45) {
            runExit()
            return
          }
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            damping: 16,
            stiffness: 200,
          }).start()
          scheduleHide(DEFAULT_DURATION_MS)
        },
        onPanResponderTerminate: () => {
          panGestureActiveRef.current = false
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            damping: 16,
            stiffness: 200,
          }).start()
          scheduleHide(DEFAULT_DURATION_MS)
        },
      }),
    [clearTimer, runExit, scheduleHide, translateY],
  )

  const onHoldEnd = () => {
    if (panGestureActiveRef.current) return
    scheduleHide(DEFAULT_DURATION_MS)
  }

  return (
    <Animated.View
      style={[
        styles.wrap,
        {
          marginTop: insets.top + (Platform.OS === 'android' ? 4 : 0),
          transform: [{ translateY }],
        },
      ]}
      {...panResponder.panHandlers}
    >
      <View
        style={[
          styles.card,
          {
            borderColor,
            backgroundColor: colors.surface,
            shadowColor: colors.shadowStrong,
          },
        ]}
      >
        <View
          style={styles.holdArea}
          onTouchStart={() => {
            clearTimer()
          }}
          onTouchEnd={() => {
            onHoldEnd()
          }}
        >
          <Feather name={iconName} size={20} color={iconColor} />
          <View style={styles.textCol}>
            {toast.title ? (
              <Text
                style={[styles.title, { color: colors.text }]}
                numberOfLines={2}
                {...(Platform.OS === 'android' ? { includeFontPadding: false } : {})}
              >
                {toast.title}
              </Text>
            ) : null}
            <Text
              style={[styles.message, { color: colors.textMuted }]}
              numberOfLines={5}
              {...(Platform.OS === 'android' ? { includeFontPadding: false } : {})}
            >
              {toast.message}
            </Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          hitSlop={10}
          onPress={runExit}
          style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.65 }]}
        >
          <Feather name="x" size={18} color={colors.textMuted} />
        </Pressable>
      </View>
    </Animated.View>
  )
}

const createHostStyles = () =>
  StyleSheet.create({
    wrap: {
      position: 'absolute',
      left: 12,
      right: 12,
      top: 0,
      zIndex: 10000,
      elevation: 24,
    },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 52,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth * 2,
      paddingVertical: 12,
      paddingHorizontal: 12,
      gap: 10,
      shadowOpacity: 0.12,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
    },
    holdArea: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    textCol: { flex: 1, minWidth: 0, gap: 2, justifyContent: 'center' },
    title: { fontSize: 15, fontWeight: '700' },
    message: { fontSize: 14, lineHeight: 19 },
    closeBtn: {
      padding: 4,
      marginRight: -4,
      alignSelf: 'center',
    },
  })

export function ToastProvider({ children }: PropsWithChildren) {
  const [toast, setToast] = useState<ToastItem | null>(null)
  const [dismissSignal, setDismissSignal] = useState(0)
  const idRef = useRef(0)

  const onDismissed = useCallback(() => {
    setToast(null)
  }, [])

  const show = useCallback((payload: ToastPayload) => {
    idRef.current += 1
    setDismissSignal(0)
    setToast({ ...payload, id: idRef.current })
  }, [])

  const hide = useCallback(() => {
    if (!toast) return
    setDismissSignal((n) => n + 1)
  }, [toast])

  const success = useCallback(
    (message: string, title?: string) => {
      show({ message, title, variant: 'success' })
    },
    [show],
  )

  const error = useCallback(
    (message: string, title?: string) => {
      show({ message, title, variant: 'destructive' })
    },
    [show],
  )

  const value = useMemo<ToastContextValue>(
    () => ({ show, success, error, hide }),
    [show, success, error, hide],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        Platform.OS === 'ios' ? (
          <FullWindowOverlay>
            <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
              <ToastView
                key={toast.id}
                toast={toast}
                dismissSignal={dismissSignal}
                onDismissed={onDismissed}
              />
            </View>
          </FullWindowOverlay>
        ) : (
          <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={hide}>
            <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
              <ToastView
                key={toast.id}
                toast={toast}
                dismissSignal={dismissSignal}
                onDismissed={onDismissed}
              />
            </View>
          </Modal>
        )
      ) : null}
    </ToastContext.Provider>
  )
}
