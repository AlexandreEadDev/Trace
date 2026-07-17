import type { CatalogItem } from './types'
import { buildProviderWatchUrl } from './watchProviderUrls'

const BASE = 'https://api.themoviedb.org/3'
const IMG_BASE = 'https://image.tmdb.org/t/p/w500'
const PROVIDER_LOGO_BASE = 'https://image.tmdb.org/t/p/w45'

/** Default region for watch-provider availability (ISO 3166-1 alpha-2). */
const WATCH_REGION = process.env.TMDB_WATCH_REGION ?? 'FR'

/** TMDB genre ID → French label (used for trending results that only return genre_ids) */
const TMDB_GENRE_MAP: Record<number, string> = {
  28: 'Action',
  12: 'Aventure',
  16: 'Animation',
  35: 'Comédie',
  80: 'Crime / Policier',
  99: 'Documentaire',
  18: 'Drame',
  10751: 'Famille',
  14: 'Fantaisie',
  36: 'Historique',
  27: 'Horreur',
  10402: 'Musical',
  9648: 'Mystère',
  10749: 'Romance',
  878: 'Science-Fiction',
  53: 'Thriller',
  10752: 'Guerre',
  37: 'Western',
}

/** TMDB genre label → ID (used for discover endpoint filtering) */
export const TMDB_GENRE_LABEL_TO_ID: Record<string, number> = {
  'Action': 28,
  'Aventure': 12,
  'Animation': 16,
  'Comédie': 35,
  'Crime / Policier': 80,
  'Documentaire': 99,
  'Drame': 18,
  'Famille': 10751,
  'Fantaisie': 14,
  'Guerre': 10752,
  'Historique': 36,
  'Horreur': 27,
  'Musical': 10402,
  'Mystère': 9648,
  'Romance': 10749,
  'Science-Fiction': 878,
  'Thriller': 53,
  'Western': 37,
}

