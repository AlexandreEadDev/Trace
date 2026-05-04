import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encodeCatalogId, type CatalogSource } from '@/lib/catalog/types'
import type { CatalogItem } from '@/lib/catalog/types'
import type { DiscoverPopularItem } from '@/lib/discover/types'
import { searchBooks } from '@/lib/catalog/googlebooks'
import { getTrendingManga } from '@/lib/catalog/jikan'
import { getTrendingMovies } from '@/lib/catalog/tmdb'
import { getTrendingGames as getRawgTrendingGames } from '@/lib/catalog/rawg'
import { getTrendingGames as getFreetogameTrending } from '@/lib/catalog/freetogame'

type RpcPopularRow = {
  id: string
  title: string
  type: string
  genre: string | null
  cover_url: string | null
  release_year: number | null
  external_source: string | null
  external_id: string | null
  community_avg: number | null
  engagement_score: number | null
  sparkline: unknown
}

function parseSparkline(raw: unknown): number[] {
  if (!raw) return []
  if (Array.isArray(raw)) {
    return raw.filter((x): x is number => typeof x === 'number' && !Number.isNaN(x))
  }
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw) as unknown
      return Array.isArray(p)
        ? p.filter((x): x is number => typeof x === 'number' && !Number.isNaN(x))
        : []
    } catch {
      return []
    }
  }
  return []
}

function rpcRowToDiscover(row: RpcPopularRow): DiscoverPopularItem {
  const sources: CatalogSource[] = [
    'openlibrary',
    'googlebooks',
    'freetogame',
    'rawg',
    'tmdb',
    'jikan',
  ]
  const catalogId =
    row.external_source &&
    row.external_id &&
    sources.includes(row.external_source as CatalogSource)
      ? encodeCatalogId(row.external_source as CatalogSource, row.external_id)
      : null

  return {
    kind: 'local',
    itemId: row.id,
    catalogId,
    title: row.title,
    type: row.type as DiscoverPopularItem['type'],
    coverUrl: row.cover_url,
    communityAvg: row.community_avg,
    engagementScore: row.engagement_score,
    sparkline: parseSparkline(row.sparkline),
  }
}

function catalogToDiscover(item: CatalogItem): DiscoverPopularItem {
  return {
    kind: 'external',
    itemId: null,
    catalogId: encodeCatalogId(item.externalSource, item.externalId),
    title: item.title,
    type: item.type,
    coverUrl: item.coverUrl,
    communityAvg: null,
    engagementScore: item.popularityScore ?? null,
    sparkline: [],
  }
}

async function fetchExternalSeed(): Promise<CatalogItem[]> {
  const [books, manga, movies, rawgG, ftgG] = await Promise.all([
    searchBooks('bestseller', 8, 1).then((r) => r.items),
    getTrendingManga(8, 1).then((r) => r.items),
    getTrendingMovies(8, 1).then((r) => r.items),
    getRawgTrendingGames(8, 1).then((r) => r.items),
    getFreetogameTrending(8),
  ])

  const games = rawgG.length > 0 ? rawgG : ftgG
  const merged: CatalogItem[] = []
  const seen = new Set<string>()
  const push = (arr: CatalogItem[]) => {
    for (const it of arr) {
      const k = `${it.externalSource}:${it.externalId}`
      if (seen.has(k)) continue
      seen.add(k)
      merged.push(it)
    }
  }
  push(books)
  push(manga)
  push(movies)
  push(games)
  return merged
}

function mergeWithSeed(
  internal: DiscoverPopularItem[],
  seed: CatalogItem[],
  limit: number
): DiscoverPopularItem[] {
  const out = [...internal]
  const seen = new Set<string>()
  for (const r of internal) {
    if (r.itemId) seen.add(r.itemId)
    if (r.catalogId) seen.add(r.catalogId)
  }
  for (const c of seed) {
    if (out.length >= limit) break
    const id = encodeCatalogId(c.externalSource, c.externalId)
    if (seen.has(id)) continue
    seen.add(id)
    out.push(catalogToDiscover(c))
  }
  return out.slice(0, limit)
}

export async function GET(req: NextRequest) {
  const limitParam = req.nextUrl.searchParams.get('limit')
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(limitParam ?? '24', 10) || 24)
  )

  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('popular_titles_global', {
      limit_n: limit,
    })

    if (error) {
      console.error('[discover/popular] rpc', error.message)
    }

    const rows = (Array.isArray(data) ? data : []) as RpcPopularRow[]
    let items: DiscoverPopularItem[] = rows.map(rpcRowToDiscover)

    if (items.length < limit) {
      const seed = await fetchExternalSeed()
      items = mergeWithSeed(items, seed, limit)
    }

    return NextResponse.json({ items })
  } catch (e) {
    console.error('[discover/popular]', e)
    return NextResponse.json(
      { error: 'Failed to load popular titles', items: [] as DiscoverPopularItem[] },
      { status: 500 }
    )
  }
}
