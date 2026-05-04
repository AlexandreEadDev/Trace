import { unstable_cache } from 'next/cache'
import type { CatalogItem } from './types'

const OL = 'https://openlibrary.org'
const COVERS = 'https://covers.openlibrary.org/b/id'

async function fetchSafe(url: string, ms = 5000): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { signal: controller.signal, cache: 'no-store' })
  } finally {
    clearTimeout(id)
  }
}

function coverUrl(id: number | null | undefined, size: 'M' | 'L' = 'L'): string | null {
  if (!id) return null
  return `${COVERS}/${id}-${size}.jpg`
}

/**
 * Maps a work from Open Library's /trending endpoint.
 * Fields available: key, title, author_name, cover_i, first_publish_year, edition_count.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function trendingWorkToItem(work: any): CatalogItem | null {
  if (!work?.title || !work.key) return null

  const coverId = work.cover_i ?? null
  const cover = coverUrl(coverId, 'L')
  if (!cover) return null // Must have a cover

  const authors: string[] = Array.isArray(work.author_name) ? work.author_name : []
  if (authors.length === 0) return null // Must have an author

  const id = typeof work.key === 'string'
    ? work.key.replace('/works/', '')
    : String(work.key)

  const year: number | null = work.first_publish_year ?? null

  // Popularity proxy: edition_count (more editions = more reprints = popular)
  const editions: number = typeof work.edition_count === 'number' ? work.edition_count : 0
  const editionScore = Math.min(Math.log10(editions + 1) / Math.log10(200), 1) * 100

  return {
    externalSource: 'openlibrary',
    externalId: id,
    title: work.title,
    type: 'book',
    genre: null, // Trending endpoint doesn't return subjects
    coverUrl: cover,
    releaseYear: year,
    authors,
    popularityScore: Math.round(editionScore),
  }
}

export interface PagedResult {
  items: CatalogItem[]
  hasMore: boolean
}

/**
 * Trending books from Open Library's real-time trending endpoint.
 * Sorted by weekly page views — these are genuinely popular books.
 * Cached for 15 minutes so subsequent requests are instant.
 */
async function fetchTrendingBooks(limit: number, page: number): Promise<PagedResult> {
  const fetchLimit = Math.min(limit + 12, 48)
  try {
    const res = await fetchSafe(
      `${OL}/trending/weekly.json?limit=${fetchLimit}&page=${page}`,
      3500
    )
    if (!res.ok) return { items: [], hasMore: false }
    const data = await res.json()
    const works: unknown[] = data.works ?? []

    const items = works
      .map(trendingWorkToItem)
      .filter((it): it is CatalogItem => it !== null)
      .slice(0, limit)

    const hasMore = works.length >= fetchLimit
    return { items, hasMore }
  } catch {
    return { items: [], hasMore: false }
  }
}

const getCachedTrendingBooks = unstable_cache(
  fetchTrendingBooks,
  ['ol-trending-books'],
  { revalidate: 900 } // 15 minutes
)

export async function getTrendingBooks(limit = 24, page = 1): Promise<PagedResult> {
  return getCachedTrendingBooks(limit, page)
}

async function fetchAuthorName(authorKey: string): Promise<string | null> {
  try {
    const cleanKey = authorKey.startsWith('/') ? authorKey : `/${authorKey}`
    const res = await fetchSafe(`${OL}${cleanKey}.json`, 4000)
    if (!res.ok) return null
    const data = await res.json()
    return typeof data?.name === 'string' ? data.name : null
  } catch {
    return null
  }
}

export async function getBookByExternalId(externalId: string): Promise<CatalogItem | null> {
  try {
    const res = await fetchSafe(`${OL}/works/${externalId}.json`, 12000)
    if (!res.ok) return null

    const work = await res.json()
    if (!work?.title) return null

    const coverId =
      Array.isArray(work.covers) && work.covers.length > 0 ? work.covers[0] : null

    let releaseYear: number | null = null
    if (work.first_publish_date) {
      const match = String(work.first_publish_date).match(/\d{4}/)
      if (match) releaseYear = Number.parseInt(match[0], 10)
    }

    const rawSubjects: unknown[] = Array.isArray(work.subjects) ? work.subjects : []
    const subjects: string[] = rawSubjects
      .map((s) => (typeof s === 'string' ? s : typeof (s as { value?: string })?.value === 'string' ? (s as { value: string }).value : null))
      .filter((s): s is string => typeof s === 'string')
    const genre = subjects[0] ?? null

    let description: string | null = null
    if (work.description) {
      description = typeof work.description === 'string'
        ? work.description
        : typeof work.description?.value === 'string'
        ? work.description.value
        : null
    }

    // Fetch up to 3 author names in parallel (work.authors is an array of { author: { key } })
    let authors: string[] | undefined
    if (Array.isArray(work.authors) && work.authors.length > 0) {
      const authorKeys: string[] = work.authors
        .slice(0, 3)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((a: any) => a?.author?.key)
        .filter((k: unknown): k is string => typeof k === 'string')
      const names = await Promise.all(authorKeys.map(fetchAuthorName))
      const filtered = names.filter((n): n is string => typeof n === 'string' && n.length > 0)
      if (filtered.length > 0) authors = filtered
    }

    return {
      externalSource: 'openlibrary',
      externalId,
      title: String(work.title),
      type: 'book',
      genre,
      genres: subjects.length > 0 ? subjects : undefined,
      coverUrl: coverUrl(coverId),
      releaseYear,
      authors,
      description,
    }
  } catch {
    return null
  }
}
