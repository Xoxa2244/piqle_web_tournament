import { StyleSheet, Text, View } from 'react-native'
import { colors } from '../theme/colors'

type BadgeTone = 'neutral' | 'success' | 'warning' | 'info'

const toneMap: Record<BadgeTone, { bg: string; text: string }> = {
  neutral: { bg: '#EFE9DE', text: '#4D534B' },
  success: { bg: colors.accentSoft, text: colors.accent },
  warning: { bg: colors.warningSoft, text: colors.warning },
  info: { bg: colors.infoSoft, text: colors.info },
}

interface BadgeProps {
  label: string
  tone?: BadgeTone
}

export function Badge({ label, tone = 'neutral' }: BadgeProps) {
  return (
    <View style={[styles.badge, { backgroundColor: toneMap[tone].bg }]}>
      <Text style={[styles.text, { color: toneMap[tone].text }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.25,
    textTransform: 'uppercase',
  },
})
