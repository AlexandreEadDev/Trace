import { type NextRequest, NextResponse } from 'next/server'
import { getTrendingMangaUnified, searchMangaUnified } from '@/lib/catalog/manga'
import { catalogDebug, isCatalogDebug } from '@/lib/catalog/debugLog'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')
  const genre = req.nextUrl.searchParams.get('genre')
  const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') ?? '1'))
  try {
    const result = q
      ? await searchMangaUnified(q, 24, page, genre ?? undefined)
      : await getTrendingMangaUnified(24, page, genre ?? undefined)

    if (isCatalogDebug()) {
      catalogDebug('api/catalog/manga', {
        q: q ?? null,
        genre: genre ?? null,
        page,
        itemCount: result.items.length,
        hasMore: result.hasMore,
      })
    }

    return NextResponse.json(result)
  } catch (err) {
    catalogDebug('api/catalog/manga ERROR', {
      message: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ items: [], hasMore: false })
  }
}
