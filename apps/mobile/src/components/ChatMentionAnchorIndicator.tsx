import { Pressable, StyleSheet, Text, View } from 'react-native'

import { radius, type ThemePalette } from '../lib/theme'
import { useAppTheme } from '../providers/ThemeProvider'

type Props = {
  count: number
  onPress: () => void
}

export function ChatMentionAnchorIndicator({ count, onPress }: Props) {
  const { colors, theme } = useAppTheme()
  const styles = createStyles(colors, theme)

  if (count <= 0) return null

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{count > 1 ? count : '@'}</Text>
      </View>
      <Text style={styles.label} numberOfLines={1}>
        {count > 1 ? `${count} mentions` : 'Mentioned you'}
      </Text>
    </Pressable>
  )
}

const createStyles = (colors: ThemePalette, theme: 'light' | 'dark') =>
  StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      alignSelf: 'flex-start',
      borderRadius: radius.pill,
      paddingHorizontal: 12,
      paddingVertical: 9,
      backgroundColor: theme === 'dark' ? 'rgba(117, 230, 109, 0.12)' : 'rgba(117, 230, 109, 0.16)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme === 'dark' ? 'rgba(117, 230, 109, 0.24)' : 'rgba(117, 230, 109, 0.28)',
    },
    pressed: {
      opacity: 0.82,
    },
    badge: {
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      paddingHorizontal: 6,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    badgeText: {
      color: colors.white,
      fontSize: 12,
      fontWeight: '700',
    },
    label: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '600',
    },
  })
