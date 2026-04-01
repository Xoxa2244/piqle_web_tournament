import { Feather } from '@expo/vector-icons'
import { Pressable, StyleSheet, type Insets, type StyleProp, type ViewStyle } from 'react-native'

import { useAppTheme } from '../../providers/ThemeProvider'

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
  const { colors } = useAppTheme()

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
          backgroundColor: colors.surfaceOverlay,
          borderColor: colors.border,
        },
        pressed && {
          backgroundColor: colors.surfaceMuted,
          borderColor: colors.brandPrimaryBorder,
          transform: [{ scale: 0.94 }],
        },
        style,
      ]}
    >
      <Feather name="arrow-left" size={iconSize} color={colors.text} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
})
