import { Feather } from '@expo/vector-icons'
import React, { type PropsWithChildren, type ReactNode } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { palette, radius, spacing } from '../lib/theme'
import { OptionalLinearGradient } from './OptionalLinearGradient'

type ScreenProps = PropsWithChildren<{
  scroll?: boolean
  right?: ReactNode
  title?: string
  subtitle?: string
  contentStyle?: StyleProp<ViewStyle>
}>

export const Screen = ({ children, scroll = true, right, title, subtitle, contentStyle }: ScreenProps) => {
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
        <ScrollView
          contentContainerStyle={[styles.content, contentStyle]}
          showsVerticalScrollIndicator={false}
        >
          {content}
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.flexContent, contentStyle]}>{content}</View>
      )}
    </SafeAreaView>
  )
}

type CardTone = 'default' | 'soft' | 'hero'

export const SurfaceCard = ({
  children,
  padded = true,
  tone = 'default',
  style,
}: PropsWithChildren<{ padded?: boolean; tone?: CardTone; style?: StyleProp<ViewStyle> }>) => {
  const toneStyle =
    tone === 'soft'
      ? styles.cardSoft
      : tone === 'hero'
      ? styles.cardHero
      : styles.cardDefault

  const safeChildren = React.Children.toArray(children).filter(React.isValidElement)
  return (
    <View style={[styles.card, toneStyle, padded && styles.cardPadded, style]}>
      {tone === 'hero' ? (
        <OptionalLinearGradient
          pointerEvents="none"
          colors={['rgba(40, 205, 65, 0.14)', 'rgba(82, 224, 104, 0.10)', 'rgba(255, 255, 255, 0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.cardHeroGradient}
        />
      ) : null}
      {safeChildren}
    </View>
  )
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
        {subtitle != null && subtitle !== '' ? (
          <Text style={styles.sectionSubtitle}>{String(subtitle)}</Text>
        ) : null}
      </View>
      {React.isValidElement(action) ? action : null}
    </View>
  )
}

export const Pill = ({
  label,
  tone = 'muted',
}: {
  label: string
  tone?: 'muted' | 'primary' | 'danger' | 'success' | 'warning'
}) => {
  const toneStyles =
    tone === 'primary'
      ? { backgroundColor: palette.chip, color: palette.chipText, borderColor: 'transparent' }
      : tone === 'danger'
      ? { backgroundColor: palette.dangerSoft, color: palette.danger, borderColor: 'transparent' }
      : tone === 'success'
      ? { backgroundColor: palette.successSoft, color: palette.success, borderColor: 'transparent' }
      : tone === 'warning'
      ? { backgroundColor: palette.warningSoft, color: '#9a7b00', borderColor: 'transparent' }
      : { backgroundColor: palette.surfaceMuted, color: palette.text, borderColor: palette.border }

  return (
    <View style={[styles.pill, { backgroundColor: toneStyles.backgroundColor, borderColor: toneStyles.borderColor }]}>
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
  icon,
}: {
  label: string
  onPress?: () => void
  disabled?: boolean
  loading?: boolean
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  icon?: ReactNode
}) => {
  const pressedColor =
    variant === 'secondary'
      ? palette.secondaryPressed
      : variant === 'danger'
      ? '#eb0067'
      : variant === 'ghost'
      ? 'rgba(40, 205, 65, 0.08)'
      : palette.primaryPressed
  const baseStyle =
    variant === 'secondary'
      ? { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border }
      : variant === 'danger'
      ? { backgroundColor: palette.danger }
      : variant === 'ghost'
      ? { backgroundColor: 'transparent', borderWidth: 0, borderColor: 'transparent' }
      : { backgroundColor: palette.primary }
  const textColor = variant === 'secondary' || variant === 'ghost' ? palette.text : palette.white

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
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <View style={styles.buttonContent}>
          {icon}
          <Text style={[styles.buttonLabel, { color: textColor }]}>{label}</Text>
        </View>
      )}
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
  left,
  right,
  containerStyle,
  autoCapitalize = 'sentences',
  autoCorrect = false,
  keyboardType,
  returnKeyType,
  onSubmitEditing,
}: {
  value: string
  onChangeText: (value: string) => void
  placeholder?: string
  secureTextEntry?: boolean
  multiline?: boolean
  editable?: boolean
  left?: ReactNode
  right?: ReactNode
  containerStyle?: StyleProp<ViewStyle>
  autoCapitalize?: TextInputProps['autoCapitalize']
  autoCorrect?: boolean
  keyboardType?: TextInputProps['keyboardType']
  returnKeyType?: TextInputProps['returnKeyType']
  onSubmitEditing?: TextInputProps['onSubmitEditing']
}) => {
  return (
    <View style={[styles.inputShell, multiline && styles.inputShellMultiline, !editable && styles.inputDisabled, containerStyle]}>
      {left ? <View style={styles.inputAdornment}>{left}</View> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.textMuted}
        secureTextEntry={secureTextEntry}
        multiline={multiline}
        editable={editable}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        keyboardType={keyboardType}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        style={[styles.input, multiline && styles.inputMultiline]}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
      {right ? <View style={styles.inputAdornment}>{right}</View> : null}
    </View>
  )
}

