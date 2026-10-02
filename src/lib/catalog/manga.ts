/**
 * Unified manga provider.
 *
 * Strategy:
 *   1. Try Jikan (MyAnimeList) — richest metadata, but rate-limited (3 req/s).
 *   2. If Jikan returns nothing (rate-limited / down / empty), fall back to AniList
 *      (GraphQL, ~90 req/min, no key required).
 *
 * This mirrors the books.ts pattern (Google Books → Open Library) so all four
 * catalog categories behave consistently.
 */
import type { CatalogItem } from './types'
import {
  getTrendingManga as jikanTrending,
  searchManga as jikanSearch,
  getMangaByExternalId as jikanById,
  getMangaRecommendations as jikanRecommendations,
  getMangaRelations as jikanRelations,
} from './jikan'
import {
  getTrendingMangaAniList,
  searchMangaAniList,
  getMangaByExternalIdAniList,
  getMangaRecommendationsAniList,
  getMangaRelationsAniList,
} from './anilist'

export interface PagedResult {
  items: CatalogItem[]
  hasMore: boolean
}

/** Remove duplicate titles (same series surfaced by both providers). */
function dedupe(items: CatalogItem[]): CatalogItem[] {
  const seen = new Set<string>()
  const out: CatalogItem[] = []
  for (const it of items) {
    const key = it.title.trim().toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(it)
  }
  return out
}

/**
 * Trending / browse manga. Tries Jikan first, then AniList.
 * `genre` is our French genre/demographic label.
 */
export async function getTrendingMangaUnified(
  limit = 24,
  page = 1,
  genre?: string,
): Promise<PagedResult> {
  const primary = await jikanTrending(limit, page, genre)
  if (primary.items.length > 0) return primary

  const fallback = await getTrendingMangaAniList(limit, page, genre)
  return { items: dedupe(fallback.items), hasMore: fallback.hasMore }
}

/** Full-text manga search. Tries Jikan first, then AniList. */
export async function searchMangaUnified(
  query: string,
  limit = 24,
  page = 1,
  genre?: string,
): Promise<PagedResult> {
  const primary = await jikanSearch(query, limit, page, genre)
  if (primary.items.length > 0) return primary

  const fallback = await searchMangaAniList(query, limit, page, genre)
  return { items: dedupe(fallback.items), hasMore: fallback.hasMore }
}

/**
 * Resolve a single manga by its encoded external source + id.
 * `source` is 'jikan' or 'anilist'.
 */
export async function getMangaBySource(
  source: string,
  externalId: string,
): Promise<CatalogItem | null> {
  if (source === 'anilist') return getMangaByExternalIdAniList(externalId)
  // Default to Jikan; if it fails, try AniList as a last resort.
  const jikan = await jikanById(externalId)
  if (jikan) return jikan
  return getMangaByExternalIdAniList(externalId)
}

/** Recommendations, with provider fallback. */
export async function getMangaRecommendationsUnified(
  source: string,
  externalId: string,
): Promise<CatalogItem[]> {
  if (source === 'anilist') return getMangaRecommendationsAniList(externalId)
  const primary = await jikanRecommendations(externalId)
  if (primary.length > 0) return primary
  return getMangaRecommendationsAniList(externalId)
}

/** Related titles (sequels/prequels/side stories), with provider fallback. */
export async function getMangaRelationsUnified(
  source: string,
  externalId: string,
): Promise<CatalogItem[]> {
  if (source === 'anilist') return getMangaRelationsAniList(externalId)
  const primary = await jikanRelations(externalId)
  if (primary.length > 0) return primary
  return getMangaRelationsAniList(externalId)
}
