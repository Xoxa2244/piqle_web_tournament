import { Feather } from '@expo/vector-icons'
import React, { useEffect, useMemo, useRef, useState, type PropsWithChildren, type ReactNode } from 'react'
import {
  ActivityIndicator,
  Animated,
  Easing,
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

import { radius, spacing, type ThemePalette } from '../lib/theme'
import { useAppTheme } from '../providers/ThemeProvider'
import { CHAT_AMBIENT_FALLBACK, ChatAmbientBackground } from './chatAmbient'
import { OptionalLinearGradient } from './OptionalLinearGradient'

type ScreenProps = PropsWithChildren<{
  scroll?: boolean
  left?: ReactNode
  right?: ReactNode
  title?: string
  subtitle?: string
  contentStyle?: StyleProp<ViewStyle>
  /** Полноэкранный едва заметный градиент (чаты): под заголовком, областью сообщений и полем ввода */
  chatAmbient?: boolean
}>

const useThemedUi = () => {
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])

  return { colors, styles }
}

export const Screen = ({
  children,
  scroll = true,
  left,
  right,
  title,
  subtitle,
  contentStyle,
  chatAmbient = false,
}: ScreenProps) => {
  const { styles } = useThemedUi()
  const content = (
    <>
      {title ? (
        <View style={styles.header}>
          {left ? <View style={styles.headerSide}>{left}</View> : null}
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {right ? <View style={styles.headerSide}>{right}</View> : null}
        </View>
      ) : null}
      {children}
    </>
  )

  const body =
    scroll ? (
      <ScrollView
        contentContainerStyle={[styles.content, contentStyle]}
        showsVerticalScrollIndicator={false}
      >
        {content}
      </ScrollView>
    ) : (
      <View
        style={[
          chatAmbient ? styles.chatScreenBody : styles.content,
          styles.flexContent,
          contentStyle,
        ]}
      >
        {content}
      </View>
    )

  if (!chatAmbient) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {body}
      </SafeAreaView>
    )
  }

  return (
    <View style={styles.chatAmbientRoot}>
      <ChatAmbientBackground />
      {/* bottom убран: иначе с KAV на iOS суммируется «домашняя» зона и клавиатура — инпут уезжает вверх */}
      <SafeAreaView style={styles.safeAreaChatAmbientFill} edges={['top']}>
        <View style={styles.chatAmbientForeground}>{body}</View>
      </SafeAreaView>
    </View>
  )
}

type CardTone = 'default' | 'soft' | 'hero'

