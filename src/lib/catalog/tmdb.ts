import type { CatalogItem } from './types'

const BASE = 'https://api.themoviedb.org/3'
const IMG_BASE = 'https://image.tmdb.org/t/p/w500'

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
  const genre =
    Array.isArray(movie.genres) && movie.genres.length > 0
      ? movie.genres[0].name
      : Array.isArray(movie.genre_ids) && movie.genre_ids.length > 0
      ? null // genre_ids only in search results; skip until detail fetch
      : null
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

export async function getTrendingMovies(limit = 24, page = 1): Promise<PagedResult> {
  const key = getKey()
  if (!key) return { items: [], hasMore: false }

  try {
    const res = await fetchSafe(
      `${BASE}/trending/movie/week?api_key=${key}&language=fr-FR&page=${page}`
    )
    if (!res.ok) return { items: [], hasMore: false }
    const data = await res.json()
    const items = (data.results ?? []).slice(0, limit).map(movieToItem)
    const hasMore = (data.page ?? page) < (data.total_pages ?? 1)
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
    url.searchParams.set('query', query)
    url.searchParams.set('language', 'fr-FR')
    url.searchParams.set('page', String(page))

    const res = await fetchSafe(url.toString())
    if (!res.ok) return { items: [], hasMore: false }
    const data = await res.json()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const all: any[] = data.results ?? []
    const quality = all.filter(isQualityMovie)
    const pool = quality.length >= Math.ceil(limit / 2) ? quality : all.filter(m => Boolean(m.poster_path))
    pool.sort((a, b) => moviePopularity(b) - moviePopularity(a))
    const hasMore = (data.page ?? page) < (data.total_pages ?? 1)
    return { items: pool.slice(0, limit).map(movieToItem), hasMore }
  } catch {
    return { items: [], hasMore: false }
  }
}

export async function getMovieByExternalId(externalId: string): Promise<CatalogItem | null> {
  const key = getKey()
  if (!key) return null

  try {
    const res = await fetchSafe(
      `${BASE}/movie/${externalId}?api_key=${key}&language=fr-FR`
    )
    if (!res.ok) return null
    const movie = await res.json()
    return movieToItem(movie)
  } catch {
    return null
  }
}

export function hasTmdbKey(): boolean {
  return Boolean(process.env.TMDB_API_KEY)
}