export const SearchField = ({
  value,
  onChangeText,
  placeholder = 'Search',
  containerStyle,
}: {
  value: string
  onChangeText: (value: string) => void
  placeholder?: string
  containerStyle?: StyleProp<ViewStyle>
}) => {
  return (
    <InputField
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      autoCapitalize="none"
      containerStyle={containerStyle}
      left={<Feather name="search" size={18} color={palette.textMuted} />}
    />
  )
}

export const IconButton = ({
  icon,
  onPress,
}: {
  icon: ReactNode
  onPress?: () => void
}) => {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}>
      {icon}
    </Pressable>
  )
}

export const EmptyState = ({ title, body }: { title: string; body: string }) => {
  return (
    <SurfaceCard tone="soft">
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </SurfaceCard>
  )
}

export const LoadingBlock = ({ label = 'Loading…' }: { label?: string }) => {
  return (
    <SurfaceCard tone="soft">
      <View style={styles.loadingRow}>
        <ActivityIndicator color={palette.primary} />
        <Text style={styles.loadingLabel}>{label}</Text>
      </View>
    </SurfaceCard>
  )
}

export const AvatarBadge = ({ label, size = 48 }: { label: string; size?: number }) => {
  const initials = label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')

  const hashString = (value: string) => {
    let hash = 0
    for (let i = 0; i < value.length; i++) {
      hash = (hash * 31 + value.charCodeAt(i)) | 0
    }
    return Math.abs(hash)
  }

  const hash = hashString(String(label ?? ''))
  // Vary hue within green spectrum (mint → grass → lime), but keep it "Piqle-green" adjacent.
  const hue = 118 + (hash % 38) // 118..155
  const sat = 62 + (Math.floor(hash / 37) % 18) // 62..79
  const light = 40 + (Math.floor(hash / 997) % 14) // 40..53
  const inner = `hsl(${hue} ${sat}% ${light}%)`
  const outer = `hsla(${hue} ${sat}% ${Math.min(92, light + 35)}% / 0.40)`

  return (
    <View
      style={[
        styles.avatarBadge,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: outer },
      ]}
    >
      <View style={[styles.avatarBadgeInner, { borderRadius: size / 2, backgroundColor: inner }]}>
        <Text style={[styles.avatarBadgeText, { fontSize: Math.max(14, size * 0.3) }]}>{initials || 'P'}</Text>
      </View>
    </View>
  )
}

export const MetricTile = ({
  label,
  value,
  subtitle,
}: {
  label: string
  value: string
  subtitle?: string
}) => {
  return (
    <SurfaceCard tone="soft" style={styles.metricTile}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
      {subtitle ? <Text style={styles.metricSubtitle}>{subtitle}</Text> : null}
    </SurfaceCard>
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  flexContent: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: 31,
    fontWeight: '700',
    color: palette.text,
    letterSpacing: -0.9,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: palette.textMuted,
    lineHeight: 20,
  },
  card: {
    position: 'relative',
    borderRadius: radius.lg,
    borderWidth: 1,
    shadowColor: palette.black,
    shadowOpacity: 1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
  },
  cardDefault: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    shadowColor: palette.shadow,
  },
  cardSoft: {
    backgroundColor: palette.surfaceElevated,
    borderColor: 'rgba(0, 0, 0, 0.04)',
    shadowColor: 'transparent',
    elevation: 0,
  },
  cardHero: {
    backgroundColor: palette.surface,
    borderColor: palette.brandPrimaryBorder,
    shadowColor: 'transparent',
    elevation: 0,
  },
  cardHeroGradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.lg,
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
    fontSize: 19,
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
    borderWidth: 1,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  button: {
    minHeight: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  buttonLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  inputShell: {
    minHeight: 52,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.04)',
    backgroundColor: palette.surfaceElevated,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  inputShellMultiline: {
    alignItems: 'flex-start',
    paddingVertical: 14,
    minHeight: 100,
  },
  inputAdornment: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 20,
  },
  input: {
    flex: 1,
    minHeight: 20,
    color: palette.text,
    fontSize: 15,
  },
  inputMultiline: {
    minHeight: 92,
  },
  inputDisabled: {
    opacity: 0.6,
  },
  emptyTitle: {
    fontSize: 18,
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
    gap: 12,
  },
  loadingLabel: {
    color: palette.textMuted,
    fontSize: 15,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceOverlay,
    borderWidth: 1,
    borderColor: palette.border,
  },
  iconButtonPressed: {
    opacity: 0.85,
  },
  avatarBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
    shadowColor: palette.shadowStrong,
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  avatarBadgeInner: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBadgeText: {
    color: palette.white,
    fontWeight: '700',
  },
  metricTile: {
    flex: 1,
    minHeight: 108,
    justifyContent: 'center',
  },
  metricValue: {
    color: palette.text,
    fontSize: 24,
    fontWeight: '700',
  },
  metricLabel: {
    marginTop: 6,
    color: palette.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  metricSubtitle: {
    marginTop: 6,
    color: palette.chipText,
    fontSize: 12,
    fontWeight: '600',
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



