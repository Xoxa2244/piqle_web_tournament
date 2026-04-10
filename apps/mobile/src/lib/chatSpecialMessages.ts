import { Platform } from 'react-native'

const LOCATION_MESSAGE_PREFIX = '__piqle_location__:'
const IMAGE_MESSAGE_PREFIX = '__piqle_image__:'
const FILE_MESSAGE_PREFIX = '__piqle_file__:'

export type ChatLocationMessagePayload = {
  latitude: number
  longitude: number
  title: string
  address?: string | null
}

export type ChatImageMessagePayload = {
  url: string
  fileName?: string | null
  mimeType?: string | null
  width?: number | null
  height?: number | null
  size?: number | null
}

export type ChatFileMessagePayload = {
  url: string
  fileName: string
  mimeType?: string | null
  size?: number | null
}

function roundCoord(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

function decodeFileName(value: string | null | undefined, fallback: string): string {
  const raw = String(value ?? '').trim()
  if (!raw) return fallback
  try {
    return decodeURIComponent(raw) || fallback
  } catch {
    return raw || fallback
  }
}

export function buildLocationMessageText(payload: ChatLocationMessagePayload): string {
  const normalized = {
    latitude: roundCoord(payload.latitude),
    longitude: roundCoord(payload.longitude),
    title: String(payload.title ?? '').trim() || 'Pinned location',
    address: String(payload.address ?? '').trim() || null,
  }
  return `${LOCATION_MESSAGE_PREFIX}${encodeURIComponent(JSON.stringify(normalized))}`
}

export function buildImageMessageText(payload: ChatImageMessagePayload): string {
  const normalized = {
    url: String(payload.url ?? '').trim(),
    fileName: decodeFileName(payload.fileName, 'Photo'),
    mimeType: String(payload.mimeType ?? '').trim() || 'image/jpeg',
    width: Number.isFinite(Number(payload.width)) ? Number(payload.width) : null,
    height: Number.isFinite(Number(payload.height)) ? Number(payload.height) : null,
    size: Number.isFinite(Number(payload.size)) ? Number(payload.size) : null,
  }
  return `${IMAGE_MESSAGE_PREFIX}${encodeURIComponent(JSON.stringify(normalized))}`
}

export function buildFileMessageText(payload: ChatFileMessagePayload): string {
  const normalized = {
    url: String(payload.url ?? '').trim(),
    fileName: decodeFileName(payload.fileName, 'File'),
    mimeType: String(payload.mimeType ?? '').trim() || 'application/octet-stream',
    size: Number.isFinite(Number(payload.size)) ? Number(payload.size) : null,
  }
  return `${FILE_MESSAGE_PREFIX}${encodeURIComponent(JSON.stringify(normalized))}`
}

export function parseLocationMessageText(text: string | null | undefined): ChatLocationMessagePayload | null {
  const raw = String(text ?? '')
  if (!raw.startsWith(LOCATION_MESSAGE_PREFIX)) return null
  try {
    const json = decodeURIComponent(raw.slice(LOCATION_MESSAGE_PREFIX.length))
    const parsed = JSON.parse(json) as Partial<ChatLocationMessagePayload>
    const latitude = Number(parsed.latitude)
    const longitude = Number(parsed.longitude)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
    const title = String(parsed.title ?? '').trim() || 'Pinned location'
    const address = String(parsed.address ?? '').trim() || null
    return { latitude, longitude, title, address }
  } catch {
    return null
  }
}

export function parseImageMessageText(text: string | null | undefined): ChatImageMessagePayload | null {
  const raw = String(text ?? '')
  if (!raw.startsWith(IMAGE_MESSAGE_PREFIX)) return null
  try {
    const json = decodeURIComponent(raw.slice(IMAGE_MESSAGE_PREFIX.length))
    const parsed = JSON.parse(json) as Partial<ChatImageMessagePayload>
    const url = String(parsed.url ?? '').trim()
    if (!url) return null
    return {
      url,
      fileName: decodeFileName(parsed.fileName, 'Photo'),
      mimeType: String(parsed.mimeType ?? '').trim() || 'image/jpeg',
      width: Number.isFinite(Number(parsed.width)) ? Number(parsed.width) : null,
      height: Number.isFinite(Number(parsed.height)) ? Number(parsed.height) : null,
      size: Number.isFinite(Number(parsed.size)) ? Number(parsed.size) : null,
    }
  } catch {
    return null
  }
}

export function parseFileMessageText(text: string | null | undefined): ChatFileMessagePayload | null {
  const raw = String(text ?? '')
  if (!raw.startsWith(FILE_MESSAGE_PREFIX)) return null
  try {
    const json = decodeURIComponent(raw.slice(FILE_MESSAGE_PREFIX.length))
    const parsed = JSON.parse(json) as Partial<ChatFileMessagePayload>
    const url = String(parsed.url ?? '').trim()
    if (!url) return null
    return {
      url,
      fileName: decodeFileName(parsed.fileName, 'File'),
      mimeType: String(parsed.mimeType ?? '').trim() || 'application/octet-stream',
      size: Number.isFinite(Number(parsed.size)) ? Number(parsed.size) : null,
    }
  } catch {
    return null
  }
}

export function getChatSpecialPreviewText(text: string | null | undefined): string | null {
  const location = parseLocationMessageText(text)
  if (location) return `Shared a location${location.title ? `: ${location.title}` : ''}`
  const image = parseImageMessageText(text)
  if (image) return 'Shared a photo'
  const file = parseFileMessageText(text)
  if (file) return `Shared a file: ${file.fileName}`
  return null
}

export function getLocationStaticMapUrl(location: ChatLocationMessagePayload): string {
  const lat = roundCoord(location.latitude)
  const lng = roundCoord(location.longitude)
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=15&size=600x300&maptype=mapnik&markers=${lat},${lng},red-pushpin`
}

export function getExternalLocationUrl(location: ChatLocationMessagePayload): string {
  const lat = roundCoord(location.latitude)
  const lng = roundCoord(location.longitude)
  const label = encodeURIComponent(location.title || 'Pinned location')
  if (Platform.OS === 'ios') {
    return `http://maps.apple.com/?ll=${lat},${lng}&q=${label}`
  }
  return `geo:${lat},${lng}?q=${lat},${lng}(${label})`
}

export function isChatSpecialMessageText(text: string | null | undefined): boolean {
  const raw = String(text ?? '')
  return (
    raw.startsWith(LOCATION_MESSAGE_PREFIX) ||
    raw.startsWith(IMAGE_MESSAGE_PREFIX) ||
    raw.startsWith(FILE_MESSAGE_PREFIX)
  )
}

export function formatFileSize(bytes: number | null | undefined): string | null {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value <= 0) return null
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)} MB`
  if (value >= 1024) return `${Math.round(value / 1024)} KB`
  return `${Math.round(value)} B`
}
