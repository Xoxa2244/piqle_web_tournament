import { Feather } from '@expo/vector-icons'
import { Pressable, StyleSheet, View } from 'react-native'

import { radius, spacing } from '../lib/theme'
import { useAppTheme } from '../providers/ThemeProvider'

export function ChatScrollToBottomButton({
  visible,
  onPress,
}: {
  visible: boolean
  onPress: () => void
}) {
  const { colors } = useAppTheme()

  if (!visible) return null

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            shadowColor: colors.shadowStrong,
          },
          pressed && styles.buttonPressed,
        ]}
      >
        <Feather name="chevron-down" size={20} color={colors.text} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 16,
    bottom: 88,
    zIndex: 20,
  },
  button: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  buttonPressed: {
    transform: [{ scale: 0.96 }],
    opacity: 0.92,
  },
})
