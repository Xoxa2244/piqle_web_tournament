import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import * as Location from 'expo-location'
import * as MediaLibrary from 'expo-media-library'
import { Feather } from '@expo/vector-icons'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native'

import { authApi } from '../lib/authApi'
import {
  buildFileMessageText,
  buildImageMessageText,
  buildLocationMessageText,
} from '../lib/chatSpecialMessages'
import { compressImageLikeChat } from '../lib/imageCompression'
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

const PHOTO_GRID_GAP = 8
const PHOTO_GRID_COLUMNS = 3
const PHOTO_TILE_WIDTH = '31%'

type PendingPhotoAsset = {
  uri: string
  fileName?: string | null
  mimeType?: string | null
  width?: number
  height?: number
}

const AttachmentPhotoTile = memo(function AttachmentPhotoTile({
  item,
  colors,
  styles,
  uploadingKey,
  onOpenCamera,
  onOpenPhoto,
}: {
  item: PhotoGridItem
  colors: ThemePalette
  styles: ReturnType<typeof createStyles>
  uploadingKey: string | null
  onOpenCamera: () => void
  onOpenPhoto: (item: RecentPhotoAsset) => void
}) {
  if (item.type === 'camera') {
    return (
      <Pressable onPress={onOpenCamera} style={({ pressed }) => [styles.cameraTile, pressed && styles.photoTilePressed]}>
        <View style={styles.cameraTileIconWrap}>
          <Feather name="camera" size={22} color={colors.primary} />
        </View>
        <Text style={styles.cameraTileText}>Camera</Text>
      </Pressable>
    )
  }

  return (
    <Pressable onPress={() => onOpenPhoto(item)} style={({ pressed }) => [styles.photoTile, pressed && styles.photoTilePressed]}>
      <Image source={{ uri: item.uri }} style={styles.photoImage} resizeMode="cover" />
      {uploadingKey === item.sourceUri ? (
        <View style={styles.photoUploadingOverlay}>
          <ActivityIndicator color={colors.white} />
        </View>
      ) : null}
    </Pressable>
  )
})

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
  const [pendingLocationPickerOpen, setPendingLocationPickerOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<AttachmentTab>('photos')
  const [loadingPhotos, setLoadingPhotos] = useState(false)
  const [photoPermissionDenied, setPhotoPermissionDenied] = useState(false)
  const [recentPhotos, setRecentPhotos] = useState<RecentPhotoAsset[]>([])
  const [uploadingKey, setUploadingKey] = useState<string | null>(null)
  const [sendingPendingPhoto, setSendingPendingPhoto] = useState(false)
  const [pendingPhoto, setPendingPhoto] = useState<PendingPhotoAsset | null>(null)
  const [photoCursor, setPhotoCursor] = useState<string | null>(null)
  const [hasMorePhotos, setHasMorePhotos] = useState(true)
  const [loadingMorePhotos, setLoadingMorePhotos] = useState(false)
  const [locationMapOrigin, setLocationMapOrigin] = useState<{ latitude: number; longitude: number }>({
    latitude: 40.7128,
    longitude: -74.006,
  })
  const [locationPreviewCenter, setLocationPreviewCenter] = useState<{ latitude: number; longitude: number }>({
    latitude: 40.7128,
    longitude: -74.006,
  })
  const [locationPreviewTitle, setLocationPreviewTitle] = useState('Pinned location')
  const [locationPreviewAddress, setLocationPreviewAddress] = useState<string | null>(null)
  const [resolvingLocationPreview, setResolvingLocationPreview] = useState(false)
  const [locationReady, setLocationReady] = useState(false)
  const locationSeededRef = useRef(false)

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
    setLocationReady(false)
    locationSeededRef.current = false
    void (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync()
        if (permission.status === Location.PermissionStatus.GRANTED) {
          const current = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          })
          const next = {
            latitude: current.coords.latitude,
            longitude: current.coords.longitude,
          }
          if (!locationSeededRef.current) {
            setLocationMapOrigin(next)
            setLocationPreviewCenter(next)
            locationSeededRef.current = true
          }
        }
      } catch {
        // ignore
      } finally {
        setLocationReady(true)
      }
    })()
  }, [activeTab, sheetOpen])

  useEffect(() => {
    if (!sheetOpen || activeTab !== 'location') return
    let cancelled = false
    const timeout = setTimeout(() => {
      setResolvingLocationPreview(true)
      void (async () => {
        try {
          const result = await Location.reverseGeocodeAsync(locationPreviewCenter)
          if (cancelled) return
          const first = result?.[0]
          const title =
            [first?.name, first?.street].filter(Boolean).join(', ') ||
            first?.district ||
            first?.city ||
            first?.region ||
            'Pinned location'
          const address =
            [first?.street, first?.city, first?.region, first?.postalCode, first?.country]
              .filter(Boolean)
              .join(', ') || null
          setLocationPreviewTitle(title)
          setLocationPreviewAddress(address)
        } catch {
          if (!cancelled) {
            setLocationPreviewTitle('Pinned location')
            setLocationPreviewAddress(
              `${locationPreviewCenter.latitude.toFixed(5)}, ${locationPreviewCenter.longitude.toFixed(5)}`
            )
          }
        } finally {
          if (!cancelled) setResolvingLocationPreview(false)
        }
      })()
    }, 220)

    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [activeTab, locationPreviewCenter, sheetOpen])

  const uploadPhoto = useCallback(
    async (asset: PendingPhotoAsset) => {
      if (!token) {
        toast.error('You need to sign in before sending attachments.')
        return
      }
      try {
        setUploadingKey(asset.uri)
        const preparedAsset = await compressImageLikeChat(asset)
        const upload = await authApi.uploadChatAttachment(token, {
          kind: 'image',
          uri: preparedAsset.uri,
          fileName: preparedAsset.fileName,
          mimeType: preparedAsset.mimeType || 'image/jpeg',
        })
        onSendText(
          buildImageMessageText({
            url: upload.url,
            fileName: upload.fileName,
            mimeType: upload.mimeType,
            size: upload.size,
            width: preparedAsset.width ?? null,
            height: preparedAsset.height ?? null,
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
      quality: 0.8,
      allowsEditing: false,
    })
    if (picked.canceled || !picked.assets?.length) return
    const asset = picked.assets[0]
    if (!asset?.uri) return
    setPendingPhoto({
      uri: asset.uri,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
    })
  }, [toast])

  const handleOpenCamera = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) {
      toast.error('Please allow camera access to take a photo.')
      return
    }
    const captured = await ImagePicker.launchCameraAsync({
      cameraType: ImagePicker.CameraType.back,
      mediaTypes: ['images'],
      quality: 0.78,
      allowsEditing: false,
    })
    if (captured.canceled || !captured.assets?.length) return
    const asset = captured.assets[0]
    if (!asset?.uri) return
    setPendingPhoto({
      uri: asset.uri,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
    })
  }, [toast])

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
    ({ item }: { item: PhotoGridItem }) => (
      <AttachmentPhotoTile
        item={item}
        colors={colors}
        styles={styles}
        uploadingKey={uploadingKey}
        onOpenCamera={() => void handleOpenCamera()}
        onOpenPhoto={(photo) =>
          setPendingPhoto({
            uri: photo.sourceUri,
            fileName: photo.fileName,
            mimeType: 'image/jpeg',
            width: photo.width,
            height: photo.height,
          })
        }
      />
    ),
    [colors, handleOpenCamera, styles, uploadingKey]
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
        onClose={() => {
          setSheetOpen(false)
          setPendingPhoto(null)
        }}
        onDismissed={() => {
          if (!pendingLocationPickerOpen) return
          setPendingLocationPickerOpen(false)
          setLocationPickerOpen(true)
        }}
        bottomPaddingExtra={10}
        maxHeight="93%"
      >
        {!pendingPhoto ? (
          <View style={styles.tabBar}>
          <Pressable
            onPress={() => setActiveTab('photos')}
            style={({ pressed }) => [
              styles.tabChip,
              activeTab === 'photos' && styles.tabChipActive,
              pressed && styles.tabChipPressed,
            ]}
          >
            <Feather name="image" size={16} color={activeTab === 'photos' ? colors.white : colors.textMuted} />
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
            <Feather name="map-pin" size={16} color={activeTab === 'location' ? colors.white : colors.textMuted} />
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
            <Feather name="file-text" size={16} color={activeTab === 'files' ? colors.white : colors.textMuted} />
            <Text style={[styles.tabChipText, activeTab === 'files' && styles.tabChipTextActive]}>Files</Text>
          </Pressable>
          </View>
        ) : null}

        {pendingPhoto ? (
          <View style={styles.pendingPhotoWrap}>
            <Image source={{ uri: pendingPhoto.uri }} style={styles.pendingPhotoImage} resizeMode="contain" />
            <View style={styles.pendingPhotoActions}>
              <Pressable
                disabled={sendingPendingPhoto}
                onPress={() => setPendingPhoto(null)}
                style={({ pressed }) => [
                  styles.pendingActionButton,
                  sendingPendingPhoto && styles.pendingActionButtonDisabled,
                  pressed && styles.pendingActionButtonPressed,
                ]}
              >
                <Text style={styles.pendingActionText}>Cancel</Text>
              </Pressable>
              <Pressable
                disabled={sendingPendingPhoto}
                onPress={() => {
                  const next = pendingPhoto
                  setSendingPendingPhoto(true)
                  void uploadPhoto(next).finally(() => {
                    setSendingPendingPhoto(false)
                    setPendingPhoto(null)
                  })
                }}
                style={({ pressed }) => [
                  styles.pendingActionButton,
                  styles.pendingActionButtonPrimary,
                  sendingPendingPhoto && styles.pendingActionButtonDisabled,
                  pressed && styles.pendingActionButtonPressed,
                ]}
              >
                {sendingPendingPhoto ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={[styles.pendingActionText, styles.pendingActionTextPrimary]}>Send</Text>
                )}
              </Pressable>
            </View>
          </View>
        ) : null}

        {!pendingPhoto && activeTab === 'photos' ? (
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
                  initialNumToRender={12}
                  maxToRenderPerBatch={12}
                  updateCellsBatchingPeriod={40}
                  windowSize={7}
                  removeClippedSubviews
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                  onEndReachedThreshold={0.45}
                  onEndReached={handleLoadMorePhotos}
                  getItemLayout={(_, index) => {
                    const row = Math.floor(index / PHOTO_GRID_COLUMNS)
                    const length = 110
                    const offset = row * (length + PHOTO_GRID_GAP)
                    return { index, length, offset }
                  }}
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

        {!pendingPhoto && activeTab === 'location' ? (
          <View style={styles.sectionBody}>
            <View style={styles.locationInlineMapWrap}>
              {locationReady ? (
                <LocationMapSurface
                  latitude={locationMapOrigin.latitude}
                  longitude={locationMapOrigin.longitude}
                  dark={false}
                  interactive
                  centerPin
                  onMessage={handleLocationPreviewMessage}
                />
              ) : (
                <View style={styles.locationLoadingBlock}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              )}
            </View>
            <View style={styles.locationInlineMeta}>
              <View style={styles.locationInlineMetaBody}>
                <View style={styles.locationInlineTitleSlot}>
                  <Text style={styles.locationInlineTitle} numberOfLines={1}>
                    {locationPreviewTitle}
                  </Text>
                </View>
                <View style={styles.locationInlineAddressSlot}>
                  <Text style={styles.locationInlineAddress} numberOfLines={2}>
                    {locationPreviewAddress ||
                      `${locationPreviewCenter.latitude.toFixed(5)}, ${locationPreviewCenter.longitude.toFixed(5)}`}
                  </Text>
                </View>
              </View>
              <View style={styles.locationMetaSpinnerSlot}>
                {resolvingLocationPreview ? <ActivityIndicator size="small" color={colors.textMuted} /> : null}
              </View>
            </View>
            <View style={styles.locationActionsRow}>
              <Pressable
                onPress={() => {
                  onSendText(
                    buildLocationMessageText({
                      latitude: locationPreviewCenter.latitude,
                      longitude: locationPreviewCenter.longitude,
                      title: locationPreviewTitle,
                      address: locationPreviewAddress,
                    })
                  )
                  setSheetOpen(false)
                }}
                style={({ pressed }) => [styles.primaryCard, styles.locationActionHalf, pressed && styles.primaryCardPressed]}
              >
                <Feather name="send" size={18} color={colors.primary} />
                <Text style={styles.primaryCardText}>Share</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {!pendingPhoto && activeTab === 'files' ? (
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
      width: PHOTO_TILE_WIDTH,
      aspectRatio: 1,
      minHeight: 102,
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: colors.surfaceMuted,
    },
    cameraTile: {
      width: PHOTO_TILE_WIDTH,
      aspectRatio: 1,
      minHeight: 102,
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: colors.secondary,
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
      backgroundColor: colors.secondary,
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
      position: 'relative',
    },
    locationLoadingBlock: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted,
    },
    locationInlineMeta: {
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceMuted,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      minHeight: 78,
    },
    locationMetaSpinnerSlot: {
      width: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    locationInlineMetaBody: {
      flex: 1,
      minWidth: 0,
      minHeight: 52,
    },
    locationInlineTitleSlot: {
      minHeight: 18,
      justifyContent: 'center',
      marginBottom: 4,
    },
    locationInlineAddressSlot: {
      minHeight: 34,
    },
    locationInlineTitle: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '700',
    },
    locationInlineAddress: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 17,
    },
    locationActionsRow: {
      flexDirection: 'row',
      gap: 10,
    },
    locationActionHalf: {
      flex: 1,
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
      backgroundColor: 'transparent',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    tabChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
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
      color: colors.white,
    },
    pendingPhotoWrap: {
      gap: spacing.md,
      paddingBottom: spacing.xs,
    },
    pendingPhotoImage: {
      width: '100%',
      height: 520,
      borderRadius: 20,
      backgroundColor: colors.surfaceMuted,
    },
    pendingPhotoActions: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    pendingActionButton: {
      flex: 1,
      minHeight: 52,
      borderRadius: radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    pendingActionButtonPrimary: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    pendingActionButtonPressed: {
      opacity: 0.86,
    },
    pendingActionButtonDisabled: {
      opacity: 0.72,
    },
    pendingActionText: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '600',
    },
    pendingActionTextPrimary: {
      color: colors.white,
    },
  })
