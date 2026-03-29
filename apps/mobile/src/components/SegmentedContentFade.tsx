import * as React from 'react'
import { Animated, Easing, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'

type SegmentedContentFadeProps = {
  /** Значение активного сегмента — при смене запускается анимация контента. */
  activeKey: string
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
  /**
   * Порядок сегментов слева направо (как в `SegmentedControl`).
   * Если передан — контент слегка сдвигается по горизонтали в сторону переключения (вход «вслед» за табом).
   */
  segmentOrder?: readonly string[]
  /**
   * Только короткий кроссфейд по opacity, без translateX.
   * Для тяжёлого контента (ScrollView + длинный список) горизонтальный сдиг родителя даёт заметные рывки.
   */
  opacityOnly?: boolean
}

/** Меньше пикселей — меньше конфликта с тяжёлым списком при transform. */
const SLIDE_PX = 6
/**
 * Ease-in-out: плавный старт и финиш (без рывка в начале, как у ease-out).
 * Узел (0.45,0)→(0.55,1) — классический CSS ease-in-out; чуть дольше, чтобы оба конца успели.
 */
const SLIDE_DURATION_MS = 520
const SLIDE_EASING = Easing.bezier(0.45, 0, 0.55, 1)

const FADE_DURATION_MS = 340
const FADE_EASING = Easing.bezier(0.45, 0, 0.55, 1)

/**
 * Режим `opacityOnly`: стартовая непрозрачность перед доводкой до 1.
 * Важно: сброс opacity делаем ещё в фазе рендера при смене `activeKey`, иначе первый кадр
 * с новым контентом рисуется при opacity 1 — визуально «анимации нет».
 */
const OPACITY_ONLY_START = 0.78
const OPACITY_ONLY_DURATION_MS = 400

/**
 * Обёртка под `SegmentedControl`: лёгкий горизонтальный сдвиг по направлению таба + без резкого затемнения (без «мигания»).
 */
export function SegmentedContentFade({
  activeKey,
  segmentOrder,
  children,
  style,
  opacityOnly = false,
}: SegmentedContentFadeProps) {
  const opacity = React.useRef(new Animated.Value(1)).current
  const translateX = React.useRef(new Animated.Value(0)).current
  const prevKey = React.useRef<string | undefined>(undefined)
  const opacityOnlyMountedRef = React.useRef(false)
  const opacityOnlyPrevKeyRef = React.useRef(activeKey)
  const segmentOrderRef = React.useRef(segmentOrder)
  const slideAnimRef = React.useRef<Animated.CompositeAnimation | null>(null)
  const fadeAnimRef = React.useRef<Animated.CompositeAnimation | null>(null)
  segmentOrderRef.current = segmentOrder

  if (opacityOnly) {
    if (opacityOnlyMountedRef.current && opacityOnlyPrevKeyRef.current !== activeKey) {
      slideAnimRef.current?.stop()
      fadeAnimRef.current?.stop()
      opacity.stopAnimation()
      translateX.setValue(0)
      opacity.setValue(OPACITY_ONLY_START)
    }
    opacityOnlyPrevKeyRef.current = activeKey
  }

  // useLayoutEffect: для opacityOnly — доводка до 1 после сброса в рендере; иначе слайд/фейд как раньше.
  React.useLayoutEffect(() => {
    if (opacityOnly) {
      if (!opacityOnlyMountedRef.current) {
        opacityOnlyMountedRef.current = true
        return
      }
      fadeAnimRef.current?.stop()
      opacity.stopAnimation()
      const fade = Animated.timing(opacity, {
        toValue: 1,
        duration: OPACITY_ONLY_DURATION_MS,
        easing: FADE_EASING,
        useNativeDriver: true,
      })
      fadeAnimRef.current = fade
      fade.start(({ finished }) => {
        if (finished) fadeAnimRef.current = null
      })
      return
    }

    if (prevKey.current === undefined) {
      prevKey.current = activeKey
      return
    }
    if (prevKey.current === activeKey) return

    const from = prevKey.current
    const to = activeKey
    prevKey.current = activeKey

    slideAnimRef.current?.stop()
    fadeAnimRef.current?.stop()
    opacity.stopAnimation()
    translateX.stopAnimation()

    const order = segmentOrderRef.current
    let dir = 0
    if (order?.length) {
      const i0 = order.indexOf(from)
      const i1 = order.indexOf(to)
      if (i0 >= 0 && i1 >= 0) dir = Math.sign(i1 - i0)
    }

    if (dir !== 0) {
      translateX.setValue(dir * SLIDE_PX)
      opacity.setValue(1)
      const slide = Animated.timing(translateX, {
        toValue: 0,
        duration: SLIDE_DURATION_MS,
        easing: SLIDE_EASING,
        useNativeDriver: true,
      })
      slideAnimRef.current = slide
      slide.start(({ finished }) => {
        if (finished) slideAnimRef.current = null
      })
      return
    }

    translateX.setValue(0)
    opacity.setValue(0.997)
    const fade = Animated.timing(opacity, {
      toValue: 1,
      duration: FADE_DURATION_MS,
      easing: FADE_EASING,
      useNativeDriver: true,
    })
    fadeAnimRef.current = fade
    fade.start(({ finished }) => {
      if (finished) fadeAnimRef.current = null
    })
  }, [activeKey, opacity, opacityOnly, translateX])

  return (
    <Animated.View
      style={[styles.root, style, { opacity, transform: [{ translateX }] }]}
      collapsable={false}
    >
      {children}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    minHeight: 0,
    alignSelf: 'stretch',
    /** Не клипать дочерний контент по краям при transform/opacity (иначе «стены» у скролла). */
    overflow: 'visible',
  },
})
