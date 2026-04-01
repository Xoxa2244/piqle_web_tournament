import { useEffect, useMemo, useState } from 'react'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { Keyboard, Platform, Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { keyboardAppearanceForTheme, radius, type ThemePalette } from '../lib/theme'
import { useAppTheme } from '../providers/ThemeProvider'

export type ChatComposerProps = {
  value: string
  onChangeText: (text: string) => void
  placeholder: string
  onSend: () => void
  sendDisabled?: boolean
  paddingBottom?: number
  /** Например 16 на вкладке AI, где родитель без chatScreenBody */
  paddingHorizontal?: number
  /** Только для полноэкранных стеков без tab bar: нижний safe area (home indicator). На вкладке AI не включать — таб-бар уже даёт отступ. */
  safeAreaBottom?: boolean
  /** На Android можно вычесть уже занятое снизу пространство, например высоту tab bar. */
  androidKeyboardInset?: number
  multiline?: boolean
  returnKeyType?: TextInputProps['returnKeyType']
  onSubmitEditing?: TextInputProps['onSubmitEditing']
  onFocus?: TextInputProps['onFocus']
  onBlur?: TextInputProps['onBlur']
}

export const ChatComposer = ({
  value,
  onChangeText,
  placeholder,
  onSend,
  sendDisabled = false,
  paddingBottom = 16,
  paddingHorizontal = 0,
  safeAreaBottom = false,
  androidKeyboardInset = 0,
  multiline = false,
  returnKeyType,
  onSubmitEditing,
  onFocus,
  onBlur,
}: ChatComposerProps) => {
  const { colors, theme } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const insets = useSafeAreaInsets()
  const [androidKeyboardHeight, setAndroidKeyboardHeight] = useState(0)

  useEffect(() => {
    if (Platform.OS !== 'android') return
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      setAndroidKeyboardHeight(e.endCoordinates?.height ?? 0)
    })
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      setAndroidKeyboardHeight(0)
    })
    return () => {
      show.remove()
      hide.remove()
    }
  }, [])

  const androidBottomInset =
    Platform.OS === 'android'
      ? Math.max(androidKeyboardHeight - androidKeyboardInset, 0)
      : 0

  const bottom =
    paddingBottom +
    (safeAreaBottom && Platform.OS === 'ios' ? insets.bottom : 0) +
    androidBottomInset

  return (
    <View style={[styles.wrap, { paddingBottom: bottom, paddingHorizontal }]}>
      <View style={styles.row}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          keyboardAppearance={keyboardAppearanceForTheme(theme)}
          style={[styles.input, multiline && styles.inputMultiline]}
          multiline={multiline}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          onFocus={onFocus}
          onBlur={onBlur}
          {...Platform.select({
            android: {
              textAlignVertical: multiline ? 'top' : 'center',
              includeFontPadding: false,
            },
          })}
        />
        <Pressable
          style={({ pressed }) => [styles.sendBtn, sendDisabled && styles.sendBtnDisabled, pressed && !sendDisabled && { opacity: 0.9 }]}
          disabled={sendDisabled}
          onPress={onSend}
        >
          <View style={styles.sendIconWrap}>
            <MaterialCommunityIcons name="send" size={24} color={colors.white} />
          </View>
        </Pressable>
      </View>
    </View>
  )
}

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
  wrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: 'transparent',
    paddingTop: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  input: {
    flex: 1,
    height: 44,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 0,
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  inputMultiline: {
    height: undefined,
    minHeight: 44,
    maxHeight: 120,
    paddingTop: 12,
    paddingBottom: 12,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  /** Самолётик визуально «смотрит» вправо-вверх — лёгкий сдвиг для оптического центра в круге */
  sendIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 2,
    paddingBottom: 1,
  },
  sendBtnDisabled: {
    opacity: 0.55,
  },
})
