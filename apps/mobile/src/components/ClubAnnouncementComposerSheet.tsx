import * as ImagePicker from 'expo-image-picker'
import { Feather } from '@expo/vector-icons'
import { useCallback, useMemo } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'

import { radius, spacing, type ThemePalette } from '../lib/theme'
import { useAppTheme } from '../providers/ThemeProvider'

import { AppBottomSheet } from './AppBottomSheet'
import { InputField } from './ui'

export type ClubAnnouncementDraft = {
  title: string
  body: string
  image: {
    uri: string
    width?: number | null
    height?: number | null
    fileName?: string | null
    mimeType?: string | null
    remoteUrl?: string | null
  } | null
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
  const handlePickPhoto = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) return
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.82,
      allowsEditing: false,
    })
    if (picked.canceled || !picked.assets?.length) return
    const asset = picked.assets[0]
    if (!asset?.uri) return
    onChangeDraft((current) => ({
      ...current,
      image: {
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        remoteUrl: null,
      },
    }))
  }, [onChangeDraft])

  const handleOpenCamera = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) return
    const captured = await ImagePicker.launchCameraAsync({
      cameraType: ImagePicker.CameraType.back,
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: false,
    })
    if (captured.canceled || !captured.assets?.length) return
    const asset = captured.assets[0]
    if (!asset?.uri) return
    onChangeDraft((current) => ({
      ...current,
      image: {
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        remoteUrl: null,
      },
    }))
  }, [onChangeDraft])

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
      <View style={styles.photoActions}>
        <Pressable onPress={() => void handlePickPhoto()} style={({ pressed }) => [styles.photoButton, pressed && styles.buttonPressed]}>
          <Feather name="image" size={16} color={colors.primary} />
          <Text style={styles.photoButtonText}>{draft.image ? 'Replace photo' : 'Add photo'}</Text>
        </Pressable>
        <Pressable onPress={() => void handleOpenCamera()} style={({ pressed }) => [styles.photoButton, pressed && styles.buttonPressed]}>
          <Feather name="camera" size={16} color={colors.primary} />
          <Text style={styles.photoButtonText}>Camera</Text>
        </Pressable>
      </View>
      {draft.image ? (
        <View style={styles.imagePreviewWrap}>
          <Image source={{ uri: draft.image.uri }} style={styles.imagePreview} resizeMode="cover" />
          <Pressable
            onPress={() => onChangeDraft((current) => ({ ...current, image: null }))}
            style={({ pressed }) => [styles.removeImageButton, pressed && styles.buttonPressed]}
          >
            <Feather name="x" size={16} color={colors.white} />
          </Pressable>
        </View>
      ) : null}
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
    photoActions: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: spacing.sm,
    },
    photoButton: {
      flex: 1,
      minHeight: 42,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    photoButtonText: {
      color: colors.text,
      fontWeight: '600',
      fontSize: 14,
    },
    imagePreviewWrap: {
      position: 'relative',
      marginBottom: spacing.sm,
      borderRadius: radius.lg,
      overflow: 'hidden',
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
    },
    imagePreview: {
      width: '100%',
      aspectRatio: 1.3,
      backgroundColor: colors.surfaceMuted,
    },
    removeImageButton: {
      position: 'absolute',
      top: 10,
      right: 10,
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: 'rgba(0,0,0,0.68)',
      alignItems: 'center',
      justifyContent: 'center',
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
