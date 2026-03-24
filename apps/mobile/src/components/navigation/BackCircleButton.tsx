import { Feather } from '@expo/vector-icons'
import { Pressable, StyleSheet, type Insets, type StyleProp, type ViewStyle } from 'react-native'

import { palette } from '../../lib/theme'

type Props = {
  onPress: () => void
  size?: number
  iconSize?: number
  hitSlop?: number | Insets
  style?: StyleProp<ViewStyle>
}

export function BackCircleButton({
  onPress,
  size = 36,
  iconSize = 18,
  hitSlop = 12,
  style,
}: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Go back"
      onPress={onPress}
      hitSlop={hitSlop}
      style={({ pressed }) => [
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
        styles.light,
        pressed && styles.lightPressed,
        style,
      ]}
    >
      <Feather name="arrow-left" size={iconSize} color={palette.text} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  light: {
    backgroundColor: palette.surfaceOverlay,
    borderColor: palette.border,
  },
  lightPressed: {
    backgroundColor: palette.surfaceMuted,
    borderColor: palette.brandPrimaryBorder,
    transform: [{ scale: 0.94 }],
  },
})
