import * as FileSystem from 'expo-file-system/legacy'
import * as MediaLibrary from 'expo-media-library'
import { Feather } from '@expo/vector-icons'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Animated,
  Dimensions,
  Image,
  Linking,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import type { ChatMessage } from '../lib/chatMessages'
import { formatChatTime } from '../lib/chatMessages'
import { formatDate } from '../lib/formatters'
import { formatFileSize, parseFileMessageText, parseImageMessageText } from '../lib/chatSpecialMessages'
import { spacing, type ThemePalette } from '../lib/theme'
import { useAppTheme } from '../providers/ThemeProvider'
import { useToast } from '../providers/ToastProvider'
import { PageLayout } from './navigation/PageLayout'
import { EmptyState, LoadingBlock } from './ui'

type GalleryTab = 'media' | 'files' | 'links'
const LINK_PATTERN = /((?:https?:\/\/|www\.)[^\s]+)/gi

export function ChatAttachmentGalleryScreen({
  title,
  messages,
  loading,
  error,
}: {
  title: string
  messages: ChatMessage[]
  loading?: boolean
  error?: string | null
}) {
  const { colors } = useAppTheme()
  const toast = useToast()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [activeTab, setActiveTab] = useState<GalleryTab>('media')
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const [savingPreviewImage, setSavingPreviewImage] = useState(false)
  const [viewerPagerScrollEnabled, setViewerPagerScrollEnabled] = useState(true)
  const lastViewerCloseAtRef = useRef(0)
  const viewerTranslateY = useRef(new Animated.Value(0)).current
  const viewerPagerRef = useRef<ScrollView | null>(null)
  const screenWidth = Dimensions.get('window').width

  const imageItems = useMemo(
    () =>
      messages
        .map((message) => {
          const image = parseImageMessageText(message.text)
          if (!image) return null
          return {
            id: message.id,
            url: image.url,
            fileName: image.fileName || 'Photo',
            size: image.size ?? null,
            authorName: message.user?.name || 'User',
            createdAt: message.createdAt,
          }
        })
        .filter(Boolean) as {
        id: string
        url: string
        fileName: string
        size: number | null
        authorName: string
        createdAt: string
      }[],
    [messages]
  )

  const previewImage = previewIndex !== null ? imageItems[previewIndex] ?? null : null
  const imageRows = useMemo(() => {
    const rows: typeof imageItems[] = []
    for (let index = 0; index < imageItems.length; index += 3) {
      rows.push(imageItems.slice(index, index + 3))
    }
    return rows
  }, [imageItems])

  useEffect(() => {
    viewerTranslateY.setValue(0)
    if (previewIndex === null) return
    requestAnimationFrame(() => {
      viewerPagerRef.current?.scrollTo({
        x: previewIndex * screenWidth,
        y: 0,
        animated: false,
      })
    })
  }, [previewIndex, screenWidth, viewerTranslateY])

  const handleSavePreviewImage = useCallback(async () => {
    const next = previewImage
    if (!next?.url || savingPreviewImage) return
    try {
      setSavingPreviewImage(true)
      const permission = await MediaLibrary.requestPermissionsAsync()
      if (permission.status !== 'granted') {
        toast.error('Please allow photo access to save images.')
        return
      }
      const targetUri = `${FileSystem.cacheDirectory || FileSystem.documentDirectory}piqle-gallery-${Date.now()}.jpg`
      const download = await FileSystem.downloadAsync(next.url, targetUri)
      await MediaLibrary.saveToLibraryAsync(download.uri)
      toast.success('Saved to your photos', 'Saved')
    } catch {
      toast.error('Could not save photo.')
    } finally {
      setSavingPreviewImage(false)
    }
  }, [previewImage, savingPreviewImage, toast])

  const closeViewer = useCallback((direction: -1 | 1 = 1, animated = true) => {
    lastViewerCloseAtRef.current = Date.now()
    if (!animated) {
      viewerTranslateY.setValue(0)
      setPreviewIndex(null)
      return
    }
    Animated.timing(viewerTranslateY, {
      toValue: 220 * direction,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      viewerTranslateY.setValue(0)
      setPreviewIndex(null)
    })
  }, [viewerTranslateY])

  const viewerPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx) && Math.abs(gestureState.dy) > 12,
        onMoveShouldSetPanResponderCapture: (_, gestureState) =>
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx) && Math.abs(gestureState.dy) > 12,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          setViewerPagerScrollEnabled(false)
        },
        onPanResponderMove: (_, gestureState) => {
          viewerTranslateY.setValue(gestureState.dy)
        },
        onPanResponderRelease: (_, gestureState) => {
          setViewerPagerScrollEnabled(true)
          if (Math.abs(gestureState.dy) > 120) {
            closeViewer(gestureState.dy < 0 ? -1 : 1)
            return
          }
          Animated.spring(viewerTranslateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 6,
          }).start()
        },
        onPanResponderTerminate: () => {
          setViewerPagerScrollEnabled(true)
          Animated.spring(viewerTranslateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 6,
          }).start()
        },
      }),
    [closeViewer, viewerTranslateY]
  )

  const handleOpenExternalLink = useCallback((url: string) => {
    Alert.alert(
      'Open external link?',
      'This link will open outside Piqle. External websites may be unsafe. Continue only if you trust the source.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open',
          onPress: async () => {
            try {
              const supported = await Linking.canOpenURL(url)
              if (!supported) {
                Alert.alert('Cannot open link', 'This link could not be opened on this device.')
                return
              }
              await Linking.openURL(url)
            } catch {
              Alert.alert('Cannot open link', 'This link could not be opened on this device.')
            }
          },
        },
      ]
    )
  }, [])

  const fileItems = useMemo(
    () =>
      messages
        .map((message) => {
          const file = parseFileMessageText(message.text)
          if (!file) return null
          return {
            id: message.id,
            url: file.url,
            fileName: file.fileName,
            mimeType: file.mimeType ?? null,
            size: file.size ?? null,
          }
        })
        .filter(Boolean) as {
        id: string
        url: string
        fileName: string
        mimeType: string | null
        size: number | null
      }[],
    [messages]
  )

  const linkItems = useMemo(
    () =>
      messages.flatMap((message) => {
        const messageText = String(message.text ?? '')
        if (
          parseImageMessageText(messageText) ||
          parseFileMessageText(messageText) ||
          messageText.startsWith('[loc]')
        ) {
          return []
        }
        const found: {
          id: string
          url: string
          label: string
          authorName: string
          createdAt: string
        }[] = []
        const regex = new RegExp(LINK_PATTERN.source, 'gi')
        let match: RegExpExecArray | null
        let index = 0
        while ((match = regex.exec(messageText)) !== null) {
          const label = String(match[1] || '')
          found.push({
            id: `${message.id}-${index}`,
            url: /^https?:\/\//i.test(label) ? label : `https://${label}`,
            label,
            authorName: message.user?.name || 'User',
            createdAt: message.createdAt,
          })
          index += 1
        }
        return found
      }),
    [messages]
  )

  return (
    <PageLayout
      topBarTitle={title}
      topBarRightSlot={null}
      scroll={false}
      contentStyle={styles.screen}
    >
      <View style={styles.tabRow}>
        <Pressable
          onPress={() => setActiveTab('media')}
          style={({ pressed }) => [
            styles.tabChip,
            activeTab === 'media' && styles.tabChipActive,
            pressed && styles.tabChipPressed,
          ]}
        >
          <Feather name="image" size={15} color={activeTab === 'media' ? colors.white : colors.textMuted} />
          <Text style={[styles.tabText, activeTab === 'media' && styles.tabTextActive]}>Media</Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab('files')}
          style={({ pressed }) => [
            styles.tabChip,
            activeTab === 'files' && styles.tabChipActive,
            pressed && styles.tabChipPressed,
          ]}
        >
          <Feather name="file-text" size={15} color={activeTab === 'files' ? colors.white : colors.textMuted} />
          <Text style={[styles.tabText, activeTab === 'files' && styles.tabTextActive]}>Files</Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab('links')}
          style={({ pressed }) => [
            styles.tabChip,
            activeTab === 'links' && styles.tabChipActive,
            pressed && styles.tabChipPressed,
          ]}
        >
          <Feather name="link" size={15} color={activeTab === 'links' ? colors.white : colors.textMuted} />
          <Text style={[styles.tabText, activeTab === 'links' && styles.tabTextActive]}>Links</Text>
        </Pressable>
      </View>

      {loading ? (
        <LoadingBlock label="Loading attachments…" />
      ) : error ? (
        <View style={styles.stateWrap}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : activeTab === 'media' ? (
        imageItems.length === 0 ? (
          <View style={styles.stateWrap}>
            <EmptyState title="No media yet" body="Photos shared in this chat will appear here." />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
            {imageRows.map((row, rowIndex) => (
              <View key={`row-${rowIndex}`} style={styles.gridRow}>
                {row.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => {
                      if (Date.now() - lastViewerCloseAtRef.current < 900) return
                      setPreviewIndex(imageItems.findIndex((candidate) => candidate.id === item.id))
                    }}
                    style={({ pressed }) => [styles.imageTile, pressed && styles.imageTilePressed]}
                  >
                    <Image source={{ uri: item.url }} style={styles.imageTileImage} resizeMode="cover" />
                  </Pressable>
                ))}
                {row.length < 3
                  ? Array.from({ length: 3 - row.length }).map((_, spacerIndex) => (
                      <View key={`spacer-${rowIndex}-${spacerIndex}`} style={styles.imageTileSpacer} />
                    ))
                  : null}
              </View>
            ))}
          </ScrollView>
        )
      ) : activeTab === 'files' ? fileItems.length === 0 ? (
        <View style={styles.stateWrap}>
          <EmptyState title="No files yet" body="Documents shared in this chat will appear here." />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.fileList} showsVerticalScrollIndicator={false}>
          {fileItems.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => {
                handleOpenExternalLink(item.url)
              }}
              style={({ pressed }) => [styles.fileCard, pressed && styles.fileCardPressed]}
            >
              <View style={styles.fileIconWrap}>
                <Feather name="file-text" size={18} color={colors.primary} />
              </View>
              <View style={styles.fileBody}>
                <Text style={styles.fileTitle} numberOfLines={1}>
                  {item.fileName}
                </Text>
                <Text style={styles.fileMeta} numberOfLines={1}>
                  {[item.mimeType, formatFileSize(item.size)].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      ) : linkItems.length === 0 ? (
        <View style={styles.stateWrap}>
          <EmptyState title="No links yet" body="Links shared in this chat will appear here." />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.fileList} showsVerticalScrollIndicator={false}>
          {linkItems.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => {
                void Linking.openURL(item.url)
              }}
              style={({ pressed }) => [styles.fileCard, pressed && styles.fileCardPressed]}
            >
              <View style={styles.fileIconWrap}>
                <Feather name="link-2" size={18} color={colors.primary} />
              </View>
              <View style={styles.fileBody}>
                <Text style={styles.fileTitle} numberOfLines={1}>
                  {item.label}
                </Text>
                <Text style={styles.fileMeta} numberOfLines={1}>
                  {`${item.authorName} · ${formatDate(new Date(item.createdAt)) || ''} ${formatChatTime(item.createdAt)}`.trim()}
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <Modal visible={previewIndex !== null} animationType="fade" presentationStyle="fullScreen" onRequestClose={() => closeViewer()}>
        <View style={styles.viewerBackdrop}>
          <View style={styles.viewerFrame}>
            <View style={styles.viewerTopBar}>
              <Pressable
                onPress={() => closeViewer(1, false)}
                style={({ pressed }) => [styles.viewerTopIcon, pressed && styles.viewerTopIconPressed]}
              >
                <Feather name="x" size={20} color="#fff" />
              </Pressable>
              <View style={styles.viewerMeta}>
                <Text style={styles.viewerAuthor} numberOfLines={1}>
                  {previewImage?.authorName || ''}
                </Text>
                <Text style={styles.viewerDate} numberOfLines={1}>
                  {previewImage ? `${formatDate(new Date(previewImage.createdAt)) || ''} ${formatChatTime(previewImage.createdAt)}`.trim() : ''}
                </Text>
                <Text style={styles.viewerCounter}>
                  {previewIndex !== null ? `${previewIndex + 1} / ${imageItems.length}` : ''}
                </Text>
              </View>
              <Pressable
                onPress={() => void handleSavePreviewImage()}
                style={({ pressed }) => [styles.viewerTopIcon, pressed && styles.viewerTopIconPressed]}
              >
                <Feather name={savingPreviewImage ? 'loader' : 'download'} size={20} color="#fff" />
              </Pressable>
            </View>

            <View style={styles.viewerImageFrame}>
              {previewImage ? (
                <View style={styles.viewerImageGestureLayer}>
                  <ScrollView
                    ref={viewerPagerRef}
                    horizontal
                    pagingEnabled
                    bounces={false}
                    disableScrollViewPanResponder
                    scrollEnabled={viewerPagerScrollEnabled}
                    showsHorizontalScrollIndicator={false}
                    style={styles.viewerPager}
                    onMomentumScrollEnd={(event) => {
                      const nextIndex = Math.round(event.nativeEvent.contentOffset.x / screenWidth)
                      if (nextIndex !== previewIndex && nextIndex >= 0 && nextIndex < imageItems.length) {
                        setPreviewIndex(nextIndex)
                      }
                    }}
                  >
                    {imageItems.map((item) => (
                      <View key={item.id} style={[styles.viewerPage, { width: screenWidth }]}>
                        <Animated.View
                          style={[styles.viewerPageImageWrap, previewIndex === imageItems.findIndex((candidate) => candidate.id === item.id) ? { transform: [{ translateY: viewerTranslateY }] } : null]}
                          {...viewerPanResponder.panHandlers}
                        >
                          <Image source={{ uri: item.url }} style={styles.viewerImage} resizeMode="contain" />
                        </Animated.View>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>
    </PageLayout>
  )
}

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
    screen: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: 0,
      gap: spacing.md,
      flex: 1,
    },
    tabRow: {
      flexDirection: 'row',
      gap: 10,
    },
    tabChip: {
      flex: 1,
      minHeight: 42,
      borderRadius: 999,
      paddingHorizontal: 10,
      gap: 6,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
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
    tabText: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '600',
      lineHeight: 16,
    },
    tabTextActive: {
      color: colors.white,
    },
    stateWrap: {
      flex: 1,
      justifyContent: 'center',
    },
    errorText: {
      color: colors.danger,
      fontSize: 14,
    },
    grid: {
      paddingBottom: spacing.xxl,
      gap: 8,
    },
    gridRow: {
      flexDirection: 'row',
      gap: 8,
    },
    imageTile: {
      flex: 1,
      aspectRatio: 1,
      borderRadius: 14,
      overflow: 'hidden',
      backgroundColor: colors.surfaceMuted,
    },
    imageTileSpacer: {
      flex: 1,
      aspectRatio: 1,
    },
    imageTilePressed: {
      opacity: 0.9,
    },
    imageTileImage: {
      width: '100%',
      height: '100%',
    },
    fileList: {
      gap: 10,
      paddingBottom: spacing.xxl,
    },
    fileCard: {
      borderRadius: 16,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 14,
    },
    fileCardPressed: {
      opacity: 0.84,
    },
    fileIconWrap: {
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primaryGhost,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.primaryBorder,
    },
    fileBody: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    fileTitle: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '700',
    },
    fileMeta: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 17,
    },
    viewerBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.97)',
    },
    viewerFrame: {
      flex: 1,
    },
    viewerTopBar: {
      paddingTop: 54,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    viewerTopIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.12)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.18)',
    },
    viewerTopIconPressed: {
      opacity: 0.82,
    },
    viewerMeta: {
      flex: 1,
      minWidth: 0,
      alignItems: 'center',
    },
    viewerCounter: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '700',
      marginTop: 4,
      textAlign: 'center',
    },
    viewerAuthor: {
      color: '#fff',
      fontSize: 15,
      fontWeight: '700',
      textAlign: 'center',
    },
    viewerDate: {
      color: 'rgba(255,255,255,0.72)',
      fontSize: 12,
      marginTop: 2,
      textAlign: 'center',
    },
    viewerImageFrame: {
      width: '100%',
      minHeight: 520,
      flex: 1,
    },
    viewerImageGestureLayer: {
      width: '100%',
      minHeight: 520,
      flex: 1,
    },
    viewerPager: {
      flex: 1,
    },
    viewerImage: {
      width: '100%',
      height: '100%',
    },
    viewerPage: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    viewerPageImageWrap: {
      width: '100%',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
    },
  })
