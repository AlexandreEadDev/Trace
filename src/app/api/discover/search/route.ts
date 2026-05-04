import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encodeCatalogId, type CatalogSource } from '@/lib/catalog/types'
import type { DiscoverSearchResult } from '@/lib/discover/types'
import { searchBooks } from '@/lib/catalog/googlebooks'
import { searchManga } from '@/lib/catalog/jikan'
import { searchMovies } from '@/lib/catalog/tmdb'
import { searchGames as searchGamesRawg } from '@/lib/catalog/rawg'
import { searchGames as searchGamesFreetogame } from '@/lib/catalog/freetogame'

type RpcSearchRow = {
  id: string
  title: string
  type: string
  genre: string | null
  cover_url: string | null
  release_year: number | null
  external_source: string | null
  external_id: string | null
  community_avg: number | null
}

function rpcRowToResult(row: RpcSearchRow): DiscoverSearchResult {
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
    type: row.type as DiscoverSearchResult['type'],
    coverUrl: row.cover_url,
    communityAvg: row.community_avg,
  }
}

function catalogToSearchResult(
  it: import('@/lib/catalog/types').CatalogItem
): DiscoverSearchResult {
  return {
    kind: 'external',
    itemId: null,
    catalogId: encodeCatalogId(it.externalSource, it.externalId),
    title: it.title,
    type: it.type,
    coverUrl: it.coverUrl,
    communityAvg: null,
  }
}

async function searchExternalParallel(q: string): Promise<DiscoverSearchResult[]> {
  const [books, manga, movies, rawg, ftg] = await Promise.all([
    searchBooks(q, 12, 1).then((r) => r.items),
    searchManga(q, 12, 1).then((r) => r.items),
    searchMovies(q, 12, 1).then((r) => r.items),
    searchGamesRawg(q, 12, 1).then((r) => r.items),
    searchGamesFreetogame(q),
  ])
  const games = rawg.length > 0 ? rawg : ftg
  const merged: DiscoverSearchResult[] = []
  const seen = new Set<string>()
  const push = (arr: import('@/lib/catalog/types').CatalogItem[]) => {
    for (const it of arr) {
      const k = `${it.externalSource}:${it.externalId}`
      if (seen.has(k)) continue
      seen.add(k)
      merged.push(catalogToSearchResult(it))
    }
  }
  push(books)
  push(manga)
  push(movies)
  push(games)
  return merged.slice(0, 40)
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length < 1) {
    return NextResponse.json({ local: [], external: [], query: q })
  }

  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('search_items_fts', {
      search_query: q,
      max_results: 24,
    })

    if (error) {
      console.error('[discover/search] rpc', error.message)
    }

    const local = (Array.isArray(data) ? data : []).map((row) =>
      rpcRowToResult(row as RpcSearchRow)
    )

    let external: DiscoverSearchResult[] = []
    if (local.length === 0) {
      external = await searchExternalParallel(q)
    }

    return NextResponse.json({
      query: q,
      local,
      external,
      source: local.length > 0 ? ('fts' as const) : ('external' as const),
    })
  } catch (e) {
    console.error('[discover/search]', e)
    return NextResponse.json(
      { query: q, local: [], external: [], source: 'error' as const, error: 'search failed' },
      { status: 500 }
    )
  }
}
