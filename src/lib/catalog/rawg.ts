import type { CatalogItem } from './types'

const BASE = 'https://api.rawg.io/api'

function getKey(): string | null {
  return process.env.RAWG_API_KEY ?? null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function gameToItem(game: any): CatalogItem {
  const year = game.released
    ? Number.parseInt(String(game.released).slice(0, 4), 10)
    : null
  const genre =
    Array.isArray(game.genres) && game.genres.length > 0
      ? game.genres[0].name
      : null

  return {
    externalSource: 'rawg',
    externalId: String(game.id),
    title: game.name,
    type: 'game',
    genre,
    coverUrl: game.background_image ?? null,
    releaseYear: Number.isNaN(year as number) ? null : year,
  }
}

export async function getTrendingGames(limit = 12): Promise<CatalogItem[]> {
  const key = getKey()
  if (!key) return []

  try {
    const url = new URL(`${BASE}/games`)
    url.searchParams.set('key', key)
    url.searchParams.set('page_size', String(limit))
    url.searchParams.set('ordering', '-rating')
    url.searchParams.set('metacritic', '70,100')

    const res = await fetch(url.toString(), { next: { revalidate: 3600 } })
    if (!res.ok) return []
    const data = await res.json()
    return (data.results ?? []).map(gameToItem)
  } catch {
    return []
  }
}

export async function searchGames(query: string, limit = 24): Promise<CatalogItem[]> {
  const key = getKey()
  if (!key) return []

  try {
    const url = new URL(`${BASE}/games`)
    url.searchParams.set('key', key)
    url.searchParams.set('search', query)
    url.searchParams.set('page_size', String(limit))
    url.searchParams.set('search_precise', 'false')

    const res = await fetch(url.toString(), { next: { revalidate: 600 } })
    if (!res.ok) return []
    const data = await res.json()
    return (data.results ?? []).map(gameToItem)
  } catch {
    return []
  }
}

export async function getGameByExternalId(externalId: string): Promise<CatalogItem | null> {
  const key = getKey()
  if (!key) return null

  try {
    const res = await fetch(`${BASE}/games/${externalId}?key=${key}`, {
      next: { revalidate: 3600 },
    })
    if (!res.ok) return null
    const game = await res.json()
    return gameToItem(game)
  } catch {
    return null
  }
}

export function hasRawgKey(): boolean {
  return Boolean(process.env.RAWG_API_KEY)
}
