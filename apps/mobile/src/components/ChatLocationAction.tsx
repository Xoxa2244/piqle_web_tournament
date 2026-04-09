import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import * as MediaLibrary from 'expo-media-library'
import { Feather } from '@expo/vector-icons'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native'

import { authApi } from '../lib/authApi'
import {
  buildFileMessageText,
  buildImageMessageText,
  buildLocationMessageText,
} from '../lib/chatSpecialMessages'
import { radius, spacing, type ThemePalette } from '../lib/theme'
import { useAuth } from '../providers/AuthProvider'
import { useAppTheme } from '../providers/ThemeProvider'
import { useToast } from '../providers/ToastProvider'
import { AppBottomSheet } from './AppBottomSheet'
import { LocationPickerSheet } from './LocationPickerSheet'

type AttachmentTab = 'photos' | 'location' | 'files'

type RecentPhotoAsset = {
  id: string
  uri: string
  width: number
  height: number
  fileName?: string | null
}

export function ChatLocationAction({
  disabled,
  onSendText,
}: {
  disabled?: boolean
  onSendText: (messageText: string) => void
}) {
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { token } = useAuth()
  const toast = useToast()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [locationPickerOpen, setLocationPickerOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<AttachmentTab>('photos')
  const [loadingPhotos, setLoadingPhotos] = useState(false)
  const [photoPermissionDenied, setPhotoPermissionDenied] = useState(false)
  const [recentPhotos, setRecentPhotos] = useState<RecentPhotoAsset[]>([])
  const [uploadingKey, setUploadingKey] = useState<string | null>(null)

  const loadRecentPhotos = useCallback(async () => {
    try {
      setLoadingPhotos(true)
      const permission = await MediaLibrary.requestPermissionsAsync()
      const granted = permission.status === 'granted'
      setPhotoPermissionDenied(!granted)
      if (!granted) {
        setRecentPhotos([])
        return
      }
      const result = await MediaLibrary.getAssetsAsync({
        mediaType: MediaLibrary.MediaType.photo,
        first: 18,
        sortBy: ['creationTime'],
      })
      setRecentPhotos(
        (result.assets ?? []).map((asset) => ({
          id: asset.id,
          uri: asset.uri,
          width: asset.width ?? 0,
          height: asset.height ?? 0,
          fileName: asset.filename ?? null,
        }))
      )
    } catch {
      setRecentPhotos([])
    } finally {
      setLoadingPhotos(false)
    }
  }, [])

  useEffect(() => {
    if (!sheetOpen || activeTab !== 'photos') return
    void loadRecentPhotos()
  }, [activeTab, loadRecentPhotos, sheetOpen])

  const uploadPhoto = useCallback(
    async (asset: { uri: string; fileName?: string | null; mimeType?: string | null; width?: number; height?: number }) => {
      if (!token) {
        toast.error('You need to sign in before sending attachments.')
        return
      }
      try {
        setUploadingKey(asset.uri)
        const upload = await authApi.uploadChatAttachment(token, {
          kind: 'image',
          uri: asset.uri,
          fileName: asset.fileName,
          mimeType: asset.mimeType || 'image/jpeg',
        })
        onSendText(
          buildImageMessageText({
            url: upload.url,
            fileName: upload.fileName,
            mimeType: upload.mimeType,
            size: upload.size,
            width: asset.width ?? null,
            height: asset.height ?? null,
          })
        )
        setSheetOpen(false)
      } catch (error: any) {
        toast.error(error?.message || 'Could not send photo.')
      } finally {
        setUploadingKey(null)
      }
    },
    [onSendText, toast, token]
  )

  const handlePickAnyPhoto = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      toast.error('Please allow photo access to send images.')
      return
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.92,
      allowsEditing: false,
    })
    if (picked.canceled || !picked.assets?.length) return
    const asset = picked.assets[0]
    if (!asset?.uri) return
    await uploadPhoto({
      uri: asset.uri,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
    })
  }, [toast, uploadPhoto])

  const handlePickFile = useCallback(async () => {
    if (!token) {
      toast.error('You need to sign in before sending files.')
      return
    }
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: '*/*',
      })
      if (picked.canceled || !picked.assets?.length) return
      const asset = picked.assets[0]
      if (!asset?.uri) return
      setUploadingKey(asset.uri)
      const upload = await authApi.uploadChatAttachment(token, {
        kind: 'file',
        uri: asset.uri,
        fileName: asset.name,
        mimeType: asset.mimeType,
      })
      onSendText(
        buildFileMessageText({
          url: upload.url,
          fileName: upload.fileName,
          mimeType: upload.mimeType,
          size: upload.size,
        })
      )
      setSheetOpen(false)
    } catch (error: any) {
      toast.error(error?.message || 'Could not send file.')
    } finally {
      setUploadingKey(null)
    }
  }, [onSendText, toast, token])

  const renderPhotoTile = useCallback(
    ({ item }: { item: RecentPhotoAsset }) => (
      <Pressable
        onPress={() =>
          void uploadPhoto({
            uri: item.uri,
            fileName: item.fileName,
            mimeType: 'image/jpeg',
            width: item.width,
            height: item.height,
          })
        }
        style={({ pressed }) => [styles.photoTile, pressed && styles.photoTilePressed]}
      >
        <Image source={{ uri: item.uri }} style={styles.photoImage} resizeMode="cover" />
        {uploadingKey === item.uri ? (
          <View style={styles.photoUploadingOverlay}>
            <ActivityIndicator color={colors.white} />
          </View>
        ) : null}
      </Pressable>
    ),
    [colors.white, styles, uploadingKey, uploadPhoto]
  )

  return (
    <>
      <Pressable
        disabled={disabled}
        onPress={() => {
          setActiveTab('photos')
          setSheetOpen(true)
        }}
        style={({ pressed }) => [
          styles.plusButton,
          disabled && styles.plusButtonDisabled,
          pressed && !disabled && styles.plusButtonPressed,
        ]}
      >
        <Feather name="paperclip" size={17} color={colors.text} />
      </Pressable>

      <AppBottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Attach"
        subtitle={
          activeTab === 'photos'
            ? 'Choose a recent photo or open your full gallery.'
            : activeTab === 'location'
            ? 'Share your current location or pick any place on the map.'
            : 'Send a document or another file from your device.'
        }
        bottomPaddingExtra={6}
      >
        {activeTab === 'photos' ? (
          <View style={styles.sectionBody}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Recent photos</Text>
              <Pressable
                onPress={() => void handlePickAnyPhoto()}
                style={({ pressed }) => [styles.inlineActionChip, pressed && styles.inlineActionChipPressed]}
              >
                <Text style={styles.inlineActionChipText}>All photos</Text>
              </Pressable>
            </View>
            {photoPermissionDenied ? (
              <View style={styles.infoCard}>
                <Text style={styles.infoTitle}>No photo access</Text>
                <Text style={styles.infoText}>
                  Allow access to show recent photos here, or use All photos to pick manually.
                </Text>
              </View>
            ) : loadingPhotos ? (
              <View style={styles.loadingBlock}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.loadingText}>Loading recent photos…</Text>
              </View>
            ) : (
              <FlatList
                data={recentPhotos}
                keyExtractor={(item) => item.id}
                numColumns={3}
                columnWrapperStyle={styles.photoRow}
                contentContainerStyle={styles.photoGrid}
                renderItem={renderPhotoTile}
                ListEmptyComponent={
                  <View style={styles.infoCard}>
                    <Text style={styles.infoTitle}>No recent photos</Text>
                    <Text style={styles.infoText}>Use All photos to choose any image from your gallery.</Text>
                  </View>
                }
              />
            )}
          </View>
        ) : null}

        {activeTab === 'location' ? (
          <View style={styles.sectionBody}>
            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>Share a place</Text>
              <Text style={styles.infoText}>
                Open the map picker, move the pin, and send your current location or any place you choose.
              </Text>
            </View>
            <Pressable
              onPress={() => {
                setSheetOpen(false)
                setLocationPickerOpen(true)
              }}
              style={({ pressed }) => [styles.primaryCard, pressed && styles.primaryCardPressed]}
            >
              <Feather name="map-pin" size={18} color={colors.primary} />
              <Text style={styles.primaryCardText}>Open map picker</Text>
            </Pressable>
          </View>
        ) : null}

        {activeTab === 'files' ? (
          <View style={styles.sectionBody}>
            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>Send a file</Text>
              <Text style={styles.infoText}>
                Choose a PDF, document, text file, or another file from your device.
              </Text>
            </View>
            <Pressable
              onPress={() => void handlePickFile()}
              style={({ pressed }) => [styles.primaryCard, pressed && styles.primaryCardPressed]}
            >
              {uploadingKey ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Feather name="file-text" size={18} color={colors.primary} />
              )}
              <Text style={styles.primaryCardText}>Choose file</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.tabBar}>
          <Pressable
            onPress={() => setActiveTab('photos')}
            style={({ pressed }) => [
              styles.tabChip,
              activeTab === 'photos' && styles.tabChipActive,
              pressed && styles.tabChipPressed,
            ]}
          >
            <Feather name="image" size={16} color={activeTab === 'photos' ? colors.primary : colors.textMuted} />
            <Text style={[styles.tabChipText, activeTab === 'photos' && styles.tabChipTextActive]}>Photos</Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab('location')}
            style={({ pressed }) => [
              styles.tabChip,
              activeTab === 'location' && styles.tabChipActive,
              pressed && styles.tabChipPressed,
            ]}
          >
            <Feather name="map-pin" size={16} color={activeTab === 'location' ? colors.primary : colors.textMuted} />
            <Text style={[styles.tabChipText, activeTab === 'location' && styles.tabChipTextActive]}>Location</Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab('files')}
            style={({ pressed }) => [
              styles.tabChip,
              activeTab === 'files' && styles.tabChipActive,
              pressed && styles.tabChipPressed,
            ]}
          >
            <Feather name="file-text" size={16} color={activeTab === 'files' ? colors.primary : colors.textMuted} />
            <Text style={[styles.tabChipText, activeTab === 'files' && styles.tabChipTextActive]}>Files</Text>
          </Pressable>
        </View>
      </AppBottomSheet>

      <LocationPickerSheet
        open={locationPickerOpen}
        onClose={() => setLocationPickerOpen(false)}
        onShare={(payload) => {
          onSendText(buildLocationMessageText(payload))
          setLocationPickerOpen(false)
        }}
      />
    </>
  )
}

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
    plusButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    plusButtonDisabled: {
      opacity: 0.52,
    },
    plusButtonPressed: {
      opacity: 0.9,
      transform: [{ scale: 0.97 }],
    },
    sectionBody: {
      minHeight: 250,
      gap: spacing.md,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '700',
    },
    inlineActionChip: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: colors.surfaceMuted,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    inlineActionChipPressed: {
      opacity: 0.84,
    },
    inlineActionChipText: {
      color: colors.text,
      fontSize: 12,
      fontWeight: '600',
    },
    photoGrid: {
      gap: 8,
      paddingBottom: 4,
    },
    photoRow: {
      gap: 8,
    },
    photoTile: {
      flex: 1,
      aspectRatio: 1,
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: colors.surfaceMuted,
    },
    photoTilePressed: {
      opacity: 0.88,
    },
    photoImage: {
      width: '100%',
      height: '100%',
    },
    photoUploadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.25)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    infoCard: {
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceMuted,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: 14,
      gap: 6,
    },
    infoTitle: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '700',
    },
    infoText: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
    },
    primaryCard: {
      minHeight: 54,
      borderRadius: radius.lg,
      backgroundColor: colors.primaryGhost,
      borderWidth: 1,
      borderColor: colors.primaryBorder,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    primaryCardPressed: {
      opacity: 0.84,
    },
    primaryCardText: {
      color: colors.primary,
      fontSize: 15,
      fontWeight: '700',
    },
    loadingBlock: {
      minHeight: 180,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    loadingText: {
      color: colors.textMuted,
      fontSize: 13,
      fontWeight: '500',
    },
    tabBar: {
      marginTop: spacing.md,
      marginBottom: spacing.xs,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    tabChip: {
      flex: 1,
      minHeight: 42,
      borderRadius: 999,
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: colors.surfaceMuted,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    tabChipActive: {
      backgroundColor: colors.primaryGhost,
      borderColor: colors.primaryBorder,
    },
    tabChipPressed: {
      opacity: 0.84,
    },
    tabChipText: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '600',
    },
    tabChipTextActive: {
      color: colors.primary,
    },
  })
