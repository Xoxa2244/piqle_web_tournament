import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import * as Location from 'expo-location'
import * as MediaLibrary from 'expo-media-library'
import { Feather } from '@expo/vector-icons'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, Image, Keyboard, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import {
  formatFileSize,
  type ChatLocationMessagePayload,
} from '../lib/chatSpecialMessages'
import { radius, spacing, type ThemePalette } from '../lib/theme'
import { compressImageLikeChat } from '../lib/imageCompression'
import { useAppTheme } from '../providers/ThemeProvider'
import { useToast } from '../providers/ToastProvider'

import { AppBottomSheet, AppConfirmActions } from './AppBottomSheet'
import { LocationMapSurface } from './LocationMapSurface'
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
  poll: {
    title: string
    options: {
      id?: string | null
      text: string
    }[]
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

type RecentPhotoAsset = {
  id: string
  uri: string
  sourceUri: string
  width: number
  height: number
  fileName?: string | null
}

type PhotoGridItem = { type: 'camera'; id: 'camera' } | ({ type: 'photo' } & RecentPhotoAsset)
type LocationCenter = { latitude: number; longitude: number }
type PollDraftOption = {
  id: string
  text: string
}
type PollDraft = {
  title: string
  options: PollDraftOption[]
}

const PHOTO_GRID_GAP = 8
const PHOTO_GRID_COLUMNS = 3
const PHOTO_TILE_WIDTH = '31%'
const TITLE_MAX_LENGTH = 120
const MESSAGE_MAX_LENGTH = 2000
const POLL_TITLE_MAX_LENGTH = 120
const POLL_OPTION_MAX_LENGTH = 120
const POLL_OPTION_MIN_COUNT = 2
const POLL_OPTION_MAX_COUNT = 10
const DEFAULT_LOCATION: LocationCenter = {
  latitude: 40.7128,
  longitude: -74.006,
}

const createPollOptionId = () => `poll-option-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const createEmptyPollDraft = (): PollDraft => ({
  title: '',
  options: [
    { id: createPollOptionId(), text: '' },
    { id: createPollOptionId(), text: '' },
  ],
})

const PhotoTile = memo(function PhotoTile({
  item,
  colors,
  styles,
  onOpenCamera,
  onOpenPhoto,
}: {
  item: PhotoGridItem
  colors: ThemePalette
  styles: ReturnType<typeof createStyles>
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
    </Pressable>
  )
})

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
  const { colors, theme } = useAppTheme()
  const toast = useToast()
  const styles = useMemo(() => createStyles(colors, theme), [colors, theme])
  const [composerView, setComposerView] = useState<'form' | 'photos' | 'location' | 'poll'>('form')
  const [recentPhotos, setRecentPhotos] = useState<RecentPhotoAsset[]>([])
  const [photoPermissionDenied, setPhotoPermissionDenied] = useState(false)
  const [loadingPhotos, setLoadingPhotos] = useState(false)
  const [photoCursor, setPhotoCursor] = useState<string | null>(null)
  const [hasMorePhotos, setHasMorePhotos] = useState(true)
  const [loadingMorePhotos, setLoadingMorePhotos] = useState(false)
  const [locationInitialCenter, setLocationInitialCenter] = useState<LocationCenter>(DEFAULT_LOCATION)
  const [locationSelectedCenter, setLocationSelectedCenter] = useState<LocationCenter>(DEFAULT_LOCATION)
  const [locationMapReady, setLocationMapReady] = useState(false)
  const [locationResolving, setLocationResolving] = useState(false)
  const [locationPermissionDenied, setLocationPermissionDenied] = useState(false)
  const [locationTitle, setLocationTitle] = useState('Pinned location')
  const [locationAddress, setLocationAddress] = useState<string | null>(null)
  const [pollDraft, setPollDraft] = useState<PollDraft | null>(null)
  const [pollAttempted, setPollAttempted] = useState(false)
  const [pollError, setPollError] = useState<string | null>(null)
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const lastMessageLimitToastAt = useRef(0)
  const formScrollRef = useRef<ScrollView | null>(null)

  const scrollFormTo = useCallback((y: number) => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        formScrollRef.current?.scrollTo({
          y,
          animated: true,
        })
      }, 120)
    })
  }, [])

  useEffect(() => {
    if (!open) {
      setComposerView('form')
      setSubmitAttempted(false)
      setPollAttempted(false)
      setPollError(null)
      setPollDraft(null)
    }
  }, [open])

  useEffect(() => {
    if (!open || composerView !== 'poll') return
    setPollAttempted(false)
    setPollError(null)
    setPollDraft((current) => {
      if (current) return current
      if (draft.poll) {
        return {
          title: draft.poll.title,
          options: draft.poll.options.map((option) => ({
            id: String(option.id ?? createPollOptionId()),
            text: option.text,
          })),
        }
      }
      return createEmptyPollDraft()
    })
  }, [composerView, draft.poll, open])

  useEffect(() => {
    if (!open || composerView !== 'location') return
    let cancelled = false
    setLocationMapReady(false)
    setLocationPermissionDenied(false)
    setLocationTitle('Pinned location')
    setLocationAddress(null)
    setLocationSelectedCenter(DEFAULT_LOCATION)
    setLocationInitialCenter(DEFAULT_LOCATION)

    void (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync()
        if (cancelled) return
        const granted = permission.status === Location.PermissionStatus.GRANTED
        setLocationPermissionDenied(!granted)
        if (!granted) {
          Alert.alert(
            'Location access unavailable',
            'Piqle does not have access to your current location. You can open Settings, or still pick any place manually on the map.',
            [
              { text: 'Continue', style: 'cancel' },
              { text: 'Open Settings', onPress: () => void Linking.openSettings().catch(() => undefined) },
            ],
          )
          return
        }

        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        })
        if (cancelled) return
        const next = {
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
        }
        setLocationInitialCenter(next)
        setLocationSelectedCenter(next)
      } catch {
        if (!cancelled) {
          setLocationPermissionDenied(true)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [composerView, open])

  useEffect(() => {
    if (!open || composerView !== 'location') return
    let cancelled = false
    const timeout = setTimeout(() => {
      setLocationResolving(true)
      void (async () => {
        try {
          const result = await Location.reverseGeocodeAsync(locationSelectedCenter)
          if (cancelled) return
          const first = result?.[0]
          const title =
            [first?.name, first?.street].filter(Boolean).join(', ') ||
            first?.district ||
            first?.city ||
            first?.region ||
            'Pinned location'
          const address =
            [
              first?.street,
              first?.city,
              first?.region,
              first?.postalCode,
              first?.country,
            ]
              .filter(Boolean)
              .join(', ') || null
          setLocationTitle(title)
          setLocationAddress(address)
        } catch {
          if (!cancelled) {
            setLocationTitle('Pinned location')
            setLocationAddress(
              `${locationSelectedCenter.latitude.toFixed(5)}, ${locationSelectedCenter.longitude.toFixed(5)}`,
            )
          }
        } finally {
          if (!cancelled) setLocationResolving(false)
        }
      })()
    }, 240)

    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [composerView, locationSelectedCenter.latitude, locationSelectedCenter.longitude, open])

  const handleLocationWebMessage = useCallback((event: any) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data) as {
        type?: string
        payload?: { latitude?: number; longitude?: number }
      }
      if (payload.type === 'ready') {
        setLocationMapReady(true)
        return
      }
      if (payload.type === 'center' && payload.payload) {
        const latitude = Number(payload.payload.latitude)
        const longitude = Number(payload.payload.longitude)
        if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
          setLocationSelectedCenter({ latitude, longitude })
        }
      }
    } catch {
      // ignore malformed web messages
    }
  }, [])

  const loadRecentPhotos = useCallback(async (after?: string | null, append = false) => {
    try {
      if (append) setLoadingMorePhotos(true)
      else setLoadingPhotos(true)
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
        }),
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
      if (append) setLoadingMorePhotos(false)
      else setLoadingPhotos(false)
    }
  }, [])

  useEffect(() => {
    if (!open || composerView !== 'photos') return
    void loadRecentPhotos()
  }, [composerView, loadRecentPhotos, open])

  const photoGridItems = useMemo<PhotoGridItem[]>(
    () => [{ type: 'camera', id: 'camera' }, ...recentPhotos.map((item) => ({ ...item, type: 'photo' as const }))],
    [recentPhotos],
  )
  const isMessageMissing = submitAttempted && !draft.body.trim()
  const messageLength = draft.body.length
  const isMessageAtLimit = messageLength >= MESSAGE_MAX_LENGTH
  const normalizedPollDraft = pollDraft
    ? {
        title: pollDraft.title.trim(),
        options: pollDraft.options.map((option) => ({
          id: option.id,
          text: option.text.trim(),
        })),
      }
    : null
  const pollOptionCount = normalizedPollDraft?.options.filter((option) => option.text.length > 0).length ?? 0
  const isPollTitleMissing = pollAttempted && composerView === 'poll' && !normalizedPollDraft?.title
  const isPollOptionMissing = pollAttempted && composerView === 'poll' && pollOptionCount < POLL_OPTION_MIN_COUNT
  const updatePollDraft = useCallback((updater: (current: PollDraft) => PollDraft) => {
    setPollDraft((current) => {
      const next = updater(current ?? createEmptyPollDraft())
      return next
    })
  }, [])

  const handleChangeBody = useCallback(
    (value: string) => {
      if (value.length > MESSAGE_MAX_LENGTH) {
        const now = Date.now()
        if (now - lastMessageLimitToastAt.current > 1200) {
          lastMessageLimitToastAt.current = now
          toast.error(`Message can be up to ${MESSAGE_MAX_LENGTH} characters.`)
        }
        onChangeDraft((current) => ({ ...current, body: value.slice(0, MESSAGE_MAX_LENGTH) }))
        return
      }
      onChangeDraft((current) => ({ ...current, body: value }))
    },
    [onChangeDraft, toast],
  )

  const handleOpenPollEditor = useCallback(() => {
    Keyboard.dismiss()
    setPollAttempted(false)
    setPollError(null)
    setComposerView('poll')
  }, [])

  const handlePollOptionTextChange = useCallback((optionId: string, value: string) => {
    updatePollDraft((current) => ({
      ...current,
      options: current.options.map((option) => (option.id === optionId ? { ...option, text: value } : option)),
    }))
  }, [updatePollDraft])

  const handleAddPollOption = useCallback(() => {
    updatePollDraft((current) => {
      if (current.options.length >= POLL_OPTION_MAX_COUNT) return current
      return {
        ...current,
        options: [...current.options, { id: createPollOptionId(), text: '' }],
      }
    })
  }, [updatePollDraft])

  const handleRemovePollOption = useCallback((optionId: string) => {
    updatePollDraft((current) => {
      if (current.options.length <= POLL_OPTION_MIN_COUNT) return current
      return {
        ...current,
        options: current.options.filter((option) => option.id !== optionId),
      }
    })
  }, [updatePollDraft])

  const handleAttachPoll = useCallback(() => {
    const nextPoll = normalizedPollDraft
      ? {
          title: normalizedPollDraft.title,
          options: normalizedPollDraft.options.filter((option) => option.text.length > 0),
        }
      : null
    const validOptions = nextPoll?.options ?? []
    const fail = (message: string) => {
      setPollAttempted(true)
      setPollError(message)
      toast.error(message)
    }

    if (!nextPoll?.title) {
      fail('Add a poll title.')
      return
    }
    if (validOptions.length < POLL_OPTION_MIN_COUNT) {
      fail('Add at least two answers.')
      return
    }
    if (validOptions.length > POLL_OPTION_MAX_COUNT) {
      fail(`A poll can have at most ${POLL_OPTION_MAX_COUNT} answers.`)
      return
    }
    if (validOptions.some((option) => !option.text)) {
      fail('Fill in every answer before attaching the poll.')
      return
    }

    onChangeDraft((current) => ({
      ...current,
      poll: {
        title: nextPoll.title,
        options: validOptions.map((option) => ({
          id: option.id,
          text: option.text,
        })),
      },
    }))
    setComposerView('form')
  }, [normalizedPollDraft, onChangeDraft, toast])

  const handleRemovePoll = useCallback(() => {
    onChangeDraft((current) => ({ ...current, poll: null }))
    setPollDraft(null)
    setPollAttempted(false)
    setPollError(null)
    setComposerView('form')
  }, [onChangeDraft])

  const handleOpenCamera = useCallback(async () => {
    Keyboard.dismiss()
    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) return
    const captured = await ImagePicker.launchCameraAsync({
      cameraType: ImagePicker.CameraType.back,
      mediaTypes: ['images'],
      quality: 0.82,
      allowsEditing: false,
    })
    if (captured.canceled || !captured.assets?.length) return
    const asset = captured.assets[0]
    if (!asset?.uri) return
    const compressed = await compressImageLikeChat({
      uri: asset.uri,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
    })
    onChangeDraft((current) => ({
      ...current,
      image: {
        uri: compressed.uri,
        width: compressed.width ?? asset.width ?? null,
        height: compressed.height ?? asset.height ?? null,
        fileName: compressed.fileName ?? asset.fileName ?? null,
        mimeType: compressed.mimeType ?? asset.mimeType ?? null,
        remoteUrl: null,
      },
    }))
    setComposerView('form')
  }, [onChangeDraft])

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
    const compressed = await compressImageLikeChat({
      uri: asset.uri,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
    })
    onChangeDraft((current) => ({
      ...current,
      image: {
        uri: compressed.uri,
        width: compressed.width ?? asset.width ?? null,
        height: compressed.height ?? asset.height ?? null,
        fileName: compressed.fileName ?? asset.fileName ?? null,
        mimeType: compressed.mimeType ?? asset.mimeType ?? null,
        remoteUrl: null,
      },
    }))
    setComposerView('form')
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

  const handleLoadMorePhotos = useCallback(() => {
    if (loadingMorePhotos || loadingPhotos || !hasMorePhotos || !photoCursor) return
    void loadRecentPhotos(photoCursor, true)
  }, [hasMorePhotos, loadRecentPhotos, loadingMorePhotos, loadingPhotos, photoCursor])

  const renderPhotoTile = useCallback(
    ({ item }: { item: PhotoGridItem }) => (
      <PhotoTile
        item={item}
        colors={colors}
        styles={styles}
        onOpenCamera={() => void handleOpenCamera()}
        onOpenPhoto={(photo) => {
          void (async () => {
            const compressed = await compressImageLikeChat({
              uri: photo.sourceUri,
              fileName: photo.fileName,
              mimeType: 'image/jpeg',
              width: photo.width,
              height: photo.height,
            })
            onChangeDraft((current) => ({
              ...current,
              image: {
                uri: compressed.uri,
                width: compressed.width ?? photo.width ?? null,
                height: compressed.height ?? photo.height ?? null,
                fileName: compressed.fileName ?? photo.fileName ?? null,
                mimeType: compressed.mimeType ?? 'image/jpeg',
                remoteUrl: null,
              },
            }))
            setComposerView('form')
          })()
        }}
      />
    ),
    [colors, handleOpenCamera, onChangeDraft, styles],
  )

  return (
    <>
      <AppBottomSheet
        open={open}
        onClose={onClose}
        title={mode === 'edit' ? 'Edit announcement' : 'Post announcement'}
        titleAction={
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.closeButton, pressed && styles.buttonPressed]}
          >
            <Feather name="x" size={18} color={colors.text} />
          </Pressable>
        }
        maxHeight="83%"
        bottomPaddingExtra={8}
        keyboardOffsetCompensation={8}
        topGapExtra={14}
        footer={
          composerView === 'form' ? (
            <AppConfirmActions
              intent="positive"
              confirmLabel={mode === 'edit' ? (submitLoading ? 'Saving…' : 'Save') : submitLoading ? 'Posting…' : 'Post'}
              onConfirm={() => {
                if (submitDisabled || submitLoading) return
                if (!draft.body.trim()) {
                  setSubmitAttempted(true)
                  toast.error('Message is required.')
                  return
                }
                onSubmit()
              }}
              confirmLoading={submitLoading}
            />
          ) : composerView === 'location' ? (
            <AppConfirmActions
              intent="positive"
              cancelLabel="Back"
              confirmLabel="Share"
              onCancel={() => setComposerView('form')}
              onConfirm={() => {
                onChangeDraft((current) => ({
                  ...current,
                  location: {
                    latitude: locationSelectedCenter.latitude,
                    longitude: locationSelectedCenter.longitude,
                    title: locationTitle,
                    address: locationAddress,
                  },
                }))
                setComposerView('form')
              }}
            />
          ) : composerView === 'poll' ? (
            <AppConfirmActions
              intent="positive"
              cancelLabel="Back"
              confirmLabel={draft.poll ? 'Save poll' : 'Add poll'}
              onCancel={() => {
                setPollAttempted(false)
                setPollError(null)
                setComposerView('form')
              }}
              onConfirm={handleAttachPoll}
            />
          ) : (
            <View style={styles.photoFooter}>
              <Pressable
                onPress={() => setComposerView('form')}
                style={({ pressed }) => [styles.footerBackButton, pressed && styles.footerBackButtonPressed]}
              >
                <Feather name="arrow-left" size={16} color={colors.text} />
                <Text style={styles.footerBackText}>Back to post</Text>
              </Pressable>
            </View>
          )
        }
        >
          {composerView === 'form' ? (
            <View style={styles.formComposerBody}>
              <ScrollView
                ref={formScrollRef}
                style={styles.formScroll}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.formScrollContent}
              >
                <InputField
                  value={draft.title}
                  onChangeText={(value) => onChangeDraft((current) => ({ ...current, title: value }))}
                  placeholder="Title (optional)"
                  containerStyle={styles.field}
                  maxLength={TITLE_MAX_LENGTH}
                  onFocus={() => scrollFormTo(20)}
                />
                <Text style={styles.titleHelper}>Keep titles under {TITLE_MAX_LENGTH} characters.</Text>
                <InputField
                  value={draft.body}
                  onChangeText={handleChangeBody}
                  placeholder="Message *"
                  multiline
                  containerStyle={[styles.field, isMessageMissing && styles.messageFieldErrorShell]}
                  onFocus={() => scrollFormTo(88)}
                />
                <Text style={[styles.messageHelper, isMessageAtLimit && styles.messageHelperWarning]}>
                  {messageLength} / {MESSAGE_MAX_LENGTH} characters
                </Text>
                {isMessageMissing ? <Text style={styles.fieldError}>Add a short message before posting.</Text> : null}

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.actionRow}
                  keyboardShouldPersistTaps="handled"
                >
                  <Pressable
                    onPress={() => setComposerView('photos')}
                    style={({ pressed }) => [
                      styles.actionChip,
                      draft.image && styles.actionChipActive,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Feather name="image" size={15} color={draft.image ? colors.white : colors.primary} />
                    <Text style={[styles.actionChipText, draft.image && styles.actionChipTextActive]}>
                      {draft.image ? 'Photo ✓' : 'Photo'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setComposerView('location')}
                    style={({ pressed }) => [
                      styles.actionChip,
                      draft.location && styles.actionChipActive,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Feather name="map-pin" size={15} color={draft.location ? colors.white : colors.primary} />
                    <Text style={[styles.actionChipText, draft.location && styles.actionChipTextActive]}>
                      {draft.location ? 'Location ✓' : 'Location'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={handleOpenPollEditor}
                    style={({ pressed }) => [
                      styles.actionChip,
                      draft.poll && styles.actionChipActive,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Feather name="bar-chart-2" size={15} color={draft.poll ? colors.white : colors.primary} />
                    <Text style={[styles.actionChipText, draft.poll && styles.actionChipTextActive]}>
                      {draft.poll ? 'Poll ✓' : 'Poll'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void handlePickFile()}
                    style={({ pressed }) => [
                      styles.actionChip,
                      draft.file && styles.actionChipActive,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Feather name="file-text" size={15} color={draft.file ? colors.white : colors.primary} />
                    <Text style={[styles.actionChipText, draft.file && styles.actionChipTextActive]}>
                      {draft.file ? 'File ✓' : 'File'}
                    </Text>
                  </Pressable>
                </ScrollView>

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

                {draft.poll ? (
                  <View style={styles.pollPreviewWrap}>
                    <View style={styles.pollPreviewHeader}>
                      <View style={styles.pollPreviewHeaderLeft}>
                        <View style={styles.pollPreviewIconWrap}>
                          <Feather name="bar-chart-2" size={15} color={colors.primary} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.pollPreviewTitle} numberOfLines={2}>
                            {draft.poll.title}
                          </Text>
                          <Text style={styles.pollPreviewMeta}>
                            {draft.poll.options.filter((option) => option.text.trim()).length} answer
                            {draft.poll.options.filter((option) => option.text.trim()).length === 1 ? '' : 's'}
                          </Text>
                        </View>
                      </View>
                      <Pressable
                        onPress={() => onChangeDraft((current) => ({ ...current, poll: null }))}
                        style={({ pressed }) => [styles.pollRemoveButton, pressed && styles.buttonPressed]}
                      >
                        <Feather name="x" size={16} color={colors.textMuted} />
                      </Pressable>
                    </View>
                    <View style={styles.pollPreviewOptions}>
                      {draft.poll.options
                        .filter((option) => option.text.trim())
                        .slice(0, 4)
                        .map((option) => (
                          <View key={option.id} style={styles.pollPreviewOption}>
                            <Text style={styles.pollPreviewOptionDot}>•</Text>
                            <Text style={styles.pollPreviewOptionText} numberOfLines={1}>
                              {option.text}
                            </Text>
                          </View>
                        ))}
                      {draft.poll.options.filter((option) => option.text.trim()).length > 4 ? (
                        <Text style={styles.pollPreviewMore}>
                          +{draft.poll.options.filter((option) => option.text.trim()).length - 4} more
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ) : null}

                {draft.location ? (
                  <View style={styles.locationPreviewWrap}>
                    <View style={styles.locationPreviewMapWrap}>
                      <LocationMapSurface
                        latitude={draft.location.latitude}
                        longitude={draft.location.longitude}
                        dark={theme === 'dark'}
                        centerPin={false}
                        interactive={false}
                      />
                      <View style={styles.locationPreviewOverlay} pointerEvents="none">
                        <Feather name="map-pin" size={18} color={colors.white} />
                        <Text style={styles.locationPreviewOverlayText}>Map preview</Text>
                      </View>
                    </View>
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
              </ScrollView>
            </View>
          ) : composerView === 'poll' ? (
          <View style={styles.pollSheetBody}>
            <View style={styles.photoSheetHeader}>
              <Pressable
                onPress={() => {
                  setPollAttempted(false)
                  setPollError(null)
                  setComposerView('form')
                }}
                style={({ pressed }) => [styles.inlineActionChip, pressed && styles.inlineActionChipPressed]}
              >
                <Text style={styles.inlineActionChipText}>Back</Text>
              </Pressable>
              <Text style={styles.photoSheetTitle}>Poll</Text>
              <View style={styles.inlineActionChipGhost} />
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.pollEditorScrollContent}
            >
              <InputField
                value={pollDraft?.title ?? ''}
                onChangeText={(value) => {
                  setPollError(null)
                  setPollAttempted(false)
                  updatePollDraft((current) => ({ ...current, title: value }))
                }}
                placeholder="Poll title *"
                containerStyle={[
                  styles.field,
                  isPollTitleMissing && styles.messageFieldErrorShell,
                ]}
                maxLength={POLL_TITLE_MAX_LENGTH}
              />
              <Text style={styles.pollHelper}>Poll title is required</Text>
              {isPollTitleMissing ? <Text style={[styles.fieldError, styles.pollErrorSpacing]}>Add a poll title</Text> : null}

              <View style={styles.pollOptionsBlock}>
                {(pollDraft?.options ?? []).map((option, index) => {
                  const isEmpty = pollAttempted && composerView === 'poll' && !option.text.trim()
                  return (
                    <View key={option.id} style={styles.pollOptionWrap}>
                      <InputField
                        value={option.text}
                        onChangeText={(value) => {
                          setPollError(null)
                          setPollAttempted(false)
                          handlePollOptionTextChange(option.id, value)
                        }}
                        placeholder={`Answer ${index + 1} *`}
                        containerStyle={[
                          styles.field,
                          isEmpty && styles.messageFieldErrorShell,
                        ]}
                        maxLength={POLL_OPTION_MAX_LENGTH}
                      />
                      {isEmpty ? <Text style={styles.fieldError}>Fill this answer in.</Text> : null}
                      {(pollDraft?.options.length ?? 0) > POLL_OPTION_MIN_COUNT ? (
                        <Pressable
                          onPress={() => handleRemovePollOption(option.id)}
                          style={({ pressed }) => [styles.removeOptionButton, pressed && styles.buttonPressed]}
                        >
                          <Feather name="x" size={16} color={colors.textMuted} />
                        </Pressable>
                      ) : null}
                    </View>
                  )
                })}
              </View>

              <Pressable
                onPress={handleAddPollOption}
                disabled={(pollDraft?.options.length ?? 0) >= POLL_OPTION_MAX_COUNT}
                style={({ pressed }) => [
                  styles.addPollOptionButton,
                  (pollDraft?.options.length ?? 0) >= POLL_OPTION_MAX_COUNT && styles.addPollOptionButtonDisabled,
                  pressed && styles.addPollOptionButtonPressed,
                ]}
              >
                <Feather name="plus" size={16} color={colors.primary} />
                <Text style={styles.addPollOptionText}>Add answer</Text>
              </Pressable>

              <Text style={[styles.pollHelper, isPollOptionMissing && styles.pollHelperError]}>
                {(pollDraft?.options.filter((option) => option.text.trim()).length ?? 0)}/{POLL_OPTION_MAX_COUNT} answers
                and at least {POLL_OPTION_MIN_COUNT} are required
              </Text>
              {pollError ? <Text style={styles.fieldError}>{pollError}</Text> : null}
            </ScrollView>
          </View>
        ) : composerView === 'location' ? (
          <View style={styles.locationSheetBody}>
            <View style={styles.photoSheetHeader}>
              <Pressable
                onPress={() => setComposerView('form')}
                style={({ pressed }) => [styles.inlineActionChip, pressed && styles.inlineActionChipPressed]}
              >
                <Text style={styles.inlineActionChipText}>Back</Text>
              </Pressable>
              <Text style={styles.photoSheetTitle}>Share location</Text>
              <View style={styles.inlineActionChipGhost} />
            </View>

            <View style={styles.mapWrap}>
              <LocationMapSurface
                key={`${locationInitialCenter.latitude}-${locationInitialCenter.longitude}-${theme}`}
                latitude={locationInitialCenter.latitude}
                longitude={locationInitialCenter.longitude}
                dark={theme === 'dark'}
                interactive
                centerPin
                onMessage={handleLocationWebMessage}
              />
              {!locationMapReady ? (
                <View style={styles.loadingCover}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={styles.loadingText}>Loading map…</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.infoCard}>
              <View style={styles.previewHeader}>
                <Text style={styles.previewTitle} numberOfLines={1}>
                  {locationTitle}
                </Text>
                {locationResolving ? <ActivityIndicator size="small" color={colors.textMuted} /> : null}
              </View>
              <Text style={styles.previewAddress} numberOfLines={2}>
                {locationAddress || `${locationSelectedCenter.latitude.toFixed(5)}, ${locationSelectedCenter.longitude.toFixed(5)}`}
              </Text>
              <View style={styles.coordRow}>
                <Text style={styles.coordText}>
                  {locationSelectedCenter.latitude.toFixed(5)}, {locationSelectedCenter.longitude.toFixed(5)}
                </Text>
                {locationPermissionDenied ? (
                  <Pressable
                    onPress={() => void Linking.openSettings().catch(() => undefined)}
                    style={({ pressed }) => [styles.settingsChip, pressed && { opacity: 0.82 }]}
                  >
                    <Text style={styles.settingsChipText}>Settings</Text>
                  </Pressable>
                ) : null}
              </View>
              <Text style={styles.staticHintText}>
                This place will be sent as a map preview in the post.
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.photoSheetBody}>
            <View style={styles.photoSheetHeader}>
              <Pressable
                onPress={() => setComposerView('form')}
                style={({ pressed }) => [styles.inlineActionChip, pressed && styles.inlineActionChipPressed]}
              >
                <Text style={styles.inlineActionChipText}>Back</Text>
              </Pressable>
              <Text style={styles.photoSheetTitle}>Recent photos</Text>
              <Pressable
                onPress={() => void handlePickPhoto()}
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
                  numColumns={PHOTO_GRID_COLUMNS}
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
                />
              </View>
            )}
          </View>
        )}
      </AppBottomSheet>
    </>
  )
}

const createStyles = (colors: ThemePalette, theme: 'light' | 'dark') =>
  StyleSheet.create({
    field: {
      marginBottom: spacing.sm,
    },
    titleHelper: {
      marginTop: -2,
      marginBottom: spacing.sm,
      color: colors.textMuted,
      fontSize: 11,
      lineHeight: 15,
    },
    messageHelper: {
      marginTop: -2,
      marginBottom: spacing.sm,
      color: colors.textMuted,
      fontSize: 11,
      lineHeight: 15,
    },
    messageHelperWarning: {
      color: colors.danger,
      fontWeight: '700',
    },
    messageFieldErrorShell: {
      borderColor: colors.danger,
      backgroundColor: colors.dangerSoft,
    },
    fieldError: {
      marginTop: 2,
      marginBottom: spacing.sm,
      color: colors.danger,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '700',
    },
    closeButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    actionRow: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: spacing.sm,
      paddingRight: 2,
    },
    actionChip: {
      minHeight: 36,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme === 'dark' ? colors.border : '#d8dee8',
      backgroundColor: theme === 'dark' ? colors.surfaceMuted : '#f5f7fb',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 12,
      flexShrink: 0,
    },
    actionChipActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primary,
    },
    actionChipText: {
      color: colors.text,
      fontWeight: '600',
      fontSize: 12,
    },
    actionChipTextActive: {
      color: colors.white,
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
    locationPreviewMapWrap: {
      height: 126,
      overflow: 'hidden',
      backgroundColor: colors.surfaceMuted,
    },
    locationPreviewOverlay: {
      position: 'absolute',
      left: 12,
      top: 12,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: 'rgba(0,0,0,0.42)',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    locationPreviewOverlayText: {
      color: colors.white,
      fontSize: 12,
      fontWeight: '600',
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
    pollSheetBody: {
      gap: spacing.md,
    },
    photoSheetBody: {
      gap: spacing.md,
    },
    photoSheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    photoSheetTitle: {
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
    inlineActionChipGhost: {
      width: 48,
      height: 28,
    },
    pollEditorScrollContent: {
      paddingBottom: 4,
    },
    pollOptionsBlock: {
      gap: 4,
      marginBottom: 8,
    },
    pollOptionWrap: {
      position: 'relative',
    },
    removeOptionButton: {
      position: 'absolute',
      top: 10,
      right: 10,
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted,
    },
    addPollOptionButton: {
      minHeight: 42,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.primaryGhost,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 12,
      marginBottom: spacing.sm,
    },
    addPollOptionButtonDisabled: {
      opacity: 0.5,
    },
    addPollOptionButtonPressed: {
      opacity: 0.84,
    },
    addPollOptionText: {
      color: colors.primary,
      fontSize: 13,
      fontWeight: '700',
    },
    pollHelper: {
      color: colors.textMuted,
      fontSize: 11,
      lineHeight: 15,
      marginBottom: 4,
    },
    pollHelperError: {
      color: colors.danger,
      fontWeight: '700',
    },
    pollErrorSpacing: {
      marginBottom: 4,
    },
    locationSheetBody: {
      gap: spacing.md,
    },
    mapWrap: {
      height: 340,
      overflow: 'hidden',
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
    },
    loadingCover: {
      position: 'absolute',
      inset: 0,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      backgroundColor: colors.surfaceMuted,
    },
    previewHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    previewTitle: {
      color: colors.text,
      fontSize: 16,
      fontWeight: '700',
      flex: 1,
      minWidth: 0,
    },
    previewAddress: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
    },
    coordRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    coordText: {
      color: colors.textMuted,
      fontSize: 12,
    },
    settingsChip: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    settingsChipText: {
      color: colors.text,
      fontSize: 12,
      fontWeight: '600',
    },
    staticHintText: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
    },
    pollPreviewWrap: {
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 10,
      marginBottom: spacing.sm,
    },
    pollPreviewHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 10,
    },
    pollPreviewHeaderLeft: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    pollPreviewIconWrap: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.primaryGhost,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
    },
    pollPreviewTitle: {
      color: colors.text,
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '700',
    },
    pollPreviewMeta: {
      marginTop: 2,
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '500',
    },
    pollRemoveButton: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    pollPreviewOptions: {
      gap: 6,
    },
    pollPreviewOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    pollPreviewOptionDot: {
      color: colors.primary,
      fontSize: 18,
      lineHeight: 18,
      marginTop: -1,
    },
    pollPreviewOptionText: {
      flex: 1,
      minWidth: 0,
      color: colors.text,
      fontSize: 13,
      lineHeight: 18,
    },
    pollPreviewMore: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 16,
      marginTop: 2,
    },
    photoListWrap: {
      height: 380,
    },
    photoGrid: {
      gap: PHOTO_GRID_GAP,
      paddingBottom: 4,
    },
    photoRow: {
      gap: PHOTO_GRID_GAP,
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
    photoListFooter: {
      paddingVertical: 14,
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
    photoFooter: {
      alignItems: 'flex-end',
    },
    formComposerBody: {
      width: '100%',
      minHeight: 300,
      flexShrink: 1,
    },
    formScroll: {
      maxHeight: 340,
      width: '100%',
    },
    formScrollContent: {
      paddingBottom: spacing.lg,
    },
    footerBackButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: colors.surfaceMuted,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    footerBackButtonPressed: {
      opacity: 0.84,
    },
    footerBackText: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '600',
    },
  })
