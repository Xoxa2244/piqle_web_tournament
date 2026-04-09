import { Platform } from 'react-native'

const LOCATION_MESSAGE_PREFIX = '__piqle_location__:'

export type ChatLocationMessagePayload = {
  latitude: number
  longitude: number
  title: string
  address?: string | null
}

function roundCoord(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
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

export function getChatSpecialPreviewText(text: string | null | undefined): string | null {
  const location = parseLocationMessageText(text)
  if (!location) return null
  return `Shared a location${location.title ? `: ${location.title}` : ''}`
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
