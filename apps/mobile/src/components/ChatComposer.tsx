import { useEffect, useState } from 'react'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { Keyboard, Platform, Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { palette, radius } from '../lib/theme'

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
}: ChatComposerProps) => {
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
          placeholderTextColor={palette.textMuted}
          style={[styles.input, multiline && styles.inputMultiline]}
          multiline={multiline}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
        />
        <Pressable
          style={({ pressed }) => [styles.sendBtn, sendDisabled && styles.sendBtnDisabled, pressed && !sendDisabled && { opacity: 0.9 }]}
          disabled={sendDisabled}
          onPress={onSend}
        >
          <View style={styles.sendIconWrap}>
            <MaterialCommunityIcons name="send" size={24} color={palette.white} />
          </View>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
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
    backgroundColor: '#EEF0F2',
    color: palette.text,
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
    backgroundColor: palette.primary,
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
