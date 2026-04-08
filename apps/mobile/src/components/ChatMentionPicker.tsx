import { Pressable, StyleSheet, Text, View } from 'react-native'

import type { MentionCandidate } from '../lib/chatMentions'
import { radius, type ThemePalette } from '../lib/theme'
import { useAppTheme } from '../providers/ThemeProvider'
import { RemoteUserAvatar } from './RemoteUserAvatar'

type Props = {
  candidates: MentionCandidate[]
  onSelect: (candidate: MentionCandidate) => void
}

export function ChatMentionPicker({ candidates, onSelect }: Props) {
  const { colors } = useAppTheme()
  const styles = createStyles(colors)

  if (!candidates.length) return null

  return (
    <View style={styles.card}>
      {candidates.map((candidate) => (
        <Pressable
          key={candidate.id}
          onPress={() => onSelect(candidate)}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        >
          <RemoteUserAvatar
            uri={candidate.image}
            size={28}
            fallback="initials"
            initialsLabel={candidate.name}
          />
          <View style={styles.body}>
            <Text style={styles.name} numberOfLines={1}>
              {candidate.name}
            </Text>
            <Text style={styles.handle} numberOfLines={1}>
              @{candidate.handle}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  )
}

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
    card: {
      borderRadius: radius.xl,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    rowPressed: {
      opacity: 0.82,
      backgroundColor: colors.surfaceMuted,
    },
    body: {
      flex: 1,
      minWidth: 0,
    },
    name: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '600',
    },
    handle: {
      color: colors.textMuted,
      fontSize: 12,
      marginTop: 2,
    },
  })