export const SurfaceCard = ({
  children,
  padded = true,
  tone = 'default',
  style,
}: PropsWithChildren<{ padded?: boolean; tone?: CardTone; style?: StyleProp<ViewStyle> }>) => {
  const { colors, styles } = useThemedUi()
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
          colors={[colors.brandPrimaryTint, colors.brandPurpleTint, 'rgba(255, 255, 255, 0)']}
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
  actionLabel,
  onActionPress,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  actionLabel?: string
  onActionPress?: () => void
}) => {
  const { colors, styles } = useThemedUi()
  return (
    <View style={styles.sectionRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle != null && subtitle !== '' ? (
          <Text style={styles.sectionSubtitle}>{String(subtitle)}</Text>
        ) : null}
      </View>
      {React.isValidElement(action) ? (
        action
      ) : actionLabel && onActionPress ? (
        <Pressable
          onPress={onActionPress}
          hitSlop={8}
          style={({ pressed }) => [styles.sectionActionPressable, pressed && styles.sectionActionPressablePressed]}
        >
          <Text style={[styles.sectionActionText, { color: colors.primary }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
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
  const { colors, styles } = useThemedUi()
  const toneStyles =
    tone === 'primary'
      ? { backgroundColor: colors.chip, color: colors.chipText, borderColor: 'transparent' }
      : tone === 'danger'
      ? { backgroundColor: colors.dangerSoft, color: colors.danger, borderColor: 'transparent' }
      : tone === 'success'
      ? { backgroundColor: colors.successSoft, color: colors.success, borderColor: 'transparent' }
      : tone === 'warning'
      ? { backgroundColor: colors.warningSoft, color: colors.warning, borderColor: 'transparent' }
      : { backgroundColor: colors.surfaceMuted, color: colors.text, borderColor: colors.border }

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
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline' | 'neutral'
  icon?: ReactNode
}) => {
  const { colors, styles } = useThemedUi()
  const pressedColor =
    variant === 'secondary'
      ? colors.secondaryPressed
      : variant === 'outline'
      ? colors.secondaryPressed
      : variant === 'neutral'
      ? '#9ca3af'
      : variant === 'danger'
      ? '#eb0067'
      : variant === 'ghost'
      ? colors.brandPrimaryTint
      : colors.primaryPressed
  const baseStyle =
    variant === 'secondary'
      ? { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }
      : variant === 'outline'
      ? { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }
      : variant === 'neutral'
      ? { backgroundColor: '#cbd5e1', borderWidth: 0, borderColor: 'transparent' }
      : variant === 'danger'
      ? { backgroundColor: colors.danger }
      : variant === 'ghost'
      ? { backgroundColor: 'transparent', borderWidth: 0, borderColor: 'transparent' }
      : { backgroundColor: colors.primary }
  const textColor =
    variant === 'secondary' || variant === 'ghost' || variant === 'outline'
      ? colors.text
      : variant === 'neutral'
      ? '#1f2937'
      : colors.white

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
  appearance = 'field',
  onFocus: onFocusProp,
  onBlur: onBlurProp,
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
  /** `search` — строка поиска (SearchField): подсветка при фокусе как у остальных поисков */
  appearance?: 'field' | 'search'
  onFocus?: TextInputProps['onFocus']
  onBlur?: TextInputProps['onBlur']
}) => {
  const { colors, styles } = useThemedUi()
  const [focused, setFocused] = useState(false)
  const focusShellStyle =
    focused && appearance === 'search'
      ? styles.searchFieldShellFocused
      : focused && appearance === 'field'
        ? styles.inputShellFocused
        : null

  return (
    <View
      style={[
        styles.inputShell,
        multiline && styles.inputShellMultiline,
        !editable && styles.inputDisabled,
        containerStyle,
        focusShellStyle,
      ]}
    >
      {left ? <View style={styles.inputAdornment}>{left}</View> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
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
        onFocus={(e) => {
          setFocused(true)
          onFocusProp?.(e)
        }}
        onBlur={(e) => {
          setFocused(false)
          onBlurProp?.(e)
        }}
      />
      {right ? <View style={styles.inputAdornment}>{right}</View> : null}
    </View>
  )
}

/**
 * Строка поиска для вкладок и экрана Search: единый вид (как на Events) — 44pt, без обводки, иконка слева.
 */
export const SearchField = ({
  value,
  onChangeText,
  placeholder = 'Search',
  containerStyle,
  right,
  returnKeyType = 'search',
  onSubmitEditing,
}: {
  value: string
  onChangeText: (value: string) => void
  placeholder?: string
  containerStyle?: StyleProp<ViewStyle>
  right?: ReactNode
  returnKeyType?: TextInputProps['returnKeyType']
  onSubmitEditing?: TextInputProps['onSubmitEditing']
}) => {
  const { colors, styles } = useThemedUi()
  return (
    <InputField
      appearance="search"
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      autoCapitalize="none"
      containerStyle={[styles.searchFieldShell, containerStyle]}
      left={<Feather name="search" size={18} color={colors.textMuted} />}
      right={right}
      returnKeyType={returnKeyType}
      onSubmitEditing={onSubmitEditing}
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
  const { styles } = useThemedUi()
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}>
      {icon}
    </Pressable>
  )
}

export const EmptyState = ({ title, body }: { title: string; body: string }) => {
  const { styles } = useThemedUi()
  const hasTitle = Boolean(title?.trim())
  return (
    <SurfaceCard tone="soft">
      {hasTitle ? <Text style={styles.emptyTitle}>{title}</Text> : null}
      <Text style={[styles.emptyBody, !hasTitle && styles.emptyBodyLead]}>{body}</Text>
    </SurfaceCard>
  )
}

export const LoadingBlock = ({ label = 'Loading…' }: { label?: string }) => {
  const { styles } = useThemedUi()
  const a = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(a, {
        toValue: 1,
        duration: 900,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    )
    loop.start()
    return () => loop.stop()
  }, [a])

  const dot1 = a.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] })
  const dot2 = a.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.25, 1, 0.25] })
  const dot3 = a.interpolate({ inputRange: [0, 1], outputRange: [1, 0.25] })

  return (
    <SurfaceCard tone="soft">
      <View style={styles.loadingRow}>
        <View style={styles.loadingDots} accessibilityRole="progressbar" accessibilityLabel={label}>
          <Animated.View style={[styles.loadingDot, { opacity: dot1 }]} />
          <Animated.View style={[styles.loadingDot, { opacity: dot2 }]} />
          <Animated.View style={[styles.loadingDot, { opacity: dot3 }]} />
        </View>
        <Text style={styles.loadingLabel}>{label}</Text>
      </View>
    </SurfaceCard>
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
  const { styles } = useThemedUi()
  return (
    <SurfaceCard tone="soft" style={styles.metricTile}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
      {subtitle ? <Text style={styles.metricSubtitle}>{subtitle}</Text> : null}
    </SurfaceCard>
  )
}

