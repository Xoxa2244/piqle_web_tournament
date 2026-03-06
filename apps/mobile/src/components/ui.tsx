import type { PropsWithChildren, ReactNode } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { palette, radius, spacing } from '../lib/theme'

type ScreenProps = PropsWithChildren<{
  scroll?: boolean
  right?: ReactNode
  title?: string
  subtitle?: string
}>

export const Screen = ({ children, scroll = true, right, title, subtitle }: ScreenProps) => {
  const content = (
    <>
      {title ? (
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {right}
        </View>
      ) : null}
      {children}
    </>
  )

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.content}>{content}</ScrollView>
      ) : (
        <View style={styles.content}>{content}</View>
      )}
    </SafeAreaView>
  )
}

export const SurfaceCard = ({ children, padded = true }: PropsWithChildren<{ padded?: boolean }>) => {
  return <View style={[styles.card, padded && styles.cardPadded]}>{children}</View>
}

export const SectionTitle = ({
  title,
  action,
  subtitle,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) => {
  return (
    <View style={styles.sectionRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  )
}

export const Pill = ({
  label,
  tone = 'muted',
}: {
  label: string
  tone?: 'muted' | 'primary' | 'danger' | 'success'
}) => {
  const toneStyles =
    tone === 'primary'
      ? { backgroundColor: palette.chip, color: palette.chipText }
      : tone === 'danger'
      ? { backgroundColor: '#f7e0db', color: palette.danger }
      : tone === 'success'
      ? { backgroundColor: '#e1efe8', color: palette.success }
      : { backgroundColor: palette.surfaceMuted, color: palette.text }

  return (
    <View style={[styles.pill, { backgroundColor: toneStyles.backgroundColor }]}>
      <Text style={[styles.pillText, { color: toneStyles.color }]}>{label}</Text>
    </View>
  )
}

export const ActionButton = ({
  label,
  onPress,
  disabled,
  loading,
  variant = 'primary',
}: {
  label: string
  onPress?: () => void
  disabled?: boolean
  loading?: boolean
  variant?: 'primary' | 'secondary' | 'danger'
}) => {
  const pressedColor =
    variant === 'secondary'
      ? palette.secondaryPressed
      : variant === 'danger'
      ? '#933b30'
      : palette.primaryPressed
  const baseStyle =
    variant === 'secondary'
      ? { backgroundColor: palette.secondary, borderWidth: 1, borderColor: palette.border }
      : variant === 'danger'
      ? { backgroundColor: palette.danger }
      : { backgroundColor: palette.primary }
  const textColor = variant === 'secondary' ? palette.text : '#fffdf8'

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        baseStyle,
        (disabled || loading) && styles.buttonDisabled,
        pressed && !(disabled || loading) && { backgroundColor: pressedColor },
      ]}
    >
      {loading ? <ActivityIndicator color={textColor} /> : <Text style={[styles.buttonLabel, { color: textColor }]}>{label}</Text>}
    </Pressable>
  )
}

export const InputField = ({
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  multiline,
  editable = true,
}: {
  value: string
  onChangeText: (value: string) => void
  placeholder?: string
  secureTextEntry?: boolean
  multiline?: boolean
  editable?: boolean
}) => {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={palette.textMuted}
      secureTextEntry={secureTextEntry}
      multiline={multiline}
      editable={editable}
      style={[styles.input, multiline && styles.inputMultiline, !editable && styles.inputDisabled]}
      textAlignVertical={multiline ? 'top' : 'center'}
    />
  )
}

export const EmptyState = ({ title, body }: { title: string; body: string }) => {
  return (
    <SurfaceCard>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </SurfaceCard>
  )
}

export const LoadingBlock = ({ label = 'Loading…' }: { label?: string }) => {
  return (
    <SurfaceCard>
      <View style={styles.loadingRow}>
        <ActivityIndicator color={palette.primary} />
        <Text style={styles.loadingLabel}>{label}</Text>
      </View>
    </SurfaceCard>
  )
}

export const AvatarBadge = ({ label }: { label: string }) => {
  const initials = label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')

  return (
    <View style={styles.avatarBadge}>
      <Text style={styles.avatarBadgeText}>{initials || 'P'}</Text>
    </View>
  )
}

export const DataRow = ({ label, value }: { label: string; value: string }) => {
  return (
    <View style={styles.dataRow}>
      <Text style={styles.dataLabel}>{label}</Text>
      <Text style={styles.dataValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.background,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: palette.text,
    letterSpacing: -0.8,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: palette.textMuted,
    lineHeight: 20,
  },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    shadowColor: palette.shadow,
    shadowOpacity: 1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  cardPadded: {
    padding: spacing.md,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: palette.text,
  },
  sectionSubtitle: {
    marginTop: 4,
    color: palette.textMuted,
    fontSize: 13,
  },
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  input: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 14,
    color: palette.text,
    fontSize: 15,
  },
  inputMultiline: {
    minHeight: 110,
    paddingVertical: 14,
  },
  inputDisabled: {
    backgroundColor: palette.surfaceMuted,
    color: palette.textMuted,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: palette.text,
  },
  emptyBody: {
    marginTop: 8,
    color: palette.textMuted,
    lineHeight: 20,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  loadingLabel: {
    color: palette.textMuted,
    fontSize: 15,
  },
  avatarBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1,
    borderColor: palette.border,
  },
  avatarBadgeText: {
    color: palette.text,
    fontWeight: '700',
  },
  dataRow: {
    gap: 4,
  },
  dataLabel: {
    color: palette.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  dataValue: {
    color: palette.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
})



