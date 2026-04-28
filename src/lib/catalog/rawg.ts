import type { CatalogItem } from './types'

const BASE = 'https://api.rawg.io/api'

function getKey(): string | null {
  return process.env.RAWG_API_KEY ?? null
}

async function fetchSafe(url: string, ms = 10000): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { signal: controller.signal, cache: 'no-store' })
  } finally {
    clearTimeout(id)
  }
}

/**
 * Popularity score 0–100 blending three RAWG signals:
 *  - added   → log-scale "how many users added this game" (max 40 pts)
 *  - metacritic → critic consensus              (max 40 pts)
 *  - rating  → RAWG community score 0–5        (max 20 pts)
 *
 * A AAA title (MC 95, 1M added, 4.5★) scores ~93.
 * An unknown indie (no MC, 50 added, 2★) scores ~9.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function gamePopularity(game: any): number {
  const added: number = typeof game.added === 'number' ? game.added : 0
  const mc: number = typeof game.metacritic === 'number' ? game.metacritic : 0
  const rating: number = typeof game.rating === 'number' ? game.rating : 0
  const ratingCount: number = typeof game.ratings_count === 'number' ? game.ratings_count : 0

  // added: log10(1 000 000) = 6 → normalise to [0,1] then × 40
  const addedScore = Math.min(Math.log10(added + 1) / 6, 1) * 40
  // Metacritic 0–100 → [0,40]
  const mcScore = (mc / 100) * 40
  // RAWG rating 0–5 → [0,20], but only if enough ratings exist
  const ratingScore = ratingCount >= 5 ? (rating / 5) * 20 : (rating / 5) * 8
  return Math.round(addedScore + mcScore + ratingScore)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function gameToItem(game: any): CatalogItem {
  const year = game.released
    ? Number.parseInt(String(game.released).slice(0, 4), 10)
    : null
  const genre =
    Array.isArray(game.genres) && game.genres.length > 0
      ? game.genres[0].name
      : null
  return {
    externalSource: 'rawg',
    externalId: String(game.id),
    title: game.name,
    type: 'game',
    genre,
    coverUrl: game.background_image ?? null,
    releaseYear: Number.isNaN(year as number) ? null : year,
    durationMinutes: null,
    metacritic: typeof game.metacritic === 'number' ? game.metacritic : null,
    popularityScore: gamePopularity(game),
  }
}

/** Minimum quality gate for search results – filters near-unknown games */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isQualityGame(game: any): boolean {
  const added: number = typeof game.added === 'number' ? game.added : 0
  const ratingCount: number = typeof game.ratings_count === 'number' ? game.ratings_count : 0
  const hasMeta = typeof game.metacritic === 'number' && game.metacritic > 0
  // Pass if: well-known (added > 200), has meaningful ratings, or has Metacritic score
  return added > 200 || ratingCount >= 5 || hasMeta
}

export interface PagedResult {
  items: CatalogItem[]
  hasMore: boolean
}

export async function getTrendingGames(limit = 24, page = 1): Promise<PagedResult> {
  const key = getKey()
  if (!key) return { items: [], hasMore: false }

  try {
    const url = new URL(`${BASE}/games`)
    url.searchParams.set('key', key)
    url.searchParams.set('page_size', String(limit))
    url.searchParams.set('page', String(page))
    url.searchParams.set('ordering', '-added')
    url.searchParams.set('metacritic', '60,100')
    url.searchParams.set('fields', 'id,name,background_image,released,genres,metacritic,rating,ratings_count,added')

    const res = await fetchSafe(url.toString())
    if (!res.ok) return { items: [], hasMore: false }
    const data = await res.json()
    const items = (data.results ?? []).map(gameToItem)
    const hasMore = data.next !== null && data.next !== undefined
    return { items, hasMore }
  } catch {
    return { items: [], hasMore: false }
  }
}

export async function searchGames(query: string, limit = 24, page = 1): Promise<PagedResult> {
  const key = getKey()
  if (!key) return { items: [], hasMore: false }

  try {
    const url = new URL(`${BASE}/games`)
    url.searchParams.set('key', key)
    url.searchParams.set('search', query)
    url.searchParams.set('page_size', String(Math.min(limit * 2, 40)))
    url.searchParams.set('page', String(page))
    url.searchParams.set('search_precise', 'false')
    url.searchParams.set('ordering', '-added')

    const res = await fetchSafe(url.toString())
    if (!res.ok) return { items: [], hasMore: false }
    const data = await res.json()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const all: any[] = data.results ?? []
    const quality = all.filter(isQualityGame)
    const pool = quality.length >= Math.ceil(limit / 2) ? quality : all
    pool.sort((a, b) => gamePopularity(b) - gamePopularity(a))
    const hasMore = data.next !== null && data.next !== undefined
    return { items: pool.slice(0, limit).map(gameToItem), hasMore }
  } catch {
    return { items: [], hasMore: false }
  }
}

export async function getGameByExternalId(externalId: string): Promise<CatalogItem | null> {
  const key = getKey()
  if (!key) return null

  try {
    const res = await fetchSafe(`${BASE}/games/${externalId}?key=${key}`)
    if (!res.ok) return null
    const game = await res.json()
    return gameToItem(game)
  } catch {
    return null
  }
}

export function hasRawgKey(): boolean {
  return Boolean(process.env.RAWG_API_KEY)
}
