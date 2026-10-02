/**
 * Jikan v4 — unofficial MyAnimeList API. Free, no API key required.
 * Rate limit: 3 req/s, 60 req/min. We stay well within this via caching,
 * retries with backoff and bounded concurrency.
 */
import type { CatalogItem } from './types'
import { fetchJson, mapWithConcurrency, normalizeQuery } from './http'

const BASE = 'https://api.jikan.moe/v4'

/** Jikan list/search results are stable — cache them. */
const LIST_TTL_MS = 10 * 60 * 1000 // 10 min
const DETAIL_TTL_MS = 30 * 60 * 1000 // 30 min

/**
 * Fetch a Jikan JSON payload with retries/backoff and optional caching.
 * Returns null on failure so callers can fall back to AniList.
 */
async function fetchJikan<T = unknown>(url: string, cacheTtlMs = LIST_TTL_MS): Promise<T | null> {
  return fetchJson<T>(url, {
    timeoutMs: 8000,
    retries: 3,
    backoffMs: 700, // Jikan 429s need a little breathing room
    cacheTtlMs,
  })
}

/** Shape of Jikan list endpoints (`/manga`, `/top/manga`, `/volumes`, ...). */
interface JikanListResponse {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any[]
  pagination?: { has_next_page?: boolean }
}

/** Shape of Jikan single-entity endpoints (`/manga/{id}`, `/manga/{id}/full`). */
interface JikanSingleResponse {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toFinitePositiveInt(v: any): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mangaPopularity(m: any): number {
  const members: number = typeof m.members === 'number' ? m.members : 0
  const score: number = typeof m.score === 'number' ? m.score : 0
  const scoredBy: number = typeof m.scored_by === 'number' ? m.scored_by : 0

  // members: log10(1 000 000) = 6 → [0, 50]
  const memberScore = Math.min(Math.log10(members + 1) / 6, 1) * 50
  // score 0–10 → [0, 40], discounted if few voters
  const credibility = Math.min(scoredBy / 500, 1)
  const scoreScore = (score / 10) * 40 * credibility
  // rank bonus: top-100 titles get up to 10 pts
  const rank: number = typeof m.rank === 'number' ? m.rank : 9999
  const rankScore = rank <= 100 ? Math.max(0, (100 - rank) / 100) * 10 : 0

