import { unstable_cache } from 'next/cache'
import type { CatalogItem } from './types'
import { fetchJson } from './http'

const OL = 'https://openlibrary.org'
const COVERS = 'https://covers.openlibrary.org/b/id'

/** Open Library search results are stable — cache them. */
const SEARCH_TTL_MS = 10 * 60 * 1000 // 10 min
const DETAIL_TTL_MS = 30 * 60 * 1000 // 30 min

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

/**
 * Maps a doc from Open Library's /search.json endpoint.
 * Fields: key, title, author_name, cover_i, first_publish_year, subject, edition_count.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function searchDocToItem(doc: any): CatalogItem | null {
  if (!doc?.title || !doc.key) return null

  const coverId = doc.cover_i ?? null
  const cover = coverUrl(coverId, 'L')
  if (!cover) return null // Must have a cover

  const authors: string[] = Array.isArray(doc.author_name) ? doc.author_name : []
  if (authors.length === 0) return null // Must have an author

  const id = typeof doc.key === 'string' ? doc.key.replace('/works/', '') : String(doc.key)
  const year: number | null = doc.first_publish_year ?? null

  const rawSubjects: string[] = Array.isArray(doc.subject) ? doc.subject.slice(0, 8) : []
  const genre = rawSubjects[0] ?? null

  const editions: number = typeof doc.edition_count === 'number' ? doc.edition_count : 0
  const editionScore = Math.min(Math.log10(editions + 1) / Math.log10(200), 1) * 100

  return {
    externalSource: 'openlibrary',
    externalId: id,
    title: doc.title,
    type: 'book',
    genre,
    genres: rawSubjects.length > 0 ? rawSubjects : undefined,
    coverUrl: cover,
    releaseYear: year,
    authors,
    popularityScore: Math.round(editionScore),
  }
}

/**
 * Full-text search against Open Library. Free, no API key, generous limits.
 * Used as the primary fallback when Google Books is rate-limited (429) or empty.
 */
export async function searchOpenLibraryBooks(
  query: string,
  limit = 24,
  page = 1,
  subject?: string,
): Promise<PagedResult> {
  const url = new URL(`${OL}/search.json`)
  const q = query.trim()
  // Open Library supports fielded queries; combine free text with subject.
  const parts: string[] = []
  if (q) parts.push(q)
  if (subject) parts.push(`subject:"${subject}"`)
  url.searchParams.set('q', parts.length > 0 ? parts.join(' ') : 'bestseller')
  url.searchParams.set('limit', String(Math.min(limit + 12, 100)))
  url.searchParams.set('page', String(page))
  // Only return entries that have a cover and an author (keeps the grid clean).
  url.searchParams.set('fields', 'key,title,author_name,cover_i,first_publish_year,subject,edition_count')
  url.searchParams.set('has_fulltext', 'false')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await fetchJson<any>(url.toString(), {
    timeoutMs: 8000,
    retries: 3,
    backoffMs: 500,
    cacheTtlMs: SEARCH_TTL_MS,
  })
  if (!data) return { items: [], hasMore: false }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const docs: any[] = data.docs ?? []
  const items = docs
    .map(searchDocToItem)
    .filter((it): it is CatalogItem => it !== null)
    .slice(0, limit)

  const total = typeof data.numFound === 'number' ? data.numFound : 0
  const hasMore = page * limit < total && docs.length > 0
  return { items, hasMore }
}

/**
 * Trending books by subject (used for the no-query browse view).
 * Falls back to the weekly trending endpoint when no subject is given.
 */
export async function getOpenLibraryBySubject(subject: string, limit = 24, page = 1): Promise<PagedResult> {
  return searchOpenLibraryBooks('', limit, page, subject)
}

async function fetchAuthorName(authorKey: string): Promise<string | null> {
  const cleanKey = authorKey.startsWith('/') ? authorKey : `/${authorKey}`
  const data = await fetchJson<{ name?: string }>(`${OL}${cleanKey}.json`, {
    timeoutMs: 4000,
    retries: 2,
    cacheTtlMs: DETAIL_TTL_MS,
  })
  return typeof data?.name === 'string' ? data.name : null
}

export async function getBookByExternalId(externalId: string): Promise<CatalogItem | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const work = await fetchJson<any>(`${OL}/works/${externalId}.json`, {
      timeoutMs: 12000,
      retries: 3,
      cacheTtlMs: DETAIL_TTL_MS,
    })
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
