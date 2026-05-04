import { HowLongToBeat } from 'howlongtobeat-core'

export interface HltbData {
  mainStory: number | null
  mainExtra: number | null
  completionist: number | null
  searchUrl: string
}

const hltbClient = new HowLongToBeat({
  minimumSimilarity: 0.4,
  autoFilterTimes: true,
  similarityAlgorithm: 'gestalt',
})

interface CacheEntry {
  data: HltbData
  expiresAt: number
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const cache = new Map<string, CacheEntry>()

function normalizeKey(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function readCache(key: string): HltbData | null {
  const hit = cache.get(key)
  if (!hit) return null
  if (hit.expiresAt < Date.now()) {
    cache.delete(key)
    return null
  }
  return hit.data
}

function writeCache(key: string, data: HltbData): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS })
}

function roundOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : null
}

export async function getHltbData(title: string): Promise<HltbData> {
  const searchUrl = `https://howlongtobeat.com/?q=${encodeURIComponent(title)}`
  const empty: HltbData = { mainStory: null, mainExtra: null, completionist: null, searchUrl }

  if (!title) return empty

  const cacheKey = normalizeKey(title)
  const cached = readCache(cacheKey)
  if (cached) return cached

  try {
    const results = await hltbClient.search(title)
    if (!results || results.length === 0) {
      writeCache(cacheKey, empty)
      return empty
    }

    // Library already filters by minimumSimilarity; pick the highest-similarity hit.
    const best = [...results].sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))[0]
    if (!best) {
      writeCache(cacheKey, empty)
      return empty
    }

    const data: HltbData = {
      mainStory: roundOrNull(best.mainStory),
      mainExtra: roundOrNull(best.mainExtra),
      completionist: roundOrNull(best.completionist),
      searchUrl: best.gameWebLink || searchUrl,
    }

    writeCache(cacheKey, data)
    return data
  } catch {
    return empty
  }
}
