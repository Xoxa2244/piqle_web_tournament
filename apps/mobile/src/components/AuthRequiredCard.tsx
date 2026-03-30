import { Feather } from '@expo/vector-icons'
import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'

import { spacing } from '../lib/theme'
import { useAppTheme } from '../providers/ThemeProvider'
import { ActionButton, SurfaceCard } from './ui'

type AuthRequiredCardProps = {
  title?: string
  body: string
  buttonLabel?: string
  onPress?: () => void
}

export const AuthRequiredCard = ({
  title = 'You are browsing as a guest',
  body,
  buttonLabel = 'Sign in',
  onPress,
}: AuthRequiredCardProps) => {
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])

  return (
    <SurfaceCard style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.iconWrap, { backgroundColor: colors.brandPrimaryTint }]}>
        <Feather name="user" size={22} color={colors.primary} />
      </View>
      <View style={styles.textBlock}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>{body}</Text>
      </View>
      <ActionButton label={buttonLabel} onPress={onPress ?? (() => router.push('/sign-in'))} />
    </SurfaceCard>
  )
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    card: {
      gap: spacing.md,
      shadowColor: colors.shadow,
    },
    iconWrap: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    textBlock: {
      gap: 6,
    },
    title: {
      fontSize: 24,
      fontWeight: '700',
      letterSpacing: -0.5,
    },
    body: {
      lineHeight: 21,
    },
  })
