import type { CatalogItem } from './types'

const BASE = 'https://api.themoviedb.org/3'
const IMG_BASE = 'https://image.tmdb.org/t/p/w500'

function getKey(): string | null {
  return process.env.TMDB_API_KEY ?? null
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
      ? null
      : null

  return {
    externalSource: 'tmdb',
    externalId: String(movie.id),
    title: movie.title ?? movie.original_title ?? 'Unknown',
    type: 'movie',
    genre,
    coverUrl: movie.poster_path ? `${IMG_BASE}${movie.poster_path}` : null,
    releaseYear: Number.isNaN(year as number) ? null : year,
  }
}

export async function getTrendingMovies(limit = 12): Promise<CatalogItem[]> {
  const key = getKey()
  if (!key) return []

  try {
    const res = await fetch(
      `${BASE}/trending/movie/week?api_key=${key}&language=fr-FR`,
      { next: { revalidate: 3600 } }
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data.results ?? []).slice(0, limit).map(movieToItem)
  } catch {
    return []
  }
}

export async function searchMovies(query: string, limit = 24): Promise<CatalogItem[]> {
  const key = getKey()
  if (!key) return []

  try {
    const url = new URL(`${BASE}/search/movie`)
    url.searchParams.set('api_key', key)
    url.searchParams.set('query', query)
    url.searchParams.set('language', 'fr-FR')

    const res = await fetch(url.toString(), { next: { revalidate: 600 } })
    if (!res.ok) return []
    const data = await res.json()
    return (data.results ?? []).slice(0, limit).map(movieToItem)
  } catch {
    return []
  }
}

export async function getMovieByExternalId(externalId: string): Promise<CatalogItem | null> {
  const key = getKey()
  if (!key) return null

  try {
    const res = await fetch(
      `${BASE}/movie/${externalId}?api_key=${key}&language=fr-FR`,
      { next: { revalidate: 3600 } }
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