  return Math.round(memberScore + scoreScore + rankScore)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mangaToItem(m: any): CatalogItem | null {
  if (!m?.title && !m?.title_english) return null

  // Filter explicit content
  const rating: string = m.rating ?? ''
  if (rating.includes('Rx') || rating.toLowerCase().includes('hentai')) return null
  const genreNames: string[] = [
    ...((m.genres ?? []) as { name: string }[]).map((g) => g.name),
    ...((m.explicit_genres ?? []) as { name: string }[]).map((g) => g.name),
  ]
  if (genreNames.some((g) => ['Hentai', 'Erotica'].includes(g))) return null

  const title = m.title_english || m.title
  const cover =
    m.images?.jpg?.large_image_url ??
    m.images?.jpg?.image_url ??
    m.images?.webp?.large_image_url ??
    m.images?.webp?.image_url ??
    null

  const year: number | null =
    m.published?.prop?.from?.year ?? m.year ?? null

  // Collect all genre/demographic/theme tags
  const allGenres: string[] = [
    ...((m.demographics ?? []) as { name: string }[]).map((d) => d.name),
    ...((m.genres ?? []) as { name: string }[]).map((g) => g.name),
    ...((m.themes ?? []) as { name: string }[]).map((t) => t.name),
  ].filter(Boolean)

  const genre: string | null = allGenres.length > 0 ? allGenres.join(', ') : null

  const authors: string[] = Array.isArray(m.authors)
    ? m.authors.map((a: { name: string }) => a.name).filter(Boolean)
    : []

  const description: string | null =
    typeof m.synopsis === 'string' ? m.synopsis : null

  return {
    externalSource: 'jikan',
    externalId: String(m.mal_id),
    title,
    type: 'manga',
    genre,
    genres: allGenres.length > 0 ? allGenres : undefined,
    coverUrl: cover,
    releaseYear: year,
    authors: authors.length > 0 ? authors : undefined,
    popularityScore: mangaPopularity(m),
    description,
  }
}

/** Manga genre/demographic label → Jikan genre ID */
const JIKAN_GENRE_MAP: Record<string, number> = {
  'Shōnen': 27,
  'Seinen': 42,
  'Shōjo': 25,
  'Josei': 43,
  'Action': 1,
  'Aventure': 2,
  'Comédie': 4,
  'Drame': 8,
  'Isekai': 62,
  'Sports': 30,
  'Slice of Life': 36,
  'Surnaturel': 37,
  'Mystère': 7,
}

export interface PagedResult {
  items: CatalogItem[]
  hasMore: boolean
}

export async function getTrendingManga(limit = 24, page = 1, genre?: string): Promise<PagedResult> {
  try {
    // When genre filter is set, use /manga endpoint with genre ID (supports demographics too)
    if (genre) {
      const genreId = JIKAN_GENRE_MAP[genre]
      if (genreId) {
        const url = new URL(`${BASE}/manga`)
        url.searchParams.set('genres', String(genreId))
        url.searchParams.set('order_by', 'members')
        url.searchParams.set('sort', 'desc')
        url.searchParams.set('limit', String(limit))
        url.searchParams.set('page', String(page))
        url.searchParams.set('type', 'manga')
        url.searchParams.set('sfw', 'true')

        const data = await fetchJikan<JikanListResponse>(url.toString())
        if (!data) return { items: [], hasMore: false }
        const items = (data.data ?? [])
          .map(mangaToItem)
          .filter((it: CatalogItem | null): it is CatalogItem => it !== null)
          .slice(0, limit)
        const hasMore = data.pagination?.has_next_page ?? false
        return { items, hasMore }
      }
    }

    const url = new URL(`${BASE}/top/manga`)
    url.searchParams.set('limit', String(limit))
    url.searchParams.set('page', String(page))
    url.searchParams.set('type', 'manga')
    url.searchParams.set('sfw', 'true')

    const data = await fetchJikan<JikanListResponse>(url.toString())
    if (!data) return { items: [], hasMore: false }

    const items = (data.data ?? [])
      .map(mangaToItem)
      .filter((it: CatalogItem | null): it is CatalogItem => it !== null)
      .slice(0, limit)

    const hasMore = data.pagination?.has_next_page ?? false
    return { items, hasMore }
  } catch {
    return { items: [], hasMore: false }
  }
}

export async function searchManga(query: string, limit = 24, page = 1, genre?: string): Promise<PagedResult> {
  try {
    const url = new URL(`${BASE}/manga`)
    url.searchParams.set('q', normalizeQuery(query))
    url.searchParams.set('limit', String(limit))
    url.searchParams.set('page', String(page))
    url.searchParams.set('order_by', 'members')
    url.searchParams.set('sort', 'desc')
    url.searchParams.set('type', 'manga')
    url.searchParams.set('sfw', 'true')
    if (genre) {
      const genreId = JIKAN_GENRE_MAP[genre]
      if (genreId) url.searchParams.set('genres', String(genreId))
    }

    const data = await fetchJikan<JikanListResponse>(url.toString())
    if (!data) return { items: [], hasMore: false }

    const items = (data.data ?? [])
      .map(mangaToItem)
      .filter((it: CatalogItem | null): it is CatalogItem => it !== null)
      .slice(0, limit)

    const hasMore = data.pagination?.has_next_page ?? false
    return { items, hasMore }
  } catch {
    return { items: [], hasMore: false }
  }
}

export async function getMangaByExternalId(externalId: string): Promise<CatalogItem | null> {
  try {
    // Prefer /full for richer metadata. Fallback to base endpoint if unavailable/rate-limited.
    let m: Record<string, unknown> | null = null
    const fullData = await fetchJikan<JikanSingleResponse>(`${BASE}/manga/${externalId}/full`, DETAIL_TTL_MS)
    if (fullData?.data) {
      m = fullData.data as Record<string, unknown>
    } else {
      const data = await fetchJikan<JikanSingleResponse>(`${BASE}/manga/${externalId}`, DETAIL_TTL_MS)
      if (!data?.data) return null
      m = data.data as Record<string, unknown>
    }

    const base = mangaToItem(m)
    if (!base) return null

    const details: Record<string, unknown> = m && typeof m === 'object' ? m : {}

    const statusRaw = typeof details.status === 'string' ? details.status : ''
    const mangaStatus: 'ongoing' | 'finished' | null =
      statusRaw.toLowerCase().includes('publish') ? 'ongoing'
      : statusRaw.toLowerCase().includes('finish') || statusRaw.toLowerCase().includes('complet') ? 'finished'
      : null

    const volumes: number | null = toFinitePositiveInt(details.volumes)
    const chapters: number | null = toFinitePositiveInt(details.chapters)
    const publishedObj =
      details.published && typeof details.published === 'object'
        ? (details.published as Record<string, unknown>)
        : null
    const publishedFrom: string | null = typeof publishedObj?.from === 'string' ? publishedObj.from : null
    const publishedTo: string | null = typeof publishedObj?.to === 'string' ? publishedObj.to : null

    return { ...base, mangaStatus, volumes, chapters, publishedFrom, publishedTo }
  } catch {
    return null
  }
}

export interface VolumeInfo {
  volume_number: number
  title: string | null
  coverUrl: string | null
}

function makeStubs(count: number): VolumeInfo[] {
  return Array.from({ length: count }, (_, i) => ({
    volume_number: i + 1,
    title: null,
    coverUrl: null,
  }))
}

export async function getMangaVolumes(
  externalId: string,
  totalVolumes?: number | null,
  totalChapters?: number | null,
  fallbackCoverUrl?: string | null,
): Promise<VolumeInfo[]> {
  // If caller does not provide totals, try to resolve them here from /full then /manga.
  let resolvedTotalVolumes = totalVolumes
  let resolvedTotalChapters = totalChapters
  if (resolvedTotalVolumes == null && resolvedTotalChapters == null) {
    try {
      const full = await fetchJikan<JikanSingleResponse>(`${BASE}/manga/${externalId}/full`, DETAIL_TTL_MS)
      if (full?.data) {
        const d = full.data as Record<string, unknown>
        resolvedTotalVolumes = toFinitePositiveInt(d.volumes)
        resolvedTotalChapters = toFinitePositiveInt(d.chapters)
      } else {
        const base = await fetchJikan<JikanSingleResponse>(`${BASE}/manga/${externalId}`, DETAIL_TTL_MS)
        if (base?.data) {
          const d = base.data as Record<string, unknown>
          resolvedTotalVolumes = toFinitePositiveInt(d.volumes)
          resolvedTotalChapters = toFinitePositiveInt(d.chapters)
        }
      }
    } catch {
      // keep unresolved totals
    }
  }

  try {
    const data = await fetchJikan<JikanListResponse>(`${BASE}/manga/${externalId}/volumes`, DETAIL_TTL_MS)
    if (data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const volumes: any[] = data.data ?? []
      if (volumes.length > 0) {
        return volumes
          .map((v) => ({
            volume_number: v.volume ?? v.mal_id ?? 0,
            title: v.title ?? null,
            coverUrl:
              v.images?.jpg?.image_url ??
              v.images?.webp?.image_url ??
              v.cover ??
              null,
          }))
          .filter((v) => Number.isFinite(v.volume_number) && v.volume_number > 0)
      }
    }
    // Fallback: generate stubs from volumes or estimate from chapters (avg 9 ch/volume)
    const estimated = resolvedTotalVolumes ?? (resolvedTotalChapters ? Math.ceil(resolvedTotalChapters / 9) : 0)
    if (estimated > 0) {
      return makeStubs(estimated).map((v) => ({ ...v, coverUrl: fallbackCoverUrl ?? null }))
    }
    return []
  } catch {
    const estimated = resolvedTotalVolumes ?? (resolvedTotalChapters ? Math.ceil(resolvedTotalChapters / 9) : 0)
    if (estimated > 0) {
      return makeStubs(estimated).map((v) => ({ ...v, coverUrl: fallbackCoverUrl ?? null }))
    }
    return []
  }
}

export async function getMangaRecommendations(externalId: string): Promise<CatalogItem[]> {
  try {
    const data = await fetchJikan<JikanListResponse>(`${BASE}/manga/${externalId}/recommendations`, DETAIL_TTL_MS)
    if (!data) return []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entries: any[] = (data.data ?? []).slice(0, 10)
    const items = await mapWithConcurrency(entries, 3, async (e) => {
      const d = await fetchJikan<JikanSingleResponse>(`${BASE}/manga/${e.entry.mal_id}`, DETAIL_TTL_MS)
      return d?.data ? mangaToItem(d.data) : null
    })
    return items.filter((it): it is CatalogItem => it !== null)
  } catch {
    return []
  }
}

export async function getMangaRelations(externalId: string): Promise<CatalogItem[]> {
  try {
    const data = await fetchJikan<JikanListResponse>(`${BASE}/manga/${externalId}/relations`, DETAIL_TTL_MS)
    if (!data) return []

    // Collect Sequel, Prequel, Side Story, Alternative Version MAL ids
    const RELEVANT = new Set(['Sequel', 'Prequel', 'Side Story', 'Alternative Version', 'Full Story', 'Summary', 'Parent Story'])
    const relatedIds: string[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const rel of data.data ?? [] as any[]) {
      if (!RELEVANT.has(rel.relation)) continue
      for (const entry of rel.entry ?? []) {
        if (entry.type === 'manga') relatedIds.push(String(entry.mal_id))
      }
    }

    if (relatedIds.length === 0) return []

    // Fetch up to 8 related items with bounded concurrency
    const items = await mapWithConcurrency(relatedIds.slice(0, 8), 3, async (id) => {
      const d = await fetchJikan<JikanSingleResponse>(`${BASE}/manga/${id}`, DETAIL_TTL_MS)
      return d?.data ? mangaToItem(d.data) : null
    })
    return items.filter((it): it is CatalogItem => it !== null)
  } catch {
    return []
  }
}
