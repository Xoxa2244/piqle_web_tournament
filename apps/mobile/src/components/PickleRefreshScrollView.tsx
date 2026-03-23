import React, { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Animated,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from 'react-native'

import { palette } from '../lib/theme'
import { PickleballRefreshIndicator } from './PickleballRefreshIndicator'

/** Нативный индикатор ещё кадры рисуется после снятия refresh — маску держим чуть дольше. */
const MASK_HIDE_DELAY_MS = 320

/**
 * После того как родитель ставит refreshing=false: мяч уходит в opacity 0,
 * затем снимаем refresh у натива (тот же интервал, без доп. задержки).
 */
const BALL_FADE_OUT_MS = 400

/** Порог оверскролла (iOS; на Android часто 0 — см. нативные прозрачные цвета). */
const PULL_REVEAL_PX = 8

export type PickleRefreshScrollViewProps = ScrollViewProps & {
  refreshing: boolean
  onRefresh: () => void
  /**
   * Цвет подложки в зоне overscroll (как фон экрана). По умолчанию palette.background —
   * на серых экранах видна «белая полоса» в просвете, если не передать свой цвет.
   */
  refreshMaskColor?: string
}

/** Высота зоны refresh; подложка под ScrollView в просвет при оверскролле. */
const REFRESH_ZONE_H = 80

/** Доп. отступ контента сверху, пока идёт refresh — лента ниже, не «маячит» под мячом. */
const REFRESH_CONTENT_SHIFT_PX = 40
/** Полностью прозрачный нативный спиннер, чтобы не пробивался под кастомным мячом. */
const NATIVE_SPINNER_INVISIBLE = 'rgba(0,0,0,0.01)'

/** ScrollView + pull-to-refresh: нативный индикатор скрыт, показывается анимированный мяч пиклбола. */
export const PickleRefreshScrollView = forwardRef<ScrollView, PickleRefreshScrollViewProps>(
  function PickleRefreshScrollView(
    {
      refreshing,
      onRefresh,
      children,
      onScroll: onScrollProp,
      scrollEventThrottle,
      style: scrollStyleProp,
      contentContainerStyle: contentContainerStyleProp,
      refreshMaskColor,
      ...rest
    },
    ref,
  ) {
    /** Совпадает с RefreshControl: отпускаем позже родителя, после fade мяча. */
    const [nativeRefreshing, setNativeRefreshing] = useState(refreshing)
    const [postNativeMask, setPostNativeMask] = useState(false)
    const ballLayerOpacity = useRef(new Animated.Value(1)).current

    /** Пока тянут вниз до срабатывания onRefresh — иначе виден нативный прогресс. */
    const [pullRevealed, setPullRevealed] = useState(false)
    const prevPullRevealed = useRef(false)

    useEffect(() => {
      if (refreshing) {
        setNativeRefreshing(true)
        ballLayerOpacity.setValue(1)
        return
      }
      if (!nativeRefreshing) return
      const t = setTimeout(() => setNativeRefreshing(false), BALL_FADE_OUT_MS)
      Animated.timing(ballLayerOpacity, {
        toValue: 0,
        duration: BALL_FADE_OUT_MS,
        useNativeDriver: true,
      }).start()
      return () => clearTimeout(t)
    }, [refreshing, nativeRefreshing, ballLayerOpacity])

    useEffect(() => {
      if (nativeRefreshing) {
        setPostNativeMask(true)
        return
      }
      const t = setTimeout(() => setPostNativeMask(false), MASK_HIDE_DELAY_MS)
      return () => clearTimeout(t)
    }, [nativeRefreshing])

    const windingDown = !refreshing && nativeRefreshing

    /**
     * Opacity снова 1 только при новом pull (false → true), иначе после fade pullRevealed
     * ещё true — срабатывал сброс и мяч мигал на секунду.
     */
    useEffect(() => {
      if (windingDown) {
        prevPullRevealed.current = pullRevealed
        return
      }
      if (refreshing) {
        ballLayerOpacity.setValue(1)
        prevPullRevealed.current = pullRevealed
        return
      }
      const edgePull = pullRevealed && !prevPullRevealed.current
      prevPullRevealed.current = pullRevealed
      if (edgePull) {
        ballLayerOpacity.setValue(1)
      }
    }, [pullRevealed, refreshing, windingDown, ballLayerOpacity])

    const baseContentPaddingTop = useMemo(() => {
      const f = StyleSheet.flatten(contentContainerStyleProp) as { paddingTop?: number } | undefined
      return typeof f?.paddingTop === 'number' ? f.paddingTop : 0
    }, [contentContainerStyleProp])

    const handleScroll = useCallback(
      (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        onScrollProp?.(e)
        const y = e.nativeEvent.contentOffset.y
        if (y < -PULL_REVEAL_PX) {
          setPullRevealed(true)
        } else if (y > -2) {
          setPullRevealed(false)
        }
      },
      [onScrollProp],
    )

    const showOverlay = nativeRefreshing || pullRevealed || postNativeMask
    const maskBg = refreshMaskColor ?? palette.background
    const nativeSpinnerColor = NATIVE_SPINNER_INVISIBLE

    return (
      <View style={styles.host}>
        {/* Подложка под ScrollView — в просвет при оверскролле; не перекрывает ленту. Без белого круга поверх спиннера (наезжал на контент и бил в глаз на сером фоне). */}
        {showOverlay ? (
          <View style={[styles.maskUnderScroll, { backgroundColor: maskBg }]} pointerEvents="none" collapsable={false} />
        ) : null}
        <ScrollView
          ref={ref}
          {...rest}
          style={[scrollStyleProp, styles.scrollAboveMask]}
          contentContainerStyle={[
            contentContainerStyleProp,
            nativeRefreshing && {
              paddingTop: baseContentPaddingTop + REFRESH_CONTENT_SHIFT_PX,
            },
          ]}
          scrollEventThrottle={scrollEventThrottle ?? 16}
          onScroll={handleScroll}
          refreshControl={
            <RefreshControl
              refreshing={nativeRefreshing}
              onRefresh={onRefresh}
              {...Platform.select({
                ios: {
                  tintColor: nativeSpinnerColor,
                  title: '',
                  titleColor: nativeSpinnerColor,
                },
                android: {
                  colors: [nativeSpinnerColor],
                  progressBackgroundColor: nativeSpinnerColor,
                },
              })}
            />
          }
        >
          {children}
        </ScrollView>
        {/* Мяч — прозрачный слой поверх */}
        {showOverlay ? (
          <Animated.View
            style={[styles.ballLayer, { opacity: ballLayerOpacity }]}
            pointerEvents="none"
            collapsable={false}
            {...Platform.select({
              ios: { needsOffscreenAlphaCompositing: true },
            })}
          >
            <PickleballRefreshIndicator
              active={nativeRefreshing || pullRevealed}
              windingDown={windingDown}
            />
          </Animated.View>
        ) : null}
      </View>
    )
  },
)

const styles = StyleSheet.create({
  host: {
    flex: 1,
    position: 'relative',
  },
  maskUnderScroll: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: REFRESH_ZONE_H,
    zIndex: 0,
  },
  scrollAboveMask: {
    flex: 1,
    zIndex: 1,
    backgroundColor: 'transparent',
  },
  ballLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: REFRESH_ZONE_H,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 8,
    zIndex: 3,
    backgroundColor: 'transparent',
    ...Platform.select({
      android: { elevation: 6 },
    }),
  },
})
