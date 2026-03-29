import { memo, useEffect, useRef } from 'react'
import { Animated, Easing } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'

type Props = {
  size?: number
  color?: string
}

/**
 * Кастомная «AI»-метка: центральная звезда + два сателлита (не Feather).
 */
export function AiAssistantIcon({ size = 24, color = '#FFFFFF' }: Props) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      accessible={false}
      importantForAccessibility="no"
    >
      <Path
        d="M12 3.5 L13.6 9.2 H19.5 L14.7 12.8 L16.3 18.5 L12 14.9 L7.7 18.5 L9.3 12.8 L4.5 9.2 H10.4 Z"
        fill={color}
      />
      <Circle cx="18.2" cy="5.8" r="1.75" fill={color} opacity={0.88} />
      <Circle cx="5.8" cy="5.8" r="1.75" fill={color} opacity={0.88} />
    </Svg>
  )
}

/**
 * Медленная непрерывная анимация только иконки (масштаб + лёгкое покачивание).
 */
export const AiAssistantIconAnimated = memo(function AiAssistantIconAnimated({
  size = 22,
  color = '#FFFFFF',
}: Props) {
  const scale = useRef(new Animated.Value(1)).current
  const wobble = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const scaleLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.07,
          duration: 2600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 2600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    )
    const wobbleLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(wobble, {
          toValue: 1,
          duration: 3200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(wobble, {
          toValue: 0,
          duration: 3200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    )
    scaleLoop.start()
    wobbleLoop.start()
    return () => {
      scaleLoop.stop()
      wobbleLoop.stop()
    }
  }, [scale, wobble])

  const rotate = wobble.interpolate({
    inputRange: [0, 1],
    outputRange: ['-7deg', '7deg'],
  })

  return (
    <Animated.View style={{ transform: [{ scale }, { rotate }] }}>
      <AiAssistantIcon size={size} color={color} />
    </Animated.View>
  )
})