export const DataRow = ({ label, value }: { label: string; value: string }) => {
  const { styles } = useThemedUi()
  return (
    <View style={styles.dataRow}>
      <Text style={styles.dataLabel}>{label}</Text>
      <Text style={styles.dataValue}>{value}</Text>
    </View>
  )
}

const createStyles = (colors: ThemePalette) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  chatAmbientRoot: {
    flex: 1,
    backgroundColor: CHAT_AMBIENT_FALLBACK,
  },
  safeAreaChatAmbientFill: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  chatAmbientForeground: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  /** Экран чата (scroll=false): ровно 16px от левого/правого края экрана */
  chatScreenBody: {
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 0,
    gap: 0,
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
  headerSide: {
    paddingTop: 4,
  },
  title: {
    fontSize: 31,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.9,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
  },
  card: {
    position: 'relative',
    borderRadius: radius.lg,
    borderWidth: 1,
    shadowColor: colors.black,
    shadowOpacity: 1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
  },
  cardDefault: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    shadowColor: colors.shadow,
  },
  cardSoft: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    shadowColor: 'transparent',
    elevation: 0,
  },
  cardHero: {
    backgroundColor: colors.surface,
    borderColor: colors.brandPrimaryBorder,
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
    color: colors.text,
  },
  sectionSubtitle: {
    marginTop: 4,
    color: colors.textMuted,
    fontSize: 13,
  },
  sectionActionPressable: {
    alignSelf: 'flex-start',
  },
  sectionActionPressablePressed: {
    opacity: 0.8,
  },
  sectionActionText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
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
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
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
    color: colors.text,
    fontSize: 15,
  },
  inputMultiline: {
    minHeight: 92,
  },
  inputDisabled: {
    opacity: 0.6,
  },
  inputShellFocused: {
    borderColor: colors.brandPrimaryBorder,
    backgroundColor: colors.surfaceElevated,
  },
  /** Базовый вид SearchField (вкладка Events): переопределяет inputShell */
  searchFieldShell: {
    minHeight: 44,
    borderWidth: 0,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 14,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  /** Фокус: зелёная обводка, фон без тинта */
  searchFieldShellFocused: {
    borderWidth: 1,
    borderColor: colors.brandPrimaryBorder,
    backgroundColor: colors.surfaceElevated,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  emptyBody: {
    marginTop: 8,
    color: colors.textMuted,
    lineHeight: 20,
  },
  emptyBodyLead: {
    marginTop: 0,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  loadingDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  loadingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  loadingLabel: {
    color: colors.textMuted,
    fontSize: 15,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceOverlay,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconButtonPressed: {
    opacity: 0.85,
  },
  metricTile: {
    flex: 1,
    minHeight: 108,
    justifyContent: 'center',
  },
  metricValue: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
  },
  metricLabel: {
    marginTop: 6,
    color: colors.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  metricSubtitle: {
    marginTop: 6,
    color: colors.chipText,
    fontSize: 12,
    fontWeight: '600',
  },
  dataRow: {
    gap: 4,
  },
  dataLabel: {
    color: colors.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  dataValue: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
})

export { SegmentedControl } from './SegmentedControl'
export type { SegmentedOption } from './SegmentedControl'
export { SegmentedContentFade } from './SegmentedContentFade'


