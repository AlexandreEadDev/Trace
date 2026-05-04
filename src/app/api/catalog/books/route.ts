import { type NextRequest, NextResponse } from 'next/server'
import { searchBooks } from '@/lib/catalog/googlebooks'
import { catalogDebug, isCatalogDebug } from '@/lib/catalog/debugLog'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')
  const genre = req.nextUrl.searchParams.get('genre')
  const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') ?? '1'))
  try {
    let result: Awaited<ReturnType<typeof searchBooks>>
    if (q) {
      result = await searchBooks(q, 24, page, genre ?? undefined)
    } else if (genre) {
      result = await searchBooks('', 24, page, genre)
    } else {
      result = await searchBooks('', 24, page)
    }

    if (isCatalogDebug()) {
      catalogDebug('api/catalog/books', {
        q: q ?? null,
        genre: genre ?? null,
        page,
        itemCount: result.items.length,
        hasMore: result.hasMore,
        types: result.items.map((it) => it.type),
        sources: result.items.map((it) => it.externalSource),
      })
    }

    return NextResponse.json(result)
  } catch (err) {
    catalogDebug('api/catalog/books ERROR', {
      message: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ items: [], hasMore: false })
  }
}
