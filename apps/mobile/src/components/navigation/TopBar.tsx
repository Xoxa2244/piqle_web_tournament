import { Feather } from '@expo/vector-icons'
import { router, usePathname } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { palette, spacing } from '../../lib/theme'
import { useAuth } from '../../providers/AuthProvider'

const getTitle = (pathname: string) => {
  if (pathname === '/') return 'Piqle'
  if (pathname.startsWith('/tournaments')) return 'Tournaments'
  if (pathname.startsWith('/clubs')) return 'Clubs'
  if (pathname.startsWith('/chats')) return pathname === '/chats/ai-assistant' ? 'AI Assistant' : 'Messages'
  if (pathname.startsWith('/ai')) return 'AI Assistant'
  if (pathname.startsWith('/profile')) return 'Profile'
  if (pathname.startsWith('/search')) return 'Search'
  if (pathname.startsWith('/notifications')) return 'Notifications'
  return 'Piqle'
}

const IconBubble = ({ icon, onPress, showDot }: { icon: keyof typeof Feather.glyphMap; onPress: () => void; showDot?: boolean }) => (
  <Pressable onPress={onPress} style={({ pressed }) => [styles.iconBubble, pressed && styles.iconBubblePressed]}>
    <Feather name={icon} size={18} color={palette.text} />
    {showDot ? <View style={styles.dot} /> : null}
  </Pressable>
)

export const TopBar = () => {
  const pathname = usePathname()
  const { user } = useAuth()
  const title = getTitle(pathname)
  const initials = (user?.name || user?.email || 'P')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')

  return (
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.actions}>
        <IconBubble icon="search" onPress={() => router.push('/search')} />
        <IconBubble icon="bell" onPress={() => router.push('/notifications')} showDot />
        <Pressable onPress={() => router.push('/profile')} style={({ pressed }) => [styles.avatar, pressed && styles.avatarPressed]}>
          <Text style={styles.avatarText}>{initials || 'P'}</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: palette.surfaceOverlay,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: palette.primary,
    letterSpacing: -0.4,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconBubble: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  iconBubblePressed: {
    backgroundColor: palette.surfaceMuted,
  },
  dot: {
    position: 'absolute',
    top: 9,
    right: 9,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.accent,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.primary,
    marginLeft: 4,
  },
  avatarPressed: {
    opacity: 0.85,
  },
  avatarText: {
    color: palette.white,
    fontSize: 12,
    fontWeight: '700',
  },
})
