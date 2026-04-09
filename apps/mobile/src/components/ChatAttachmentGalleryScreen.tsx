import { Feather } from '@expo/vector-icons'
import { useMemo, useState } from 'react'
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import type { ChatMessage } from '../lib/chatMessages'
import { formatFileSize, parseFileMessageText, parseImageMessageText } from '../lib/chatSpecialMessages'
import { spacing, type ThemePalette } from '../lib/theme'
import { useAppTheme } from '../providers/ThemeProvider'
import { AppBottomSheet, AppConfirmActions } from './AppBottomSheet'
import { EmptyState } from './EmptyState'
import { LoadingBlock } from './LoadingBlock'
import { PageLayout } from './navigation/PageLayout'

type GalleryTab = 'media' | 'files'

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
  const styles = useMemo(() => createStyles(colors), [colors])
  const [activeTab, setActiveTab] = useState<GalleryTab>('media')
  const [previewImage, setPreviewImage] = useState<{
    url: string
    fileName: string
    size: number | null
  } | null>(null)

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
          }
        })
        .filter(Boolean) as { id: string; url: string; fileName: string; size: number | null }[],
    [messages]
  )

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
          <Text style={[styles.tabText, activeTab === 'files' && styles.tabTextActive]}>Files</Text>
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
            {imageItems.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => setPreviewImage(item)}
                style={({ pressed }) => [styles.imageTile, pressed && styles.imageTilePressed]}
              >
                <Image source={{ uri: item.url }} style={styles.imageTileImage} resizeMode="cover" />
              </Pressable>
            ))}
          </ScrollView>
        )
      ) : fileItems.length === 0 ? (
        <View style={styles.stateWrap}>
          <EmptyState title="No files yet" body="Documents shared in this chat will appear here." />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.fileList} showsVerticalScrollIndicator={false}>
          {fileItems.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => {
                void Linking.openURL(item.url)
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
      )}

      <AppBottomSheet
        open={Boolean(previewImage)}
        onClose={() => setPreviewImage(null)}
        title={previewImage?.fileName || 'Photo'}
        subtitle={previewImage ? formatFileSize(previewImage.size) || 'Shared photo' : undefined}
        bottomPaddingExtra={8}
        footer={
          previewImage ? (
            <AppConfirmActions
              intent="positive"
              cancelLabel="Close"
              confirmLabel="Open"
              onCancel={() => setPreviewImage(null)}
              onConfirm={() => {
                const next = previewImage
                if (!next) return
                void Linking.openURL(next.url).finally(() => setPreviewImage(null))
              }}
            />
          ) : null
        }
      >
        {previewImage ? (
          <View style={styles.previewWrap}>
            <Image source={{ uri: previewImage.url }} style={styles.previewImage} resizeMode="contain" />
          </View>
        ) : null}
      </AppBottomSheet>
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
      minHeight: 40,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
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
    tabText: {
      color: colors.textMuted,
      fontSize: 13,
      fontWeight: '600',
    },
    tabTextActive: {
      color: colors.primary,
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
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      paddingBottom: spacing.xxl,
    },
    imageTile: {
      width: '31%',
      aspectRatio: 1,
      borderRadius: 14,
      overflow: 'hidden',
      backgroundColor: colors.surfaceMuted,
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
    previewWrap: {
      height: 440,
      borderRadius: 18,
      overflow: 'hidden',
      backgroundColor: colors.surfaceMuted,
      marginBottom: spacing.sm,
    },
    previewImage: {
      width: '100%',
      height: '100%',
    },
  })
