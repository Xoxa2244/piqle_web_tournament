import { type Tournament } from '../data/mockData'
import { type DataSource, type TournamentFeedFormat, type TournamentFeedPolicy, type TournamentFeedScope } from './mobileData'

const FEED_CACHE_TTL_MS = 5 * 60 * 1000

type TournamentFeedCacheKeyInput = {
  searchQuery: string
  policy: TournamentFeedPolicy
  format: TournamentFeedFormat
  scope: TournamentFeedScope
}

type TournamentFeedCacheEntry = {
  key: string
  items: Tournament[]
  nextCursor: string | null
  totalCount: number
  dataSource: DataSource
  updatedAt: number
}

const feedCache = new Map<string, TournamentFeedCacheEntry>()

export function buildTournamentFeedCacheKey(input: TournamentFeedCacheKeyInput) {
  return [
    `q=${input.searchQuery.trim().toLowerCase()}`,
    `p=${input.policy}`,
    `f=${input.format}`,
    `s=${input.scope}`,
  ].join('|')
}

export function getTournamentFeedCacheEntry(key: string): TournamentFeedCacheEntry | null {
  const cached = feedCache.get(key)
  if (!cached) return null

  if (Date.now() - cached.updatedAt > FEED_CACHE_TTL_MS) {
    feedCache.delete(key)
    return null
  }

  return cached
}

export function setTournamentFeedCacheEntry(
  key: string,
  payload: Omit<TournamentFeedCacheEntry, 'key' | 'updatedAt'>
) {
  feedCache.set(key, {
    key,
    updatedAt: Date.now(),
    ...payload,
  })
}

export function clearTournamentFeedCache() {
  feedCache.clear()
}
