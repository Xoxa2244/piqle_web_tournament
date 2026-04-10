import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { radius, spacing, type ThemePalette } from '../lib/theme'
import { useAppTheme } from '../providers/ThemeProvider'

import { AppBottomSheet } from './AppBottomSheet'
import { InputField } from './ui'

export type ClubAnnouncementDraft = {
  title: string
  body: string
}

type Props = {
  open: boolean
  mode: 'create' | 'edit'
  draft: ClubAnnouncementDraft
  onChangeDraft: (updater: (current: ClubAnnouncementDraft) => ClubAnnouncementDraft) => void
  onClose: () => void
  onSubmit: () => void
  submitLoading?: boolean
  submitDisabled?: boolean
}

export function ClubAnnouncementComposerSheet({
  open,
  mode,
  draft,
  onChangeDraft,
  onClose,
  onSubmit,
  submitLoading = false,
  submitDisabled = false,
}: Props) {
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])

  return (
    <AppBottomSheet
      open={open}
      onClose={onClose}
      title={mode === 'edit' ? 'Edit announcement' : 'Post announcement'}
      maxHeight="78%"
    >
      <Text style={styles.label}>{mode === 'edit' ? 'Update your post' : 'Share something with the club'}</Text>
      <InputField
        value={draft.title}
        onChangeText={(value) => onChangeDraft((current) => ({ ...current, title: value }))}
        placeholder="Title (optional)"
        containerStyle={styles.field}
      />
      <InputField
        value={draft.body}
        onChangeText={(value) => onChangeDraft((current) => ({ ...current, body: value }))}
        placeholder="Message *"
        multiline
        containerStyle={styles.field}
      />
      <View style={styles.actions}>
        <Pressable
          onPress={onClose}
          style={({ pressed }) => [styles.button, styles.buttonSecondary, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonSecondaryText}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={onSubmit}
          disabled={submitDisabled}
          style={({ pressed }) => [
            styles.button,
            submitDisabled && styles.buttonDisabled,
            pressed && !submitDisabled && styles.buttonPressed,
          ]}
        >
          <Text style={styles.buttonText}>
            {mode === 'edit' ? (submitLoading ? 'Saving…' : 'Save') : (submitLoading ? 'Posting…' : 'Post')}
          </Text>
        </Pressable>
      </View>
    </AppBottomSheet>
  )
}

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
    label: {
      color: colors.text,
      fontWeight: '700',
      fontSize: 15,
      marginBottom: spacing.sm,
    },
    field: {
      marginBottom: spacing.sm,
    },
    actions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: spacing.sm,
    },
    button: {
      flex: 1,
      backgroundColor: colors.primary,
      paddingVertical: 12,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonSecondary: {
      backgroundColor: colors.surfaceMuted,
    },
    buttonPressed: {
      opacity: 0.9,
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    buttonText: {
      color: colors.white,
      fontWeight: '700',
      fontSize: 15,
    },
    buttonSecondaryText: {
      color: colors.text,
      fontWeight: '600',
      fontSize: 15,
    },
  })
