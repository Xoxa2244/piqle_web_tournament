import { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, View } from 'react-native'
import Svg, { Defs, Ellipse, RadialGradient, Stop, Circle } from 'react-native-svg'

import { useAppTheme } from '../providers/ThemeProvider'

const BOX = 40
const VB = 40
const JUMP_MAX = 24

const SHADOW_W = 44
const SHADOW_H = 16

/** Упрощённый вид сверху: жёлто-зелёный шар с «дырками» как у пиклбольного мяча */
function PickleballSvg() {
  const { colors } = useAppTheme()
  const holes = [
    { cx: 20, cy: 11 },
    { cx: 28, cy: 15 },
    { cx: 28, cy: 25 },
    { cx: 20, cy: 29 },
    { cx: 12, cy: 25 },
    { cx: 12, cy: 15 },
    { cx: 20, cy: 20 },
  ]
  const holeFill = colors.background
  return (
    <Svg width={BOX} height={BOX} viewBox={`0 0 ${VB} ${VB}`} accessible={false}>
      <Circle cx={20} cy={20} r={17.5} fill="#D4E84A" stroke="#9BB82E" strokeWidth={1.2} />
      {holes.map((h, i) => (
        <Circle key={i} cx={h.cx} cy={h.cy} r={3.1} fill={holeFill} opacity={0.98} />
      ))}
      <Circle cx={20} cy={20} r={17.5} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth={0.5} />
    </Svg>
  )
}

/** Мягкое пятно: радиальный градиент (без жёсткой кромки). В тёмной теме — чуть светлее, иначе на фоне не читается. */
function SoftShadowSvg({ isDark }: { isDark: boolean }) {
  const id = isDark ? 'pbGroundShadowDark' : 'pbGroundShadowLight'
  const cx = SHADOW_W / 2
  const cy = SHADOW_H / 2
  const rx = SHADOW_W / 2 - 0.5
  const ry = SHADOW_H / 2 - 0.5
  return (
    <Svg width={SHADOW_W} height={SHADOW_H} viewBox={`0 0 ${SHADOW_W} ${SHADOW_H}`} accessible={false}>
      <Defs>
        <RadialGradient
          id={id}
          gradientUnits="userSpaceOnUse"
          cx={cx}
          cy={cy}
          rx={rx}
          ry={ry}
          fx={cx}
          fy={cy}
        >
          <Stop
            offset="0"
            stopColor={isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.24)'}
            stopOpacity={1}
          />
          <Stop
            offset={isDark ? '0.4' : '0.42'}
            stopColor={isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)'}
            stopOpacity={1}
          />
          <Stop offset="1" stopColor={isDark ? 'rgba(255,255,255,0)' : 'rgba(0,0,0,0)'} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#${id})`} />
    </Svg>
  )
}

type Props = {
  active: boolean
  /** Родитель уже снял refreshing, нативный refresh ещё держим — прыжки остановить, остаётся fade слоя. */
  windingDown?: boolean
}

function bounceOnce(
  y: Animated.Value,
  peakPx: number,
  durationUp: number,
  durationDown: number,
) {
  return Animated.sequence([
    Animated.timing(y, {
      toValue: -peakPx,
      duration: durationUp,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }),
    Animated.timing(y, {
      toValue: 0,
      duration: durationDown,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }),
  ])
}

/**
 * Три прыжка: первый выше, дальше энергия падает. Тень на «полу» — размытая (градиент),
 * сжимается и бледнеет, когда мяч выше (translateY < 0).
 */
export function PickleballRefreshIndicator({ active, windingDown = false }: Props) {
  const { theme } = useAppTheme()
  const isDark = theme === 'dark'
  const translateY = useRef(new Animated.Value(0)).current

  const shadowScaleX = translateY.interpolate({
    inputRange: [-JUMP_MAX, 0],
    outputRange: [0.38, 1],
    extrapolate: 'clamp',
  })
  const shadowScaleY = translateY.interpolate({
    inputRange: [-JUMP_MAX, 0],
    outputRange: [0.32, 1],
    extrapolate: 'clamp',
  })
  const shadowOpacity = translateY.interpolate({
    inputRange: [-JUMP_MAX, 0],
    outputRange: isDark ? [0.2, 0.72] : [0.12, 0.5],
    extrapolate: 'clamp',
  })

  useEffect(() => {
    if (!active) {
      translateY.setValue(0)
      return
    }
    if (windingDown) {
      translateY.setValue(0)
      return
    }

    const cycle = Animated.sequence([
      bounceOnce(translateY, 24, 185, 255),
      bounceOnce(translateY, 8, 115, 175),
      bounceOnce(translateY, 3, 82, 128),
      Animated.delay(230),
    ])

    const loop = Animated.loop(cycle)
    loop.start()
    return () => {
      loop.stop()
      translateY.setValue(0)
    }
  }, [active, windingDown, translateY])

  if (!active) return null

  return (
    <View style={styles.wrap} accessibilityRole="progressbar" accessibilityLabel="Refreshing">
      <View style={styles.scene}>
        {/* Сначала тень (ниже по z-index), сверху мяч */}
        <View style={styles.shadowSlot}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.shadowAnimated,
              {
                opacity: shadowOpacity,
                transform: [{ scaleX: shadowScaleX }, { scaleY: shadowScaleY }],
              },
            ]}
          >
            <SoftShadowSvg isDark={isDark} />
          </Animated.View>
        </View>
        <View style={styles.jumpArea}>
          <Animated.View style={[styles.ballStage, { transform: [{ translateY }] }]}>
            <View style={styles.ballBox}>
              <PickleballSvg />
            </View>
          </Animated.View>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  scene: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: BOX + 8,
  },
  shadowSlot: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: SHADOW_H + 4,
    zIndex: 0,
  },
  shadowAnimated: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  jumpArea: {
    width: BOX + 4,
    height: BOX + JUMP_MAX,
    justifyContent: 'flex-end',
    alignItems: 'center',
    zIndex: 1,
  },
  ballStage: {
    width: BOX,
    height: BOX,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ballBox: {
    width: BOX,
    height: BOX,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
})
