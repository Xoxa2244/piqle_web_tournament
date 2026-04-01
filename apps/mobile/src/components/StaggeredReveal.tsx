import { useEffect, useMemo, useRef } from 'react'
import { Animated, Easing, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'

type StaggeredRevealProps = {
  children: React.ReactNode
  index: number
  triggerKey: string | number
  style?: StyleProp<ViewStyle>
  distance?: number
}

const BASE_DURATION_MS = 520
const STEP_DELAY_MS = 72
const MAX_DELAY_MS = 520

export function StaggeredReveal({
  children,
  index,
  triggerKey,
  style,
  distance = 10,
}: StaggeredRevealProps) {
  const opacity = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(distance)).current
  const prevKeyRef = useRef<string | number | null>(null)

  const delay = useMemo(
    () => Math.min(MAX_DELAY_MS, Math.max(0, index) * STEP_DELAY_MS),
    [index],
  )

  useEffect(() => {
    const changed = prevKeyRef.current !== triggerKey
    prevKeyRef.current = triggerKey
    if (!changed) return

    opacity.stopAnimation()
    translateY.stopAnimation()
    opacity.setValue(0.06)
    translateY.setValue(distance)

    const anim = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: BASE_DURATION_MS,
        delay,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: BASE_DURATION_MS,
        delay,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        useNativeDriver: true,
      }),
    ])

    anim.start()
    return () => anim.stop()
  }, [delay, distance, opacity, translateY, triggerKey])

  return (
    <Animated.View style={[styles.root, style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
  },
})

