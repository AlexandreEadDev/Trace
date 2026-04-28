import type { CatalogItem } from './types'

const BASE = 'https://www.freetogame.com/api'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function gameToItem(game: any): CatalogItem {
  const year = Number.parseInt(String(game.release_date ?? '').slice(0, 4), 10)
  return {
    externalSource: 'freetogame',
    externalId: String(game.id),
    title: game.title,
    type: 'game',
    genre: game.genre ?? null,
    coverUrl: game.thumbnail ?? null,
    releaseYear: Number.isNaN(year) ? null : year,
  }
}

let allGamesCache: CatalogItem[] | null = null
let cacheTime = 0

async function getAllGames(): Promise<CatalogItem[]> {
  const now = Date.now()
  if (allGamesCache && now - cacheTime < 3_600_000) return allGamesCache

  const res = await fetch(`${BASE}/games`, { next: { revalidate: 3600 } })
  if (!res.ok) return []

  const data = await res.json()
  allGamesCache = Array.isArray(data) ? data.map(gameToItem) : []
  cacheTime = now
  return allGamesCache
}

export async function getTrendingGames(limit = 12): Promise<CatalogItem[]> {
  const games = await getAllGames()
  return games.slice(0, limit)
}

export async function searchGames(query: string): Promise<CatalogItem[]> {
  const games = await getAllGames()
  const q = query.toLowerCase()
  return games
    .filter(
      (g) =>
        g.title.toLowerCase().includes(q) ||
        (g.genre ?? '').toLowerCase().includes(q)
    )
    .slice(0, 24)
}

export async function getGameByExternalId(
  externalId: string
): Promise<CatalogItem | null> {
  const res = await fetch(`${BASE}/game?id=${externalId}`, {
    next: { revalidate: 3600 },
  })
  if (!res.ok) return null
  const game = await res.json()
  return gameToItem(game)
}
