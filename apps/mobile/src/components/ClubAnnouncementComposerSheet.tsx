import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import { Feather } from '@expo/vector-icons'
import { useCallback, useMemo, useState } from 'react'
import { Image, Keyboard, Pressable, StyleSheet, Text, View } from 'react-native'

import {
  formatFileSize,
  getLocationStaticMapUrl,
  type ChatLocationMessagePayload,
} from '../lib/chatSpecialMessages'
import { radius, spacing, type ThemePalette } from '../lib/theme'
import { useAppTheme } from '../providers/ThemeProvider'

import { AppBottomSheet, AppConfirmActions } from './AppBottomSheet'
import { LocationPickerSheet } from './LocationPickerSheet'
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
  location: ChatLocationMessagePayload | null
  file: {
    uri?: string | null
    remoteUrl?: string | null
    fileName: string
    mimeType?: string | null
    size?: number | null
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
  const [locationPickerOpen, setLocationPickerOpen] = useState(false)

  const handlePickPhoto = useCallback(async () => {
    Keyboard.dismiss()
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
    Keyboard.dismiss()
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

  const handlePickFile = useCallback(async () => {
    Keyboard.dismiss()
    const picked = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: '*/*',
    })
    if (picked.canceled || !picked.assets?.length) return
    const asset = picked.assets[0]
    if (!asset?.uri) return
    onChangeDraft((current) => ({
      ...current,
      file: {
        uri: asset.uri,
        remoteUrl: null,
        fileName: asset.name || 'File',
        mimeType: asset.mimeType,
        size: asset.size ?? null,
      },
    }))
  }, [onChangeDraft])

  return (
    <>
      <AppBottomSheet
        open={open}
        onClose={onClose}
        title={mode === 'edit' ? 'Edit announcement' : 'Post announcement'}
        maxHeight="84%"
        bottomPaddingExtra={8}
        footer={
          <AppConfirmActions
            intent="positive"
            cancelLabel="Cancel"
            confirmLabel={mode === 'edit' ? (submitLoading ? 'Saving…' : 'Save') : submitLoading ? 'Posting…' : 'Post'}
            onCancel={onClose}
            onConfirm={() => {
              if (submitDisabled || submitLoading) return
              onSubmit()
            }}
            confirmLoading={submitLoading}
          />
        }
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
        <View style={styles.actionRow}>
          <Pressable onPress={() => void handlePickPhoto()} style={({ pressed }) => [styles.actionButton, pressed && styles.buttonPressed]}>
            <Feather name="image" size={16} color={colors.primary} />
            <Text style={styles.actionButtonText}>{draft.image ? 'Replace photo' : 'Add photo'}</Text>
          </Pressable>
          <Pressable onPress={() => void handleOpenCamera()} style={({ pressed }) => [styles.actionButton, pressed && styles.buttonPressed]}>
            <Feather name="camera" size={16} color={colors.primary} />
            <Text style={styles.actionButtonText}>Camera</Text>
          </Pressable>
        </View>
        <View style={styles.actionRow}>
          <Pressable
            onPress={() => {
              Keyboard.dismiss()
              setLocationPickerOpen(true)
            }}
            style={({ pressed }) => [styles.actionButton, pressed && styles.buttonPressed]}
          >
            <Feather name="map-pin" size={16} color={colors.primary} />
            <Text style={styles.actionButtonText}>{draft.location ? 'Change location' : 'Add location'}</Text>
          </Pressable>
          <Pressable onPress={() => void handlePickFile()} style={({ pressed }) => [styles.actionButton, pressed && styles.buttonPressed]}>
            <Feather name="file-text" size={16} color={colors.primary} />
            <Text style={styles.actionButtonText}>{draft.file ? 'Replace file' : 'Add file'}</Text>
          </Pressable>
        </View>

        {draft.image ? (
          <View style={styles.imagePreviewWrap}>
            <Image source={{ uri: draft.image.uri }} style={styles.imagePreview} resizeMode="cover" />
            <Pressable
              onPress={() => onChangeDraft((current) => ({ ...current, image: null }))}
              style={({ pressed }) => [styles.removeOverlayButton, pressed && styles.buttonPressed]}
            >
              <Feather name="x" size={16} color={colors.white} />
            </Pressable>
          </View>
        ) : null}

        {draft.location ? (
          <View style={styles.locationPreviewWrap}>
            <Image source={{ uri: getLocationStaticMapUrl(draft.location) }} style={styles.locationPreviewMap} resizeMode="cover" />
            <View style={styles.locationPreviewBody}>
              <Text style={styles.locationPreviewTitle} numberOfLines={1}>
                {draft.location.title}
              </Text>
              <Text style={styles.locationPreviewAddress} numberOfLines={2}>
                {draft.location.address || `${draft.location.latitude.toFixed(5)}, ${draft.location.longitude.toFixed(5)}`}
              </Text>
            </View>
            <Pressable
              onPress={() => onChangeDraft((current) => ({ ...current, location: null }))}
              style={({ pressed }) => [styles.removeOverlayButton, pressed && styles.buttonPressed]}
            >
              <Feather name="x" size={16} color={colors.white} />
            </Pressable>
          </View>
        ) : null}

        {draft.file ? (
          <View style={styles.filePreviewWrap}>
            <View style={styles.filePreviewLeft}>
              <View style={styles.fileIconWrap}>
                <Feather name="file-text" size={18} color={colors.primary} />
              </View>
              <View style={styles.fileMeta}>
                <Text style={styles.fileName} numberOfLines={1}>
                  {draft.file.fileName}
                </Text>
                <Text style={styles.fileSize} numberOfLines={1}>
                  {[draft.file.mimeType, formatFileSize(draft.file.size)].filter(Boolean).join(' · ') || 'File'}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={() => onChangeDraft((current) => ({ ...current, file: null }))}
              style={({ pressed }) => [styles.fileRemoveButton, pressed && styles.buttonPressed]}
            >
              <Feather name="x" size={16} color={colors.textMuted} />
            </Pressable>
          </View>
        ) : null}
      </AppBottomSheet>

      <LocationPickerSheet
        open={locationPickerOpen}
        onClose={() => setLocationPickerOpen(false)}
        onShare={(payload) => {
          onChangeDraft((current) => ({ ...current, location: payload }))
          setLocationPickerOpen(false)
        }}
      />
    </>
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
    actionRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: spacing.sm,
    },
    actionButton: {
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
      paddingHorizontal: 10,
    },
    actionButtonText: {
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
    locationPreviewWrap: {
      position: 'relative',
      marginBottom: spacing.sm,
      borderRadius: radius.lg,
      overflow: 'hidden',
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
    },
    locationPreviewMap: {
      width: '100%',
      height: 120,
      backgroundColor: colors.surfaceMuted,
    },
    locationPreviewBody: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 4,
    },
    locationPreviewTitle: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '700',
      paddingRight: 40,
    },
    locationPreviewAddress: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
      paddingRight: 40,
    },
    filePreviewWrap: {
      marginBottom: spacing.sm,
      minHeight: 72,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    filePreviewLeft: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    fileIconWrap: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: colors.primaryGhost,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fileMeta: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    fileName: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '700',
    },
    fileSize: {
      color: colors.textMuted,
      fontSize: 12,
    },
    fileRemoveButton: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    removeOverlayButton: {
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
    buttonPressed: {
      opacity: 0.9,
    },
  })
