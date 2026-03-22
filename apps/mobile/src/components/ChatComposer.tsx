import { Feather } from '@expo/vector-icons'
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native'

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
  multiline = false,
  returnKeyType,
  onSubmitEditing,
}: ChatComposerProps) => {
  return (
    <View style={[styles.wrap, { paddingBottom, paddingHorizontal }]}>
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
          <Feather name="send" size={18} color={palette.white} />
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
  sendBtnDisabled: {
    opacity: 0.55,
  },
})