function getKey(): string | null {
  return process.env.TMDB_API_KEY ?? null
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
 * Popularity score 0–100 blending three TMDB signals:
 *  - popularity  → TMDB real-time score (views, lists, searches)  (max 40 pts)
 *  - vote_average → audience rating 0–10                          (max 40 pts)
 *  - vote_count  → credibility / breadth of the rating            (max 20 pts)
 *
 * A blockbuster (pop 3000, 8.0★, 100k votes) scores ~90.
 * An obscure film (pop 2, 5.0★, 8 votes) scores ~13.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function moviePopularity(movie: any): number {
  const pop: number = typeof movie.popularity === 'number' ? movie.popularity : 0
  const avg: number = typeof movie.vote_average === 'number' ? movie.vote_average : 0
  const cnt: number = typeof movie.vote_count === 'number' ? movie.vote_count : 0

  // TMDB popularity: log10(5000) ≈ 3.7 → normalise to [0,1] × 40
  const popScore = Math.min(Math.log10(pop + 1) / Math.log10(5000), 1) * 40
  // vote_average 0–10 → [0,40], discounted if low vote count
  const credibility = Math.min(cnt / 50, 1) // full trust at 50+ votes
  const avgScore = (avg / 10) * 40 * credibility
  // vote_count: log10(100 000) = 5 → [0,20]
  const cntScore = Math.min(Math.log10(cnt + 1) / 5, 1) * 20
  return Math.round(popScore + avgScore + cntScore)
}

/** Minimum quality gate – filters movies with no meaningful signal */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isQualityMovie(movie: any): boolean {
  const pop: number = typeof movie.popularity === 'number' ? movie.popularity : 0
  const cnt: number = typeof movie.vote_count === 'number' ? movie.vote_count : 0
  const hasPoster = Boolean(movie.poster_path)
  return hasPoster && (pop >= 2 || cnt >= 10)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function movieToItem(movie: any): CatalogItem {
  const year = movie.release_date
    ? Number.parseInt(String(movie.release_date).slice(0, 4), 10)
    : null
  const genreList: string[] = Array.isArray(movie.genres)
    ? movie.genres.map((g: { name: string }) => g.name).filter(Boolean)
    : Array.isArray(movie.genre_ids)
    ? movie.genre_ids.map((id: number) => TMDB_GENRE_MAP[id]).filter(Boolean)
    : []
  const genre = genreList.length > 0 ? genreList.join(', ') : null
  const runtime = typeof movie.runtime === 'number' && movie.runtime > 0
    ? movie.runtime
    : null
  const voteAvg: number = typeof movie.vote_average === 'number' ? movie.vote_average : 0
  const voteCnt: number = typeof movie.vote_count === 'number' ? movie.vote_count : 0
  const tmdbScore = voteCnt > 0 ? voteAvg : null
  const tmdbVoteCount = voteCnt > 0 ? voteCnt : null

  return {
    externalSource: 'tmdb',
    externalId: String(movie.id),
    title: movie.title ?? movie.original_title ?? 'Unknown',
    type: 'movie',
    genre,
    genres: genreList.length > 0 ? genreList : undefined,
    // genreList is now populated from either movie.genres (detail) or movie.genre_ids (list/trending)
    coverUrl: movie.poster_path ? `${IMG_BASE}${movie.poster_path}` : null,
    releaseYear: Number.isNaN(year as number) ? null : year,
    durationMinutes: runtime,
    tmdbScore,
    tmdbVoteCount,
    popularityScore: moviePopularity(movie),
  }
}

export interface PagedResult {
  items: CatalogItem[]
  hasMore: boolean
}

interface TmdbPage {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  results: any[]
  page: number
  totalPages: number
}

async function fetchTmdbPage(url: URL, page: number): Promise<(TmdbPage & { totalResults: number }) | null> {
  url.searchParams.set('page', String(page))
  const res = await fetchSafe(url.toString())
  if (!res.ok) return null
  const data = await res.json()
  return {
    results: data.results ?? [],
    page: data.page ?? page,
    totalPages: data.total_pages ?? 1,
    totalResults: typeof data.total_results === 'number' ? data.total_results : 0,
  }
}

const TMDB_PAGE_SIZE = 20
/** TMDB rejects page > 500 on most list endpoints. */
const TMDB_MAX_PAGE = 500

/**
 * Fetch a non-overlapping window of TMDB results for UI pagination.
 * TMDB always returns 20 items per page; our catalog uses `limit` (e.g. 24).
 * Mapping UI page N → global offset (N-1)*limit avoids the old bug where UI
 * page N fetched TMDB pages N+(N+1), so page 2 repeated most of page 1.
 */
async function fetchTmdbCombined(
  url: URL,
  limit: number,
  page: number
): Promise<(TmdbPage & { hasMore: boolean }) | null> {
  const startOffset = (Math.max(1, page) - 1) * limit
  let tmdbPage = Math.floor(startOffset / TMDB_PAGE_SIZE) + 1
  const skip = startOffset % TMDB_PAGE_SIZE
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const collected: any[] = []
  let totalPages = 1
  let totalResults = 0

  // Keep requesting TMDB pages until we can fill skip+limit raw slots
  // (trending lists sometimes repeat ids across adjacent pages — we top up).
  while (collected.length < skip + limit) {
    // Only enforce totalPages after the first successful fetch (it starts at 1).
    if (collected.length > 0 && tmdbPage > Math.min(totalPages, TMDB_MAX_PAGE)) break
    if (tmdbPage > TMDB_MAX_PAGE) break
    const fetched = await fetchTmdbPage(url, tmdbPage)
    if (!fetched) {
      if (collected.length === 0) return null
      break
    }
    totalPages = Math.min(fetched.totalPages, TMDB_MAX_PAGE)
    totalResults = Math.max(totalResults, fetched.totalResults)

    const seen = new Set<number>(
      collected
        .map((m) => (typeof m?.id === 'number' ? m.id : -1))
        .filter((id) => id >= 0)
    )
    for (const movie of fetched.results) {
      const id = typeof movie?.id === 'number' ? movie.id : null
      if (id != null) {
        if (seen.has(id)) continue
        seen.add(id)
      }
      collected.push(movie)
    }

    if (tmdbPage >= totalPages) break
    tmdbPage++
  }

  const results = collected.slice(skip, skip + limit)
  const nextOffset = startOffset + results.length
  const knownTotal = totalResults > 0 ? totalResults : totalPages * TMDB_PAGE_SIZE
  const hasMore =
    results.length === limit &&
    nextOffset < knownTotal &&
    Math.floor(nextOffset / TMDB_PAGE_SIZE) + 1 <= totalPages

  return {
    results,
    page,
    totalPages,
    hasMore,
  }
}

interface YearRange { yearMin?: number; yearMax?: number }

function applyYearRange(url: URL, { yearMin, yearMax }: YearRange) {
  if (yearMin) url.searchParams.set('primary_release_date.gte', `${yearMin}-01-01`)
  if (yearMax) url.searchParams.set('primary_release_date.lte', `${yearMax}-12-31`)
}

export async function getTrendingMovies(limit = 24, page = 1, years: YearRange = {}): Promise<PagedResult> {
  const key = getKey()
  if (!key) return { items: [], hasMore: false }

  try {
    // When a year range is requested, use /discover instead of /trending (which ignores date filters)
    const hasYearFilter = years.yearMin || years.yearMax
    const url = hasYearFilter
      ? new URL(`${BASE}/discover/movie`)
      : new URL(`${BASE}/trending/movie/week`)
    url.searchParams.set('api_key', key)
    url.searchParams.set('language', 'fr-FR')
    if (hasYearFilter) {
      url.searchParams.set('sort_by', 'popularity.desc')
      applyYearRange(url, years)
    }

    const combined = await fetchTmdbCombined(url, limit, page)
    if (!combined) return { items: [], hasMore: false }

    const items = combined.results.slice(0, limit).map(movieToItem)
    return { items, hasMore: combined.hasMore }
  } catch {
    return { items: [], hasMore: false }
  }
}

export async function discoverMoviesByGenre(genreLabel: string, limit = 24, page = 1, years: YearRange = {}): Promise<PagedResult> {
  const key = getKey()
  if (!key) return { items: [], hasMore: false }
  const genreId = TMDB_GENRE_LABEL_TO_ID[genreLabel]
  if (!genreId) return { items: [], hasMore: false }

  try {
    const url = new URL(`${BASE}/discover/movie`)
    url.searchParams.set('api_key', key)
    url.searchParams.set('with_genres', String(genreId))
    url.searchParams.set('language', 'fr-FR')
    url.searchParams.set('sort_by', 'popularity.desc')
    applyYearRange(url, years)

    const combined = await fetchTmdbCombined(url, limit, page)
    if (!combined) return { items: [], hasMore: false }

    const items = combined.results
      .filter(isQualityMovie)
      .slice(0, limit)
      .map(movieToItem)
    // After quality filter we may have fewer than `limit`; still use window hasMore
    // so pagination advances correctly through the discover feed.
    return { items, hasMore: combined.hasMore }
  } catch {
    return { items: [], hasMore: false }
  }
}

export async function searchMovies(query: string, limit = 24, page = 1): Promise<PagedResult> {
  const key = getKey()
  if (!key) return { items: [], hasMore: false }

  try {
    const url = new URL(`${BASE}/search/movie`)
    url.searchParams.set('api_key', key)
    url.searchParams.set('query', normalizeQuery(query))
    url.searchParams.set('language', 'fr-FR')

    const combined = await fetchTmdbCombined(url, limit, page)
    if (!combined) return { items: [], hasMore: false }

    // Keep TMDB search relevance order — do NOT re-sort by popularity
    // (that was pulling unrelated high-pop titles above actual matches).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const all: any[] = combined.results
    const quality = all.filter(isQualityMovie)
    const pool = quality.length >= Math.ceil(limit / 2)
      ? quality
      : all.filter((m) => Boolean(m.poster_path))
    return { items: pool.slice(0, limit).map(movieToItem), hasMore: combined.hasMore }
  } catch {
    return { items: [], hasMore: false }
  }
}

export async function getMovieByExternalId(externalId: string): Promise<CatalogItem | null> {
  const key = getKey()
  if (!key) return null

  try {
    // Fetch movie details and videos in parallel
    const [detailRes, videosRes] = await Promise.all([
      fetchSafe(`${BASE}/movie/${externalId}?api_key=${key}&language=fr-FR`),
      fetchSafe(`${BASE}/movie/${externalId}/videos?api_key=${key}&language=fr-FR`),
    ])
    if (!detailRes.ok) return null
    const movie = await detailRes.json()

    let trailerKey: string | null = null
    if (videosRes.ok) {
      const videos = await videosRes.json()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results: any[] = videos.results ?? []
      // Prefer French trailer, fall back to English
      const trailer =
        results.find((v) => v.site === 'YouTube' && v.type === 'Trailer' && v.iso_639_1 === 'fr') ??
        results.find((v) => v.site === 'YouTube' && v.type === 'Trailer') ??
        results.find((v) => v.site === 'YouTube' && v.type === 'Teaser')
      trailerKey = trailer?.key ?? null
    }

    const item = movieToItem(movie)
    if (!item) return null

    // Extract collection data for series linking
    const collection = movie.belongs_to_collection
    const collectionId: string | null = collection?.id ? String(collection.id) : null
    const collectionName: string | null = collection?.name ?? null

    return { ...item, trailerKey, collectionId, collectionName }
  } catch {
    return null
  }
}

export async function getMovieCollection(collectionId: string): Promise<CatalogItem[]> {
  const key = getKey()
  if (!key) return []
  try {
    const res = await fetchSafe(`${BASE}/collection/${collectionId}?api_key=${key}&language=fr-FR`)
    if (!res.ok) return []
    const data = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parts: any[] = data.parts ?? []
    return parts
      .filter((m) => Boolean(m.poster_path))
      .sort((a, b) => (a.release_date ?? '').localeCompare(b.release_date ?? ''))
      .map(movieToItem)
  } catch {
    return []
  }
}

export async function getSimilarMovies(externalId: string): Promise<CatalogItem[]> {
  const key = getKey()
  if (!key) return []
  try {
    const res = await fetchSafe(`${BASE}/movie/${externalId}/similar?api_key=${key}&language=fr-FR`)
    if (!res.ok) return []
    const data = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.results ?? []).filter((m: any) => Boolean(m.poster_path)).map(movieToItem).slice(0, 12) as CatalogItem[]
  } catch {
    return []
  }
}

export function hasTmdbKey(): boolean {
  return Boolean(process.env.TMDB_API_KEY)
}

export type WatchOfferType = 'flatrate' | 'rent' | 'buy' | 'free' | 'ads'

export interface WatchProviderOffer {
  providerId: number
  name: string
  logoUrl: string | null
  type: WatchOfferType
  price: number | null
  currency: string | null
  watchUrl: string
}

export interface MovieWatchProviders {
  region: string
  link: string | null
  offers: WatchProviderOffer[]
}

interface TmdbWatchProviderRaw {
  provider_id?: number
  provider_name?: string
  logo_path?: string | null
  display_priority?: number
  price?: string | number
  currency?: string
}

interface TmdbWatchRegionRaw {
  link?: string
  flatrate?: TmdbWatchProviderRaw[]
  rent?: TmdbWatchProviderRaw[]
  buy?: TmdbWatchProviderRaw[]
  free?: TmdbWatchProviderRaw[]
  ads?: TmdbWatchProviderRaw[]
}

function parsePrice(raw: string | number | undefined): number | null {
  if (raw === undefined || raw === null || raw === '') return null
  const n = typeof raw === 'number' ? raw : Number.parseFloat(String(raw).replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

function mapWatchOffers(
  list: TmdbWatchProviderRaw[] | undefined,
  type: WatchOfferType,
  movieTitle: string,
  region: string,
): WatchProviderOffer[] {
  if (!Array.isArray(list)) return []
  return list
    .filter((p) => typeof p.provider_id === 'number' && Boolean(p.provider_name))
    .map((p) => ({
      providerId: p.provider_id!,
      name: p.provider_name!,
      logoUrl: p.logo_path ? `${PROVIDER_LOGO_BASE}${p.logo_path}` : null,
      type,
      price: type === 'rent' || type === 'buy' ? parsePrice(p.price) : null,
      currency: type === 'rent' || type === 'buy' ? (p.currency ?? null) : null,
      watchUrl: buildProviderWatchUrl(p.provider_id!, p.provider_name!, movieTitle, region, type),
    }))
}

function pickWatchRegion(
  results: Record<string, TmdbWatchRegionRaw> | undefined,
): { region: string; data: TmdbWatchRegionRaw } | null {
  if (!results || typeof results !== 'object') return null

  const preferred = results[WATCH_REGION]
  if (preferred) return { region: WATCH_REGION, data: preferred }

  const firstEntry = Object.entries(results).find(([, data]) => {
    const total =
      (data.flatrate?.length ?? 0) +
      (data.rent?.length ?? 0) +
      (data.buy?.length ?? 0) +
      (data.free?.length ?? 0) +
      (data.ads?.length ?? 0)
    return total > 0
  })
  if (!firstEntry) return null
  return { region: firstEntry[0], data: firstEntry[1] }
}

export async function getMovieWatchProviders(
  externalId: string,
  movieTitle: string,
): Promise<MovieWatchProviders | null> {
  const key = getKey()
  if (!key) return null

  try {
    const res = await fetchSafe(
      `${BASE}/movie/${externalId}/watch/providers?api_key=${key}`,
    )
    if (!res.ok) return null

    const json = (await res.json()) as { results?: Record<string, TmdbWatchRegionRaw> }
    const picked = pickWatchRegion(json.results)
    if (!picked) return null

    const { region, data } = picked
    const offers: WatchProviderOffer[] = [
      ...mapWatchOffers(data.flatrate, 'flatrate', movieTitle, region),
      ...mapWatchOffers(data.rent, 'rent', movieTitle, region),
      ...mapWatchOffers(data.buy, 'buy', movieTitle, region),
      ...mapWatchOffers(data.free, 'free', movieTitle, region),
      ...mapWatchOffers(data.ads, 'ads', movieTitle, region),
    ]

    if (offers.length === 0) return null

    return {
      region,
      link: typeof data.link === 'string' ? data.link : null,
      offers,
    }
  } catch {
    return null
  }
}

function normalizeQuery(q: string): string {
  return q.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}
