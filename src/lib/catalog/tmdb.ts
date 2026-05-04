import type { CatalogItem } from './types'

const BASE = 'https://api.themoviedb.org/3'
const IMG_BASE = 'https://image.tmdb.org/t/p/w500'

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
  10752: 'Historique',
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
  const genre = genreList[0] ?? null
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

async function fetchTmdbPage(url: URL, page: number): Promise<TmdbPage | null> {
  url.searchParams.set('page', String(page))
  const res = await fetchSafe(url.toString())
  if (!res.ok) return null
  const data = await res.json()
  return {
    results: data.results ?? [],
    page: data.page ?? page,
    totalPages: data.total_pages ?? 1,
  }
}

/**
 * Fetch enough TMDB results to satisfy `limit`. TMDB pages are 20 items, so when
 * limit > 20 we transparently merge two consecutive pages and trim. Stable order:
 * we keep TMDB's natural order from the requested page first, then pad.
 */
async function fetchTmdbCombined(url: URL, limit: number, page: number): Promise<TmdbPage | null> {
  const first = await fetchTmdbPage(url, page)
  if (!first) return null
  if (first.results.length >= limit || first.totalPages <= page) {
    return first
  }
  const second = await fetchTmdbPage(url, page + 1)
  if (!second) return first
  return {
    results: [...first.results, ...second.results],
    page: first.page,
    // hasMore: there are still pages beyond the second fetched page
    totalPages: second.totalPages,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stableTmdbSort(a: any, b: any): number {
  const diff = moviePopularity(b) - moviePopularity(a)
  if (diff !== 0) return diff
  const idA = typeof a.id === 'number' ? a.id : 0
  const idB = typeof b.id === 'number' ? b.id : 0
  return idA - idB
}

export async function getTrendingMovies(limit = 24, page = 1): Promise<PagedResult> {
  const key = getKey()
  if (!key) return { items: [], hasMore: false }

  try {
    const url = new URL(`${BASE}/trending/movie/week`)
    url.searchParams.set('api_key', key)
    url.searchParams.set('language', 'fr-FR')

    const combined = await fetchTmdbCombined(url, limit, page)
    if (!combined) return { items: [], hasMore: false }

    const items = combined.results.slice(0, limit).map(movieToItem)
    const fetchedPages = combined.results.length > 20 ? page + 1 : page
    const hasMore = fetchedPages < combined.totalPages
    return { items, hasMore }
  } catch {
    return { items: [], hasMore: false }
  }
}

export async function discoverMoviesByGenre(genreLabel: string, limit = 24, page = 1): Promise<PagedResult> {
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

    const combined = await fetchTmdbCombined(url, limit, page)
    if (!combined) return { items: [], hasMore: false }

    const items = combined.results
      .filter(isQualityMovie)
      .slice(0, limit)
      .map(movieToItem)
    const fetchedPages = combined.results.length > 20 ? page + 1 : page
    const hasMore = fetchedPages < combined.totalPages
    return { items, hasMore }
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const all: any[] = combined.results
    const quality = all.filter(isQualityMovie)
    const pool = quality.length >= Math.ceil(limit / 2)
      ? quality
      : all.filter((m) => Boolean(m.poster_path))
    pool.sort(stableTmdbSort)
    const fetchedPages = combined.results.length > 20 ? page + 1 : page
    const hasMore = fetchedPages < combined.totalPages
    return { items: pool.slice(0, limit).map(movieToItem), hasMore }
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

function normalizeQuery(q: string): string {
  return q.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}
