import type { CatalogItem } from './types'
import {
  enrichTvGenresWithKeywords,
  resolveTvDiscoverFilter,
  tvGenreIdToLabel,
} from './tmdb-tv-genres'

const BASE = 'https://api.themoviedb.org/3'
const IMG_BASE = 'https://image.tmdb.org/t/p/w500'
const STILL_BASE = 'https://image.tmdb.org/t/p/w300'

function getKey(): string | null {
  return process.env.TMDB_API_KEY ?? null
}

async function fetchSafe(url: string, ms = 12000): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { signal: controller.signal, cache: 'no-store' })
  } finally {
    clearTimeout(id)
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tvPopularity(show: any): number {
  const pop: number = typeof show.popularity === 'number' ? show.popularity : 0
  const avg: number = typeof show.vote_average === 'number' ? show.vote_average : 0
  const cnt: number = typeof show.vote_count === 'number' ? show.vote_count : 0
  const popScore = Math.min(Math.log10(pop + 1) / Math.log10(5000), 1) * 40
  const credibility = Math.min(cnt / 50, 1)
  const avgScore = (avg / 10) * 40 * credibility
  const cntScore = Math.min(Math.log10(cnt + 1) / 5, 1) * 20
  return Math.round(popScore + avgScore + cntScore)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isQualityTv(show: any): boolean {
  const pop: number = typeof show.popularity === 'number' ? show.popularity : 0
  const cnt: number = typeof show.vote_count === 'number' ? show.vote_count : 0
  return Boolean(show.poster_path) && (pop >= 2 || cnt >= 10)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tvToItem(show: any): CatalogItem {
  const year = show.first_air_date
    ? Number.parseInt(String(show.first_air_date).slice(0, 4), 10)
    : null
  const genreList: string[] = Array.isArray(show.genres)
    ? show.genres.map((g: { name: string }) => g.name).filter(Boolean)
    : Array.isArray(show.genre_ids)
      ? show.genre_ids.map((id: number) => tvGenreIdToLabel(id)).filter(Boolean) as string[]
      : []
  const genre = genreList.length > 0 ? genreList.join(', ') : null
  const runtimes: number[] = Array.isArray(show.episode_run_time) ? show.episode_run_time : []
  const avgRuntime = runtimes.length > 0
    ? Math.round(runtimes.reduce((a, b) => a + b, 0) / runtimes.length)
    : null
  const voteAvg: number = typeof show.vote_average === 'number' ? show.vote_average : 0
  const voteCnt: number = typeof show.vote_count === 'number' ? show.vote_count : 0

  return {
    externalSource: 'tmdb_tv',
    externalId: String(show.id),
    title: show.name ?? show.original_name ?? 'Unknown',
    type: 'tv',
    genre,
    genres: genreList.length > 0 ? genreList : undefined,
    coverUrl: show.poster_path ? `${IMG_BASE}${show.poster_path}` : null,
    releaseYear: Number.isNaN(year as number) ? null : year,
    durationMinutes: avgRuntime,
    tmdbScore: voteCnt > 0 ? voteAvg : null,
    tmdbVoteCount: voteCnt > 0 ? voteCnt : null,
    popularityScore: tvPopularity(show),
  }
}

export interface PagedResult {
  items: CatalogItem[]
  hasMore: boolean
}

interface YearRange { yearMin?: number; yearMax?: number }

function applyYearRange(url: URL, { yearMin, yearMax }: YearRange) {
  if (yearMin) url.searchParams.set('first_air_date.gte', `${yearMin}-01-01`)
  if (yearMax) url.searchParams.set('first_air_date.lte', `${yearMax}-12-31`)
}

export async function getTrendingTv(limit = 24, page = 1, years: YearRange = {}): Promise<PagedResult> {
  const key = getKey()
  if (!key) return { items: [], hasMore: false }
  try {
    const hasYearFilter = years.yearMin || years.yearMax
    const url = hasYearFilter
      ? new URL(`${BASE}/discover/tv`)
      : new URL(`${BASE}/trending/tv/week`)
    url.searchParams.set('api_key', key)
    url.searchParams.set('language', 'fr-FR')
    if (hasYearFilter) {
      url.searchParams.set('sort_by', 'popularity.desc')
      applyYearRange(url, years)
    }
    url.searchParams.set('page', String(page))
    const res = await fetchSafe(url.toString())
    if (!res.ok) return { items: [], hasMore: false }
    const data = await res.json()
    const items = (data.results ?? []).slice(0, limit).map(tvToItem)
    const hasMore = (data.page ?? page) < (data.total_pages ?? 1)
    return { items, hasMore }
  } catch {
    return { items: [], hasMore: false }
  }
}

export async function discoverTvByGenre(genreLabel: string, limit = 24, page = 1, years: YearRange = {}): Promise<PagedResult> {
  const key = getKey()
  if (!key) return { items: [], hasMore: false }
  const filter = resolveTvDiscoverFilter(genreLabel)
  if (!filter) return { items: [], hasMore: false }
  try {
    const url = new URL(`${BASE}/discover/tv`)
    url.searchParams.set('api_key', key)
    if (filter.withGenres) url.searchParams.set('with_genres', String(filter.withGenres))
    if (filter.withKeywords) url.searchParams.set('with_keywords', String(filter.withKeywords))
    url.searchParams.set('language', 'fr-FR')
    url.searchParams.set('sort_by', 'popularity.desc')
    url.searchParams.set('page', String(page))
    applyYearRange(url, years)
    const res = await fetchSafe(url.toString())
    if (!res.ok) return { items: [], hasMore: false }
    const data = await res.json()
    let items = (data.results ?? []).filter(isQualityTv).slice(0, limit).map(tvToItem)
    if (filter.withKeywords) {
      items = items.map((item) => {
        const genres = item.genres ?? []
        const hasHorror = genres.some((g) => g.toLowerCase().includes('horreur'))
        if (hasHorror) return item
        const enriched = [...genres, genreLabel]
        return { ...item, genres: enriched, genre: enriched.join(', ') }
      })
    }
    const hasMore = (data.page ?? page) < (data.total_pages ?? 1)
    return { items, hasMore }
  } catch {
    return { items: [], hasMore: false }
  }
}

export async function searchTv(query: string, limit = 24, page = 1): Promise<PagedResult> {
  const key = getKey()
  if (!key) return { items: [], hasMore: false }
  try {
    const url = new URL(`${BASE}/search/tv`)
    url.searchParams.set('api_key', key)
    url.searchParams.set('query', query.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
    url.searchParams.set('language', 'fr-FR')
    url.searchParams.set('page', String(page))
    const res = await fetchSafe(url.toString())
    if (!res.ok) return { items: [], hasMore: false }
    const data = await res.json()
    const pool = (data.results ?? []).filter((s: { poster_path?: string }) => Boolean(s.poster_path))
    const items = pool.slice(0, limit).map(tvToItem)
    const hasMore = (data.page ?? page) < (data.total_pages ?? 1)
    return { items, hasMore }
  } catch {
    return { items: [], hasMore: false }
  }
}

export async function getTvByExternalId(externalId: string): Promise<CatalogItem | null> {
  const key = getKey()
  if (!key) return null
  try {
    const [detailRes, videosRes, keywordsRes] = await Promise.all([
      fetchSafe(`${BASE}/tv/${externalId}?api_key=${key}&language=fr-FR`),
      fetchSafe(`${BASE}/tv/${externalId}/videos?api_key=${key}&language=fr-FR`),
      fetchSafe(`${BASE}/tv/${externalId}/keywords?api_key=${key}`),
    ])
    if (!detailRes.ok) return null
    const show = await detailRes.json()
    const base = tvToItem(show)
    if (!base) return null

    let trailerKey: string | null = null
    if (videosRes.ok) {
      const videos = await videosRes.json()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results: any[] = videos.results ?? []
      const trailer =
        results.find((v) => v.site === 'YouTube' && v.type === 'Trailer' && v.iso_639_1 === 'fr') ??
        results.find((v) => v.site === 'YouTube' && v.type === 'Trailer')
      trailerKey = trailer?.key ?? null
    }

    const statusRaw: string = show.status ?? ''
    const tvStatus: 'ongoing' | 'finished' | null =
      statusRaw.toLowerCase().includes('return') || statusRaw.toLowerCase().includes('air')
        ? 'ongoing'
        : statusRaw.toLowerCase().includes('end') || statusRaw.toLowerCase().includes('cancel')
          ? 'finished'
          : null

    const seasonCount: number | null = typeof show.number_of_seasons === 'number' ? show.number_of_seasons : null
    const episodeCount: number | null = typeof show.number_of_episodes === 'number' ? show.number_of_episodes : null
    const description: string | null = typeof show.overview === 'string' ? show.overview : null
    const publishedFrom: string | null = show.first_air_date ?? null
    const publishedTo: string | null = show.last_air_date ?? null

    let genres = base.genres ?? []
    if (keywordsRes.ok) {
      const kwData = await keywordsRes.json()
      const keywords: { id: number; name: string }[] = kwData.results ?? kwData.keywords ?? []
      genres = enrichTvGenresWithKeywords(genres, keywords)
    }
    const genre = genres.length > 0 ? genres.join(', ') : base.genre

    return {
      ...base,
      genre,
      genres: genres.length > 0 ? genres : undefined,
      trailerKey,
      description,
      tvStatus,
      seasonCount,
      episodeCount,
      publishedFrom,
      publishedTo,
    }
  } catch {
    return null
  }
}

export interface EpisodeInfo {
  season_number: number
  episode_number: number
  title: string | null
  air_date: string | null
  stillUrl: string | null
  tmdbRating: number | null
}

export interface SeasonInfo {
  season_number: number
  name: string | null
  episodes: EpisodeInfo[]
}

export async function getTvSeasonsAndEpisodes(externalId: string): Promise<SeasonInfo[]> {
  const key = getKey()
  if (!key) return []
  try {
    const res = await fetchSafe(`${BASE}/tv/${externalId}?api_key=${key}&language=fr-FR`)
    if (!res.ok) return []
    const show = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const seasonStubs: { season_number: number; name?: string; episode_count?: number }[] = show.seasons ?? []
    const toFetch = seasonStubs
      .filter((s) => typeof s.season_number === 'number' && (s.episode_count ?? 0) > 0)
      .sort((a, b) => a.season_number - b.season_number)

    const results = await Promise.allSettled(
      toFetch.map(async (stub) => {
        const sRes = await fetchSafe(
          `${BASE}/tv/${externalId}/season/${stub.season_number}?api_key=${key}&language=fr-FR`,
        )
        if (!sRes.ok) return null
        const season = await sRes.json()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const episodes: EpisodeInfo[] = (season.episodes ?? []).map((ep: any) => ({
          season_number: stub.season_number,
          episode_number: ep.episode_number ?? 0,
          title: ep.name ?? null,
          air_date: ep.air_date ?? null,
          stillUrl: ep.still_path ? `${STILL_BASE}${ep.still_path}` : null,
          tmdbRating: typeof ep.vote_average === 'number' && ep.vote_average > 0 ? ep.vote_average : null,
        })).filter((e: EpisodeInfo) => e.episode_number > 0)

        return {
          season_number: stub.season_number,
          name: season.name ?? stub.name ?? null,
          episodes,
        } satisfies SeasonInfo
      }),
    )

    return results
      .filter((r): r is PromiseFulfilledResult<SeasonInfo | null> => r.status === 'fulfilled')
      .map((r) => r.value)
      .filter((s): s is SeasonInfo => s !== null && s.episodes.length > 0)
  } catch {
    return []
  }
}

export async function getSimilarTv(externalId: string): Promise<CatalogItem[]> {
  const key = getKey()
  if (!key) return []
  try {
    const res = await fetchSafe(`${BASE}/tv/${externalId}/similar?api_key=${key}&language=fr-FR`)
    if (!res.ok) return []
    const data = await res.json()
    return (data.results ?? [])
      .filter((s: Record<string, unknown>) => Boolean(s.poster_path))
      .map(tvToItem)
      .slice(0, 12)
  } catch {
    return []
  }
}

export { getKey as hasTmdbTvKey }
