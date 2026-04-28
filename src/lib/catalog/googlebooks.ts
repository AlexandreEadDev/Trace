/**
 * Google Books — used exclusively for SEARCH (not trending).
 * Google Books has excellent search relevance; its trending/discovery
 * is poor (returns archives, academic texts, unknown content).
 * Trending is handled by Open Library's real-time popularity endpoint.
 */
import type { CatalogItem } from './types'

const BASE = 'https://www.googleapis.com/books/v1/volumes'

async function fetchSafe(url: string, ms = 8000): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { signal: controller.signal, cache: 'no-store' })
  } finally {
    clearTimeout(id)
  }
}

/**
 * Popularity score 0–100 blending Google Books user signals.
 * Used to sort search results so well-known books rise above obscure ones.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function bookPopularity(info: any): number {
  const cnt: number = typeof info?.ratingsCount === 'number' ? info.ratingsCount : 0
  const avg: number = typeof info?.averageRating === 'number' ? info.averageRating : 0
  const cntScore = Math.min(Math.log10(cnt + 1) / 5, 1) * 60
  const credibility = Math.min(cnt / 10, 1)
  const avgScore = (avg / 5) * 40 * credibility
  return Math.round(cntScore + avgScore)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function volumeToItem(v: any): CatalogItem | null {
  const info = v?.volumeInfo
  if (!info?.title) return null
  if (!Array.isArray(info.authors) || info.authors.length === 0) return null

  const cover = info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail ?? null
  if (!cover) return null

  const year = info.publishedDate
    ? Number.parseInt(String(info.publishedDate).slice(0, 4), 10)
    : null

  const coverUrl = cover
    .replace('http://', 'https://')
    .replace(/&zoom=\d/, '&zoom=2')
    .replace(/zoom=\d&/, 'zoom=2&')

  const genre = Array.isArray(info.categories) && info.categories.length > 0
    ? info.categories[0].split(' / ')[0]
    : null

  return {
    externalSource: 'googlebooks',
    externalId: String(v.id),
    title: info.title,
    type: 'book',
    genre,
    coverUrl,
    releaseYear: Number.isNaN(year) ? null : year,
    authors: info.authors as string[],
    popularityScore: bookPopularity(info),
  }
}

function normTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim()
}

function dedupeBooks(items: CatalogItem[]): CatalogItem[] {
  const seen = new Map<string, CatalogItem>()
  for (const item of items) {
    const author = (item.authors?.[0] ?? '').toLowerCase().slice(0, 20)
    const key = `${normTitle(item.title)}|${author}`
    if (!seen.has(key)) seen.set(key, item)
  }
  return Array.from(seen.values())
}

export interface PagedResult {
  items: CatalogItem[]
  hasMore: boolean
}

async function fetchVolumes(query: string, startIndex: number, maxResults: number, useFilter: boolean): Promise<{items: CatalogItem[], totalItems: number}> {
  const url = new URL(BASE)
  url.searchParams.set('q', query)
  url.searchParams.set('maxResults', String(maxResults))
  url.searchParams.set('startIndex', String(startIndex))
  url.searchParams.set('orderBy', 'relevance')
  url.searchParams.set('printType', 'books')
  if (useFilter) url.searchParams.set('filter', 'paid-ebooks')

  const res = await fetchSafe(url.toString())
  if (!res.ok) return { items: [], totalItems: 0 }
  const data = await res.json()
  const totalItems: number = typeof data.totalItems === 'number' ? data.totalItems : 0

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const volumes: any[] = data.items ?? []
  volumes.sort((a, b) => bookPopularity(b.volumeInfo) - bookPopularity(a.volumeInfo))
  const items = dedupeBooks(volumes.map(volumeToItem).filter(Boolean) as CatalogItem[])
  return { items, totalItems }
}

export async function searchBooks(query: string, limit = 24, page = 1): Promise<PagedResult> {
  const startIndex = (page - 1) * limit

  try {
    // Try paid-ebooks first (better quality); fall back without filter if too few results
    let { items, totalItems } = await fetchVolumes(query, startIndex, 40, true)

    if (items.length < Math.ceil(limit / 2)) {
      const fallback = await fetchVolumes(query, startIndex, 40, false)
      if (fallback.items.length > items.length) {
        items = fallback.items
        totalItems = fallback.totalItems
      }
    }

    const hasMore = startIndex + items.length < totalItems
    return { items: items.slice(0, limit), hasMore }
  } catch {
    return { items: [], hasMore: false }
  }
}

export async function getBookByExternalId(externalId: string): Promise<CatalogItem | null> {
  try {
    const res = await fetchSafe(`${BASE}/${encodeURIComponent(externalId)}`)
    if (!res.ok) return null
    const v = await res.json()
    return volumeToItem(v)
  } catch {
    return null
  }
}
