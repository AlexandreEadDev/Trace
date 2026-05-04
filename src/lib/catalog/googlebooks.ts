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

  // Flatten "Fiction / Fantasy" → ["Fiction", "Fantasy"] for richer genre matching
  const rawCategories: string[] = Array.isArray(info.categories) ? info.categories : []
  const genres: string[] = [...new Set(
    rawCategories.flatMap((c: string) => c.split(' / ').map((s: string) => s.trim()))
  )].filter(Boolean)
  const genre = genres[0] ?? null

  const description: string | null =
    typeof info.description === 'string' ? info.description : null

  return {
    externalSource: 'googlebooks',
    externalId: String(v.id),
    title: info.title,
    type: 'book',
    genre,
    genres: genres.length > 0 ? genres : undefined,
    coverUrl,
    releaseYear: Number.isNaN(year) ? null : year,
    authors: info.authors as string[],
    popularityScore: bookPopularity(info),
    description,
  }
}

function normalizeQuery(q: string): string {
  return q.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
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

/** Book genre label → Google Books subject term */
const GOOGLE_GENRE_MAP: Record<string, string> = {
  'Roman': 'fiction',
  'Fantasy': 'fantasy',
  'Science-Fiction': 'science+fiction',
  'Thriller / Policier': 'thriller',
  'Romance': 'romance',
  'Biographie': 'biography',
  'Histoire': 'history',
  'Horreur': 'horror',
  'Jeunesse': 'juvenile',
  'Humour': 'humor',
}

export interface PagedResult {
  items: CatalogItem[]
  hasMore: boolean
}

async function fetchVolumes(query: string, startIndex: number, maxResults: number, useFilter: boolean, keepGoogleOrder = false): Promise<{items: CatalogItem[], totalItems: number}> {
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
  // For search queries, preserve Google's relevance ordering.
  // Only sort by popularity for the no-query trending fallback.
  if (!keepGoogleOrder) {
    // Stable sort: popularity desc, then volume id ascending lex as tie-breaker.
    volumes.sort((a, b) => {
      const diff = bookPopularity(b.volumeInfo) - bookPopularity(a.volumeInfo)
      if (diff !== 0) return diff
      const idA = typeof a.id === 'string' ? a.id : ''
      const idB = typeof b.id === 'string' ? b.id : ''
      return idA.localeCompare(idB)
    })
  }
  const items = dedupeBooks(volumes.map(volumeToItem).filter(Boolean) as CatalogItem[])
  return { items, totalItems }
}

export async function searchBooks(query: string, limit = 24, page = 1, genre?: string): Promise<PagedResult> {
  const startIndex = (page - 1) * limit
  const normalizedQuery = normalizeQuery(query)
  const isSearch = normalizedQuery.trim().length > 0

  // Build the effective query: combine user query with subject filter
  let effectiveQuery = normalizedQuery
  if (genre) {
    const subject = GOOGLE_GENRE_MAP[genre]
    if (subject) {
      effectiveQuery = normalizedQuery
        ? `${normalizedQuery}+subject:${subject}`
        : `subject:${subject}`
    }
  }

  try {
    const finalQuery = effectiveQuery || 'popular fiction'
    const keepOrder = isSearch
    let { items, totalItems } = await fetchVolumes(finalQuery, startIndex, 40, true, keepOrder)

    if (items.length < Math.ceil(limit / 2)) {
      const fallback = await fetchVolumes(finalQuery, startIndex, 40, false, keepOrder)
      if (fallback.items.length > items.length) {
        items = fallback.items
        totalItems = fallback.totalItems
      }
    }

    // After dedupe we may have fewer than `limit` items. Pad with a second page
    // so the catalog always shows exactly 24 cards when results exist upstream.
    if (items.length < limit && startIndex + 40 < totalItems) {
      const extra = await fetchVolumes(finalQuery, startIndex + 40, 40, true, keepOrder)
      const seen = new Set(items.map((it) => `${normTitle(it.title)}|${(it.authors?.[0] ?? '').toLowerCase().slice(0, 20)}`))
      for (const it of extra.items) {
        const key = `${normTitle(it.title)}|${(it.authors?.[0] ?? '').toLowerCase().slice(0, 20)}`
        if (!seen.has(key)) {
          items.push(it)
          seen.add(key)
        }
        if (items.length >= limit) break
      }
    }

    const hasMore = startIndex + items.length < totalItems
    return { items: items.slice(0, limit), hasMore }
  } catch {
    return { items: [], hasMore: false }
  }
}

/**
 * Hybrid resolver: given a book identified by OpenLibrary (title + optional authors/year),
 * find the best matching Google Books volume so we can leverage GB's richer metadata
 * (description, categories, seriesInfo) for the detail page and recommendations.
 *
 * Returns null if no acceptable match is found. The caller should keep the original
 * OpenLibrary externalSource/externalId for persistence; only the metadata is merged.
 */
export async function findBookByTitleAuthor(
  title: string,
  authors?: string[] | null,
  year?: number | null,
): Promise<CatalogItem | null> {
  if (!title) return null

  const normalizedTitle = normalizeQuery(title)
  const firstAuthor = authors?.[0] ?? ''
  const authorLastName = firstAuthor.split(' ').pop() ?? firstAuthor

  const parts: string[] = [`intitle:"${normalizedTitle}"`]
  if (authorLastName) parts.push(`inauthor:"${authorLastName}"`)

  try {
    const url = new URL(BASE)
    url.searchParams.set('q', parts.join(' '))
    url.searchParams.set('maxResults', '10')
    url.searchParams.set('orderBy', 'relevance')
    url.searchParams.set('printType', 'books')

    const res = await fetchSafe(url.toString())
    if (!res.ok) return null
    const data = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const volumes: any[] = data.items ?? []
    const candidates = volumes.map(volumeToItem).filter(Boolean) as CatalogItem[]

    if (candidates.length === 0) return null

    const targetTitle = normTitle(title)
    const yearTarget = year ?? null

    // Score each candidate: title match (high weight) + year proximity + popularity
    const scored = candidates.map((c) => {
      const tNorm = normTitle(c.title)
      let titleScore = 0
      if (tNorm === targetTitle) titleScore = 100
      else if (tNorm.includes(targetTitle) || targetTitle.includes(tNorm)) titleScore = 60
      else {
        const overlap = tNorm.split(' ').filter((w) => w.length > 2 && targetTitle.includes(w)).length
        titleScore = Math.min(overlap * 15, 50)
      }

      let yearScore = 0
      if (yearTarget && c.releaseYear) {
        const diff = Math.abs(c.releaseYear - yearTarget)
        yearScore = diff <= 1 ? 20 : diff <= 5 ? 10 : 0
      }

      const popScore = (c.popularityScore ?? 0) * 0.2
      return { item: c, score: titleScore + yearScore + popScore }
    })

    scored.sort((a, b) => b.score - a.score)
    const best = scored[0]
    // Reject very poor matches (avoid returning the wrong book)
    if (best.score < 20) return null
    return best.item
  } catch {
    return null
  }
}

/**
 * Fetch the rich Google Books detail (with seriesInfo) for a known volume id.
 * Used after findBookByTitleAuthor so we get the same fields as a direct GB landing.
 */
export async function getBookDetailById(volumeId: string): Promise<CatalogItem | null> {
  return getBookByExternalId(volumeId)
}

export async function getBookByExternalId(externalId: string): Promise<CatalogItem | null> {
  try {
    const res = await fetchSafe(`${BASE}/${encodeURIComponent(externalId)}`)
    if (!res.ok) return null
    const v = await res.json()

    const item = volumeToItem(v)
    if (!item) return null

    // Extract Google Books series info if available
    const seriesInfo = v.volumeInfo?.seriesInfo
    const volumeSeries = Array.isArray(seriesInfo?.volumeSeries) && seriesInfo.volumeSeries.length > 0
      ? seriesInfo.volumeSeries[0]
      : null

    const seriesId: string | null = volumeSeries?.seriesId ?? null
    const seriesTitle: string | null = volumeSeries?.shortSeriesBookTitle ?? null

    return { ...item, seriesId, seriesTitle }
  } catch {
    return null
  }
}

/**
 * Fetch books by the same author in the same genre/subject.
 */
export async function getSimilarBooks(authors?: string[], genre?: string | null): Promise<CatalogItem[]> {
  try {
    const firstAuthor = authors?.[0] ?? ''
    if (!firstAuthor && !genre) return []

    const parts: string[] = []
    if (firstAuthor) parts.push(`inauthor:"${firstAuthor.split(' ').pop() ?? firstAuthor}"`)
    if (genre) parts.push(`subject:"${genre}"`)

    const url = new URL(BASE)
    url.searchParams.set('q', parts.join(' '))
    url.searchParams.set('maxResults', '20')
    url.searchParams.set('orderBy', 'relevance')
    url.searchParams.set('printType', 'books')

    const res = await fetchSafe(url.toString())
    if (!res.ok) return []
    const data = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const volumes: any[] = data.items ?? []
    return dedupeBooks(
      volumes.map(volumeToItem).filter(Boolean) as CatalogItem[]
    ).slice(0, 12)
  } catch {
    return []
  }
}

/**
 * Fetch other books in the same series.
 * Uses seriesTitle + author for targeted search, falls back to title keyword inference.
 */
export async function getBookSeries(
  seriesId: string | null | undefined,
  title: string,
  authors?: string[],
  seriesTitle?: string | null,
): Promise<CatalogItem[]> {
  try {
    let query: string

    // Derive first author's last name for inauthor: constraint
    const firstAuthor = authors?.[0] ?? ''
    const authorLastName = firstAuthor.split(' ').pop() ?? firstAuthor

    if (seriesTitle && seriesTitle.length >= 3) {
      // Most precise: known series title + author
      query = authorLastName
        ? `"${seriesTitle}" inauthor:"${authorLastName}"`
        : `"${seriesTitle}"`
    } else if (seriesId) {
      // Google seriesId lookup
      query = `seriesid:${seriesId}`
    } else {
      // Infer series name: strip trailing volume markers like "1", "#1", "Book 1", "Vol. 1"
      const inferredSeries = title
        .replace(/[,:]?\s*(book|vol\.?|tome|#|part|episode|volume)?\s*\d+\s*$/i, '')
        .trim()
      if (inferredSeries.length < 3) return []
      // Extract first 3 significant words (skip articles/prepositions)
      const stopWords = new Set(['the', 'a', 'an', 'of', 'and', 'le', 'la', 'les', 'de', 'du', 'des', 'et'])
      const sigWords = inferredSeries
        .split(/\s+/)
        .filter((w) => w.length > 2 && !stopWords.has(w.toLowerCase()))
        .slice(0, 3)
        .join(' ')
      const searchTerm = sigWords.length >= 3 ? sigWords : inferredSeries
      query = authorLastName
        ? `intitle:"${searchTerm}" inauthor:"${authorLastName}"`
        : `intitle:"${searchTerm}"`
    }

    const url = new URL(BASE)
    url.searchParams.set('q', query)
    url.searchParams.set('maxResults', '20')
    url.searchParams.set('orderBy', 'relevance')
    url.searchParams.set('printType', 'books')

    const res = await fetchSafe(url.toString())
    if (!res.ok) return []
    const data = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const volumes: any[] = data.items ?? []
    return dedupeBooks(
      volumes.map(volumeToItem).filter(Boolean) as CatalogItem[]
    ).slice(0, 12)
  } catch {
    return []
  }
}
