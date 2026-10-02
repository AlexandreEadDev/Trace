/**
 * Unified book provider.
 *
 * Strategy (fast → reliable):
 *  1. Google Books (rich metadata, needs a key to avoid 429).
 *  2. Open Library (free, no key, generous limits) as automatic fallback.
 *
 * The two sources are queried in parallel when Google Books has no key, so the
 * user never waits on a doomed 429 round-trip. When a key IS configured we try
 * Google Books first (better covers/descriptions) and only fall back if it
 * returns nothing.
 */
import type { CatalogItem } from './types'
import { searchBooks as searchGoogleBooks, hasGoogleBooksKey } from './googlebooks'
import { searchOpenLibraryBooks, getTrendingBooks } from './openlibrary'
import { catalogDebug, isCatalogDebug } from './debugLog'

export interface PagedResult {
  items: CatalogItem[]
  hasMore: boolean
}

/** Book genre label → Open Library subject term (mirrors the Google Books map). */
const OL_SUBJECT_MAP: Record<string, string> = {
  'Roman': 'fiction',
  'Fantasy': 'fantasy',
  'Science-Fiction': 'science_fiction',
  'Thriller / Policier': 'thriller',
  'Romance': 'romance',
  'Biographie': 'biography',
  'Histoire': 'history',
  'Horreur': 'horror',
  'Jeunesse': 'juvenile',
  'Humour': 'humor',
}

function dedupe(items: CatalogItem[]): CatalogItem[] {
  const seen = new Set<string>()
  const out: CatalogItem[] = []
  for (const it of items) {
    const key = `${it.title.toLowerCase().replace(/[^a-z0-9]/g, '')}|${(it.authors?.[0] ?? '').toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(it)
  }
  return out
}

/**
 * Search books across providers with automatic fallback.
 * Always returns a result object (never throws).
 */
export async function searchBooksUnified(
  query: string,
  limit = 24,
  page = 1,
  genre?: string,
): Promise<PagedResult> {
  const q = query.trim()
  const hasKey = hasGoogleBooksKey()

  // No query → browse. Prefer Google Books trending, fall back to OL trending.
  if (!q && !genre) {
    if (hasKey) {
      const gb = await searchGoogleBooks('', limit, page)
      if (gb.items.length > 0) return gb
    }
    const ol = await getTrendingBooks(limit, page)
    if (ol.items.length > 0) return ol
    // Last resort: OL subject browse for popular fiction.
    return searchOpenLibraryBooks('', limit, page, 'fiction')
  }

  // With a key: Google Books first (better metadata), OL as fallback.
  if (hasKey) {
    const gb = await searchGoogleBooks(q, limit, page, genre)
    if (gb.items.length > 0) {
      if (isCatalogDebug()) {
        catalogDebug('books.unified', { provider: 'googlebooks', q, count: gb.items.length })
      }
      return gb
    }
    if (isCatalogDebug()) {
      catalogDebug('books.unified', { provider: 'googlebooks→openlibrary', q, reason: 'empty' })
    }
  }

  // No key, or Google Books returned nothing → Open Library.
  const subject = genre ? OL_SUBJECT_MAP[genre] : undefined
  const ol = await searchOpenLibraryBooks(q, limit, page, subject)
  if (isCatalogDebug()) {
    catalogDebug('books.unified', { provider: 'openlibrary', q, subject: subject ?? null, count: ol.items.length })
  }
  return ol
}

/**
 * Resolve a single book by title/author across providers (used by detail pages
 * and recommendations). Google Books first, Open Library fallback.
 */
export async function findBookUnified(
  title: string,
  authors?: string[] | null,
  year?: number | null,
): Promise<CatalogItem | null> {
  if (hasGoogleBooksKey()) {
    const { findBookByTitleAuthor } = await import('./googlebooks')
    const gb = await findBookByTitleAuthor(title, authors, year)
    if (gb) return gb
  }
  const { searchOpenLibraryBooks } = await import('./openlibrary')
  const ol = await searchOpenLibraryBooks(title, 5, 1)
  if (ol.items.length === 0) return null
  // Prefer an exact-ish title match.
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const target = norm(title)
  return (
    ol.items.find((it) => norm(it.title) === target) ??
    ol.items.find((it) => norm(it.title).includes(target) || target.includes(norm(it.title))) ??
    ol.items[0]
  )
}

export { dedupe as dedupeBooks }
