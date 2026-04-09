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
import { LocationMapSurface } from './LocationMapSurface'

type AttachmentTab = 'photos' | 'location' | 'files'

type RecentPhotoAsset = {
  id: string
  uri: string
  sourceUri: string
  width: number
  height: number
  fileName?: string | null
}

type PhotoGridItem =
  | { type: 'camera'; id: 'camera' }
  | ({ type: 'photo' } & RecentPhotoAsset)

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
  const [photoCursor, setPhotoCursor] = useState<string | null>(null)
  const [hasMorePhotos, setHasMorePhotos] = useState(true)
  const [loadingMorePhotos, setLoadingMorePhotos] = useState(false)
  const [locationPreviewCenter, setLocationPreviewCenter] = useState<{ latitude: number; longitude: number }>({
    latitude: 40.7128,
    longitude: -74.006,
  })

  const loadRecentPhotos = useCallback(async (after?: string | null, append = false) => {
    try {
      if (append) {
        setLoadingMorePhotos(true)
      } else {
        setLoadingPhotos(true)
      }
      const permission = await MediaLibrary.requestPermissionsAsync()
      const granted = permission.status === 'granted'
      setPhotoPermissionDenied(!granted)
      if (!granted) {
        setRecentPhotos([])
        setPhotoCursor(null)
        setHasMorePhotos(false)
        return
      }
      const result = await MediaLibrary.getAssetsAsync({
        mediaType: MediaLibrary.MediaType.photo,
        first: 24,
        sortBy: ['creationTime'],
        after: after || undefined,
      })
      const assets = await Promise.all(
        (result.assets ?? []).map(async (asset) => {
          try {
            const info = await MediaLibrary.getAssetInfoAsync(asset.id)
            const resolvedUri = info.localUri || asset.uri
            return {
              id: asset.id,
              uri: resolvedUri,
              sourceUri: resolvedUri,
              width: asset.width ?? 0,
              height: asset.height ?? 0,
              fileName: asset.filename ?? null,
            } satisfies RecentPhotoAsset
          } catch {
            return {
              id: asset.id,
              uri: asset.uri,
              sourceUri: asset.uri,
              width: asset.width ?? 0,
              height: asset.height ?? 0,
              fileName: asset.filename ?? null,
            } satisfies RecentPhotoAsset
          }
        })
      )
      setRecentPhotos((current) => (append ? [...current, ...assets] : assets))
      setPhotoCursor(result.endCursor ?? null)
      setHasMorePhotos(Boolean(result.hasNextPage))
    } catch {
      if (!append) {
        setRecentPhotos([])
        setPhotoCursor(null)
        setHasMorePhotos(false)
      }
    } finally {
      if (append) {
        setLoadingMorePhotos(false)
      } else {
        setLoadingPhotos(false)
      }
    }
  }, [])

  useEffect(() => {
    if (!sheetOpen || activeTab !== 'photos') return
    void loadRecentPhotos()
  }, [activeTab, loadRecentPhotos, sheetOpen])

  useEffect(() => {
    if (!sheetOpen || activeTab !== 'location') return
    void (async () => {
      try {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
        void permission
      } catch {
        // ignore
      }
    })()
  }, [activeTab, sheetOpen])

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

  const handleOpenCamera = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) {
      toast.error('Please allow camera access to take a photo.')
      return
    }
    const captured = await ImagePicker.launchCameraAsync({
      cameraType: ImagePicker.CameraType.back,
      mediaTypes: ['images'],
      quality: 0.92,
      allowsEditing: false,
    })
    if (captured.canceled || !captured.assets?.length) return
    const asset = captured.assets[0]
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

  const photoGridItems = useMemo<PhotoGridItem[]>(
    () => [{ type: 'camera', id: 'camera' }, ...recentPhotos.map((item) => ({ ...item, type: 'photo' as const }))],
    [recentPhotos]
  )

  const renderPhotoTile = useCallback(
    ({ item }: { item: PhotoGridItem }) => {
      if (item.type === 'camera') {
        return (
          <Pressable onPress={() => void handleOpenCamera()} style={({ pressed }) => [styles.cameraTile, pressed && styles.photoTilePressed]}>
            <View style={styles.cameraTileIconWrap}>
              <Feather name="camera" size={22} color={colors.primary} />
            </View>
            <Text style={styles.cameraTileText}>Camera</Text>
          </Pressable>
        )
      }
      return (
      <Pressable
        onPress={() =>
          void uploadPhoto({
            uri: item.sourceUri,
            fileName: item.fileName,
            mimeType: 'image/jpeg',
            width: item.width,
            height: item.height,
          })
        }
        style={({ pressed }) => [styles.photoTile, pressed && styles.photoTilePressed]}
      >
        <Image source={{ uri: item.uri }} style={styles.photoImage} resizeMode="cover" />
        {uploadingKey === item.sourceUri ? (
          <View style={styles.photoUploadingOverlay}>
            <ActivityIndicator color={colors.white} />
          </View>
        ) : null}
      </Pressable>
      )
    },
    [colors.primary, colors.white, handleOpenCamera, styles, uploadingKey, uploadPhoto]
  )

  const handleLoadMorePhotos = useCallback(() => {
    if (loadingMorePhotos || loadingPhotos || !hasMorePhotos || !photoCursor) return
    void loadRecentPhotos(photoCursor, true)
  }, [hasMorePhotos, loadRecentPhotos, loadingMorePhotos, loadingPhotos, photoCursor])

  const handleLocationPreviewMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data || '{}') as {
        type?: string
        payload?: { latitude?: number; longitude?: number }
      }
      if (data.type !== 'center' || !data.payload) return
      const latitude = Number(data.payload.latitude)
      const longitude = Number(data.payload.longitude)
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return
      setLocationPreviewCenter({ latitude, longitude })
    } catch {
      // ignore malformed web messages
    }
  }, [])

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
        bottomPaddingExtra={10}
        maxHeight="93%"
      >
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
              <View style={styles.photoListWrap}>
                <FlatList
                  data={photoGridItems}
                  keyExtractor={(item) => item.id}
                  numColumns={3}
                  columnWrapperStyle={styles.photoRow}
                  contentContainerStyle={styles.photoGrid}
                  renderItem={renderPhotoTile}
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                  onEndReachedThreshold={0.45}
                  onEndReached={handleLoadMorePhotos}
                  ListFooterComponent={
                    loadingMorePhotos ? (
                      <View style={styles.photoListFooter}>
                        <ActivityIndicator color={colors.primary} />
                      </View>
                    ) : null
                  }
                  ListEmptyComponent={
                    <View style={styles.infoCard}>
                      <Text style={styles.infoTitle}>No recent photos</Text>
                      <Text style={styles.infoText}>Use All photos to choose any image from your gallery.</Text>
                    </View>
                  }
                />
              </View>
            )}
          </View>
        ) : null}

        {activeTab === 'location' ? (
          <View style={styles.sectionBody}>
            <View style={styles.locationInlineMapWrap}>
              <LocationMapSurface
                latitude={locationPreviewCenter.latitude}
                longitude={locationPreviewCenter.longitude}
                dark={false}
                interactive
                centerPin
                onMessage={handleLocationPreviewMessage}
              />
            </View>
            <Pressable
              onPress={() => {
                setSheetOpen(false)
                setLocationPickerOpen(true)
              }}
              style={({ pressed }) => [styles.primaryCard, pressed && styles.primaryCardPressed]}
            >
              <Feather name="map-pin" size={18} color={colors.primary} />
              <Text style={styles.primaryCardText}>Open full map picker</Text>
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
    photoListFooter: {
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    photoListWrap: {
      height: 380,
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
    cameraTile: {
      flex: 1,
      aspectRatio: 1,
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: colors.primaryGhost,
      borderWidth: 1,
      borderColor: colors.primaryBorder,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    cameraTileIconWrap: {
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    cameraTileText: {
      color: colors.primary,
      fontSize: 13,
      fontWeight: '700',
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
      marginTop: spacing.sm,
      marginBottom: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    locationInlineMapWrap: {
      height: 360,
      borderRadius: 18,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
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
