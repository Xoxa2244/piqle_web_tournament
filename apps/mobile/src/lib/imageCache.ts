import * as FileSystem from 'expo-file-system/legacy'

const memoryCache = new Map<string, string>()
const inflight = new Map<string, Promise<string>>()

const hashString = (value: string) => {
  let hash = 5381
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index)
  }
  return Math.abs(hash >>> 0).toString(36)
}

const guessExtension = (url: string) => {
  const cleaned = url.split('?')[0]?.split('#')[0] || ''
  const match = cleaned.match(/\.([a-zA-Z0-9]{2,5})$/)
  const ext = match?.[1]?.toLowerCase()
  if (!ext) return 'jpg'
  if (ext === 'jpeg') return 'jpg'
  if (ext === 'webp' || ext === 'png' || ext === 'jpg' || ext === 'gif' || ext === 'heic') return ext
  return 'jpg'
}

const getTargetUri = (url: string) => {
  const base = FileSystem.cacheDirectory || FileSystem.documentDirectory || ''
  return `${base}piqle-chat-image-${hashString(url)}.${guessExtension(url)}`
}

export async function getCachedImageUri(url: string): Promise<string> {
  if (!url) return url
  const cached = memoryCache.get(url)
  if (cached) return cached

  const currentInflight = inflight.get(url)
  if (currentInflight) return currentInflight

  const task = (async () => {
    const targetUri = getTargetUri(url)
    try {
      const info = await FileSystem.getInfoAsync(targetUri)
      if (info.exists) {
        memoryCache.set(url, targetUri)
        return targetUri
      }
      const result = await FileSystem.downloadAsync(url, targetUri)
      memoryCache.set(url, result.uri)
      return result.uri
    } catch {
      return url
    } finally {
      inflight.delete(url)
    }
  })()

  inflight.set(url, task)
  return task
}

export async function warmImageCache(urls: string[]) {
  await Promise.all(
    urls.filter(Boolean).map(async (url) => {
      try {
        await getCachedImageUri(url)
      } catch {
        // ignore cache warm failures
      }
    })
  )
}
