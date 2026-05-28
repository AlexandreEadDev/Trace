import type { CatalogItem } from './types'

const BASE = 'https://api.rawg.io/api'

function getKey(): string | null {
  return process.env.RAWG_API_KEY ?? null
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
 * Popularity score 0–100 blending three RAWG signals:
 *  - added   → log-scale "how many users added this game" (max 40 pts)
 *  - metacritic → critic consensus              (max 40 pts)
 *  - rating  → RAWG community score 0–5        (max 20 pts)
 *
 * A AAA title (MC 95, 1M added, 4.5★) scores ~93.
 * An unknown indie (no MC, 50 added, 2★) scores ~9.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function gamePopularity(game: any): number {
  const added: number = typeof game.added === 'number' ? game.added : 0
  const mc: number = typeof game.metacritic === 'number' ? game.metacritic : 0
  const rating: number = typeof game.rating === 'number' ? game.rating : 0
  const ratingCount: number = typeof game.ratings_count === 'number' ? game.ratings_count : 0

  // added: log10(1 000 000) = 6 → normalise to [0,1] then × 40
  const addedScore = Math.min(Math.log10(added + 1) / 6, 1) * 40
  // Metacritic 0–100 → [0,40]
  const mcScore = (mc / 100) * 40
  // RAWG rating 0–5 → [0,20], but only if enough ratings exist
  const ratingScore = ratingCount >= 5 ? (rating / 5) * 20 : (rating / 5) * 8
  return Math.round(addedScore + mcScore + ratingScore)
}

// Phrases filtrées telles quelles (substring)
const EXPLICIT_SUBSTRINGS = [
  'hentai', 'eroge', 'nukige', 'ecchi', 'adult only', 'adults only',
  'sex sim', 'porn', 'xxx', 'erotic', 'nsfw',
]
// Mots filtrés uniquement en tant que mot entier (évite "Essex", "Vex"…)
const EXPLICIT_WHOLE_WORDS = ['sex', 'sexe']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isExplicit(game: any): boolean {
  const name = String(game.name ?? '').toLowerCase()
  if (EXPLICIT_SUBSTRINGS.some((k) => name.includes(k))) return true
  if (EXPLICIT_WHOLE_WORDS.some((w) => new RegExp(`\\b${w}\\b`).test(name))) return true
  // RAWG ESRB slug for "Adults Only"
  const esrb: string = game.esrb_rating?.slug ?? ''
  if (esrb === 'adults-only') return true
  return false
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function gameToItem(game: any): CatalogItem | null {
  if (isExplicit(game)) return null
  const year = game.released
    ? Number.parseInt(String(game.released).slice(0, 4), 10)
    : null
  const genreList: string[] = Array.isArray(game.genres)
    ? game.genres.map((g: { name: string }) => g.name).filter(Boolean)
    : []
  const genre = genreList.length > 0 ? genreList.join(', ') : null
  return {
    externalSource: 'rawg',
    externalId: String(game.id),
    title: game.name,
    type: 'game',
    genre,
    genres: genreList.length > 0 ? genreList : undefined,
    coverUrl: game.background_image ?? null,
    releaseYear: Number.isNaN(year as number) ? null : year,
    durationMinutes: null,
    metacritic: typeof game.metacritic === 'number' ? game.metacritic : null,
    popularityScore: gamePopularity(game),
  }
}

/** Minimum quality gate for search results – keeps games with any visible signal */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isQualityGame(game: any): boolean {
  const added: number = typeof game.added === 'number' ? game.added : 0
  const ratingCount: number = typeof game.ratings_count === 'number' ? game.ratings_count : 0
  const hasMeta = typeof game.metacritic === 'number' && game.metacritic > 0
  const hasImage = Boolean(game.background_image)
  // Very permissive: any image + at least 1 signal (added, rating, metacritic)
  return hasImage && (added > 10 || ratingCount >= 1 || hasMeta)
}

/** Genre label → RAWG slug */
const RAWG_GENRE_MAP: Record<string, string> = {
  'Action': 'action',
  'RPG': 'role-playing-games-rpg',
  'FPS / TPS': 'shooter',
  'Stratégie': 'strategy',
  'Aventure': 'adventure',
  'Sports': 'sports',
  'Puzzle': 'puzzle',
  'Simulation': 'simulation',
  'Plateforme': 'platformer',
  'Horreur': 'action',  // no direct horror slug in RAWG; fall back to tag
  'Indie': 'indie',
  'Arcade': 'arcade',
  'MMO': 'massively-multiplayer',
  'Combat': 'fighting',
}

export interface PagedResult {
  items: CatalogItem[]
  hasMore: boolean
}

function applyRawgYears(url: URL, yearMin?: number, yearMax?: number) {
  if (yearMin || yearMax) {
    const from = yearMin ? `${yearMin}-01-01` : '1970-01-01'
    const to = yearMax ? `${yearMax}-12-31` : '2099-12-31'
    url.searchParams.set('dates', `${from},${to}`)
  }
}

export async function getTrendingGames(limit = 24, page = 1, genre?: string, yearMin?: number, yearMax?: number): Promise<PagedResult> {
  const key = getKey()
  if (!key) return { items: [], hasMore: false }

  try {
    const url = new URL(`${BASE}/games`)
    url.searchParams.set('key', key)
    url.searchParams.set('page_size', String(limit))
    url.searchParams.set('page', String(page))
    url.searchParams.set('ordering', '-added')
    url.searchParams.set('fields', 'id,name,background_image,released,genres,metacritic,rating,ratings_count,added')
    if (genre) {
      const slug = RAWG_GENRE_MAP[genre]
      if (slug) url.searchParams.set('genres', slug)
    }
    applyRawgYears(url, yearMin, yearMax)

    const res = await fetchSafe(url.toString())
    if (!res.ok) return { items: [], hasMore: false }
    const data = await res.json()
    const items = (data.results ?? []).map(gameToItem).filter((g: CatalogItem | null): g is CatalogItem => g !== null)
    const hasMore = data.next !== null && data.next !== undefined
    return { items, hasMore }
  } catch {
    return { items: [], hasMore: false }
  }
}

export async function searchGames(query: string, limit = 24, page = 1, genre?: string, yearMin?: number, yearMax?: number): Promise<PagedResult> {
  const key = getKey()
  if (!key) return { items: [], hasMore: false }

  try {
    const url = new URL(`${BASE}/games`)
    url.searchParams.set('key', key)
    url.searchParams.set('search', normalizeQuery(query))
    url.searchParams.set('page_size', String(Math.min(limit * 2, 40)))
    url.searchParams.set('page', String(page))
    // No ordering param → RAWG returns by search relevance (better for exact title matches)
    if (genre) {
      const slug = RAWG_GENRE_MAP[genre]
      if (slug) url.searchParams.set('genres', slug)
    }
    applyRawgYears(url, yearMin, yearMax)

    const res = await fetchSafe(url.toString())
    if (!res.ok) return { items: [], hasMore: false }
    const data = await res.json()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const all: any[] = data.results ?? []
    const quality = all.filter(isQualityGame)
    const pool = quality.length >= Math.ceil(limit / 2) ? quality : all.filter((g) => Boolean(g.background_image))

    // Sort: exact/prefix title match first, then by RAWG's natural relevance order (index in results array)
    const qNorm = normalizeQuery(query).toLowerCase()
    pool.sort((a, b) => {
      const aNorm = normalizeQuery(String(a.name ?? '')).toLowerCase()
      const bNorm = normalizeQuery(String(b.name ?? '')).toLowerCase()
      const aExact = aNorm === qNorm ? 2 : aNorm.startsWith(qNorm) ? 1 : 0
      const bExact = bNorm === qNorm ? 2 : bNorm.startsWith(qNorm) ? 1 : 0
      if (aExact !== bExact) return bExact - aExact
      // Keep RAWG's relevance order (original index in results)
      return all.indexOf(a) - all.indexOf(b)
    })
    const hasMore = data.next !== null && data.next !== undefined
    return { items: pool.slice(0, limit).map(gameToItem).filter((g: CatalogItem | null): g is CatalogItem => g !== null), hasMore }
  } catch {
    return { items: [], hasMore: false }
  }
}

export async function getGameByExternalId(externalId: string): Promise<CatalogItem | null> {
  const key = getKey()
  if (!key) return null

  try {
    // Fetch game detail, screenshots, and trailer movies in parallel
    const [detailRes, screenshotsRes, moviesRes] = await Promise.all([
      fetchSafe(`${BASE}/games/${externalId}?key=${key}`),
      fetchSafe(`${BASE}/games/${externalId}/screenshots?key=${key}&page_size=8`),
      fetchSafe(`${BASE}/games/${externalId}/movies?key=${key}`),
    ])
    if (!detailRes.ok) return null
    const game = await detailRes.json()

    const item = gameToItem(game)
    if (!item) return null

    // Short gameplay clip from the detail response (direct video URL)
    const clipUrl: string | null = game.clip?.clip ?? null

    // YouTube trailer key from RAWG movies endpoint (preferred over clip)
    let trailerKey: string | null = null
    if (moviesRes.ok) {
      const moviesData = await moviesRes.json()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const firstMovie: any = (moviesData.results ?? [])[0]
      if (firstMovie?.youtube_id) {
        trailerKey = String(firstMovie.youtube_id)
      }
    }

    // Screenshots from dedicated endpoint, or fall back to short_screenshots in detail
    let screenshots: string[] = []
    if (screenshotsRes.ok) {
      const ssData = await screenshotsRes.json()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      screenshots = (ssData.results ?? []).map((s: any) => s.image).filter(Boolean)
    }
    if (screenshots.length === 0 && Array.isArray(game.short_screenshots)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      screenshots = game.short_screenshots.map((s: any) => s.image).filter(Boolean)
    }

    return { ...item, clipUrl, trailerKey, screenshots }
  } catch {
    return null
  }
}

export function hasRawgKey(): boolean {
  return Boolean(process.env.RAWG_API_KEY)
}

function normalizeQuery(q: string): string {
  return q.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export async function getGameSeries(externalId: string): Promise<CatalogItem[]> {
  const key = getKey()
  if (!key) return []
  try {
    const res = await fetchSafe(`${BASE}/games/${externalId}/game-series?key=${key}&page_size=20`)
    if (!res.ok) return []
    const data = await res.json()
    return (data.results ?? []).map(gameToItem).filter((g: CatalogItem | null): g is CatalogItem => g !== null)
  } catch {
    return []
  }
}

export async function getSuggestedGames(externalId: string): Promise<CatalogItem[]> {
  const key = getKey()
  if (!key) return []
  try {
    const res = await fetchSafe(`${BASE}/games/${externalId}/suggested?key=${key}&page_size=12`)
    if (!res.ok) return []
    const data = await res.json()
    return (data.results ?? []).map(gameToItem).filter((g: CatalogItem | null): g is CatalogItem => g !== null)
  } catch {
    return []
  }
}
