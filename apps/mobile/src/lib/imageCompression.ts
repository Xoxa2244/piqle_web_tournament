import * as FileSystem from 'expo-file-system/legacy'

export const CHAT_IMAGE_MAX_BYTES = 1_500_000
export const CHAT_IMAGE_MAX_DIMENSION = 1600
export const CHAT_IMAGE_QUALITY_STEPS = [0.82, 0.72, 0.62, 0.52, 0.42]

export type CompressibleImageAsset = {
  uri: string
  fileName?: string | null
  mimeType?: string | null
  width?: number
  height?: number
}

async function getFileSize(uri: string) {
  try {
    const info = await FileSystem.getInfoAsync(uri)
    return Number(info.exists ? info.size ?? 0 : 0)
  } catch {
    return 0
  }
}

export async function compressImageLikeChat(asset: CompressibleImageAsset) {
  let manipulateAsync: ((uri: string, actions?: any[], saveOptions?: any) => Promise<any>) | null = null
  let saveFormatJpeg: string | null = null

  try {
    // expo-image-manipulator is present at runtime in the Expo app, but the mobile TS build
    // in this repo does not always resolve its module typings cleanly.
    // @ts-ignore
    const imageManipulator = await import('expo-image-manipulator')
    manipulateAsync = imageManipulator.manipulateAsync
    saveFormatJpeg = imageManipulator.SaveFormat.JPEG
  } catch {
    manipulateAsync = null
    saveFormatJpeg = null
  }

  const originalWidth = Number(asset.width ?? 0)
  const originalHeight = Number(asset.height ?? 0)
  const originalSize = await getFileSize(asset.uri)
  const maxDimension = Math.max(originalWidth, originalHeight)
  const needsResize = maxDimension > CHAT_IMAGE_MAX_DIMENSION
  const mimeType = String(asset.mimeType ?? '').toLowerCase()
  const needsFormatChange = mimeType !== 'image/jpeg' && mimeType !== 'image/jpg'

  if (!manipulateAsync || !saveFormatJpeg) {
    return {
      uri: asset.uri,
      fileName: asset.fileName,
      mimeType: asset.mimeType || 'image/jpeg',
      width: asset.width ?? null,
      height: asset.height ?? null,
      size: originalSize,
    }
  }

  if (!needsResize && !needsFormatChange && originalSize > 0 && originalSize <= CHAT_IMAGE_MAX_BYTES) {
    return {
      uri: asset.uri,
      fileName: asset.fileName,
      mimeType: asset.mimeType || 'image/jpeg',
      width: asset.width ?? null,
      height: asset.height ?? null,
      size: originalSize,
    }
  }

  const resizeAction =
    needsResize && originalWidth > 0 && originalHeight > 0
      ? [
          {
            resize:
              originalWidth >= originalHeight
                ? { width: CHAT_IMAGE_MAX_DIMENSION }
                : { height: CHAT_IMAGE_MAX_DIMENSION },
          } as const,
        ]
      : []

  let lastResult: {
    uri: string
    width: number | null
    height: number | null
    size: number
  } | null = null

  for (const quality of CHAT_IMAGE_QUALITY_STEPS) {
    const result = await manipulateAsync(asset.uri, resizeAction, {
      compress: quality,
      format: saveFormatJpeg,
    })
    const size = await getFileSize(result.uri)
    lastResult = {
      uri: result.uri,
      width: result.width ?? null,
      height: result.height ?? null,
      size,
    }
    if (size > 0 && size <= CHAT_IMAGE_MAX_BYTES) break
  }

  return {
    uri: lastResult?.uri ?? asset.uri,
    fileName: (asset.fileName || `image-${Date.now()}`).replace(/\.[^.]+$/, '.jpg'),
    mimeType: 'image/jpeg',
    width: lastResult?.width ?? asset.width ?? null,
    height: lastResult?.height ?? asset.height ?? null,
    size: lastResult?.size ?? originalSize,
  }
}
