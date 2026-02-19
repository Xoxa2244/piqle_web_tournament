import { Pressable, StyleSheet, Text } from 'react-native'
import { colors } from '../theme/colors'

interface PrimaryButtonProps {
  label: string
  onPress: () => void
  variant?: 'solid' | 'outline'
  disabled?: boolean
}

export function PrimaryButton({
  label,
  onPress,
  variant = 'solid',
  disabled = false,
}: PrimaryButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        variant === 'solid' ? styles.solid : styles.outline,
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}
    >
      <Text style={[styles.label, variant === 'solid' ? styles.solidLabel : styles.outlineLabel]}>
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  solid: {
    backgroundColor: colors.accent,
  },
  outline: {
    borderWidth: 1.5,
    borderColor: colors.accent,
    backgroundColor: '#FFFFFFA8',
  },
  solidLabel: {
    color: '#FFFFFF',
  },
  outlineLabel: {
    color: colors.accent,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  pressed: {
    opacity: 0.86,
  },
  disabled: {
    opacity: 0.45,
  },
})
