import { BlurView } from 'expo-blur'
import * as Haptics from 'expo-haptics'
import type { PropsWithChildren, ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { radius, spacing, type ThemePalette } from '../lib/theme'
import { useAppTheme } from '../providers/ThemeProvider'

import { ActionButton } from './ui'

const SHEET_OFF_Y = 560

const triggerModalOpenHaptic = async () => {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setTimeout(() => {
      void Haptics.selectionAsync()
    }, 45)
  } catch {
    // ignore haptic failures on unsupported devices
  }
}

export type AppBottomSheetProps = PropsWithChildren<{
  open: boolean
  onClose: () => void
  title?: string
  titleBelow?: ReactNode
  subtitle?: string
  /** Нижняя зона под кнопками (по умолчанию компактно). */
  footer?: ReactNode
  /** Доп. отступ снизу внутри панели (до safe area). */
  bottomPaddingExtra?: number
}>

/**
 * Единая нижняя шторка: blur + затемнение (fade), панель снизу (slide + spring).
 */
export function AppBottomSheet({
  open,
  onClose,
  title,
  titleBelow,
  subtitle,
  children,
  footer,
  bottomPaddingExtra = 0,
}: AppBottomSheetProps) {
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const insets = useSafeAreaInsets()
  const [mounted, setMounted] = useState(false)
  const backdropOp = useRef(new Animated.Value(0)).current
  const sheetY = useRef(new Animated.Value(SHEET_OFF_Y)).current
  const wasOpen = useRef(false)

  useEffect(() => {
    if (open) {
      wasOpen.current = true
      setMounted(true)
      void triggerModalOpenHaptic()
      backdropOp.setValue(0)
      sheetY.setValue(SHEET_OFF_Y)
      requestAnimationFrame(() => {
        Animated.parallel([
          Animated.timing(backdropOp, {
            toValue: 1,
            duration: 280,
            useNativeDriver: true,
          }),
          Animated.spring(sheetY, {
            toValue: 0,
            friction: 9,
            tension: 70,
            useNativeDriver: true,
          }),
        ]).start()
      })
    } else if (wasOpen.current) {
      Animated.parallel([
        Animated.timing(backdropOp, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(sheetY, {
          toValue: SHEET_OFF_Y,
          duration: 240,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setMounted(false)
        wasOpen.current = false
      })
    }
  }, [open, backdropOp, sheetY])

  /** Пока идёт анимация закрытия, держим дерево; при open=true mounted ещё false — всё равно показываем. */
  const showModal = open || mounted
  if (!showModal) return null

  const padBottom = spacing.md + insets.bottom + bottomPaddingExtra

  return (
    <Modal visible={true} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: backdropOp }]}>
          <BlurView intensity={44} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.2)' }]} />
        </Animated.View>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close sheet" />
        <Animated.View
          style={[
            styles.sheet,
            {
              paddingBottom: padBottom,
              transform: [{ translateY: sheetY }],
            },
          ]}
        >
          <View style={styles.handle} />
          {title ? (
            <View style={styles.titleRow}>
              <View style={styles.titleBlock}>
                {title ? <Text style={styles.title}>{title}</Text> : null}
                {titleBelow ? <View style={styles.titleBelow}>{titleBelow}</View> : null}
                {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
              </View>
            </View>
          ) : subtitle ? (
            <Text style={styles.subtitle}>{subtitle}</Text>
          ) : null}
          {children}
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </Animated.View>
      </View>
    </Modal>
  )
}

const createStyles = (colors: ThemePalette) => StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: '88%',
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  titleBelow: {
    marginTop: spacing.sm,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    marginTop: spacing.sm,
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  footer: {
    marginTop: spacing.md,
    gap: 10,
  },
})

export type AppConfirmIntent = 'destructive' | 'positive'

/**
 * Пара действий в шторке: **Отмена** — серая обводка; подтверждение зависит от intent.
 * - `destructive` (удалить, выйти, сбросить): серая заливка (`neutral`, не secondary).
 * - `positive` (применить, сохранить): зелёная primary.
 */
export function AppConfirmActions({
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
  confirmLoading,
  intent = 'destructive',
}: {
  cancelLabel: string
  confirmLabel: string
  onCancel: () => void
  onConfirm: () => void
  confirmLoading?: boolean
  intent?: AppConfirmIntent
}) {
  const confirmVariant = intent === 'positive' ? 'primary' : 'neutral'
  return (
    <View style={confirmStyles.row}>
      <View style={confirmStyles.btn}>
        <ActionButton label={cancelLabel} variant="outline" onPress={onCancel} />
      </View>
      <View style={confirmStyles.btn}>
        <ActionButton
          label={confirmLabel}
          variant={confirmVariant}
          loading={confirmLoading}
          onPress={onConfirm}
        />
      </View>
    </View>
  )
}

/** Одна кнопка закрытия инфо-шторки (обводка, как отмена). */
export function AppInfoFooter({ label, onPress }: { label?: string; onPress: () => void }) {
  return <ActionButton label={label ?? 'OK'} variant="outline" onPress={onPress} />
}

const confirmStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  btn: {
    flex: 1,
  },
})
